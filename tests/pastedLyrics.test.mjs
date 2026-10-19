import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pastedLyricsFile } from '../src/lib/pastedLyrics.js'
import { parseLrcFile } from '../src/lib/localSongStore.js'

// 从实际 UTF-8 文件入口往返，确保没有另一套粘贴专用解析规则。
test('粘贴LRC保留时间、原文、译文及来源注音', async () => {
  const text = '[ti:原创试唱]\r\n[ar:测试]\r\n[00:02.000]空へ歌う\r\n[00:02.000]向天空歌唱\r\n[00:02.000]sora e utau\r\n[00:07.500]風と歩く'
  const file = pastedLyricsFile(text), parsed = await parseLrcFile(file)
  assert.equal(await file.text(), text)
  assert.equal(parsed.title, '原创试唱'); assert.equal(parsed.artist, '测试')
  assert.deepEqual(parsed.lines.map(line => line.start), [2, 7.5])
  assert.equal(parsed.lines[0].text, '空へ歌う')
  assert.equal(parsed.lines[0].translation, '向天空歌唱')
  assert.equal(parsed.lines[0].romaji, 'sora e utau')
})

test('普通粘贴文本不伪造时间；空白、超长和无效正文提示错误', async () => {
  const parsed = await parseLrcFile(pastedLyricsFile('空へ歌う\n風と歩く'))
  assert.deepEqual(parsed.lines.map(line => line.start), [null, null])
  assert.equal(parsed.lines[1].text, '風と歩く')
  assert.throws(() => pastedLyricsFile(' \n\t'), /先粘贴/)
  assert.throws(() => pastedLyricsFile('あ'.repeat(500_001)), /过长/)
  await assert.rejects(parseLrcFile(pastedLyricsFile('[ti:仅有标题]')), /没有可读取/)
})
