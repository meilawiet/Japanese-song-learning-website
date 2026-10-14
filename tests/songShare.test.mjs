import test from 'node:test'
import assert from 'node:assert/strict'
import {extractShareUrl,identifyShareSong,parseSharePage,resolveSongShare} from '../src/lib/songShare.js'

// 仅用自创歌曲信息和模拟响应验证链接路由，不把商业歌词保存进测试夹具。
const hash = 'a'.repeat(32), mid = '003Test12345678'
const ok = data => ({status:200,data})
test('电脑、手机、hash 路由及分享文案归一成平台歌曲标识', () => {
  const cases = [
    ['http://music.163.com/#/song?id=12&userid=88','netease','12'],
    ['https://y.music.163.com/m/song?id=12&dlt=abc','netease','12'],
    ['https://music.163.com/song/12/','netease','12'],
    [`https://y.qq.com/n/ryqq/songDetail/${mid}`,'qq',mid],
    [`https://i.y.qq.com/v8/playsong.html?songmid=${mid}`,'qq',mid],
    [`https://y.qq.com/n/yqq/song/${mid}.html`,'qq',mid],
    ['https://i.y.qq.com/v8/playsong.html?songid=12','qq','12'],
    ['https://i.y.qq.com/v8/playsong.html?songid=12#wechat_redirect','qq','12'],
    ['https://i2.y.qq.com/n3/other/pages/playsong/index.html?songid=12','qq','12'],
    [`https://www.kugou.com/song/#hash=${hash}&album_id=1`,'kugou',hash],
    [`https://m.kugou.com/share/song.html?hash=${hash}`,'kugou',hash],
    ['https://www.kuwo.cn/play_detail/12','kuwo','12'],
    ['http://www.kuwo.cn/yinyue/12/','kuwo','12'],
    ['https://m.kuwo.cn/h5app/play_detail/12','kuwo','12'],
    ['https://oia.kuwo.cn/kplayer.html?musicId=12','kuwo','12'],
  ]
  for(const [url,provider,id] of cases){const record=identifyShareSong(extractShareUrl(`分享单曲《原创》：${url} (来自平台)`));assert.equal(record.provider,provider);assert.equal(record.id,id);assert.equal(new URL(record.url).protocol,'https:')}
  assert.equal(identifyShareSong('https://y.music.163.com/m/song?url='+encodeURIComponent('https://music.163.com/song?id=12')).id,'12')
})
test('不把歌单、专辑、恶意站点或无效 ID 当作歌曲，也不执行分享文字', async () => {
  for (const value of ['https://music.163.com/#/playlist?id=12','https://y.qq.com/n/ryqq/albumDetail/123','https://www.kuwo.cn/singer_detail/12']) assert.throws(()=>identifyShareSong(value),/单首歌曲/)
  for (const value of ['https://music.163.com.evil.test/song?id=12','https://127.0.0.1/song','https://user:pass@music.163.com/song?id=12','https://music.163.com:8443/song?id=12','javascript:alert(1)']) assert.throws(()=>extractShareUrl(value))
  assert.throws(()=>identifyShareSong('https://music.163.com/song?id=bad'),/标识/)
  assert.throws(()=>extractShareUrl('https://music.163.com/song?id=1 https://music.163.com/song?id=2'),/多个/)
  const calls=[]
  await assert.rejects(resolveSongShare('https://163cn.tv/original',null,async url=>{calls.push(url);return {status:302,headers:{Location:'https://127.0.0.1/private'}}}),/暂不支持/)
  assert.equal(calls.length,1)
})
test('四平台详情接口精确解析歌曲，不开启音乐平台歌词源', async () => {
  const cases = [
    ['https://music.163.com/song?id=12',{songs:[{id:12,name:'原创',artists:[{name:'UTA'}]}]},'api/song/detail'],
    [`https://y.qq.com/n/ryqq/songDetail/${mid}`,{req:{data:{track_info:{mid,title:'原创',singer:[{name:'UTA'}]}}}},'musicu.fcg'],
    ['https://i.y.qq.com/v8/playsong.html?songid=12',{req:{data:{track_info:{id:12,title:'原创',singer:[{name:'UTA'}]}}}},'musicu.fcg'],
    [`https://m.kugou.com/share/song.html?hash=${hash}`,{songName:'原创',singerName:'UTA'},'getSongInfo'],
    ['https://www.kuwo.cn/play_detail/12',{data:{songinfo:{id:12,songName:'原创',artist:'UTA'}}},'songinfoandlrc'],
  ]
  for (const [url,data,endpoint] of cases){let count=0;const record=await resolveSongShare(url,null,async target=>{count++;assert.ok(target.includes(endpoint));return ok(data)});assert.equal(record.query,'原创 / UTA');assert.equal(count,1)}
})
test('短链接逐跳展开、静态重定向与嵌入 hash 使用同一条识别链', async () => {
  const calls=[]
  const record=await resolveSongShare('https://c6.y.qq.com/base/fcgi-bin/u?__=sample',null,async url=>{
    calls.push(url)
    if(calls.length===1)return {status:302,headers:{location:'/redirect'}}
    if(calls.length===2)return ok(`<meta http-equiv="refresh" content="0;url=https://i.y.qq.com/v8/playsong.html?songmid=${mid}">`)
    return ok({req:{data:{track_info:{mid,title:'原创',singer:[{name:'UTA'}]}}}})
  })
  // 两次跳转后直接使用歌曲 ID，不再加载含有条件式 App 唤起脚本的详情页。
  assert.equal(record.query,'原创 / UTA');assert.equal(calls.length,3)
  const kugou=await resolveSongShare('https://t1.kugou.com/song.html?id=test',null,async url=>url.includes('getSongInfo')?ok({fileName:'UTA - 原创'}):ok(`<script>var data={"hash":"${hash}"}</script>`))
  assert.equal(kugou.title,'原创')
  await assert.rejects(resolveSongShare('https://163cn.tv/loop',null,async()=>({status:302,headers:{location:'/loop'}})),/跳转次数/)
})
test('详情页仅解析惰性元信息，缺失歌手不猜测，取消后不产出识别结果', async () => {
  assert.deepEqual(parseSharePage('<meta content="原创 &amp; 天空" property="og:title"><meta property="og:music:artist" content="UTA">'),{title:'原创 & 天空',artist:'UTA'})
  assert.deepEqual(parseSharePage('<script type="application/ld+json">{"@type":"MusicRecording","name":"原创","byArtist":[{"name":"UTA"}]}</script>'),{title:'原创',artist:'UTA'})
  assert.equal(parseSharePage('<title>QQ音乐</title><script>alert(1)</script>'),null)
  await assert.rejects(resolveSongShare('https://music.163.com/song?id=12',null,async()=>ok({songs:[]})),/不存在/)
  const controller=new AbortController()
  await assert.rejects(resolveSongShare('https://music.163.com/song?id=12',controller.signal,async()=>{controller.abort();return ok({songs:[{id:12,name:'原创',artists:[{name:'UTA'}]}]})}),{name:'AbortError'})
})
