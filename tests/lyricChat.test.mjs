import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLyricChatContext, buildLyricChatPayload } from '../src/lib/lyricChat.js'

// 保证人工注音和修改后的歌词优先，当前句附近不会因长歌截断丢失。
test('歌词问答使用当前编辑内容、人工读音与邻句', () => {
  const song = { id:'s', title:'测试', artist:'UTA', lines:Array.from({ length:100 }, (_, id) => ({ id, text:id === 98 ? '明日も歌う' : '小さな歌'.repeat(100) })) }
  const context = buildLyricChatContext(song, 98, [{ id:98, tokens:[{ index:0, surface:'明日', reading:'あした' }] }], { 's:98:0':'あす' })
  assert.equal(context.current_line.text, '明日も歌う')
  assert.equal(context.current_line.readings[0].reading, 'あす')
  assert.equal(context.nearby_lines.at(-1).id, 99)
  assert.ok(context.lyrics.length <= 24000)
  const payload = buildLyricChatPayload(context, Array.from({ length:20 }, () => ({ role:'user', content:'词义' })), '  这里什么意思？  ')
  assert.equal(payload.conversation.length, 12)
  assert.equal(payload.question, '这里什么意思？')
})
