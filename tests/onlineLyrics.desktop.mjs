import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const source = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'release', 'UTA-Windows-x64')
const testDir = path.join(root, 'work', 'UTA-online-lyrics-validation')
assert.equal(path.dirname(testDir), path.join(root, 'work'))
await fs.rm(testDir, { recursive: true, force: true })
await fs.mkdir(testDir, { recursive: true })
await fs.cp(source, testDir, { recursive: true, filter: item => path.basename(item) !== 'uta-data' })
await fs.mkdir(path.join(testDir, 'uta-data', 'tmp'), { recursive: true })
const environment = { ...process.env, TEMP: path.join(testDir, 'uta-data', 'tmp'), TMP: path.join(testDir, 'uta-data', 'tmp') }
delete environment.ELECTRON_RUN_AS_NODE
let client
try {
  client = await electron.launch({ executablePath: path.join(testDir, 'UTA.exe'), env: environment, timeout: 90000 })
  const page = await client.firstWindow({ timeout: 90000 })
  await page.waitForSelector('.desktop-shell', { timeout: 60000 })
  if (process.env.UTA_LIVE_LYRICS === '1') {
    const live = await page.evaluate(async () => {
      const lrclib = JSON.parse(await window.utaDesktop.requestLyrics('lrclib', 'search', 'Lemon 米津玄師'))
      const utaten = await window.utaDesktop.requestLyrics('utaten', 'search', 'Lemon')
      const document = new DOMParser().parseFromString(utaten, 'text/html')
      const candidate = [...document.querySelectorAll('.searchResult tr,.list__item')]
        .map(row => row.querySelector('td:first-child a[href],.list__title a[href]')?.getAttribute('href')?.match(/^\/lyric\/([a-z0-9]+)\/$/i)?.[1])
        .find(Boolean)
      const lyricPage = candidate ? await window.utaDesktop.requestLyrics('utaten', 'fetch', candidate) : ''
      const lyricDocument = new DOMParser().parseFromString(lyricPage, 'text/html')
      return { lrclib: lrclib.length, utaten: document.querySelectorAll('.searchResult tr,.list__item').length,
        utatenKana: Boolean(lyricDocument.querySelector('.lyricBody .hiragana')) }
    })
    assert.ok(live.lrclib > 0 && live.utaten > 0 && live.utatenKana, `真实歌词来源未返回可解析的候选：${JSON.stringify(live)}`)
    console.log(`live sources: ${JSON.stringify(live)}`)
  }
  await client.evaluate(({ ipcMain }) => {
    const seen = []
    globalThis.__lyricCalls = seen
    ipcMain.removeHandler('uta:lyrics:request')
    ipcMain.handle('uta:lyrics:request', async (_event, payload) => {
      seen.push(payload)
      if (payload.value === '搜索失败测试') throw new Error('模拟歌词源暂不可用')
      if (payload.value === '延迟搜索测试') await new Promise(resolve => setTimeout(resolve, 500))
      if (payload.source === 'lrclib' && ['替换测试', '读音更新测试'].includes(payload.value)) return JSON.stringify([{ id: 19, trackName: '不同的候选歌名', artistName: '其他歌手', duration: 1,
        syncedLyrics: `[00:00.50]明日（${payload.value === '读音更新测试' ? 'あした' : 'あす'}）の歌\n[00:00.50]明天的歌\n[00:00.50]asu no uta\n[00:00.80]歌う。` }])
      if (payload.source === 'lrclib') return JSON.stringify([{ id: 17, trackName: '二人の歌', artistName: 'UTA', duration: 8,
        syncedLyrics: '[00:00.50]二人（ふたり）の思い出(おもいで)\n[00:02.00]歌う。' }])
      if (payload.action === 'search') return '<table class="searchResult"><tr><td><a href="/lyric/abc123/">二人の歌</a></td><td class="searchResult__artist"><a>UTA</a></td></tr></table>'
      return '<div class="lyricBody"><div class="hiragana"><ruby><rb>二人</rb><rt>ふたり</rt></ruby>の<br></div></div>'
    })
  })
  const wav = Buffer.alloc(44 + 8000 * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(8000 * 2, 40)

  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  await page.getByRole('button', { name: '导入歌曲', exact: true }).click()
  const form = page.locator('.song-import-dialog')
  await form.locator('input[type=file][accept*=".lrc"]').setInputFiles({ name: 'local.lrc', mimeType: 'text/plain', buffer: Buffer.from('[00:00.50]二人（ふたり）の歌') })
  await form.locator('input[type=file][accept*="audio"]').setInputFiles({ name: '二人の歌.wav', mimeType: 'audio/wav', buffer: wav })
  await page.waitForTimeout(300)
  assert.equal(await form.locator('.desktop-online-lyrics').count(), 0)
  assert.equal(await client.evaluate(() => globalThis.__lyricCalls.length), 0)

  // Clearing the local file exposes online candidates. The chosen LRCLIB line
  // retains its own kana in the review and then in the saved line data.
  await form.locator('input[type=file][accept*=".lrc"]').setInputFiles([])
  await form.locator('.desktop-online-lyrics .online-song-results li').first().waitFor({ timeout: 20000 })
  await form.locator('.desktop-online-lyrics .online-song-results li').first().getByRole('button', { name: '选用并预览' }).click()
  await form.getByLabel('单首歌词轨道预览').waitFor()
  const original = form.getByLabel('第 1 行原文')
  assert.match(await original.inputValue(), /二人（ふたり）/)

  // UtaTen's structured kana is previewable but cannot be saved without
  // sentence timestamps; a user must enter the real timing.
  await form.getByLabel('歌词来源').selectOption('utaten')
  await form.getByRole('button', { name: '搜索', exact: true }).click()
  await form.locator('.desktop-online-lyrics .online-song-results li').first().getByRole('button', { name: '选用并预览' }).click()
  await form.getByText('这份歌词没有时间轴，请逐句填写时间戳后导入；自带假名会优先保留。').waitFor()
  assert.equal(await form.getByLabel('第 1 行时间戳').inputValue(), '')
  assert.match(await form.getByLabel('第 1 行原文').inputValue(), /二人（ふたり）/)
  assert.ok(await client.evaluate(() => globalThis.__lyricCalls.some(call => call.source === 'utaten' && call.action === 'fetch')))
  await form.getByLabel('第 1 行时间戳').fill('00:00.500')
  await form.locator('.song-import-submit').click()
  await form.waitFor({ state: 'detached', timeout: 30000 })
  const saved = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('uta-local-song-library')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result, transaction = db.transaction('songs', 'readonly'), read = transaction.objectStore('songs').getAll()
      read.onsuccess = () => { resolve(read.result.map(song => ({ id: song.id, title: song.title, lines: song.lines }))); db.close() }
      read.onerror = () => reject(read.error)
    }
  }))
  const imported = saved.find(song => song.title === '二人の歌')
  assert.ok(imported)
  assert.equal(imported.lines[0].text, '二人の')
  assert.equal(imported.lines[0].sourceReadings[0].reading, 'ふたり')
  assert.equal(imported.lines[0].start, 0.5)
  await page.waitForFunction(songId => {
    const annotations = JSON.parse(localStorage.getItem('uta-auto-annotations-v5') || '{}')
    return annotations[songId]?.some(line => line.tokens.some(token => token.reading_source === 'lyric' && token.reading === 'ふたり'))
  }, imported.id, { timeout: 30000 })
  // Edit an existing song through the same sources and track preview as import.
  async function readSong() {
    return page.evaluate(id => new Promise((resolve, reject) => {
      const open = indexedDB.open('uta-local-song-library')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => { const db = open.result, tx = db.transaction('songs'), req = tx.objectStore('songs').get(id); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); tx.oncomplete = () => db.close() }
    }), imported.id)
  }
  const previous = await readSong()
  async function editSong() {
    await page.getByRole('button', { name: '歌曲库', exact: true }).click()
    await page.locator('.desktop-song-table tbody tr').filter({ hasText: imported.title }).click()
    await page.getByRole('button', { name: '编辑歌曲信息', exact: true }).click()
    const editor = page.locator('.song-editor')
    await editor.getByRole('button', { name: '联网搜索并替换歌词', exact: true }).click()
    await editor.locator('.online-song-results li').first().waitFor()
    await editor.getByLabel('歌词来源', { exact: true }).selectOption('lrclib')
    return editor
  }
  let editor = await editSong()
  assert.equal(await editor.getByLabel('在线搜索歌曲名称').inputValue(), `${previous.title} ${previous.artist}`)
  await editor.getByLabel('在线搜索歌曲名称').fill('替换测试')
  await editor.getByLabel('在线搜索歌曲名称').press('Enter')
  await editor.getByText('不同的候选歌名', { exact: true }).waitFor()
  assert.equal(await editor.count(), 1, 'Enter in search must not save or close the song editor')
  await editor.getByRole('button', { name: '选用并预览', exact: true }).click()
  await editor.getByLabel('替换歌词轨道预览').waitFor()
  assert.match(await editor.getByLabel('第 1 行原文').inputValue(), /明日（あす）/)
  await client.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 768))
  await editor.getByLabel('替换歌词预览', { exact: true }).scrollIntoViewIfNeeded()
  const bounds = await editor.getByRole('button', { name: '保存修改', exact: true }).boundingBox()
  assert.ok(bounds.y + bounds.height <= (await page.evaluate(() => innerHeight)) + 1)
  assert.ok(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1))
  const screenshot = await client.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await fs.writeFile(path.join(root, 'work', 'verification', 'song-editor-online-preview.png'), Buffer.from(screenshot, 'base64'))

  assert.equal(await editor.getByLabel('第 2 行译文').inputValue(), '明天的歌')
  assert.equal(await editor.getByLabel('第 3 行罗马音').inputValue(), 'asu no uta')
  assert.deepEqual((await readSong()).lines, previous.lines, 'preview cannot write the database')
  assert.equal(await editor.getByRole('button', { name: '保存修改', exact: true }).isDisabled(), true)
  await editor.getByRole('button', { name: '取消替换', exact: true }).click()
  assert.equal(await editor.getByLabel('日文歌词', { exact: true }).first().inputValue(), previous.lines[0].text)
  await editor.getByRole('button', { name: '选用并预览', exact: true }).click()
  await editor.getByLabel('替换歌词轨道预览').waitFor()
  await editor.getByRole('button', { name: '应用替换到草稿', exact: true }).click()
  assert.equal(await editor.getByLabel('日文歌词', { exact: true }).first().inputValue(), '明日の歌')
  await editor.getByRole('button', { name: '撤销编辑', exact: true }).click()
  assert.equal(await editor.getByLabel('日文歌词', { exact: true }).first().inputValue(), previous.lines[0].text)
  await editor.getByRole('button', { name: '重做编辑', exact: true }).click()
  assert.deepEqual((await readSong()).lines, previous.lines, 'draft changes cannot write the database')
  await editor.getByRole('button', { name: '保存修改', exact: true }).click()
  await editor.waitFor({ state: 'detached' })
  const replaced = await readSong()
  assert.equal(replaced.title, previous.title); assert.equal(replaced.artist, previous.artist)
  assert.equal(replaced.audioName, previous.audioName); assert.equal(replaced.audioBlob.size, previous.audioBlob.size)
  assert.equal(replaced.lines[0].text, '明日の歌')
  assert.equal(replaced.lines[0].translation, '明天的歌')
  assert.equal(replaced.lines[0].romaji, 'asu no uta')
  assert.equal(replaced.lines[0].sourceReadings[0].reading, 'あす')
  await page.waitForFunction(id => JSON.parse(localStorage.getItem('uta-auto-annotations-v5') || '{}')[id]?.find(line => line.id === 0)?.tokens.some(t => t.reading_source === 'lyric' && t.reading === 'あす'), imported.id)
  await page.evaluate(id => { const key = 'uta-pronunciation-progress-v2', p = JSON.parse(localStorage.getItem(key)); p.learnedBySong[id] = [0]; localStorage.setItem(key, JSON.stringify(p)) }, imported.id)
  await page.reload(); await page.locator('.desktop-shell').waitFor()
  assert.equal((await readSong()).lines[0].sourceReadings[0].reading, 'あす')
  editor = await editSong()
  await editor.getByLabel('在线搜索歌曲名称').fill('读音更新测试')
  await editor.getByLabel('在线搜索歌曲名称').press('Enter')
  await editor.getByText('不同的候选歌名', { exact: true }).waitFor()
  await editor.getByRole('button', { name: '选用并预览', exact: true }).click()
  await editor.getByRole('button', { name: '应用替换到草稿', exact: true }).click()
  await editor.getByRole('button', { name: '保存修改', exact: true }).click()
  await editor.waitFor({ state: 'detached' })
  await page.waitForFunction(id => JSON.parse(localStorage.getItem('uta-auto-annotations-v5') || '{}')[id]?.find(line => line.id === 0)?.tokens.some(t => t.reading_source === 'lyric' && t.reading === 'あした'), imported.id)
  assert.deepEqual(await page.evaluate(id => JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).learnedBySong[id], imported.id), [0])
  editor = await editSong()
  await editor.getByLabel('歌词来源', { exact: true }).selectOption('utaten')
  await editor.getByRole('button', { name: '搜索', exact: true }).click()
  await editor.getByRole('button', { name: '选用并预览', exact: true }).click()
  assert.equal(await editor.getByRole('button', { name: '应用替换到草稿', exact: true }).isDisabled(), true)
  await editor.getByRole('button', { name: '取消替换', exact: true }).click()
  await editor.getByLabel('歌词来源', { exact: true }).selectOption('lrclib')
  await editor.getByLabel('在线搜索歌曲名称').fill('搜索失败测试')
  await editor.getByLabel('在线搜索歌曲名称').press('Enter')
  await editor.getByText(/模拟歌词源暂不可用/).waitFor()
  assert.equal(await editor.getByLabel('日文歌词', { exact: true }).first().inputValue(), '明日の歌')
  await editor.getByLabel('在线搜索歌曲名称').fill('延迟搜索测试')
  await editor.getByLabel('在线搜索歌曲名称').press('Enter')
  await editor.getByRole('button', { name: '关闭编辑', exact: true }).click()
  await page.waitForTimeout(600)
  assert.equal(await page.locator('.song-editor-replacement').count(), 0)
  const checks = ['editor-search-enter-does-not-submit', 'editor-preview-no-write-and-cancel', 'editor-replacement-undo-redo', 'editor-replacement-keeps-metadata-and-audio', 'editor-persists-three-tracks-and-source-kana', 'editor-kana-refresh-keeps-mastery', 'editor-untimed-blocked-and-failure-keeps-draft', 'editor-closed-search-discards-late-result']
  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  await page.getByRole('button', { name: '导入歌曲', exact: true }).click()
  await page.locator('.song-import-dialog').getByRole('button', { name: '批量导入', exact: true }).click()
  const batch = page.locator('.batch-import-dialog')
  await batch.getByLabel('批量选择音频文件', { exact: true }).setInputFiles([
    { name: '有歌词.wav', mimeType: 'audio/wav', buffer: wav },
    { name: '缺歌词.wav', mimeType: 'audio/wav', buffer: wav },
  ])
  await batch.getByLabel('批量选择歌词文件', { exact: true }).setInputFiles({
    name: '有歌词.lrc', mimeType: 'text/plain', buffer: Buffer.from('[00:00.500]本地歌词。'),
  })
  await page.waitForFunction(() => document.querySelectorAll('.batch-import-row').length === 2 && !document.querySelector('.batch-import-progress'))
  assert.equal(await batch.locator('.batch-import-row').first().getByRole('button', { name: '联网查找歌词' }).count(), 0)
  await batch.locator('.batch-import-row').nth(1).getByRole('button', { name: '联网查找歌词' }).click()
  await batch.locator('.batch-import-row').nth(1).locator('.online-song-results li').first().getByRole('button', { name: '选用并预览' }).click()
  await batch.getByLabel('第 2 首歌词轨道预览').waitFor()
  assert.match(await batch.getByLabel('第 1 行原文').inputValue(), /二人（ふたり）/)
  await batch.getByRole('button', { name: '清空文件' }).click()
  await batch.getByRole('button', { name: '关闭导入窗口' }).click()
  console.log(JSON.stringify({ passed: true, checks: ['local-lyrics-suppress-search', 'lrclib-source-kana-preview', 'utaten-kana-requires-timestamps', 'import-persists-source-kana', 'source-kana-overrides-dictionary', 'batch-search-only-unpaired', ...checks] }))
} finally {
  if (client) await client.close()
}
