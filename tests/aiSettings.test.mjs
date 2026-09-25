import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { getAiRequestHeaders, readAiSettings, saveAiSettings } from '../src/lib/aiSettings.js'

const storageKey = 'uta-deepseek-api-key'
const originalWindow = globalThis.window

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
})

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
})

test('keys default to this session and whitespace around a key is removed', () => {
  assert.deepEqual(readAiSettings(), { apiKey: '', remember: false })
  assert.deepEqual(getAiRequestHeaders(), {})
  saveAiSettings({ apiKey: '  sk-session-example\n' })
  assert.equal(window.sessionStorage.getItem(storageKey), 'sk-session-example')
  assert.equal(window.localStorage.getItem(storageKey), null)
  assert.deepEqual(readAiSettings(), { apiKey: 'sk-session-example', remember: false })
  assert.deepEqual(getAiRequestHeaders(), { 'X-DeepSeek-API-Key': 'sk-session-example' })
  window.sessionStorage = createStorage()
  assert.deepEqual(readAiSettings(), { apiKey: '', remember: false })
})

test('remembering persists a key and changing the preference removes the other copy', () => {
  saveAiSettings({ apiKey: 'sk-session-example' })
  saveAiSettings({ apiKey: 'sk-remembered-example', remember: true })
  assert.equal(window.sessionStorage.getItem(storageKey), null)
  window.sessionStorage = createStorage()
  assert.deepEqual(readAiSettings(), { apiKey: 'sk-remembered-example', remember: true })
  saveAiSettings({ apiKey: 'sk-session-again', remember: false })
  assert.equal(window.localStorage.getItem(storageKey), null)
  assert.deepEqual(readAiSettings(), { apiKey: 'sk-session-again', remember: false })
})

test('clearing removes both stored copies and stops sending the header', () => {
  window.sessionStorage.setItem(storageKey, 'sk-session-example')
  window.localStorage.setItem(storageKey, 'sk-remembered-example')
  saveAiSettings({ apiKey: '   ', remember: true })
  assert.equal(window.sessionStorage.getItem(storageKey), null)
  assert.equal(window.localStorage.getItem(storageKey), null)
  assert.deepEqual(readAiSettings(), { apiKey: '', remember: false })
  assert.deepEqual(getAiRequestHeaders(), {})
})

test('invalid keys are rejected without replacing an existing key or exposing the input', () => {
  saveAiSettings({ apiKey: 'sk-original-example' })
  for (const apiKey of ['sk-a b', 'sk-a\nb', 'sk-a\tb', 'sk-中文', 'sk-\u007f', 'x'.repeat(513), null]) {
    assert.throws(() => saveAiSettings({ apiKey, remember: true }), (error) => {
      assert.match(error.message, /API Key/)
      if (typeof apiKey === 'string') assert.ok(!error.message.includes(apiKey))
      return true
    })
  }
  assert.deepEqual(readAiSettings(), { apiKey: 'sk-original-example', remember: false })
  saveAiSettings({ apiKey: 'x'.repeat(512) })
  assert.equal(readAiSettings().apiKey.length, 512)
})

test('inaccessible or malformed storage is safe to read', () => {
  window.sessionStorage.setItem(storageKey, 'invalid key')
  window.localStorage.setItem(storageKey, 'sk-valid-example')
  assert.deepEqual(readAiSettings(), { apiKey: 'sk-valid-example', remember: true })
  Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('storage blocked') } })
  assert.deepEqual(readAiSettings(), { apiKey: 'sk-valid-example', remember: true })
  window.localStorage.getItem = () => { throw new Error('storage blocked') }
  assert.deepEqual(readAiSettings(), { apiKey: '', remember: false })
  delete globalThis.window
  assert.deepEqual(getAiRequestHeaders(), {})
})

test('storage write failures report an actionable error without echoing the key', () => {
  window.sessionStorage.setItem = () => { throw new Error('quota exceeded: sk-private-example') }
  assert.throws(() => saveAiSettings({ apiKey: 'sk-private-example' }), (error) => {
    assert.match(error.message, /允许浏览器使用网站存储/)
    assert.ok(!error.message.includes('sk-private-example'))
    return true
  })
})

test('a failed retention switch preserves the existing key when the target store is full', () => {
  for (const remember of [false, true]) {
    window.sessionStorage = createStorage()
    window.localStorage = createStorage()
    saveAiSettings({ apiKey: 'sk-original-example', remember: !remember })
    const target = remember ? 'localStorage' : 'sessionStorage'
    window[target].setItem = () => { throw new Error('quota exceeded') }
    assert.throws(() => saveAiSettings({ apiKey: 'sk-replacement-example', remember }), /允许浏览器使用网站存储/)
    assert.equal(window[target].getItem(storageKey), null)
    assert.deepEqual(readAiSettings(), { apiKey: 'sk-original-example', remember: !remember })
    assert.deepEqual(getAiRequestHeaders(), { 'X-DeepSeek-API-Key': 'sk-original-example' })
  }
})

test('failed cleanup rolls back the newly stored key and preserves the original settings', () => {
  for (const remember of [false, true]) {
    window.sessionStorage = createStorage()
    window.localStorage = createStorage()
    saveAiSettings({ apiKey: 'sk-original-example', remember: !remember })
    const target = remember ? 'localStorage' : 'sessionStorage'
    const other = remember ? 'sessionStorage' : 'localStorage'
    window[other].removeItem = () => { throw new Error('storage blocked') }
    assert.throws(() => saveAiSettings({ apiKey: 'sk-replacement-example', remember }), /允许浏览器使用网站存储/)
    assert.equal(window[target].getItem(storageKey), null)
    assert.deepEqual(readAiSettings(), { apiKey: 'sk-original-example', remember: !remember })
    assert.deepEqual(getAiRequestHeaders(), { 'X-DeepSeek-API-Key': 'sk-original-example' })
  }
})

test('failed cleanup restores an existing target value instead of deleting it', () => {
  window.sessionStorage.setItem(storageKey, 'sk-session-original')
  window.localStorage.setItem(storageKey, 'sk-remembered-original')
  window.localStorage.removeItem = () => { throw new Error('storage blocked') }
  assert.throws(() => saveAiSettings({ apiKey: 'sk-replacement-example' }), /允许浏览器使用网站存储/)
  assert.equal(window.sessionStorage.getItem(storageKey), 'sk-session-original')
  assert.equal(window.localStorage.getItem(storageKey), 'sk-remembered-original')
  assert.deepEqual(readAiSettings(), { apiKey: 'sk-session-original', remember: false })
})

test('failed clearing still attempts to remove the other stored copy', () => {
  window.sessionStorage.removeItem = () => { throw new Error('storage blocked') }
  window.localStorage.setItem(storageKey, 'sk-remembered-example')
  assert.throws(() => saveAiSettings({ apiKey: '' }), /允许浏览器使用网站存储/)
  assert.equal(window.localStorage.getItem(storageKey), null)
})
