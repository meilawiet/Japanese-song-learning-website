import assert from 'node:assert/strict'
import test from 'node:test'
import { customFontFamily, customFontFormat, isCustomFont } from '../src/lib/customFonts.js'
import { normalizeAppearance } from '../src/lib/appearance.js'

// 扩展名与实际文件头必须相符，避免把任意文件或字体集合交给 WebView 加载。
test('自定义字体只接受匹配的单字体格式', () => {
  const bytes = (...values) => Uint8Array.from(values).buffer
  assert.equal(customFontFormat('test.ttf', bytes(0, 1, 0, 0)), 'ttf')
  assert.equal(customFontFormat('test.OTF', bytes(79, 84, 84, 79)), 'otf')
  assert.equal(customFontFormat('test.woff', bytes(119, 79, 70, 70)), 'woff')
  assert.equal(customFontFormat('test.woff2', bytes(119, 79, 70, 50)), 'woff2')
  assert.throws(() => customFontFormat('test.ttf', bytes(79, 84, 84, 79)), /有效/)
  assert.throws(() => customFontFormat('test.ttc', bytes(116, 116, 99, 102)), /有效/)
})

// 仅允许 SHA-256 派生的标识进入外观设置和动态 CSS 字体族名。
test('自定义字体设置拒绝无效标识', () => {
  const id = `custom_${'a'.repeat(64)}`
  assert.equal(isCustomFont(id), true)
  assert.equal(customFontFamily(id), `UTA Custom ${'a'.repeat(64)}`)
  assert.equal(normalizeAppearance({ font: id }).font, id)
  assert.equal(normalizeAppearance({ font: 'custom_bad";color:red' }).font, 'yan')
  assert.equal(isCustomFont('custom_invalid'), false)
})
