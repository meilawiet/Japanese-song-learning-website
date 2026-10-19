import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DESKTOP_FONT_GROUPS, DESKTOP_FONTS, desktopFontFamily } from '../src/lib/desktopFonts.js'
import { inspectLearningBackup } from '../src/lib/learningBackup.js'

const root = process.cwd(), work = path.join(root, 'work')
const source = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'release', 'UTA-Windows-x64')
const testDir = path.join(work, 'desktop-font-validation'), evidence = path.join(work, 'verification')
assert.equal(path.dirname(testDir), work)
await fs.rm(testDir, { recursive: true, force: true })
await fs.cp(source, testDir, { recursive: true, filter: filename => path.basename(filename) !== 'uta-data' })
const temporary = path.join(testDir, 'uta-data', 'tmp')
await fs.mkdir(temporary, { recursive: true }); await fs.mkdir(evidence, { recursive: true })
const env = { ...process.env, TEMP: temporary, TMP: temporary }
delete env.ELECTRON_RUN_AS_NODE
let app, page
const errors = [], fontFailures = [], loadedFonts = [], checks = []
async function launch() {
  app = await electron.launch({ executablePath: path.join(testDir, 'UTA.exe'), env, timeout: 90000 })
  page = await app.firstWindow({ timeout: 90000 })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (/Failed to decode downloaded font|OTS parsing error/i.test(message.text())) fontFailures.push(message.text()) })
  await page.locator('.desktop-shell').waitFor()
}
async function openFonts() {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '主题设置', exact: true }).click()
}
async function selectFont(font) {
  await page.getByLabel('应用字体', { exact: true }).selectOption(font.groupId)
  if (font.groupId === 'source-han-serif') await page.getByLabel('字体字重', { exact: true }).selectOption(font.id)
  await page.waitForFunction(id => document.documentElement.dataset.utaFont === id, font.id)
  await page.locator('.desktop-font-status').filter({ hasText: /已应用/ }).waitFor({ timeout: 45000 })
  await page.evaluate(() => document.fonts.ready)
}
try {
  await launch()
  assert.equal(await page.locator('html').getAttribute('data-uta-font'), 'yan-zhen-qing')
  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  await page.getByRole('button', { name: '导入歌曲', exact: true }).click()
  const wav = Buffer.alloc(44 + 8000 * 6 * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
  const form = page.locator('.song-import-dialog')
  await form.locator('input[type=file][accept*="audio"]').setInputFiles({ name: '字体测试.wav', mimeType: 'audio/wav', buffer: wav })
  await form.locator('input[type=file][accept*=".lrc"]').setInputFiles({ name: '字体测试.lrc', mimeType: 'text/plain', buffer: Buffer.from('[ti:字体切换验证]\n[ar:UTA]\n[00:00.50]学校へ帰る。\n[00:00.50]回学校。\n[00:02.00]夢を見よう。\n[00:02.00]一起做梦吧。') })
  await form.locator('.song-import-submit').click({ timeout: 45000 })
  await form.waitFor({ state: 'detached', timeout: 45000 })
  await page.locator('.lyrics-list .token-reading-kana').first().waitFor()
  await openFonts()
  assert.deepEqual(await page.getByLabel('应用字体', { exact: true }).locator('option').allTextContents(), DESKTOP_FONT_GROUPS.map(group => group.name))
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
  for (const font of DESKTOP_FONTS) {
    await selectFont(font)
    assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).fontFamily.replace(/["\s]/g, '')), desktopFontFamily(font.id).replace(/["\s]/g, ''))
    const { root: dom } = await cdp.send('DOM.getDocument')
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: dom.nodeId, selector: '.desktop-font-preview > p' })
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    if (font.family) assert.ok(fonts.some(item => item.isCustomFont && item.glyphCount > 0), `${font.id} must render real bundled glyphs`)
    loadedFonts.push({ id: font.id, rendered: fonts.map(item => ({ family: item.familyName, custom: item.isCustomFont, glyphs: item.glyphCount })) })
  }
  checks.push('all-13-supplied-font-files-render-custom-glyphs', 'existing-and-system-fonts-available', 'source-han-eight-weights-selectable')
  await selectFont(DESKTOP_FONTS.find(font => font.id === 'koku-mincho'))
  for (const [width, height, zoom] of [[1440, 960, 1], [1024, 768, 1], [1000, 720, 1.25]]) {
    await app.evaluate(({ BrowserWindow }, { width, height, zoom }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(width, height); window.webContents.setZoomFactor(zoom) }, { width, height, zoom })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const layout = await page.locator('.settings-dialog').evaluate(dialog => {
      const content = dialog.querySelector('.desktop-font-settings'), select = content.querySelector('select')
      return { dialog: dialog.getBoundingClientRect().toJSON(), select: select.getBoundingClientRect().toJSON(), contentWidth: content.clientWidth, scrollWidth: content.scrollWidth, width: innerWidth, height: innerHeight }
    })
    assert.ok(layout.dialog.left >= 0 && layout.dialog.right <= layout.width + 1 && layout.dialog.bottom <= layout.height + 1)
    assert.ok(layout.scrollWidth <= layout.contentWidth + 1)
    assert.ok(layout.select.right <= layout.dialog.right)
    if (width === 1440) {
      const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
      await fs.writeFile(path.join(evidence, 'desktop-font-settings.png'), Buffer.from(png, 'base64'))
    }
  }
  checks.push('small-window-and-125-percent-zoom')
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.webContents.setZoomFactor(1); window.setSize(1440, 960) })
  await page.getByRole('button', { name: '关闭设置', exact: true }).click()
  const lessonFamilies = await page.locator('.lyrics-list .lyric-row').first().evaluate(row => Object.fromEntries(['.token-reading-surface', '.token-reading-kana', '.token-reading-romaji', '.translation'].map(selector => [selector, getComputedStyle(row.querySelector(selector)).fontFamily])))
  for (const family of Object.values(lessonFamilies)) assert.ok(family.includes('UTA Koku Mincho'))
  await page.locator('.lyrics-list .line-number').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: /编辑歌词/ }).click()
  assert.ok((await page.locator('.line-editor input').first().evaluate(node => getComputedStyle(node).fontFamily)).includes('UTA Koku Mincho'))
  await page.locator('.line-editor').getByRole('button', { name: '取消', exact: true }).click()
  await page.locator('.desktop-sidebar nav').getByRole('button', { name: '跟唱练习', exact: true }).click()
  for (const mode of ['both', 'kana', 'romaji']) {
    await page.getByLabel('跟唱读音显示').selectOption(mode)
    const surface = await page.locator('.desktop-sing-words .token-reading-surface').first().evaluate(node => getComputedStyle(node).fontFamily)
    assert.ok(surface.includes('UTA Koku Mincho'))
    if (mode !== 'kana') assert.ok((await page.locator('.desktop-sing-words .token-reading-romaji').first().evaluate(node => getComputedStyle(node).fontFamily)).includes('UTA Koku Mincho'))
  }
  await page.getByRole('button', { name: '返回学习', exact: true }).click()
  checks.push('learning-and-singalong-share-font', 'lyric-editor-inherits-font')
  const backup = path.join(testDir, 'uta-data', 'backups', 'fonts.uta-backup')
  await app.evaluate(({ dialog, BrowserWindow }, filename) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename })
    BrowserWindow.getAllWindows()[0].webContents.session.on('will-download', (_event, item) => { item.on('done', (_event, state) => { globalThis.__fontBackupDone = state }) })
  }, backup)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置', exact: true })
  await settings.getByRole('button', { name: '数据管理', exact: true }).click()
  await settings.getByRole('button', { name: '导出备份', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.settings-data-card button')?.disabled === false)
  for (let attempt = 0; attempt < 50 && await app.evaluate(() => globalThis.__fontBackupDone) !== 'completed'; attempt++) await page.waitForTimeout(100)
  const inspected = await inspectLearningBackup(new Blob([await fs.readFile(backup)]))
  assert.equal(inspected.manifest.progress.desktopFont, 'koku-mincho')
  assert.equal(inspected.manifest.songs[0].title, '字体切换验证')
  await app.close(); await launch()
  assert.equal(await page.locator('html').getAttribute('data-uta-font'), 'koku-mincho')
  await openFonts()
  assert.equal(await page.getByLabel('应用字体', { exact: true }).inputValue(), 'koku-mincho')
  await page.getByRole('button', { name: '恢复默认字体', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.utaFont === 'yan-zhen-qing')
  checks.push('font-choice-persists-after-restart-and-backup', 'reset-default-font')
  assert.deepEqual(errors, []); assert.deepEqual(fontFailures, [])
  await fs.writeFile(path.join(evidence, 'desktop-fonts.json'), JSON.stringify({ passed: true, checks, loadedFonts }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, suppliedFontFiles: loadedFonts.filter(font => !['system', 'yan-zhen-qing'].includes(font.id)).length }))
} finally { if (app) await app.close().catch(() => {}) }
