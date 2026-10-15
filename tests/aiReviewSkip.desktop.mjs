import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd(), source = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'release', 'UTA-Windows-x64')
const testDir = path.join(root, 'work', '跳过建议 验证')
assert.equal(path.dirname(testDir), path.join(root, 'work'))
await fs.rm(testDir, { recursive: true, force: true })
await fs.mkdir(testDir, { recursive: true })
await fs.cp(source, testDir, { recursive: true, filter: item => path.basename(item) !== 'uta-data' })
const temporary = path.join(testDir, 'uta-data', 'tmp')
await fs.mkdir(temporary, { recursive: true })
const env = { ...process.env, PATH: path.join(process.env.SystemRoot, 'System32'), TEMP: temporary, TMP: temporary }
delete env.ELECTRON_RUN_AS_NODE
const client = await electron.launch({ executablePath: path.join(testDir, 'UTA.exe'), env, timeout: 90000 })
const evidence = path.join(root, 'verification')
await fs.mkdir(evidence, { recursive: true })
try {
  const page = await client.firstWindow(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('.desktop-shell').waitFor()
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('uta-auto-annotations-v5') || '{}')).some(lines => lines.length >= 2))
  const fixture = await page.evaluate(() => {
    const annotations = JSON.parse(localStorage.getItem('uta-auto-annotations-v5'))
    const [songId, lines] = Object.entries(annotations).find(([, lines]) => lines.length >= 2)
    const suggestions = lines.slice(0, 2).map(line => {
      const token = line.tokens.find(token => /[\u3400-\u9fff]/u.test(token.surface) && !token.is_symbol)
      return { line_id: line.id, token_index: token.index, surface: token.surface, original_reading: token.reading,
        suggested_reading: 'てすと', confidence: 0.9, reason: '原创测试用模拟复核，不调用外部 AI。' }
    })
    const candidate = lines.flatMap(line => line.tokens.map(token => ({ line, token }))).find(({ token }) =>
      !token.is_symbol && !token.segmentation_user_changed && [...token.surface].length > 1 && /^[\p{L}\p{N}々ー]+$/u.test(token.surface))
    if (!candidate) throw new Error('找不到测试分词建议用的完整词。')
    const characters = [...candidate.token.surface]
    const segmentation = { line_id: candidate.line.id, start_token_index: candidate.token.index,
      end_token_index: candidate.token.index, original_segments: [candidate.token.surface],
      suggested_segments: [characters[0], characters.slice(1).join('')], confidence: 0.9, reason: '原创测试用模拟分词建议。' }
    localStorage.setItem('uta-ai-reviews-v1', JSON.stringify({ [songId]: { reviewed_token_count: 2, suggestions, segmentation_suggestions: [segmentation], reviewedAt: Date.now() } }))
    return { songId, suggestions, segmentation, annotations, corrections: JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).corrections }
  })
  await page.reload()
  const queue = page.locator('#ai-review-queue')
  await queue.waitFor()
  assert.equal(await queue.locator('li').count(), 2)
  const segmentationQueue = page.locator('#ai-segmentation-queue')
  await segmentationQueue.waitFor()
  await segmentationQueue.locator('.ai-review-skip').click()
  await segmentationQueue.waitFor({state:'detached'})
  await client.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(1000, 680); win.webContents.setZoomFactor(1.25) })
  await page.waitForFunction(() => innerWidth <= 805 && innerHeight <= 548)
  await queue.locator('.ai-review-skip').first().scrollIntoViewIfNeeded()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const bounds = await queue.locator('.ai-review-skip').first().evaluate(button => {
    const r = button.getBoundingClientRect(), panel = document.querySelector('.word-panel').getBoundingClientRect()
    return { left: r.left, right: r.right, panelLeft: panel.left, panelRight: panel.right, viewport: innerWidth }
  })
  assert.ok(bounds.left >= bounds.panelLeft && bounds.right <= bounds.panelRight && bounds.right <= bounds.viewport, JSON.stringify(bounds))
  const png = await client.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))
  await fs.writeFile(path.join(evidence, 'ai-review-skip-small.png'), Buffer.from(png, 'base64'))
  await queue.locator('.ai-review-skip').first().click()
  await page.waitForFunction(() => document.querySelectorAll('#ai-review-queue li').length === 1)
  const after = await page.evaluate(() => ({ annotations: JSON.parse(localStorage.getItem('uta-auto-annotations-v5')), corrections: JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).corrections, reviews: JSON.parse(localStorage.getItem('uta-ai-reviews-v1')) }))
  assert.deepEqual(after.annotations, fixture.annotations)
  assert.deepEqual(after.corrections, fixture.corrections)
  assert.equal(after.reviews[fixture.songId].suggestions[0].skipped, true)
  assert.equal(after.reviews[fixture.songId].segmentation_suggestions[0].skipped, true)
  await page.reload()
  await queue.waitFor()
  assert.equal(await queue.locator('li').count(), 1)
  assert.ok((await queue.innerText()).includes(fixture.suggestions[1].surface))
  await queue.locator('.ai-review-select').click()
  await page.getByRole('button', { name: '跳过，保留原注音', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('#ai-review-queue'))
  await page.getByRole('button', { name: '恢复已跳过建议', exact: true }).click()
  await queue.waitFor()
  await segmentationQueue.waitFor()
  assert.equal(await queue.locator('li').count(), 2)
  const adopted = fixture.suggestions[1]
  await queue.locator('.ai-review-select').last().click()
  await page.getByRole('button', { name: '采用建议', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('#ai-review-queue li').length === 1)
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem('uta-pronunciation-progress-v2')).corrections[key], `${fixture.songId}:${adopted.line_id}:${adopted.token_index}`), adopted.suggested_reading)
  await segmentationQueue.locator('.ai-review-select').click()
  const editor = page.locator('.line-editor')
  const proposal = page.locator('.segmentation-dialog')
  await proposal.waitFor()
  assert.ok((await proposal.innerText()).includes(fixture.segmentation.reason))
  assert.ok((await proposal.innerText()).includes(fixture.segmentation.suggested_segments.join('｜')))
  const proposalBounds = await proposal.evaluate(element => ({ dialog:element.getBoundingClientRect().toJSON(),
    backdrop:element.parentElement.getBoundingClientRect().toJSON(), viewport:{width:innerWidth,height:innerHeight} }))
  assert.ok(proposalBounds.dialog.left >= 0 && proposalBounds.dialog.right <= proposalBounds.viewport.width
    && proposalBounds.dialog.top >= 0 && proposalBounds.dialog.bottom <= proposalBounds.viewport.height, JSON.stringify(proposalBounds))
  await page.screenshot({path:path.join(evidence,'ai-segmentation-preview.png')})
  await proposal.getByRole('button',{name:'确认分词'}).click()
  await proposal.waitFor({state:'detached'})
  await editor.getByRole('button',{name:'保存修改'}).click()
  await editor.waitFor({state:'detached'})
  await segmentationQueue.waitFor({state:'detached'})
  await page.reload()
  assert.equal(await page.locator('#ai-segmentation-queue').count(),0)
  const saved = await page.evaluate(({songId,lineId,parts}) => {
    const line = JSON.parse(localStorage.getItem('uta-auto-annotations-v5'))[songId].find(item=>item.id===lineId)
    const words = line.tokens.map(item=>item.surface)
    return words.some((word,index)=>word===parts[0] && words[index+1]===parts[1])
  }, {songId:fixture.songId,lineId:fixture.segmentation.line_id,parts:fixture.segmentation.suggested_segments})
  assert.equal(saved,true)
  assert.deepEqual(errors, [])
  const report = { passed: true, version: await client.evaluate(({ app }) => app.getVersion()), checks: [
    'skip-in-queue-keeps-original-annotation-and-corrections', 'skip-survives-reload', 'skip-in-current-suggestion-card',
    'all-skipped-hides-pending-queue', 'restore-skipped-without-ai-request', 'adopt-suggestion-still-works', 'skip-button-small-window-125-percent',
    'segmentation-suggestion-skip-restore-preview-confirm-save-restart',
  ] }
  await fs.writeFile(path.join(evidence, 'ai-review-skip.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally { await client.close() }
