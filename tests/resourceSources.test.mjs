import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_RESOURCE_SOURCES, RESOURCE_SOURCES_KEY, readResourceSources, resourceSearchUrl, saveResourceSources, sourceAdapter, validateResourceSource } from '../src/lib/resourceSources.js'

// 只用来源网址与自创测试信息，不访问网络、不保存账号密钥。
test('默认来源不含三个音乐平台，只有手动配置才能匹配适配器',()=>{
  assert.deepEqual(DEFAULT_RESOURCE_SOURCES.map(sourceAdapter).filter(Boolean),['lrclib'])
  for(const [url,adapter] of [['https://music.163.com/','netease'],['https://www.kugou.com/','kugou'],['https://www.kuwo.cn/','kuwo']])assert.equal(sourceAdapter({url}),adapter)
  assert.equal(sourceAdapter({url:'https://music.163.com.example.com/'}),null)
  assert.equal(sourceAdapter({url:'https://example.com/'}),null)
  assert.equal(validateResourceSource({url:'https://music.163.com/'}).name,'网易云音乐')
})
test('来源地址与关键词安全校验，普通网址不冒充自动抓取接口',()=>{
  for(const url of ['javascript:alert(1)','file:///tmp/x','https://user:password@example.com/','not-a-url']) assert.throws(()=>validateResourceSource({name:'测试',url}))
  const source=validateResourceSource({name:' 搜索网站 ',url:'https://example.com/search?q={query}'})
  assert.equal(source.name,'搜索网站')
  assert.equal(resourceSearchUrl(source,'空 & 星'),'https://example.com/search?q=%E7%A9%BA%20%26%20%E6%98%9F')
})
test('新增修改删除持久化，空列表不恢复已删除默认项',()=>{
  const oldStorage=globalThis.localStorage,oldWindow=globalThis.window
  const values=new Map(),events=[]
  try {
    globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}
    globalThis.window={dispatchEvent:event=>events.push(event.type)}
    assert.equal(readResourceSources().length,DEFAULT_RESOURCE_SOURCES.length)
    const entry={id:'user',name:'用户网易云',url:'https://music.163.com/'}
    saveResourceSources([entry]);assert.deepEqual(readResourceSources(),[entry])
    saveResourceSources([{...entry,name:'改名'}]);assert.equal(readResourceSources()[0].name,'改名')
    saveResourceSources([]);assert.deepEqual(readResourceSources(),[])
    assert.ok(values.has(RESOURCE_SOURCES_KEY));assert.equal(events.length,3)
  }finally{globalThis.localStorage=oldStorage;globalThis.window=oldWindow}
})
