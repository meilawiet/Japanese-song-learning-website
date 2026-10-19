import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd(), work = path.join(root, 'work')
const source = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'release', 'UTA-Windows-x64')
const testDir = path.join(work, 'batch-artwork-validation'), evidence = path.join(work, 'verification')
assert.equal(path.dirname(testDir), work)
await fs.rm(testDir, { recursive: true, force: true })
await fs.cp(source, testDir, { recursive: true, filter: file => path.basename(file) !== 'uta-data' })
await fs.mkdir(path.join(testDir, 'uta-data', 'tmp'), { recursive: true })
await fs.mkdir(evidence, { recursive: true })
const env = { ...process.env, TEMP: path.join(testDir, 'uta-data', 'tmp'), TMP: path.join(testDir, 'uta-data', 'tmp') }
delete env.ELECTRON_RUN_AS_NODE
let app
async function launch() {
  app = await electron.launch({ executablePath: path.join(testDir, 'UTA.exe'), env, timeout: 90000 })
  const page = await app.firstWindow({ timeout: 90000 })
  await page.locator('.desktop-shell').waitFor()
  return page
}
async function records(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('uta-local-song-library')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => { const db = open.result, tx = db.transaction('songs'), req = tx.objectStore('songs').getAll(); req.onsuccess = () => resolve(req.result.map(({ audioBlob, ...record }) => ({ ...record, audioBytes: audioBlob.size }))); req.onerror = () => reject(req.error); tx.oncomplete = () => db.close() }
  }))
}
try {
  let page = await launch()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const pictures = await page.evaluate(() => ['#c53746', '#2359c2'].map(color => { const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32; const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 32, 32); return canvas.toDataURL('image/png').split(',')[1] }))
  await page.route('https://uta-covers.example/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(pictures[0], 'base64') }))
  await page.evaluate(png => {
    const original = window.fetch
    window.__coverFailure = false
    window.__coverRequests = []
    window.fetch = (input, options) => {
      const url = String(input)
      if (url.includes('/api/artwork/candidates?')) {
        const q = new URL(url).searchParams
        return Promise.resolve(new Response(JSON.stringify({ candidates: [{ trackTitle: q.get('title'), artistName: q.get('artist') || 'UTA', artworkProvider: '测试在线封面', artworkUrl: 'https://uta-covers.example/cover.png', artworkSourceUrl: 'https://uta-covers.example/' }], unavailable: [] }), { headers: { 'Content-Type': 'application/json' } }))
      }
      if (url.startsWith('https://uta-covers.example/') || url.includes('/api/artwork/image?')) {
        window.__coverRequests.push(url)
        const bytes = Uint8Array.from(atob(png), char => char.charCodeAt(0))
        return Promise.resolve(window.__coverFailure ? new Response('simulated cover failure', { status: 503 }) : new Response(bytes, { headers: { 'Content-Type': 'image/png' } }))
      }
      return original(input, options)
    }
  }, pictures[0])
  const wav = Buffer.alloc(44 + 8000 * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(8000 * 2, 40)
  const titles = ['批量封面一', '批量封面二', '批量封面三']
  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  await page.getByRole('button', { name: '导入歌曲', exact: true }).click()
  await page.locator('.song-import-dialog').getByRole('button', { name: '批量导入', exact: true }).click()
  const batch = page.locator('.batch-import-dialog')
  await batch.getByLabel('批量选择音频文件', { exact: true }).setInputFiles(titles.map(title => ({ name: title + '.wav', mimeType: 'audio/wav', buffer: wav })))
  await page.waitForFunction(() => document.querySelectorAll('.batch-import-row').length === 3 && !document.querySelector('.batch-import-progress'))
  await batch.getByRole('button', { name: '第 1 首选择封面', exact: true }).click()
  await batch.locator('.artwork-candidates button').first().click()
  await batch.getByAltText('第 1 首已选封面').waitFor()
  const mixed = `[00:00.10]東京
[00:00.20]君を見た
[00:00.20]看见了你
[00:00.20]kimi o mita
[00:00.30]I will follow
[00:00.40]English chorus
[00:00.50]明日（あす）へ`
  await batch.getByLabel('批量选择歌词文件', { exact: true }).setInputFiles(titles.map(title => ({ name: title + '.lrc', mimeType: 'text/plain', buffer: Buffer.from(`[ti:${title}]
${mixed}`) })))
  await batch.getByRole('button', { name: '导入选中的 3 首歌曲', exact: true }).waitFor()
  assert.equal(await batch.locator('.batch-song-status.error').count(), 0)
  assert.equal(await batch.getByAltText('第 1 首已选封面').getAttribute('src'), 'https://uta-covers.example/cover.png')
  await batch.locator('.batch-import-row').first().getByRole('button', { name: '预览歌词', exact: true }).click()
  assert.equal(await batch.getByRole('button', { name: /确认.*行当前归类/ }).count(), 0)
  assert.equal(await batch.locator('.lrc-review-warnings').count(), 0)
  assert.equal(await batch.getByLabel('第 5 行原文').inputValue(), 'I will follow')
  await batch.locator('.batch-import-row').first().getByRole('button', { name: '收起歌词', exact: true }).click()
  await batch.getByRole('button', { name: '第 2 首选择封面', exact: true }).click()
  await batch.locator('.artwork-picker input[type=file]').setInputFiles({ name: 'blue-cover.png', mimeType: 'image/png', buffer: Buffer.from(pictures[1], 'base64') })
  await batch.getByAltText('第 2 首已选封面').waitFor()
  await page.waitForFunction(() => !document.querySelector('.artwork-upload input').disabled)
  assert.match(await batch.getByAltText('第 2 首已选封面').getAttribute('src'), /^data:image\/jpeg;base64,/)
  await batch.getByRole('button', { name: '第 3 首选择封面', exact: true }).click()
  await batch.getByLabel('封面图片链接', { exact: true }).fill('https://uta-covers.example/unused.png')
  await batch.getByLabel('封面图片链接', { exact: true }).press('Enter')
  await batch.getByAltText('第 3 首已选封面').waitFor()
  assert.equal(await batch.count(), 1, 'Enter in a cover URL cannot submit the entire import form')
  await batch.getByRole('button', { name: '使用默认封面', exact: true }).click()
  await batch.getByLabel('批量选择音频文件', { exact: true }).setInputFiles({ name: '不导入.wav', mimeType: 'audio/wav', buffer: wav })
  await page.waitForFunction(() => document.querySelectorAll('.batch-import-row').length === 4 && !document.querySelector('.batch-import-progress'))
  assert.equal(await batch.getByAltText('第 1 首已选封面').count(), 1)
  assert.equal(await batch.getByAltText('第 2 首已选封面').count(), 1)
  assert.equal(await batch.locator('.batch-ai-option input').isChecked(), false)
  for (const [width, height, zoom] of [[1440, 900, 1], [1024, 768, 1.25]]) {
    await app.evaluate(({ BrowserWindow }, size) => { const win = BrowserWindow.getAllWindows()[0]; win.setSize(size[0], size[1]); win.webContents.setZoomFactor(size[2]) }, [width, height, zoom])
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const size = await batch.evaluate(el => { const f = el.querySelector('.batch-import-footer').getBoundingClientRect(); return { right: f.right, bottom: f.bottom, w: innerWidth, h: innerHeight, width: el.clientWidth, contentWidth: el.scrollWidth } })
    assert.ok(size.right <= size.w + 1 && size.bottom <= size.h + 1 && size.contentWidth <= size.width + 1, JSON.stringify(size))
  }
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.webContents.setZoomFactor(1); win.setSize(1440, 900) })
  const shot = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await fs.writeFile(path.join(evidence, 'batch-import-cover-selection.png'), Buffer.from(shot, 'base64'))
  const count = (await records(page)).length
  await page.evaluate(() => { window.__coverFailure = true })
  await batch.getByRole('button', { name: '导入选中的 3 首歌曲', exact: true }).click()
  await batch.getByRole('alert').filter({ hasText: '封面保存失败' }).waitFor()
  assert.equal((await records(page)).length, count, 'failed cover preparation cannot import a partial batch')
  assert.equal(await batch.getByAltText('第 2 首已选封面').count(), 1)
  await page.evaluate(() => { window.__coverFailure = false })
  await batch.getByRole('button', { name: '导入选中的 3 首歌曲', exact: true }).click()
  await batch.waitFor({ state: 'detached' })
  const saved = await records(page)
  assert.equal(saved.length, count + 3)
  const a = saved.find(row => row.title === titles[0]), b = saved.find(row => row.title === titles[1]), c = saved.find(row => row.title === titles[2])
  assert.ok(a && b && c)
  assert.match(a.artworkUrl, /^data:image\/jpeg;base64,/)
  assert.match(b.artworkUrl, /^data:image\/jpeg;base64,/)
  assert.notEqual(a.artworkUrl, b.artworkUrl)
  assert.equal(a.artworkProvider, '测试在线封面'); assert.equal(b.artworkProvider, '本地上传'); assert.equal(c.artworkChoice, 'default')
  assert.equal(c.artworkUrl, '')
  assert.deepEqual(a.lines.map(line => line.text), ['東京', '君を見た', 'I will follow', 'English chorus', '明日へ'])
  assert.equal(a.lines[1].translation, '看见了你'); assert.equal(a.lines[1].romaji, 'kimi o mita')
  assert.equal(a.lines[4].sourceReadings[0].reading, 'あす')
  assert.equal(a.audioBytes, wav.length)
  await app.close(); app = null
  page = await launch()
  const restarted = await records(page)
  for (const row of [a, b, c]) assert.deepEqual(restarted.find(item => item.id === row.id), row)
  assert.deepEqual(errors, [])
  const report = { passed: true, checks: ['no-track-confirmation-and-English-originals', 'online-cover-selection-before-lyric-pairing', 'local-cover-upload-and-explicit-default', 'adding-files-retains-per-song-covers', 'small-window-and-zoom-layout', 'cover-failure-atomic-no-write-and-retry', 'selected-covers-cached-with-lyrics-and-audio', 'cover-and-lyric-persistence-after-restart', 'batch-ai-stays-opt-in', 'cover-url-enter-does-not-submit-batch'] }
  await fs.writeFile(path.join(evidence, 'batch-artwork-desktop.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} catch (error) {
  if (app) { const page = await app.firstWindow(); await page.screenshot({ path: path.join(evidence, 'batch-artwork-failure.png') }).catch(() => {}) }
  throw error
} finally { if (app) await app.close() }
