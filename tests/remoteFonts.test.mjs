import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import manifest from '../src/lib/remoteFontManifest.json' with { type: 'json' }
import { isRemoteFont, remoteFontBytes, verifyFontBytes } from '../src/lib/remoteFonts.js'

// Gitee 的大文件 raw 地址会要求登录；思源八档及其他非默认字体均需按需下载。
test('除颜真卿外的字体都有经过摘要校验的远程清单', () => {
  assert.equal(manifest.schemaVersion, 2)
  for (const id of ['flyflower', 'maoken', 'aidian', 'kinghwa', 'sourcehan_extralight', 'sourcehan_light', 'sourcehan', 'sourcehan_medium', 'sourcehan_semibold', 'sourcehan_bold', 'sourcehan_heavy', 'sourcehan_sc_heavy']) {
    assert.equal(isRemoteFont(id), true)
    const font = manifest.fonts.find(item => item.id === id)
    assert.ok(font?.parts.length >= 1)
    assert.equal(remoteFontBytes(id), font.bytes)
    assert.equal(font.parts.reduce((sum, part) => sum + part.bytes, 0), font.bytes)
    for (const part of font.parts) {
      // 猫啃原仓库直接提供 5.7 MB 文件；其余大字库保持最多 3 MiB 分片。
      assert.ok(part.bytes <= (id === 'maoken' ? 6 : 3) * 1024 * 1024)
      assert.equal(part.url, `https://gitee.com/git277992790/UTA/raw/master/${part.path}`)
      assert.match(part.sha256, /^[0-9a-f]{64}$/)
    }
  }
  assert.equal(isRemoteFont('yan'), false)
})

// 两款字体改由 Gitee 仓库分片提供，清单中的大小与摘要必须匹配原文件。
test('Gitee 字体分片与原文件逐字节对应', () => {
  for (const id of ['aidian', 'kinghwa']) {
    const font = manifest.fonts.find(item => item.id === id)
    const bytes = readFileSync(font.originalPath)
    assert.equal(bytes.length, font.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), font.sha256)
    let next = 0
    for (const part of font.parts) {
      assert.equal(part.url, `https://gitee.com/git277992790/UTA/raw/master/${part.path}`)
      const chunk = bytes.subarray(next, next + part.bytes)
      assert.equal(chunk.length, part.bytes)
      assert.equal(createHash('sha256').update(chunk).digest('hex'), part.sha256)
      next += chunk.length
    }
    assert.equal(next, font.bytes)
  }
})

// 下载器不能把同尺寸的错误页面或篡改分片当字体保存。
test('字体数据校验拒绝损坏内容', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4])
  const expected = { bytes: 4, sha256: createHash('sha256').update(bytes).digest('hex') }
  assert.equal(await verifyFontBytes(bytes, expected), bytes)
  await assert.rejects(verifyFontBytes(new Uint8Array([1, 2, 3, 5]), expected), /校验失败/)
  await assert.rejects(verifyFontBytes(bytes, { ...expected, bytes: 5 }), /校验失败/)
})
