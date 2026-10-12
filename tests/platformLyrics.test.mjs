import assert from 'node:assert/strict'
import test from 'node:test'
import { searchPlatformSongs, fetchPlatformLyrics, parsePlatformJson, mergePlatformTracks, timedTrack, LYRIC_SOURCES } from '../src/lib/platformLyrics.js'
import { lyricsRecordToFile } from '../src/lib/onlineLyrics.js'
import { parseLrcFile } from '../src/lib/localSongStore.js'
import { createLearningBackup, inspectLearningBackup, songsFromLearningBackup } from '../src/lib/learningBackup.js'

// 只用自创歌词与模拟平台，不把实际返回的商业歌词加入仓库。
test('网易云三轨获取到文件导入保留纯汉字原文及英语，不以翻译语言猜测轨道', async () => {
  const requests = []
  const request = async url => {
    requests.push(url)
    return url.includes('search/get') ? { code: 200, result: { songs: [{ id: 123, name: '原创测试', artists: [{ name: 'UTA' }], duration: 10000 }] } }
      : { code: 200, lrc: { lyric: '[00:01]空を見よう\n[00:02]星光 夜空\n[00:03]Sing with me' }, tlyric: { lyric: '[00:01]看天空\n[00:02]ほしの光\n[00:03]和我一起唱' }, romalrc: { lyric: '[00:01]so ra wo mi yo u\n[00:02]sei kou yo zo ra' } }
  }
  const [song] = await searchPlatformSongs('netease', '原创测试', undefined, request)
  const fetched = await fetchPlatformLyrics(song, undefined, request)
  assert.deepEqual(fetched.trackSummary, { original: 3, translation: 3, romaji: 2, unmatched: 0 })
  const parsed = await parseLrcFile(lyricsRecordToFile(fetched))
  assert.deepEqual(parsed.lines.map(row => [row.text, row.translation, row.romaji || '']), [['空を見よう', '看天空', 'so ra wo mi yo u'], ['星光 夜空', 'ほしの光', 'sei kou yo zo ra'], ['Sing with me', '和我一起唱', '']])
  assert.ok(!parsed.lines.some(row => row.text.includes('[uta-')))
  // 生成的预览数据仍沿用现有备份格式，恢复后罗马音和翻译不丢失。
  const backupSong = { ...parsed, id: 'local-platform-test', isLocal: true, audioBlob: new Blob(['test'], { type: 'audio/ogg' }), audioName: 'test.ogg' }
  const state = { progress: { learnedBySong: {}, reviewItems: [], favoriteSongIds: [], corrections: {}, meaningOverrides: {} }, annotations: {}, aiReviews: {}, sentenceExplanations: {} }
  const restored = songsFromLearningBackup(await inspectLearningBackup(createLearningBackup([backupSong], state)))[0]
  assert.deepEqual(restored.lines, parsed.lines)
  assert.equal(new URL(requests[1]).searchParams.get('rv'), '-1')
})

test('独立时间偏移、多时间戳与缺失辅助轨不会按行号误配', () => {
  assert.deepEqual(timedTrack('[offset:100]\n[00:01][00:02]a'), [{ time: 1100, text: 'a' }, { time: 2100, text: 'a' }])
  const merged = mergePlatformTracks('[00:01]空を見よう\n[00:02]星光', '[00:03]不应误配', '[offset:100]\n[00:00.900]so ra')
  assert.deepEqual(merged.trackSummary, { original: 2, translation: 0, romaji: 1, unmatched: 1 })
  assert.ok(!merged.lyrics.includes('不应误配'))
  assert.equal(mergePlatformTracks('[00:01]空を見よう').trackSummary.romaji, 0)
  assert.throws(() => mergePlatformTracks('无时间轴'), /时间轴/)
})

test('酷我非标准 JSON 只解析数据，拒绝脚本与不完整字符串', () => {
  assert.deepEqual(parsePlatformJson("{'NAME':'it\\'s','count':1,'list':[]}"), { NAME: "it's", count: 1, list: [] })
  assert.throws(() => parsePlatformJson("{'x':function(){return 1}}"))
  assert.throws(() => parsePlatformJson("{'x':'未闭合}"))
})

test('酷狗与酷我按有效歌曲标识获取实际歌词，缺失翻译罗马音不伪造', async () => {
  const hash = 'a'.repeat(32)
  const requests = []
  const kugou = async url => {
    requests.push(url)
    if (url.includes('search/song')) return { status: 1, data: { info: [{ hash, songname: '原创', singername: 'UTA', duration: 10 }] } }
    if (url.includes('/search?')) return { candidates: [{ id: 1, accesskey: 'ABC', duration: 9900 }, { id: 2, accesskey: 'DEF', duration: 50000 }] }
    return { content: Buffer.from('[00:01]空を見よう').toString('base64') }
  }
  const [record] = await searchPlatformSongs('kugou', '原创', undefined, kugou)
  const ready = await fetchPlatformLyrics(record, undefined, kugou)
  assert.equal(ready.trackSummary.original, 1); assert.equal(ready.trackSummary.romaji, 0)
  assert.equal(new URL(requests.at(-1)).searchParams.get('id'), '1')
  const kuwo = async url => url.includes('r.s') ? "{'abslist':[{'MUSICRID':'MUSIC_12','NAME':'原创','ARTIST':'UTA','DURATION':'10'}]}" : { data: { lrclist: [{ time: '1.25', lineLyric: '空を見よう' }] } }
  const [kwRecord] = await searchPlatformSongs('kuwo', '原创', undefined, kuwo)
  assert.equal((await fetchPlatformLyrics(kwRecord, undefined, kuwo)).lyrics, '[00:01.250]空を見よう')
})

test('取消后的平台响应不能继续导入，错误数据不能冒充空成功', async () => {
  const controller = new AbortController()
  const record = { provider: 'netease', platformId: '123' }
  await assert.rejects(fetchPlatformLyrics(record, controller.signal, async () => { controller.abort(); return { code: 200, lrc: { lyric: '[00:01]空を見よう' } } }), { name: 'AbortError' })
  await assert.rejects(searchPlatformSongs('netease', '原创', undefined, async () => ({ code: 403 })), /受限/)
  await assert.rejects(fetchPlatformLyrics({ provider: 'netease', platformId: '../x' }), /标识/)
  assert.ok(LYRIC_SOURCES.find(source => source.id === 'qq').disabled)
})

// 酷我实际可能在同一时间混排原文和译文，界面数量必须使用最终预览结果。
test('混排平台歌词的三轨数量与导入预览一致', async () => {
  const result = await fetchPlatformLyrics({provider:'kuwo',platformId:'12',title:'原创',artist:'UTA'},undefined,async()=>({data:{lrclist:[{time:'1',lineLyric:'空を見よう'},{time:'1',lineLyric:'看看天空'},{time:'2',lineLyric:'星光 夜空'},{time:'2',lineLyric:'星光和夜空'}]}}))
  const parsed = await parseLrcFile(lyricsRecordToFile(result))
  assert.deepEqual(result.trackSummary,{original:2,translation:2,romaji:0,unmatched:0})
  assert.deepEqual(parsed.lines.map(line=>[line.text,line.translation]),[['空を見よう','看看天空'],['星光 夜空','星光和夜空']])
})
