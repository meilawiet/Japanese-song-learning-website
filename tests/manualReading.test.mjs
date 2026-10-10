import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultManualReadingMode, prepareManualReading } from '../src/lib/manualReading.js'

// 验证实际冲突示例及不同语言，不能把原样输入局部转换成假名。
test('英语及其他语言原样保存，日语仍支持罗马音转假名', () => {
  for (const value of ['news', 'LOVE', 'café', '안녕', '你好', 'ねws']) assert.equal(prepareManualReading(value, 'literal'), value)
  assert.equal(prepareManualReading('kanashii', 'romaji'), 'かなしい')
  assert.equal(prepareManualReading('nyuusu', 'romaji'), 'にゅうす')
  for (const mode of ['romaji', 'literal']) assert.equal(prepareManualReading('  ', mode), '')
  assert.equal(defaultManualReadingMode({ surface: 'news' }, 'にゅーす'), 'literal')
  assert.equal(defaultManualReadingMode({ surface: '悲しい' }, 'かなしい'), 'romaji')
  assert.equal(defaultManualReadingMode({ surface: '歌' }, 'song'), 'literal')
})
