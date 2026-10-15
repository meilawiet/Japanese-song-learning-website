import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'

// Run only against an isolated, freshly packaged candidate under work.
const root = process.cwd()
const candidate = path.resolve(process.env.UTA_LYRIC_SOURCES_TEST_APP || path.join(root, 'work', 'lyrics-sources-candidate-20261015'))
assert.equal(path.dirname(candidate), path.join(root, 'work'))
assert.match(path.basename(candidate), /^(?:(lyrics|platform)-sources-candidate-|release-\d+\.\d+\.\d+-candidate$)/)
await fs.rm(path.join(candidate, 'uta-data'), { recursive: true, force: true })
const temp = path.join(candidate, 'uta-data', 'tmp')
await fs.mkdir(temp, { recursive: true })
const env = { ...process.env, TEMP: temp, TMP: temp }
delete env.ELECTRON_RUN_AS_NODE
let app
const servers = []
const calls = { good: 0, bad: 0 }
const launch = async () => {
  app = await electron.launch({ executablePath: path.join(candidate, 'UTA.exe'), env, timeout: 90000 })
  const page = await app.firstWindow({ timeout: 90000 })
  await page.waitForSelector('.desktop-shell', { timeout: 60000 })
  return page
}

try {
  let page = await launch()
  const urls = await (async () => {
    const server = async kind => {
      const server = http.createServer((req, res) => {
        calls[kind]++
        if (kind === 'bad') { res.writeHead(429, { 'Retry-After': '120' }); res.end(''); return }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify([{ id: 17, trackName: '自定义歌词测试', artistName: 'UTA',
          syncedLyrics: '[00:01]I will follow\n[00:02]君を見た\n[00:02]kimi o mita' }]))
      })
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      servers.push(server)
      return { instance: server, url: `http://127.0.0.1:${server.address().port}` }
    }
    const good = await server('good'), bad = await server('bad')
    return { good: good.url, bad: bad.url }
  })()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  assert.equal(await dialog.getByRole('button', { name: '歌词源', exact: true }).count(), 1)
  await dialog.getByRole('button', { name: '歌词源', exact: true }).click()
  const panel = dialog.locator('.desktop-lyric-sources')
  await panel.getByRole('button', { name: '保存歌词源' }).waitFor()
  await panel.getByRole('button', { name: '保存歌词源' }).isEnabled()
  await panel.locator('input[type=checkbox]').nth(0).uncheck()
  await panel.locator('input[type=checkbox]').nth(1).uncheck()
  await panel.getByRole('button', { name: '添加歌词源' }).click()
  await panel.getByLabel('歌词源 3 名称').fill('可用歌词源')
  await panel.getByLabel('歌词源 3 服务地址').fill(urls.good + '/api/search')
  await panel.getByRole('button', { name: '添加歌词源' }).click()
  await panel.getByLabel('歌词源 4 名称').fill('限流歌词源')
  await panel.getByLabel('歌词源 4 服务地址').fill(urls.bad)
  // Switching settings tabs must not silently discard an edited source.
  page.once('dialog', dialog => dialog.dismiss())
  await dialog.getByRole('button', { name: 'AI 服务', exact: true }).click()
  assert.equal(await panel.count(), 1)
  await panel.getByRole('button', { name: '保存歌词源' }).click()
  await panel.getByText('歌词源已保存，导入界面会使用已启用的来源。').waitFor()
  const stored = JSON.parse(await fs.readFile(path.join(candidate, 'uta-data', 'lyrics-sources.json'), 'utf8'))
  assert.equal(stored[2].baseUrl, urls.good)
  assert.equal(stored.filter(item => item.enabled).length, 2)
  // Settings use the real native save/load bridge, including failed-save atomicity.
  const invalid = await page.evaluate(async () => {
    const sources = await window.utaDesktop.loadLyricsSources()
    try { await window.utaDesktop.saveLyricsSources(sources.map((item, index) => index === 2 ? { ...item, baseUrl: 'file:///E:/data' } : item)); return false }
    catch { return (await window.utaDesktop.loadLyricsSources())[2].baseUrl === sources[2].baseUrl }
  })
  assert.equal(invalid, true)
  await fs.mkdir(path.join(root, 'work', 'verification'), { recursive: true })
  await dialog.screenshot({ path: path.join(root, 'work', 'verification', 'lyrics-source-settings.png') })
  await dialog.getByRole('button', { name: '关闭设置' }).click()

  await page.getByRole('button', { name: '歌曲库', exact: true }).click()
  await page.getByRole('button', { name: '导入歌曲', exact: true }).click()
  const form = page.locator('.song-import-dialog')
  const search = form.locator('.desktop-online-lyrics')
  await search.getByLabel('在线搜索歌曲名称').fill('fixture-song')
  await search.getByRole('button', { name: '搜索', exact: true }).click()
  await search.locator('.online-song-results li').first().waitFor()
  assert.equal(await search.locator('select option').count(), 3)
  assert.match(await search.locator('.online-song-results').innerText(), /可用歌词源/)
  const warning = await search.locator('.online-song-source-warnings').innerText()
  assert.match(warning, /部分来源暂不可用/)
  assert.match(warning, /约 120 秒/)
  assert.doesNotMatch(warning, /Error invoking|uta:lyrics/)
  assert.deepEqual(calls, { good: 1, bad: 1 })
  await search.getByLabel('在线搜索歌曲名称').fill('second-song')
  await search.getByRole('button', { name: '搜索', exact: true }).click()
  await search.locator('.online-song-results li').first().waitFor()
  assert.deepEqual(calls, { good: 2, bad: 1 })
  await form.screenshot({ path: path.join(root, 'work', 'verification', 'lyrics-source-partial-results.png') })
  await search.locator('.online-song-results li').first().getByRole('button', { name: '选用并预览' }).click()
  await form.getByLabel('单首歌词轨道预览').waitFor()
  assert.equal(await form.getByText('英文与罗马音无法可靠自动区分，请确认归类。').count(), 0)
  assert.equal(await form.getByRole('button', { name: '确认当前归类与时间' }).count(), 0)
  assert.match(await form.locator('.lrc-review-summary').innerText(), /可以导入/)

  // Concurrent identical native requests coalesce, and a cached query is not resent.
  const ids = stored.filter(item => item.enabled).map(item => item.id)
  await page.evaluate(async goodId => {
    await Promise.all([window.utaDesktop.requestLyrics(goodId, 'search', 'concurrent'), window.utaDesktop.requestLyrics(goodId, 'search', 'concurrent')])
    await window.utaDesktop.requestLyrics(goodId, 'search', 'concurrent')
  }, ids[0])
  assert.deepEqual(calls, { good: 3, bad: 1 })
  // Close an unsaved import through its own confirm, then verify config after restart.
  page.once('dialog', dialog => dialog.accept())
  await form.getByRole('button', { name: '关闭导入窗口' }).click()
  await app.close(); app = null
  page = await launch()
  assert.deepEqual(await page.evaluate(() => window.utaDesktop.loadLyricsSources()), stored)
  console.log(JSON.stringify({ passed: true, checks: ['settings-save-and-restart', 'invalid-source-save-preserves-config', 'disabled-sources-not-searched', 'custom-lrclib-source-results', '429-partial-results', '429-cooldown-no-repeat', 'clean-error-message', 'coalesced-and-cached-search', 'english-romaji-no-confirmation', 'unsaved-settings-confirm'] }))
} finally {
  if (app) await app.close()
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
}
