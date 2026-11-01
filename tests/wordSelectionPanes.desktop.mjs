import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd(), home = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'work', 'word-selection-panes-candidate-20261029')
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
  })
  await page.reload(); await page.locator('.lyrics-list .lyric-token').first().waitFor()
  await page.waitForFunction(() => document.querySelector('audio').readyState >= 1)
}
async function noWordSelection() {
  assert.equal(await selection().count(), 0)
  assert.equal(await page.locator('.lyrics-list .lyric-token.range-selected').count(), 0)
}
async function screenshot(name) {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await fs.writeFile(path.join(evidence, name), Buffer.from(png, 'base64'))
}
try {
  await launch(); await seed()
  await noWordSelection(); assert.equal(await pane().isVisible(), false)
  assert.equal(await page.getByRole('button', { name: '展开右侧栏', exact: true }).getAttribute('aria-expanded'), 'false')
  checks.push('启动不默认高亮词语，右侧栏默认收起')

  await rows().nth(1).locator('.line-number').dblclick()
  await page.waitForFunction(() => !document.querySelector('audio').paused)
  await noWordSelection(); assert.equal(await pane().isVisible(), false)
  await rows().nth(1).locator('.line-number').dblclick()
  await page.waitForFunction(() => document.querySelector('audio').paused)
  checks.push('双击卡片播放暂停，不选中默认词也不展开词栏')

  const word = rows().first().locator('.lyric-token').nth(2)
  await word.click(); await page.locator('.word-main h3').filter({ hasText: '空' }).waitFor()
  assert.equal(await selection().count(), 1); assert.equal(await selection().innerText(), await word.innerText())
  assert.equal(await pane().isVisible(), true)
  // Give React effects time to expose accidental first-token fallback.
  await page.waitForFunction(() => document.querySelector('.word-main h3')?.textContent === '空')
  await screenshot('word-selection-pane-open-20261029.png')
  await rows().first().locator('.translation').click()
  await noWordSelection(); assert.equal(await pane().isVisible(), false)
  checks.push('跨句点非首词高亮并显示正确词义，点空白清选中且收起自动词栏')

  await page.getByRole('button', { name: '展开右侧栏', exact: true }).click()
  await page.getByText('点击歌词中的具体词语，查看词义和校对读音。', { exact: true }).waitFor()
  const width = await pane().evaluate(node => node.getBoundingClientRect().width)
  await page.getByRole('separator', { name: '调整校对面板宽度', exact: true }).focus(); await page.keyboard.press('ArrowLeft')
  const resized = await pane().evaluate(node => node.getBoundingClientRect().width)
  assert.ok(resized > width)
  await word.click(); await rows().first().locator('.translation').click()
  await noWordSelection(); assert.equal(await pane().isVisible(), true)
  await page.getByRole('button', { name: '收起右侧栏', exact: true }).click()
  await page.getByRole('button', { name: '展开右侧栏', exact: true }).click()
  assert.ok(Math.abs(await pane().evaluate(node => node.getBoundingClientRect().width) - resized) < 2)
  checks.push('手动展开右栏保持展开，收放不丢失调整的宽度')

  const nav = page.getByLabel('桌面导航', { exact: true })
  await page.getByRole('separator', { name: '调整导航栏宽度', exact: true }).focus(); await page.keyboard.press('ArrowRight')
  const navWidth = await nav.evaluate(node => node.getBoundingClientRect().width)
  const beforeLeft = await page.locator('main#top').evaluate(node => node.getBoundingClientRect().width)
  await page.getByRole('button', { name: '收起左侧栏', exact: true }).click()
  assert.equal(await nav.isVisible(), false)
  assert.ok(await page.locator('main#top').evaluate(node => node.getBoundingClientRect().width) > beforeLeft + 170)
  await page.getByRole('button', { name: '展开左侧栏', exact: true }).click()
  assert.equal(await nav.evaluate(node => node.getBoundingClientRect().width), navWidth)
  checks.push('顶栏左按钮释放歌词空间并恢复原导航宽度')

  await page.getByRole('button', { name: '收起右侧栏', exact: true }).click()
  await rows().nth(2).locator('.lyric-token').nth(1).focus(); await page.keyboard.press('Enter')
  await pane().waitFor({ state: 'visible' }); assert.equal(await selection().count(), 1)
  assert.equal(await page.locator('.word-main h3').innerText(), '空')
  await rows().nth(2).locator('.translation').click(); await noWordSelection()
  checks.push('键盘激活词语等同明确点词，空白取消所有词语高亮')

  await rows().first().locator('.line-number').click()
  await rows().nth(2).locator('.line-number').click({ modifiers: ['Control'] })
  assert.equal(await page.locator('.desktop-range-selected').count(), 3)
  assert.equal(await selection().count(), 0)
  await page.getByRole('button', { name: '取消歌词多选', exact: true }).click()
  const firstWord = rows().first().locator('.lyric-token').first(), thirdWord = rows().first().locator('.lyric-token').nth(2)
  const firstBox = await firstWord.boundingBox(), thirdBox = await thirdWord.boundingBox()
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2); await page.mouse.down()
  await page.mouse.move(thirdBox.x + thirdBox.width / 2, thirdBox.y + thirdBox.height / 2, { steps: 8 }); await page.mouse.up()
  await page.getByRole('button', { name: 'AI 解释', exact: true }).waitFor()
  assert.ok(await page.locator('.lyric-token.range-selected').count() >= 3)
  checks.push('Ctrl连续选句和拖选短语保留，未混同为默认词选择')

  await rows().first().locator('.translation').click()
  await rows().first().locator('.lyric-token').first().dblclick()
  await page.waitForFunction(() => !document.querySelector('audio').paused)
  await noWordSelection(); assert.equal(await pane().isVisible(), false)
  await page.keyboard.press('Escape')
  checks.push('双击词语仍播放整句，结束双击后不留词语高亮或自动详情栏')

  await word.click()
  await rows().first().locator('.line-number').click({ button: 'right' })
  await page.getByRole('menuitem', { name: /编辑歌词/ }).click()
  await page.locator('.line-editor').getByLabel('中文译文').fill('原创编辑后的译文')
  await page.locator('.line-editor').getByRole('button', { name: '保存修改', exact: true }).click()
  await page.locator('.line-editor').waitFor({ state: 'detached' })
  await noWordSelection(); assert.equal(await pane().isVisible(), false)
  checks.push('保存歌词编辑后清理旧词选中，避免分词索引改变后高亮另一个词')

  await word.click(); await pane().waitFor({ state: 'visible' })
  await page.locator('.desktop-recent button').filter({ hasText: '另一首原创练习' }).click()
  await noWordSelection(); assert.equal(await pane().isVisible(), false)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 800))
  await page.getByRole('button', { name: '收起左侧栏', exact: true }).click()
  await page.getByRole('button', { name: '展开右侧栏', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25))
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await screenshot('word-selection-panes-compact-20261029.png')
  checks.push('切歌不遗留选中，1024窗口与125%缩放下边栏按钮可用且无页面横向溢出')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
  await app.close(); app = null; await launch()
  const restartedNav = page.getByLabel('桌面导航', { exact: true })
  assert.equal(await restartedNav.isVisible(), false)
  assert.equal(await pane().isVisible(), false)
  await noWordSelection()
  await page.getByRole('button', { name: '展开左侧栏', exact: true }).click()
  assert.equal(await restartedNav.evaluate(node => node.getBoundingClientRect().width), navWidth)
  checks.push('重启保留左栏收放和两栏宽度，右栏与词语选中不自动弹出')
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(evidence, 'word-selection-panes-20261029.json'), JSON.stringify({ passed: true, checks, errors, boundary: 'Actual isolated Windows EXE, original local WAV/lyrics, no production data or external AI calls' }, null, 2))
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2))
} catch (error) {
  await screenshot('word-selection-panes-failure-20261029.png').catch(() => {})
  console.error(JSON.stringify({ checks, errors }, null, 2)); throw error
} finally { if (app) await app.close().catch(() => {}) }
