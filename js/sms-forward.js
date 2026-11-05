// 腾讯手机管家与 360 手机卫士的短信请求转发。
const key = 'sms_forward'
const $ = new Env(key)
// 本地预览可以显示短信，但不将通知内容再次写入日志。
$.isMuteLog = true
const prefix = name => `@Kry5ta1.${name}.`
const get = (name, field) => $.getdata(prefix(name) + field)
const enabled = value => String(value) === 'true'
const config = {
  tencent: { sender: 'query.sender', text: 'query.message.text' },
  360: { sender: 'query.sender', text: 'query.message.text' },
}
// 留出宿主回写请求的时间，多个配置共享预算且并行处理。
const deadline = Date.now() + 16000
let result = {}

!(async () => {
  if (enabled(get(key, 'disabled'))) return
  $.setdata(new Date().toLocaleString('zh'), prefix(key) + 'inited')
  const noPost = enabled(get(key, 'no_post'))
  // 即使解析或转发失败，已启用的去内容模式也不能回退到原始正文。
  if (noPost) result = { body: JSON.stringify({ redacted: true }) }
  const type = get(key, 'type') || 'tencent'
  const mapping = config[type]
  if (!mapping) throw new Error('不支持的短信服务类型，请检查 BoxJS 配置')
  if (typeof $request === 'undefined' || !$request.body) {
    throw new Error('未收到短信请求体，请通过短信请求重写触发脚本')
  }
  let input
  try { input = JSON.parse($request.body) } catch (_) {
    throw new Error('请求体不是有效 JSON，未执行转发')
  }
  const rawText = $.lodash_get(input, mapping.text)
  const rawSender = $.lodash_get(input, mapping.sender)
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('请求中没有有效短信内容，未执行转发')
  }
  const text = rawText
  const sender = rawSender == null ? '' : String(rawSender)

  // 先准备隐私回写结果，后续任一推送失败均不影响此结果。
  if (noPost) {
    result = { body: JSON.stringify({ provider: type, redacted: true }) }
  } else {
    if (String(get(key, 'replace_num')) !== 'false') {
      $.lodash_set(input, mapping.text, text.replace(/\d/g, () => Math.floor(Math.random() * 10)))
    }
    result = { body: JSON.stringify(input) }
  }
  const extraKeys = String(get(key, 'keys') || '').split(',').map(value => value.trim()).filter(Boolean)
  const keys = [...new Set([key, ...extraKeys])]
  await Promise.all(keys.map(async name => {
    try { await forward(name, sender, text) } catch (_) {
      // 不打印异常原文，网络异常可能含设备密钥或短信正文。
      $.log('❌ 一项转发配置处理失败，其他配置不受影响')
      $.msg('短信转发', '配置处理失败', '请检查过滤正则、通知模板和 Bark 地址')
    }
  }))
})().catch(error => {
  $.log(`❌ ${error.message}`)
  $.msg('短信转发', '处理失败', error.message)
}).finally(() => $.done(result))

async function forward(name, sender, text) {
  if (enabled(get(name, 'disabled'))) return
  if (!passesFilter(name, 'sender', sender) || !passesFilter(name, 'text', text)) {
    $.log('ℹ️ 已按过滤规则跳过转发')
    return
  }
  const codeTest = new RegExp(get(name, 'code_test') || '.*(验证码|动态码|校验码|确认码|安全码)')
  const codeGet = new RegExp(get(name, 'code_get') || '\\d{4,8}')
  const matched = codeTest.test(text) ? text.match(codeGet) : null
  const code = matched ? matched[0] : ''
  const data = { sender, text, code }
  const template = (field, fallback) => {
    const value = get(name, field)
    return renderTpl(value == null || value === '' ? fallback : value, data)
  }
  const title = template('title', '[号码]')
  const subtitle = template('subtitle', '[码][复制提示]')
  const body = template('body', '[内容]')
  const barkRaw = String(get(name, 'bark') || '').trim()
  if (!barkRaw) {
    $.msg(`[无转发 本地预览] ${title}`, subtitle, body)
    return
  }
  const bark = normalizeBarkUrl(barkRaw)
  if (!bark) {
    $.msg('短信转发', 'Bark 地址无效', '请填写完整的 http(s)://服务器/设备密钥 地址')
    return
  }
  const payload = { title, body: `${subtitle}\n${body}`, copy: code || text, autoCopy: 1, isArchive: 1, group: '短信转发' }
  await notify(bark, payload, {
    retries: boundedNumber(get(name, 'bark_retries'), 2, 0, 3),
    timeout: boundedNumber(get(name, 'bark_timeout'), 3, 1, 4) * 1000,
    delay: boundedNumber(get(name, 'bark_retry_delay'), 300, 100, 1000),
  })
}

// 保留原有语义：允许规则是拒绝规则的例外，并不是严格白名单。
function passesFilter(name, field, value) {
  const allow = get(name, field + '_allow') || ''
  const deny = get(name, field + '_deny') || ''
  const allowRegex = allow ? new RegExp(allow) : null
  const denyRegex = deny ? new RegExp(deny) : null
  return Boolean(allowRegex && allowRegex.test(value)) || !denyRegex || !denyRegex.test(value)
}

function boundedNumber(value, fallback, min, max) {
  if (value == null || String(value).trim() === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback
}

async function notify(url, payload, options) {
  let attempts = 0
  let reason = '处理时间预算已用完'
  while (attempts <= options.retries && Date.now() < deadline) {
    attempts++
    let retryable = true
    let retryAfter = 0
    try {
      const timeout = Math.min(options.timeout, deadline - Date.now())
      const response = await postWithTimeout({
        url,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      }, timeout)
      const status = Number(response && (response.statusCode || response.status))
      let data
      try {
        const body = response.body == null ? response.rawBody : response.body
        data = typeof body === 'object' && body !== null && !Array.isArray(body) ? body : JSON.parse(String(body))
      } catch (_) { data = null }
      const rawCode = data && data.code
      const code = (typeof rawCode === 'number' || (typeof rawCode === 'string' && /^\d+$/.test(rawCode))) ? Number(rawCode) : null
      const accepted = data && (code === 200 || code === 0 || (!Object.prototype.hasOwnProperty.call(data, 'code') && data.isSuccess === true))
      if (status >= 200 && status < 300 && accepted) {
        $.log(`✅ Bark 推送成功（第 ${attempts} 次）`)
        return true
      }
      reason = status >= 200 && status < 300 ? 'Bark 业务响应失败或格式无效' : `HTTP ${status || '未知'}`
      // 鉴权/地址/参数错误重复请求无益；超时、限流和服务端错误可重试。
      const permanent = value => value >= 400 && value < 500 && value !== 408 && value !== 429
      retryable = !permanent(status) && !(status >= 200 && status < 300 && permanent(code))
      const headers = response.headers || {}
      const header = Object.keys(headers).find(name => name.toLowerCase() === 'retry-after')
      if (header) {
        const value = headers[header]
        retryAfter = /^\d+(\.\d+)?$/.test(String(value)) ? Number(value) * 1000 : Math.max(0, Date.parse(value) - Date.now())
        if (!Number.isFinite(retryAfter)) retryAfter = 0
      }
    } catch (_) {
      reason = '网络错误或请求超时'
    }
    $.log(`⚠️ Bark 第 ${attempts} 次失败：${reason}`)
    if (!retryable || attempts > options.retries) break
    const delay = Math.max(Math.min(options.delay * Math.pow(2, attempts - 1), 4000), retryAfter)
    if (Date.now() + delay >= deadline) break
    await $.wait(delay)
  }
  $.msg('短信转发', 'Bark 推送失败', `已尝试 ${attempts} 次：${reason}。请检查网络、设备密钥和服务状态。`)
  return false
}

// 手动计时兜底：部分宿主不执行 HTTP timeout，迟到的响应不能再次完成脚本。
// 超时不代表服务端未收到，重试仍可能产生重复通知。
function postWithTimeout(options, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('请求超时')), Math.max(1, timeout))
    // Surge/Loon 的 timeout 单位为秒；Quantumult X 依赖上面的计时兜底。
    if ($.isSurge() || $.isLoon()) options.timeout = timeout / 1000
    if ($.isNode()) { options.timeout = { request: timeout }; options.retry = { limit: 0 }; options.throwHttpErrors = false }
    Promise.resolve().then(() => $.http.post(options)).then(
      response => { clearTimeout(timer); resolve(response) },
      error => { clearTimeout(timer); reject(error) }
    )
  })
}

function renderTpl(template, data) {
  const values = {
    '[号码]': data.sender,
    '[内容]': data.text,
    '[时间]': new Date().toLocaleString('zh'),
    '[复制提示]': data.code ? '(长按/下拉复制验证码)' : '(长按/下拉复制)',
    '[码]': data.code,
  }
  // 一次替换，避免短信原文内的占位符被再次展开。
  return String(template).replace(/\[(号码|内容|时间|复制提示|码)\]/g, token => values[token]).trim()
}

function normalizeBarkUrl(value) {
  // 不输出包含设备密钥的地址；不接受凭据、片段、空白和缺少设备路径的地址。
  if (!/^https?:\/\/[^\s/?#@]+\/[^\s?#]+(?:\?[^\s#]*)?$/i.test(value)) return ''
  const parts = value.split('?')
  const base = parts.shift().replace(/\/+$/, '').replace(/^(https?:\/\/[^/]+\/[^/]+)\/push$/i, '$1')
  if (!/^https?:\/\/[^/]+\/[^/]+/i.test(base)) return ''
  return base + (parts.length ? '?' + parts.join('?') : '')
}

// Env函数实现（已压缩）
// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`\ud83d\udd14${this.name}, \u5f00\u59cb!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}isStash(){return"undefined"!=typeof $environment&&$environment["stash-version"]}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,a]=i.split("@"),n={url:`http://${a}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(n,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),a=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(a);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){if(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)});else if(this.isQuanX())this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t&&t.error||"UndefinedError"));else if(this.isNode()){let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:i,statusCode:r,headers:o,rawBody:a}=t,n=s.decode(a,this.encoding);e(null,{status:i,statusCode:r,headers:o,rawBody:a,body:n},n)},t=>{const{message:i,response:r}=t;e(i,r,r&&s.decode(r.rawBody,this.encoding))})}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)});else if(this.isQuanX())t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t&&t.error||"UndefinedError"));else if(this.isNode()){let i=require("iconv-lite");this.initGotEnv(t);const{url:r,...o}=t;this.got[s](r,o).then(t=>{const{statusCode:s,statusCode:r,headers:o,rawBody:a}=t,n=i.decode(a,this.encoding);e(null,{status:s,statusCode:r,headers:o,rawBody:a,body:n},n)},t=>{const{message:s,response:r}=t;e(s,r,r&&i.decode(r.rawBody,this.encoding))})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl,i=t["update-pasteboard"]||t.updatePasteboard;return{"open-url":e,"media-url":s,"update-pasteboard":i}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============\ud83d\udce3\u7cfb\u7edf\u901a\u77e5\ud83d\udce3=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t.stack):this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${s} \u79d2`),this.log(),this.isSurge()||this.isQuanX()||this.isLoon()?$done(t):this.isNode()&&process.exit(1)}}(t,e)}
