import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { _electron as electron } from 'playwright'
import { createLearningBackup } from '../src/lib/learningBackup.js'
import { createCloudBackup, inspectCloudBackup } from '../src/lib/cloudBackup.js'

const root = process.cwd(), home = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'work', 'cross-platform-candidate-20261027')
assert.equal(path.dirname(home), path.join(root, 'work'))
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version
const sample = path.join(root, 'work', 'cross-platform-audit-20261019', 'UTA-跨端数据协议-2026-10-19', 'examples')
const evidence = path.join(root, 'work', 'verification')
await fs.mkdir(evidence, { recursive: true })
const names = await fs.readdir(sample)
const sampleName = names.find(name => name.endsWith('.uta-backup'))
const sampleBytes = await fs.readFile(path.join(sample, sampleName))
const header = JSON.parse(await fs.readFile(path.join(sample, 'cloud-header.json'), 'utf8'))
const audioName = header.catalog.songs[0].audio.name
const audioBytes = await fs.readFile(path.join(sample, audioName))
const files = new Map([[sampleName, sampleBytes], [audioName, audioBytes]])
const requests = [], failures = [], passed = []
let client, page, corruptAudio = false
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
function xmlEntry(name, body) {
  return `<d:response><d:href>/uta/${name}</d:href><d:propstat><d:prop><d:getcontentlength>${body.length}</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
}
const mock = createServer(async (request, response) => {
  requests.push({ method: request.method, url: request.url })
  if (request.headers.authorization !== 'Basic ' + Buffer.from('mock-user:mock-password').toString('base64')) { response.writeHead(401); response.end(); return }
  const name = decodeURIComponent(request.url.slice('/uta/'.length))
  if (request.method === 'PROPFIND') {
    if (name && !files.has(name)) { response.writeHead(404); response.end(); return }
    const entries = name ? [[name, files.get(name)]] : [...files]
    response.writeHead(207, { 'content-type': 'application/xml' })
    response.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${entries.map(([key, body]) => xmlEntry(key, body)).join('')}</d:multistatus>`)
  } else if (request.method === 'PUT') {
    if (files.has(name)) { response.writeHead(412); response.end(); return }
    assert.equal(request.headers['if-none-match'], '*')
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    files.set(name, Buffer.concat(chunks)); response.writeHead(201); response.end()
  } else if (request.method === 'GET') {
    if (!files.has(name)) { response.writeHead(404); response.end(); return }
    const body = Buffer.from(files.get(name))
    if (corruptAudio && name === audioName) body[body.length - 1] ^= 1
    response.writeHead(200, { 'content-length': body.length }); response.end(body)
  } else { response.writeHead(405); response.end() }
})
mock.listen(0, '127.0.0.1'); await once(mock, 'listening')
const origin = `http://127.0.0.1:${mock.address().port}`
const config = { url: 'https://cross-platform.invalid/uta/', username: 'mock-user', password: 'mock-password' }
const env = { ...process.env, TEMP: path.join(home, 'uta-data', 'tmp'), TMP: path.join(home, 'uta-data', 'tmp') }
delete env.ELECTRON_RUN_AS_NODE
await fs.mkdir(env.TEMP, { recursive: true })

async function launch() {
  client = await electron.launch({ executablePath: path.join(home, 'UTA.exe'), env, timeout: 90000 })
  page = await client.firstWindow({ timeout: 90000 })
  page.on('pageerror', error => failures.push(error.message))
  await page.waitForSelector('.desktop-shell', { timeout: 60000 })
  // Inject transport only inside this isolated packaged process. Production
  // HTTPS validation and native DPAPI are unchanged; no public server is used.
  await client.evaluate(async (_electron, { nativeFile, origin }) => {
    const require = process.mainModule.require.bind(process.mainModule)
    const { DesktopWebDav } = require(nativeFile), http = require('node:http')
    const response = DesktopWebDav.prototype.response
    DesktopWebDav.prototype.response = function (...args) {
      this.request = (url, options, callback) => http.request(origin + url.pathname, options, callback)
      return response.apply(this, args)
    }
  }, { nativeFile: path.join(home, 'versions', version, 'app', 'desktop', 'webDav.cjs'), origin })
}
async function stored() {
  return page.evaluate(async () => {
    const request = indexedDB.open('uta-local-song-library', 1)
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    return new Promise((resolve, reject) => {
      const tx = db.transaction('songs'), query = tx.objectStore('songs').getAll()
      tx.oncomplete = () => { db.close(); resolve(query.result.map(({ audioBlob, ...record }) => ({ ...record, size: audioBlob?.size || 0 }))) }
      tx.onabort = () => reject(tx.error)
    })
  })
}
async function seed() {
  await page.evaluate(async () => {
    await window.utaDesktop.webDav('restoreFinish')
    localStorage.removeItem('uta-cross-restore-pending-v1')
    const request = indexedDB.open('uta-local-song-library', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('songs', { keyPath: 'id' })
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const bytes = new Uint8Array(16044), view = new DataView(bytes.buffer)
    const ascii = (offset, value) => [...value].forEach((char, index) => { bytes[offset + index] = char.charCodeAt(0) })
    ascii(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVEfmt '); view.setUint32(16, 16, true)
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true)
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, bytes.length - 44, true)
    const blob = new Blob([bytes], { type: 'audio/wav' })
    const lines = [{ id: 10, start: 0.1, text: '空へ歌う', translation: '向天空歌唱' }, { id: 40, start: 0.5, text: '風と歩く', translation: '' }]
    await new Promise((resolve, reject) => {
      const tx = db.transaction('songs', 'readwrite'), store = tx.objectStore('songs'); store.clear()
      for (const id of ['local-first', 'local-second']) store.put({ id, title: id === 'local-first' ? '原创电脑曲一' : '原创电脑曲二', artist: 'UTA',
        createdAt: 1, audioName: id + '.wav', audioBlob: blob, lyricsOnly: false, artworkChoice: 'default', isLocal: true, lines })
      store.put({ id: 'local-untimed', title: '原创电脑纯歌词', artist: '', createdAt: 2, audioBlob: null, lyricsOnly: true, isLocal: true,
        artworkChoice: 'default', lines: [{ id: 100, start: null, text: '今天练习唱歌', translation: '' }] })
      tx.oncomplete = () => { db.close(); resolve() }; tx.onabort = () => reject(tx.error)
    })
    const progress = { learnedBySong: { 'local-first': [40] }, reviewItems: [{ songId: 'local-first', lineId: 10 }],
      favoriteSongIds: ['local-first'], corrections: { 'local-first:10:0': '' }, meaningOverrides: {}, playbackRate: 0.75,
      desktopTheme: 'crimson-blade', desktopFont: 'system', lyricFontSize: 26, readingStyle: 'both',
      songSettings: { 'local-first': { readingStyle: 'both', showTranslation: false, romajiPosition: 'above' } } }
    localStorage.setItem('uta-pronunciation-progress-v2', JSON.stringify(progress))
    localStorage.setItem('uta-auto-annotations-v5', JSON.stringify({ 'local-first': [{ id: 10, text: '空へ歌う', tokens: [
      { index: 0, surface: '空', reading: 'そら' }, { index: 1, surface: 'へ', reading: 'へ' }, { index: 2, surface: '歌う', reading: 'うたう' }] }] }))
    localStorage.setItem('uta-ai-reviews-v1', '{}'); localStorage.setItem('uta-sentence-explanations-v1', '{}')
    localStorage.setItem('uta-artwork-overrides-v1', '{}')
    localStorage.setItem('uta-ai-provider-v1', JSON.stringify({ name: '测试AI', protocol: 'openai-compatible', base_url: 'https://example.com/v1', model: 'original', rememberKey: true, useServerDefault: false }))
    await window.utaDesktop.saveCredential('synthetic-old-key')
  })
  await page.reload(); await page.waitForSelector('.desktop-shell')
  await page.waitForFunction(() => document.querySelectorAll('.desktop-quick-open').length > 0 || document.body.innerText.includes('原创电脑'))
}
async function openPanel() {
  if (!await page.getByRole('dialog', { name: '设置', exact: true }).count()) await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '跨端互通', exact: true }).click()
  await page.getByRole('button', { name: '保存配置', exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.cross-platform-config')?.disabled)
}
async function waitMessage(text) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('.cross-platform-config')?.disabled)
}
async function upload() {
  await page.getByRole('button', { name: '上传本机快照', exact: true }).click()
  await waitMessage('快照已上传：')
}
async function preview(name) {
  await page.getByRole('button', { name: '刷新列表', exact: true }).click()
  await waitMessage('云端快照列表已更新')
  const row = page.locator('.cross-platform-snapshots li').filter({ hasText: name })
  await row.getByRole('button', { name: '下载并预览', exact: true }).click()
  await page.getByRole('region', { name: '跨端快照预览', exact: true }).waitFor({ timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('.cross-platform-config')?.disabled)
}
async function confirmRestore() {
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '确认恢复此快照', exact: true }).click()
}
try {
  await launch(); await seed(); await openPanel()
  await page.locator('[name="cross-webdav-url"]').fill(config.url)
  await page.locator('[name="cross-webdav-username"]').fill(config.username)
  await page.locator('[name="cross-webdav-password"]').fill(config.password)
  await page.getByRole('button', { name: '保存配置', exact: true }).click(); await waitMessage('连接配置已保存')
  const settingsText = await fs.readFile(path.join(home, 'uta-data', 'webdav-settings.json'), 'utf8')
  assert.ok(!settingsText.includes(config.password))
  const secret = await fs.readFile(path.join(home, 'uta-data', 'webdav-credential.bin'))
  assert.ok(!secret.includes(Buffer.from(config.password)))
  await page.getByRole('button', { name: '测试连接', exact: true }).click(); await waitMessage('连接成功')
  passed.push('实际EXE设置连接、列表与独立Windows加密凭据')

  await upload()
  const published = [...files.keys()].filter(name => name.endsWith('.uta-backup') && name !== sampleName)
  assert.equal(published.length, 1)
  const raw = files.get(published[0]), outerLength = raw.readUInt32LE(17)
  const outer = JSON.parse(raw.subarray(21, 21 + outerLength).toString('utf8'))
  const coreStart = 21 + outerLength, coreLength = raw.readUInt32LE(coreStart + 20)
  const core = JSON.parse(raw.subarray(coreStart + 24, coreStart + 24 + coreLength).toString('utf8'))
  assert.equal(outer.version, 3); assert.equal(outer.catalog.version, 2); assert.equal(core.version, 1); assert.deepEqual(core.songs, [])
  assert.equal(outer.catalog.songs.length, 3)
  assert.equal(core.progress.corrections['local-first:10:0'], '')
  assert.equal(core.progress.songSettings['local-first'].romajiPosition, 'above')
  assert.ok(!Object.hasOwn(core.progress, 'desktopTheme')); assert.ok(!Object.hasOwn(outer.ai, 'api_key'))
  assert.ok(!raw.includes(Buffer.from(config.password)))
  const nativeAudio = [...files].filter(([name]) => name.startsWith('_uta-audio-') && name !== audioName)
  assert.equal(nativeAudio.length, 1); assert.equal(nativeAudio[0][0], `_uta-audio-${sha(nativeAudio[0][1])}.bin`)
  passed.push('Windows生成v3/目录v2/空核心v1，重复音频仅上传一次，手工空读音与设置保留，密钥默认排除')

  const audioPuts = () => requests.filter(item => item.method === 'PUT' && item.url.includes('_uta-audio-')).length
  const before = audioPuts()
  await upload()
  assert.equal(audioPuts(), before)
  passed.push('第二次上传不重复传音频，创建独立历史快照')
  await page.screenshot({ path: path.join(evidence, 'cross-platform-settings-20261027.png'), fullPage: true })

  await preview(sampleName)
  await confirmRestore()
  await page.waitForFunction(() => !document.querySelector('.cross-platform-preview'), { timeout: 30000 })
  await page.waitForFunction(() => document.body.innerText.includes('原创静音练习'), { timeout: 30000 })
  const restored = await stored()
  assert.equal(restored.length, 2)
  assert.equal(restored.find(song => song.id === 'local-example').cloudPending, true)
  assert.equal(restored.find(song => song.id === 'local-lyrics-example').lines[0].start, null)
  const actualProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')))
  assert.equal(actualProgress.lyricFontSize, 26)
  assert.equal(actualProgress.desktopTheme, 'crimson-blade')
  assert.equal(actualProgress.desktopFont, 'system')
  assert.equal(await page.evaluate(() => window.utaDesktop.loadCredential()), 'synthetic-old-key')
  assert.equal(await page.evaluate(() => window.utaDesktop.webDav('recoveryStatus')), null)
  const snapshotFolder = path.join(home, 'uta-data', 'backups', 'restore-snapshots')
  const snapshotName = (await fs.readdir(snapshotFolder)).filter(name => name.endsWith('.uta-backup')).sort().at(-1)
  const recoveryInspection = await inspectCloudBackup(new Blob([await fs.readFile(path.join(snapshotFolder, snapshotName))]))
  assert.equal(recoveryInspection.manifest.songs.length, 3)
  assert.equal(recoveryInspection.manifest.version, 2)
  passed.push('协议原创样例恢复到EXE，先存含纯歌词的完整恢复点，保留本机字体与AI密钥')

  await openPanel()
  corruptAudio = true
  await page.locator('.cross-platform-pending li').getByRole('button').click()
  await waitMessage('SHA256 校验失败')
  assert.equal((await stored()).find(song => song.id === 'local-example').size, 0)
  assert.equal((await stored()).find(song => song.id === 'local-example').cloudPending, true)
  corruptAudio = false
  await page.locator('.cross-platform-pending li').getByRole('button').click()
  await waitMessage('音频已下载')
  assert.equal((await stored()).find(song => song.id === 'local-example').size, audioBytes.length)
  assert.equal((await stored()).find(song => song.id === 'local-example').lines[0].text, header.catalog.songs[0].lines[0].text)
  passed.push('等长损坏音频拒绝落库，重试下载校验通过，歌词保持目录新资料')

  // Force a single storage write failure after the song transaction committed.
  // Rollback must restore the previous whole library and keep the durable point.
  await preview(published[0])
  const beforeRollback = await stored()
  await page.evaluate(() => {
    const original = Storage.prototype.setItem; let injected = false
    Storage.prototype.setItem = function (key, value) {
      if (!injected && key === 'uta-auto-annotations-v5' && localStorage.getItem('uta-cross-restore-pending-v1')) { injected = true; throw new Error('synthetic storage failure') }
      return original.call(this, key, value)
    }
  })
  await confirmRestore(); await waitMessage('已回滚原数据')
  assert.deepEqual(await stored(), beforeRollback)
  assert.equal(await page.evaluate(() => window.utaDesktop.webDav('recoveryStatus')), null)
  assert.equal(await page.evaluate(() => window.utaDesktop.loadCredential()), 'synthetic-old-key')
  passed.push('跨仓库恢复中途失败时回滚整库，原音频与AI设置保持')

  await client.close(); client = null
  await launch(); await openPanel()
  assert.equal(await page.locator('[name="cross-webdav-url"]').inputValue(), config.url)
  assert.equal(await page.locator('[name="cross-webdav-password"]').inputValue(), config.password)
  assert.equal((await stored()).find(song => song.id === 'local-example').size, audioBytes.length)
  passed.push('实际EXE重启后歌曲音频、互通配置与加密密码可继续读取')

  const beforeReuse = await stored(), getsBefore = requests.filter(item => item.method === 'GET' && item.url.includes('_uta-audio-')).length
  const fresh = structuredClone(header)
  fresh.catalog.songs[0].lines[0].translation = '原创修改后的译文'
  const sampleInspection = await inspectCloudBackup(new Blob([sampleBytes]))
  // Container lengths are always written from the actual blobs, not copied headers.
  const updatedCore = createLearningBackup([], sampleInspection.manifest)
  const updatedExtras = { ...fresh }; for (const key of ['coreSize', 'avatarSize', 'avatarType']) delete updatedExtras[key]
  const updatedSnapshot = createCloudBackup(updatedCore, updatedExtras)
  const updatedName = 'UTA-2026-10-27T23-59-59-000Z-newwords.uta-backup'
  files.set(updatedName, Buffer.from(await updatedSnapshot.arrayBuffer()))
  await preview(updatedName); await confirmRestore()
  await page.waitForFunction(() => !document.querySelector('.cross-platform-preview'))
  await page.waitForFunction(() => document.body.innerText.includes('原创静音练习'))
  const afterReuse = await stored()
  assert.equal(afterReuse.find(song => song.id === 'local-example').size, beforeReuse.find(song => song.id === 'local-example').size)
  assert.equal(afterReuse.find(song => song.id === 'local-example').cloudPending, false)
  assert.equal(afterReuse.find(song => song.id === 'local-example').lines[0].translation, '原创修改后的译文')
  assert.equal(requests.filter(item => item.method === 'GET' && item.url.includes('_uta-audio-')).length, getsBefore)
  passed.push('恢复相同音频的新资料快照复用实际本机字节，同时应用新歌词资料，不额外下载')

  // Simulate a process interruption after the durable journal, with the key
  // already changed. Reopening must show recovery and retain the original point.
  const recoveryName = (await fs.readdir(snapshotFolder)).filter(name => name.endsWith('.uta-backup')).sort().at(-1)
  const expectedRecovery = await inspectCloudBackup(new Blob([await fs.readFile(path.join(snapshotFolder, recoveryName))]))
  await page.evaluate(async name => {
    const ai = JSON.parse(localStorage.getItem('uta-ai-provider-v1'))
    await window.utaDesktop.webDav('restoreBegin', { name, ai: { ...ai, api_key: 'synthetic-pre-crash-key', rememberKey: true } })
    localStorage.setItem('uta-cross-restore-pending-v1', 'true')
    await window.utaDesktop.saveCredential('synthetic-crashed-new-key')
    const request = indexedDB.open('uta-local-song-library', 1)
    const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result) })
    await new Promise((resolve, reject) => { const tx = db.transaction('songs', 'readwrite'); tx.objectStore('songs').clear(); tx.oncomplete = () => { db.close(); resolve() }; tx.onabort = () => reject(tx.error) })
  }, recoveryName)
  await client.close(); client = null
  await launch()
  await page.getByText('上次恢复可能中断', { exact: true }).waitFor()
  assert.equal(await page.locator('[name="cross-webdav-url"]').inputValue(), config.url)
  await page.getByRole('button', { name: '数据管理', exact: true }).click()
  await page.locator('.settings-data-card input[type="file"]').setInputFiles(path.join(snapshotFolder, recoveryName))
  await page.getByRole('dialog', { name: '确认恢复备份', exact: true }).waitFor()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '覆盖当前数据并恢复', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.backup-dialog'), { timeout: 30000 })
  await page.waitForFunction(() => localStorage.getItem('uta-cross-restore-pending-v1') === null, { timeout: 30000 })
  assert.equal((await stored()).length, expectedRecovery.manifest.songs.length)
  assert.equal(await page.evaluate(() => window.utaDesktop.loadCredential()), 'synthetic-pre-crash-key')
  assert.equal(await page.evaluate(() => window.utaDesktop.webDav('recoveryStatus')), null)
  passed.push('中断后重启自动显示恢复提示，手动恢复完整恢复点，并还原独立加密的旧AI密钥')
  assert.deepEqual(failures, [])
  await fs.writeFile(path.join(evidence, 'cross-platform-desktop-20261027.json'), JSON.stringify({ passed, failures, requests: requests.map(({ method, url }) => ({ method, name: url.slice('/uta/'.length) })), boundary: 'Actual isolated Windows EXE, original protocol sample, local HTTP mock injected only into test transport; real public WebDAV and Android device not tested.' }, null, 2))
  console.log(JSON.stringify({ passed: passed.length, checks: passed, failures }, null, 2))
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(evidence, 'cross-platform-failure-20261027.png') }).catch(() => {})
  console.error(JSON.stringify({ passed, failures }, null, 2)); throw error
} finally {
  if (client) await client.close().catch(() => {})
  await new Promise(resolve => mock.close(resolve))
}
