import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd(), home = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'work', 'line-timing-candidate-20261031')
assert.equal(path.dirname(home), path.join(root, 'work'))
const evidence = path.join(root, 'work', 'verification')
const env = { ...process.env, TEMP: path.join(home, 'uta-data', 'tmp'), TMP: path.join(home, 'uta-data', 'tmp') }
delete env.ELECTRON_RUN_AS_NODE
await fs.mkdir(env.TEMP, { recursive: true }); await fs.mkdir(evidence, { recursive: true })
let app, page
const checks = [], errors = []
const rows = () => page.locator('.lyrics-list .lyric-row')
const selection = () => page.locator('.lyrics-list .lyric-token.selected')
const pane = () => page.locator('#desktop-word-panel')
async function launch() {
  app = await electron.launch({ executablePath: path.join(home, 'UTA.exe'), env, timeout: 90000 })
  page = await app.firstWindow({ timeout: 90000 }); page.on('pageerror', error => errors.push(error.message))
  await page.locator('.desktop-shell').waitFor({ timeout: 60000 })
}
async function seed() {
  await page.evaluate(async () => {
    const request = indexedDB.open('uta-local-song-library', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('songs', { keyPath: 'id' })
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const bytes = new Uint8Array(192044), view = new DataView(bytes.buffer)
    const ascii = (offset, value) => [...value].forEach((char, index) => { bytes[offset + index] = char.charCodeAt(0) })
    ascii(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVEfmt '); view.setUint32(16, 16, true)
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true)
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, bytes.length - 44, true)
    const audioBlob = new Blob([bytes], { type: 'audio/wav' })
    const lines = [{ id: 10, start: 1, text: '明日の空を歌う', translation: '向明日的天空歌唱' },
      { id: 20, start: 4, text: '風と歩く', translation: '与风同行' }, { id: 40, start: 8, text: 'また空へ歌う', translation: '再次向天空歌唱' }]
    await new Promise((resolve, reject) => {
      const tx = db.transaction('songs', 'readwrite'), store = tx.objectStore('songs'); store.clear()
      for (const [index, id] of ['local-pane-first', 'local-pane-second'].entries()) store.put({ id, title: index ? '另一首原创练习' : '原创边栏练习', artist: 'UTA测试', isLocal: true,
        createdAt: 2 - index, audioName: 'original.wav', artworkChoice: 'default', audioBlob, lines })
      tx.oncomplete = () => { db.close(); resolve() }; tx.onabort = () => reject(tx.error)
    })
    const readings = [[['明日', 'あした'], ['の', 'の'], ['空', 'そら'], ['を', 'を'], ['歌う', 'うたう']],
      [['風', 'かぜ'], ['と', 'と'], ['歩く', 'あるく']], [['また', 'また'], ['空', 'そら'], ['へ', 'へ'], ['歌う', 'うたう']]]
    const annotations = Object.fromEntries(['local-pane-first', 'local-pane-second'].map(id => [id, lines.map((line, index) => ({ id: line.id, text: line.text,
      tokens: readings[index].map(([surface, reading], index) => ({ index, surface, reading, meaning: surface + '的原创测试释义' })) }))]))
    localStorage.setItem('uta-auto-annotations-v5', JSON.stringify(annotations))
    localStorage.setItem('uta-pronunciation-progress-v2', JSON.stringify({ learnedBySong: { 'local-pane-first': [10, 20] }, reviewItems: [{ songId: 'local-pane-first', lineId: 20 }], favoriteSongIds: [], corrections: { 'local-pane-first:10:0': 'あす' }, meaningOverrides: {}, readingStyle: 'both', desktopTheme: 'white-feather', desktopFont: 'system' }))
    localStorage.setItem('uta-ai-reviews-v1', '{}'); localStorage.setItem('uta-sentence-explanations-v1', JSON.stringify({ 'local-pane-first': { 10: { text: '明日の空を歌う', explanation: { meaning: '原创解析', grammar: [], vocabulary: [] } } } }))
    localStorage.removeItem('uta-desktop-layout-v1')
    localStorage.removeItem('uta-desktop-active-song-v1')
    localStorage.removeItem('uta-desktop-recent-songs-v1')
  })
  await page.reload(); await page.locator('.lyrics-list .lyric-token').first().waitFor()
  await page.waitForFunction(() => document.querySelector('audio').readyState >= 1)
}


const editor = () => page.locator('.line-editor')
const start = () => editor().getByLabel('开始时间（分:秒.毫秒）', { exact: true })
const end = () => editor().getByLabel('结束时间（分:秒.毫秒）', { exact: true })
async function open(index = 0) {
  await rows().nth(index).locator('.line-number').click({ button: 'right' })
  await page.getByRole('menuitem', { name: /编辑歌词/ }).click()
  await editor().waitFor()
}
async function save() {
  await editor().getByRole('button', { name: '保存修改', exact: true }).click()
  await editor().waitFor({ state: 'detached' })
}
async function stored() {
  return await page.evaluate(async () => {
    const request = indexedDB.open('uta-local-song-library', 1)
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const song = await new Promise((resolve, reject) => { const req = db.transaction('songs').objectStore('songs').get('local-pane-first'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    db.close(); return song.lines
  })
}
async function learning() {
  return page.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2'))
    return { learned: progress.learnedBySong, reviews: progress.reviewItems, corrections: progress.corrections,
      annotations: Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem('uta-auto-annotations-v5'))).map(([id, lines]) => [id, lines.sort((a, b) => a.id - b.id)])), ai: JSON.parse(localStorage.getItem('uta-sentence-explanations-v1')) }
  })
}
async function screenshot(name) {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await fs.writeFile(path.join(evidence, name), Buffer.from(png, 'base64'))
}
try {
  await launch(); await seed()
  const before = await learning()
  await open()
  assert.equal(await start().inputValue(), '00:01.000')
  assert.equal(await end().inputValue(), '')
  assert.equal(await end().getAttribute('placeholder'), '自动 00:04.000')
  await editor().getByRole('button', { name: '开始时间增加0.2秒', exact: true }).click()
  assert.equal(await start().inputValue(), '00:01.200')
  await editor().getByRole('button', { name: '开始时间减少0.2秒', exact: true }).click()
  assert.equal(await start().inputValue(), '00:01.000')
  await editor().getByRole('button', { name: '结束时间减少0.2秒', exact: true }).click()
  assert.equal(await end().inputValue(), '00:03.800')
  await editor().getByRole('button', { name: '结束时间增加0.2秒', exact: true }).click()
  assert.equal(await end().inputValue(), '00:04.000')
  checks.push('右键编辑可独立微调起止时间，自动结束值可作为0.2秒按钮基准')

  await start().fill('bad')
  await editor().getByRole('button', { name: '开始时间增加0.2秒', exact: true }).click()
  await editor().getByRole('alert').filter({ hasText: '有效时间' }).waitFor()
  assert.equal(await start().inputValue(), 'bad')
  await start().fill('00:03.000'); await end().fill('00:02.400')
  await editor().getByRole('button', { name: '保存修改', exact: true }).click()
  await editor().getByRole('alert').filter({ hasText: '结束时间必须晚于开始时间' }).waitFor()
  assert.equal((await stored())[0].start, 1)
  await start().fill('00:04.200'); await end().fill('00:05.000')
  await editor().getByRole('button', { name: '保存修改', exact: true }).click()
  await editor().getByRole('alert').filter({ hasText: '晚于下一句' }).waitFor()
  checks.push('拒绝格式错误、结束早于开始、开始越过下一句，未保存时不写入歌曲')

  await start().fill('00:01.400'); await end().fill('00:02.400')
  await screenshot('line-timing-editor-20261031.png')
  await save()
  assert.equal((await stored())[0].start, 1.4); assert.equal((await stored())[0].end, 2.4)
  assert.deepEqual(await learning(), before)
  checks.push('手动起止时间写入歌曲库，注音、人工读音、掌握、复习和AI缓存保持一致')

  await page.getByLabel('单句循环次数', { exact: true }).selectOption('2')
  await page.evaluate(() => { window.__starts = []; document.querySelector('audio').addEventListener('play', event => window.__starts.push(event.target.currentTime)) })
  await rows().first().locator('.line-number').dblclick()
  await page.waitForFunction(() => document.querySelector('.desktop-single-line-status')?.dataset.phase === 'complete', null, { timeout: 15000 })
  const audio = await page.locator('audio').evaluate(audio => ({ paused: audio.paused, time: audio.currentTime, starts: window.__starts }))
  assert.equal(audio.paused, true); assert.ok(Math.abs(audio.time - 2.4) < 0.05)
  assert.equal(audio.starts.length, 2); assert.ok(audio.starts.every(time => Math.abs(time - 0.9) < 0.08), JSON.stringify(audio))
  checks.push('真实音频播放两次均从编辑后开始时间提前0.5秒，并精确停止在手动结束时间')

  await app.close(); app = null; await launch()
  await page.waitForFunction(() => document.querySelector('#song-title')?.textContent === '原创边栏练习')
  await open(); assert.equal(await start().inputValue(), '00:01.400'); assert.equal(await end().inputValue(), '00:02.400')
  await end().fill(''); await save()
  assert.equal((await stored())[0].end, null)
  await page.getByLabel('单句循环次数', { exact: true }).selectOption('1')
  await rows().first().locator('.line-number').dblclick()
  await page.waitForFunction(() => !document.querySelector('audio').paused)
  await page.waitForFunction(() => document.querySelector('audio').paused && Math.abs(document.querySelector('audio').currentTime - 4) < 0.06, null, { timeout: 15000 })
  checks.push('真正重启后保留起止时间，清空结束时间恢复下一句自动截断')

  await open(2)
  assert.equal(await end().getAttribute('placeholder'), '自动 00:12.000')
  await editor().getByRole('button', { name: '结束时间减少0.2秒', exact: true }).click()
  assert.equal(await end().inputValue(), '00:11.800')
  await save(); assert.equal((await stored())[2].end, 11.8)
  checks.push('最后一句以真实音频长度作为自动结束值，也可微调并保存')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 800))
  await open()
  assert.ok(await editor().evaluate(node => node.scrollWidth <= node.clientWidth + 1))
  assert.deepEqual(errors, [])
  const report = { passed: true, checks, errors, boundary: 'Actual isolated Windows EXE and original WAV; real playback timer and restart; no production data or external AI calls' }
  await fs.writeFile(path.join(evidence, 'line-timing-20261031.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  await screenshot('line-timing-failure-20261031.png').catch(() => {})
  console.error(JSON.stringify({ checks, errors })); throw error
} finally { if (app) await app.close().catch(() => {}) }
