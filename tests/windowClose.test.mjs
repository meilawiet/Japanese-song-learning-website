import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import close from '../desktop/windowClose.cjs'

const temporary = path.join(process.cwd(), 'work', 'tmp')
await fs.mkdir(temporary, { recursive: true })
async function fixture() {
  const dataDir = await fs.mkdtemp(path.join(temporary, 'window-close-'))
  const state = { visible: true, taskbar: true, promptCount: 0, warningCount: 0, quits: 0, error: null }
  const window = { isDestroyed: () => false, isMinimized: () => false, setSkipTaskbar: skip => { state.taskbar = !skip },
    hide: () => { state.visible = false }, show: () => { state.visible = true }, focus() {} }
  const dialog = { showMessageBox: async () => { state.promptCount++; return state.choice || { response: 2, checkboxChecked: true } },
    showMessageBoxSync: () => { state.warningCount++; return state.discard ? 1 : 0 }, showErrorBox: (_title, message) => { state.error = message } }
  class Tray {
    constructor() { state.tray = this; this.events = {} }
    isDestroyed() { return Boolean(this.destroyed) } destroy() { this.destroyed = true }
    on(event, action) { this.events[event] = action } setToolTip() {} setContextMenu(menu) { this.menu = menu }
  }
  const controller = new close.WindowCloseController({ app: { quit: () => state.quits++ }, dialog, Tray,
    Menu: { buildFromTemplate: entries => entries }, nativeImage: { createFromPath: () => ({ resize: () => ({ isEmpty: () => false }) }) },
    getWindow: () => window, unsavedDrafts: new Set(), dataDir, iconPath: 'test.png', onSettings() {} })
  return { controller, state, dataDir, event: () => ({ prevented: false, preventDefault() { this.prevented = true } }), cleanup: () => fs.rm(dataDir, { recursive: true, force: true }) }
}
test('canceling the close chooser cannot persist a checked default or close a window', async () => {
  const f = await fixture()
  try { const event = f.event(); await f.controller.handleClose(event); assert.equal(event.prevented, true); assert.equal(f.state.visible, true); assert.equal(f.state.quits, 0); assert.deepEqual(f.controller.store.load(), { behavior: 'ask' }); assert.deepEqual(await fs.readdir(f.dataDir), []) }
  finally { await f.cleanup() }
})
test('tray close preserves drafts, remembers the choice, and restores the window through its menu', async () => {
  const f = await fixture()
  try {
    f.controller.unsavedDrafts.add('song-editor'); f.state.choice = { response: 0, checkboxChecked: true }
    await f.controller.handleClose(f.event())
    assert.equal(f.state.visible, false); assert.equal(f.state.taskbar, false); assert.equal(f.state.warningCount, 0)
    assert.equal(f.controller.unsavedDrafts.size, 1); assert.equal(new close.CloseBehaviorStore(f.dataDir).load().behavior, 'tray')
    f.state.tray.events.click(); assert.equal(f.state.visible, true); assert.equal(f.state.taskbar, true)
    await f.controller.handleClose(f.event()); assert.equal(f.state.promptCount, 1)
    f.state.tray.menu.find(item => item.label === '退出 UTA').click(); assert.equal(f.state.quits, 1)
    f.controller.destroy(); assert.equal(f.state.tray.isDestroyed(), true)
  } finally { await f.cleanup() }
})
test('canceling the unsaved warning preserves edits and does not remember an uncompleted Quit', async () => {
  const f = await fixture()
  try {
    f.controller.unsavedDrafts.add('lyric-editor'); f.state.choice = { response: 1, checkboxChecked: true }
    await f.controller.handleClose(f.event())
    assert.equal(f.state.quits, 0); assert.equal(f.controller.unsavedDrafts.size, 1)
    assert.equal(f.controller.store.load().behavior, 'ask'); assert.equal(f.controller.quitting, false)
    f.state.discard = true; await f.controller.handleClose(f.event())
    assert.equal(f.state.quits, 1); assert.equal(f.controller.unsavedDrafts.size, 0)
    assert.equal(f.controller.store.load().behavior, 'quit'); assert.equal(f.controller.quitting, true)
  } finally { await f.cleanup() }
})
test('explicit app Quit and updater restart bypass the tray preference while retaining the unsaved guard', async () => {
  const f = await fixture()
  try {
    f.controller.store.save({ behavior: 'tray' }); f.controller.unsavedDrafts.add('song-editor')
    const canceled = f.event(); f.controller.beforeQuit(canceled)
    assert.equal(canceled.prevented, true); assert.equal(f.controller.quitting, false)
    f.state.discard = true; const allowed = f.event(); f.controller.beforeQuit(allowed)
    assert.equal(allowed.prevented, false); assert.equal(f.controller.quitting, true)
    const closeEvent = f.event(); await f.controller.handleClose(closeEvent)
    assert.equal(closeEvent.prevented, false); assert.equal(f.state.promptCount, 0)
  } finally { await f.cleanup() }
})
test('a preference write failure leaves the window and drafts intact', async () => {
  const f = await fixture()
  try {
    f.controller.unsavedDrafts.add('song-editor'); f.state.choice = { response: 1, checkboxChecked: true }; f.state.discard = true
    f.controller.store.save = () => { throw new Error('disk failure') }
    await f.controller.handleClose(f.event())
    assert.equal(f.state.error, 'disk failure'); assert.equal(f.state.visible, true); assert.equal(f.state.quits, 0)
    assert.equal(f.controller.unsavedDrafts.size, 1)
  } finally { await f.cleanup() }
})
test('repeated close requests share one pending chooser', async () => {
  const f = await fixture()
  try {
    let resolve
    f.controller.dialog.showMessageBox = () => { f.state.promptCount++; return new Promise(done => { resolve = done }) }
    const pending = f.controller.handleClose(f.event()); await f.controller.handleClose(f.event())
    assert.equal(f.state.promptCount, 1); resolve({ response: 2 }); await pending
    assert.equal(f.controller.prompting, false)
  } finally { await f.cleanup() }
})
test('unknown or damaged stored preferences fall back to asking and invalid saves are rejected', async () => {
  const f = await fixture()
  try {
    await fs.writeFile(f.controller.store.file, '{broken'); assert.equal(f.controller.store.load().behavior, 'ask')
    await fs.writeFile(f.controller.store.file, '{"behavior":"unknown"}'); assert.equal(f.controller.store.load().behavior, 'ask')
    assert.throws(() => f.controller.store.save({ behavior: 'unknown' }), /无效/)
  } finally { await f.cleanup() }
})
