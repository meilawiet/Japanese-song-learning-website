import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { DesktopWebDav, validateWebDav, cloudFilename, CHUNK } = require('../desktop/webDav.cjs')
const work = path.resolve('work')
const testRoot = path.join(work, `desktop-webdav-tests-${process.pid}-${Date.now()}`)
assert.equal(path.dirname(testRoot), work)
const settings = { url: 'https://webdav-unit.invalid/dav/', username: 'unit-user', password: 'unit-app-password' }
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const audioRef = bytes => ({ name: `_uta-audio-${digest(bytes)}.bin`, sha256: digest(bytes), size: bytes.length, type: 'audio/wav' })
// Test encryption deliberately does not emulate Windows DPAPI; production safeStorage is
// exercised by the isolated EXE checks. This verifies separation and round-trip plumbing.
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from(value).map(byte => byte ^ 0x5a),
  decryptString: value => Buffer.from(value).map(byte => byte ^ 0x5a).toString('utf8'),
}

await fs.mkdir(testRoot, { recursive: true })
let number = 0
async function fixture(handler = (_request, response) => { response.writeHead(207); response.end('<d:multistatus xmlns:d="DAV:"/>') }) {
  const folder = path.join(testRoot, String(++number))
  await fs.mkdir(folder)
  const requests = [], progress = []
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, path: request.url, headers: request.headers })
    Promise.resolve(handler(request, response)).catch(error => { response.destroy(error) })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const native = new DesktopWebDav({ dataDir: folder, safeStorage, progress: value => progress.push(value), request: (url, options, callback) => {
    assert.equal(url.protocol, 'https:')
    assert.equal(url.hostname, 'webdav-unit.invalid')
    return http.request({ hostname: '127.0.0.1', port: server.address().port, path: url.pathname, ...options }, callback)
  } })
  await native.initialize()
  return { native, requests, progress, folder, close: async () => {
    await native.cancel()
    for (const id of [...native.sessions.keys()]) await native.release({ id })
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  } }
}

async function stage(native, bytes) {
  const { id } = await native.invoke('begin')
  for (let offset = 0; offset < bytes.length; offset += CHUNK) await native.invoke('append', { id, bytes: new Uint8Array(bytes.subarray(offset, offset + CHUNK)) })
  return id
}

test('WebDAV permits only HTTPS directories and whitelisted basenames', () => {
  assert.equal(validateWebDav({ ...settings, url: 'https://webdav-unit.invalid/dav///' }).url, settings.url)
  for (const url of ['http://webdav-unit.invalid/', 'file:///E:/secret', 'https://u:p@webdav-unit.invalid/', 'https://webdav-unit.invalid/?key=secret', 'https://webdav-unit.invalid/#secret', 'not a URL']) {
    assert.throws(() => validateWebDav({ ...settings, url }))
  }
  for (const value of [{ ...settings, username: '' }, { ...settings, password: '' }, { ...settings, password: 'x'.repeat(4097) }]) assert.throws(() => validateWebDav(value))
  assert.equal(cloudFilename(`_uta-audio-${'a'.repeat(64)}.bin`), `_uta-audio-${'a'.repeat(64)}.bin`)
  assert.equal(cloudFilename('UTA-2026-10-27T00-00-00-000Z-unit.uta-backup'), 'UTA-2026-10-27T00-00-00-000Z-unit.uta-backup')
  for (const name of ['../UTA-unit.uta-backup', 'folder/UTA-unit.uta-backup', 'UTA-unit.uta-backup?x=1', 'https://other.invalid/UTA-a.uta-backup', '_uta-audio-ABC.bin', 'UTA-a.uta-backup.exe']) assert.throws(() => cloudFilename(name))
})

test('WebDAV settings store the application password separately and reject unavailable encryption', async () => {
  const f = await fixture()
  try {
    const aiCredential = path.join(f.folder, 'ai-credential.bin')
    await fs.writeFile(aiCredential, 'independent AI key slot')
    assert.deepEqual(await f.native.invoke('load'), { url: '', username: '', password: '' })
    await f.native.invoke('save', settings)
    assert.deepEqual(await f.native.invoke('load'), settings)
    const config = await fs.readFile(f.native.settingsFile, 'utf8'), secret = await fs.readFile(f.native.secretFile)
    assert.equal(config.includes(settings.password), false)
    assert.equal(secret.includes(Buffer.from(settings.password)), false)
    f.native.safeStorage = { ...safeStorage, isEncryptionAvailable: () => false }
    await assert.rejects(f.native.invoke('save', settings), /加密存储/)
    f.native.safeStorage = safeStorage
    await f.native.invoke('clear')
    assert.deepEqual(await f.native.invoke('load'), { url: '', username: '', password: '' })
    assert.equal(await fs.readFile(aiCredential, 'utf8'), 'independent AI key slot')
    assert.equal(f.requests.length, 0)
  } finally { await f.close() }
})

test('staging enforces chunk bounds, seals once, hashes original bytes and reads exact chunks', async () => {
  const f = await fixture(), bytes = randomBytes(CHUNK * 2 + 41)
  try {
    const id = await stage(f.native, bytes)
    await assert.rejects(f.native.invoke('append', { id, bytes: new Uint8Array(CHUNK + 1) }), /分块/)
    await assert.rejects(f.native.invoke('append', { id, bytes: 'unsafe-string' }), /数据/)
    const result = await f.native.invoke('digest', { id })
    assert.deepEqual(result, { sha256: digest(bytes), size: bytes.length })
    await assert.rejects(f.native.invoke('append', { id, bytes: new Uint8Array([1]) }), /数据/)
    const read = []
    for (let offset = 0; offset < bytes.length; offset += CHUNK) read.push(Buffer.from(await f.native.invoke('read', { id, offset })))
    assert.deepEqual(Buffer.concat(read), bytes)
    for (const offset of [-1, 0.5, bytes.length]) await assert.rejects(f.native.invoke('read', { id, offset }), /读取位置/)
    await f.native.invoke('release', { id }); await f.native.invoke('release', { id })
    assert.equal(f.native.sessions.size, 0)
    assert.deepEqual(await fs.readdir(f.native.tempDirectory), [])
  } finally { await f.close() }
})

test('native upload streams raw bytes with Basic auth and a create-only condition', async () => {
  const bytes = randomBytes(CHUNK + 97), ref = audioRef(bytes)
  let uploaded
  const f = await fixture(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    uploaded = Buffer.concat(chunks); response.writeHead(201); response.end()
  })
  try {
    const id = await stage(f.native, bytes)
    assert.deepEqual(await f.native.invoke('upload', { config: settings, id, name: ref.name }), { size: bytes.length })
    assert.deepEqual(uploaded, bytes)
    assert.equal(f.requests[0].method, 'PUT')
    assert.equal(f.requests[0].path, '/dav/' + ref.name)
    assert.equal(f.requests[0].headers['if-none-match'], '*')
    assert.equal(f.requests[0].headers.authorization, 'Basic ' + Buffer.from(`${settings.username}:${settings.password}`).toString('base64'))
    assert.equal(Number(f.requests[0].headers['content-length']), bytes.length)
    assert.equal(f.progress.at(-1).phase, 'confirmed')
    await assert.rejects(f.native.invoke('upload', { config: settings, id, name: `_uta-audio-${'0'.repeat(64)}.bin` }), /摘要不符/)
    assert.equal(f.requests.length, 1)
  } finally { await f.close() }
})

test('download validates size and whole-file SHA256 before exposing a temp session', async () => {
  const bytes = randomBytes(CHUNK + 123), ref = audioRef(bytes)
  const f = await fixture((_request, response) => { response.writeHead(200); response.end(bytes) })
  try {
    const downloaded = await f.native.invoke('download', { config: settings, name: ref.name, expected: ref })
    assert.equal(downloaded.size, bytes.length); assert.equal(downloaded.sha256, ref.sha256)
    assert.deepEqual(Buffer.concat([Buffer.from(await f.native.invoke('read', { id: downloaded.id, offset: 0 })), Buffer.from(await f.native.invoke('read', { id: downloaded.id, offset: CHUNK }))]), bytes)
    await f.native.invoke('release', { id: downloaded.id })
    const corrupted = { ...ref, sha256: '0'.repeat(64) }
    await assert.rejects(f.native.invoke('download', { config: settings, name: ref.name, expected: corrupted }), /校验失败/)
    await assert.rejects(f.native.invoke('download', { config: settings, name: ref.name, expected: { ...ref, size: bytes.length + 1 } }), /校验失败/)
    await assert.rejects(f.native.invoke('download', { config: settings, name: ref.name, expected: { ...ref, size: bytes.length - 1 } }), /超过声明大小/)
    assert.equal(f.native.sessions.size, 0)
    assert.deepEqual(await fs.readdir(f.native.tempDirectory), [])
  } finally { await f.close() }
})

test('directory creation and file inspection use PROPFIND depths, never HEAD or DELETE', async () => {
  let missing = true
  const f = await fixture((request, response) => {
    if (request.method === 'MKCOL') { missing = false; response.writeHead(201); response.end(); return }
    if (missing || request.url.endsWith('UTA-missing.uta-backup')) { response.writeHead(404); response.end(); return }
    response.writeHead(207); response.end('<d:multistatus xmlns:d="DAV:"/>')
  })
  try {
    await f.native.invoke('directory', { config: settings, create: true })
    assert.deepEqual(f.requests.slice(0, 3).map(request => request.method), ['PROPFIND', 'MKCOL', 'PROPFIND'])
    assert.equal(f.requests[0].headers.depth, '1')
    assert.equal((await f.native.invoke('stat', { config: settings, name: 'UTA-present.uta-backup' })).exists, true)
    assert.equal(f.requests.at(-1).headers.depth, '0')
    assert.deepEqual(await f.native.invoke('stat', { config: settings, name: 'UTA-missing.uta-backup' }), { exists: false })
    await assert.rejects(f.native.invoke('delete', { config: settings, name: 'UTA-present.uta-backup' }), /不支持/)
    assert.equal(f.requests.some(request => ['HEAD', 'DELETE'].includes(request.method)), false)
  } finally { await f.close() }
})

test('HTTP auth, create-only conflict and redirects are errors and never followed', async () => {
  let code = 401
  const f = await fixture((_request, response) => { response.writeHead(code, code === 302 ? { Location: 'https://should-not-contact.invalid/' } : {}); response.end('unit failure') })
  try {
    await assert.rejects(f.native.invoke('directory', { config: settings }), /HTTP 401.*应用密码/)
    const id = await stage(f.native, Buffer.from('original unit bytes'))
    code = 412
    await assert.rejects(f.native.invoke('upload', { config: settings, id, name: 'UTA-existing.uta-backup' }), /HTTP 412.*重试/)
    code = 302
    await assert.rejects(f.native.invoke('directory', { config: settings }), /重定向/)
    assert.equal(f.requests.length, 3)
    assert.equal(f.requests.every(request => request.path.startsWith('/dav/')), true)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(f.native.requests.size, 0, 'completed and redirected requests must leave the active set')
  } finally { await f.close() }
})

test('cancelling an active download releases the failed file and permits retry', async () => {
  let hanging = true, begun
  const started = new Promise(resolve => { begun = resolve })
  const f = await fixture((_request, response) => {
    if (hanging) { response.writeHead(200); response.write('partial'); begun(); return }
    response.writeHead(200); response.end('complete')
  })
  try {
    const download = f.native.invoke('download', { config: settings, name: 'UTA-slow.uta-backup' })
    const rejection = assert.rejects(download)
    await started
    await assert.rejects(f.native.invoke('directory', { config: settings }), /正在进行/)
    await f.native.invoke('cancel')
    await rejection
    assert.equal(f.native.sessions.size, 0)
    assert.deepEqual(await fs.readdir(f.native.tempDirectory), [])
    hanging = false
    const retry = await f.native.invoke('download', { config: settings, name: 'UTA-retry.uta-backup' })
    assert.equal(retry.size, 8)
    await f.native.invoke('release', { id: retry.id })
  } finally { await f.close() }
})

test('oversize XML is rejected and only current-task staging files are cleaned', async () => {
  const f = await fixture((_request, response) => { response.writeHead(207); response.end('x'.repeat(2 * 1024 * 1024 + 1)) })
  try {
    await assert.rejects(f.native.invoke('directory', { config: settings }), /响应过大/)
    const keep = path.join(f.native.tempDirectory, 'keep-user-note.txt'), stale = path.join(f.native.tempDirectory, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.part')
    await fs.writeFile(keep, 'keep'); await fs.writeFile(stale, 'temporary')
    await f.native.initialize()
    assert.equal(await fs.readFile(keep, 'utf8'), 'keep')
    await assert.rejects(fs.access(stale), { code: 'ENOENT' })
  } finally { await f.close() }
})

test('staging limits active handles and empty downloads do not leave files behind', async () => {
  const f = await fixture((_request, response) => { response.writeHead(200); response.end() })
  try {
    const handles = []
    for (let index = 0; index < 4; index++) handles.push((await f.native.invoke('begin')).id)
    await assert.rejects(f.native.invoke('begin'), /暂存文件过多/)
    const raw = new Uint8Array([5, 6, 7]).buffer
    await f.native.invoke('append', { id: handles[0], bytes: raw })
    assert.equal((await f.native.invoke('digest', { id: handles[0] })).sha256, digest(Buffer.from(raw)))
    for (const id of handles) await f.native.invoke('release', { id })
    await assert.rejects(f.native.invoke('download', { config: settings, name: 'UTA-empty.uta-backup' }), /校验失败/)
    assert.equal(f.native.sessions.size, 0)
    assert.deepEqual(await fs.readdir(f.native.tempDirectory), [])
  } finally { await f.close() }
})

test('recovery journal requires a durable owned snapshot and blocks a second unfinished restore', async () => {
  const f = await fixture()
  const name = 'UTA-before-restore-2026-10-27T00-00-00-000Z-0123456789abcdef.uta-backup'
  try {
    assert.equal(await f.native.invoke('recoveryStatus'), null)
    await assert.rejects(f.native.invoke('restoreBegin', { name: '../' + name }), /名称无效/)
    await assert.rejects(f.native.invoke('restoreBegin', { name }), { code: 'ENOENT' })
    await fs.mkdir(f.native.snapshotDirectory, { recursive: true })
    const snapshot = path.join(f.native.snapshotDirectory, name)
    await fs.writeFile(snapshot, 'UTA-LEARNING-BACKUP\nunit durable snapshot')
    const ai = { base_url: 'https://example.invalid/v1', model: 'original', api_key: 'synthetic-recovery-key', rememberKey: true }
    await f.native.invoke('restoreBegin', { name, ai })
    assert.deepEqual(await f.native.invoke('loadRecoveryAi'), ai)
    assert.ok(!(await fs.readFile(f.native.recoveryFile, 'utf8')).includes(ai.api_key))
    assert.deepEqual(await f.native.invoke('recoveryStatus'), { name, path: snapshot })
    await assert.rejects(f.native.invoke('restoreBegin', { name }), /上次恢复未完成/)
    const reopened = new DesktopWebDav({ dataDir: f.folder, safeStorage })
    assert.deepEqual(await reopened.invoke('recoveryStatus'), { name, path: snapshot })
    assert.deepEqual(await reopened.invoke('loadRecoveryAi'), ai)
    await reopened.invoke('restoreFinish')
    assert.equal(await f.native.invoke('recoveryStatus'), null)
    await assert.rejects(fs.access(f.native.recoveryFile), { code: 'ENOENT' })
    assert.equal(await fs.readFile(snapshot, 'utf8'), 'UTA-LEARNING-BACKUP\nunit durable snapshot')
    assert.equal(f.requests.length, 0)
  } finally { await f.close() }
})

test('unreadable recovery journal is explicit and does not get silently discarded', async () => {
  const f = await fixture()
  try {
    await fs.writeFile(f.native.recoveryFile, '{broken')
    await assert.rejects(f.native.invoke('recoveryStatus'), /恢复日志无法读取/)
    await assert.rejects(f.native.invoke('restoreBegin', { name: 'UTA-before-restore-2026-10-27T00-00-00-000Z-0123456789abcdef.uta-backup' }), /恢复日志无法读取/)
    assert.equal(await fs.readFile(f.native.recoveryFile, 'utf8'), '{broken')
  } finally { await f.close() }
})
