import test from 'node:test'
import assert from 'node:assert/strict'
import network from '../desktop/lyricNetwork.cjs'

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
