import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import update from '../desktop/updateCore.cjs'

const root = process.cwd(), work = path.join(root, 'work')
const candidate = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(work, 'offline-update-candidate-20261016')
const current = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version
const nextParts = current.split('.').map(Number); nextParts[2]++
const next = nextParts.join('.')
const fixtures = path.join(work, 'offline-update-fixtures-20261016')
assert.equal(path.dirname(candidate), work); assert.equal(path.dirname(fixtures), work)
await fs.rm(fixtures, { recursive: true, force: true })
await fs.mkdir(fixtures, { recursive: true })
const base = path.join(candidate, 'versions', current), target = path.join(fixtures, 'target')
await fs.rm(path.join(candidate, 'versions', next), { recursive: true, force: true })
await fs.rm(path.join(candidate, 'uta-data'), { recursive: true, force: true })
await fs.mkdir(path.join(candidate, 'uta-data', 'tmp'), { recursive: true })

// Simulate a future release only inside the isolated test app. Unchanged files
// are hard-linked; the changed package.json is a separate file before editing.
for (const file of (await update.readManifest(base)).files) {
  const destination = path.join(target, ...file.path.split('/'))
  await fs.mkdir(path.dirname(destination), { recursive: true })
  if (file.path === 'app/package.json') {
    const json = JSON.parse(await fs.readFile(path.join(base, file.path), 'utf8'))
    await fs.writeFile(destination, JSON.stringify({ ...json, version: next }, null, 2))
  } else await fs.link(path.join(base, file.path), destination)
}
await update.writeManifest(target, next, '44.5.1')
const patch = path.join(fixtures, `UTA-${current}-to-${next}-Windows-x64.utapatch`)
await update.buildPatch(base, target, patch)
const wrong = path.join(fixtures, 'wrong-version.utapatch'), broken = path.join(fixtures, 'damaged.utapatch')
const bytes = await fs.readFile(patch), { header, bodyStart } = await update.readPatch(patch)
header.from = '1.1.28'
const json = Buffer.from(JSON.stringify(header)), prefix = Buffer.alloc(13)
Buffer.from('UTADELTA1').copy(prefix); prefix.writeUInt32LE(json.length, 9)
await fs.writeFile(wrong, Buffer.concat([prefix, json, bytes.subarray(bodyStart)]))
await fs.writeFile(broken, 'not a patch')
const sentinel = path.join(candidate, 'uta-data', 'preservation-test.json')
await fs.writeFile(sentinel, '{"original":"learning data must stay"}')
const sentinelHash = await update.hashFile(sentinel)
const env = { ...process.env, TEMP: path.join(candidate, 'uta-data', 'tmp'), TMP: path.join(candidate, 'uta-data', 'tmp') }
delete env.ELECTRON_RUN_AS_NODE
const run = promisify(execFile)
async function stopTestApp() {
  const command = "$expected=[IO.Path]::GetFullPath($env:UTA_OFFLINE_TEST_EXE); $boundary=[IO.Path]::GetFullPath($env:UTA_OFFLINE_TEST_WORK)+'\\'; if(-not $expected.StartsWith($boundary,[StringComparison]::OrdinalIgnoreCase)){throw 'Not a test app'}; Get-Process -Name UTA -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $expected} | Stop-Process -Force"
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { env: { ...process.env, UTA_OFFLINE_TEST_EXE: path.join(candidate, 'UTA.exe'), UTA_OFFLINE_TEST_WORK: work }, windowsHide: true }).catch(error => { if (error.code !== 1) throw error })
}
let app
async function launch() {
  app = await electron.launch({ executablePath: path.join(candidate, 'UTA.exe'), env, timeout: 90000 })
  const page = await app.firstWindow({ timeout: 90000 })
  await page.waitForSelector('.desktop-shell', { timeout: 60000 })
  return page
}
async function dropFile(page, filename, selector = '.desktop-shell') {
  await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'offline-test-input'; input.hidden = true; document.body.append(input) })
  await page.locator('#offline-test-input').setInputFiles(filename)
  await page.evaluate(selector => {
    const input = document.querySelector('#offline-test-input'), dataTransfer = new DataTransfer()
    dataTransfer.items.add(input.files[0])
    document.querySelector(selector).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
    input.remove()
  }, selector)
}
const songId = 'local-offline-update-test'
try {
  let page = await launch()
  await page.evaluate(async songId => {
    await window.utaDesktop.saveCredential('fake-offline-update-test-key')
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('uta-local-song-library', 1)
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('songs', 'readwrite')
        tx.objectStore('songs').put({ id: songId, title: '原创更新验证', artist: 'UTA', isLocal: true, createdAt: Date.now(), duration: 1,
          lines: [{ id: 0, start: 0, text: '学校へ帰る', translation: '回学校' }], audioName: 'test.wav', audioBlob: new Blob(['test-audio'], { type: 'audio/wav' }) })
        tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error)
      }
      open.onerror = () => reject(open.error)
    })
    const key = 'uta-pronunciation-progress-v2', progress = JSON.parse(localStorage.getItem(key) || '{}')
    progress.learnedBySong = { ...progress.learnedBySong, [songId]: [0] }
    progress.favoriteSongIds = [songId]
    localStorage.setItem(key, JSON.stringify(progress))
  }, songId)
  await page.reload(); await page.waitForSelector('.desktop-shell')
  await page.waitForFunction(songId => JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).learnedBySong[songId]?.includes(0), songId)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  let settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.locator('.settings-tabs').getByRole('button', { name: '检查更新', exact: true }).click()
  await settings.getByRole('button', { name: '本地增量包', exact: true }).click()
  await fs.mkdir(path.join(work, 'verification'), { recursive: true })
  await settings.screenshot({ path: path.join(work, 'verification', 'offline-update-mode.png') })
  await settings.getByLabel('选择本地增量包').setInputFiles(wrong)
  await settings.getByRole('alert').filter({ hasText: '适用于 1.1.28' }).waitFor()
  assert.doesNotMatch(await settings.getByRole('alert').innerText(), /Error invoking/)
  assert.equal((await page.evaluate(() => window.utaDesktop.getUpdateStatus())).prepared, null)
  await dropFile(page, broken, '.desktop-update-dropzone')
  await settings.getByRole('alert').filter({ hasText: '格式无效' }).waitFor()
  await settings.getByRole('button', { name: '关闭设置' }).click()
  // A real file dropped anywhere in the app opens the update tab and prepares it.
  await dropFile(page, patch)
  settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('button', { name: '退出 UTA、安装并重新打开', exact: true }).waitFor({ timeout: 60000 })
  assert.equal(await settings.getByRole('button', { name: '本地增量包', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal((await page.evaluate(() => window.utaDesktop.getUpdateStatus())).prepared.version, next)
  assert.equal(JSON.parse(await fs.readFile(path.join(candidate, 'current.json'))).version, current)
  await settings.screenshot({ path: path.join(work, 'verification', 'offline-update-ready.png') })
  await settings.getByRole('button', { name: '关闭设置' }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.locator('.settings-tabs').getByRole('button', { name: '检查更新', exact: true }).click()
  await settings.getByRole('button', { name: '退出 UTA、安装并重新打开', exact: true }).waitFor()
  // Choosing to keep an unsaved draft prevents installation and shutdown.
  await page.evaluate(() => window.utaDesktop.setUnsavedDraft('offline-update-test', true))
  await app.evaluate(({ dialog }) => { globalThis.__updateConfirmCount = 0; dialog.showMessageBoxSync = () => { globalThis.__updateConfirmCount++; return 0 } })
  await settings.getByRole('button', { name: '退出 UTA、安装并重新打开', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.desktop-update-prepared button')?.disabled)
  assert.equal(await app.evaluate(() => globalThis.__updateConfirmCount), 1)
  assert.equal(JSON.parse(await fs.readFile(path.join(candidate, 'current.json'))).version, current)
  await page.evaluate(() => window.utaDesktop.setUnsavedDraft('offline-update-test', false))
  await settings.getByRole('button', { name: '退出 UTA、安装并重新打开', exact: true }).click().catch(error => { if (!/closed|destroyed/i.test(error.message)) throw error })
  app = null
  const pending = path.join(candidate, 'uta-data', 'updates', 'pending.json')
  const deadline = Date.now() + 60000
  let updated = false
  while (Date.now() < deadline) {
    const version = JSON.parse(await fs.readFile(path.join(candidate, 'current.json'))).version
    const exists = await fs.stat(pending).then(() => true).catch(() => false)
    if (version === next && !exists) { updated = true; break }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.equal(updated, true, 'automatic helper did not confirm a healthy restart')
  assert.equal(await update.hashFile(sentinel), sentinelHash)
  // Stop only this isolated app, then reopen it with Playwright to inspect data.
  await stopTestApp()
  page = await launch()
  assert.equal(await page.evaluate(() => window.utaDesktop.loadCredential()), 'fake-offline-update-test-key')
  const restored = await page.evaluate(async songId => {
    const song = await new Promise((resolve, reject) => {
      const open = indexedDB.open('uta-local-song-library', 1)
      open.onsuccess = () => { const db = open.result, request = db.transaction('songs').objectStore('songs').get(songId); request.onsuccess = () => { resolve(request.result); db.close() }; request.onerror = () => reject(request.error) }
      open.onerror = () => reject(open.error)
    })
    const progress = JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2'))
    return { title: song.title, audio: await song.audioBlob.text(), translation: song.lines[0].translation, mastered: progress.learnedBySong[songId], favorite: progress.favoriteSongIds.includes(songId) }
  }, songId)
  assert.deepEqual(restored, { title: '原创更新验证', audio: 'test-audio', translation: '回学校', mastered: [0], favorite: true })
  console.log(JSON.stringify({ passed: true, checks: ['local-file-selection', 'wrong-version-rejected', 'corrupt-file-rejected', 'main-window-file-drop', 'ready-state-survives-panel-reopen', 'unsaved-draft-blocks-install', 'helper-install-and-health-confirmed-restart', 'songs-audio-progress-favorites-and-credential-preserved'], testOnlyVersion: next }))
} finally {
  if (app) await app.close().catch(() => {})
  await stopTestApp()
}
