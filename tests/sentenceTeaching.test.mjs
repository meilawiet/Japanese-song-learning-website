import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {JAPANESE_LEVELS,JAPANESE_TEACHING_VERSION,japaneseTeachingInstruction} from '../src/lib/japaneseLevel.js'
import {sentenceTeachingPrompt} from '../src/lib/sentenceTeachingPrompt.js'
import {prepareSentenceRequest,validateSentenceResult,sentenceEntry,currentSentenceEntry,visibleSentenceEntry} from '../src/lib/sentenceAnalysis.js'
import {createLearningBackup,inspectLearningBackup} from '../src/lib/learningBackup.js'

// 原创短句：含跨行未完句、指代和口语缩略，避免测试依赖用户歌词或真实AI。
const lines=[{id:20,text:'君がくれた',next_line:'小さな地図',previous_line:''},{id:47,text:'小さな地図',previous_line:'君がくれた',next_line:'忘れちゃった'},{id:61,text:'忘れちゃった',previous_line:'小さな地図',next_line:''}]
const item=line=>({line_id:line.id,line_key:line.line_key,source_text:line.text,meaning:'原创释义',grammar:['这是连接后文的结构。'],vocabulary:[{surface:line.text,meaning:'本句含义',reading:'',dictionary_form:'',usage:'结合上下文理解。'}],expression_notes:['本行可能未完句，不确定的对象不能擅自补全。'],usage_note:'需结合上下文；熟人间可用口语形式。',everyday_example:{sentence:'地図を忘れちゃった。',meaning:'忘带地图了。'},learning_focus:['掌握常用口语形式。'],pronunciation_tip:''})
const result=payload=>({explanations:payload.lines.map(item)})
let vite,mobile,Analysis
before(async()=>{
  vite=await createServer({server:{middlewareMode:true,watch:{ignored:['**/.tools/**','**/server/.venv/**']}},appType:'custom',logLevel:'silent'})
  mobile=await vite.ssrLoadModule('/src/lib/mobileAi.js')
  Analysis=(await vite.ssrLoadModule('/src/components/SentenceAnalysis.jsx')).default
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
