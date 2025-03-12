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
const KEY_INITED = `@ChinaTelecomOperators.${key}.inited` // 初始化状态键
const KEY_TYPE = `@ChinaTelecomOperators.${key}.type`     // 短信服务类型键
const KEY_KEYS = `@ChinaTelecomOperators.${key}.keys`     // 配置键列表

// 获取所有配置的键，并处理成数组
const keys = `${$.getdata(KEY_KEYS) || ''}`
  .split(',')                  // 用逗号分隔
  .map(i => i.trim())          // 去除空格
  .filter(i => i.length > 0)   // 过滤空值
keys.unshift(key)              // 将主键添加到数组开头
$.log(`ℹ️ 所有配置的 key: ${keys.join(', ')}`)

// 记录脚本初始化时间
$.setdata(new Date().toLocaleString('zh'), KEY_INITED)

let result

// 主函数，使用IIFE立即执行
!(async () => {
  // 检查是否禁用脚本
  const KEY_DISABLED = `@ChinaTelecomOperators.${key}.disabled`
  const disabled = $.getdata(KEY_DISABLED)

  if (String(disabled) === 'true') {
    $.log('ℹ️ 已禁用')
    return
  }
  // 获取短信服务类型，默认为腾讯
  const type = $.getdata(KEY_TYPE) || 'tencent'

  // 获取请求体并解析
  let input = $request.body
  $.log('ℹ️ 请求')
  $.log(input)
  try {
    input = JSON.parse(input)  // 尝试解析JSON
  } catch (e) {
    console.log(e)
    throw new Error('解析请求失败')
  }
  $.log('ℹ️ 解析后的请求')
  $.log(input)
  
  // 提取短信内容和发送者
  let text
  let sender
  if (type === 'tencent') {
    text = $.lodash_get(input, $.lodash_get(config, `${type}.text`))
    sender = $.lodash_get(input, $.lodash_get(config, `${type}.sender`))
  } else if (type === '360') {
    text = $.lodash_get(input, $.lodash_get(config, `${type}.text`))
    sender = $.lodash_get(input, $.lodash_get(config, `${type}.sender`))
  } else {
    throw new Error(`不支持的类型: ${type}`)
  }
  sender = sender == null ? '' : `${sender}`  // 确保sender是字符串
  text = text == null ? '' : `${text}`        // 确保text是字符串
  console.log(`号码 ${sender}`)
  console.log(`内容 ${text}`)

  // 处理每个配置的函数
  const fn = async (key, index) => {
    $.log(`👉🏻 [${index}][${key}] 配置开始`)
    const KEY_DISABLED = `@ChinaTelecomOperators.${key}.disabled`
    const disabled = $.getdata(KEY_DISABLED)

    // 跳过禁用的配置
    if (String(disabled) === 'true') {
      $.log(`👉🏻 [${index}][${key}] 配置已禁用`)
      return
    }

    // 定义过滤规则的键名
    const KEY_SENDER_ALLOW = `@ChinaTelecomOperators.${key}.sender_allow` // 允许的发送者
    const KEY_SENDER_DENY = `@ChinaTelecomOperators.${key}.sender_deny`   // 拒绝的发送者
    const KEY_TEXT_ALLOW = `@ChinaTelecomOperators.${key}.text_allow`     // 允许的内容
    const KEY_TEXT_DENY = `@ChinaTelecomOperators.${key}.text_deny`       // 拒绝的内容

    // 定义通知模板的键名
    const KEY_TITLE = `@ChinaTelecomOperators.${key}.title`         // 标题模板
    const KEY_SUBTITLE = `@ChinaTelecomOperators.${key}.subtitle`   // 副标题模板
    const KEY_BODY = `@ChinaTelecomOperators.${key}.body`           // 正文模板
    const KEY_BARK = `@ChinaTelecomOperators.${key}.bark`           // Bark通知地址
    const KEY_PUSHDEER = `@ChinaTelecomOperators.${key}.pushdeer`   // PushDeer通知地址

    // 获取过滤规则并创建正则表达式
    const senderAllow = $.getdata(KEY_SENDER_ALLOW) || ''
    const senderAllowRegExp = new RegExp(senderAllow)
    const senderDeny = $.getdata(KEY_SENDER_DENY) || ''
    const senderDenyRegExp = new RegExp(senderDeny)
    const textAllow = $.getdata(KEY_TEXT_ALLOW) || ''
    const textAllowRegExp = new RegExp(textAllow)
    const textDeny = $.getdata(KEY_TEXT_DENY) || ''
    const textDenyRegExp = new RegExp(textDeny)

    // 判断发送者是否允许转发
    let isSenderAllow = true
    let isTextAllow = true
    if (senderAllow) {
      console.log(`👉🏻 [${index}][${key}] 允许转发的号码的正则字符串 ${senderAllow}`)
      console.log(`👉🏻 [${index}][${key}] 允许转发的号码的正则 ${senderAllowRegExp}`)
      if (!senderAllowRegExp.test(sender)) {
        console.log(`👉🏻 [${index}][${key}] ${sender} 不符合允许转发的号码 ❌不会转发`)
        isSenderAllow = false
      }
    } else if (senderDeny) {
      console.log(`👉🏻 [${index}][${key}] 不允许转发的号码的正则字符串 ${senderDeny}`)
      console.log(`👉🏻 [${index}][${key}] 不允许转发的号码的正则 ${senderDenyRegExp}`)
      if (senderDenyRegExp.test(sender)) {
        console.log(`👉🏻 [${index}][${key}] ${sender} 符合不允许转发的号码 ❌不会转发`)
        isSenderAllow = false
      }
    }
    
    // 判断内容是否允许转发
    if (textAllow) {
      console.log(`👉🏻 [${index}][${key}] 允许转发的内容的正则字符串 ${textAllow}`)
      console.log(`👉🏻 [${index}][${key}] 允许转发的内容的正则 ${textAllowRegExp}`)
      if (!textAllowRegExp.test(text)) {
        console.log(`👉🏻 [${index}][${key}] ${text} 不符合允许转发的内容 ❌不会转发`)
        isTextAllow = false
      }
    } else if (textDeny) {
      console.log(`👉🏻 [${index}][${key}] 不允许转发的内容的正则字符串 ${textDeny}`)
      console.log(`👉🏻 [${index}][${key}] 不允许转发的内容的正则 ${textDenyRegExp}`)
      if (textDenyRegExp.test(text)) {
        console.log(`👉🏻 [${index}][${key}] ${text} 符合不允许转发的内容 ❌不会转发`)
        isTextAllow = false
      }
    }
    
    // 如果发送者或内容不允许转发，则退出
    if (!isSenderAllow || !isTextAllow) {
      console.log('已判断号码和内容 ❌ 不会转发')
      return
    }
    
    // 验证码识别相关配置
    const KEY_CODE_TEST = `@ChinaTelecomOperators.${key}.code_test` // 验证码判断正则
    const KEY_CODE_GET = `@ChinaTelecomOperators.${key}.code_get`   // 验证码提取正则

    // 获取验证码识别规则并创建正则表达式
    const codeTest = $.getdata(KEY_CODE_TEST) || '.+(码)'  // 默认检测包含"码"的内容
    const codeTestRegExp = new RegExp(codeTest)
    const codeGet = $.getdata(KEY_CODE_GET) || '\\d{4,6}'  // 默认提取4-6位数字
    const codeGetRegExp = new RegExp(codeGet)

    // 验证码识别与提取
    let hasCode
    let code
    if (codeTest) {
      console.log(`👉🏻 [${index}][${key}] 判断内容是否包含验证码的正则字符串 ${codeTest}`)
      console.log(`👉🏻 [${index}][${key}] 判断内容是否包含验证码的正则 ${codeTestRegExp}`)
      if (codeTestRegExp.test(text)) {
        console.log(`👉🏻 [${index}][${key}] ${text} 包含验证码 ✅`)
        hasCode = true
        if (codeGet) {
          console.log(`👉🏻 [${index}][${key}] 从内容提取验证码的正则字符串 ${codeGet}`)
          console.log(`👉🏻 [${index}][${key}] 从内容提取验证码的正则 ${codeGetRegExp}`)
          const matched = text.match(codeGetRegExp)
          if (matched) {
            code = matched[0]
            if (code) {
              console.log(`👉🏻 [${index}][${key}] ${text} 提取到验证码 ${code} ✅`)
            }
          }
        }
      }
    }
    
    // 设置复制内容，优先复制验证码
    let copy = text
    if (code) {
      console.log(`👉🏻 [${index}][${key}] 判断包含验证码 且提取到验证码 将复制验证码`)
      copy = code
    }
    console.log(`👉🏻 [${index}][${key}] 📋 复制的内容 ${copy}`)
    
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

    console.log(`👉🏻 [${index}][${key}] 标题 ${title}`)
    console.log(`👉🏻 [${index}][${key}] 副标题 ${subtitle}`)
    console.log(`👉🏻 [${index}][${key}] 正文 ${body}`)

    // 发送通知
    await notify(title, subtitle, body, { copy, KEY_PUSHDEER, KEY_BARK })
    $.log(`👉🏻 [${index}][${key}] 配置结束`)
  }
  
  // 遍历所有配置并处理
  for (const [index, key] of keys.entries()) {
    await fn(key, index)
  }

  // 处理隐私相关配置
  const KEY_REPLACE_NUM = `@ChinaTelecomOperators.${key}.replace_num` // 替换数字配置
  const KEY_NO_POST = `@ChinaTelecomOperators.${key}.no_post`         // 不提交数据配置

  const noPost = $.getdata(KEY_NO_POST)

  // 决定是否提交数据给原始接口
  if (String(noPost) === 'true') {
    $.log('ℹ️ 不提交数据给腾讯/360等接口')
    result = { fuck: type }  // 伪造一个结果
  } else {
    $.log('ℹ️ 将提交数据给腾讯/360等接口')
    result = input
    const replaceNnum = $.getdata(KEY_REPLACE_NUM)

    // 是否替换数字（保护隐私）
    if (String(replaceNnum) !== 'false') {
      $.log('ℹ️ 替换数字')
      $.log(`ℹ️ 原内容 ${text}`)
      text = text.replace(/\d/g, i => Math.floor(Math.random() * (9 - 1 + 1)) + 1) // 替换为随机数字
      $.log(`🆕 新内容 ${text}`)
      if (type === 'tencent') {
        lodash_set(result, $.lodash_get(config, `${type}.text`), text)
      } else if (type === '360') {
        lodash_set(result, $.lodash_get(config, `${type}.text`), text)
      }
    }
  }
})()
  .catch(e => {
    console.log(e)
    notify(`短信转发`, `❌`, `${$.lodash_get(e, 'message') || $.lodash_get(e, 'error') || e}`, {})
  })
  .finally(() => {
    console.log(`提交给腾讯/360等接口的数据`)
    console.log(result)
    $.done(result)  // 完成处理并返回结果
  })

/**
 * 发送通知函数
 * 支持PushDeer和Bark两种通知方式
 */
async function notify(title, subtitle, body, { copy, KEY_PUSHDEER, KEY_BARK }) {
  const pushdeer = $.getdata(KEY_PUSHDEER)
  const bark = $.getdata(KEY_BARK)

  if (pushdeer || bark) {
    // 发送PushDeer通知
    if (pushdeer) {
      try {
        const url = pushdeer.replace('[推送全文]', encodeURIComponent(`${title}\n${subtitle}\n${body}`))
        $.log(`开始 PushDeer 请求: ${url}`)
        const res = await $.http.get({ url })
        // console.log(res)
        const status = $.lodash_get(res, 'status')
        $.log('↓ res status')
        $.log(status)
        let resBody = String($.lodash_get(res, 'body') || $.lodash_get(res, 'rawBody'))
        try {
          resBody = JSON.parse(resBody)
        } catch (e) {}
        $.log('↓ res body')
        console.log($.toStr(resBody))
        if (!['0', '200'].includes(String($.lodash_get(resBody, 'code'))) && !$.lodash_get(resBody, 'isSuccess')) {
          throw new Error($.lodash_get(resBody, 'errorMessage') || $.lodash_get(resBody, 'message') || $.lodash_get(resBody, 'msg') || '未知错误')
        }
      } catch (e) {
        console.log(e)
        $.msg('短信转发', `❌ PushDeer 请求`, `${$.lodash_get(e, 'message') || $.lodash_get(e, 'error') || e}`, {})
      }
    }
    
    // 发送Bark通知
    if (bark) {
      try {
        // 对内容进行特殊处理，防止内容中的URL破坏整体API结构
        // 将原始模板拆分为基础URL部分和查询参数部分
        let [baseUrlPart, queryPart] = bark.split('?');
        
        // 1. 处理基础URL部分
        const baseUrlWithPlaceholders = baseUrlPart;
        // 编码标题和内容，确保URL安全
        const encodedTitle = encodeURIComponent(title);
        const encodedContent = encodeURIComponent(`${subtitle}\n${body}`);
        
        // 替换基础URL中的占位符
        let processedBaseUrl = baseUrlWithPlaceholders
          .replace('[推送标题]', encodedTitle)
          .replace('[推送内容]', encodedContent);
        $.log(`处理后的基础URL: ${processedBaseUrl}`);
        
        // 2. 处理查询参数部分
        let finalUrl;
        if (queryPart) {
          // 编码复制内容
          const encodedCopy = encodeURIComponent(copy);
          // 替换查询参数中的占位符
          const processedQuery = queryPart.replace('[复制内容]', encodedCopy);
          // 组合完整URL
          finalUrl = `${processedBaseUrl}?${processedQuery}`;
          $.log(`处理后的完整URL: ${finalUrl}`);
        } else {
          finalUrl = processedBaseUrl;
          $.log(`处理后的完整URL: ${finalUrl}`);
        }
        
        $.log(`开始 bark 请求: ${finalUrl}`);
        const res = await $.http.get({ url: finalUrl });
        
        // ... existing code ...
      } catch (e) {
        console.log(e)
        $.msg('短信转发', `❌ bark 请求`, `${$.lodash_get(e, 'message') || $.lodash_get(e, 'error') || e}`, {})
      }
    }
  } else {
    // 如果没有配置推送服务，则在本地显示预览
    $.msg(`[无转发 本地预览] ${title}`, subtitle, body)
  }
}

/**
 * 渲染模板函数
 * 将模板中的变量替换为实际值
 */
function renderTpl(tpl, data) {
  return (
    tpl
      .replace('[号码]', data.sender || '')
      .replace('[内容]', data.text || '')
      .replace('[时间]', new Date().toLocaleString('zh'))
      // .replace('[含码]', data.hasCode ? '✅' : '❌')
      .replace('[复制提示]', data.code ? '(长按/下拉复制验证码)' : '(长按/下拉复制)')
      .replace('[码]', data.code || '')
      .replace(/  +/g, ' ')  // 去除多余空格
  )
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
