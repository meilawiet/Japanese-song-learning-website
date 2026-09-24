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
  },
  annotations: {},
  aiReviews: {},
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

test('damaged or unrelated files are rejected before restore', async () => {
  const backup = createLearningBackup([song], state)
  await assert.rejects(inspectLearningBackup(new Blob(['not a backup'])), /UTA 备份/)
  await assert.rejects(inspectLearningBackup(backup.slice(0, backup.size - 1)), /不完整/)
})
