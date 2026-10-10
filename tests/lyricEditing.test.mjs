import test from 'node:test'
import assert from 'node:assert/strict'
import { applyLyricEdits, commitEditedLine } from '../src/lib/lyricEditing.js'

// 校对读音不丢失掌握记录；改歌词时仅清除对应句子，保留其他句子的进度。
const song = { id: 'local-test', isLocal: true, lines: [{ id: 0, text: '明日', start: 1 }, { id: 1, text: '歌', start: 5 }] }
const annotation = (id, text, reading) => ({ id, text, tokens: [{ index: 0, surface: text, reading, is_symbol: false }] })
const state = () => ({ progress: { learnedBySong: { 'local-test': [0, 1] }, reviewItems: [], corrections: {}, lyricSnapshots: { 'local-test': { lines: song.lines } } }, annotations: { 'local-test': [annotation(0, '明日', 'あした'), annotation(1, '歌', 'うた')] }, aiReviews: {}, sentenceExplanations: {} })

// 编辑和清空翻译不应触发歌词改变时的进度重置，旧字符串覆盖继续兼容。
test('单句翻译可保存清空且保留注音时间和学习进度', () => {
  for (const isLocal of [true, false]) {
    const original = { ...song, isLocal }
    const edited = commitEditedLine([original], state(), song.id, 0, annotation(0, '明日', 'あした'), { 0: 'あす' }, '明天')
    assert.equal(edited.song.lines[0].translation, '明天')
    assert.equal(edited.song.lines[0].start, 1)
    assert.deepEqual(edited.state.progress.learnedBySong[song.id], [0, 1])
    if (!isLocal) assert.equal(applyLyricEdits(original, JSON.parse(JSON.stringify(edited.state.progress.lyricEditsBySong))).lines[0].translation, '明天')
    const cleared = commitEditedLine([edited.song], edited.state, song.id, 0, annotation(0, '明日', 'あした'), { 0: 'あす' }, '')
    assert.equal(cleared.song.lines[0].translation, '')
    assert.equal(cleared.state.progress.corrections['local-test:0:0'], 'あす')
    if (!isLocal) assert.equal(applyLyricEdits(original, cleared.state.progress.lyricEditsBySong).lines[0].translation, '')
  }
})

// 人工留空必须持久保存，不能与“没有校对记录”混淆，也不影响掌握进度。
test('取消注音保存为空字符串，重载后再次保存仍然保留', () => {
  const result = commitEditedLine([song], state(), song.id, 0, annotation(0, '明日', 'あした'), { 0: '' })
  const reloaded = JSON.parse(JSON.stringify(result.state))
  assert.equal(reloaded.progress.corrections['local-test:0:0'], '')
  assert.deepEqual(reloaded.progress.learnedBySong[song.id], [0, 1])
  const again = commitEditedLine([song], reloaded, song.id, 0, annotation(0, '明日', 'あした'), { 0: '' })
  assert.equal(again.state.progress.corrections['local-test:0:0'], '')
})
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
