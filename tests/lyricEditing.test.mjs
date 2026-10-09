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
  const original = { ...song, id: 'demo', isLocal: false }
  const result = commitEditedLine([original], { ...state(), annotations: {}, progress: {} }, 'demo', 0, annotation(0, '今日', 'きょう'), { 0: 'きょう' })
  assert.equal(applyLyricEdits(original, result.state.progress.lyricEditsBySong).lines[0].text, '今日')
  assert.equal(applyLyricEdits(song, { [song.id]: { 0: '違う' } }).lines[0].text, '明日')
})
