import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { encryptQrc } from 'qrc-decoder'
import { searchPlatformSongs, fetchPlatformLyrics } from '../src/lib/platformLyrics.js'

const root = process.cwd()
const candidate = process.env.UTA_DESKTOP_TEST_SOURCE ? path.resolve(process.env.UTA_DESKTOP_TEST_SOURCE) : path.join(root, 'work', 'platform-sources-candidate-20261015')
assert.equal(path.dirname(candidate), path.join(root, 'work'))
await fs.rm(path.join(candidate, 'uta-data'), { recursive: true, force: true })
const temp = path.join(candidate, 'uta-data', 'tmp')
await fs.mkdir(temp, { recursive: true })
const defaults = [
  { id: 'lrclib', name: 'LRCLIB', kind: 'lrclib', baseUrl: 'https://lrclib.net', enabled: false, builtin: true },
  { id: 'utaten', name: 'UtaTen', kind: 'utaten', baseUrl: 'https://utaten.com', enabled: false, builtin: true },
]
const platforms = [ ['qq', 'qq音乐', 'https://y.qq.com'], ['netease', '网易云', 'https://music.163.com'], ['kugou', '酷狗', 'https://www.kugou.com'], ['kuwo', '酷我', 'https://www.kuwo.cn'] ]
// Reproduce the user's legacy Windows config: homepage URLs with kind=lrclib.
const legacy = [...defaults, ...platforms.map(([kind, name, baseUrl]) => ({ id: `custom-${kind}`, name, baseUrl, kind: 'lrclib', enabled: true, builtin: false }))]
const configFile = path.join(candidate, 'uta-data', 'lyrics-sources.json')
await fs.writeFile(configFile, JSON.stringify(legacy))
const env = { ...process.env, TEMP: temp, TMP: temp }
delete env.ELECTRON_RUN_AS_NODE
let app
try {
  app = await electron.launch({ executablePath: path.join(candidate, 'UTA.exe'), env, timeout: 90000 })
  const page = await app.firstWindow({ timeout: 90000 })
  await page.waitForSelector('.desktop-shell', { timeout: 60000 })
  const sources = await page.evaluate(() => window.utaDesktop.loadLyricsSources())
  assert.deepEqual(sources.slice(2).map(source => source.kind), platforms.map(([kind]) => kind))
  assert.deepEqual(JSON.parse(await fs.readFile(configFile, 'utf8')), legacy)
  await fs.mkdir(path.join(root, 'work', 'verification'), { recursive: true })

  if (process.env.UTA_LIVE_PLATFORM_LYRICS === '1') {
    const status = []
    for (const [kind] of platforms) {
      const debug = []
      try {
        const request = async url => {
          const raw = await page.evaluate(({ source, url }) => window.utaDesktop.requestLyrics(source, 'platform', url), { source: `custom-${kind}`, url })
          if (kind === 'qq' || kind === 'kuwo') {
            let data; try { data = JSON.parse(raw) } catch { data = {} }
            debug.push({ endpoint: new URL(url).origin + new URL(url).pathname, code: data.code, keys: Object.keys(data), blockCode: data['music.search.SearchCgiService']?.code, dataKeys: data.data && Object.keys(data.data) })
          }
          return raw
        }
        const records = await searchPlatformSongs(kind, 'Lemon', undefined, request)
        if (!records.length) throw new Error('没有返回候选歌曲')
        const ranked = [...records].sort((a, b) => Number(/米津|Kenshi/i.test(b.artist)) - Number(/米津|Kenshi/i.test(a.artist)))
        let ready, lastError, attempts = 0
        for (const selected of ranked.slice(0, 4)) {
          attempts++
          try { ready = await fetchPlatformLyrics(selected, undefined, request); break } catch (error) { lastError = error }
        }
        if (!ready) throw lastError
        status.push({ kind, candidates: records.length, attempts, tracks: ready.trackSummary, warnings: ready.sourceWarnings || [] })
      } catch (error) { status.push({ kind, error: error.message, debug }) }
      console.log(JSON.stringify(status.at(-1)))
    }
    await fs.writeFile(path.join(root, 'work', 'verification', 'windows-platform-live-results.json'), JSON.stringify(status, null, 2))
    assert.ok(status.some(item => item.tracks?.original > 0), '所有真实平台均未获取到歌词')
  } else {
    const original = '[00:01.250]空を見よう\n[00:03.500]Sing with me'
    const translated = '[00:01.250]看看天空\n[00:03.500]一起唱'
    const roman = '[00:01.250]so ra wo mi yo u'
    const b64 = text => Buffer.from(text).toString('base64')
    const mixed = '[00:01.250]空を見よう\n[00:01.250]看看天空\n[00:03.500]Sing with me\n[00:03.500]一起唱'
    const fixtures = {
      qq: { search: { code: 0, 'music.search.SearchCgiService': { code: 0, data: { body: { song: { list: [{ mid: 'Original123', id: 12, title: '原创测试', singer: [{ name: 'UTA' }] }] } } } } }, fetch: { code: 0, lyric: { code: 0, data: { lyric: b64(original), trans: b64(translated), roma: encryptQrc('<?xml version="1.0"?><QrcInfos><LyricInfo><Lyric_1 LyricContent="[1250,1000]so(1250,100) ra wo mi yo u"/></LyricInfo></QrcInfos>') } } } },
      netease: { search: { code: 200, result: { songs: [{ id: 12, name: '原创测试', artists: [{ name: 'UTA' }] }] } }, fetch: { code: 200, lrc: { lyric: original }, tlyric: { lyric: translated }, romalrc: { lyric: roman } } },
      kugou: { search: { status: 1, data: { info: [{ hash: 'a'.repeat(32), songname: '原创测试', singername: 'UTA' }] } }, lookup: { candidates: [{ id: 12, accesskey: 'ABC' }] }, fetch: { content: b64(mixed) } },
      kuwo: { search: { abslist: [{ MUSICRID: 'MUSIC_12', NAME: '原创测试', ARTIST: 'UTA' }] }, fetch: { data: { lrclist: mixed.split('\n').map(line => ({ time: line.startsWith('[00:01') ? '1.25' : '3.5', lineLyric: line.slice(line.indexOf(']') + 1) })) } } },
    }
    await app.evaluate(({ ipcMain }, fixtures) => {
      globalThis.__platformRequests = []
      ipcMain.removeHandler('uta:lyrics:request')
      ipcMain.handle('uta:lyrics:request', (_event, payload) => {
        if (payload.action !== 'platform') throw new Error('Platform must use its own API')
        globalThis.__platformRequests.push(payload)
        const provider = payload.source.replace('custom-', ''), url = new URL(payload.value)
        let action = 'fetch'
        if (provider === 'qq') action = JSON.parse(url.searchParams.get('data')).lyric ? 'fetch' : 'search'
        else if (url.pathname.includes('/search/get/web') || url.pathname.includes('/search/song') || url.pathname === '/r.s') action = 'search'
        else if (provider === 'kugou' && url.pathname === '/search') action = 'lookup'
        return { ok: true, body: JSON.stringify(fixtures[provider][action]) }
      })
    }, fixtures)

    await page.getByRole('button', { name: '设置', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置', exact: true })
    await settings.getByRole('button', { name: '歌词源', exact: true }).click()
    await settings.getByText('QQ 音乐专用接口', { exact: true }).waitFor()
    await settings.getByLabel('歌词源 3 名称').scrollIntoViewIfNeeded()
    await settings.screenshot({ path: path.join(root, 'work', 'verification', 'windows-platform-source-settings.png') })
    assert.equal(await settings.getByLabel('添加平台歌词源').locator('option').count(), 5)
    await settings.getByRole('button', { name: '关闭设置' }).click()

    await page.getByRole('button', { name: '歌曲库', exact: true }).click()
    await page.getByRole('button', { name: '导入歌曲', exact: true }).click()
    const form = page.locator('.song-import-dialog'), search = form.locator('.desktop-online-lyrics')
    await search.getByLabel('在线搜索歌曲名称').fill('原创测试')
    await search.getByRole('button', { name: '搜索', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.online-song-results li').length === 4)
    assert.equal(await search.locator('.online-song-search-error').count(), 0)
    await search.screenshot({ path: path.join(root, 'work', 'verification', 'windows-platform-search-results.png') })
    for (const [kind] of platforms) {
      await search.getByLabel('歌词来源').selectOption(`custom-${kind}`)
      await search.getByRole('button', { name: '搜索', exact: true }).click()
      await search.locator('.online-song-results li').first().waitFor()
      await search.getByRole('button', { name: '选用并预览', exact: true }).click()
      await form.getByLabel('单首歌词轨道预览').waitFor()
      await page.waitForFunction(() => /可以导入/.test(document.querySelector('.lrc-review-summary')?.textContent || ''))
      assert.equal(await form.locator('.lrc-review-warnings').count(), 0)
      const values = await form.locator('.lrc-review-rows input').evaluateAll(inputs => inputs.map(input => input.value))
      assert.ok(values.includes('空を見よう') && values.includes('Sing with me'))
      assert.ok(values.includes('看看天空') && values.includes('一起唱'))
      if (['qq', 'netease'].includes(kind)) assert.ok(values.includes('so ra wo mi yo u'))
    }
    const seen = await app.evaluate(() => globalThis.__platformRequests)
    assert.ok(seen.some(call => call.value.includes('vipver=1')))
    assert.ok(seen.some(call => call.value.includes('lyrics.kugou.com/download')))
    assert.ok(seen.every(call => !call.value.includes('y.qq.com/api/search') && !call.value.includes('www.kugou.com/api/search')))
    page.once('dialog', dialog => dialog.accept())
    await form.getByRole('button', { name: '关闭导入窗口' }).click()
    console.log(JSON.stringify({ passed: true, checks: ['legacy-homepage-migration', 'settings-platform-labels', 'four-platform-mixed-search', 'qq-qrc-preview', 'netease-three-track-preview', 'kugou-lookup-download-preview', 'kuwo-mixed-track-preview', 'english-original-and-translation-preserved'] }))
  }
} finally {
  if (app) await app.close()
}
