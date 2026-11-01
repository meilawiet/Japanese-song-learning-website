import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sentenceCacheMatches } from '../src/lib/sentenceCache.js'
const line = { id: 40, text: '空へ歌う' }
const entry = { text: line.text, schemaVersion: 2, language: 'ja', japaneseLevel: 'N3',
  explanation: { line_id: 40, source_text: line.text, binding_version: 2, meaning: '向天空歌唱' } }
test('transported sentence analysis binds stable line ID, source text and learner level', () => {
  assert.equal(sentenceCacheMatches(entry, line), true)
  assert.equal(sentenceCacheMatches(entry, { ...line, id: 41 }), false)
  assert.equal(sentenceCacheMatches(entry, line, 'N5'), false)
  assert.equal(sentenceCacheMatches({ ...entry, explanation: { ...entry.explanation, source_text: '別の歌詞' } }, line), false)
  assert.equal(sentenceCacheMatches({ ...entry, explanation: { ...entry.explanation, binding_version: 1 } }, line), false)
  assert.equal(sentenceCacheMatches({ ...entry, schemaVersion: 3 }, line), false)
  assert.equal(sentenceCacheMatches({ ...entry, language: 'en', japaneseLevel: undefined }, line, 'N5'), true)
  assert.equal(sentenceCacheMatches({ text: line.text, explanation: { meaning: '旧版已保存解析' } }, line), true)
})
