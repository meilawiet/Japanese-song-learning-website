import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let server, AnnotatedLine, SettingsDialog
let AndroidSingAlong
before(async () => {
  server = await createServer({ ssr: { external: ['@faanau/kuromoji'] }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  AnnotatedLine = (await server.ssrLoadModule('/src/components/AnnotatedLine.jsx')).default
  SettingsDialog = (await server.ssrLoadModule('/src/components/SettingsDialog.jsx')).default
  AndroidSingAlong = (await server.ssrLoadModule('/src/components/AndroidSingAlong.jsx')).default
})
after(async () => { await server?.close() })

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
test('desktop can show kana and romaji together, hide one word, and keep English untouched', () => {
  const dual = lyric('both')
  assert.match(dual, /かえ/)
  assert.match(dual, /kae/)
  const hidden = renderToStaticMarkup(createElement(AnnotatedLine, { tokens: [{ index: 0, surface: '帰る', reading: 'かえる' }], corrections: {}, hiddenReadings: { 'test:0:0': true }, songId: 'test', lineId: 0, mode: 'reading', readingStyle: 'both' }))
  assert.match(hidden, />帰る</)
  assert.ok(!hidden.includes('<rt'))
  const english = renderToStaticMarkup(createElement(AnnotatedLine, { tokens: null, fallbackText: 'I love you', corrections: {}, songId: 'test', lineId: 0, mode: 'reading', readingStyle: 'both' }))
  assert.match(english, /I love you/)
  assert.ok(!english.includes('<rt'))
  const tokenizedEnglish = renderToStaticMarkup(createElement(AnnotatedLine, { tokens: [{ index: 0, surface: 'Hello', reading: 'Hello' }, { index: 1, surface: ' world', reading: ' world' }], corrections: {}, songId: 'test', lineId: 0, mode: 'reading', readingStyle: 'both' }))
  assert.ok(tokenizedEnglish.includes('Hello') && tokenizedEnglish.includes(' world'))
  assert.ok(!tokenizedEnglish.includes('<rt'))
})

test('word-aligned desktop readings keep corrections, particles, English and hidden words together', () => {
  const props = { wordAlignedReadings: true, songId: 'test', lineId: 0, readingStyle: 'both', mode: 'reading',
    tokens: [{ index: 0, surface: '私達', reading: 'わたしたち' }, { index: 1, surface: 'へ', reading: 'へ', part_of_speech: '助詞' },
      { index: 2, surface: 'Hello', reading: 'ハロー' }], corrections: { 'test:0:0': 'われわれ' } }
  const markup = renderToStaticMarkup(createElement(AnnotatedLine, props))
  assert.match(markup, /word-aligned/)
  assert.match(markup, /token-reading-kana[^>]*>われわれ</)
  assert.match(markup, /token-reading-romaji[^>]*>wareware</)
  assert.match(markup, /token-reading-romaji[^>]*>e</)
  assert.match(markup, />Hello</)
  assert.ok(!markup.includes('haroo'))
  assert.ok(!markup.includes('<rt'))
  const hidden = renderToStaticMarkup(createElement(AnnotatedLine, { ...props, hiddenReadings: { 'test:0:0': true } }))
  assert.ok(!/token-reading-(?:kana|romaji)[^>]*>(?:われわれ|wareware)</.test(hidden))
  for (const mode of ['original', 'practice']) {
    const concealed = renderToStaticMarkup(createElement(AnnotatedLine, { ...props, mode }))
    assert.ok(!concealed.includes('token-reading-romaji'))
    assert.ok(!concealed.includes('word-aligned'))
  }
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
    assert.match(sing, new RegExp(`>${expected}</rt>`))
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
