import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'

const root = process.cwd()
const source = path.join(root, 'release', 'UTA-Windows-x64')
const testDir = path.join(root, 'work', '便携 验证')
assert.equal(path.dirname(testDir), path.join(root, 'work'))
await fs.rm(testDir, { recursive: true, force: true })
await fs.mkdir(testDir, { recursive: true })
await fs.cp(source, testDir, { recursive: true, filter: (item) => path.basename(item) !== 'uta-data' })
const environment = { ...process.env, PATH: path.join(process.env.SystemRoot, 'System32'),
  TEMP: path.join(testDir, 'uta-data', 'tmp'), TMP: path.join(testDir, 'uta-data', 'tmp') }
delete environment.ELECTRON_RUN_AS_NODE
delete environment.PYTHONHOME
delete environment.PYTHONPATH
await fs.mkdir(environment.TEMP, { recursive: true })
const evidence = path.join(root, 'work', 'verification')
await fs.mkdir(evidence, { recursive: true })
let client
const failures = []
const mock = createServer(async (request, response) => {
  for await (const _ of request) { /* Consume request. */ }
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }))
})
mock.listen(0, '127.0.0.1'); await once(mock, 'listening')
const mockOrigin = `http://127.0.0.1:${mock.address().port}/v1`
// Native accelerators require Electron input, not Chromium DevTools key injection.
async function shortcut(key, shift = false) {
  await client.evaluate(({ BrowserWindow }, input) => {
    const window = BrowserWindow.getAllWindows()[0]; window.focus();
    const modifiers = ['control', ...(input.shift ? ['shift'] : [])];
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: input.key, modifiers });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: input.key, modifiers });
  }, { key, shift });
}
async function launch() {
  client = await electron.launch({ executablePath: path.join(testDir, 'UTA.exe'), args: [], env: environment, timeout: 90000 })
  const page = await client.firstWindow({ timeout: 90000 })
  page.on('pageerror', (error) => failures.push(error.message))
  await page.waitForSelector('.desktop-shell', { timeout: 60000 })
  return page
}
try {
  let page = await launch()
  assert.equal(page.url(), 'uta://app/')
  const runtime = await client.evaluate(({ app }) => ({ data: app.getPath('userData'), packaged: app.isPackaged, version: app.getVersion() }))
  assert.equal(runtime.packaged, true)
  assert.equal(runtime.data, path.join(testDir, 'uta-data', 'profile'))
  await page.waitForSelector('ruby rt', { timeout:30000 })
  await page.screenshot({ path:path.join(evidence, 'desktop-home.png') })
  const health = await page.evaluate(() => fetch('/api/health').then((response) => response.json()))
  assert.equal(health.status, 'ok'); assert.equal(health.tomoshi_dictionary, true)
  const annotated = await page.evaluate(() => fetch('/api/annotate/batch', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines: [{ id: 0, text: '学校へ帰る。' }] }) }).then((response) => response.json()))
  assert.ok(annotated[0].tokens.some((word) => word.surface === '帰る' && word.reading === 'かえる'))
  assert.ok(annotated[0].tokens.some((word) => word.surface === '学校' && word.meaning))
  const ai = await page.evaluate(async (origin) => {
    const config = { name: 'Smoke test', protocol: 'openai-compatible', base_url: origin, model: 'test', api_key: 'mock-only', json_mode: true }
    const response = await fetch('/api/ai/test', { method: 'POST', headers: { 'X-UTA-AI-Config': encodeURIComponent(JSON.stringify(config)) }, body: '{}' })
    return { status: response.status, body: await response.json() }
  }, mockOrigin)
  assert.equal(ai.status, 200); assert.equal(ai.body.ok, true)

  assert.equal(await page.locator('.desktop-titlebar').count(), 1)
  assert.equal(await client.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible()), false)
  await page.getByRole('button', { name: '复习', exact: true }).click()
  await page.getByRole('heading', { name: '待复习的句子', exact: true }).waitFor()
  await page.screenshot({ path: path.join(evidence, 'desktop-review.png') })
  await shortcut('2')
  await page.locator('.desktop-song-table').waitFor()
  await page.getByRole('button', { name: '我的收藏', exact: true }).click()
  await page.getByRole('button', { name: '全部歌曲', exact: true }).click()
  await page.getByLabel('歌曲排序').selectOption('title')
  await shortcut('F')
  await page.waitForFunction(() => document.activeElement?.id === 'library-search')
  await page.getByLabel('搜索歌名或歌手').fill('不存在的测试歌曲')
  await page.getByRole('heading', { name: '没有匹配的歌曲' }).waitFor()
  await page.getByLabel('搜索歌名或歌手').fill('')
  await page.screenshot({ path: path.join(evidence, 'desktop-library.png') })

  // Import through the actual UI; the original test audio is a short silent WAV.
  const samples = 8000 * 2, wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40)
  const lyrics = '[ti:Windows便携测试]\n[ar:UTA原创]\n[00:00.00]学校へ帰る。\n[00:01.00]夢を見よう。\n'
  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  await shortcut('O')
  const form = page.locator('.song-import-dialog')
  await form.locator('input[type=file][accept*="audio"]').setInputFiles({ name: 'UTA-original.wav', mimeType: 'audio/wav', buffer: wav })
  await form.locator('input[type=file][accept*=".lrc"]').setInputFiles({ name: 'Windows-test.lrc', mimeType: 'text/plain', buffer: Buffer.from(lyrics) })
  await form.locator('.song-import-submit').click({ timeout: 45000 })
  await page.waitForSelector('.song-import-dialog', { state: 'detached', timeout: 45000 })
  await page.waitForFunction(() => document.body.innerText.includes('Windows便携测试'))
  await page.waitForSelector('ruby rt', { timeout: 30000 })
  await page.screenshot({ path: path.join(evidence, 'windows-app.png'), fullPage: false })
  await page.getByLabel('歌曲播放速度').selectOption('0.5')
  await page.getByRole('button', { name: '播放歌曲', exact: true }).click()
  await page.getByRole('button', { name: '暂停歌曲', exact: true }).waitFor()
  assert.equal(await page.locator('audio').evaluate(audio => audio.playbackRate), 0.5)
  await page.getByRole('button', { name: '暂停歌曲', exact: true }).click()
  await page.getByLabel('播放进度').fill('0.3')
  assert.ok(Math.abs(await page.locator('audio').evaluate(audio => audio.currentTime) - 0.3) < 0.1)
  await page.getByLabel('音量', { exact: true }).fill('0.5')
  assert.equal(await page.locator('audio').evaluate(audio => audio.volume), 0.5)
  await page.getByRole('button', { name: '播放下一句', exact: true }).click()
  await page.getByRole('button', { name: '暂停歌曲', exact: true }).click()
  for (const [width,height] of [[1024,768], [1440,960]]) {
    await client.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width,height])
    await page.waitForTimeout(250)
    const bounds = await page.evaluate(() => ({ width:innerWidth, height:innerHeight, scrollWidth:document.documentElement.scrollWidth, scrollHeight:document.documentElement.scrollHeight,
      lyrics:document.querySelector('.lyrics-panel').getBoundingClientRect().toJSON(), words:document.querySelector('.word-panel').getBoundingClientRect().toJSON(), player:document.querySelector('.desktop-player').getBoundingClientRect().toJSON() }))
    assert.ok(bounds.scrollWidth <= bounds.width && bounds.scrollHeight <= bounds.height)
    assert.ok(bounds.lyrics.width > 300 && bounds.words.width > 230)
    assert.ok(bounds.words.right <= bounds.width && bounds.lyrics.bottom <= bounds.player.top + 1)
    await page.screenshot({ path:path.join(evidence, `desktop-${width}.png`) })
  }
  assert.ok(!/未能开始播放|未能继续播放/.test(await page.locator('.desktop-statusbar').innerText()))
  await page.getByRole('button', { name: '加入今日复习', exact: false }).click()
  await shortcut('3')
  await page.locator('.desktop-review li').first().getByRole('button', { name:'开始练习' }).click()
  await page.getByRole('button', { name:'揭晓读音与译文' }).click()
  await page.getByRole('button', { name:'我会了 · 下一句' }).click()
  await page.getByRole('button', { name:'退出练习', exact:false }).click()
  assert.equal(await page.evaluate(() => typeof require), 'undefined')
  await page.evaluate(async () => { localStorage.setItem('desktop-persistence-test', 'persisted'); await window.utaDesktop.saveCredential('desktop-encrypted-test-key'); })
  const credentialBytes = await fs.readFile(path.join(testDir, 'uta-data', 'ai-credential.bin'))
  assert.equal(credentialBytes.includes(Buffer.from('desktop-encrypted-test-key')), false)
  assert.equal(await page.evaluate(() => window.utaDesktop.loadCredential()), 'desktop-encrypted-test-key')

  const backup = path.join(testDir, 'uta-data', 'backups', 'smoke.uta-backup')
  await client.evaluate(({ dialog }, filename) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename }) }, backup)
  await shortcut(',')
  await page.locator('.settings-dialog').waitFor()
  await page.screenshot({ path:path.join(evidence, 'desktop-settings.png') })
  await page.getByRole('button', { name: '导出备份', exact: false }).click()
  for (let i = 0; i < 150; i++) {
    try { if ((await fs.stat(backup)).size > wav.length) break } catch { /* Native save dialog completes asynchronously. */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.ok((await fs.stat(backup)).size > wav.length)
  await client.close(); client = null
  page = await launch()
  assert.equal(await page.evaluate(() => localStorage.getItem('desktop-persistence-test')), 'persisted')
  const songs = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('uta-local-song-library'); request.onerror = () => reject(request.error)
    request.onsuccess = () => { const database = request.result, all = database.transaction('songs').objectStore('songs').getAll();
      all.onsuccess = () => { database.close(); resolve(all.result.map((song) => ({ title: song.title, size: song.audioBlob.size }))) }; }
  }))
  assert.ok(songs.some((song) => song.title === 'Windows便携测试' && song.size === wav.length))
  assert.equal(await page.evaluate(() => window.utaDesktop.loadCredential()), 'desktop-encrypted-test-key')
  await client.close(); client = null

  // Verify private API authentication and automatic child exit when stdin closes.
  const child = spawn(path.join(testDir, 'resources', 'backend', 'uta-backend.exe'), [], { env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const token = randomBytes(32).toString('hex')
  child.stdin.write(JSON.stringify({ token }) + '\n')
  try {
    const origin = await new Promise((resolve, reject) => {
      let text = '', errors = ''
      const timer = setTimeout(() => reject(new Error('Backend timeout: ' + errors)), 60000)
      child.stderr.on('data', (chunk) => { errors += chunk.toString() })
      child.on('error', reject); child.on('exit', (code) => reject(new Error('Backend exited: ' + code + ' ' + errors)))
      child.stdout.on('data', (chunk) => { text += chunk.toString(); const match = /UTA_BACKEND_READY (.+)\r?\n/.exec(text); if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + JSON.parse(match[1]).port) } })
    })
    for (let i = 0; i < 40; i++) { try { await fetch(origin + '/api/health'); break } catch { await new Promise((resolve) => setTimeout(resolve, 100)) } }
    assert.equal((await fetch(origin + '/api/health')).status, 403)
    assert.equal((await fetch(origin + '/api/health', { headers: { 'X-UTA-Desktop-Token': token } })).status, 200)
    const exited = once(child, 'exit'); child.stdin.end(); await exited
  } finally { child.kill() }
  assert.deepEqual(failures, [])
  const report = { passed: true, runtime, checks: ['packaged-exe', 'relocated-chinese-space-path', 'no-system-node-python', 'bundled-sudachi-tomoshi', 'ai-proxy-mock',
    'ui-import-wav-lrc', 'backup-export', 'indexeddb-localstorage-restart', 'windows-encrypted-key', 'renderer-isolation', 'api-authentication', 'parent-exit-cleanup', 'native-titlebar-shortcuts', 'library-filter-sort-search', 'desktop-player-seek-volume-speed', 'independent-panes-1024-1440', 'dedicated-review-practice'] }
  await fs.writeFile(path.join(evidence, 'desktop-smoke.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { if (client) await client.close().catch(() => {}); mock.close(); }
