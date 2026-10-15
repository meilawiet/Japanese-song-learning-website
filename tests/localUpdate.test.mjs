import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import update from '../desktop/updateCore.cjs'
import local from '../desktop/localUpdate.cjs'

const temporaryRoot = path.join(process.cwd(), 'work', 'tmp')
await fs.mkdir(temporaryRoot, { recursive: true })
async function fixture(options = {}) {
  const root = await fs.mkdtemp(path.join(temporaryRoot, 'uta-local-update-test-'))
  const home = path.join(root, 'UTA portable'), dataDir = path.join(home, 'uta-data')
  const versionRoot = path.join(home, 'versions', '1.1.29'), target = path.join(root, 'target')
  await fs.mkdir(path.join(versionRoot, 'app'), { recursive: true }); await fs.mkdir(path.join(target, 'app'), { recursive: true })
  await fs.mkdir(dataDir)
  await fs.writeFile(path.join(versionRoot, 'app', 'main.cjs'), 'old program')
  await fs.writeFile(path.join(versionRoot, 'dictionary.db'), 'unchanged dictionary')
  await fs.writeFile(path.join(target, 'app', 'main.cjs'), 'new program')
  await fs.writeFile(path.join(target, 'dictionary.db'), 'unchanged dictionary')
  await fs.writeFile(path.join(dataDir, 'learning.json'), '{"songs":["original"],"mastered":[1,2],"api":"fake-test-key"}')
  await fs.writeFile(path.join(home, 'current.json'), '{"version":"1.1.29"}')
  await update.writeManifest(versionRoot, options.from || '1.1.29', '44.5.1')
  await update.writeManifest(target, options.to || '1.1.30', options.runtime || '44.5.1')
  const filename = path.join(root, '自己下载的 增量包.utapatch')
  await update.buildPatch(versionRoot, target, filename)
  const args = { filename, home, dataDir, versionRoot, appVersion: '1.1.29', runtimeVersion: '44.5.1' }
  return { root, target, args, cleanup: () => fs.rm(root, { recursive: true, force: true }) }
}
async function assertUnchanged(args) {
  assert.equal(await fs.readFile(path.join(args.home, 'current.json'), 'utf8'), '{"version":"1.1.29"}')
  assert.equal(await fs.readFile(path.join(args.versionRoot, 'app', 'main.cjs'), 'utf8'), 'old program')
  assert.equal(await fs.readFile(path.join(args.dataDir, 'learning.json'), 'utf8'), '{"songs":["original"],"mastered":[1,2],"api":"fake-test-key"}')
  assert.deepEqual(await fs.readdir(path.join(args.dataDir, 'updates')), [])
  assert.ok(!(await fs.readdir(path.join(args.home, 'versions'))).some(name => name.startsWith('.stage-local-') && name !== '.stage-local-preserve'))
}

test('one offline patch stages verified files without a network request, version switch, or change to user data', async () => {
  const f = await fixture()
  try {
    const states = []
    const result = await local.prepareLocalPatch({ ...f.args, progress: state => states.push(state) })
    assert.equal(result.version, '1.1.30'); assert.equal(result.source, 'local'); assert.equal(result.checksumVerified, false)
    assert.deepEqual(states.map(state => state.phase).filter((phase, index, all) => all.indexOf(phase) === index), ['importing', 'preparing-local', 'ready'])
    const next = path.join(f.args.home, 'versions', '1.1.30')
    await update.verifyVersion(next, '1.1.30', '44.5.1')
    assert.equal(await fs.readFile(path.join(next, 'app', 'main.cjs'), 'utf8'), 'new program')
    await assertUnchanged(f.args)
    // Reimporting the same verified target reuses it safely, but still checks payloads.
    assert.equal((await local.prepareLocalPatch(f.args)).ready, true)
    const bytes = await fs.readFile(f.args.filename)
    bytes[bytes.length - 5] ^= 0xff
    await fs.writeFile(f.args.filename, bytes)
    await assert.rejects(local.prepareLocalPatch(f.args))
    await update.verifyVersion(next, '1.1.30', '44.5.1')
    await assertUnchanged(f.args)
  } finally { await f.cleanup() }
})

test('offline import checks an adjacent checksum when provided and rejects a mismatch', async () => {
  const f = await fixture()
  try {
    const sidecar = f.args.filename + '.sha256'
    await fs.writeFile(sidecar, `${'0'.repeat(64)}  ${path.basename(f.args.filename)}\n`)
    await assert.rejects(local.prepareLocalPatch(f.args), /SHA-256/)
    await assertUnchanged(f.args)
    await fs.writeFile(sidecar, `${await update.hashFile(f.args.filename)}  ${path.basename(f.args.filename)}\n`)
    assert.equal((await local.prepareLocalPatch(f.args)).checksumVerified, true)
  } finally { await f.cleanup() }
})

test('offline import rejects a wrong baseline, same/older target, and incompatible runtime', async () => {
  for (const [options, message] of [[{ from: '1.1.28' }, /适用于 1.1.28/], [{ to: '1.1.29' }, /不能重复更新或降级/], [{ to: '1.1.28' }, /不能重复更新或降级/], [{ runtime: '99.0.0' }, /运行环境/]]) {
    const f = await fixture(options)
    try { await assert.rejects(local.prepareLocalPatch(f.args), message); await assertUnchanged(f.args) }
    finally { await f.cleanup() }
  }
})

test('damaged patch, changed baseline, and unsafe paths fail without deleting unrelated staging files', async () => {
  const f = await fixture()
  try {
    const preserve = path.join(f.args.home, 'versions', '.stage-local-preserve')
    await fs.mkdir(preserve); await fs.writeFile(path.join(preserve, 'keep.txt'), 'keep')
    const bytes = await fs.readFile(f.args.filename)
    await fs.writeFile(f.args.filename, bytes.subarray(0, 8))
    await assert.rejects(local.prepareLocalPatch(f.args), /格式无效/)
    await fs.writeFile(f.args.filename, bytes)
    await fs.writeFile(path.join(f.args.versionRoot, 'dictionary.db'), 'edited dictionary')
    await assert.rejects(local.prepareLocalPatch(f.args), /本机文件已改变/)
    await fs.writeFile(path.join(f.args.versionRoot, 'dictionary.db'), 'unchanged dictionary')
    const { header, bodyStart } = await update.readPatch(f.args.filename)
    header.target.files[0].path = '../uta-data/learning.json'
    const json = Buffer.from(JSON.stringify(header)), prefix = Buffer.alloc(13)
    Buffer.from('UTADELTA1').copy(prefix); prefix.writeUInt32LE(json.length, 9)
    await fs.writeFile(f.args.filename, Buffer.concat([prefix, json, bytes.subarray(bodyStart)]))
    await assert.rejects(local.prepareLocalPatch(f.args), /非法文件路径/)
    assert.equal(await fs.readFile(path.join(preserve, 'keep.txt'), 'utf8'), 'keep')
    await assertUnchanged(f.args)
  } finally { await f.cleanup() }
})

test('ZIP, checksum, relative paths, directories, and oversized declarations cannot be imported as patches', async () => {
  const f = await fixture()
  try {
    for (const filename of [f.args.filename + '.zip', f.args.filename + '.sha256', 'update.utapatch']) await assert.rejects(local.prepareLocalPatch({ ...f.args, filename }), /请选择/)
    const directory = path.join(f.root, 'folder.utapatch'); await fs.mkdir(directory)
    await assert.rejects(local.prepareLocalPatch({ ...f.args, filename: directory }), /有效文件/)
    const bytes = await fs.readFile(f.args.filename), { header, bodyStart } = await update.readPatch(f.args.filename)
    header.target.files[0].size = 2 * 1024 * 1024 * 1024
    const json = Buffer.from(JSON.stringify(header)), prefix = Buffer.alloc(13)
    Buffer.from('UTADELTA1').copy(prefix); prefix.writeUInt32LE(json.length, 9)
    await fs.writeFile(f.args.filename, Buffer.concat([prefix, json, bytes.subarray(bodyStart)]))
    await assert.rejects(local.prepareLocalPatch(f.args), /过大或过多/)
  } finally { await f.cleanup() }
})
