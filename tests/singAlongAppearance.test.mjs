import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_SING_ALONG_APPEARANCE, MAX_SING_ALONG_IMAGE_BYTES, normalizeSingAlongAppearance, validateSingAlongImage } from '../src/lib/singAlongAppearance.js'

test('跟唱背景设置保留有效图片并限制损坏的旧数据', () => {
  const imageBlob = new Blob(['image'], { type: 'image/png' })
  assert.deepEqual(normalizeSingAlongAppearance(null), DEFAULT_SING_ALONG_APPEARANCE)
  assert.deepEqual(normalizeSingAlongAppearance({ mode: 'image', imageBlob, blur: 100, dim: -50, color: 'invalid' }), {
    mode: 'image', imageBlob, blur: 18, dim: 25, color: DEFAULT_SING_ALONG_APPEARANCE.color,
  })
  assert.equal(normalizeSingAlongAppearance({ mode: 'image', imageBlob: new Blob(['x'], { type: 'text/plain' }) }).mode, 'default')
  assert.equal(normalizeSingAlongAppearance({ mode: 'color', color: '#A1b2C3' }).color, '#A1b2C3')
})

test('只接受大小受限的常见本地图片', () => {
  assert.equal(validateSingAlongImage(new Blob(['x'], { type: 'image/webp' })).type, 'image/webp')
  assert.throws(() => validateSingAlongImage(new Blob(['x'], { type: 'image/svg+xml' })), /PNG、JPG 或 WebP/)
  assert.throws(() => validateSingAlongImage(new Blob([new Uint8Array(MAX_SING_ALONG_IMAGE_BYTES + 1)], { type: 'image/png' })), /15 MB/)
})
