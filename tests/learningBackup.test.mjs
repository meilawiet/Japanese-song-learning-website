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
    readingStyle: 'romaji',
    readingFontSize: 16,
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
  lines: [{ id: 0, start: 1.5, text: '夢ならば', translation: '如果是梦' }],
  audioBlob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' }),
}

test('backed-up songs, audio and learning state round-trip', async () => {
  const backup = createLearningBackup([song], state)
  const inspection = await inspectLearningBackup(backup)
  const [restored] = songsFromLearningBackup(inspection)
  assert.equal(inspection.manifest.progress.corrections['local-test:0:0'], 'ゆめ')
  assert.deepEqual(inspection.manifest.progress.lyricSnapshots, state.progress.lyricSnapshots)
  assert.equal(inspection.manifest.progress.readingStyle, 'romaji')
  assert.equal(inspection.manifest.progress.readingFontSize,16)
  assert.equal(inspection.manifest.sentenceExplanations['local-test'][0].explanation.meaning, '如果是梦')
  assert.equal(restored.lines[0].translation, '如果是梦')
  assert.equal(restored.audioName, 'test.mp3')
  assert.equal(restored.audioBlob.type, 'audio/mpeg')
  assert.deepEqual([...new Uint8Array(await restored.audioBlob.arrayBuffer())], [1, 2, 3, 4])
})

test('empty song library still backs up learning data', async () => {
  const inspection = await inspectLearningBackup(createLearningBackup([], state))
  assert.deepEqual(inspection.manifest.songs, [])
  assert.deepEqual(songsFromLearningBackup(inspection), [])
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
  assert.equal(inspected.manifest.progress.readingStyle, undefined)
  assert.equal(inspected.manifest.progress.readingFontSize, undefined)
})

test('invalid lyric snapshots cannot be saved in backups', () => {
  const invalid = { ...state, progress: { ...state.progress, lyricSnapshots: { broken: { lines: 'not an array' } } } }
  assert.throws(() => createLearningBackup([], invalid), /学习记录格式不正确/)
})

test('unsupported reading styles are rejected by backup validation', () => {
  assert.throws(() => createLearningBackup([], { ...state, progress: { ...state.progress, readingStyle: 'invalid' } }), /学习记录格式不正确/)
})
