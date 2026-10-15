import test from 'node:test'
import assert from 'node:assert/strict'
import { applyLyricEdits, commitEditedLine } from '../src/lib/lyricEditing.js'

// 校对读音不丢失掌握记录；改歌词时仅清除对应句子，保留其他句子的进度。
const song = { id: 'local-test', isLocal: true, lines: [{ id: 0, text: '明日', start: 1 }, { id: 1, text: '歌', start: 5 }] }
const annotation = (id, text, reading) => ({ id, text, tokens: [{ index: 0, surface: text, reading, is_symbol: false }] })
const state = () => ({ progress: { learnedBySong: { 'local-test': [0, 1] }, reviewItems: [], corrections: {}, lyricSnapshots: { 'local-test': { lines: song.lines } } }, annotations: { 'local-test': [annotation(0, '明日', 'あした'), annotation(1, '歌', 'うた')] }, aiReviews: {}, sentenceExplanations: {} })
test('人工读音保存后保留歌词与全部掌握进度', () => {
  const result = commitEditedLine([song], state(), song.id, 0, annotation(0, '明日', 'あした'), { 0: 'あす' })
  assert.equal(result.state.progress.corrections['local-test:0:0'], 'あす')
  assert.deepEqual(result.state.progress.learnedBySong[song.id], [0, 1])
  assert.equal(result.song.lines[0].start, 1)
})
test('修改一句歌词只清除该句掌握状态，保留时间与其他句子', () => {
  const result = commitEditedLine([song], state(), song.id, 0, annotation(0, '今日', 'きょう'), { 0: 'きょう' })
  assert.deepEqual(result.state.progress.learnedBySong[song.id], [1])
  assert.equal(result.song.lines[0].start, 1)
  assert.equal(result.state.annotations[song.id].find((item) => item.id === 0).text, '今日')
})
test('项目内歌曲人工歌词可重载，本地歌曲不叠加项目覆盖', () => {
  const original = { ...song, id: 'demo', isLocal: false, lines: song.lines.map((line) => ({ ...line, romaji: 'old reading' })) }
  const result = commitEditedLine([original], { ...state(), annotations: {}, progress: {} }, 'demo', 0, annotation(0, '今日', 'きょう'), { 0: 'きょう' })
  assert.equal(applyLyricEdits(original, result.state.progress.lyricEditsBySong).lines[0].text, '今日')
  assert.equal(applyLyricEdits(original, result.state.progress.lyricEditsBySong).lines[0].romaji, '')
  assert.equal(applyLyricEdits(song, { [song.id]: { 0: '違う' } }).lines[0].text, '明日')
})
test('单句译文和时间修改保留注音、掌握和复习，项目歌曲重启后仍显示修改', () => {
  const original = { ...song, id: 'demo', isLocal: false }
  const before = state()
  before.progress.learnedBySong = { demo: [0, 1] }
  before.progress.reviewItems = [{ songId: 'demo', lineId: 0, text: '明日' }]
  before.progress.hiddenReadings = { 'demo:0:0': true }
  before.annotations = { demo: [annotation(0, '明日', 'あした'), annotation(1, '歌', 'うた')] }
  const result = commitEditedLine([original], before, 'demo', 0, annotation(0, '明日', 'あした'), { 0: 'あした' }, { translation: '明天', start: 2.5, hidden: { 0: true } })
  assert.deepEqual(result.state.progress.learnedBySong.demo, [0, 1])
  assert.equal(result.state.progress.hiddenReadings['demo:0:0'], true)
  assert.equal(result.state.annotations.demo.find((line) => line.id === 0).text, '明日')
  assert.equal(result.state.progress.reviewItems.length, 1)
  assert.equal(applyLyricEdits(original, result.state.progress.lyricEditsBySong).lines[0].translation, '明天')
  assert.equal(applyLyricEdits(original, result.state.progress.lyricEditsBySong).lines[0].start, 2.5)
})

test('重新分词只清除该句旧词索引的校正和 AI 建议，保留其他句子与掌握记录', () => {
  const before = state()
  before.progress.corrections = { 'local-test:0:0': 'あす', 'local-test:1:0': 'うた' }
  before.aiReviews = { 'local-test': { suggestions: [
    { line_id: 0, token_index: 0, surface: '明日' },
    { line_id: 1, token_index: 0, surface: '歌' },
  ], segmentation_suggestions: [
    { line_id: 0, start_token_index: 0, end_token_index: 0, original_segments: ['明日'], suggested_segments: ['明', '日'] },
    { line_id: 1, start_token_index: 0, end_token_index: 0, original_segments: ['歌'], suggested_segments: ['歌'] },
  ] } }
  const segmented = { id: 0, text: '明日', tokens: [
    { index: 0, surface: '明', reading: 'あ', is_symbol: false, segmentation_locked: true },
    { index: 1, surface: '日', reading: 'した', is_symbol: false, segmentation_locked: true },
  ] }
  const result = commitEditedLine([song], before, song.id, 0, segmented, { 0: 'あ', 1: 'した' }, { hidden: {} })
  assert.deepEqual(result.state.annotations[song.id].find(item => item.id === 0).tokens.map(item => item.surface), ['明', '日'])
  assert.deepEqual(result.state.progress.learnedBySong[song.id], [0, 1])
  assert.equal(result.state.progress.corrections['local-test:0:0'], undefined)
  assert.equal(result.state.progress.corrections['local-test:1:0'], 'うた')
  assert.deepEqual(result.state.aiReviews[song.id].suggestions.map(item => item.line_id), [1])
  assert.deepEqual(result.state.aiReviews[song.id].segmentation_suggestions.map(item => item.line_id), [1])
})
