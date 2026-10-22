import test from 'node:test'
import assert from 'node:assert/strict'
import {chooseLaunchQuote,savedLaunchArtwork} from '../src/lib/launchQuote.js'

// 启动不能把示例曲或翻译当作用户收藏，也不能改写原歌词内部空格。
test('空歌曲库、示例曲和空歌词都保留默认启动文案',()=>{
  for(const songs of [[],null,[{isDemo:true,lines:[{text:'示例'}]}],[{title:'空歌',lines:[{text:'  '}]}]])assert.equal(chooseLaunchQuote(songs),null)
})
test('抽到真实歌词及当前歌名，不抽译文，保留正文内部全角空格',()=>{
  assert.deepEqual(chooseLaunchQuote([{title:'测试歌曲',lines:[{text:'ありがとう　神様！',translation:'感谢'}]}],()=>0),{text:'ありがとう　神様！',title:'测试歌曲'})
})
test('不同歌曲与最后一行都可被抽取，过滤空行不影响对应歌名',()=>{
  const songs=[{title:'甲',lines:[{text:'一'},{text:''}]},{title:'乙',lines:[{text:'二'},{text:'三'}]}]
  assert.deepEqual([0,.4,.999].map(value=>chooseLaunchQuote(songs,()=>value)),[{text:'一',title:'甲'},{text:'二',title:'乙'},{text:'三',title:'乙'}])
})
test('云端待下载歌曲已有正文时可以参加，无需为启动下载音频',()=>{
  assert.equal(chooseLaunchQuote([{title:'云歌曲',cloudPending:true,lines:[{text:'空へ'}]}]).text,'空へ')
})
test('引句绑定同一首歌，只允许本机封面而不请求远程图片',()=>{
  assert.equal(chooseLaunchQuote([{id:'local-one',title:'甲',lines:[{text:'一'}]}]).songId,'local-one')
  assert.equal(savedLaunchArtwork({artworkUrl:'data:image/png;base64,AAAA'}),'data:image/png;base64,AAAA')
  for(const value of [null,{}, {artworkUrl:'https://example.com/cover.jpg'}, {artworkUrl:'javascript:alert(1)'}])assert.equal(savedLaunchArtwork(value),null)
})
