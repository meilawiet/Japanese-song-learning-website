import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd(), home = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'work', 'resume-song-candidate-20261030')
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
    localStorage.setItem('uta-pronunciation-progress-v2', JSON.stringify({ learnedBySong: {}, reviewItems: [], favoriteSongIds: [], corrections: {}, meaningOverrides: {}, readingStyle: 'both', desktopTheme: 'white-feather', desktopFont: 'system' }))
    localStorage.setItem('uta-ai-reviews-v1', '{}'); localStorage.setItem('uta-sentence-explanations-v1', '{}')
    localStorage.removeItem('uta-desktop-layout-v1')
    localStorage.removeItem('uta-desktop-active-song-v1')
    localStorage.removeItem('uta-desktop-recent-songs-v1')
  })
  await page.reload(); await page.locator('.lyrics-list .lyric-token').first().waitFor()
  await page.waitForFunction(() => document.querySelector('audio').readyState >= 1)
}

const key = 'uta-desktop-active-song-v1'
async function expectSong(title, id) {
  await page.waitForFunction(({ title, key, id }) => document.querySelector('#song-title')?.textContent === title && localStorage.getItem(key) === id, { title, key, id })
  assert.equal(await page.locator('audio').evaluate(audio => audio.paused), true)
  assert.equal(await page.locator('.lyric-token.selected').count(), 0)
}
async function restart() { await app.close(); app = null; await launch() }
async function updateLibrary(action) {
  await page.evaluate(async action => {
    const request = indexedDB.open('uta-local-song-library', 1)
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('songs', 'readwrite'), store = tx.objectStore('songs')
      if (action === 'clear') store.clear()
      else if (action === 'delete') store.delete('local-pane-second')
      else {
        const request = store.get('local-pane-first')
        request.onsuccess = () => store.put({ ...request.result, id: 'local-pane-newest', title: '更新导入的原创歌', createdAt: 999 })
      }
      tx.oncomplete = () => { db.close(); resolve() }; tx.onabort = () => reject(tx.error)
    })
  }, action)
}
try {
  await launch(); await seed()
  await expectSong('原创边栏练习', 'local-pane-first')
  checks.push('无历史记录时打开可用歌曲，保持暂停且不自动选词')

  await page.locator('.desktop-recent button').filter({ hasText: '另一首原创练习' }).click()
  await expectSong('另一首原创练习', 'local-pane-second')
  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  await restart(); await expectSong('另一首原创练习', 'local-pane-second')
  checks.push('学习非第一首后停留歌曲库退出，真正重启仍恢复该歌曲')

  await updateLibrary('newest'); await restart()
  await expectSong('另一首原创练习', 'local-pane-second')
  checks.push('新增排序更靠前的歌曲不会抢占上次正在学习的歌曲')

  await page.getByRole('button', { name: '跟唱练习', exact: true }).first().click()
  await page.locator('.desktop-sing').waitFor()
  await restart(); await expectSong('另一首原创练习', 'local-pane-second')
  checks.push('从跟唱退出后，重启学习页恢复同一歌曲且不自动播放')

  await page.evaluate(key => { localStorage.removeItem(key); localStorage.setItem('uta-desktop-recent-songs-v1', JSON.stringify(['local-pane-first', 'local-pane-second'])) }, key)
  await restart(); await expectSong('原创边栏练习', 'local-pane-first')
  checks.push('首次升级无专用记录时，复用旧版最近学习记录而不是导入顺序')

  await page.evaluate(key => localStorage.setItem(key, 'local-pane-second'), key)
  await updateLibrary('delete'); await restart()
  await expectSong('更新导入的原创歌', 'local-pane-newest')
  checks.push('上次学习的歌曲已删除时安全回退，更新有效记录')

  await updateLibrary('clear'); await restart()
  await page.waitForFunction(() => document.querySelector('#song-title')?.textContent !== '更新导入的原创歌')
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), 'local-pane-newest')
  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  assert.equal(await page.locator('.desktop-song-table tbody tr').count(), 0)
  checks.push('空库仍可操作，启动占位示例不会覆盖已保存的歌曲记录')

  assert.deepEqual(errors, [])
  const report = { passed: true, checks, errors, boundary: 'Actual isolated Windows EXE restarts; original WAV and lyrics; no daily-use data or external AI calls' }
  await fs.writeFile(path.join(evidence, 'resume-song-20261030.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { if (app) await app.close().catch(() => {}) }
