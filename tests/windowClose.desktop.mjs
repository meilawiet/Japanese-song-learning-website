import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd(), work = path.join(root, 'work')
const source = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'release', 'UTA-Windows-x64')
const testDir = path.join(work, 'window-close-validation'), evidence = path.join(work, 'verification')
assert.equal(path.dirname(testDir), work)
await fs.rm(testDir, { recursive: true, force: true })
await fs.cp(source, testDir, { recursive: true, filter: filename => path.basename(filename) !== 'uta-data' })
const temporary = path.join(testDir, 'uta-data', 'tmp')
await fs.mkdir(temporary, { recursive: true }); await fs.mkdir(evidence, { recursive: true })
const env = { ...process.env, TEMP: temporary, TMP: temporary }
delete env.ELECTRON_RUN_AS_NODE
let app, page
const errors = [], checks = []
async function launch() {
  app = await electron.launch({ executablePath: path.join(testDir, 'UTA.exe'), env, timeout: 90000 })
  page = await app.firstWindow({ timeout: 90000 }); page.on('pageerror', error => errors.push(error.message))
  await page.locator('.desktop-shell').waitFor()
  await app.evaluate(({ dialog, Tray }) => {
    globalThis.__closeChoices = []; globalThis.__closePrompts = []; globalThis.__warnings = 0; globalThis.__discard = false
    dialog.showMessageBox = async (_window, options) => { globalThis.__closePrompts.push(options); return globalThis.__closeChoices.shift() || { response: 2, checkboxChecked: false } }
    dialog.showMessageBoxSync = () => { globalThis.__warnings++; return globalThis.__discard ? 1 : 0 }
    const original = Tray.prototype.setContextMenu
    Tray.prototype.setContextMenu = function(menu) { globalThis.__tray = this; globalThis.__trayMenu = menu; return original.call(this, menu) }
  })
}
async function closeWindow(choice) {
  await app.evaluate(({ BrowserWindow }, choice) => { if (choice) globalThis.__closeChoices.push(choice); BrowserWindow.getAllWindows()[0].close() }, choice)
}
async function visible() { return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()) }
async function restore() { await app.evaluate(() => globalThis.__tray.emit('click')); assert.equal(await visible(), true) }
async function openGeneral() {
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '常规设置', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.desktop-close-setting select')?.disabled)
}
try {
  await launch()
  const marker = path.join(testDir, 'uta-data', 'preservation-marker.json')
  await fs.writeFile(marker, '{"preserve":"original learning data"}')
  await closeWindow({ response: 2, checkboxChecked: true })
  assert.equal(await visible(), true)
  assert.equal((await page.evaluate(() => window.utaDesktop.loadCloseBehavior())).behavior, 'ask')
  const options = await app.evaluate(() => globalThis.__closePrompts[0])
  assert.deepEqual(options.buttons, ['最小化到系统托盘', '直接退出', '取消'])
  assert.match(options.checkboxLabel, /记住我的选择/)
  checks.push('native-close-chooser-with-remember-and-cancel')
  // Hiding must preserve an unfinished real editor and its draft registration.
  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  await page.getByRole('button', { name: '导入歌曲', exact: true }).click()
  await page.locator('.song-import-dialog input[type=file][accept*=".lrc"]').setInputFiles({ name: '未保存.lrc', mimeType: 'text/plain', buffer: Buffer.from('[00:01.00]学校へ帰る。') })
  await page.locator('.song-import-dialog').getByText('未保存.lrc', { exact: true }).waitFor()
  await closeWindow({ response: 0, checkboxChecked: true })
  assert.equal(await visible(), false)
  assert.equal(await app.evaluate(() => globalThis.__tray.isDestroyed()), false)
  assert.equal(await app.evaluate(() => globalThis.__warnings), 0)
  assert.equal((await page.evaluate(() => window.utaDesktop.loadCloseBehavior())).behavior, 'tray')
  await restore()
  assert.match(await page.locator('.song-import-dialog').innerText(), /未保存\.lrc/)
  await closeWindow()
  assert.equal(await visible(), false)
  assert.equal(await app.evaluate(() => globalThis.__closePrompts.length), 2)
  await restore()
  // An explicit quit from the real tray menu still checks the unsaved draft.
  await app.evaluate(() => { globalThis.__trayMenu.items.find(item => item.label === '退出 UTA').click() })
  assert.equal(await visible(), true)
  assert.equal(await app.evaluate(() => globalThis.__warnings), 1)
  checks.push('real-tray-hide-restore-preserves-unsaved-editor', 'remembered-tray-skips-chooser', 'tray-quit-checks-unsaved-edits')
  await page.evaluate(() => { window.confirm = () => true })
  await page.locator('.song-import-dialog').getByRole('button', { name: '关闭导入窗口', exact: true }).click()
  await app.close(); app = null
  await launch()
  await closeWindow()
  assert.equal(await visible(), false)
  assert.equal(await app.evaluate(() => globalThis.__closePrompts.length), 0)
  await restore()
  await app.evaluate(() => { globalThis.__trayMenu.items.find(item => item.label === '设置').click() })
  await page.getByRole('dialog', { name: '设置', exact: true }).waitFor()
  await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '常规设置', exact: true }).click()
  const setting = page.getByLabel('关闭窗口时的操作', { exact: true })
  await page.waitForFunction(() => !document.querySelector('.desktop-close-setting select')?.disabled)
  assert.equal(await setting.inputValue(), 'tray')
  for (const behavior of ['quit', 'ask']) {
    await setting.selectOption(behavior)
    await page.locator('.desktop-close-status').filter({ hasText: '已保存' }).waitFor()
    assert.equal((await page.evaluate(() => window.utaDesktop.loadCloseBehavior())).behavior, behavior)
  }
  await closeWindow({ response: 0, checkboxChecked: true })
  await restore()
  await page.waitForFunction(() => document.querySelector('.desktop-close-setting select')?.value === 'tray')
  await setting.selectOption('ask')
  await page.locator('.desktop-close-status').filter({ hasText: '已保存' }).waitFor()
  for (const [width, height, zoom] of [[1440, 960, 1], [1000, 720, 1.25]]) {
    await app.evaluate(({ BrowserWindow }, { width, height, zoom }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(width, height); window.webContents.setZoomFactor(zoom) }, { width, height, zoom })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const bounds = await page.locator('.settings-dialog').evaluate(node => ({ box: node.getBoundingClientRect().toJSON(), width: innerWidth, height: innerHeight, content: node.querySelector('.settings-content').getBoundingClientRect().toJSON() }))
    assert.ok(bounds.box.left >= 0 && bounds.box.right <= bounds.width + 1 && bounds.box.bottom <= bounds.height + 1)
    assert.ok(bounds.content.right <= bounds.box.right + 1)
    if (zoom === 1) {
      const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
      await fs.writeFile(path.join(evidence, 'window-close-settings.png'), Buffer.from(png, 'base64'))
    }
  }
  checks.push('remembered-choice-survives-restart', 'settings-can-change-and-reset-close-behavior', 'small-window-and-zoom-layout')
  await page.getByRole('button', { name: '关闭设置', exact: true }).click()
  await page.evaluate(() => window.utaDesktop.setUnsavedDraft('close-test', true))
  await closeWindow({ response: 1, checkboxChecked: true })
  assert.equal(await visible(), true)
  assert.equal((await page.evaluate(() => window.utaDesktop.loadCloseBehavior())).behavior, 'ask')
  await page.evaluate(() => window.utaDesktop.setUnsavedDraft('close-test', false))
  // Re-clicking the EXE while hidden must show the existing process, not open a second app.
  await closeWindow({ response: 0, checkboxChecked: false })
  await app.evaluate(({ app }) => app.emit('second-instance', {}, [], process.cwd()))
  assert.equal(await visible(), true)
  assert.equal(await fs.readFile(marker, 'utf8'), '{"preserve":"original learning data"}')
  checks.push('canceled-unsaved-quit-does-not-change-default', 'second-instance-restores-hidden-window')
  const exited = app.waitForEvent('close')
  await closeWindow({ response: 1, checkboxChecked: true }).catch(error => { if (!/closed|destroyed/i.test(error.message)) throw error })
  await exited; app = null
  assert.equal(JSON.parse(await fs.readFile(path.join(testDir, 'uta-data', 'window-close.json'), 'utf8')).behavior, 'quit')
  await launch()
  const rememberedExit = app.waitForEvent('close')
  await closeWindow().catch(error => { if (!/closed|destroyed/i.test(error.message)) throw error })
  await rememberedExit; app = null
  checks.push('direct-quit-and-remembered-quit-exit-process')
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(evidence, 'window-close-desktop.json'), JSON.stringify({ passed: true, checks }, null, 2))
  console.log(JSON.stringify({ passed: true, checks }))
} finally {
  if (app) {
    await app.evaluate(() => { globalThis.__discard = true }).catch(() => {})
    await app.close().catch(() => {})
  }
}
