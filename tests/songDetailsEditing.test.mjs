import test from 'node:test'
import assert from 'node:assert/strict'
import { applySongDetailsEdit, restoreSongEditLearning } from '../src/lib/songDetailsEditing.js'
import { editHistoryReducer, newEditHistory } from '../src/lib/editHistory.js'

const song = { id: 'local-edit', isLocal: true, lines: [
  { id: 2, start: 1, text: '明日', translation: '明天' },
  { id: 7, start: 4, text: '歌', translation: '歌声' },
] }
const saved = () => ({
  progress: { learnedBySong: { [song.id]: [2, 7], other: [1] }, reviewItems: [{ songId: song.id, lineId: 2, text: '明日' }, { songId: song.id, lineId: 7, text: '歌' }],
    corrections: { [`${song.id}:2:0`]: 'あす', [`${song.id}:7:0`]: 'うた', 'other:1:0': 'ほか' }, meaningOverrides: { '歌': '自定义词义' } },
  annotations: { [song.id]: song.lines.map(line => ({ id: line.id, text: line.text, tokens: [{ index: 0, surface: line.text, reading: 'よみ' }] })) },
  aiReviews: { [song.id]: { suggestions: [] } },
  sentenceExplanations: { [song.id]: { 2: { text: '明日', explanation: {} }, 7: { text: '歌', explanation: {} } } },
})

test('reordering clears context-dependent AI without renumbering or losing mastery and corrections', () => {
  const before = saved(), reordered = { ...song, lines: [...song.lines].reverse() }
  const next = applySongDetailsEdit(song, reordered, before)
  assert.equal(next.aiReviews[song.id], undefined)
  assert.equal(next.sentenceExplanations[song.id], undefined)
  assert.deepEqual(next.progress.learnedBySong[song.id], before.progress.learnedBySong[song.id])
  assert.deepEqual(next.progress.corrections, before.progress.corrections)
  assert.deepEqual(next.annotations[song.id], before.annotations[song.id])
  assert.deepEqual(next.progress.reviewItems, before.progress.reviewItems)
})
test('translation-only edit retains annotation, corrections, mastery, review and other-song state', () => {
  const before = saved(), original = structuredClone(before)
  const after = { ...song, lines: song.lines.map(line => line.id === 2 ? { ...line, translation: '' } : line) }
  const next = applySongDetailsEdit(song, after, before)
  for (const field of ['learnedBySong', 'reviewItems', 'corrections', 'meaningOverrides']) assert.deepEqual(next.progress[field], before.progress[field])
  assert.deepEqual(next.annotations, before.annotations)
  assert.deepEqual(next.aiReviews, before.aiReviews)
  assert.equal(next.sentenceExplanations[song.id][2], undefined)
  assert.deepEqual(next.sentenceExplanations[song.id][7], before.sentenceExplanations[song.id][7])
  assert.deepEqual(before, original, 'reconciliation must not mutate the checkpoint')
})
test('changing one original line invalidates only its personal learning and sentence cache', () => {
  const before = saved(), after = { ...song, lines: song.lines.map(line => line.id === 2 ? { ...line, text: '今日' } : line) }
  const next = applySongDetailsEdit(song, after, before)
  assert.deepEqual(next.progress.learnedBySong[song.id], [7])
  assert.deepEqual(next.annotations[song.id].map(line => line.id), [7])
  assert.deepEqual(next.progress.reviewItems.map(item => item.lineId), [7])
  assert.equal(next.progress.corrections[`${song.id}:2:0`], undefined)
  assert.equal(next.progress.corrections[`${song.id}:7:0`], 'うた')
  assert.deepEqual(Object.keys(next.sentenceExplanations[song.id]), ['7'])
  assert.equal(next.aiReviews[song.id], undefined, 'whole-song AI review depends on overall context')
  assert.deepEqual(next.progress.learnedBySong.other, [1])
})
test('timing and metadata edits retain learning, and line deletion retains its neighbours', () => {
  const before = saved()
  const timed = applySongDetailsEdit(song, { ...song, title: '新歌名', lines: song.lines.map(line => ({ ...line, start: line.start + 2 })) }, before)
  assert.deepEqual(timed.progress.learnedBySong, before.progress.learnedBySong)
  assert.deepEqual(timed.progress.corrections, before.progress.corrections)
  assert.deepEqual(timed.sentenceExplanations, before.sentenceExplanations)
  const removed = applySongDetailsEdit(song, { ...song, lines: [song.lines[1]] }, before)
  assert.deepEqual(removed.progress.learnedBySong[song.id], [7])
  assert.equal(removed.progress.corrections[`${song.id}:7:0`], 'うた')
})
test('saved-edit undo restores checkpoint while preserving later changes to other songs', () => {
  const before = saved(), current = applySongDetailsEdit(song, { ...song, lines: [song.lines[1]] }, before)
  current.progress.learnedBySong.other = [1, 2]
  current.progress.corrections['other:1:0'] = 'あと'
  current.annotations.other = [{ id: 1, tokens: [] }]
  const next = restoreSongEditLearning(current, before, song.id)
  assert.deepEqual(next.progress.learnedBySong[song.id], [2, 7])
  assert.equal(next.progress.corrections[`${song.id}:2:0`], 'あす')
  assert.deepEqual(next.progress.learnedBySong.other, [1, 2])
  assert.equal(next.progress.corrections['other:1:0'], 'あと')
  assert.deepEqual(next.annotations.other, current.annotations.other)
})
test('draft undo and redo cover deleted lines and replacement files without changing snapshots', () => {
  const audio = new Blob(['old']), replacement = new Blob(['new'])
  let history = newEditHistory({ lines: song.lines, audioFile: audio })
  history = editHistoryReducer(history, { type: 'edit', patch: { lines: [song.lines[1]], audioFile: replacement } })
  history = editHistoryReducer(history, { type: 'undo' })
  assert.equal(history.present.audioFile, audio)
  assert.equal(history.present.lines.length, 2)
  history = editHistoryReducer(history, { type: 'redo' })
  assert.equal(history.present.audioFile, replacement)
  assert.equal(history.present.lines.length, 1)
  history = editHistoryReducer(history, { type: 'undo' })
  history = editHistoryReducer(history, { type: 'edit', patch: { title: '另一个修改' } })
  assert.equal(history.future.length, 0)
})


test('new source kana refreshes just affected token state while retaining unchanged-text mastery', () => {
  const before = saved()
  before.progress.hiddenReadings = { [`${song.id}:2:0`]: true, [`${song.id}:7:0`]: true }
  const checkpoint = structuredClone(before)
  const after = { ...song, lines: song.lines.map(line => line.id === 2 ? { ...line, sourceReadings: [{ start: 0, end: 2, reading: 'あした' }] } : line) }
  const next = applySongDetailsEdit(song, after, before)
  assert.deepEqual(next.progress.learnedBySong, before.progress.learnedBySong)
  assert.deepEqual(next.progress.reviewItems, before.progress.reviewItems)
  assert.deepEqual(next.annotations[song.id].map(line => line.id), [7])
  assert.equal(next.progress.corrections[`${song.id}:2:0`], undefined)
  assert.equal(next.progress.hiddenReadings[`${song.id}:2:0`], undefined)
  assert.equal(next.progress.corrections[`${song.id}:7:0`], 'うた')
  assert.equal(next.progress.hiddenReadings[`${song.id}:7:0`], true)
  assert.equal(next.sentenceExplanations[song.id][2], undefined)
  assert.ok(next.sentenceExplanations[song.id][7])
  assert.deepEqual(before, checkpoint, 'the edit-undo checkpoint must stay intact')
})
