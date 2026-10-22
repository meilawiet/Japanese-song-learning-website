import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createReviewUnit,addReviewUnit,reviewKey,resolveReviewUnit,reviewGroups,reviewDue,gradeReview,reviewRequestLine,reviewAnalysis,reviewAnalysisKey,validReviewItem,reviewPlaybackBounds,reviewDictionaryWords} from '../src/lib/reviewBook.js'
import {prepareSentenceRequest,validateSentenceResult,sentenceEntry} from '../src/lib/sentenceAnalysis.js'
import {reconcileLearningState} from '../src/lib/learningIdentity.js'
import {createLearningBackup,inspectLearningBackup} from '../src/lib/learningBackup.js'

// 原创稀疏ID与重复句，验证复习引用不会因数组位置或同文副歌错配。
const song={id:'local-review-test',title:'原创复习',artist:'QA',language:'ja',isLocal:true,lines:[{id:3,text:'君がくれた',start:1},{id:17,text:'小さな地図を',start:3},{id:28,text:'今も大切にしている',start:6},{id:41,text:'君がくれた',start:10}]}
const state=reviewItems=>({progress:{learnedBySong:{[song.id]:[3]},reviewItems,favoriteSongIds:[],corrections:{},meaningOverrides:{},lyricSnapshots:{[song.id]:{lines:song.lines}}},annotations:{},aiReviews:{},sentenceExplanations:{}})

test('单句/反向多句收藏保存实际ID；同一范围去重，重复副歌和重叠范围独立',()=>{
  const group=createReviewUnit(song,28,3,100)
  assert.deepEqual(group.lineIds,[3,17,28]);assert.deepEqual(group.lineTexts,song.lines.slice(0,3).map(line=>line.text))
  assert.ok(validReviewItem(group));assert.equal(group.text,song.lines[0].text)
  let items=addReviewUnit([],group);assert.equal(addReviewUnit(items,createReviewUnit(song,3,28)).length,1)
  items=addReviewUnit(items,createReviewUnit(song,3));items=addReviewUnit(items,createReviewUnit(song,41))
  assert.equal(items.length,3);assert.notEqual(reviewKey(items[1]),reviewKey(items[2]))
  assert.throws(()=>createReviewUnit(song,999),/找不到/)
  assert.equal(reviewGroups([song,{...song,id:'empty'}, {...song,id:'demo',isDemo:true}],items).length,1)
})

test('旧最小单句可复习；新单元歌词变更/删除/插入后保留收藏并标记，不能串行',()=>{
  const old={songId:song.id,lineId:17},unit=createReviewUnit(song,3,28)
  const reconciled=reconcileLearningState([song],state([old,unit]))
  assert.equal(reconciled.progress.reviewItems[0].text,song.lines[1].text)
  const changed={...song,lines:song.lines.map(line=>line.id===17?{...line,text:'新しい地図を'}:line)}
  const restored=reconcileLearningState([changed],state([unit]))
  assert.equal(restored.progress.reviewItems.length,1)
  assert.equal(resolveReviewUnit(unit,changed).changed,true)
  assert.equal(resolveReviewUnit(unit,changed).missing,false)
  const missing=resolveReviewUnit(unit,{...song,lines:song.lines.filter(line=>line.id!==17)})
  assert.ok(missing.missing);assert.throws(()=>reviewRequestLine(missing),/不存在/)
  const inserted={...song,lines:[song.lines[0],{id:9,text:'追加された行',start:2},...song.lines.slice(1)]}
  assert.ok(resolveReviewUnit(unit,inserted).missing)
  assert.deepEqual(restored.progress.learnedBySong[song.id],[3])
})

test('整段解析请求包含完整原文与相邻行，不冒充逐行解析；等级或上下文变化使缓存过期',()=>{
  const saved=createReviewUnit(song,17,28),unit=resolveReviewUnit(saved,song),line=reviewRequestLine(unit)
  assert.equal(line.text,'小さな地図を\n今も大切にしている');assert.equal(line.previous_line,'君がくれた');assert.equal(line.next_line,'君がくれた')
  const payload=prepareSentenceRequest([line],'ja','N4'),request=payload.lines[0]
  const result=validateSentenceResult({explanations:[{line_id:17,line_key:request.line_key,source_text:line.text,meaning:'原创整段释义',grammar:['跨行句法'],vocabulary:[{surface:'地図',meaning:'地图'}],usage_note:'抒情表达，结合语境使用。',expression_notes:[],everyday_example:{sentence:'',meaning:''},learning_focus:['理解修饰关系。']}]},payload)
  const entry=sentenceEntry(line,result.explanations[0],'ja','N4')
  const withAnalysis={...unit,item:{...saved,analysis:entry,analysisKey:reviewAnalysisKey(unit)}}
  assert.equal(reviewAnalysis(withAnalysis,{},'N4').current,true)
  assert.equal(reviewAnalysis(withAnalysis,{},'N1').current,false)
  assert.equal(reviewAnalysis({...withAnalysis,item:{...withAnalysis.item,analysisKey:'旧上下文'}},{},'N4').current,false)
  assert.equal(reviewAnalysis(unit,{[song.id]:{17:entry}},'N4').entry,null)
  const single=resolveReviewUnit(createReviewUnit(song,17),song),singleEntry={text:single.text,language:'ja',explanation:{meaning:'旧单句解析'}}
  assert.equal(reviewAnalysis(single,{[song.id]:{17:singleEntry}},'N4').entry,singleEntry)
})

test('评价不删除收藏或掌握记录，按10分钟/1天/1、3、7、14、30天安排',()=>{
  const item=createReviewUnit(song,3,28,100),again=gradeReview(item,'again',1000)
  assert.equal(again.dueAt,601000);assert.equal(again.reviewCount,1);assert.equal(reviewDue(again,1000),false);assert.equal(reviewDue(again,601000),true)
  let next=item
  for(const days of [1,3,7,14,30]){next=gradeReview(next,'good',1000);assert.equal(next.intervalDays,days)}
  assert.equal(gradeReview(next,'hard',1000).intervalDays,1)
  assert.equal(item.reviewCount,0);assert.throws(()=>gradeReview(item,'invalid'),/无效/)
  assert.equal(reviewDue({songId:song.id,lineId:3},1000),true)
})

test('播放只包含选中范围，结束取后一句或真实音频尾部，纯歌词/无效时间不播放',()=>{
  assert.deepEqual(reviewPlaybackBounds(song,song.lines.slice(0,3),20),{start:1,end:10})
  assert.deepEqual(reviewPlaybackBounds(song,[song.lines[3]],12),{start:10,end:12})
  assert.equal(reviewPlaybackBounds(song,[{...song.lines[0],start:null}],20),null)
  assert.equal(reviewPlaybackBounds(song,[song.lines[3]],NaN),null)
  assert.equal(reviewPlaybackBounds(song,[song.lines[3]],5),null)
})

test('词典参考使用本行原文绑定，并保留用户取消读音及自定义词义',()=>{
  const unit=resolveReviewUnit(createReviewUnit(song,3),song)
  const words=reviewDictionaryWords(unit,{[song.id]:[{id:3,tokens:[{index:0,surface:song.lines[0].text,reading:'きみがくれた',dictionary_form:'くれる',meaning:'旧含义'}]}]},{'くれる:きみがくれた':'人工词义'},{[`${song.id}:3:0`]:''})
  assert.equal(words[0].reading,'');assert.equal(words[0].meaning,'人工词义')
  assert.deepEqual(reviewDictionaryWords({...unit,lines:[{id:3,text:'已改变的原文'}]},{[song.id]:[{id:3,tokens:[{surface:'旧原文'}]}]}),[])
})

test('多句/笔记/评价/解析可经学习备份往返，拒绝损坏或越界单元字段',async()=>{
  const unit={...createReviewUnit(song,3,28),note:'这里为什么省略？',focus:['语法'],reviewCount:2}
  const parsed=await inspectLearningBackup(createLearningBackup([],state([unit])))
  assert.deepEqual(parsed.manifest.progress.reviewItems[0],unit)
  for(const invalid of [{...unit,lineIds:[3,3,28]},{...unit,lineTexts:['不完整']},{...unit,lineId:28},{...unit,note:'a'.repeat(1001)},{...unit,unitVersion:8},{...unit,dueAt:Infinity},{...unit,focus:['无效分类']}]){
    assert.equal(validReviewItem(invalid),false)
    assert.throws(()=>createLearningBackup([],state([invalid])),/学习(进度|记录)/)
  }
})

// 多句收藏复用逐句解析，不按文本搜全曲，不发起重复AI调用，也不保存伪造整段结果。
test('多句复习读取各句学习解析，保留词义语法并标注行号；部分缺失和错位不串行',()=>{
  const saved=createReviewUnit(song,3,17),unit=resolveReviewUnit(saved,song)
  const entry=line=>sentenceEntry(line,{line_id:line.id,source_text:line.text,binding_version:2,teaching_version:2,meaning:'原句'+line.id,grammar:['语法'+line.id],vocabulary:[{surface:line.text,meaning:'词义'+line.id}],usage_note:'用法'+line.id},'ja','N5')
  const first=entry(song.lines[0]),second=entry(song.lines[1]),cache={[song.id]:{3:first,17:second,41:entry(song.lines[3])}}
  const result=reviewAnalysis(unit,cache,'N5')
  assert.equal(result.entry,null);assert.equal(result.current,true);assert.equal(result.lineEntries.length,2)
  assert.deepEqual(result.explanation.vocabulary.map(word=>word.meaning),['词义3','词义17'])
  assert.deepEqual(result.explanation.grammar,['第1行：语法3','第2行：语法17'])
  assert.match(result.explanation.meaning,/第1行：原句3\n第2行：原句17/)
  assert.equal(saved.analysis,undefined);assert.equal(reviewAnalysis(unit,cache,'N1').current,false)
  const partial=reviewAnalysis(unit,{[song.id]:{3:first,17:{...second,explanation:{...second.explanation,line_id:3}}}},'N5')
  assert.equal(partial.lineEntries.length,1);assert.equal(partial.current,false)
  const wrong=reviewAnalysis(unit,{[song.id]:{3:{...first,text:'别句'},17:{...second,language:'en'},41:entry(song.lines[3])}},'N5')
  assert.equal(wrong.explanation,null);assert.equal(wrong.lineEntries.length,0)
  const missing=resolveReviewUnit(saved,{...song,lines:song.lines.filter(line=>line.id!==17)})
  assert.equal(reviewAnalysis(missing,cache,'N5').explanation,undefined)
  const ownLine=reviewRequestLine(unit),own=entry(ownLine)
  const complete=reviewAnalysis({...unit,item:{...saved,analysis:own,analysisKey:reviewAnalysisKey(unit)}},cache,'N5')
  assert.equal(complete.entry,own);assert.equal(complete.lineEntries.length,0)
})

test('单句复习优先使用学习页当前适用解析，旧单元结果不遮住新生成内容',()=>{
  const saved=createReviewUnit(song,17),unit=resolveReviewUnit(saved,song),line=unit.lines[0]
  const explanation={line_id:line.id,source_text:line.text,binding_version:2,teaching_version:2,meaning:'当前释义',grammar:['当前语法']}
  const latest=sentenceEntry(line,explanation,'ja','N5'),old=sentenceEntry(line,{...explanation,meaning:'旧释义'},'ja','N1')
  const result=reviewAnalysis({...unit,item:{...saved,analysis:old,analysisKey:reviewAnalysisKey(unit)}},{[song.id]:{17:latest}},'N5')
  assert.equal(result.entry,latest);assert.equal(result.explanation.meaning,'当前释义');assert.equal(result.current,true)
})
