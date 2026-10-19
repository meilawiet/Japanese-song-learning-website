import test from 'node:test'
import assert from 'node:assert/strict'
import { createAiReviewRequest, createSentenceRequest, lyricContextKey, resolveAiReviewResult } from '../src/lib/aiLyricContext.js'

const song = { id: 'local-original', title: '原创测试', artist: 'UTA', lines: [
  { id: 40, text: '空', translation: '天空', start: 1 },
  { id: 2, text: '星', translation: '星星', start: 3 },
  { id: 70, text: '夢', translation: '梦想', start: 7 },
] }
const annotations = song.lines.map(line => ({ id: line.id, text: line.text, tokens: [{ index: 0, surface: line.text, reading: 'そら' }] }))

test('AI sees current 1-based sentence order while suggestions still bind to original sparse IDs', () => {
  const current = { ...song, lines: [song.lines[2], song.lines[0], song.lines[1]] }
  const request = createAiReviewRequest(current, annotations)
  assert.deepEqual(request.payload.lines.map(line => [line.id, line.text]), [[1, '夢'], [2, '空'], [3, '星']])
  const result = resolveAiReviewResult({ suggestions: [{ line_id: 1, token_index: 0, reason: '当前第1句', suggested_reading: 'ゆめ' }, { line_id: 70 }], segmentation_suggestions: [{ line_id: 3 }] }, request)
  assert.deepEqual(result.suggestions.map(item => item.line_id), [70])
  assert.equal(result.suggestions[0].reason, '当前第1句')
  assert.equal(result.segmentation_suggestions[0].line_id, 2)
  assert.deepEqual(current.lines.map(line => line.id), [70, 40, 2])
})

test('sentence batches use whole-song display numbers and current neighbors rather than batch indices', () => {
  const request = createSentenceRequest(song, [song.lines[1], song.lines[2]])
  assert.deepEqual(request.lines.map(line => line.id), [2, 3])
  assert.equal(request.lines[0].previous_line, '空')
  assert.equal(request.lines[0].next_line, '夢')
  assert.equal(request.lineIds.get(2), 2)
  assert.equal(request.lineIds.get(3), 70)
})

test('request binding changes on order/text/reading edits but never depends on raw source files', () => {
  const request = createAiReviewRequest(song, annotations)
  assert.notEqual(createAiReviewRequest({ ...song, lines: [...song.lines].reverse() }, annotations).inputKey, request.inputKey)
  assert.notEqual(createAiReviewRequest(song, annotations, { 'local-original:40:0': 'あす' }).inputKey, request.inputKey)
  assert.equal(createAiReviewRequest({ ...song, sourceFile: 'another.lrc' }, annotations).inputKey, request.inputKey)
  assert.equal(lyricContextKey({ ...song, lines: song.lines.map(line => ({ ...line, start: line.start + 5 })) }), lyricContextKey(song))
})

test('review tokens must match current text and preserve explicit empty readings and manual boundaries', () => {
  const request = createAiReviewRequest(song, [{ ...annotations[0], text: '旧原文' }, annotations[1], { ...annotations[2], tokens: [{ ...annotations[2].tokens[0], segmentation_user_changed: true }] }], { 'local-original:2:0': '' })
  assert.equal(request.payload.lines[0].tokens, undefined)
  assert.equal(request.payload.lines[1].tokens[0].reading, '')
  assert.equal(request.payload.lines[2].tokens[0].segmentation_locked, true)
})
