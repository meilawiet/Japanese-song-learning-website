import test from 'node:test'
import assert from 'node:assert/strict'
import sourceConfig from '../desktop/lyricSources.cjs'
import network from '../desktop/lyricNetwork.cjs'
import { searchPlatformSongs, fetchPlatformLyrics } from '../src/lib/platformLyrics.js'

test('Windows recognizes and migrates the four existing homepage configs without losing user choices', () => {
  const rows = [
    ['QQ', 'https://y.qq.com', 'qq'], ['网易', 'https://music.163.com', 'netease'],
    ['酷狗', 'https://www.kugou.com', 'kugou'], ['酷我', 'https://www.kuwo.cn', 'kuwo'],
  ].map(([name, baseUrl], index) => ({ id: `custom-${index}`, name, baseUrl, kind: 'lrclib', enabled: index !== 2, builtin: false }))
  const original = JSON.stringify(rows)
  const migrated = sourceConfig.validateSources([...sourceConfig.DEFAULT_SOURCES, ...rows]).slice(2)
  assert.deepEqual(migrated.map(row => row.kind), ['qq', 'netease', 'kugou', 'kuwo'])
  for (let i = 0; i < rows.length; i++) {
    for (const key of ['id', 'name', 'baseUrl', 'enabled', 'builtin']) assert.equal(migrated[i][key], rows[i][key])
  }
  assert.equal(JSON.stringify(rows), original)
  assert.equal(sourceConfig.sourceAdapter('https://y.qq.com.example.com'), null)
  assert.equal(sourceConfig.sourceAdapter('https://music.163.com@evil.test'), null)
})

test('Android-derived request builders pass the Windows native allowlist for search and every lyric step', async () => {
  const hash = 'a'.repeat(32)
  const replies = {
    netease: url => url.includes('/search/get/web') ? { code: 200, result: { songs: [{ id: 12, name: '原创', artists: [{ name: 'UTA' }], duration: 2000 }] } } : { code: 200, lrc: { lyric: '[00:01]空を見よう' } },
    qq: url => JSON.parse(new URL(url).searchParams.get('data')).lyric ? { code: 0, lyric: { code: 0, data: { lyric: Buffer.from('[00:01]空を見よう').toString('base64') } } } : { code: 0, 'music.search.SearchCgiService': { code: 0, data: { body: { song: { list: [{ mid: 'Original123', id: 12, title: '原创', singer: [{ name: 'UTA' }] }] } } } } },
    kuwo: url => url.includes('/r.s?') ? { abslist: [{ MUSICRID: 'MUSIC_12', NAME: '原创', ARTIST: 'UTA' }] } : { data: { lrclist: [{ time: '1', lineLyric: '空を見よう' }] } },
    kugou: url => url.includes('/search/song?') ? { status: 1, data: { info: [{ hash, songname: '原创', singername: 'UTA', duration: 2 }] } } : url.includes('/download?') ? { content: Buffer.from('[00:01]空を見よう').toString('base64') } : { candidates: [{ id: 12, accesskey: 'ABC', duration: 2000 }] },
  }
  for (const kind of ['qq', 'netease', 'kugou', 'kuwo']) {
    const source = { id: 'custom-test', kind, enabled: true }
    const seen = []
    const request = async url => {
      const native = network.lyricRequest(source.id, 'platform', url, source)
      seen.push(native)
      assert.equal(native.url, url)
      return JSON.stringify(replies[kind](url))
    }
    const [record] = await searchPlatformSongs(kind, '原创 / UTA', undefined, request)
    const ready = await fetchPlatformLyrics(record, undefined, request)
    assert.equal(ready.trackSummary.original, 1)
    assert.equal(seen.length, kind === 'kugou' ? 3 : 2)
    if (kind === 'qq') assert.equal(seen[0].headers['User-Agent'], 'Mozilla/5.0')
  }
})

test('platform bridge rejects foreign hosts, arbitrary methods, extra params and unconfigured requests', () => {
  const source = { id: 'custom-test', kind: 'netease', enabled: true }
  const request = url => network.lyricRequest(source.id, 'platform', url, source)
  assert.throws(() => request('https://music.163.com.evil.test/api/search/get/web?s=x&type=1&offset=0&limit=20'))
  assert.throws(() => request('http://music.163.com/api/search/get/web?s=x&type=1&offset=0&limit=20'))
  assert.throws(() => request('https://music.163.com/api/search/get/web?s=x&type=1&offset=0&limit=2000'))
  assert.throws(() => request('https://music.163.com/api/search/get/web?s=x&type=1&offset=0&limit=20&url=https://evil.test'))
  assert.throws(() => network.lyricRequest(source.id, 'platform', 'https://music.163.com/api/song/lyric?id=12&lv=-1&tv=-1&rv=-1', { ...source, enabled: false }))
  assert.throws(() => network.lyricRequest('custom-test', 'platform', 'https://u.y.qq.com/cgi-bin/musicu.fcg?' + new URLSearchParams({ data: JSON.stringify({ lyric: { module: 'arbitrary.module', method: 'Write', param: {} } }) }), { id: 'custom-test', kind: 'qq', enabled: true }))
})
