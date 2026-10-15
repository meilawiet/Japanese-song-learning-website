import test from 'node:test'
import assert from 'node:assert/strict'
import network from '../desktop/lyricNetwork.cjs'
import sourceConfig from '../desktop/lyricSources.cjs'

test('lyrics IPC request only permits bounded fixed providers', () => {
  const search = network.lyricRequest('utaten', 'search', '歌 / 歌手')
  assert.equal(new URL(search.url).hostname, 'utaten.com')
  assert.throws(() => network.lyricRequest('utaten', 'fetch', '../secret'))
  assert.throws(() => network.lyricRequest('https://127.0.0.1', 'search', 'song'))
  assert.throws(() => network.lyricRequest('lrclib', 'search', 'x'.repeat(161)))
})

test('lyrics network refuses redirects outside its source', async () => {
  const request = network.lyricRequest('utaten', 'fetch', 'abc123')
  await assert.rejects(network.fetchLyrics(request, async () => ({ status: 302, headers: new Headers({ location: 'https://example.com/' }) })), /非预期地址/)
})

test('custom source addresses are normalized and only saved enabled sources can be requested', () => {
  const custom = { id: 'custom-test', name: 'My lyrics', kind: 'lrclib', baseUrl: 'https://example.com/lyrics/api/search', enabled: true }
  const sources = sourceConfig.validateSources([...sourceConfig.DEFAULT_SOURCES, custom])
  assert.equal(sources[2].baseUrl, 'https://example.com/lyrics')
  assert.equal(network.lyricRequest(custom.id, 'search', '歌 & 人', sources[2]).url, 'https://example.com/lyrics/api/search?q=%E6%AD%8C+%26+%E4%BA%BA')
  assert.throws(() => network.lyricRequest(custom.id, 'search', '歌', { ...sources[2], enabled: false }), /未启用/)
  assert.throws(() => sourceConfig.validateSources([...sourceConfig.DEFAULT_SOURCES, { ...custom, baseUrl: 'file:///E:/data' }]))
  assert.throws(() => sourceConfig.validateSources([...sourceConfig.DEFAULT_SOURCES, { ...custom, baseUrl: 'https://user:password@example.com' }]))
  assert.throws(() => sourceConfig.validateSources([sourceConfig.DEFAULT_SOURCES[0]]))
  assert.throws(() => sourceConfig.validateSources([...sourceConfig.DEFAULT_SOURCES, { ...custom, id: 'lrclib' }]))
})

test('repeated searches share one request and successful responses are cached', async () => {
  let calls = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  let now = 0
  const client = network.createLyricsClient(async () => { calls++; await gate; return new Response('[]') }, () => now)
  const request = network.lyricRequest('lrclib', 'search', 'Lemon')
  const first = client(request), second = client(request)
  assert.equal(calls, 1)
  release()
  assert.deepEqual(await Promise.all([first, second]), ['[]', '[]'])
  assert.equal(await client(request), '[]')
  assert.equal(calls, 1)
  now = 300001
  await client(request)
  assert.equal(calls, 2)
})

test('429 honors Retry-After across queries without blocking other origins or retrying automatically', async () => {
  let calls = 0, now = 0
  const client = network.createLyricsClient(async url => {
    calls++
    return url.startsWith('https://lrclib.net') && now < 90000
      ? new Response('', { status: 429, headers: { 'Retry-After': '90' } }) : new Response('[]')
  }, () => now)
  const first = network.lyricRequest('lrclib', 'search', 'first')
  await assert.rejects(client(first), error => error.code === 'RATE_LIMITED' && error.retryAfter === 90)
  now = 10000
  await assert.rejects(client(network.lyricRequest('lrclib', 'search', 'second')), error => error.retryAfter === 80)
  assert.equal(calls, 1)
  assert.equal(await client(network.lyricRequest('utaten', 'search', 'first')), '[]')
  assert.equal(calls, 2)
  now = 90001
  await client(first)
  assert.equal(calls, 3)
})

test('redirects cannot leak a configured source request to another port', async () => {
  const request = network.lyricRequest('lrclib', 'search', 'song')
  await assert.rejects(network.fetchLyrics(request, async () => new Response('', { status: 302, headers: { location: 'https://lrclib.net:8443/api/search' } })), /非预期地址/)
})
