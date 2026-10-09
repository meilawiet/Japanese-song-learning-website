import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
const { resolveAssetPath, isExternalUrl } = createRequire(import.meta.url)('../desktop/runtime.cjs')
const root = path.resolve('dist-desktop')

test('desktop serves its stable origin and keeps resources inside the bundle', () => {
  assert.equal(resolveAssetPath(root, 'uta://app/'), path.join(root, 'index.html'))
  assert.equal(resolveAssetPath(root, 'uta://app/assets/test.js'), path.join(root, 'assets', 'test.js'))
  for (const url of ['uta://other/index.html', 'https://app/index.html', 'uta://app/%2e%2e%5csecret', 'uta://app/%00secret', 'uta://name:password@app/a']) {
    assert.throws(() => resolveAssetPath(root, url))
  }
})

test('external navigation only accepts ordinary web links', () => {
  assert.equal(isExternalUrl('https://github.com/meilawiet/Japanese-song-learning-website/releases'), true)
  for (const url of ['file:///C:/Windows/system32', 'javascript:alert(1)', 'https://user:password@example.com', 'invalid']) assert.equal(isExternalUrl(url), false)
})
