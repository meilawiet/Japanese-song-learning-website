import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {JAPANESE_LEVELS,JAPANESE_TEACHING_VERSION,japaneseTeachingInstruction} from '../src/lib/japaneseLevel.js'
import {sentenceTeachingPrompt} from '../src/lib/sentenceTeachingPrompt.js'
import {prepareSentenceRequest,validateSentenceResult,sentenceEntry,currentSentenceEntry,visibleSentenceEntry,earlierSentenceExpressions,sentenceLyricContext} from '../src/lib/sentenceAnalysis.js'
import {collectAnkiEntries} from '../src/lib/ankiCard.js'

test('语境按歌词顺序取目标前后三行，排除选段并传入安卓解析请求',()=>{
  const lyrics=Array.from({length:9},(_,id)=>({id,text:`歌词${id}`,translation:`译文${id}`}))
  const surrounding=sentenceLyricContext(lyrics,3,4)
  const payload=prepareSentenceRequest([{...lyrics[3],...surrounding}],'ja','N5','concise')
  assert.deepEqual(payload.lines[0].context_before.map(line=>line.text),['歌词0','歌词1','歌词2'])
  assert.deepEqual(payload.lines[0].context_after.map(line=>line.translation),['译文5','译文6','译文7'])
  assert.deepEqual(sentenceLyricContext(lyrics,0).context_before,[])
  assert.deepEqual(sentenceLyricContext(lyrics,8).context_after,[])
  for(const mode of ['concise','detailed']){
    const prompt=sentenceTeachingPrompt('ja','N5',mode)
    assert.match(prompt,/结合 context_before 和 context_after/)
    assert.match(prompt,/译文只覆盖目标 text/)
    assert.match(prompt,/保留原文的含糊/)
  }
})
import {createLearningBackup,inspectLearningBackup} from '../src/lib/learningBackup.js'
import {describeMasteredWord,isMasteredWord,masteredWordKey,masteredWordsForLine,readMasteredWords,saveMasteredWords,sortedMasteredWords,wordWithReading} from '../src/lib/masteredWords.js'

// 原创短句：含跨行未完句、指代和口语缩略，避免测试依赖用户歌词或真实AI。
const lines=[{id:20,text:'君がくれた',next_line:'小さな地図',previous_line:''},{id:47,text:'小さな地図',previous_line:'君がくれた',next_line:'忘れちゃった'},{id:61,text:'忘れちゃった',previous_line:'小さな地図',next_line:''}]
const item=line=>({line_id:line.id,line_key:line.line_key,source_text:line.text,meaning:'原创释义',grammar:['这是连接后文的结构。'],vocabulary:[{surface:line.text,meaning:'本句含义',reading:'',dictionary_form:'',usage:'结合上下文理解。'}],expression_notes:['本行可能未完句，不确定的对象不能擅自补全。'],usage_note:'需结合上下文；熟人间可用口语形式。',everyday_example:{sentence:'地図を忘れちゃった。',meaning:'忘带地图了。'},learning_focus:['掌握常用口语形式。'],pronunciation_tip:''})
const result=payload=>({explanations:payload.lines.map(item)})
let vite,mobile,Analysis,MasteredWords,ReviewBook
before(async()=>{
  vite=await createServer({server:{middlewareMode:true,watch:{ignored:['**/.tools/**','**/server/.venv/**']}},appType:'custom',logLevel:'silent'})
  mobile=await vite.ssrLoadModule('/src/lib/mobileAi.js')
  Analysis=(await vite.ssrLoadModule('/src/components/SentenceAnalysis.jsx')).default
  MasteredWords=(await vite.ssrLoadModule('/src/components/MasteredWords.jsx')).default
  ReviewBook=(await vite.ssrLoadModule('/src/components/ReviewBook.jsx')).default
})
after(async()=>{await vite?.close()})

test('六档教学重点与歌词安全边界进入实际请求，不按上下文行替换目标句',async()=>{
  const old=globalThis.fetch,calls=[]
  globalThis.fetch=async(url,options)=>{
    const data=JSON.parse(options.body),prompt=data.messages[1].content,payload=JSON.parse(prompt.split('INPUT_JSON:\n')[1])
    calls.push({prompt,payload,budget:data.max_tokens})
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result(payload))}}]}),{status:200,headers:{'Content-Type':'application/json'}})
  }
  try{
    for(const {id}of JAPANESE_LEVELS){
      const returned=await mobile.postMobileAi('/api/ai/explain-sentences',{language:'ja',japanese_level:id,lines:lines.slice(0,2)},{useServerDefault:false,base_url:'https://fixture.example/v1',model:'fixture',protocol:'openai'})
      const {prompt,payload,budget}=calls.at(-1)
      assert.equal(payload.teaching_version,JAPANESE_TEACHING_VERSION)
      assert.equal(payload.japanese_level,id)
      assert.equal(payload.lines[0].next_line,lines[1].text)
      assert.equal(payload.lines[0].text,lines[0].text)
      for(const phrase of [japaneseTeachingInstruction(id),'不自动意味着语法错误','推测','不等于原唱唱法','日常使用','不冒充歌词原文','官方JLPT','line_key'])assert.ok(prompt.includes(phrase),phrase)
      assert.equal(returned.explanations[0].usage_note,'需结合上下文；熟人间可用口语形式。')
      assert.ok(budget>=4400)
    }
  }finally{globalThis.fetch=old}
})

test('安卓解析独立判断词条边界，授受句型与单词分别保留供 Anki 制卡',async()=>{
  const examples=[
    {text:'教えてくれた',surface:'教えて',dictionary_form:'教える',pattern:'V-てくれる'},
    {text:'待ってくれた',surface:'待って',dictionary_form:'待つ',pattern:'V-てくれる'},
    {text:'読んでいた',surface:'読んで',dictionary_form:'読む',pattern:'V-ている'},
    {text:'気をつける',surface:'気をつける',dictionary_form:'気をつける'},
  ]
  const fetchBefore=globalThis.fetch
  globalThis.fetch=async(_url,options)=>{
    const prompt=JSON.parse(options.body).messages[1].content
    const payload=JSON.parse(prompt.split('INPUT_JSON:\n')[1])
    assert.match(prompt,/自行决定适合学习的词条边界/)
    assert.match(prompt,/surface 是「教えて」，dictionary_form 是「教える」/)
    assert.match(prompt,/grammar 用「V-てくれる」开头/)
    assert.match(prompt,/固定搭配或惯用语整体归入 vocabulary，例如「気をつける」/)
    const explanations=payload.lines.map(line=>{
      const {surface,dictionary_form,pattern}=examples[line.id]
      assert.equal(line.text,examples[line.id].text)
      assert.equal(line.tokens,undefined)
      return {...item(line),vocabulary:[{surface,dictionary_form,meaning:'测试词义',kind:pattern?'word':'phrase'}],
        grammar:pattern?[`「${pattern}」在${line.text}中的用法。`]:[]}
    })
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({explanations})}}]}))
  }
  try{
    for(const mode of ['concise','detailed']){
      const lyricLines=examples.map(({text},id)=>({id,text}))
      const response=await mobile.postMobileAi('/api/ai/explain-sentences',{language:'ja',japanese_level:'N4',teaching_mode:mode,lines:lyricLines},{useServerDefault:false,base_url:'https://fixture.example/v1',model:'fixture',protocol:'openai'})
      for(const [index,example] of examples.entries()){
        const explanation=response.explanations[index]
        assert.deepEqual(explanation.vocabulary.map(({surface,dictionary_form})=>({surface,dictionary_form})),[{surface:example.surface,dictionary_form:example.dictionary_form}])
        const line=lyricLines[index]
        const entries=collectAnkiEntries([line],{[line.id]:sentenceEntry(line,explanation,'ja','N4')})
        assert.deepEqual(entries.map(({word})=>word.lemma),[example.dictionary_form,...(example.pattern?[example.pattern]:[])])
      }
    }
  }finally{globalThis.fetch=fetchBefore}
})

test('新版讲解缺项或示例缺翻译时拒绝，原文绑定仍逐条校验并保留合法兄弟句',()=>{
  const payload=prepareSentenceRequest(lines,'ja','beginner'),raw=result(payload)
  raw.explanations[0].usage_note=''
  raw.explanations[1].everyday_example.meaning=''
  const parsed=validateSentenceResult(raw,payload)
  assert.deepEqual(parsed.explanations.map(value=>value.line_id),[61])
  assert.equal(parsed.rejected_count,2)
  raw.explanations[2].line_key=payload.lines[0].line_key
  assert.throws(()=>validateSentenceResult(raw,payload),/未保存/)
  const noExample=result(payload);noExample.explanations[0].everyday_example={sentence:'',meaning:''}
  assert.equal(validateSentenceResult(noExample,payload).explanations.length,3)
})

test('旧日语解析保留可读但需手动重生成，教学升级不影响其他语言的缓存',()=>{
  const payload=prepareSentenceRequest(lines,'ja','N2'),explanation=validateSentenceResult(result(payload),payload).explanations[0]
  const entry=sentenceEntry(lines[0],explanation,'ja','N2')
  assert.ok(currentSentenceEntry(entry,lines[0],'ja','N2'))
  const old={...entry,explanation:{...explanation,teaching_version:undefined}}
  assert.ok(visibleSentenceEntry(old,lines[0],'ja'))
  assert.equal(currentSentenceEntry(old,lines[0],'ja','N2'),false)
  assert.equal(currentSentenceEntry(entry,lines[0],'ja','N5'),false)
  const foreign={...old,language:'other'}
  assert.ok(currentSentenceEntry(foreign,lines[0],'other','beginner'))
  assert.ok(!sentenceTeachingPrompt('other','N1').includes('日常使用建议'))
})

test('日语教学字段经备份导出导入保留；异常额外字段不进入解析缓存',async()=>{
  const payload=prepareSentenceRequest(lines,'ja','N3'),raw=result(payload)
  raw.explanations[0].expression_notes=Array(8).fill('说明'.repeat(400))
  raw.explanations[0].vocabulary[0].usage='用法'.repeat(400)
  raw.explanations[0].unexpected_secret='不能带入'
  const explanation=validateSentenceResult(raw,payload).explanations[0]
  assert.equal(explanation.expression_notes.length,3)
  assert.equal(explanation.expression_notes[0].length,400)
  assert.equal(explanation.vocabulary[0].usage.length,300)
  assert.equal(explanation.unexpected_secret,undefined)
  const entry=sentenceEntry(lines[0],explanation,'ja','N3')
  const blob=createLearningBackup([],{progress:{learnedBySong:{},reviewItems:[],favoriteSongIds:[],corrections:{},meaningOverrides:{}},annotations:{},aiReviews:{},sentenceExplanations:{qa:{20:entry}},artworkOverrides:{}})
  const restored=await inspectLearningBackup(blob)
  assert.deepEqual(restored.manifest.sentenceExplanations.qa[20],entry)
})

test('解析界面区分歌词与日常示例、展示词义用法，旧记录不出现空白新分区',()=>{
  const payload=prepareSentenceRequest(lines,'ja','N3'),explanation=validateSentenceResult(result(payload),payload).explanations[0]
  explanation.vocabulary[0]={surface:'くれた',meaning:'给了',reading:'くれた',dictionary_form:'くれる',usage:'从说话者角度表达给予。'}
  const html=renderToStaticMarkup(createElement(Analysis,{line:lines[0],entry:{language:'ja',japaneseLevel:'N3'},explanation}))
  for(const phrase of ['歌词表达特点','日常使用建议','日常示例（非歌词原文）','学习重点','原形：','くれる','用法：'])assert.ok(html.includes(phrase),phrase)
  const old=renderToStaticMarkup(createElement(Analysis,{entry:{language:'ja'},explanation:{meaning:'旧释义',grammar:[],vocabulary:[]},stale:true}))
  assert.ok(old.includes('手动重新生成'))
  assert.ok(!old.includes('日常使用建议'))
  // 备份基础校验允许未知扩展字段，异常日语扩展必须忽略，避免其他客户端数据令页面白屏。
  const malformed={...explanation,expression_notes:'异常字符串',learning_focus:[null,{}],usage_note:{},everyday_example:{sentence:{}},vocabulary:[{surface:'くれた',meaning:'给了',reading:{},dictionary_form:{},usage:{}}]}
  assert.doesNotThrow(()=>renderToStaticMarkup(createElement(Analysis,{entry:{language:'ja'},explanation:malformed})))
})

test('安卓详略预设进入实际请求；详细保留全部条目，简略两类各至多两项', async () => {
  const oldFetch = globalThis.fetch
  const text = '小さな地図を机に置いた'
  const words = ['小さな', '地図', '机', '置いた', 'に'].map((surface,index)=>({surface,meaning:`词义${index}`}))
  const grammar = Array.from({length:4},(_,index)=>`结构${index}`)
  let response
  const prompts = []
  globalThis.fetch = async (_url, options) => {
    const data = JSON.parse(options.body)
    const prompt = data.messages[1].content
    const payload = JSON.parse(prompt.split('INPUT_JSON:\n')[1])
    const [line] = payload.lines
    prompts.push(prompt)
    const entry = {line_id:line.id,line_key:line.line_key,source_text:line.text,meaning:'把小地图放在桌上。',grammar,vocabulary:words}
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({explanations:[entry]})}}]}))
  }
  const request = mode => mobile.postMobileAi('/api/ai/explain-sentences',{language:'ja',japanese_level:'N5',teaching_mode:mode,lines:[{id:71,text}]},{useServerDefault:false,base_url:'https://fixture.example/v1',model:'fixture',protocol:'openai'})
  try {
    response = (await request('detailed')).explanations[0]
    assert.match(prompts.at(-1), /不设固定条数/)
    assert.doesNotMatch(prompts.at(-1), /最多3项语法/)
    assert.equal(response.vocabulary.length,5)
    assert.equal(response.grammar.length,4)
    assert.equal(response.teaching_mode,'detailed')
    const concise = (await request('concise')).explanations[0]
    assert.match(prompts.at(-1), /单词（vocabulary）最多 2 项，语法（grammar）最多 2 项/)
    assert.equal(concise.grammar.length,2)
    assert.equal(concise.vocabulary.length,2)
    assert.equal(concise.teaching_mode,'concise')
    const preview = renderToStaticMarkup(createElement(Analysis,{explanation:response,teachingMode:'concise'}))
    assert.match(preview,/词义0/)
    assert.match(preview,/结构0/)
    assert.match(preview,/词义1/)
    assert.match(preview,/结构1/)
    assert.doesNotMatch(preview,/词义2|结构2/)
    const detailed = renderToStaticMarkup(createElement(Analysis,{explanation:response,teachingMode:'detailed'}))
    assert.match(detailed,/词义4/)
    assert.match(detailed,/结构3/)
    assert.deepEqual([...detailed.matchAll(/<h4>(.*?)<\/h4>/g)].map(match=>match[1]),['整句意思','单词','语法'])
  } finally { globalThis.fetch = oldFetch }
})

test('同曲前文已讲的词进入请求，完全重复可展开，保留不同读音和用法', () => {
  const song = [{id:20,text:'風が吹く'}, {id:7,text:'雨が降る'}, {id:40,text:'風の音'}, {id:3,text:'風が止む'}]
  const repeated = {surface:'風',reading:'かぜ',meaning:'自然的风',usage:'作为名词'}
  const otherReading = {...repeated,reading:'ふう',meaning:'风格',usage:'后缀'}
  const otherUsage = {...repeated,usage:'与「音」组成名词短语'}
  const fixture = (line, vocabulary) => ({text:line.text,language:'ja',explanation:{meaning:'原创释义',vocabulary}})
  const cache = {
    20:fixture(song[0],[repeated]),
    7:fixture({...song[1],text:'昔の風'},[{...repeated,meaning:'旧词义'}]),
    3:fixture(song[3],[{...repeated,meaning:'后文释义'}]),
  }
  const previous = earlierSentenceExpressions(song,2,cache,'ja')
  assert.equal(previous.length,1)
  assert.equal(previous[0].meaning,repeated.meaning)
  assert.deepEqual(earlierSentenceExpressions(song,2,cache,'ja',0),[])
  const payload = prepareSentenceRequest([{...song[2],previously_explained:previous}],'ja','N5','concise')
  assert.deepEqual(payload.lines[0].previously_explained,previous)
  assert.match(sentenceTeachingPrompt('ja','N5','concise'), /同批前面已讲过/)
  const explanation = {meaning:'风的声音',vocabulary:[repeated,otherReading,otherUsage],grammar:['本句构成一个名词短语。']}
  const detail = renderToStaticMarkup(createElement(Analysis,{explanation,teachingMode:'detailed',earlierExpressions:previous}))
  assert.match(detail,/<details[^>]*><summary>本曲前面已讲过（1）<\/summary>/)
  assert.match(detail.split('<details')[0],/风格/)
  assert.match(detail.split('<details')[0],/组成名词短语/)
  const concise = renderToStaticMarkup(createElement(Analysis,{explanation,teachingMode:'concise',earlierExpressions:previous}))
  assert.match(concise,/组成名词短语/)
  assert.doesNotMatch(concise,/本曲前面已讲过/)
})

test('完全掌握词跨歌曲按原形识别活用，区分读音和语种，保存后按假名排序并可移出',()=>{
  const oldWord=wordWithReading({surface:'書いた',dictionary_form:'書く',meaning:'写'},[{surface:'書',reading:'カ'},{surface:'いた',reading:'いた'}])
  const known=describeMasteredWord(oldWord,'ja')
  const another=describeMasteredWord({surface:'青',reading:'アオ'},'ja')
  assert.equal(known.reading,'かいた')
  assert.ok(isMasteredWord([known],{surface:'書きます',reading:'かきます',dictionary_form:'書く'},'ja'))
  assert.ok(isMasteredWord([known],{surface:'書く',reading:'かく'},'ja'))
  assert.ok(!isMasteredWord([known],{surface:'書いた',reading:'えがいた'},'ja'))
  assert.ok(!isMasteredWord([known],{surface:'書いた'},'zh'))
  assert.deepEqual(masteredWordsForLine([known,another],'ja','手紙を書こう',[{surface:'書こう',dictionary_form:'書く'}]).map(word=>word.surface),['書いた'])
  assert.deepEqual(masteredWordsForLine([known,another],'ja','星が見える'),[])
  const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}
  saveMasteredWords(storage,[known,another])
  const saved=readMasteredWords(storage)
  assert.deepEqual(sortedMasteredWords(saved).map(word=>word.reading),['あお','かいた'])
  const list=renderToStaticMarkup(createElement(MasteredWords,{words:saved}))
  assert.ok(list.indexOf('あお')<list.indexOf('かいた'))
  assert.match(list,/移出 書いた（かいた）/)
  assert.match(list,/会从 AI 的单词讲解中跳过/)
  assert.match(renderToStaticMarkup(createElement(MasteredWords,{words:[]})),/会从 AI 的单词讲解中跳过/)
  saveMasteredWords(storage,saved.filter(word=>masteredWordKey(word)!==masteredWordKey(known)))
  assert.ok(!isMasteredWord(readMasteredWords(storage),oldWord,'ja'))
})

test('已掌握词在学习页隐藏并可随移出恢复，复习本空时仍有管理入口',()=>{
  const word={surface:'地図',reading:'ちず',meaning:'地图释义'}
  const other={surface:'小さな',reading:'ちいさな',meaning:'小的'}
  const explanation={meaning:'这是一幅小地图',vocabulary:[word,other],grammar:['连体修饰']}
  const options={explanation,teachingMode:'concise',onMasterWord:()=>{}}
  const hidden=renderToStaticMarkup(createElement(Analysis,{...options,masteredWords:[describeMasteredWord(word,'ja')]}))
  assert.doesNotMatch(hidden,/地图释义|标记 地図/)
  assert.match(hidden,/标记 小さな 为完全掌握/)
  assert.match(hidden,/连体修饰/)
  assert.match(renderToStaticMarkup(createElement(Analysis,options)),/地图释义/)
  const review=renderToStaticMarkup(createElement(ReviewBook,{songs:[],items:[],masteredWords:[describeMasteredWord(word,'ja')],onOpenMasteredWords:()=>{}}))
  assert.match(review,/已掌握单词 <span>1<\/span>/)
})

test('安卓实际 AI 请求只传当前句相关的已掌握词，并明确要求跳过基础词义',async()=>{
  const previousFetch=globalThis.fetch
  const word=describeMasteredWord({surface:'地図',reading:'ちず',meaning:'不会发送的本地释义'},'ja')
  const mastered_words=masteredWordsForLine([word],'ja',lines[1].text)
  globalThis.fetch=async(_url,options)=>{
    const prompt=JSON.parse(options.body).messages[1].content
    const payload=JSON.parse(prompt.split('INPUT_JSON:\n')[1])
    assert.match(prompt,/不要把它列入单词板块/)
    assert.doesNotMatch(prompt,/不会发送的本地释义/)
    assert.deepEqual(payload.lines[0].mastered_words,mastered_words)
    assert.equal(payload.lines[1].mastered_words,undefined)
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result(payload))}}]}))
  }
  try{
    const returned=await mobile.postMobileAi('/api/ai/explain-sentences',{language:'ja',teaching_mode:'concise',lines:[{...lines[1],mastered_words},lines[2]]},{useServerDefault:false,base_url:'https://fixture.example/v1',model:'fixture',protocol:'openai'})
    assert.equal(returned.explanations.length,2)
  }finally{globalThis.fetch=previousFetch}
})
