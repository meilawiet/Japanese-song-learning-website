import assert from 'node:assert/strict'
import test from 'node:test'
import {reconcileLearningState} from '../src/lib/learningIdentity.js'
import {commitEditedLine} from '../src/lib/lyricEditing.js'
import {applyLyricReview,reviewFingerprint} from '../src/lib/lyricAiReview.js'
import {prepareLyricReadings,tokenReading} from '../src/lib/lyricReadings.js'
import {createLearningBackup,inspectLearningBackup} from '../src/lib/learningBackup.js'

// 原创短句、稳定行ID和非连续tokenIndex，覆盖升级前手动修正与主动留空。
const song={id:'local-upgrade',isLocal:true,lyricsOnly:true,title:'原创回归',artist:'QA',lines:[{id:12,text:'明日へ歌う',start:null,translation:''}]}
const key=index=>`${song.id}:12:${index}`
const annotation={id:12,text:song.lines[0].text,tokens:[{index:0,surface:'明日',reading:'あした'},{index:4,surface:'へ',reading:'へ',part_of_speech:'助詞'},{index:9,surface:'歌う',reading:'うたう'}]}
const seed=()=>({progress:{corrections:{[key(0)]:'あす',[key(9)]:''},meaningOverrides:{},lyricSnapshots:{[song.id]:{lines:song.lines}},learnedBySong:{[song.id]:[12]},reviewItems:[],favoriteSongIds:[]},annotations:{[song.id]:[structuredClone(annotation)]},aiReviews:{},sentenceExplanations:{}})

test('缓存缺失前有人工保护快照时，冷启动恢复原词界、特殊读音和人工留空',()=>{
  const saved=reconcileLearningState([song],seed()),copy=structuredClone(saved)
  const missing={...saved,annotations:{}}
  const restored=reconcileLearningState([song],missing)
  assert.deepEqual(restored.progress.corrections,saved.progress.corrections)
  assert.deepEqual(restored.annotations[song.id],saved.annotations[song.id])
  const rendered=prepareLyricReadings(restored.annotations[song.id][0].tokens,'',restored.progress.corrections,song.id,12).tokens
  assert.equal(tokenReading(rendered[0],restored.progress.corrections,song.id,12),'あす')
  assert.equal(tokenReading(rendered[2],restored.progress.corrections,song.id,12),'')
  assert.deepEqual(saved,copy)
})

test('旧括号合并词的legacy校正仍有效，修改旧索引会刷新显示缓存',()=>{
  const line={id:12,text:'空(そら)'},target={...song,lines:[line]}
  const tokens=[{index:0,surface:line.text,reading:'そら',legacy_reading_indices:[0,2]}]
  const state=seed();state.progress.corrections={[key(2)]:'くう'};state.progress.lyricSnapshots={};state.annotations={[song.id]:[{id:12,text:line.text,tokens}]}
  const result=reconcileLearningState([target],state)
  assert.equal(result.progress.corrections[key(2)],'くう')
  const first=prepareLyricReadings(tokens,'',result.progress.corrections,song.id,12).tokens[0]
  assert.equal(tokenReading(first,result.progress.corrections,song.id,12),'くう')
  const changed={[key(2)]:'あおぞら'}
  const next=prepareLyricReadings(tokens,'',changed,song.id,12).tokens[0]
  assert.equal(tokenReading(next,changed,song.id,12),'あおぞら')
})

test('自动缓存换词界时，即使旧索引仍存在也不能把人工读音误套到新词',()=>{
  const saved=reconcileLearningState([song],seed())
  const changed={id:12,text:song.lines[0].text,tokens:[{index:0,surface:'明',reading:'めい'},{index:1,surface:'日',reading:'にち'},{index:4,surface:'へ',reading:'へ'},{index:9,surface:'歌う',reading:'うたう'}]}
  const restored=reconcileLearningState([song],{...saved,annotations:{[song.id]:[changed]}})
  assert.equal(restored.annotations[song.id][0].tokens[0].surface,'明日')
  assert.equal(restored.progress.corrections[key(0)],'あす')
})

test('原文行号不变但旧缓存和词界证据都缺失时，保留隔离记录而不盲套索引',()=>{
  const saved=seed();saved.annotations={}
  const result=reconcileLearningState([song],saved)
  assert.deepEqual(result.progress.corrections,{})
  const pending=result.progress.lyricSnapshots[song.id].unresolvedCorrections
  assert.deepEqual(pending[key(0)],[{reading:'あす',text:song.lines[0].text}])
  assert.deepEqual(pending[key(9)],[{reading:'',text:song.lines[0].text}])
  const generated=reconcileLearningState([song],{...result,annotations:{[song.id]:[annotation]}})
  assert.deepEqual(generated.progress.corrections,{})
  assert.deepEqual(generated.progress.lyricSnapshots[song.id].unresolvedCorrections,pending)
  assert.deepEqual(reconcileLearningState([song],generated),generated)
})

test('歌词内容变化不复活旧校正，待核对读音仍保留且不影响其他歌',()=>{
  const saved=reconcileLearningState([song],seed());saved.progress.corrections['other:7:0']='そら'
  const changed={...song,lines:[{...song.lines[0],text:'今日へ歌う'}]}
  const result=reconcileLearningState([changed],saved)
  assert.equal(result.progress.corrections[key(0)],undefined)
  assert.equal(result.progress.corrections['other:7:0'],'そら')
  assert.equal(result.progress.lyricSnapshots[song.id].unresolvedCorrections[key(0)][0].reading,'あす')
  assert.equal(result.annotations[song.id].length,0)
})

test('用户主动恢复初稿后，缓存缺失不能复活已经取消的人工读音',()=>{
  const saved=reconcileLearningState([song],seed());saved.progress.corrections={}
  const result=reconcileLearningState([song],saved)
  assert.equal(result.progress.lyricSnapshots[song.id].manualAnnotations,undefined)
  const missing=reconcileLearningState([song],{...result,annotations:{}})
  assert.deepEqual(missing.progress.corrections,{})
  assert.deepEqual(missing.annotations,{})
})

test('原文或语种变更且新缓存也存在同号索引时，不误用旧人工数据',()=>{
  for(const changedText of [true,false]){
    const saved=reconcileLearningState([song],seed())
    saved.progress.lyricSnapshots[song.id].manualAnnotations[12].language='ja'
    const target={...song,language:changedText?'ja':'other',lines:[{...song.lines[0],text:changedText?'今日へ歌う':song.lines[0].text}]}
    const current={id:12,text:target.lines[0].text,tokens:[{index:0,surface:changedText?'今日':'明日',reading:'きょう'},{index:4,surface:'へ',reading:'へ'},{index:9,surface:'歌う',reading:'うたう'}]}
    const result=reconcileLearningState([target],{...saved,annotations:{[song.id]:[current]}})
    assert.deepEqual(result.progress.corrections,{})
    const record=result.progress.lyricSnapshots[song.id].unresolvedCorrections[key(0)][0]
    assert.equal(record.reading,'あす')
    assert.equal(record.annotation.tokens[0].surface,'明日')
  }
})

test('用户明确重分词保存更新保护快照，不被旧词界还原',()=>{
  const saved=reconcileLearningState([song],seed())
  const editedAnnotation={id:12,text:song.lines[0].text,tokens:[{index:0,surface:'明',reading:'あ'},{index:1,surface:'日',reading:'す'},{index:4,surface:'へ',reading:'へ'},{index:9,surface:'歌う',reading:'うたう'}]}
  const edited=commitEditedLine([song],saved,song.id,12,editedAnnotation,{0:'あ',1:'す',4:'へ',9:''},'', [0,1,9])
  const reloaded=reconcileLearningState([song],{...edited.state,annotations:{}})
  assert.equal(reloaded.annotations[song.id][0].tokens[0].surface,'明')
  assert.equal(reloaded.progress.corrections[key(0)],'あ')
  assert.equal(reloaded.progress.corrections[key(1)],'す')
})

test('明确采用AI分词建议后同步保护证据，不把新结果回滚成旧词',()=>{
  const saved=reconcileLearningState([song],seed())
  const snapshot={annotations:saved.annotations[song.id],fingerprint:reviewFingerprint(song,saved.progress.corrections),suggestions:[{kind:'segmentation',line_id:12,token_index:0,token_indices:[0],surface:'明日',segments:[{surface:'明',reading:'あ'},{surface:'日',reading:'す'}]}]}
  const edited=applyLyricReview(saved,song,snapshot,['12:0'])
  const reloaded=reconcileLearningState([song],{...edited,annotations:{}})
  assert.equal(reloaded.annotations[song.id][0].tokens[0].surface,'明')
  assert.equal(reloaded.progress.corrections[key(0)],'あ')
})

test('时间戳、翻译和注音显示位置变化不影响人工保护',()=>{
  const saved=reconcileLearningState([song],seed())
  const changed={...song,lines:[{...song.lines[0],start:3.2,translation:'明天继续歌唱'}]}
  const result=reconcileLearningState([changed],saved)
  assert.deepEqual(result.progress.corrections,saved.progress.corrections)
  assert.deepEqual(result.progress.lyricSnapshots[song.id].manualAnnotations,saved.progress.lyricSnapshots[song.id].manualAnnotations)
})

test('人工词界及隔离记录可随学习备份往返，旧备份仍可读',async()=>{
  for(const removeCache of [false,true]){
    const original=seed();if(removeCache)original.annotations={}
    const state=reconcileLearningState([song],original)
    const restored=(await inspectLearningBackup(createLearningBackup([song],state))).manifest
    // JSON备份自然省略undefined的sourceFile，比较实际可持久化内容。
    assert.deepEqual(restored.progress.lyricSnapshots,JSON.parse(JSON.stringify(state.progress.lyricSnapshots)))
  }
  await inspectLearningBackup(createLearningBackup([song],seed()))
})

test('损坏的人工快照或待核对记录不能通过备份校验',()=>{
  for(const patch of [{manualAnnotations:[]},{manualAnnotations:{12:{id:12,text:'别的字',tokens:annotation.tokens}}},{unresolvedCorrections:{[key(0)]:[{reading:12,text:null}]}}]){
    const state=seed();Object.assign(state.progress.lyricSnapshots[song.id],patch)
    assert.throws(()=>createLearningBackup([song],state),/格式|无效/)
  }
})
