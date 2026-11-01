import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd(), home = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'work', 'saved-song-tracks-candidate-20261031')
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
    const lines = [{ id: 10, start: 1, end: 3.8, text: '明日の空を歌う', translation: '向明日的天空歌唱', romaji: 'I sing again', sourceReadings: [{ start: 0, end: 2, reading: 'あす' }] },
      { id: 20, start: 4, text: '風と歩く', translation: '与风同行', romaji: 'kaze to aruku' }, { id: 40, start: 8, text: 'また空へ歌う', translation: '再次向天空歌唱' }]
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



const editor = () => page.locator('.song-editor')
const review = () => page.getByRole('region', { name: '已导入歌词轨道调整', exact: true })
const apply = () => review().getByRole('button', { name: '应用轨道调整到草稿', exact: true })
async function open() {
  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  await page.locator('.desktop-song-table tbody tr').filter({ hasText: '原创边栏练习' }).locator('.desktop-song-select').click()
  await page.getByRole('button', { name: '编辑歌曲信息', exact: true }).click()
  await editor().waitFor()
}
async function stored() {
  return await page.evaluate(async () => {
    const request = indexedDB.open('uta-local-song-library', 1)
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const song = await new Promise((resolve, reject) => { const req = db.transaction('songs').objectStore('songs').get('local-pane-first'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    db.close()
    return { lines: song.lines, title: song.title, artist: song.artist, audioName: song.audioName, bytes: [...new Uint8Array(await song.audioBlob.arrayBuffer())] }
  })
}
async function learning() {
  return await page.evaluate(() => ({ progress: JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')), annotations: JSON.parse(localStorage.getItem('uta-auto-annotations-v5')), ai: JSON.parse(localStorage.getItem('uta-sentence-explanations-v1')) }))
}
async function classify() {
  await editor().getByRole('button', { name: '重新归类与配对', exact: true }).click()
  await review().getByLabel('第 3 行轨道', { exact: true }).selectOption('original')
  await review().getByLabel('第 3 行时间戳', { exact: true }).fill('00:03.900')
  await review().getByLabel('第 8 行对应原文', { exact: true }).selectOption('saved-10-romaji')
  await review().getByLabel('第 5 行轨道', { exact: true }).selectOption('romaji')
  await review().getByLabel('第 5 行罗马音', { exact: true }).fill('kaze to aruku')
  await review().getByLabel('第 5 行对应原文', { exact: true }).selectOption('saved-20-original')
  await review().getByLabel('第 6 行轨道', { exact: true }).selectOption('translation')
  await review().getByLabel('第 6 行译文', { exact: true }).fill('与风同行（修正）')
  await review().getByLabel('第 6 行对应原文', { exact: true }).selectOption('saved-20-original')
}
async function screenshot(name) {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await fs.writeFile(path.join(evidence, name), Buffer.from(png, 'base64'))
}
async function save() {
  await editor().getByRole('button', { name: '保存修改', exact: true }).click()
  await editor().waitFor({ state: 'detached' })
}
try {
  await launch(); await seed()
  const before = await stored(), beforeLearning = await learning()
  await open()
  await editor().getByRole('button', { name: '重新归类与配对', exact: true }).click()
  assert.equal(await review().locator('.lrc-review-rows > li').count(), 8)
  assert.equal(await review().getByLabel('第 3 行罗马音', { exact: true }).inputValue(), 'I sing again')
  assert.equal(await review().getByLabel('第 5 行对应原文', { exact: true }).inputValue(), 'saved-20-original')
  await review().getByLabel('第 5 行对应原文', { exact: true }).selectOption('saved-10-original')
  await review().getByText('同一句已有译文，请调整轨道或插入新原文。', { exact: true }).waitFor()
  assert.equal(await apply().isDisabled(), true)
  await review().getByLabel('第 5 行对应原文', { exact: true }).selectOption('saved-20-original')
  await review().getByLabel('第 7 行轨道', { exact: true }).selectOption('ignore')
  await review().getByText('对应原文已被删除或改为其他轨道，请重新选择对应原文。', { exact: true }).waitFor()
  assert.equal(await apply().isDisabled(), true)
  await review().getByRole('button', { name: '取消轨道调整', exact: true }).click()
  assert.deepEqual(await stored(), before)
  checks.push('从歌曲库重新展开已保存三轨，冲突和被移除的配对会阻止应用，取消不写入数据')

  await classify()
  assert.equal(await apply().isEnabled(), true)
  const preview = review().getByLabel('调整后的歌词预览', { exact: true })
  assert.equal(await preview.locator('li').count(), 4)
  assert.match(await preview.locator('li').nth(1).innerText(), /I sing again[\s\S]*再次向天空歌唱/)
  await review().locator('.lrc-review-scroll').evaluate(node => { node.scrollTop = 0 })
  await review().getByRole('heading', { name: '调整原文、译文与罗马音' }).scrollIntoViewIfNeeded()
  await screenshot('saved-song-tracks-editor-20261031.png')
  await apply().click()
  assert.equal(await editor().locator('.song-editor-lines > li').count(), 4)
  assert.deepEqual(await stored(), before)
  await editor().getByRole('button', { name: '撤销编辑', exact: true }).click()
  assert.equal(await editor().locator('.song-editor-lines > li').count(), 3)
  await editor().getByRole('button', { name: '重做编辑', exact: true }).click()
  assert.equal(await editor().locator('.song-editor-lines > li').count(), 4)
  checks.push('误存罗马音可提升为原文，译文与罗马音可互换和重新配对；应用仅改草稿且可撤销重做')

  await save()
  const saved = await stored()
  assert.deepEqual(saved.lines.map(line => [line.id, line.text, line.translation, line.romaji]), [
    [10, '明日の空を歌う', '向明日的天空歌唱', ''], [41, 'I sing again', '再次向天空歌唱', ''],
    [20, '風と歩く', '与风同行（修正）', 'kaze to aruku'], [40, 'また空へ歌う', '', '']])
  assert.equal(saved.lines[0].end, 3.8)
  assert.deepEqual(saved.lines[0].sourceReadings, before.lines[0].sourceReadings)
  for (const field of ['title', 'artist', 'audioName', 'bytes']) assert.deepEqual(saved[field], before[field])
  const afterLearning = await learning()
  assert.deepEqual(afterLearning.progress.learnedBySong['local-pane-first'], [10, 20])
  assert.equal(afterLearning.progress.corrections['local-pane-first:10:0'], 'あす')
  assert.deepEqual(afterLearning.annotations['local-pane-first'].find(line => line.id === 10), beforeLearning.annotations['local-pane-first'].find(line => line.id === 10))
  assert.equal(afterLearning.ai['local-pane-first'], undefined)
  checks.push('保存准确写入四句与配对，保留音频、原文未变句的学习记录、自带注音及手动结束时间，清除过时AI上下文')

  await page.getByRole('button', { name: '撤销本次歌曲编辑', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.desktop-edit-checkpoint'))
  assert.deepEqual(await stored(), before)
  checks.push('保存后的歌曲编辑仍可撤销，恢复原来的错误分轨及完整音频和学习数据')

  await open(); await classify(); await apply().click(); await save()
  await app.close(); app = null; await launch()
  assert.deepEqual((await stored()).lines, saved.lines)
  await open(); await editor().getByRole('button', { name: '重新归类与配对', exact: true }).click()
  assert.equal(await review().getByLabel('第 3 行轨道', { exact: true }).inputValue(), 'original')
  assert.equal(await apply().isEnabled(), true)
  await apply().click(); await save()
  assert.deepEqual((await stored()).lines, saved.lines)
  checks.push('真实重启保留配对，再次展开和无改动保存不会重编号或丢失注音与结束时间')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 650))
  await open(); await editor().getByRole('button', { name: '重新归类与配对', exact: true }).click()
  assert.ok(await editor().evaluate(node => node.scrollWidth <= node.clientWidth + 1))
  const applyBox = await editor().getByRole('button', { name: '保存修改', exact: true }).boundingBox()
  assert.ok(applyBox.y + applyBox.height <= 650)
  await editor().getByRole('button', { name: '取消轨道调整', exact: true }).scrollIntoViewIfNeeded()
  await screenshot('saved-song-tracks-compact-20261031.png')
  await editor().getByRole('button', { name: '取消轨道调整', exact: true }).click()
  await editor().getByRole('button', { name: '取消', exact: true }).click()
  await editor().waitFor({ state: 'detached' })
  checks.push('1024×650小窗口无横向溢出，保存与取消可见，退出预览后可正常关闭编辑器')
  assert.deepEqual(errors, [])
  const report = { passed: true, checks, errors, boundary: 'Actual isolated Windows EXE; original lyrics/audio only; reclassification, DB, learning identity, undo and restart verified; no daily-use data or external AI calls' }
  await fs.writeFile(path.join(evidence, 'saved-song-tracks-20261031.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  await screenshot('saved-song-tracks-failure-20261031.png').catch(() => {})
  console.error(JSON.stringify({ checks, errors })); throw error
} finally {
  if (app) {
    // This isolated test owns all drafts; never leave a native confirmation open on failure.
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1 }).catch(() => {})
    await app.close().catch(() => {})
  }
}
