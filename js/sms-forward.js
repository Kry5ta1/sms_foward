// 定义脚本的主键名
const key = 'sms_forward'

// 配置不同短信服务提供商的数据结构映射
const config = {
  tencent: {
    sender: 'query.sender',    // 腾讯短信发送者路径
    text: 'query.message.text', // 腾讯短信内容路径
  },
  360: {
    sender: 'query.sender',    // 360短信发送者路径
    text: 'query.message.text', // 360短信内容路径
  },
}
// 初始化环境
const $ = new Env(key)

// 定义存储配置的键名常量
const KEY_INITED = `@Kry5ta1.${key}.inited` // 初始化状态键
const KEY_TYPE = `@Kry5ta1.${key}.type`     // 短信服务类型键
const KEY_KEYS = `@Kry5ta1.${key}.keys`     // 配置键列表

// 获取所有配置的键，并处理成数组
const extraKeys = `${$.getdata(KEY_KEYS) || ''}`
  .split(',')                  // 用逗号分隔
  .map(i => i.trim())          // 去除空格
  .filter(i => i.length > 0)   // 过滤空值
const keys = [...new Set([key, ...extraKeys])] // 主键优先，并自动去重
$.log(`ℹ️ 所有配置的 key: ${keys.join(', ')}`)

// 记录脚本初始化时间
$.setdata(new Date().toLocaleString('zh'), KEY_INITED)

let result = {}

// 主函数，使用IIFE立即执行
!(async () => {
  // 检查是否禁用脚本
  const KEY_DISABLED = `@Kry5ta1.${key}.disabled`
  const disabled = $.getdata(KEY_DISABLED)

  if (String(disabled) === 'true') {
    $.log('ℹ️ 已禁用')
    return
  }
  // 获取短信服务类型，默认为腾讯
  const type = $.getdata(KEY_TYPE) || 'tencent'
  const typeConfig = config[type]
  if (!typeConfig) {
    throw new Error(`不支持的类型: ${type}`)
  }

  // 获取请求体并解析
  let input = $request.body
  $.log('📥 接收到请求数据')
  try {
    input = JSON.parse(input || '{}')  // 尝试解析JSON
    $.log('✅ 请求数据解析成功')
  } catch (e) {
    $.log('❌ 请求数据解析失败:', e.message)
    throw new Error('解析请求失败')
  }
  
  // 提取短信内容和发送者
  let text = $.lodash_get(input, typeConfig.text)
  let sender = $.lodash_get(input, typeConfig.sender)
  sender = sender == null ? '' : `${sender}`  // 确保sender是字符串
  text = text == null ? '' : `${text}`        // 确保text是字符串
  $.log(`📱 发送号码: ${sender}`)
  $.log(`📝 短信内容: ${text}`)

  // 处理每个配置的函数
  const fn = async (key, index) => {
    $.log(`👉🏻 [${index}][${key}] 配置开始`)
    const KEY_DISABLED = `@Kry5ta1.${key}.disabled`
    const disabled = $.getdata(KEY_DISABLED)

    // 跳过禁用的配置
    if (String(disabled) === 'true') {
      $.log(`👉🏻 [${index}][${key}] 配置已禁用`)
      return
    }

    // 定义过滤规则的键名
    const KEY_SENDER_ALLOW = `@Kry5ta1.${key}.sender_allow` // 允许的发送者
    const KEY_SENDER_DENY = `@Kry5ta1.${key}.sender_deny`   // 拒绝的发送者
    const KEY_TEXT_ALLOW = `@Kry5ta1.${key}.text_allow`     // 允许的内容
    const KEY_TEXT_DENY = `@Kry5ta1.${key}.text_deny`       // 拒绝的内容

    // 定义通知模板的键名
    const KEY_TITLE = `@Kry5ta1.${key}.title`         // 标题模板
    const KEY_SUBTITLE = `@Kry5ta1.${key}.subtitle`   // 副标题模板
    const KEY_BODY = `@Kry5ta1.${key}.body`           // 正文模板
    const KEY_BARK = `@Kry5ta1.${key}.bark`           // Bark通知地址

    // 获取过滤规则并创建正则表达式
    const senderAllow = $.getdata(KEY_SENDER_ALLOW) || ''
    const senderAllowRegExp = toRegExp(senderAllow, `[${index}][${key}] 允许号码`)
    if (senderAllow && !senderAllowRegExp) return

    const senderDeny = $.getdata(KEY_SENDER_DENY) || ''
    const senderDenyRegExp = toRegExp(senderDeny, `[${index}][${key}] 拒绝号码`)
    if (senderDeny && !senderDenyRegExp) return

    const textAllow = $.getdata(KEY_TEXT_ALLOW) || ''
    const textAllowRegExp = toRegExp(textAllow, `[${index}][${key}] 允许内容`)
    if (textAllow && !textAllowRegExp) return

    const textDeny = $.getdata(KEY_TEXT_DENY) || ''
    const textDenyRegExp = toRegExp(textDeny, `[${index}][${key}] 拒绝内容`)
    if (textDeny && !textDenyRegExp) return

    // 判断发送者是否允许转发
    let isSenderAllow = true
    let isTextAllow = true

    if (senderAllow) {
      $.log(`👉🏻 [${index}][${key}] 检查允许号码规则: ${senderAllow}`)
      if (senderAllowRegExp.test(sender)) {
        $.log(`👉🏻 [${index}][${key}] ${sender} 命中允许规则 ✅，跳过拒绝号码规则`)
      } else {
        $.log(`👉🏻 [${index}][${key}] ${sender} 未命中允许规则，继续检查拒绝号码规则`)
        if (senderDeny) {
          $.log(`👉🏻 [${index}][${key}] 检查拒绝号码规则: ${senderDeny}`)
          if (senderDenyRegExp.test(sender)) {
            $.log(`👉🏻 [${index}][${key}] ${sender} 符合拒绝规则 ❌`)
            isSenderAllow = false
          }
        }
      }
    } else if (senderDeny) {
      $.log(`👉🏻 [${index}][${key}] 检查拒绝号码规则: ${senderDeny}`)
      if (senderDenyRegExp.test(sender)) {
        $.log(`👉🏻 [${index}][${key}] ${sender} 符合拒绝规则 ❌`)
        isSenderAllow = false
      }
    }
    
    // 判断内容是否允许转发
    if (textAllow) {
      $.log(`👉🏻 [${index}][${key}] 检查允许内容规则: ${textAllow}`)
      if (textAllowRegExp.test(text)) {
        $.log(`👉🏻 [${index}][${key}] 内容命中允许规则 ✅，跳过拒绝内容规则`)
      } else {
        $.log(`👉🏻 [${index}][${key}] 内容未命中允许规则，继续检查拒绝内容规则`)
        if (textDeny) {
          $.log(`👉🏻 [${index}][${key}] 检查拒绝内容规则: ${textDeny}`)
          if (textDenyRegExp.test(text)) {
            $.log(`👉🏻 [${index}][${key}] 内容符合拒绝规则 ❌`)
            isTextAllow = false
          }
        }
      }
    } else if (textDeny) {
      $.log(`👉🏻 [${index}][${key}] 检查拒绝内容规则: ${textDeny}`)
      if (textDenyRegExp.test(text)) {
        $.log(`👉🏻 [${index}][${key}] 内容符合拒绝规则 ❌`)
        isTextAllow = false
      }
    }
    
    // 如果发送者或内容不允许转发，则退出
    if (!isSenderAllow || !isTextAllow) {
      $.log(`👉🏻 [${index}][${key}] 过滤检查未通过，跳过转发`)
      return
    }
    
    // 验证码识别相关配置
    const KEY_CODE_TEST = `@Kry5ta1.${key}.code_test` // 验证码判断正则
    const KEY_CODE_GET = `@Kry5ta1.${key}.code_get`   // 验证码提取正则

    // 获取验证码识别规则并创建正则表达式
    const codeTest = $.getdata(KEY_CODE_TEST) || '.*(验证码|动态码|校验码|确认码|安全码)'
    const codeTestRegExp = toRegExp(codeTest, `[${index}][${key}] 验证码识别`)
    const codeGet = $.getdata(KEY_CODE_GET) || '\\d{4,8}'
    const codeGetRegExp = toRegExp(codeGet, `[${index}][${key}] 验证码提取`)

    // 验证码识别与提取
    let hasCode
    let code
    if (codeTestRegExp) {
      $.log(`👉🏻 [${index}][${key}] 验证码检测规则: ${codeTest}`)
      if (codeTestRegExp.test(text)) {
        $.log(`👉🏻 [${index}][${key}] 检测到验证码内容 ✅`)
        hasCode = true
        if (codeGetRegExp) {
          $.log(`👉🏻 [${index}][${key}] 验证码提取规则: ${codeGet}`)
          const matched = text.match(codeGetRegExp)
          if (matched) {
            code = matched[0]
            if (code) {
              $.log(`👉🏻 [${index}][${key}] 提取到验证码: ${code} ✅`)
            }
          }
        }
      }
    }
    
    // 设置复制内容，优先复制验证码
    let copy = text
    if (code) {
      $.log(`👉🏻 [${index}][${key}] 将复制验证码到剪贴板`)
      copy = code
    }
    $.log(`👉🏻 [${index}][${key}] 📋 复制内容: ${copy}`)
    
    // 准备通知数据
    const msgData = {
      sender,
      text,
      hasCode,
      code,
      copy,
    }
    
    // 获取通知模板
    const titleTpl = $.getdata(KEY_TITLE) || '[号码]'
    const subtitleTpl = $.getdata(KEY_SUBTITLE) || '[码][复制提示]'
    const bodyTpl = $.getdata(KEY_BODY) || '[内容]'

    // 渲染通知模板
    const title = renderTpl(titleTpl, msgData)
    const subtitle = renderTpl(subtitleTpl, msgData)
    const body = renderTpl(bodyTpl, msgData)

    $.log(`👉🏻 [${index}][${key}] 📢 标题: ${title}`)
    $.log(`👉🏻 [${index}][${key}] 📢 副标题: ${subtitle}`)
    $.log(`👉🏻 [${index}][${key}] 📢 正文: ${body}`)

    // 发送通知
    await notify(title, subtitle, body, { copy, KEY_BARK })
    $.log(`👉🏻 [${index}][${key}] 配置结束`)
  }
  
  // 遍历所有配置并处理
  for (const [index, key] of keys.entries()) {
    await fn(key, index)
  }

  // 处理隐私相关配置
  const KEY_REPLACE_NUM = `@Kry5ta1.${key}.replace_num` // 替换数字配置
  const KEY_NO_POST = `@Kry5ta1.${key}.no_post`         // 不提交数据配置

  const noPost = $.getdata(KEY_NO_POST)

  // 决定是否提交数据给原始接口
  if (String(noPost) === 'true') {
    $.log('ℹ️ 不提交数据给腾讯/360等接口')
    const fakePayload = { provider: type, redacted: true }
    result = { body: JSON.stringify(fakePayload) } // Stash/Surge 需通过 body 回写请求体
  } else {
    $.log('ℹ️ 将提交数据给腾讯/360等接口')
    const replaceNum = $.getdata(KEY_REPLACE_NUM)

    // 是否替换数字（保护隐私）
    if (String(replaceNum) !== 'false') {
      $.log('🔒 启用隐私保护，替换数字内容')
      const originalText = text
      text = text.replace(/\d/g, () => Math.floor(Math.random() * 10)) // 替换为随机数字
      $.log(`🔒 隐私保护完成: ${originalText} → ${text}`)
      lodash_set(input, typeConfig.text, text)
    }
    result = { body: JSON.stringify(input) } // 明确回写请求体，确保修改生效
  }
})()
  .catch(e => {
    const errMsg = `${$.lodash_get(e, 'message') || $.lodash_get(e, 'error') || e}`
    $.log('❌ 脚本执行出错:', errMsg)
    $.msg('短信转发', '❌', errMsg)
  })
  .finally(() => {
    $.log('📤 处理完成，返回结果给原接口')
    $.done(result)  // 完成处理并返回结果
  })

/**
 * 发送通知函数
 * 支持Bark通知方式
 */
async function notify(title, subtitle, body, { copy, KEY_BARK }) {
  $.log("📢 开始发送通知");
  
  const barkRaw = `${KEY_BARK ? $.getdata(KEY_BARK) || '' : ''}`.trim()
  const bark = normalizeBarkUrl(barkRaw)

  $.log(`📢 Bark配置: ${bark ? '已配置' : '未配置'}`);

  if (bark) {
    // Bark通知 - 使用POST API
    $.log(`📢 开始Bark推送: ${bark}`);
    
    try {
      // 准备POST请求数据
      const fullContent = `${subtitle}\n${body}`;
      const payload = {
        title: title,
        body: fullContent,
        copy: copy,           // 复制内容
        autoCopy: 1,          // 自动复制
        sound: "true",        // 使用声音提醒
        isArchive: 1,         // 保存到历史记录
        group: "短信转发"      // 分组
      };
      
      // 构建请求选项
      const requestOptions = {
        url: bark,
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(payload)
      };
      
      $.log(`📢 发送Bark请求...`);
      const res = await $.http.post(requestOptions);
      
      // 检查响应
      const status = Number($.lodash_get(res, 'status') || $.lodash_get(res, 'statusCode') || 0);
      let resBody = $.lodash_get(res, 'body') || $.lodash_get(res, 'rawBody') || '';
      let resBodyObj = null;
      
      try {
        resBodyObj = JSON.parse(String(resBody));
      } catch (e) {
        // 响应不是JSON格式
      }
      
      // 检查响应是否成功
      const hasCodeField = !!(
        resBodyObj &&
        Object.prototype.hasOwnProperty.call(resBodyObj, 'code')
      )
      const code = String($.lodash_get(resBodyObj, 'code') || '')
      const isSuccess = ['0', '200'].includes(code) || $.lodash_get(resBodyObj, 'isSuccess') === true
      if (status >= 400 || (hasCodeField && !isSuccess)) {
        throw new Error(`Bark服务器响应错误: ${status}`);
      }
      
      $.log(`📢 Bark推送成功 ✅ (${status || 'unknown'})`);
    } catch (e) {
      $.log(`📢 Bark推送失败: ${e.message || e}`);
      $.msg('短信转发', `❌ Bark推送失败`, `${$.lodash_get(e, 'message') || $.lodash_get(e, 'error') || e}`, {});
    }
  } else {
    if (barkRaw) {
      $.msg('短信转发', '❌ Bark 地址无效', '请填写以 http:// 或 https:// 开头的 Bark 地址')
    }
    // 如果没有配置推送服务，则在本地显示预览
    $.log('📢 未配置推送服务，显示本地预览');
    $.msg(`[无转发 本地预览] ${title}`, subtitle, body);
  }
}

/**
 * 渲染模板函数
 * 将模板中的变量替换为实际值
 */
function renderTpl(tpl, data) {
  const map = {
    '[号码]': data.sender || '',
    '[内容]': data.text || '',
    '[时间]': new Date().toLocaleString('zh'),
    '[复制提示]': data.code ? '(长按/下拉复制验证码)' : '(长按/下拉复制)',
    '[码]': data.code || '',
  }
  let text = `${tpl || ''}`
  for (const [token, value] of Object.entries(map)) {
    text = text.split(token).join(value)
  }
  return text.replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * 正则构造函数
 * 兜底处理无效正则，避免脚本整体崩溃
 */
function toRegExp(rule, label) {
  if (!rule) return null
  try {
    return new RegExp(rule)
  } catch (e) {
    $.log(`❌ ${label} 正则无效: ${rule} (${e.message || e})`)
    return null
  }
}

/**
 * Bark地址标准化
 * 保留用户原始地址，并修正常见误填格式
 */
function normalizeBarkUrl(url) {
  const value = `${url || ''}`.trim()
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) return ''

  const parts = value.split('?')
  let base = parts[0].replace(/\/+$/, '')
  const query = parts.slice(1).join('?')

  // 常见误填：把 key 地址写成 /<key>/push，会被 Bark 兼容路由当成正文 "push"
  // 这里自动修正成 /<key>
  const keyPushPattern = /^(https?:\/\/[^/]+\/[^/?#]+)\/push$/i
  const matched = base.match(keyPushPattern)
  if (matched) {
    base = matched[1]
    $.log(`ℹ️ 检测到 Bark 地址为 /<key>/push，已自动修正为: ${base}`)
  }

  return query ? `${base}?${query}` : base
}

/**
 * lodash_set函数
 * 用于安全地设置对象深层属性的值
 */
function lodash_set(obj, path, value) {
  if (Object(obj) !== obj) return obj // 当obj不是对象时直接返回
  // 如果path不是数组，则转换为数组
  if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || []
  path.slice(0, -1).reduce(
    (
      a,
      c,
      i // 遍历路径中除最后一个元素外的所有元素
    ) =>
      Object(a[c]) === a[c] // 检查键是否存在且值为对象
        ? // 存在则继续沿路径前进
          a[c]
        : // 不存在则创建，判断下一个键是否为数组索引
          (a[c] =
            Math.abs(path[i + 1]) >> 0 === +path[i + 1]
              ? [] // 是数组索引则创建数组
              : {}), // 否则创建对象
    obj
  )[path[path.length - 1]] = value // 最后将值赋给路径的最后一个键
  return obj // 返回修改后的对象
}

// Env函数实现（已压缩）
// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`\ud83d\udd14${this.name}, \u5f00\u59cb!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}isStash(){return"undefined"!=typeof $environment&&$environment["stash-version"]}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,a]=i.split("@"),n={url:`http://${a}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(n,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),a=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(a);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){if(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)});else if(this.isQuanX())this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t&&t.error||"UndefinedError"));else if(this.isNode()){let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:i,statusCode:r,headers:o,rawBody:a}=t,n=s.decode(a,this.encoding);e(null,{status:i,statusCode:r,headers:o,rawBody:a,body:n},n)},t=>{const{message:i,response:r}=t;e(i,r,r&&s.decode(r.rawBody,this.encoding))})}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)});else if(this.isQuanX())t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t&&t.error||"UndefinedError"));else if(this.isNode()){let i=require("iconv-lite");this.initGotEnv(t);const{url:r,...o}=t;this.got[s](r,o).then(t=>{const{statusCode:s,statusCode:r,headers:o,rawBody:a}=t,n=i.decode(a,this.encoding);e(null,{status:s,statusCode:r,headers:o,rawBody:a,body:n},n)},t=>{const{message:s,response:r}=t;e(s,r,r&&i.decode(r.rawBody,this.encoding))})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl,i=t["update-pasteboard"]||t.updatePasteboard;return{"open-url":e,"media-url":s,"update-pasteboard":i}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============\ud83d\udce3\u7cfb\u7edf\u901a\u77e5\ud83d\udce3=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t.stack):this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${s} \u79d2`),this.log(),this.isSurge()||this.isQuanX()||this.isLoon()?$done(t):this.isNode()&&process.exit(1)}}(t,e)}
