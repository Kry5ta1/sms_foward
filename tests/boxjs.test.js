const test = require('node:test')
const assert = require('node:assert/strict')
const box = require('../js/tmp_boxjs.json')

test('BoxJS 原生配置结构、选项类型与存储键一致', () => {
  assert.equal(box.id, 'Kry5ta1.sms_foward.sub')
  const app = box.apps[0]
  assert.equal(app.id, 'Kry5ta1.sms_forward')
  assert.equal(app.settings.length, 18)
  const ids = app.settings.map(item => item.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual([...app.keys].sort(), [...ids].sort())
  for (const item of app.settings) {
    assert.ok(item.id.startsWith('@Kry5ta1.sms_forward.'))
    assert.ok(['boolean', 'text', 'textarea', 'selects'].includes(item.type))
    assert.equal(typeof item.name, 'string')
    assert.equal(typeof item.desc, 'string')
    if (item.type === 'boolean') assert.equal(typeof item.val, 'boolean')
    if (item.type === 'selects') {
      assert.ok(item.items.some(option => option.key === item.val))
      assert.equal(new Set(item.items.map(option => option.key)).size, item.items.length)
      item.items.forEach(option => assert.equal(typeof option.label, 'string'))
    }
  }
  assert.ok(!JSON.stringify(box).includes('asset/1.png'))
  assert.ok(!/onclick/i.test(JSON.stringify(box)))
})
test('重试默认值及可选范围匹配脚本', () => {
  for (const [field, value, min, max] of [['bark_retries', '2', 0, 3], ['bark_timeout', '3', 1, 4], ['bark_retry_delay', '300', 100, 1000]]) {
    const setting = box.apps[0].settings.find(item => item.id.endsWith('.' + field))
    assert.equal(setting.val, value)
    setting.items.forEach(item => assert.ok(Number(item.key) >= min && Number(item.key) <= max))
  }
})
