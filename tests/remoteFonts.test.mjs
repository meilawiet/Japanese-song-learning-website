import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import manifest from '../src/lib/remoteFontManifest.json' with { type: 'json' }
import { isRemoteFont, verifyFontBytes } from '../src/lib/remoteFonts.js'

// Gitee 的大文件 raw 地址会要求登录；应用内清单必须只请求可匿名访问的小分片。
test('恢复的四档思源宋体都使用受控仓库的小分片', () => {
  assert.equal(manifest.schemaVersion, 2)
  for (const id of ['sourcehan_extralight', 'sourcehan_semibold', 'sourcehan_heavy', 'sourcehan_sc_heavy']) {
    assert.equal(isRemoteFont(id), true)
    const font = manifest.fonts.find(item => item.id === id)
    assert.ok(font?.parts.length >= 2)
    assert.equal(font.parts.reduce((sum, part) => sum + part.bytes, 0), font.bytes)
    for (const part of font.parts) {
      assert.ok(part.bytes <= 3 * 1024 * 1024)
      assert.equal(part.url, `https://gitee.com/git277992790/UTA/raw/master/${part.path}`)
      assert.match(part.sha256, /^[0-9a-f]{64}$/)
    }
  }
  assert.equal(isRemoteFont('sourcehan_bold'), false)
})

// 下载器不能把同尺寸的错误页面或篡改分片当字体保存。
test('字体数据校验拒绝损坏内容', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4])
  const expected = { bytes: 4, sha256: createHash('sha256').update(bytes).digest('hex') }
  assert.equal(await verifyFontBytes(bytes, expected), bytes)
  await assert.rejects(verifyFontBytes(new Uint8Array([1, 2, 3, 5]), expected), /校验失败/)
  await assert.rejects(verifyFontBytes(bytes, { ...expected, bytes: 5 }), /校验失败/)
})
