import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { cloudAudioSong, songsFromCloudCatalog, validateCloudAudio, reuseCloudAudio, sharedProgress,
  preserveDesktopPreferences, applySharedSongSettings } from '../src/lib/cloudAudioCatalog.js'
import { createCloudBackup, inspectCloudBackup } from '../src/lib/cloudBackup.js'
import { createLearningBackup, inspectLearningBackup, songsFromLearningBackup } from '../src/lib/learningBackup.js'

// Original small fixtures. No production song, credential or user data is read.
const bytes = Uint8Array.from([1, 2, 3, 4])
const sha256 = createHash('sha256').update(bytes).digest('hex')
const audio = { name: `_uta-audio-${sha256}.bin`, sha256, size: bytes.length, type: 'audio/wav' }
const descriptor = { id: 'local-original', title: '原创🌤️练习', artist: 'UTA协议测试', audioName: 'original.wav',
  lines: [{ id: 10, start: 1.2, timestampOriginalStart: 1, text: '空へ歌う', translation: '向天空歌唱', romaji: 'sora e utau' },
    { id: 40, start: 1.2, text: '風と歩く', translation: '' }], lyricsOnly: false, audio }
const lyricsOnly = { id: 'local-lyrics', title: '原创纯歌词', artist: '', lyricsOnly: true, audio: null,
  lines: [{ id: 100, start: null, text: '今天练习唱歌', translation: '' }] }
const state = { progress: { learnedBySong: { 'local-original': [40] }, reviewItems: [{ songId: 'local-original', lineId: 10 }],
  favoriteSongIds: ['local-original'], corrections: { 'local-original:10:0': '' }, meaningOverrides: {}, readingStyle: 'none',
  songSettings: { 'local-original': { language: 'ja', readingStyle: 'both', showTranslation: false, romajiPosition: 'above' } } },
  annotations: { 'local-original': [{ id: 10, text: '空へ歌う', tokens: [{ index: 0, surface: '空', reading: 'そら', manual_reading_mode: 'literal' },
    { index: 1, surface: 'へ', reading: 'へ' }, { index: 2, surface: '歌う', reading: 'うたう' }] }] },
  aiReviews: {}, sentenceExplanations: {}, artworkOverrides: {} }
const extras = { profile: { nickname: '原创用户🌤️', japaneseLevel: 'N3' }, chats: [], recent: { learn: descriptor.id, sing: null },
  ai: { base_url: 'https://example.com/v1', model: 'original-model', rememberKey: false } }
const catalog = () => ({ version: 2, songs: structuredClone([descriptor, lyricsOnly]) })
const digest = async blob => createHash('sha256').update(new Uint8Array(await blob.arrayBuffer())).digest('hex')

test('v3 rejects malformed song settings and avatar bytes before restore', async () => {
  const invalid = structuredClone(state)
  invalid.progress.songSettings['local-original'].showTranslation = 'false'
  assert.throws(() => createLearningBackup([], invalid), /显示设置/)
  invalid.progress.songSettings['local-original'].showTranslation = false
  invalid.progress.songSettings['local-original'].timeOverrides = { 10: { text: '空へ歌う', baseStart: null, start: 4 } }
  assert.throws(() => createLearningBackup([], invalid), /显示设置/)
  const file = createCloudBackup(createLearningBackup([], state), { ...extras, catalog: catalog(), version: 3 }, new Blob(['not-a-png'], { type: 'image/png' }))
  await assert.rejects(inspectCloudBackup(file), /头像内容/)
})

test('v3 snapshot UTF-8 byte lengths preserve catalog v2, core v1, stable IDs and optional fields', async () => {
  const file = createCloudBackup(createLearningBackup([], state), { ...extras, catalog: catalog(), version: 3 })
  file.webDavOrigin = 'https://example.com/uta/'
  const inspection = await inspectCloudBackup(file)
  assert.equal(inspection.cloudCatalog, true)
  assert.equal(inspection.extras.version, 3)
  assert.equal(inspection.extras.catalog.version, 2)
  assert.equal(inspection.manifest.version, 1)
  assert.equal(inspection.audioBytes, 0)
  assert.equal(inspection.catalogSongs[0].cloudAudio.origin, file.webDavOrigin)
  assert.deepEqual(inspection.catalogSongs[0].lines, descriptor.lines)
  assert.deepEqual(inspection.manifest.progress, state.progress)
  assert.deepEqual(inspection.manifest.annotations, state.annotations)
  assert.equal(inspection.catalogSongs[1].lines[0].start, null)
  assert.equal(inspection.catalogSongs[1].lyricsOnly, true)
  assert.equal(inspection.catalogSongs[1].cloudPending, false)
})

test('empty v3 catalog remains a valid explicit empty snapshot', async () => {
  const inspection = await inspectCloudBackup(createCloudBackup(createLearningBackup([], state), {
    ...extras, version: 3, catalog: { version: 2, songs: [] },
  }))
  assert.equal(inspection.cloudCatalog, true)
  assert.deepEqual(inspection.catalogSongs, [])
})

test('old/unknown catalog or cloud versions are rejected and cannot restore as an empty library', async () => {
  const core = createLearningBackup([], state)
  for (const version of [0, 2, 4, '3']) await assert.rejects(inspectCloudBackup(createCloudBackup(core, { ...extras, version, catalog: catalog() })))
  for (const version of [1, 3, '2']) assert.throws(() => songsFromCloudCatalog({ ...catalog(), version }))
  await assert.rejects(inspectCloudBackup(createCloudBackup(core, { ...extras, version: 3 })))
  await assert.rejects(inspectCloudBackup(createCloudBackup(core, { ...extras, version: 3, catalog: { version: 2, songs: [descriptor, descriptor] } })))
})

test('v3 core cannot also include songs or embedded audio', async () => {
  const local = { ...descriptor, audioBlob: new Blob([bytes], { type: audio.type }) }
  const core = createLearningBackup([local], state)
  await assert.rejects(inspectCloudBackup(createCloudBackup(core, { ...extras, version: 3, catalog: catalog() })), /空歌曲/)
})

test('strict lengths reject truncation, trailing data and invalid UTF-8 in the cloud header', async () => {
  const file = createCloudBackup(createLearningBackup([], state), { ...extras, catalog: catalog(), version: 3 })
  await assert.rejects(inspectCloudBackup(file.slice(0, file.size - 1)))
  await assert.rejects(inspectCloudBackup(new Blob([file, new Uint8Array([0])])) )
  const corrupted = new Uint8Array(await file.arrayBuffer())
  corrupted[22] = 255
  await assert.rejects(inspectCloudBackup(new Blob([corrupted])))
})

test('audio hash/name/size/type cannot contain paths, mismatching digest or oversized files', () => {
  assert.deepEqual(validateCloudAudio(audio), audio)
  for (const change of [ { name: `../${audio.name}` }, { name: `https://example.com/${audio.name}` },
    { sha256: sha256.toUpperCase() }, { sha256: '0'.repeat(64) }, { size: 0 }, { size: 500 * 1024 * 1024 + 1 },
    { size: 1.5 }, { type: 'x'.repeat(101) } ]) assert.throws(() => validateCloudAudio({ ...audio, ...change }))
})

test('catalog preserves duplicate timestamps and rejects duplicate IDs or missing timestamps', () => {
  const [song] = songsFromCloudCatalog(catalog())
  assert.deepEqual(song.lines.map(line => line.id), [10, 40])
  assert.deepEqual(song.lines.map(line => line.start), [1.2, 1.2])
  const modified = catalog(); delete modified.songs[0].lines[0].start
  assert.throws(() => songsFromCloudCatalog(modified))
  const repeated = catalog(); repeated.songs[0].lines[1].id = 10
  assert.throws(() => songsFromCloudCatalog(repeated))
  const time = catalog(); time.songs[0].lines[0].start = -1
  assert.throws(() => songsFromCloudCatalog(time))
})

test('lyrics-only and pending-audio states are distinct and contradictory descriptors fail', () => {
  const [pending, lyric] = songsFromCloudCatalog(catalog(), 'https://example.com/uta/')
  assert.equal(pending.cloudPending, true); assert.equal(pending.lyricsOnly, false); assert.equal(pending.audioBlob, null)
  assert.equal(lyric.cloudPending, false); assert.equal(lyric.lyricsOnly, true); assert.equal(lyric.audioBlob, null)
  for (const song of [{ ...descriptor, lyricsOnly: true }, { ...lyricsOnly, lyricsOnly: false }]) {
    assert.throws(() => songsFromCloudCatalog({ version: 2, songs: [song] }))
  }
})

test('audio reuse checks actual complete digest and reuses bytes without old metadata', async () => {
  const records = songsFromCloudCatalog(catalog(), 'https://example.com/uta/')
  const blob = new Blob([bytes], { type: audio.type })
  const result = await reuseCloudAudio(records, [{ ...descriptor, title: '旧歌名', lines: [{ id: 10, text: '旧原文' }], audioBlob: blob }], digest)
  assert.equal(result[0].audioBlob, blob)
  assert.equal(result[0].cloudPending, false)
  assert.equal(result[0].title, descriptor.title)
  assert.deepEqual(result[0].lines, descriptor.lines)
  const different = await reuseCloudAudio(records, [{ ...descriptor, audioBlob: new Blob([Uint8Array.from([4, 3, 2, 1])]) }], digest)
  assert.equal(different[0].cloudPending, true)
  const differentId = await reuseCloudAudio(records, [{ ...descriptor, id: 'local-other', audioBlob: blob }], digest)
  assert.equal(differentId[0].cloudPending, true)
})

test('cancelled audio reuse returns no partial result', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(reuseCloudAudio(songsFromCloudCatalog(catalog()), [], digest, controller.signal), { name: 'AbortError' })
})

test('catalog serialization excludes machine-only state, retains source readings and line extensions', () => {
  const source = { ...descriptor, audioBlob: new Blob([bytes]), cloudPending: false, cloudAudio: { ...audio, origin: 'https://example.com/uta/' },
    isLocal: true, lines: [{ ...descriptor.lines[0], sourceReadings: [{ start: 0, end: 1, reading: 'そら' }], customLineFlag: true }] }
  const result = cloudAudioSong(source, audio)
  for (const key of ['audioBlob', 'cloudPending', 'cloudAudio', 'isLocal']) assert.equal(Object.hasOwn(result, key), false)
  assert.deepEqual(result.lines, source.lines)
  assert.equal(result.audioName, descriptor.audioName)
  assert.deepEqual(result.audio, audio)
})

test('shared progress excludes desktop preferences while restore preserves device settings', () => {
  const local = { ...state.progress, desktopTheme: 'crimson-blade', desktopFont: 'source-han-light', singleLineRepeatCount: 5,
    lyricFontSize: 32, hiddenReadings: { 'local-original:10:1': true }, rangePracticeSettings: { mode: 'repeat', repeatCount: 3, gapSeconds: 2 } }
  const remote = { ...state.progress, playbackRate: 0.5, desktopTheme: 'invalid-on-mobile' }
  const shared = sharedProgress(local)
  assert.deepEqual(shared.songSettings, state.progress.songSettings)
  for (const key of ['desktopTheme', 'desktopFont', 'singleLineRepeatCount', 'lyricFontSize', 'hiddenReadings', 'rangePracticeSettings']) assert.equal(Object.hasOwn(shared, key), false)
  const restored = preserveDesktopPreferences(remote, local)
  assert.equal(restored.desktopTheme, local.desktopTheme)
  assert.equal(restored.singleLineRepeatCount, 5)
  assert.equal(restored.playbackRate, 0.5)
  assert.deepEqual(restored.songSettings, state.progress.songSettings)
})

test('time overrides apply absolute time only on matching ID, text and base, preserve first original time', () => {
  const song = { ...descriptor, lines: [descriptor.lines[0]] }
  const settings = { language: 'ja', timeOverrides: { 10: { text: song.lines[0].text, baseStart: 1.2, start: 3 } } }
  const result = applySharedSongSettings(song, settings)
  assert.equal(result.lines[0].start, 3)
  assert.equal(result.lines[0].timestampOriginalStart, 1)
  assert.equal(applySharedSongSettings(result, settings).lines[0].start, 3)
  for (const bad of [{ text: '不同原文', baseStart: 1.2, start: 3 }, { text: song.lines[0].text, baseStart: 0, start: 3 }]) {
    assert.equal(applySharedSongSettings(song, { timeOverrides: { 10: bad } }).lines[0].start, 1.2)
  }
})

test('local backup v2 round-trips lyric-only and pending records without inventing audio or zero timestamps', async () => {
  const records = songsFromCloudCatalog(catalog(), 'https://example.com/uta/')
  const inspection = await inspectLearningBackup(createLearningBackup(records, state))
  assert.equal(inspection.manifest.version, 2)
  const restored = songsFromLearningBackup(inspection)
  assert.equal(restored[0].audioBlob, null)
  assert.deepEqual(restored[0].cloudAudio, records[0].cloudAudio)
  assert.equal(restored[1].lines[0].start, null)
  assert.equal(restored[1].lyricsOnly, true)
  assert.deepEqual(inspection.manifest.progress.songSettings, state.progress.songSettings)
})
