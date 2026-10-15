import assert from 'node:assert/strict'
import test from 'node:test'
import {shareSearchSource,searchLyricsSources} from '../src/lib/lyricSearch.js'

// 使用自创歌曲与模拟平台，验证来源选择不会误用平台名或自动启用未配置来源。
const sources=[
  {id:'custom-n',name:'我的网易歌词',adapter:'netease'},
  {id:'custom-k',name:'我的酷我歌词',adapter:'kuwo'},
  {id:'custom-u',name:'日文歌词网站',adapter:'utaten'},
]

test('分享链接使用已配置平台的用户来源 ID，未配置平台回到混合',()=>{
  assert.equal(shareSearchSource(sources,'netease'),'custom-n')
  assert.equal(shareSearchSource(sources,'kuwo'),'custom-k')
  assert.equal(shareSearchSource(sources,'kugou'),'mixed')
  assert.equal(shareSearchSource([], 'netease'),'mixed')
  assert.equal(shareSearchSource(sources, 'unknown'),'mixed')
  assert.equal(shareSearchSource([...sources,{id:'second-n',adapter:'netease'}],'netease'),'custom-n')
})

test('链接平台已配置时仅请求对应来源，未配置时混合搜索现有来源',async()=>{
  for(const [platform,expected] of [['netease',['netease']],['kuwo',['kuwo']],['kugou',['netease','kuwo','utaten']]]){
    const selected=shareSearchSource(sources,platform)
    const calls=[]
    const result=await searchLyricsSources(selected==='mixed'?sources:sources.filter(item=>item.id===selected),'原创歌 / UTA',undefined,{
      search:async(provider,keyword)=>{
        calls.push([provider,keyword])
        return [{id:`${provider}:1`,title:'原创歌',lyrics:'[00:01]原创歌词'}]
      },
    })
    assert.deepEqual(calls.map(([provider])=>provider),expected)
    assert.deepEqual(result.records.map(record=>record.provider),expected)
    assert.ok(calls.every(([provider,keyword])=>keyword===(provider==='utaten'?'原创歌 / UTA':'原创歌 UTA')))
  }
})
