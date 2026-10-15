import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { inspectLearningBackup } from '../src/lib/learningBackup.js'

const PROGRESS = 'uta-pronunciation-progress-v2'
const ANNOTATIONS = 'uta-auto-annotations-v5'
export async function saveNativeScreenshot(client, filename) {
  const png = await client.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await fs.writeFile(filename, Buffer.from(png, 'base64'))
}
async function records(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('uta-local-song-library')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('songs'), all = tx.objectStore('songs').getAll()
      all.onerror = () => reject(all.error)
      all.onsuccess = () => resolve(all.result.map(({ audioBlob, ...song }) => ({ ...song, audioSize: audioBlob.size })))
      tx.oncomplete = () => db.close()
    }
  }))
}
const learning = page => page.evaluate(() => ({ progress: JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')), annotations: JSON.parse(localStorage.getItem('uta-auto-annotations-v5')) }))

export async function runDataProtectionChecks({ page, client, testDir, evidence, backup }) {
  const checks = []
  const original = (await records(page)).find(song => song.title === 'Windows便携测试')
  assert.ok(original)
  const id = original.id
  const annotated = await page.evaluate(async lines => {
    const response = await fetch('/api/annotate/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines }) })
    return response.json()
  }, original.lines)
  const correctionKeys = annotated.slice(0, 2).map(line => `${id}:${line.id}:${line.tokens.find(token => !token.is_symbol).index}`)
  await page.evaluate(({ id, lines, annotated, keys }) => {
    const progress = JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2'))
    progress.learnedBySong[id] = lines.slice(0, 2).map(line => line.id)
    progress.reviewItems = [...progress.reviewItems.filter(item => item.songId !== id), ...lines.slice(0, 2).map(line => ({ songId: id, lineId: line.id, text: line.text }))]
    progress.corrections[keys[0]] = 'がっこう'
    progress.corrections[keys[1]] = 'ゆめ'
    progress.lyricSnapshots[id] = { lines: lines.map(({ id, text }) => ({ id, text })) }
    progress.playbackRate = 1.5
    localStorage.setItem('uta-pronunciation-progress-v2', JSON.stringify(progress))
    const annotations = JSON.parse(localStorage.getItem('uta-auto-annotations-v5'))
    annotations[id] = annotated
    localStorage.setItem('uta-auto-annotations-v5', JSON.stringify(annotations))
  }, { id, lines: original.lines, annotated, keys: correctionKeys })
  await page.reload()
  await page.locator('.desktop-shell').waitFor()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).playbackRate === 1)
  assert.deepEqual(await page.getByLabel('逐句播放速度').locator('option').evaluateAll(items => items.map(item => item.value)), ['1', '0.75', '0.5', '0.25'])
  checks.push('slow-only-legacy-speed-migration')
  async function openEditor(title) {
    await page.getByRole('button', { name: '歌曲库', exact: true }).click()
    await page.locator('.desktop-song-table tbody tr').filter({ hasText: title }).first().click()
    await page.getByRole('button', { name: '编辑歌曲信息', exact: true }).click()
    await page.locator('.song-editor').waitFor()
    return page.locator('.song-editor')
  }
  async function saveEditor(form) {
    await form.getByRole('button', { name: '保存修改', exact: true }).click()
    await form.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '撤销本次歌曲编辑', exact: true }).waitFor()
  }
  const before = await learning(page)
  let form = await openEditor(original.title)
  const translation = form.getByLabel('中文译文', { exact: true }).first()
  await translation.fill('翻译修改测试')
  await form.getByRole('button', { name: '撤销编辑', exact: true }).click()
  assert.equal(await translation.inputValue(), original.lines[0].translation)
  await form.getByRole('button', { name: '重做编辑', exact: true }).click()
  assert.equal(await translation.inputValue(), '翻译修改测试')
  await form.getByRole('button', { name: '删除第 4 句', exact: true }).click()
  assert.equal(await form.locator('.song-editor-lines li').count(), 3)
  await form.getByRole('button', { name: '撤销编辑', exact: true }).click()
  assert.equal(await form.locator('.song-editor-lines li').count(), 4)
  await form.getByLabel('歌曲名称', { exact: true }).fill('未保存的标题')
  await form.getByLabel('歌曲名称', { exact: true }).press('Control+z')
  assert.equal(await form.getByLabel('歌曲名称', { exact: true }).inputValue(), original.title)
  checks.push('draft-undo-redo-and-keyboard')
  await form.getByLabel('时间', { exact: true }).first().fill('00:00.600')
  await saveEditor(form)
  const translated = await learning(page)
  assert.deepEqual(translated.progress.learnedBySong[id], before.progress.learnedBySong[id])
  assert.deepEqual(translated.progress.reviewItems.filter(item => item.songId === id), before.progress.reviewItems.filter(item => item.songId === id))
  correctionKeys.forEach(key => assert.equal(translated.progress.corrections[key], before.progress.corrections[key]))
  assert.deepEqual(translated.annotations[id], before.annotations[id])
  checks.push('translation-and-timing-edit-keeps-learning')
  form = await openEditor(original.title)
  await form.getByLabel('日文歌词', { exact: true }).first().fill('明日も歌う。')
  await saveEditor(form)
  const changed = await learning(page)
  assert.deepEqual(changed.progress.learnedBySong[id], [original.lines[1].id])
  assert.equal(changed.progress.corrections[correctionKeys[0]], undefined)
  assert.equal(changed.progress.corrections[correctionKeys[1]], before.progress.corrections[correctionKeys[1]])
  assert.deepEqual(changed.annotations[id].find(line => line.id === original.lines[1].id), before.annotations[id].find(line => line.id === original.lines[1].id))
  checks.push('original-line-edit-targeted-invalidation')
  await page.getByRole('button', { name: '撤销本次歌曲编辑', exact: true }).click()
  await page.waitForFunction(({ id, lineId, text }) => JSON.parse(localStorage.getItem('uta-auto-annotations-v5'))[id]?.some(line => line.id === lineId && (line.text ?? line.tokens.map(token => token.surface).join('')) === text), { id, lineId: original.lines[0].id, text: original.lines[0].text })
  const undone = await learning(page)
  assert.deepEqual(undone.progress.learnedBySong[id], [original.lines[0].id, original.lines[1].id])
  correctionKeys.forEach(key => assert.equal(undone.progress.corrections[key], before.progress.corrections[key]))
  assert.equal((await records(page)).find(song => song.id === id).lines[0].translation, '翻译修改测试')
  checks.push('saved-edit-undo-restores-song-and-learning')
  form = await openEditor(original.title)
  await client.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 680))
  await client.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25))
  await page.waitForFunction(() => innerWidth <= 805 && innerHeight <= 548)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const bounds = await form.getByRole('button', { name: '保存修改', exact: true }).evaluate(button => {
    const rect = button.getBoundingClientRect()
    return { bottom: rect.bottom, viewport: innerHeight, width: document.querySelector('.song-editor').getBoundingClientRect().width, viewportWidth: innerWidth }
  })
  assert.ok(bounds.bottom <= bounds.viewport && bounds.width <= bounds.viewportWidth, JSON.stringify(bounds))
  assert.ok(await form.locator('.song-editor-fields').evaluate(element => element.scrollHeight > element.clientHeight))
  await saveNativeScreenshot(client, path.join(evidence, 'data-protection-editor-small.png'))
  await client.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.webContents.setZoomFactor(1); win.setContentSize(1440, 960) })
  checks.push('editor-small-window-layout')
  const snapshotTitle = '恢复前快照测试'
  await form.getByLabel('歌曲名称', { exact: true }).fill(snapshotTitle)
  await saveEditor(form)
  const currentLearning = await learning(page)
  const snapshotDirectory = path.join(testDir, 'uta-data', 'backups', 'restore-snapshots')
  await fs.writeFile(snapshotDirectory, 'simulate-unwritable-directory')
  const acceptDialog = dialog => dialog.accept()
  page.on('dialog', acceptDialog)
  async function preview(file) {
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '数据管理', exact: true }).click()
    await page.locator('.settings-dialog input[type=file][accept*=".uta-backup"]').setInputFiles(file)
    await page.getByRole('heading', { name: '确认恢复备份', exact: true }).waitFor()
  }
  await preview(backup)
  await page.getByRole('button', { name: '覆盖当前数据并恢复', exact: true }).click()
  await page.locator('.backup-dialog [role=alert]').filter({ hasText: '尚未覆盖当前数据' }).waitFor()
  assert.equal((await records(page)).find(song => song.id === id).title, snapshotTitle)
  assert.deepEqual((await learning(page)).progress.learnedBySong[id], currentLearning.progress.learnedBySong[id])
  await page.screenshot({ path: path.join(evidence, 'snapshot-failure-blocks-restore.png') })
  checks.push('snapshot-failure-blocks-restore')
  await fs.unlink(snapshotDirectory)
  await page.getByRole('button', { name: '覆盖当前数据并恢复', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.backup-dialog'), { timeout: 30000 })
  await page.locator('.desktop-shell').waitFor()
  const files = (await fs.readdir(snapshotDirectory)).filter(name => name.endsWith('.uta-backup'))
  assert.equal(files.length, 1)
  const snapshotFile = path.join(snapshotDirectory, files[0])
  const snapshot = await inspectLearningBackup(new Blob([await fs.readFile(snapshotFile)]))
  assert.equal(snapshot.manifest.songs.find(song => song.id === id).title, snapshotTitle)
  assert.deepEqual(snapshot.manifest.progress.learnedBySong[id], currentLearning.progress.learnedBySong[id])
  assert.equal((await records(page)).find(song => song.id === id).title, original.title)
  assert.equal(await page.evaluate(() => window.utaDesktop.loadCredential()), 'desktop-encrypted-test-key')
  checks.push('durable-snapshot-before-restore')
  await preview(snapshotFile)
  await page.getByRole('button', { name: '覆盖当前数据并恢复', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.backup-dialog'), { timeout: 30000 })
  await page.locator('.desktop-shell').waitFor()
  assert.equal((await records(page)).find(song => song.id === id).title, snapshotTitle)
  assert.deepEqual((await learning(page)).progress.learnedBySong[id], currentLearning.progress.learnedBySong[id])
  assert.equal((await records(page)).find(song => song.id === id).audioSize, original.audioSize)
  checks.push('snapshot-file-restores-prior-data')
  page.off('dialog', acceptDialog)
  await fs.writeFile(path.join(evidence, 'data-protection.json'), JSON.stringify({ passed: true, version: await client.evaluate(({ app }) => app.getVersion()), checks }, null, 2))
  return checks
}
