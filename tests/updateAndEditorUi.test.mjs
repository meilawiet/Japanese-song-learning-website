import {before, after, test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
// 同时校验所有联网入口，防止歌曲宝出现重复按钮。
// let server, AppUpdatePrompt, AboutPanel, Editor
let server, AppUpdatePrompt, AboutPanel, Editor, OnlineSongSearch
before(async()=>{
  server=await createServer({server:{middlewareMode:true,watch:{ignored:['**/.tools/**','**/server/.venv/**']}},appType:'custom',logLevel:'silent'})
  const updates=await server.ssrLoadModule('/src/components/AppUpdates.jsx')
  AppUpdatePrompt=updates.AppUpdatePrompt;AboutPanel=updates.AboutPanel
  Editor=(await server.ssrLoadModule('/src/components/SongDetailsEditor.jsx')).default
  OnlineSongSearch=(await server.ssrLoadModule('/src/components/OnlineSongSearch.jsx')).default
})
after(async()=>{await server?.close()})
// 校验用户看见的入口，避免旧安装方式或多余按钮再次出现在更新界面。
test('下载前、下载中和安装失败时更新弹窗都只保留取消与更新',()=>{
  for(const state of [{busy:false},{busy:true,progress:42},{busy:false,ready:true}]){
    const html=renderToStaticMarkup(createElement(AppUpdatePrompt,{updates:{prompt:true,release:{version:'1.0.3'},downloadState:state,error:'安装失败，请尝试手动安装。',dismiss:()=>{},download:()=>{}}}))
    assert.equal((html.match(/<button /g)||[]).length,2)
    assert.match(html,/>取消<\/button>/);assert.match(html,/>更新<\/button>/)
    assert.match(html,/role="alert"/);assert.match(html,/手动安装/)
    assert.doesNotMatch(html,/选择其他安装方式|保存安装包|选择已下载/)
  }
})
test('关于页面三项入口与交流群号正确且没有启动说明',()=>{
  const html=renderToStaticMarkup(createElement(AboutPanel,{updates:{version:'1.0.2',check:()=>{}}}))
  assert.equal((html.match(/<button /g)||[]).length,3)
  for(const text of ['检查更新','项目地址','加群交流','1125131374']) assert.ok(html.includes(text))
  assert.doesNotMatch(html,/每次启动自动检测/)
})
test('歌曲编辑提供五个可收起分区且默认不挂载联网搜索',()=>{
  const html=renderToStaticMarkup(createElement(Editor,{song:{id:'test',title:'原创测试',artist:'UTA',lines:[{id:0,start:0,text:'歌'}]},onClose:()=>{},onSave:()=>{}}))
  assert.equal((html.match(/<details /g)||[]).length,5)
  for(const text of ['歌曲名称','歌手名称','编辑歌曲封面','重新上传歌曲或歌词','编辑歌词与时间轴']) assert.ok(html.includes(text))
  assert.doesNotMatch(html,/online-song-search|artwork-picker/)
  assert.match(html,/>保存修改<\/button>/)
})

// 同一个组件用于本地导入和重新上传，两处都展示新增网站入口。
test('联网查找包括下歌吧且歌曲宝只有一个入口',()=>{
  const html=renderToStaticMarkup(createElement(OnlineSongSearch,{onChooseLyrics:()=>{}}))
  assert.match(html,/下歌吧/)
  assert.equal((html.match(/>歌曲宝 /g)||[]).length,1)
  for(const name of ['Toomic / MusicEnc','爱歌词网','世纪音乐网']) assert.ok(html.includes(name))
})

// 默认不开放三个音乐平台，用户显式添加网址后才启用对应适配器。
test('歌词来源仅在安卓开放且平台必须由用户配置',async()=>{
  const {Capacitor}=await server.ssrLoadModule('@capacitor/core')
  const original=Capacitor.isNativePlatform
  const oldStorage=globalThis.localStorage
  try {
    Capacitor.isNativePlatform=()=>false
    const web=renderToStaticMarkup(createElement(OnlineSongSearch,{onChooseLyrics:()=>{}}))
    assert.doesNotMatch(web,/aria-label="歌词来源"/)
    Capacitor.isNativePlatform=()=>true
    const mobile=renderToStaticMarkup(createElement(OnlineSongSearch,{onChooseLyrics:()=>{}}))
    assert.match(mobile,/aria-label="歌词来源"/)
    assert.ok(mobile.includes('LRCLIB'))
    for(const name of ['网易云音乐','酷狗音乐','酷我音乐']) assert.ok(!mobile.includes(name))
    globalThis.localStorage={getItem:()=>JSON.stringify([{id:'user-net',name:'网易云音乐',url:'https://music.163.com/'}])}
    const configured=renderToStaticMarkup(createElement(OnlineSongSearch,{onChooseLyrics:()=>{}}))
    assert.match(configured,/<option value="user-net" selected="">网易云音乐<\/option>/)
  } finally {Capacitor.isNativePlatform=original;globalThis.localStorage=oldStorage}
})

test('更新提示不显示标题井号，项目使用真实列表节点',()=>{
  const html=renderToStaticMarkup(createElement(AppUpdatePrompt,{updates:{prompt:true,release:{version:'1.0.3',notes:'### 更新内容\n- 修复界面\n- 优化操作'},downloadState:{busy:false},dismiss:()=>{},download:()=>{}}}))
  assert.match(html,/<h4>更新内容<\/h4>/)
  assert.match(html,/<ul><li>修复界面<\/li><li>优化操作<\/li><\/ul>/)
  assert.doesNotMatch(html,/###|&lt;script/)
})
