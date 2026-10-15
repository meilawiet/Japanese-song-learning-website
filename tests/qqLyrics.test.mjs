import assert from 'node:assert/strict'
import test from 'node:test'
import {encryptQrc} from 'qrc-decoder'
import {decodeQQTrack,cleanQQTranslation} from '../src/lib/qqLyrics.js'
import {searchPlatformSongs,fetchPlatformLyrics,mergePlatformTracks,LYRIC_SOURCES} from '../src/lib/platformLyrics.js'
import {platformLyricsRecordToFile as lyricsRecordToFile} from '../src/lib/desktopPlatformLyrics.js'
import {parseLrcFile} from '../src/lib/localSongStore.js'
import sourceConfig from '../desktop/lyricSources.cjs'
const sourceAdapter = ({url}) => sourceConfig.sourceAdapter(url)

// 仅用原创歌词生成编码样本，实际商业歌词不写入测试或仓库。
const base64=text=>Buffer.from(text,'utf8').toString('base64')
const qrc=text=>`<?xml version="1.0"?><QrcInfos><LyricInfo><Lyric_1 LyricType="1" LyricContent="${text}"/></LyricInfo></QrcInfos>`
const mid='000Original123'

test('QQ 明文、UTF-8 Base64、十六进制 QRC 和 XML 实体还原为同一时间轴',()=>{
  const plain='[offset:0]\n[00:01.250]空を見よう\n[00:03.500]I don\'t know'
  assert.equal(decodeQQTrack(plain),plain)
  assert.equal(decodeQQTrack(base64(plain)),plain)
  const encoded=encryptQrc(qrc('[1250,1000]so (1250,100)ra(1350,100)\n[3500,1000]I don&apos;t(3500,100) &amp; (3600,100)you(3700,100)'))
  assert.equal(decodeQQTrack(encoded),'[00:01.250]so ra\n[00:03.500]I don\'t & you')
  assert.equal(decodeQQTrack(base64(encoded)),decodeQQTrack(encoded))
  assert.throws(()=>decodeQQTrack('<html>错误页</html>'),/格式/)
  assert.throws(()=>decodeQQTrack('INVALID!'))
  assert.throws(()=>decodeQQTrack('a'.repeat(2_000_001)),/过大/)
})

test('QQ 搜索使用有效模块封装、保留不同 MID 候选及数字歌曲 ID',async()=>{
  const rows=[0,1].map(index=>({id:100+index,mid:mid+index,title:'原创歌',singer:[{name:'UTA'}],album:{name:'原创专辑'},interval:180}))
  const records=await searchPlatformSongs('qq','原创歌',undefined,async(url,provider)=>{
    assert.equal(provider,'qq')
    const request=JSON.parse(new URL(url).searchParams.get('data'))
    assert.deepEqual(Object.keys(request),['music.search.SearchCgiService'])
    assert.equal(request['music.search.SearchCgiService'].param.query,'原创歌')
    assert.equal(request['music.search.SearchCgiService'].param.num_per_page,20)
    return {code:0,'music.search.SearchCgiService':{code:0,data:{body:{song:{list:[...rows,{mid:'../invalid'}]}}}}}
  })
  assert.equal(records.length,2)
  assert.equal(records[0].songId,100)
  assert.notEqual(records[0].id,records[1].id)
  assert.ok(!LYRIC_SOURCES.find(source=>source.id==='qq').disabled)
  await assert.rejects(searchPlatformSongs('qq','原创',undefined,async()=>({code:0,'music.search.SearchCgiService':{code:0,data:{}}})),/格式异常/)
})

test('QQ 原文、翻译与 QRC 来源注音按时间匹配后完整进入导入预览',async()=>{
  const record={provider:'qq',platformId:mid,songId:100,title:'原创歌',artist:'UTA'}
  const ready=await fetchPlatformLyrics(record,undefined,async url=>{
    const param=JSON.parse(new URL(url).searchParams.get('data')).lyric.param
    assert.equal(param.songMID,mid);assert.equal(param.songID,100)
    assert.equal(param.crypt,0);assert.equal(param.trans,1);assert.equal(param.roma,1)
    return {code:0,lyric:{code:0,data:{
      lyric:base64('[00:00]原创歌 - UTA\n[00:01.250]空を見よう\n[00:03.500]星が光る'),
      trans:base64('[00:00]//\n[00:01.250]看看天空\n[00:03.500]星星闪亮\n[00:09]未匹配译文'),
      roma:encryptQrc(qrc('[1250,1000]so(1250,100) ra(1350,100) wo(1450,100) mi(1550,100) yo(1650,100) u(1750,100)\n[3500,1000]ho shi ga hi ka ru')),
    }}}
  })
  assert.deepEqual(ready.trackSummary,{original:2,translation:2,romaji:2,unmatched:1})
  const parsed=await parseLrcFile(lyricsRecordToFile(ready))
  assert.deepEqual(parsed.lines.map(line=>[line.start,line.text,line.translation,line.romaji]),[
    [1.25,'空を見よう','看看天空','so ra wo mi yo u'],[3.5,'星が光る','星星闪亮','ho shi ga hi ka ru'],
  ])
  assert.ok(!ready.sourceWarnings)
  assert.equal(cleanQQTranslation('[00:01]//\n[00:02]有效翻译'),'[00:02]有效翻译')
})

test('QQ 缺失辅助轨正常导入，异常辅助轨保留原文并提示，取消和无效 ID 拒绝导入',async()=>{
  const record={provider:'qq',platformId:mid,title:'原创',artist:'UTA'}
  const response=tracks=>({code:0,lyric:{code:0,data:{lyric:base64('[00:01]原创歌词'),...tracks}}})
  assert.deepEqual((await fetchPlatformLyrics(record,undefined,async()=>response({}))).trackSummary,{original:1,translation:0,romaji:0,unmatched:0})
  const partial=await fetchPlatformLyrics(record,undefined,async()=>response({roma:'invalid!'}))
  assert.equal(partial.trackSummary.original,1);assert.match(partial.sourceWarnings[0],/来源注音/)
  await assert.rejects(fetchPlatformLyrics({...record,platformId:'../invalid'}),/不可用/)
  await assert.rejects(fetchPlatformLyrics(record,undefined,async()=>({code:0,lyric:{code:403}})),/暂不可用/)
  const controller=new AbortController()
  await assert.rejects(fetchPlatformLyrics(record,controller.signal,async()=>{controller.abort();return response({})}),{name:'AbortError'})
})

test('Windows 手动配置 QQ 常用网址启用同一适配器',()=>{
  for(const url of ['https://y.qq.com/','https://i.y.qq.com/','https://music.qq.com/'])assert.equal(sourceAdapter({url}),'qq')
  assert.equal(sourceAdapter({url:'https://y.qq.com.example.com/'}),null)
})

// 只接受 QQ 已知时间精度差，毫秒邻近但存在歧义或竞争的行仍不自动合并。
test('QQ 仅允许唯一对应的 10ms 精度差，其他来源仍严格匹配',()=>{
  const original='[00:01.000]空を見よう\n[00:03.000]星が光る'
  const track='[00:01.009]so ra\n[00:03.010]ho shi\n[00:05]unmatched'
  assert.deepEqual(mergePlatformTracks(original,'',track).trackSummary,{original:2,translation:0,romaji:0,unmatched:3})
  assert.deepEqual(mergePlatformTracks(original,'',track,{timeTolerance:10}).trackSummary,{original:2,translation:0,romaji:2,unmatched:1})
  assert.equal(mergePlatformTracks(original,'','[00:01.011]outside',{timeTolerance:10}).trackSummary.romaji,0)
  assert.equal(mergePlatformTracks('[00:01.000]a\n[00:01.010]b','','[00:01.005]ambiguous',{timeTolerance:10}).trackSummary.romaji,0)
  const conflict=mergePlatformTracks(original,'','[00:01.000]exact\n[00:01.009]near',{timeTolerance:10})
  assert.equal(conflict.trackSummary.romaji,1);assert.equal(conflict.trackSummary.unmatched,1)
  assert.ok(conflict.lyrics.includes('[uta-romaji]exact'));assert.ok(!conflict.lyrics.includes('[uta-romaji]near'))
})
