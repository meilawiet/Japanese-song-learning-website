import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let server, AnnotatedLine, SettingsDialog
let AndroidSingAlong
before(async () => {
  // 旧测试服务会监听本机测试浏览器缓存，Windows 锁定的 Cookie 文件会导致测试异常。
  // server = await createServer({ ssr: { external: ['@faanau/kuromoji'] }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  // 排除不属于源码的工具与虚拟环境目录，避免锁文件干扰组件回归测试。
  server = await createServer({ ssr: { external: ['@faanau/kuromoji'] }, server: { middlewareMode: true, watch: { ignored: ['**/.tools/**', '**/server/.venv/**'] } }, appType: 'custom', logLevel: 'silent' })
  AnnotatedLine = (await server.ssrLoadModule('/src/components/AnnotatedLine.jsx')).default
  SettingsDialog = (await server.ssrLoadModule('/src/components/SettingsDialog.jsx')).default
  AndroidSingAlong = (await server.ssrLoadModule('/src/components/AndroidSingAlong.jsx')).default
})
after(async () => { await server?.close() })

// 重新打开有效结果即可试听，不能因查看缓存而再次调用AI；无音频时禁用播放。
test('AI复核缓存结果提供对应句试听和暂停，关闭重开无需重新复核',async()=>{
  const Review=(await server.ssrLoadModule('/src/components/LyricAiReview.jsx')).default
  const song={id:'test',lines:[{id:10,text:'歌'},{id:20,text:'夢'}]}
  const initialResult={suggestions:[{line_id:20,token_index:0,surface:'夢',suggested_reading:'ゆめ',reason:'待校对'}],issues:[]}
  const html=renderToStaticMarkup(createElement(Review,{song,initialResult,audioReady:true,playingLineId:20}))
  assert.match(html,/暂停第 2 句/)
  assert.match(html,/暂停试听/)
  assert.match(html,/重新复核/)
  assert.ok(!html.includes('开始复核'))
  const disabled=renderToStaticMarkup(createElement(Review,{song,initialResult,audioReady:false}))
  assert.match(disabled,/disabled=""[^>]*aria-label="试听第 2 句"/)
})

// 空读音不输出 ruby，歌词仍在；再次打开编辑器时输入框保持留空。
test('取消注音在逐句、跟唱和再次编辑中一致', async () => {
  const tokens = [{ index: 0, surface: '明日', reading: 'あした' }]
  const corrections = { 'test:0:0': '' }
  // 原样本未声明语言；纯汉字样本现在需明确为日语，继续验证主动留空的旧行为。
  // const song = { id: 'test', title: '测试', artist: 'UTA', lines: [{ id: 0, text: '明日' }] }
  const song = { id: 'test', title: '测试', artist: 'UTA', language:'ja', lines: [{ id: 0, text: '明日' }] }
  for (const readingStyle of ['hiragana', 'romaji', 'both']) {
    for (const interactive of [true, false]) {
      const lesson = renderToStaticMarkup(createElement(AnnotatedLine, { tokens, corrections, songId: 'test', lineId: 0, mode: 'reading', readingStyle, interactive }))
      assert.ok(lesson.includes('明日') && !lesson.includes('<ruby>') && !lesson.includes('あした'))
    }
    const sing = renderToStaticMarkup(createElement(AndroidSingAlong, { song, corrections, annotations: [{ id: 0, tokens }], readingStyle, audioReady: true }))
    assert.ok(sing.includes('明日') && !sing.includes('<ruby>') && !sing.includes('あした'))
  }
  const Editor = (await server.ssrLoadModule('/src/components/LyricLineEditor.jsx')).default
  const markup = renderToStaticMarkup(createElement(Editor, { song, line: song.lines[0], annotation: { tokens }, corrections }))
  assert.match(markup, /value=""/)
  assert.ok(!markup.includes('value="あした"'))
  // 编辑器显示传入的 LRC 翻译，同时支持空字段。
  assert.match(markup, /这一句的翻译/)
  const translated = renderToStaticMarkup(createElement(Editor, { song, line: { ...song.lines[0], translation: '来自 LRC 的翻译' }, annotation: { tokens }, corrections }))
  assert.match(translated, /来自 LRC 的翻译/)
})

function lyric(style, mode = 'reading') {
  return renderToStaticMarkup(createElement(AnnotatedLine, {
    tokens: [{ index: 0, surface: '帰る', reading: 'かえる' }], corrections: { 'test:0:0': 'かえる' },
    songId: 'test', lineId: 0, mode, readingStyle: style,
  }))
}

test('ruby display switches scripts without changing original lyrics or kana suffixes', () => {
  assert.match(lyric('hiragana'), /<ruby>帰<rt lang="ja">かえ<\/rt><\/ruby>る/)
  assert.match(lyric('romaji'), /<ruby>帰<rt lang="ja-Latn">kae<\/rt><\/ruby>る/)
  assert.match(lyric('romaji'), /読音|读音 kaeru/)
})

test('original and hidden practice modes still hide ruby in both scripts', () => {
  for (const style of ['hiragana', 'romaji']) {
    for (const mode of ['original', 'practice']) assert.ok(!lyric(style, mode).includes('<rt'))
  }
})

test('settings offers both options and reflects persisted selection', () => {
  for (const style of ['hiragana', 'romaji']) {
    const markup = renderToStaticMarkup(createElement(SettingsDialog, { initialTab: 'reading', readingStyle: style, onReadingStyleChange: () => {} }))
    assert.match(markup, /注音显示/)
    assert.match(markup, /平假名/)
    assert.match(markup, /罗马音/)
    assert.match(markup, new RegExp(`checked="" value="${style}"`))
  }
})

// 两个模式必须使用同一人工读音，跟唱不输出翻译文或修改颜色标记。
test('跟唱与逐句同步人工注音并隐藏译文和校正变色标记', () => {
  const tokens = [{ index: 0, surface: '明日', reading: 'あした' }]
  const corrections = { 'test:0:0': 'あす' }
  const song = { id: 'test', title: '原创测试', artist: 'UTA', lines: [{ id: 0, text: '明日', translation: '不应显示的译文' }] }
  for (const readingStyle of ['hiragana', 'romaji']) {
    const shared = { tokens, corrections, songId: 'test', lineId: 0, readingStyle }
    const lesson = renderToStaticMarkup(createElement(AnnotatedLine, { ...shared, mode: 'reading' }))
    const sing = renderToStaticMarkup(createElement(AndroidSingAlong, { song, corrections, annotations: [{ id: 0, tokens }], readingStyle, audioReady: true }))
    const expected = readingStyle === 'romaji' ? 'asu' : 'あす'
    assert.match(lesson, new RegExp(`>${expected}</rt>`))
    // 原断言使用 rt；新版安卓按完整词组显示注音层。
    assert.match(sing, new RegExp(`lang="${readingStyle==='romaji'?'ja-Latn':'ja'}">${expected}</span>`))
    assert.ok(!sing.includes('不应显示的译文'))
    assert.ok(!lesson.includes('corrected'))
  }
})

// 安卓静态歌词不能残留可拖选的单词按钮，且原文不显示注音。
test('逐句关闭选词后保留人工注音但不输出选词按钮', () => {
  const props = { tokens:[{ index:0, surface:'明日', reading:'あした' }], corrections:{ 's:0:0':'あす' }, songId:'s', lineId:0, interactive:false }
  const reading = renderToStaticMarkup(createElement(AnnotatedLine, { ...props, mode:'reading' }))
  assert.match(reading, /あす/)
  assert.ok(!reading.includes('<button') && !reading.includes('range-selected'))
  const original = renderToStaticMarkup(createElement(AnnotatedLine, { ...props, mode:'original' }))
  assert.match(original, /明日/)
  assert.ok(!original.includes('<rt'))
})

// 模拟服务验证手机实际请求结构与响应读取，不调用用户付费服务。
test('歌词问答将上下文和追问发送给已配置服务并读取回答', async () => {
  const { postMobileAi } = await server.ssrLoadModule('/src/lib/mobileAi.js')
  const previous = globalThis.fetch
  let received
  globalThis.fetch = async (url, options) => { received = JSON.parse(options.body); return new Response(JSON.stringify({ choices:[{ message:{ content:JSON.stringify({ answer:'结合上下文，这里表示明天。' }) } }] }), { status:200, headers:{ 'Content-Type':'application/json' } }) }
  try {
    const payload = { context:{ current_line:{ text:'明日も歌う', readings:[{ word:'明日', reading:'あす' }] } }, conversation:[{ role:'user', content:'明日什么意思？' },{ role:'assistant', content:'明天' }], question:'为什么读あす？' }
    const answer = await postMobileAi('/api/ai/lyric-chat', payload, { base_url:'https://test.invalid/v1', model:'test', useServerDefault:false })
    assert.equal(answer.answer, '结合上下文，这里表示明天。')
    assert.ok(received.messages[1].content.includes(JSON.stringify(payload)))
  } finally { globalThis.fetch = previous }
})

// 联网开关必须真实走搜索工具，并保留可查看来源，不能只修改提示词。
test('DeepSeek联网问答使用服务端搜索并读取来源', async () => {
  const { postMobileAi } = await server.ssrLoadModule('/src/lib/mobileAi.js')
  const previous = globalThis.fetch
  let received
  globalThis.fetch = async (url, options) => { received={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({ content:[{type:'server_tool_use',name:'web_search'},{type:'web_search_tool_result',content:[{type:'web_search_result',title:'词典来源',url:'https://example.org/dictionary'}]},{type:'text',text:'依据词典与歌词上下文的回答。'}],stop_reason:'end_turn' }),{status:200,headers:{'Content-Type':'application/json'}}) }
  try {
    const result=await postMobileAi('/api/ai/lyric-chat',{context:{current_line:{text:'明日も歌う'}},conversation:[],question:'查询词义'}, {base_url:'https://api.deepseek.com',model:'deepseek-flash',web_search_enabled:true})
    assert.equal(received.url,'https://api.deepseek.com/anthropic/v1/messages')
    assert.equal(received.body.tools[0].type,'web_search_20250305')
    assert.equal(received.body.tools[0].max_uses,2)
    assert.ok(received.body.system.includes('明日も歌う'))
    assert.equal(result.searchUsed,true)
    assert.equal(result.sources[0].url,'https://example.org/dictionary')
    assert.ok(result.answer.includes('歌词上下文'))
  } finally {globalThis.fetch=previous}
})

// 双层汉字注音和完整读音行必须在两种练习中采用相同人工读音。
test('双注音在逐句与跟唱同步，跟唱提供更多入口', () => {
  const tokens = [{ index:0, surface:'明日', reading:'あした' }, { index:1, surface:'は', reading:'は', part_of_speech:'助詞・係助詞' }]
  const corrections = { 's:0:0':'あす' }
  const song = { id:'s', title:'测试', artist:'UTA', lines:[{ id:0, text:'明日は', translation:'不能显示' }] }
  const lesson = renderToStaticMarkup(createElement(AnnotatedLine, { tokens, corrections, songId:'s', lineId:0, readingStyle:'both', mode:'reading', interactive:false }))
  const sing = renderToStaticMarkup(createElement(AndroidSingAlong, { song, annotations:[{ id:0, tokens }], corrections, readingStyle:'both', audioReady:true }))
  for (const html of [lesson, sing]) {
    assert.match(html, /lang="ja">あす<\/span>/)
    assert.match(html, /lang="ja-Latn">asu<\/span>/)
    assert.ok(!html.includes('あした') && !html.includes('corrected'))
  }
  assert.match(sing, /更多跟唱选项/)
  // 原整句行断言：/あす は\nasu wa/；现在逐词对齐显示助词 wa。
  assert.match(sing, /lang="ja-Latn">wa<\/span>/)
  assert.ok(!sing.includes('不能显示'))
  const original = renderToStaticMarkup(createElement(AnnotatedLine, { tokens, corrections, songId:'s', lineId:0, readingStyle:'both', mode:'original', interactive:false }))
  assert.ok(!original.includes('<rt'))
})

test('共用注音菜单包含三种选项并反映当前选择', async () => {
  const ReadingStyleOptions = (await server.ssrLoadModule('/src/components/ReadingStyleOptions.jsx')).default
  for (const readingStyle of ['hiragana', 'romaji', 'both']) {
    const html = renderToStaticMarkup(createElement(ReadingStyleOptions, { readingStyle, onReadingStyle:()=>{} }))
    assert.match(html, /假名＋罗马音/)
    assert.equal((html.match(/type="radio"/g)||[]).length, 3)
    assert.match(html, new RegExp(`checked="" value="${readingStyle}"`))
  }
})

// 自带罗马音同时用于 ruby，整句行保留平台拼写，继续隐藏译文。
test('跟唱自带罗马音优先用于 ruby 与整句行', () => {
  const song = {id:'s',title:'原创',artist:'UTA',lines:[{id:0,text:'夢',translation:'不要显示',romaji:'yu me'}]}
  const tokens = [{index:0,surface:'夢',reading:'ゆめ'}]
  for (const readingStyle of ['romaji','both']) {
    const html = renderToStaticMarkup(createElement(AndroidSingAlong,{song,annotations:[{id:0,tokens}],corrections:{},readingStyle,audioReady:true}))
    // 来源音节拼写合并为词级罗马音，原有整句重复行取消。
    assert.ok(html.includes('yume') && !html.includes('不要显示'))
    if(readingStyle==='both')assert.match(html, /lang="ja">ゆめ/)
    else assert.match(html, /lang="ja-Latn">yume/)
  }
})

// 显示偏好不能删除人工读音，重新切换时仍使用原有校正。
test('不注音保留纯原文与人工校正，字典未就绪时也可阅读',async()=>{
  const Reading=(await server.ssrLoadModule('/src/components/ReadingLyric.jsx')).default
  const tokens=[{index:0,surface:'庭',reading:'にわ'}],corrections={'test:0:0':'その'}
  const plain=renderToStaticMarkup(createElement(Reading,{tokens,corrections,songId:'test',lineId:0,readingStyle:'none',stacked:true}))
  assert.ok(plain.includes('庭')&&!plain.includes('にわ')&&!plain.includes('その')&&!plain.includes('<ruby'))
  assert.equal(corrections['test:0:0'],'その')
  const fallback=renderToStaticMarkup(createElement(AnnotatedLine,{text:'庭（にわ）で',interactive:false,mode:'original',readingStyle:'none'}))
  assert.ok(fallback.includes('庭で')&&!fallback.includes('にわ'))
})

test('统一学习页的学习进度在歌曲封面下方独立成行',async()=>{
  const {AndroidStudyHeader}=await server.ssrLoadModule('/src/components/AndroidStudyPlayer.jsx')
  const html=renderToStaticMarkup(createElement(AndroidStudyHeader,{song:{title:'原创测试',artist:'UTA',lines:[{id:0}]},learned:0}))
  assert.match(html,/<\/button><\/div><div class="android-study-progress">/)
  assert.match(html,/0 \/ 1 句已掌握/)
})

// 来源、字典、括号及人工读音先确定优先级，再映射汉字显示；保存数据不可被显示层改写。
test('所有来源最终只在汉字上显示假名，来源和人工读音仍优先',async()=>{
  const Reading=(await server.ssrLoadModule('/src/components/ReadingLyric.jsx')).default
  const cases=[
    {surface:'伝え',reading:'つたえ',source:'tsutae',han:'つた'},
    {surface:'抱きしめ',reading:'ほうきしめ',source:'dakishime',han:'だ'},
    {surface:'抱（だ）きしめ',reading:'ほうきしめ',source:'',han:'だ'},
    {surface:'抱きしめ',reading:'だきしめ',source:'',han:'だ'},
  ]
  for(const c of cases){
    const tokens=[{index:0,surface:c.surface,reading:c.reading}],snapshot=JSON.stringify(tokens)
    for(const readingStyle of ['hiragana','both']){
      const html=renderToStaticMarkup(createElement(Reading,{tokens,corrections:{},songId:'test',lineId:0,readingStyle,stacked:true,importedRomaji:c.source}))
      assert.ok(html.includes(`>${c.han}</span>`));assert.ok(!html.includes('>つたえ</span>')&&!html.includes('>だきしめ</span>'))
      assert.equal(JSON.stringify(tokens),snapshot)
    }
  }
  const corrections={'test:0:0':'かかえ'},tokens=[{index:0,surface:'抱え',reading:'ほうえ'}],snapshot=JSON.stringify(corrections)
  const html=renderToStaticMarkup(createElement(Reading,{tokens,corrections,songId:'test',lineId:0,readingStyle:'both',stacked:true,importedRomaji:'houe'}))
  assert.ok(html.includes('>かか</span>'));assert.equal(JSON.stringify(corrections),snapshot)
})
