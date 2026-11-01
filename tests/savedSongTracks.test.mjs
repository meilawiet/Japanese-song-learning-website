import test from 'node:test'
import assert from 'node:assert/strict'
import { savedSongTrackCues, compileSavedSongTracks } from '../src/lib/savedSongTracks.js'
import { applySongDetailsEdit } from '../src/lib/songDetailsEditing.js'

const lines = [
  { id: 8, start: 1, end: 3.8, text: '明日の空', translation: '明天的天空', romaji: 'ashita no sora', sourceReadings: [{ start: 0, end: 2, reading: 'あす' }], timestampOriginalStart: 0.8, extension: { example: true } },
  { id: 42, start: 5, text: 'I  sing (again)', translation: '再唱一次' },
]

test('reopening saved tracks keeps sparse identities, English, spacing, kana and manual ends without inference', () => {
  const cues = savedSongTrackCues(lines), result = compileSavedSongTracks(cues, lines)
  assert.deepEqual(cues.map(cue => cue.track), ['original', 'translation', 'romaji', 'original', 'translation'])
  assert.equal(result.issues.length, 0)
  assert.deepEqual(result.lines.map(line => line.id), [8, 42])
  assert.deepEqual(result.lines[0], lines[0])
  assert.equal(result.lines[1].text, 'I  sing (again)')
  assert.equal(result.lines[1].translation, '再唱一次')
  const numbered = lines.map((line, index) => ({ ...line, displayNumber: index + 1 }))
  assert.equal(compileSavedSongTracks(savedSongTrackCues(numbered), numbered).lines.some(line => Object.hasOwn(line, 'displayNumber')), false)
})

test('an English line incorrectly stored as romaji can become an original with its own translation', () => {
  const old = [{ id: 10, start: 1, text: '空を歌う', translation: '唱向天空', romaji: 'I sing again' }]
  const cues = savedSongTrackCues(old).map(cue => cue.sourceField === 'romaji' ? { ...cue, track: 'original', timeText: '00:02.000' }
    : cue.sourceField === 'translation' ? { ...cue, text: '再次歌唱', targetCueId: 'saved-10-romaji' } : cue)
  const result = compileSavedSongTracks(cues, old)
  assert.equal(result.issues.length, 0)
  assert.deepEqual(result.lines.map(line => [line.id, line.text, line.translation, line.romaji]), [[10, '空を歌う', '', ''], [11, 'I sing again', '再次歌唱', '']])
})

test('demoted or removed originals require re-pairing their auxiliary tracks instead of silently moving them', () => {
  const old = [{ id: 10, start: 1, text: '空を歌う' }, { id: 20, start: 2, text: '唱向天空', romaji: 'sora o utau' }]
  let cues = savedSongTrackCues(old).map(cue => cue.id === 'saved-20-original' ? { ...cue, track: 'translation', targetCueId: 'saved-10-original' } : cue)
  assert.match(compileSavedSongTracks(cues, old).issues.map(issue => issue.message).join(''), /对应原文已被删除/)
  cues = cues.map(cue => cue.id === 'saved-20-romaji' ? { ...cue, targetCueId: 'saved-10-original' } : cue)
  const result = compileSavedSongTracks(cues, old)
  assert.equal(result.issues.length, 0)
  assert.equal(result.lines.length, 1)
  assert.deepEqual([result.lines[0].id, result.lines[0].translation, result.lines[0].romaji], [10, '唱向天空', 'sora o utau'])
})

test('duplicate timestamps stay explicitly paired; ambiguous automatic targets and conflicting translations block application', () => {
  const old = [{ id: 1, start: 1, text: '空', translation: '天空' }, { id: 7, start: 1, text: '風', translation: '风' }]
  const cues = savedSongTrackCues(old)
  assert.equal(compileSavedSongTracks(cues, old).issues.length, 0)
  const ambiguous = cues.map(cue => cue.id === 'saved-7-translation' ? { ...cue, targetCueId: undefined } : cue)
  assert.match(compileSavedSongTracks(ambiguous, old).issues.map(issue => issue.message).join(''), /同一时间有多句原文/)
  const conflict = cues.map(cue => cue.id === 'saved-7-translation' ? { ...cue, targetCueId: 'saved-1-original' } : cue)
  assert.match(compileSavedSongTracks(conflict, old).issues.map(issue => issue.message).join(''), /同一句已有译文/)
})

test('untimed saved lyrics remain untimed and in their existing order with explicit auxiliary pairing', () => {
  const old = [{ id: 3, start: null, text: '空', translation: '天空' }, { id: 1, start: null, text: '風', translation: '风' }]
  const cues = savedSongTrackCues(old), result = compileSavedSongTracks(cues, old)
  assert.equal(result.issues.length, 0)
  assert.deepEqual(result.lines.map(line => [line.id, line.start, line.translation]), [[3, null, '天空'], [1, null, '风']])
  const invalid = cues.map((cue, index) => index === 0 ? { ...cue, timeText: '00:65.000' } : cue)
  assert.match(compileSavedSongTracks(invalid, old).issues.map(issue => issue.message).join(''), /时间戳无效/)
})

test('changed original text drops source kana; invalid manual ends and an empty original track are rejected', () => {
  const cues = savedSongTrackCues(lines)
  const edited = cues.map(cue => cue.id === 'saved-8-original' ? { ...cue, text: '新しい空' } : cue)
  assert.equal(compileSavedSongTracks(edited, lines).lines[0].sourceReadings, undefined)
  const invalidEnd = cues.map(cue => cue.id === 'saved-8-original' ? { ...cue, timeText: '00:04.000' } : cue)
  assert.match(compileSavedSongTracks(invalidEnd, lines).issues.map(issue => issue.message).join(''), /结束时间/)
  assert.match(compileSavedSongTracks(cues.map(cue => ({ ...cue, track: 'ignore' })), lines).issues.map(issue => issue.message).join(''), /没有可学习/)
})

test('reclassified tracks keep unchanged-original learning identity and invalidate context-bound AI', () => {
  const song = { id: 'local-saved-tracks', isLocal: true, lines }, cues = savedSongTrackCues(lines)
  const edited = cues.map(cue => cue.id === 'saved-8-romaji' ? { ...cue, track: 'original', text: 'I sing again', timeText: '00:04.000' } : cue)
  const result = compileSavedSongTracks(edited, lines)
  const before = { progress: { learnedBySong: { [song.id]: [8, 42] }, corrections: { [`${song.id}:8:0`]: 'あす' }, reviewItems: [{ songId: song.id, lineId: 42, text: lines[1].text }], favoriteSongIds: [], meaningOverrides: {} }, annotations: { [song.id]: lines.map(line => ({ id: line.id, text: line.text, tokens: [{ index: 0, surface: line.text, reading: 'かな' }] })) }, aiReviews: { [song.id]: { suggestions: [] } }, sentenceExplanations: { [song.id]: { 8: { text: lines[0].text, explanation: {} } } } }
  const next = applySongDetailsEdit(song, { ...song, lines: result.lines }, before)
  assert.deepEqual(next.progress.learnedBySong[song.id], [8, 42])
  assert.equal(next.progress.corrections[`${song.id}:8:0`], 'あす')
  assert.deepEqual(next.progress.reviewItems, before.progress.reviewItems)
  assert.equal(next.aiReviews[song.id], undefined)
  assert.equal(next.sentenceExplanations[song.id], undefined)
})
