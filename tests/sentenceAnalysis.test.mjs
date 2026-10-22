import {test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {JAPANESE_LEVELS,japaneseTeachingInstruction,normalizeJapaneseLevel} from '../src/lib/japaneseLevel.js'
import {prepareSentenceRequest,validateSentenceResult,visibleSentenceEntry,currentSentenceEntry,sentenceEntry,removeSentenceEntries,SentenceTaskGate} from '../src/lib/sentenceAnalysis.js'

// 原创重复句回归，公开测试不包含用户提交的歌词、录屏或密钥。
const lines=[{id:12,text:'きょうも歌うよ'},{id:5,text:'きょうも歌うよ'},{id:30,text:'あしたへ歩こう'},{id:41,text:'風がそっと笑う'}]
// 原fixture不包含教学信息；增加日语新版最小有效字段，仍用于验证真实移动入口。
// const response=payload=>({explanations:payload.lines.map(line=>({line_id:line.id,line_key:line.line_key,source_text:line.text,meaning:'本句的原创测试释义',grammar:['语法提示'],vocabulary:[{surface:line.text,meaning:'表达说明'}],pronunciation_tip:''}))})
const response=payload=>({explanations:payload.lines.map(line=>({line_id:line.id,line_key:line.line_key,source_text:line.text,meaning:'本句的原创测试释义',grammar:['语法提示'],vocabulary:[{surface:line.text,meaning:'表达说明'}],pronunciation_tip:'',...(payload.language==='ja'?{expression_notes:[],usage_note:'这是熟人间的普通表达。',everyday_example:{sentence:'一緒に歌おう。',meaning:'一起唱吧。'},learning_focus:['掌握邀请表达。']}:{})}))})

test('重复歌词逐条保留独立标识，乱序返回可按原编号匹配，不按显示位置重编号',()=>{
  const request=prepareSentenceRequest(lines,'ja','N4')
  assert.equal(new Set(request.lines.map(line=>line.line_key)).size,4)
  const raw=response(request);raw.explanations.reverse()
  const result=validateSentenceResult(raw,request)
  assert.equal(result.explanations.length,4);assert.equal(result.rejected_count,0)
  assert.equal(result.explanations[0].line_id,41)
})

test('重现重复段后整体偏移：旧编号规则会接受，原文和请求标识校验拒绝错位',()=>{
  const request=prepareSentenceRequest(lines,'ja','N5'),raw=response(request)
  // 模型把下一句的解释挂到前一句编号；编号仍在合法集合内。
  raw.explanations=raw.explanations.slice(1).map((item,index)=>({...item,line_id:lines[index].id}))
  assert.equal(raw.explanations.filter(item=>lines.some(line=>line.id===item.line_id)&&item.meaning).length,3)
  assert.throws(()=>validateSentenceResult(raw,request),/原文或编号不对应/)
})

test('重复句原文相同也不能交换绑定，缺回显、未知编号和重复编号不污染有效条目',()=>{
  const request=prepareSentenceRequest(lines,'ja','N3'),raw=response(request)
  raw.explanations[0].line_key=request.lines[1].line_key
  raw.explanations[1].source_text='不同的原文'
  raw.explanations.push({...raw.explanations[2]},{line_id:999,meaning:'未知'})
  const result=validateSentenceResult(raw,request)
  assert.deepEqual(result.explanations.map(item=>item.line_id),[41]);assert.equal(result.rejected_count,3)
  assert.throws(()=>validateSentenceResult({explanations:[{line_id:12,meaning:'没有原文绑定'}]},request),/未保存/)
})

test('回显虽正确但词汇全部属于下一句时仍拒绝，避免正确编号包着错句内容',()=>{
  const request=prepareSentenceRequest(lines,'ja','N5'),raw=response(request)
  raw.explanations[0].vocabulary=[{surface:'あした',meaning:'来自下一句的词汇'}]
  const result=validateSentenceResult(raw,request)
  assert.ok(!result.explanations.some(item=>item.line_id===12));assert.equal(result.rejected_count,1)
})

test('旧缓存可以查看但不能冒充新版校验，改变等级仅使日语解析需重新生成',()=>{
  const request=prepareSentenceRequest(lines,'ja','N4'),explanation=validateSentenceResult(response(request),request).explanations[0]
  const entry=sentenceEntry(lines[0],explanation,'ja','N4')
  assert.ok(currentSentenceEntry(entry,lines[0],'ja','N4'))
  assert.equal(currentSentenceEntry(entry,lines[0],'ja','N1'),false)
  const old={text:lines[0].text,explanation:{meaning:'旧解析'}}
  assert.ok(visibleSentenceEntry(old,lines[0]));assert.equal(currentSentenceEntry(old,lines[0]),false)
  const foreign={...entry,language:'other'}
  assert.ok(currentSentenceEntry(foreign,lines[0],'other','N1'))
  assert.equal(currentSentenceEntry(entry,{...lines[0],text:'改过的文字'},'ja','N4'),false)
})

test('单句和整曲删除仅改变解析映射，其他歌曲保留且原对象不变',()=>{
  const all={a:{0:{text:'零号'},1:{text:'一号'}},b:{7:{text:'其他曲'}}}
  const single=removeSentenceEntries(all,'a',0)
  assert.equal(single.a[0],undefined);assert.deepEqual(single.b,all.b);assert.ok(all.a[0])
  const whole=removeSentenceEntries(all,'a')
  assert.equal(whole.a,undefined);assert.deepEqual(whole.b,all.b)
})

test('删除和重新生成使旧任务失效，旧finally不能清理新任务；等级快照隔离',()=>{
  const gate=new SentenceTaskGate(),old=gate.begin('song','N5','one')
  gate.cancel('different');assert.ok(gate.active(old))
  gate.cancel('song');assert.equal(gate.active(old),false);assert.equal(old.controller.signal.aborted,true)
  const next=gate.begin('song','N1','two');gate.finish(old)
  assert.ok(gate.active(next));assert.equal(next.level,'N1')
  gate.finish(next);assert.equal(gate.current,null)
})

let vite,mobile,core
before(async()=>{
  vite=await createServer({server:{middlewareMode:true,watch:{ignored:['**/.tools/**','**/server/.venv/**']}},appType:'custom',logLevel:'silent'})
  core=await vite.ssrLoadModule('@capacitor/core')
  mobile=await vite.ssrLoadModule('/src/lib/mobileAi.js')
})
after(async()=>{await vite?.close()})
const settings={useServerDefault:false,base_url:'https://fixture.example/v1',model:'fixture',protocol:'openai',api_key:'',json_mode:true}

test('六个日语等级实际进入手机AI请求，提示词不同并保留逐句绑定信息',async()=>{
  // Capacitor代理不允许用赋值替换方法，拦截其Web实现的fetch，保证测试不访问网络。
  const old=globalThis.fetch,captured=[]
  globalThis.fetch=async(url,options)=>{
    const data=JSON.parse(options.body)
    const content=data.messages[1].content,input=JSON.parse(content.split('INPUT_JSON:\n')[1]);captured.push({content,input})
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response(input))}}]}),{status:200,headers:{'Content-Type':'application/json'}})
  }
  try{
    for(const {id}of JAPANESE_LEVELS){
      const result=await mobile.postMobileAi('/api/ai/explain-sentences',{language:'ja',japanese_level:id,lines},settings)
      assert.equal(result.explanations.length,4);assert.equal(captured.at(-1).input.japanese_level,id)
      assert.ok(captured.at(-1).content.includes(japaneseTeachingInstruction(id)))
    }
    assert.equal(new Set(captured.map(item=>item.content.split('\n')[0])).size,6)
    assert.equal(normalizeJapaneseLevel('invalid'),'beginner')
  }finally{globalThis.fetch=old}
})

test('其他语言不携带日语等级，不生成日语发音提示，错位响应在手机入口被拒绝',async()=>{
  const old=globalThis.fetch
  let input,prompt
  globalThis.fetch=async(url,options)=>{const data=JSON.parse(options.body);prompt=data.messages[1].content;input=JSON.parse(prompt.split('INPUT_JSON:\n')[1]);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response(input))}}]}),{status:200,headers:{'Content-Type':'application/json'}})}
  try{
    await mobile.postMobileAi('/api/ai/explain-sentences',{language:'other',japanese_level:'N1',lines:[{id:1,text:'Original test phrase'}]},settings)
    assert.equal(input.japanese_level,undefined);assert.ok(!prompt.includes('学习者达到N1'))
    globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({explanations:[{line_id:12,meaning:'错位旧格式'}]})}}]}),{status:200,headers:{'Content-Type':'application/json'}})
    await assert.rejects(mobile.postMobileAi('/api/ai/explain-sentences',{language:'ja',lines},settings),/未保存/)
  }finally{globalThis.fetch=old}
})

test('解析界面显示目标原文、旧缓存提示和两项管理；个人资料提供六级选择',async()=>{
  const Analysis=(await vite.ssrLoadModule('/src/components/SentenceAnalysis.jsx')).default
  const Profile=(await vite.ssrLoadModule('/src/components/ProfilePanel.jsx')).default
  const html=renderToStaticMarkup(createElement(Analysis,{line:lines[0],entry:{language:'ja',japaneseLevel:'N4'},explanation:{meaning:'测试释义'},stale:true,currentLevel:'N1',onDelete:()=>{},onRegenerate:()=>{}}))
  for(const phrase of ['对应歌词','尚未','删除本句解析','重新生成本句解析','N4','N1'])assert.ok(html.includes(phrase),phrase)
  const profile=renderToStaticMarkup(createElement(Profile,{editable:true}))
  for(const {label}of JAPANESE_LEVELS)assert.ok(profile.includes(label))
  assert.ok(profile.includes('日语水平'))
})
