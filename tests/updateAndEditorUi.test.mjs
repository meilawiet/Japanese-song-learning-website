import {before, after, test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
// 同时校验所有联网入口，防止歌曲宝出现重复按钮。
// let server, AppUpdatePrompt, AboutPanel, Editor
let server, AppUpdatePrompt, AboutPanel, Editor, OnlineSongSearch
// 新增首页交流邀请的可见文案与无障碍入口检查。
let CommunityInviteDialog
before(async()=>{
  server=await createServer({server:{middlewareMode:true,watch:{ignored:['**/.tools/**','**/server/.venv/**']}},appType:'custom',logLevel:'silent'})
  const updates=await server.ssrLoadModule('/src/components/AppUpdates.jsx')
  AppUpdatePrompt=updates.AppUpdatePrompt;AboutPanel=updates.AboutPanel
  Editor=(await server.ssrLoadModule('/src/components/SongDetailsEditor.jsx')).default
  OnlineSongSearch=(await server.ssrLoadModule('/src/components/OnlineSongSearch.jsx')).default
  CommunityInviteDialog=(await server.ssrLoadModule('/src/components/CommunityInvite.jsx')).CommunityInviteDialog
})
after(async()=>{await server?.close()})
// 旧断言要求两个入口；停用兔小巢后仅保留加群文案和群号复制。
test('交流邀请仅邀请加群，保留关闭和永久忽略选项',()=>{
  const html=renderToStaticMarkup(createElement(CommunityInviteDialog,{onClose:()=>{}}))
  // for(const text of ['欢迎来聊聊','1125131374','复制群号','建议与反馈','暂时不用','不再提醒'])assert.ok(html.includes(text))
  for(const text of ['欢迎来聊聊','1125131374','复制群号','分享喜欢的歌曲和学习心得','暂时不用','不再提醒'])assert.ok(html.includes(text))
  assert.doesNotMatch(html,/反馈|兔小巢/)
  assert.match(html,/role="dialog"/);assert.match(html,/aria-modal="true"/)
  assert.match(html,/type="checkbox"/)
  // assert.equal((html.match(/<button /g)||[]).length,3)
  assert.equal((html.match(/<button /g)||[]).length,2)
})
// 校验用户看见的入口，避免旧安装方式或多余按钮再次出现在更新界面。
test('下载前、下载中和安装失败时更新弹窗都只保留取消与更新',()=>{
  for(const state of [{busy:false},{busy:true,progress:42},{busy:false,ready:true}]){
    const html=renderToStaticMarkup(createElement(AppUpdatePrompt,{updates:{prompt:true,release:{version:'1.0.3'},downloadState:state,error:'安装失败，请尝试手动安装。',dismiss:()=>{},download:()=>{}}}))
    assert.equal((html.match(/<button /g)||[]).length,2)
    assert.match(html,/>取消<\/button>/);assert.match(html,/>更新<\/button>/)
    // 更新忽略项是复选框，不增加额外操作按钮。
    assert.match(html,/type="checkbox"/);assert.match(html,/此版本不再提示更新/)
    assert.match(html,/role="alert"/);assert.match(html,/手动安装/)
    assert.doesNotMatch(html,/选择其他安装方式|保存安装包|选择已下载/)
  }
})
test('关于页面停用反馈入口，保留更新、项目地址和正确交流群号',()=>{
  const html=renderToStaticMarkup(createElement(AboutPanel,{updates:{version:'1.0.2',check:()=>{}}}))
  // 原只有检查更新、项目地址、加群交流三个按钮；现在增加兔小巢入口。
  // assert.equal((html.match(/<button /g)||[]).length,3)
  // 原反馈版要求四个入口：assert.equal((html.match(/<button /g)||[]).length,4)
  // for(const text of ['检查更新','项目地址','加群交流','建议与反馈','1125131374']) assert.ok(html.includes(text))
  assert.equal((html.match(/<button /g)||[]).length,3)
  for(const text of ['检查更新','项目地址','加群交流','1125131374']) assert.ok(html.includes(text))
  assert.doesNotMatch(html,/建议与反馈|兔小巢/)
  assert.doesNotMatch(html,/每次启动自动检测/)
})
test('歌曲编辑合并名称分区为四项且默认不挂载联网搜索',()=>{
  const html=renderToStaticMarkup(createElement(Editor,{song:{id:'test',title:'原创测试',artist:'UTA',lines:[{id:0,start:0,text:'歌'}]},onClose:()=>{},onSave:()=>{}}))
  // 原来名称与歌手各占一项，共五项；现在合并为一个折叠项。
  // assert.equal((html.match(/<details /g)||[]).length,5)
  assert.equal((html.match(/<details /g)||[]).length,4)
  for(const text of ['歌曲和歌手名称','编辑歌曲封面','重新上传歌曲或歌词','编辑歌词与时间轴']) assert.ok(html.includes(text))
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
    // 原默认选中 user-net；新增混合搜索默认选中，音乐平台仍须手动配置。
    assert.match(configured,/<option value="mixed" selected="">混合搜索（已配置来源）<\/option>/)
    assert.match(configured,/<option value="user-net">网易云音乐<\/option>/)
  } finally {Capacitor.isNativePlatform=original;globalThis.localStorage=oldStorage}
})

test('更新提示不显示标题井号，项目使用真实列表节点',()=>{
  const html=renderToStaticMarkup(createElement(AppUpdatePrompt,{updates:{prompt:true,release:{version:'1.0.3',notes:'### 更新内容\n- 修复界面\n- 优化操作'},downloadState:{busy:false},dismiss:()=>{},download:()=>{}}}))
  assert.match(html,/<h4>更新内容<\/h4>/)
  assert.match(html,/<ul><li>修复界面<\/li><li>优化操作<\/li><\/ul>/)
  assert.doesNotMatch(html,/###|&lt;script/)
})
