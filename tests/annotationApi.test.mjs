import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { saveAiSettings } from '../src/lib/aiSettings.js'
import {
  annotateSongLines,
  explainSelectionWithAi,
  explainSentenceBatchWithAi,
  reviewSongWithAi,
  searchSongArtwork,
} from '../src/lib/annotationApi.js'

const originalWindow = globalThis.window
const originalFetch = globalThis.fetch
let requests

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

beforeEach(() => {
  globalThis.window = { sessionStorage: createStorage(), localStorage: createStorage() }
  requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => ({}) }
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
})

test('all AI calls send the current browser key only as a request header', async () => {
  saveAiSettings({ apiKey: 'sk-session-example' })
  await reviewSongWithAi({ id: 'song', title: 'Title', artist: 'Artist', lines: [{ id: 1, text: '夢' }] })
  saveAiSettings({ apiKey: 'sk-new-example', remember: true })
  await explainSelectionWithAi({ text: '夢' })
  await explainSentenceBatchWithAi([{ id: 1, text: '夢' }])
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    '/api/ai/review-song', '/api/ai/explain-selection', '/api/ai/explain-sentences',
  ])
  assert.deepEqual(requests.map(({ options }) => options.headers['X-DeepSeek-API-Key']), [
    'sk-session-example', 'sk-new-example', 'sk-new-example',
  ])
  for (const { url, options } of requests) {
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.ok(!url.includes('sk-'))
    assert.ok(!options.body.includes('sk-'))
  }
})

test('annotation and artwork calls never receive the browser AI key', async () => {
  saveAiSettings({ apiKey: 'sk-private-example', remember: true })
  await annotateSongLines([{ id: 1, text: '夢' }])
  await searchSongArtwork('Title', 'Artist')
  assert.equal(requests[0].options.headers['X-DeepSeek-API-Key'], undefined)
  assert.equal(requests[1].options, undefined)
  assert.ok(!JSON.stringify(requests).includes('sk-private-example'))
})

test('unset or cleared keys omit the header so server configuration can be used', async () => {
  await explainSelectionWithAi({ text: '夢' })
  saveAiSettings({ apiKey: 'sk-temporary-example' })
  saveAiSettings({ apiKey: '' })
  await explainSentenceBatchWithAi([{ id: 1, text: '夢' }])
  for (const { options } of requests) {
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' })
  }
})
