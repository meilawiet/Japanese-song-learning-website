import test from 'node:test'
import assert from 'node:assert/strict'
import { inferAudioMetadata, inferMetadataFromFilename } from '../src/lib/audioMetadata.js'

test('没有音频标签时从文件名推断歌手和歌名', () => {
  assert.deepEqual(inferMetadataFromFilename('01 - 米津玄師 - Lemon.mp3'), { title: 'Lemon', artist: '米津玄師' })
  assert.deepEqual(inferMetadataFromFilename('神のまにまに.m4a'), { title: '神のまにまに', artist: '' })
})

test('优先读取 MP3 ID3v2.3 的歌名和歌手', async () => {
  const frame = (name, value) => {
    const data = new TextEncoder().encode(value)
    const size = data.length + 1
    return Buffer.concat([Buffer.from(name), Buffer.from([0, 0, 0, size, 0, 0, 3]), Buffer.from(data)])
  }
  const frames = Buffer.concat([frame('TIT2', 'Lemon'), frame('TPE1', '米津玄師')])
  const tag = Buffer.concat([Buffer.from([73, 68, 51, 3, 0, 0, 0, 0, 0, frames.length]), frames])
  const file = new File([tag], 'unknown.mp3', { type: 'audio/mpeg' })
  assert.deepEqual(await inferAudioMetadata(file), { title: 'Lemon', artist: '米津玄師' })
})
