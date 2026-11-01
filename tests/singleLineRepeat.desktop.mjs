import { _electron as electron } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd(), work = path.join(root, 'work')
const source = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'release/UTA-Windows-x64')
const home = path.join(work, 'single-line-repeat-validation'), evidence = path.join(work, 'verification')
assert.equal(path.dirname(home), work)
// This test owns this isolated folder; never touch the daily-use installation.
await fs.rm(home, { recursive: true, force: true })
await fs.cp(source, home, { recursive: true, filter: file => path.basename(file) !== 'uta-data' })
const temporary = path.join(home, 'uta-data/tmp')
await fs.mkdir(temporary, { recursive: true }); await fs.mkdir(evidence, { recursive: true })
const env = { ...process.env, TEMP: temporary, TMP: temporary }
delete env.ELECTRON_RUN_AS_NODE
let app, page
const checks = [], errors = []
async function launch() {
  app = await electron.launch({ executablePath: path.join(home, 'UTA.exe'), env, timeout: 90000 })
  page = await app.firstWindow({ timeout: 90000 }); page.on('pageerror', error => errors.push(error.message))
  await page.locator('.desktop-shell').waitFor({ timeout: 60000 })
}
const rows = () => page.locator('.lyrics-list .lyric-row')
const audio = () => page.locator('audio')
const status = () => page.locator('.desktop-single-line-status')
const starts = () => page.evaluate(() => window.__singleStarts)
async function resetStarts() { await page.evaluate(() => { window.__singleStarts = [] }) }
async function chooseCount(count) {
  const label = page.getByLabel('单句循环次数', { exact: true })
  if ([1, 2, 3, 5, 10, 'infinite'].includes(count)) await label.selectOption(String(count))
  else { await label.selectOption('custom'); await page.getByLabel('自定义单句循环次数').fill(String(count)) }
}
async function doubleClick(index = 0) { await rows().nth(index).locator('.line-number').dblclick() }
async function playing() { await page.waitForFunction(() => !document.querySelector('audio').paused) }
async function paused() { await page.waitForFunction(() => document.querySelector('audio').paused) }
async function phase(value, completed) {
  await page.waitForFunction(({ value, completed }) => {
    const el = document.querySelector('.desktop-single-line-status')
    return el?.dataset.phase === value && Number(el.dataset.completed) === completed
  }, { value, completed })
}
async function finish(end = 2, eof = false) {
  await audio().evaluate((audio, { end, eof }) => { audio.currentTime = end; audio.dispatchEvent(new Event('timeupdate')); if (eof) audio.dispatchEvent(new Event('ended')) }, { end, eof })
}
async function stop() { await page.keyboard.press('Escape'); await paused() }
async function openSong(title = '单句循环验证') {
  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  await page.getByRole('button', { name: '选择 ' + title, exact: true }).click()
  await page.getByRole('button', { name: `学习 ${title}，UTA原创测试`, exact: true }).click()
  await rows().first().waitFor()
  await page.waitForFunction(() => document.querySelector('audio').readyState >= 1)
}
async function installPlayLog() {
  await page.evaluate(() => {
    window.__singleStarts = []
    const original = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (...args) {
      window.__singleStarts.push({ time: this.currentTime, rate: this.playbackRate })
      return original.apply(this, args)
    }
  })
}
async function screenshot(name) {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await fs.writeFile(path.join(evidence, name), Buffer.from(png, 'base64'))
}
try {
  await launch()
  await page.evaluate(async () => {
    const samples = 16000 * 6, wav = new ArrayBuffer(44 + samples * 2), view = new DataView(wav)
    const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
    text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt ')
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
    text(36, 'data'); view.setUint32(40, samples * 2, true)
    for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i / 16000 * Math.PI * 440) * 1000, true)
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('uta-local-song-library', 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('songs', 'readwrite')
        for (const [id, title] of [['local-single-loop', '单句循环验证'], ['local-single-switch', '单句切歌验证']]) tx.objectStore('songs').put({ id, title, artist: 'UTA原创测试', isLocal: true, createdAt: Date.now(), audioName: 'original.wav', audioBlob: new Blob([wav], { type: 'audio/wav' }), artworkChoice: 'default', lines: [
          { id: 2, start: 0.5, text: '学校へ帰る', translation: '回学校' }, { id: 7, start: 2, text: '空を見る', translation: '看看天空' }, { id: 12, start: 4, text: '歌を歌う', translation: '唱歌' },
        ] })
        tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error)
      }
    })
  })
  await page.reload(); await page.locator('.desktop-shell').waitFor(); await openSong(); await installPlayLog()
  assert.equal(await page.getByLabel('单句循环次数', { exact: true }).inputValue(), '1')
  const positions = await page.evaluate(() => ['逐句播放速度', '单句循环次数'].map(name => document.querySelector(`[aria-label="${name}"]`).getBoundingClientRect().x))
  assert.ok(positions[1] > positions[0])
  await doubleClick(); await playing(); await paused()
  assert.equal((await starts()).length, 1)
  assert.equal((await starts())[0].time, 0)
  assert.ok(Math.abs(await audio().evaluate(el => el.currentTime) - 2) < 0.03)
  checks.push('loop-control-right-of-speed-default-one-real-timer-boundary-and-lead-in')

  await page.getByLabel('逐句播放速度').selectOption('0.25')
  for (const count of [2, 3, 5, 4]) {
    await chooseCount(count); await resetStarts(); await doubleClick(); await playing()
    for (let completed = 1; completed <= count; completed++) {
      await finish()
      await phase(completed === count ? 'complete' : 'playing', completed)
    }
    await paused(); assert.equal((await starts()).length, count)
    assert.ok((await starts()).every(start => start.time === 0 && start.rate === 0.25))
  }
  checks.push('two-three-five-and-custom-four-total-passes-stop-exactly')

  await chooseCount('infinite'); await resetStarts(); await doubleClick(); await playing()
  for (let i = 1; i <= 12; i++) { await finish(); await phase('playing', i) }
  assert.equal((await starts()).length, 13)
  await stop(); await audio().evaluate(el => { el.dispatchEvent(new Event('timeupdate')); el.dispatchEvent(new Event('ended')) })
  await page.waitForTimeout(150); assert.equal((await starts()).length, 13)
  checks.push('infinite-repeat-and-escape-cancel-ignore-late-media-events')
  await chooseCount(4)
  assert.equal(await page.getByLabel('自定义单句循环次数').inputValue(), '4')
  checks.push('infinite-setting-can-switch-directly-to-custom-count')

  await chooseCount(3); await resetStarts(); await doubleClick(); await playing(); await finish(); await phase('playing', 1)
  await audio().evaluate(el => { el.currentTime = 0.7 })
  await doubleClick(); await phase('paused', 1); await paused()
  const pausedTime = await audio().evaluate(el => el.currentTime), countBeforePause = (await starts()).length
  await page.waitForTimeout(200); assert.equal((await starts()).length, countBeforePause)
  await doubleClick(); await playing(); await phase('playing', 1)
  assert.ok(Math.abs((await starts()).at(-1).time - pausedTime) < 0.03)
  await page.getByLabel('逐句播放速度').selectOption('0.5')
  await finish(); await phase('playing', 2); assert.equal((await starts()).at(-1).rate, 0.5)
  await finish(); await phase('complete', 3); await paused()
  checks.push('double-click-pause-resume-keeps-pass-count-and-live-speed')
  await doubleClick(); await playing()
  await audio().evaluate(el => el.pause()); await phase('paused', 0)
  await page.keyboard.press('Space'); await playing(); await phase('playing', 0); await stop()
  checks.push('external-audio-pause-and-space-resume-preserve-loop-session')

  await chooseCount(2); await doubleClick(2); await playing(); await finish(6, true); await phase('playing', 1)
  assert.equal((await starts()).at(-1).time, 3.5)
  await finish(6, true); await phase('complete', 2); await paused()
  checks.push('last-line-loops-at-real-audio-EOF-without-double-counting-ended')

  await chooseCount(3); await doubleClick(); await playing(); await rows().nth(1).locator('.line-number').click(); await paused()
  const countAfterSwitch = (await starts()).length; await page.waitForTimeout(150); assert.equal((await starts()).length, countAfterSwitch)
  await doubleClick(1); await playing(); assert.equal((await starts()).at(-1).time, 1.5)
  await page.getByRole('button', { name: '歌曲库', exact: true }).click(); await paused(); await openSong('单句切歌验证'); await paused()
  await doubleClick(); await playing(); await page.getByLabel('桌面导航').getByRole('button', { name: '跟唱练习', exact: true }).click(); await paused()
  await page.getByRole('button', { name: '返回学习', exact: true }).click(); await paused()
  checks.push('line-song-and-page-switch-cancel-single-loop')

  await rows().first().locator('.line-number').click()
  await rows().nth(1).locator('.line-number').click({ modifiers: ['Control'] })
  const range = page.getByRole('region', { name: '选中歌词片段', exact: true })
  await range.getByLabel('选段播放次数').selectOption('1')
  await range.getByRole('button', { name: '播放选中片段', exact: true }).click(); await playing()
  await finish(4); await paused()
  assert.equal(await page.getByLabel('单句循环次数', { exact: true }).inputValue(), '3')
  await page.getByRole('button', { name: '取消歌词多选', exact: true }).click()
  checks.push('single-line-repeat-preference-independent-from-selected-range-repeat')

  await page.evaluate(() => {
    const el = document.querySelector('audio'); window.__holdSingleMetadata = true; window.__actualSingleLoad = el.load
    Object.defineProperty(el, 'readyState', { configurable: true, get: () => window.__holdSingleMetadata ? 0 : 4 })
    el.load = () => {}
  })
  await resetStarts(); await doubleClick(); assert.equal((await starts()).length, 0)
  await rows().nth(1).locator('.line-number').click()
  await page.evaluate(() => { const el = document.querySelector('audio'); window.__holdSingleMetadata = false; el.dispatchEvent(new Event('loadedmetadata')); delete el.readyState; el.load = window.__actualSingleLoad })
  await page.waitForTimeout(150); assert.equal((await starts()).length, 0)
  checks.push('switch-before-metadata-cancels-pending-single-loop')

  await chooseCount(4); await doubleClick(); await playing(); await chooseCount(5); await paused()
  await chooseCount(99); assert.equal(await page.getByLabel('自定义单句循环次数').inputValue(), '99')
  await chooseCount(4)
  for (const [width, height, zoom] of [[1440, 960, 1], [1024, 768, 1], [1024, 768, 1.25]]) {
    await app.evaluate(({ BrowserWindow }, { width, height, zoom }) => { const win = BrowserWindow.getAllWindows()[0]; win.setSize(width, height); win.webContents.setZoomFactor(zoom) }, { width, height, zoom })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const bounds = await page.evaluate(() => [...document.querySelectorAll('.desktop-lesson-controls select,.desktop-lesson-controls input')].map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth } }))
    assert.ok(bounds.every(r => r.left >= 0 && r.right <= r.width + 1 && r.bottom > r.top))
  }
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setSize(1440, 960); win.webContents.setZoomFactor(1) })
  await screenshot('single-line-repeat-preview-20261026.png')
  checks.push('changing-count-stops-current-run-custom-99-and-compact-small-window-layout')
  await app.close(); app = null; await launch(); await openSong()
  assert.equal(await page.getByLabel('单句循环次数', { exact: true }).inputValue(), 'custom')
  assert.equal(await page.getByLabel('自定义单句循环次数').inputValue(), '4')
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).singleLineRepeatCount), 4)
  checks.push('single-line-repeat-choice-survives-app-restart')
  assert.deepEqual(errors, [])
  const report = { passed: true, version: JSON.parse(await fs.readFile(path.join(root, 'package.json'))).version, checks }
  await fs.writeFile(path.join(evidence, 'single-line-repeat-desktop-20261026.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  if (page) await screenshot('single-line-repeat-failure-20261026.png').catch(() => {})
  throw error
} finally { if (app) await app.close().catch(() => {}) }
