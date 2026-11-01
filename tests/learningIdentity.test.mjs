import assert from 'node:assert/strict'
import { test } from 'node:test'
import { annotationMatchesLine, lyricSnapshot, reconcileLearningState } from '../src/lib/learningIdentity.js'

const song = { id: 'folder-original.lrc', sourceFile: 'original.lrc', lines: [
  { id: 0, text: 'まどを開けよう' }, { id: 1, text: 'あしたも歌おう' },
] }
const annotation = (line) => ({ id: line.id, tokens: [{ index: 0, surface: line.text, reading: line.text }] })
function state(id = song.id) {
  return {
    progress: {
      learnedBySong: { [id]: [0, 1], 'local-unrelated': [7] },
      corrections: { [`${id}:0:0`]: 'まどをあけよう', [`${id}:1:0`]: 'あしたもうたおう', 'local-unrelated:7:0': 'あめ' },
      reviewItems: [{ songId: id, lineId: 0, text: song.lines[0].text }],
      favoriteSongIds: [id, 'local-unrelated'], meaningOverrides: { '窓:まど': '窗户' },
    },
    annotations: { [id]: song.lines.map(annotation), 'local-unrelated': [annotation({ id: 7, text: 'あめ' })] },
    aiReviews: { [id]: { suggestions: [] } }, sentenceExplanations: { [id]: { 0: { text: song.lines[0].text } } },
  }
}

test('equal line counts do not validate different lyrics; unaffected song and line survive', () => {
  const saved = state()
  const copy = structuredClone(saved)
  const changed = { ...song, lines: [{ id: 0, text: 'そらを見上げよう' }, song.lines[1]] }
  const result = reconcileLearningState([changed], saved)
  assert.deepEqual(result.annotations[song.id].map((item) => item.id), [1])
  assert.equal(result.progress.corrections[`${song.id}:0:0`], undefined)
  assert.equal(result.progress.corrections[`${song.id}:1:0`], 'あしたもうたおう')
  assert.deepEqual(result.progress.learnedBySong[song.id], [1])
  assert.deepEqual(result.progress.reviewItems, [])
  assert.equal(result.aiReviews[song.id], undefined)
  assert.equal(result.sentenceExplanations[song.id], undefined)
  assert.deepEqual(result.annotations['local-unrelated'], saved.annotations['local-unrelated'])
  assert.deepEqual(result.progress.learnedBySong['local-unrelated'], [7])
  assert.equal(result.progress.corrections['local-unrelated:7:0'], 'あめ')
  assert.deepEqual(result.progress.meaningOverrides, saved.progress.meaningOverrides)
  assert.deepEqual(saved, copy, 'reconciliation is non-mutating')
})

test('unique unchanged legacy folder song migrates despite file ordering', () => {
  const result = reconcileLearningState([song], state('song-8'))
  assert.deepEqual(result.progress.learnedBySong[song.id], [0, 1])
  assert.equal(result.progress.corrections[`${song.id}:0:0`], 'まどをあけよう')
  assert.equal(result.progress.corrections['song-8:0:0'], undefined)
  assert.ok(result.progress.favoriteSongIds.includes(song.id))
  assert.equal(result.progress.reviewItems[0].songId, song.id)
  assert.deepEqual(result.progress.lyricSnapshots[song.id], lyricSnapshot(song))
  assert.deepEqual(reconcileLearningState([song], result), result)
})

test('garbled, same-length legacy cache is not applied to a new stable ID', () => {
  const saved = state('song-1')
  saved.annotations['song-1'][0].tokens[0].surface = '错误的旧文字'
  const result = reconcileLearningState([song], saved)
  assert.equal(result.annotations[song.id], undefined)
  assert.equal(result.progress.corrections[`${song.id}:0:0`], undefined)
  assert.equal(result.progress.learnedBySong[song.id], undefined)
  assert.deepEqual(result.annotations['song-1'], saved.annotations['song-1'], 'unverifiable legacy data stays stored')
})

test('ambiguous legacy matches are not guessed', () => {
  const result = reconcileLearningState([song, { ...song, id: 'folder-copy.lrc', sourceFile: 'copy.lrc' }], state('song-1'))
  assert.equal(result.annotations[song.id], undefined)
  assert.equal(result.annotations['folder-copy.lrc'], undefined)
})

test('inserting a line invalidates positional corrections and progress rather than shifting them', () => {
  const inserted = { ...song, lines: [{ id: 0, text: 'はじめよう' }, ...song.lines.map((line) => ({ ...line, id: line.id + 1 }))] }
  const result = reconcileLearningState([inserted], state())
  assert.deepEqual(result.annotations[song.id], [])
  assert.deepEqual(result.progress.learnedBySong[song.id], [])
  assert.ok(!Object.keys(result.progress.corrections).some((key) => key.startsWith(`${song.id}:`)))
})

test('annotation needs the exact ID, text and token surfaces; timing-only changes keep learning state', () => {
  const line = song.lines[0]
  assert.ok(annotationMatchesLine(annotation(line), line))
  assert.ok(!annotationMatchesLine({ ...annotation(line), text: '古い歌詞' }, line))
  assert.ok(!annotationMatchesLine(annotation({ ...line, id: 9 }), line))
  const saved = state()
  saved.progress.lyricSnapshots = { [song.id]: lyricSnapshot(song) }
  const result = reconcileLearningState([{ ...song, lines: song.lines.map((item) => ({ ...item, start: 10, translation: '新译文' })) }], saved)
  assert.deepEqual(result.progress.corrections, saved.progress.corrections)
  assert.deepEqual(result.progress.learnedBySong, saved.progress.learnedBySong)
})

test('snapshots preserve validated mastery without requiring annotation cache', () => {
  const saved = state()
  saved.progress.lyricSnapshots = { [song.id]: lyricSnapshot(song) }
  delete saved.annotations[song.id]
  const result = reconcileLearningState([song], saved)
  assert.deepEqual(result.progress.learnedBySong[song.id], [0, 1])
  assert.equal(result.progress.corrections[`${song.id}:0:0`], undefined, 'token corrections require token evidence')
})

test('browser-local mastery and import-time AI cache survive first loading without old snapshots', () => {
  const local = { ...song, id: 'local-new', isLocal: true }
  const saved = state(local.id)
  delete saved.annotations[local.id]
  const result = reconcileLearningState([local], saved)
  assert.deepEqual(result.progress.learnedBySong[local.id], [0, 1])
  assert.deepEqual(result.sentenceExplanations[local.id], saved.sentenceExplanations[local.id])
})

test('minimal cross-platform review entries gain text only for a confirmed song and stable line ID', () => {
  const local = { ...song, id: 'local-stable', isLocal: true }
  const saved = state(local.id)
  saved.progress.lyricSnapshots = { [local.id]: lyricSnapshot(local) }
  saved.progress.reviewItems = [{ songId: local.id, lineId: 1, custom: 'preserve' }, { songId: 'local-unavailable', lineId: 55 }]
  const result = reconcileLearningState([local], saved)
  assert.deepEqual(result.progress.reviewItems, [
    { songId: local.id, lineId: 1, custom: 'preserve', text: local.lines[1].text }, { songId: 'local-unavailable', lineId: 55 },
  ])
  assert.equal(saved.progress.reviewItems[0].text, undefined, 'do not mutate the input snapshot')
  const changed = { ...local, lines: [local.lines[0], { ...local.lines[1], text: '新原文' }] }
  assert.deepEqual(reconcileLearningState([changed], saved).progress.reviewItems, [{ songId: 'local-unavailable', lineId: 55 }])
})
