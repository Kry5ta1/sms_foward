const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/sms-forward.js'), 'utf8')

// 使用真实 Env 适配层和模拟宿主接口，不向外部发送短信或设备密钥。
async function run({ settings = {}, profiles = {}, responses = [], input, platform = 'surge', noRequest = false, settleMs = 0 } = {}) {
  const store = { Kry5ta1: JSON.stringify({ sms_forward: { bark: 'https://api.day.app/test-key', ...settings }, ...profiles }) }
  const calls = [], notifications = [], logs = [], timers = []
  let completed = 0
  let elapsed = 0
  class Clock extends Date { static now() { return Date.now() + elapsed } }
  const sandbox = {
    Date: Clock,
    console: { log: value => logs.push(String(value)) },
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, Math.max(1, ms / 1000)); timers.push(timer); return timer },
    clearTimeout,
    $done: value => { completed++; finish(value) },
  }
  if (!noRequest) sandbox.$request = { body: input === undefined ? JSON.stringify({ query: { sender: '10086', message: { text: '验证码 123456' } } }) : input }
  function perform(options, callback) {
    calls.push(options)
    const response = responses.length ? responses.shift() : { status: 200, body: '{"code":200}' }
    if (response === 'hang') return
    if (response.advance) elapsed += response.advance
    if (response.late) {
      const timer = setTimeout(() => callback(null, { status: 200 }, '{"code":200}'), response.late)
      timers.push(timer)
      return
    }
    if (response instanceof Error) { callback(response); return }
    callback(null, { ...response, statusCode: response.statusCode || response.status }, response.body)
  }
  if (platform === 'qx') {
    sandbox.$prefs = { valueForKey: key => store[key], setValueForKey: (value, key) => (store[key] = value, true) }
    sandbox.$notify = (...args) => notifications.push(args)
    sandbox.$task = { fetch: options => new Promise((resolve, reject) => perform(options, (err, response) => err ? reject(err) : resolve(response))) }
  } else {
    sandbox.$persistentStore = { read: key => store[key], write: (value, key) => (store[key] = value, true) }
    sandbox.$notification = { post: (...args) => notifications.push(args) }
    sandbox.$httpClient = { post: perform }
    if (platform === 'stash') sandbox.$environment = { 'stash-version': 'test' }
    if (platform === 'loon') sandbox.$loon = 'test'
  }
  let finish
  const done = new Promise(resolve => { finish = resolve })
  vm.runInNewContext(source, sandbox)
  const result = await done
  await new Promise(resolve => settleMs ? setTimeout(resolve, settleMs) : setImmediate(resolve))
  timers.forEach(clearTimeout)
  assert.equal(completed, 1)
  return { calls, notifications, logs, result }
}

for (const platform of ['surge', 'stash', 'loon', 'qx']) {
  test(`${platform}：首次成功与请求体脱敏`, async () => {
    const r = await run({ platform })
    assert.equal(r.calls.length, 1)
    assert.equal(JSON.parse(r.calls[0].body).copy, '123456')
    assert.equal(JSON.parse(r.result.body).query.message.text.length, '验证码 123456'.length)
    assert.ok(!r.logs.join().includes('123456'))
    assert.ok(!r.logs.join().includes('test-key'))
  })
}
test('网络故障、HTTP 503 后恢复', async () => {
  const r = await run({ responses: [new Error('secret-url'), { status: 503, body: '' }, { status: 200, body: '{"code":200}' }] })
  assert.equal(r.calls.length, 3)
  assert.equal(r.notifications.length, 0)
})
test('全部失败严格限制次数，并只通知一次', async () => {
  const r = await run({ responses: Array(5).fill(new Error('secret')) })
  assert.equal(r.calls.length, 3)
  assert.equal(r.notifications.length, 1)
  assert.ok(!r.logs.join().includes('secret'))
})
test('HTTP 401 和业务 400 不重复请求', async () => {
  for (const response of [{ status: 401, body: '' }, { status: 200, body: '{"code":400}' }]) {
    assert.equal((await run({ responses: [response] })).calls.length, 1)
  }
})
test('HTTP 429 重试；超出总预算的 Retry-After 不提前重试', async () => {
  assert.equal((await run({ responses: [{ status: 429, body: '', headers: { 'Retry-After': '0' } }] })).calls.length, 2)
  assert.equal((await run({ responses: [{ status: 429, body: '', headers: { 'retry-after': '60' } }] })).calls.length, 1)
})
test('空响应、无效 JSON、未知 HTTP 状态不能冒充成功', async () => {
  for (const response of [{ status: 200, body: '' }, { status: 200, body: '{}' }, { status: 0, body: '{"code":200}' }]) {
    assert.equal((await run({ responses: [response] })).calls.length, 2)
  }
})
test('code 0 与字符串 200 正常接受', async () => {
  for (const code of [0, '200']) assert.equal((await run({ responses: [{ status: 200, body: JSON.stringify({ code }) }] })).calls.length, 1)
})
test('悬挂请求超时后重试并完成', async () => {
  const r = await run({ responses: ['hang', 'hang', 'hang'] })
  assert.equal(r.calls.length, 3)
  assert.equal(r.notifications.length, 1)
})
test('重试关闭、无效设置回退、上限钳制', async () => {
  assert.equal((await run({ settings: { bark_retries: '0' }, responses: [new Error()] })).calls.length, 1)
  assert.equal((await run({ settings: { bark_retries: 'NaN' }, responses: Array(8).fill(new Error()) })).calls.length, 3)
  assert.equal((await run({ settings: { bark_retries: '999' }, responses: Array(8).fill(new Error()) })).calls.length, 4)
})
test('禁用、缺少请求、空短信和非法 JSON 均不推送', async () => {
  for (const opts of [{ settings: { disabled: true } }, { noRequest: true }, { input: '{}' }, { input: '{' }]) assert.equal((await run(opts)).calls.length, 0)
})
test('隐私模式在无效 JSON 或推送失败时仍去除正文', async () => {
  for (const opts of [{ input: '{' }, { responses: Array(3).fill(new Error()) }]) {
    const r = await run({ ...opts, settings: { no_post: true } })
    assert.equal(JSON.parse(r.result.body).redacted, true)
    assert.ok(!r.result.body.includes('123456'))
  }
})
test('关闭脱敏可保留原文；360 来源可用', async () => {
  const r = await run({ settings: { replace_num: 'false', type: '360' } })
  assert.equal(JSON.parse(r.result.body).query.message.text, '验证码 123456')
})
test('允许规则为拒绝例外，不把允许规则误改为白名单', async () => {
  assert.equal((await run({ settings: { sender_allow: '^10086$', sender_deny: '.*' } })).calls.length, 1)
  assert.equal((await run({ settings: { sender_allow: '^123$', sender_deny: '^999$' } })).calls.length, 1)
  assert.equal((await run({ settings: { text_deny: '验证码' } })).calls.length, 0)
})
test('无效正则隔离，额外配置去重后仍可推送', async () => {
  const r = await run({ settings: { sender_allow: '[', keys: 'other,other,sms_forward' }, profiles: { other: { bark: 'https://api.day.app/other' } } })
  assert.equal(r.calls.length, 1)
  assert.equal(r.notifications.length, 1)
})
test('空 Bark 本地预览；错误 URL 不请求；修正 key/push', async () => {
  assert.equal((await run({ settings: { bark: '' } })).notifications.length, 1)
  assert.equal((await run({ settings: { bark: 'HTTPS://api.day.app/key' } })).calls.length, 1)
  for (const bark of ['invalid', 'https://api.day.app', 'https://api.day.app//', 'https://user:secret@host/key']) assert.equal((await run({ settings: { bark } })).calls.length, 0)
  assert.equal((await run({ settings: { bark: 'https://api.day.app/test-key/push?group=test' } })).calls[0].url, 'https://api.day.app/test-key?group=test')
})
test('模板一次替换，不展开短信原文中的占位符', async () => {
  const r = await run({ input: JSON.stringify({ query: { sender: '10086', message: { text: '[号码] 原文' } } }) })
  assert.ok(JSON.parse(r.calls[0].body).body.endsWith('[号码] 原文'))
})


test('伪成功 code 不被接受', async () => {
  for (const code of [false, '', [], {}]) {
    assert.equal((await run({ responses: [{ status: 200, body: JSON.stringify({ code }) }] })).calls.length, 2)
  }
})
test('总预算耗尽后不重试', async () => {
  const r = await run({ responses: [{ status: 503, body: '', advance: 16001 }] })
  assert.equal(r.calls.length, 1)
  assert.equal(r.notifications.length, 1)
})
test('超时后的迟到响应不会再次完成或通知成功', async () => {
  const r = await run({ responses: [{ late: 20 }], settleMs: 30 })
  assert.equal(r.calls.length, 2)
  assert.equal(r.logs.filter(line => line.includes('Bark 推送成功')).length, 1)
  assert.equal(r.notifications.length, 0)
})
test('本地预览保留显示，但日志不含短信与验证码', async () => {
  const r = await run({ settings: { bark: '' } })
  assert.ok(r.notifications[0].join().includes('123456'))
  assert.ok(!r.logs.join().includes('123456'))
  assert.ok(!r.logs.join().includes('10086'))
})
