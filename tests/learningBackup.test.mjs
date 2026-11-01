import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLearningBackup, inspectLearningBackup, songsFromLearningBackup } from '../src/lib/learningBackup.js'

const state = {
  progress: {
    learnedBySong: { 'local-test': [0] },
    reviewItems: [],
    favoriteSongIds: ['local-test'],
    corrections: { 'local-test:0:0': 'ゆめ' },
    meaningOverrides: {},
    playbackRate: 0.75,
    rangePracticeSettings: { mode:'repeat', repeatCount:3, gapSeconds:2 },
    singleLineRepeatCount: 4,
    readingStyle: 'romaji',
    lyricFontSize: 28,
    desktopTheme: 'crimson-blade',
    desktopFont: 'source-han-light',
    readingFontSize: 16,
    lineReadingFontSize: 20,
    translationFontSize: 18,
    lyricSnapshots: { 'local-test': { sourceFile: 'test.lrc', lines: [{ id: 0, text: '夢ならば' }] } },
  },
  annotations: {},
  aiReviews: {},
  sentenceExplanations: {
    'local-test': {
      0: { text: '夢ならば', explanation: { meaning: '如果是梦', grammar: [], vocabulary: [], pronunciation_tip: '' } },
    },
  },
}

const song = {
  id: 'local-test', isLocal: true, title: 'テスト', artist: '歌手',
  sourceFile: 'test.lrc', audioName: 'test.mp3',
  lines: [{ id: 0, start: 1.5, text: '夢ならば', translation: '如果是梦', romaji: 'yume naraba' }],
  audioBlob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' }),
}

test('backed-up songs, audio and learning state round-trip', async () => {
  const backup = createLearningBackup([song], state)
  const inspection = await inspectLearningBackup(backup)
  const [restored] = songsFromLearningBackup(inspection)
  assert.equal(inspection.manifest.progress.corrections['local-test:0:0'], 'ゆめ')
  assert.deepEqual(inspection.manifest.progress.lyricSnapshots, state.progress.lyricSnapshots)
  assert.equal(inspection.manifest.progress.readingStyle, 'romaji')
  assert.equal(inspection.manifest.progress.lyricFontSize,28)
  assert.equal(inspection.manifest.progress.desktopTheme,'crimson-blade')
  assert.equal(inspection.manifest.progress.desktopFont,'source-han-light')
  assert.equal(inspection.manifest.progress.readingFontSize,16)
  assert.equal(inspection.manifest.progress.lineReadingFontSize,20)
  assert.equal(inspection.manifest.progress.translationFontSize,18)
  assert.deepEqual(inspection.manifest.progress.rangePracticeSettings,state.progress.rangePracticeSettings)
  assert.equal(inspection.manifest.progress.singleLineRepeatCount, 4)
  assert.equal(inspection.manifest.sentenceExplanations['local-test'][0].explanation.meaning, '如果是梦')
  assert.equal(restored.lines[0].translation, '如果是梦')
  assert.equal(restored.lines[0].romaji, 'yume naraba')
  assert.equal(restored.audioName, 'test.mp3')
  assert.equal(restored.audioBlob.type, 'audio/mpeg')
  assert.deepEqual([...new Uint8Array(await restored.audioBlob.arrayBuffer())], [1, 2, 3, 4])
})

test('imported source kana survives backup while malformed spans are rejected', async () => {
  const annotated = { ...song, lines: [{ ...song.lines[0], sourceReadings: [{ start: 0, end: 1, reading: 'ゆめ' }] }] }
  const restored = songsFromLearningBackup(await inspectLearningBackup(createLearningBackup([annotated], state)))
  assert.deepEqual(restored[0].lines[0].sourceReadings, annotated.lines[0].sourceReadings)
  const invalid = { ...annotated, lines: [{ ...annotated.lines[0], sourceReadings: [{ start: 0, end: 1000, reading: 'ゆめ' }] }] }
  assert.throws(() => createLearningBackup([invalid], state), /歌词格式/)
})

test('empty song library still backs up learning data', async () => {
  const inspection = await inspectLearningBackup(createLearningBackup([], state))
  assert.deepEqual(inspection.manifest.songs, [])
  assert.deepEqual(songsFromLearningBackup(inspection), [])
})

test('single-line loop settings are optional for old backups and reject invalid saved counts', async () => {
  const legacy = { ...state, progress: { ...state.progress } }
  delete legacy.progress.singleLineRepeatCount
  assert.equal((await inspectLearningBackup(createLearningBackup([song], legacy))).manifest.progress.singleLineRepeatCount, undefined)
  for (const singleLineRepeatCount of [1, 99, 'infinite']) {
    const next = { ...state, progress: { ...state.progress, singleLineRepeatCount } }
    assert.equal((await inspectLearningBackup(createLearningBackup([song], next))).manifest.progress.singleLineRepeatCount, singleLineRepeatCount)
  }
  for (const singleLineRepeatCount of [0, 100, -1, 1.5, '3']) {
    assert.throws(() => createLearningBackup([song], { ...state, progress: { ...state.progress, singleLineRepeatCount } }), /学习记录格式/)
  }
})
test('combined readings and hidden words survive a backup without changing old backups', async () => {
  const next = { ...state, progress: { ...state.progress, readingStyle: 'both', hiddenReadings: { 'local-test:0:0': true }, lyricEditsBySong: { demo: { 0: { text: '明日', translation: '明天', start: 1.25 } } } } }
  const inspected = await inspectLearningBackup(createLearningBackup([song], next))
  assert.equal(inspected.manifest.progress.readingStyle, 'both')
  assert.equal(inspected.manifest.progress.hiddenReadings['local-test:0:0'], true)
  assert.equal(inspected.manifest.progress.lyricEditsBySong.demo[0].start, 1.25)
})

test('uploaded covers and built-in song choices survive backup and restore', async () => {
  // 上传图片压缩后作为 data URL 保存；备份和电脑传歌都应保留用户选择。
  const artworkUrl = 'data:image/jpeg;base64,/9j/2Q=='
  const withArtwork = { ...song, artworkUrl, artworkProvider: '本地上传', artworkChoice: 'selected' }
  const withOverrides = { ...state, artworkOverrides: { 'demo-song': { artworkUrl, artworkProvider: '本地上传' } } }
  const inspected = await inspectLearningBackup(createLearningBackup([withArtwork], withOverrides))
  assert.equal(songsFromLearningBackup(inspected)[0].artworkUrl, artworkUrl)
  assert.equal(inspected.manifest.artworkOverrides['demo-song'].artworkUrl, artworkUrl)
})

test('damaged or unrelated files are rejected before restore', async () => {
  const backup = createLearningBackup([song], state)
  await assert.rejects(inspectLearningBackup(new Blob(['not a backup'])), /UTA 备份/)
  await assert.rejects(inspectLearningBackup(backup.slice(0, backup.size - 1)), /不完整/)
})

test('backups created before whole-line analysis remain restorable', async () => {
  const backup = createLearningBackup([song], state)
  const signatureLength = new TextEncoder().encode('UTA-LEARNING-BACKUP\n').byteLength
  const headerSize = signatureLength + 4
  const lengthBytes = await backup.slice(signatureLength, headerSize).arrayBuffer()
  const metadataLength = new DataView(lengthBytes).getUint32(0, true)
  const manifest = JSON.parse(await backup.slice(headerSize, headerSize + metadataLength).text())
  delete manifest.sentenceExplanations
  delete manifest.progress.lyricSnapshots
  delete manifest.progress.readingFontSize
  delete manifest.progress.lineReadingFontSize
  delete manifest.progress.translationFontSize
  delete manifest.progress.rangePracticeSettings
  delete manifest.progress.lyricFontSize
  delete manifest.progress.desktopTheme
  delete manifest.progress.desktopFont
  delete manifest.progress.readingStyle
  const metadata = new TextEncoder().encode(JSON.stringify(manifest))
  const nextLength = new Uint8Array(4)
  new DataView(nextLength.buffer).setUint32(0, metadata.byteLength, true)
  const legacy = new Blob([
    backup.slice(0, signatureLength), nextLength, metadata,
    backup.slice(headerSize + metadataLength),
  ])
  const inspected = await inspectLearningBackup(legacy)
  assert.deepEqual(inspected.manifest.sentenceExplanations, {})
  assert.equal(inspected.manifest.progress.lyricSnapshots, undefined)
  assert.equal(inspected.manifest.progress.lyricFontSize, undefined)
  assert.equal(inspected.manifest.progress.desktopTheme, undefined)
  assert.equal(inspected.manifest.progress.desktopFont, undefined)
  assert.equal(inspected.manifest.progress.readingStyle, undefined)
  assert.equal(inspected.manifest.progress.readingFontSize, undefined)
  assert.equal(inspected.manifest.progress.lineReadingFontSize, undefined)
  assert.equal(inspected.manifest.progress.translationFontSize, undefined)
  assert.equal(inspected.manifest.progress.rangePracticeSettings, undefined)
})

test('invalid lyric snapshots cannot be saved in backups', () => {
  const invalid = { ...state, progress: { ...state.progress, lyricSnapshots: { broken: { lines: 'not an array' } } } }
  assert.throws(() => createLearningBackup([], invalid), /学习记录格式不正确/)
})

test('unknown desktop font identifiers are rejected before restoring learning data', () => {
  const invalid = { ...state, progress: { ...state.progress, desktopFont: 'untrusted-font' } }
  assert.throws(() => createLearningBackup([], invalid), /学习记录格式不正确/)
})

test('unsupported reading styles are rejected by backup validation', () => {
  assert.throws(() => createLearningBackup([], { ...state, progress: { ...state.progress, readingStyle: 'invalid' } }), /学习记录格式不正确/)
})

test('invalid translation sizes cannot enter a backup', () => {
  for (const translationFontSize of [9, 25, 12.5, '18', NaN]) {
    assert.throws(() => createLearningBackup([], { ...state, progress: { ...state.progress, translationFontSize } }), /学习记录格式不正确/)
  }
})

test('range practice preferences round-trip and reject an unsafe loop configuration', async () => {
  const preferences = { mode:'recall', repeatCount:'infinite', gapSeconds:3 }
  const inspected = await inspectLearningBackup(createLearningBackup([], { ...state, progress:{ ...state.progress, rangePracticeSettings:preferences } }))
  assert.deepEqual(inspected.manifest.progress.rangePracticeSettings, preferences)
  for (const rangePracticeSettings of [{ mode:'repeat', repeatCount:-1, gapSeconds:2 }, { mode:'repeat', repeatCount:3, gapSeconds:0 }, []]) {
    assert.throws(() => createLearningBackup([], { ...state, progress:{ ...state.progress, rangePracticeSettings } }), /学习记录格式不正确/)
  }
})

test('old fast playback preferences migrate to normal speed without mutating the source state', async () => {
  for (const rate of [1.25, 1.5]) {
    const old = { ...state, progress: { ...state.progress, playbackRate: rate } }
    const inspected = await inspectLearningBackup(createLearningBackup([song], old))
    assert.equal(inspected.manifest.progress.playbackRate, 1)
    assert.equal(old.progress.playbackRate, rate)
  }
  for (const rate of [0.25, 0.5, 0.75, 1]) {
    const inspected = await inspectLearningBackup(createLearningBackup([song], { ...state, progress: { ...state.progress, playbackRate: rate } }))
    assert.equal(inspected.manifest.progress.playbackRate, rate)
  }
  assert.throws(() => createLearningBackup([], { ...state, progress: { ...state.progress, playbackRate: 3 } }), /学习记录格式不正确/)
})

test('optional manual sentence ends round-trip through backup and invalid intervals are rejected', async () => {
  const timed = { ...song, lines: [{ ...song.lines[0], end: 3.8 }] }
  const restored = songsFromLearningBackup(await inspectLearningBackup(createLearningBackup([timed], state)))
  assert.equal(restored[0].lines[0].end, 3.8)
  for (const end of [1.5, -1, '3.8', Infinity]) assert.throws(() => createLearningBackup([{ ...timed, lines: [{ ...timed.lines[0], end }] }], state), /歌词格式/)
  const overrides = structuredClone(state)
  overrides.progress.lyricEditsBySong = { project: { 0: { text: '夢ならば', translation: '', start: 1.5, end: 3.8 } } }
  const inspected = await inspectLearningBackup(createLearningBackup([timed], overrides))
  assert.equal(inspected.manifest.progress.lyricEditsBySong.project[0].end, 3.8)
  overrides.progress.lyricEditsBySong.project[0].end = 1
  assert.throws(() => createLearningBackup([timed], overrides), /学习记录格式/)
})
