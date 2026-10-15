import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { RestoreSnapshotStore } from '../desktop/restoreSnapshots.cjs'
import { saveRestoreSnapshot } from '../src/lib/restoreSnapshot.js'
import { createLearningBackup, inspectLearningBackup } from '../src/lib/learningBackup.js'

const state = { progress: { learnedBySong: {}, reviewItems: [], favoriteSongIds: [], corrections: {}, meaningOverrides: {} }, annotations: {}, aiReviews: {}, sentenceExplanations: {} }
async function withStore(run) {
  const parent = path.resolve('work', 'snapshot-unit-tests')
  await fs.mkdir(parent, { recursive: true })
  const directory = await fs.mkdtemp(path.join(parent, 'run-'))
  assert.equal(path.dirname(directory), parent)
  try { await run(new RestoreSnapshotStore(directory), directory) }
  finally { await fs.rm(directory, { recursive: true, force: true }) }
}
const bridgeFor = store => ({ beginRestoreSnapshot: () => store.begin(), appendRestoreSnapshot: (id, bytes) => store.append(id, bytes), finishRestoreSnapshot: id => store.finish(id), abortRestoreSnapshot: id => store.abort(id) })
test('restore snapshot is published durably and can be restored with its exact audio and progress', async () => withStore(async store => {
  const audio = new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'audio/wav' })
  const song = { id: 'local-snapshot', title: '原创测试', artist: 'UTA', lines: [{ id: 7, text: '歌', start: 0, translation: '' }], audioBlob: audio, audioName: 'original.wav' }
  const backup = createLearningBackup([song], { ...state, progress: { ...state.progress, learnedBySong: { [song.id]: [7] } } })
  const progress = [], result = await saveRestoreSnapshot(backup, bridgeFor(store), value => progress.push(value))
  const bytes = await fs.readFile(result.path)
  assert.equal(bytes.length, backup.size)
  assert.ok(bytes.equals(Buffer.from(await backup.arrayBuffer())))
  const inspected = await inspectLearningBackup(new Blob([bytes]))
  assert.deepEqual(inspected.manifest.progress.learnedBySong[song.id], [7])
  assert.equal(progress.at(-1), 100)
  assert.ok(progress.length > 1)
}))
test('failed snapshot aborts unpublished data and does not call finish', async () => withStore(async store => {
  const bridge = bridgeFor(store)
  bridge.appendRestoreSnapshot = async () => { throw new Error('disk full') }
  let finished = false
  bridge.finishRestoreSnapshot = async () => { finished = true }
  await assert.rejects(saveRestoreSnapshot(createLearningBackup([], state), bridge), /disk full/)
  assert.equal(finished, false)
  assert.deepEqual(await fs.readdir(store.directory), [])
}))
test('retention keeps three published snapshots, the newest, and unrelated user files', async () => withStore(async store => {
  await fs.mkdir(store.directory, { recursive: true })
  const userFile = path.join(store.directory, 'my-manual-backup.uta-backup')
  await fs.writeFile(userFile, 'keep me')
  let newest
  for (let i = 0; i < 5; i++) newest = await saveRestoreSnapshot(createLearningBackup([], state), bridgeFor(store))
  assert.equal((await fs.readdir(store.directory)).length, 4)
  assert.equal(await fs.readFile(userFile, 'utf8'), 'keep me')
  assert.ok((await fs.stat(newest.path)).size > 0)
}))
test('native snapshot writer rejects arbitrary data and invalid sessions', async () => withStore(async store => {
  const { id } = await store.begin()
  await assert.rejects(store.append(id, new Uint8Array([1, 2, 3])), /无效学习快照/)
  await store.abort(id)
  await assert.rejects(store.append('../../outside', new Uint8Array([1])), /会话已结束/)
}))
