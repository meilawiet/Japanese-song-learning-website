import test from 'node:test'
import assert from 'node:assert/strict'
import {adjustmentFeedback,applyLyricReview,groupReviewEntries,mergeIssueAdjustment,reviewFingerprint,reviewLines,validateReviewResult,LYRIC_REVIEW_PROMPT} from '../src/lib/lyricAiReview.js'
import {lineReading} from '../src/lib/readingDisplay.js'
import {prepareLyricReadings} from '../src/lib/lyricReadings.js'

const song={id:'s',lines:[{id:0,text:'永遠と君news',romaji:'to wa to ki mi news'}]}
const annotations=[{id:0,tokens:[{index:0,surface:'永遠',reading:'えいえん'},{index:1,surface:'と',reading:'と'},{index:2,surface:'君',reading:'きみ'},{index:3,surface:'news',reading:'ねws'}]}]
const proposal=(index,reading)=>({line_id:0,token_index:index,suggested_reading:reading,confidence:0.95,reason:'来源读音复核'})

test('二次调整保留未选问题、已选建议和空响应未解决的问题',()=>{
  const original={suggestions:[{line_id:0,token_index:0,suggested_reading:'とわ'}],issues:[{line_id:1,reason:'一人读音异常'},{line_id:2,reason:'永久特殊唱法'}]}
  const next={suggestions:[{line_id:1,token_index:0,suggested_reading:'ひとり'}],issues:[]}
  const result=mergeIssueAdjustment(original,[0],next)
  assert.equal(result.suggestions.length,2)
  assert.deepEqual(result.issues,[original.issues[1]])
  assert.deepEqual(mergeIssueAdjustment(original,[0],{suggestions:[],issues:[]}).issues,original.issues)
  assert.deepEqual(original.issues.length,2)
})

// 检查真实模型边界：人工留空、英文、未知索引、虚构读音、低置信度都拒绝。
test('复核输入带入来源和人工锁定，模型无权覆盖留空或给英文注音',()=>{
  const lines=reviewLines(song,annotations,{'s:0:2':''})
  assert.equal(lines[0].tokens[2].manual,true)
  assert.equal(lines[0].tokens[2].current_reading,'')
  lines[0].tokens[0].current_reading=''
  lines[0].source_alignment='unresolved'
  const result=validateReviewResult({suggestions:[proposal(0,'とわ'),proposal(0,'とわ'),proposal(0,'えいえん'),proposal(2,'きみ'),proposal(3,'にゅーす'),proposal(99,'うた'),{...proposal(0,'とわ'),confidence:NaN}],issues:[{line_id:0,kind:'lyric_text',token_indices:[0],observed:'永遠',expected:'永久',confidence:0.9,reason:'可能缺字'},{line_id:99,reason:'伪造句子'}]},lines)
  assert.equal(result.suggestions.length,1)
  assert.equal(result.suggestions[0].suggested_reading,'とわ')
  assert.equal(result.issues.length,1)
  assert.ok(LYRIC_REVIEW_PROMPT.includes('完整词面'))
})

test('散っ加て按完整活用理解，不能建议删掉词干促音',()=>{
  const s={id:'s',lines:[{id:0,text:'散って行った'}]}
  const tokens=[{index:0,surface:'散っ',reading:'ちっ',dictionary_form:'散る',part_of_speech:'動詞',inflection_form:'連用タ接続'},
    {index:1,surface:'て',reading:'て',part_of_speech:'助詞・接続助詞'},
    {index:2,surface:'行っ',reading:'いっ',dictionary_form:'行く',part_of_speech:'動詞'},
    {index:3,surface:'た',reading:'た',part_of_speech:'助動詞'}]
  const lines=reviewLines(s,[{id:0,tokens}],{})
  assert.equal(lines[0].analysis_units[0].surface,'散って')
  assert.equal(lines[0].analysis_units[0].reading,'ちって')
  assert.equal(lines[0].analysis_units[1].surface,'行った')
  const result=validateReviewResult({suggestions:[proposal(0,'ち')],issues:[{line_id:0,kind:'reading_uncertain',token_indices:[0],observed:'ちっ',expected:'ち',confidence:0.9,reason:'错误地把词干当原形'}]},lines)
  assert.equal(result.suggestions.length,0)
  assert.equal(result.issues.length,0)
})

test('拨音撇号与正确来源对齐不是问题，无误条目略过且允许撤回旧提示',()=>{
  const s={id:'s',lines:[{id:0,text:'自分愛して',romaji:"ji bu n’ai shi te"}]}
  const tokens=[{index:0,surface:'自分',reading:'じぶん'},{index:1,surface:'愛し',reading:'あいし',part_of_speech:'動詞'},{index:2,surface:'て',reading:'て',part_of_speech:'助詞'}]
  const lines=reviewLines(s,[{id:0,tokens}],{})
  assert.equal(lines[0].source_kana,'じぶんあいして')
  assert.equal(lines[0].source_alignment,'verified')
  const issue={line_id:0,kind:'source_mismatch',token_indices:[0,1],observed:"ji bu n'ai shi",expected:'ji bu n a i shi',confidence:0.9,reason:'仅因撇号声称缺失音节'}
  assert.equal(validateReviewResult({issues:[issue]},lines).issues.length,0)
  const result=validateReviewResult({issues:[{...issue,reason:'当前读音无误，无需修改。'}]},lines)
  assert.equal(result.issues.length,0)
  assert.deepEqual(result.cleared_line_ids,[0])
  const old={suggestions:[],issues:[issue]}
  assert.equal(mergeIssueAdjustment(old,[0],result).issues.length,0)
  assert.equal(adjustmentFeedback(0,0).warning,false)
  assert.equal(adjustmentFeedback(1,2).warning,true)
  assert.match(adjustmentFeedback(1,2).message,/2 条所选问题未解决/)
})

test('无误修改建议也过滤，不把“不正确”误判为无需修改',()=>{
  const lines=reviewLines({...song,lines:[{id:0,text:'永遠と君news'}]},annotations,{})
  assert.equal(validateReviewResult({suggestions:[{...proposal(0,'とわ'),reason:'此处注音无误，无需修改'}]},lines).suggestions.length,0)
  assert.equal(validateReviewResult({suggestions:[{...proposal(0,'とわ'),reason:'当前读音不正确，依据语境应为とわ'}]},lines).suggestions.length,1)
})
test('无来源时允许语境复核，但必须有效索引、假名与足够置信度',()=>{
  const lines=reviewLines({...song,lines:[{id:0,text:'永遠と君news'}]},annotations,{})
  const result=validateReviewResult({suggestions:[proposal(0,'とわ'),proposal(2,'kimi'),{...proposal(2,'あなた'),confidence:0.4}]},lines)
  assert.equal(result.suggestions.length,1)
})

test('无来源永久的中等置信度とわ候选不再被丢弃，不自动确定其他歌曲唱法',()=>{
  const s={id:'s',lines:[{id:0,text:'永久に'}]},ann=[{id:0,tokens:[{index:0,surface:'永久',reading:'えいきゅう'},{index:1,surface:'に',reading:'に',part_of_speech:'助詞'}]}]
  const result=validateReviewResult({suggestions:[{...proposal(0,'とわ'),confidence:0.7,reason:'词典读音正确，但歌曲可能采用とわ的特殊唱法，需要试听确认。'}]},reviewLines(s,ann,{}))
  assert.equal(result.suggestions.length,1)
  assert.equal(result.suggestions[0].suggested_reading,'とわ')
  assert.equal(result.suggestions[0].needs_confirmation,true)
  const legacy=validateReviewResult({issues:[{line_id:0,reason:'“永久”的当前读音是“えいきゅう”，在歌曲中可能读作“とわ”，请试听确认。'}]},reviewLines(s,ann,{}))
  assert.equal(legacy.issues.length,1)
  assert.deepEqual(legacy.issues[0].token_indices,[0])
  assert.equal(legacy.issues[0].expected,'とわ')
  assert.equal(validateReviewResult({suggestions:[]},reviewLines(s,ann,{})).suggestions.length,0)
  assert.equal(validateReviewResult({suggestions:[{...proposal(0,'とわ'),confidence:0.7}]},reviewLines(s,ann,{'s:0:0':''})).suggestions.length,0)
})

test('同一句多条建议和问题归组一次，保持原歌词次序及问题选择索引',()=>{
  const s={id:'s',lines:[{id:8,text:'第一句'},{id:4,text:'第二句'}]}
  const result={suggestions:[{line_id:4,token_index:2},{line_id:4,token_index:3}],issues:[{line_id:4,reason:'问题A'},{line_id:8,reason:'问题B'}]}
  const groups=groupReviewEntries(s,result)
  assert.deepEqual(groups.map(group=>group.line.id),[8,4])
  assert.equal(groups[1].suggestions.length+groups[1].issues.length,3)
  assert.equal(groups[1].line.text,'第二句')
  assert.equal(groups[1].issues[0].issueIndex,0)
})

test('词素切分时完整相邻词读音可作问题依据，无关或虚构读音不接受',()=>{
  const s={id:'s',lines:[{id:0,text:'一人で歌う'}]}
  const ann=[{id:0,tokens:[{index:0,surface:'一',reading:'いち'},{index:1,surface:'人',reading:'にん'},
    {index:2,surface:'で',reading:'で'},{index:3,surface:'歌う',reading:'うたう'}]}]
  const lines=reviewLines(s,ann,{})
  const issue={line_id:0,kind:'reading_uncertain',token_indices:[0],observed:'いちにん',expected:'ひとり',confidence:0.8,reason:'一人で在这里可能应读ひとりで'}
  assert.equal(validateReviewResult({issues:[issue]},lines).issues.length,1)
  assert.equal(validateReviewResult({issues:[{...issue,observed:'せかい'}]},lines).issues.length,0)
})

test('AI空回复也必须显示缺失汉字注音，人工留空不报缺失',()=>{
  const s={id:'s',lines:[{id:41,text:'天空'}]},ann=[{id:41,tokens:[{index:0,surface:'天空',reading:''}]}]
  const lines=reviewLines(s,ann,{})
  assert.deepEqual(lines[0].missing_reading_indices,[0])
  const result=validateReviewResult({suggestions:[],issues:[]},lines)
  assert.equal(result.issues.length,1)
  assert.equal(result.issues[0].kind,'missing_reading')
  assert.deepEqual(result.issues[0].token_indices,[0])
  assert.match(result.issues[0].reason,/天空/)
  assert.equal(result.rejected_count,0)
  assert.equal(validateReviewResult({},reviewLines(s,ann,{'s:41:0':''})).issues.length,0)
})

test('AI可以校验并合并一人，保存后ひとり整词显示，其他索引不改变',()=>{
  const s={id:'s',lines:[{id:0,text:'一人で'}]},ann=[{id:0,tokens:[
    {index:5,surface:'一',reading:'いち',part_of_speech:'名詞・数'},
    {index:6,surface:'人',reading:'にん',part_of_speech:'名詞・接尾'},
    {index:7,surface:'で',reading:'で',part_of_speech:'助詞'}]}]
  const lines=reviewLines(s,ann,{})
  assert.equal(lines[0].analysis_units[0].surface,'一人')
  const next=validateReviewResult({suggestions:[{line_id:0,token_index:5,token_indices:[5,6],suggested_reading:'ひとり',confidence:0.99,reason:'一人で中的完整词读ひとり'}]},lines)
  assert.equal(next.suggestions.length,1)
  const duplicate=validateReviewResult({suggestions:[5,6].map(index=>({line_id:0,token_index:index,suggested_reading:'ひとり',confidence:0.99,reason:'一人整体读ひとり，建议合并两个词素'}))},lines)
  assert.equal(duplicate.suggestions.length,1)
  assert.deepEqual(duplicate.suggestions[0].token_indices,[5,6])
  assert.equal(duplicate.rejected_count,0)
  const firstOnly=validateReviewResult({suggestions:[{line_id:0,token_index:5,suggested_reading:'ひとり',confidence:0.99,reason:'一人で通常整体读ひとり，建议合并一人'}]},lines)
  assert.deepEqual(firstOnly.suggestions[0].token_indices,[5,6])
  assert.equal(firstOnly.suggestions[0].surface,'一人')
  const snapshot={...next,fingerprint:reviewFingerprint(s,{}),annotations:ann,reviewAnnotations:ann}
  const state=applyLyricReview({progress:{corrections:{}},annotations:{}},s,snapshot,['0:5'])
  assert.deepEqual(state.annotations.s[0].tokens.map(token=>token.index),[5,7])
  assert.equal(state.annotations.s[0].tokens[0].surface,'一人')
  assert.equal(lineReading(state.annotations.s[0].tokens,state.progress.corrections,'s',0,'hiragana'),'ひとり で')
  assert.equal(validateReviewResult({suggestions:[{...next.suggestions[0],token_indices:[5,7]}]},lines).suggestions.length,0)
  assert.equal(validateReviewResult({suggestions:next.suggestions},reviewLines(s,ann,{'s:0:6':''})).suggestions.length,0)
})
test('用户采用后共享人工校正，来源变化拒绝旧建议，其他进度保留',()=>{
  const corrections={'s:0:2':''},state={progress:{corrections,learnedBySong:{s:[0]}},annotations:{other:[]}}
  const snapshot={fingerprint:reviewFingerprint(song,corrections),annotations,suggestions:[{line_id:0,token_index:0,suggested_reading:'とわ'}]}
  const next=applyLyricReview(state,song,snapshot,['0:0','0:99'])
  assert.equal(next.progress.corrections['s:0:0'],'とわ')
  assert.equal(next.progress.corrections['s:0:2'],'')
  assert.equal(lineReading(next.annotations.s[0].tokens,next.progress.corrections,'s',0,'hiragana',song.lines[0].romaji),'とわ と news')
  assert.deepEqual(next.progress.learnedBySong,{s:[0]})
  assert.deepEqual(state.progress.corrections,corrections)
  assert.throws(()=>applyLyricReview(state,{...song,lines:[{...song.lines[0],romaji:'e i e n'}]},snapshot,['0:0']),/重新复核/)
})
test('采用连续汉字组建议只合并目标词，其他组内旧人工索引保留',()=>{
  const groupSong={id:'s',lines:[{id:0,text:'明日晴天',romaji:'a su se i te n'},{id:1,text:'明日晴天',romaji:'a su se i te n'}]}
  const raw=groupSong.lines.map(line=>({id:line.id,tokens:[{index:0,surface:'明日',reading:'あした'},{index:1,surface:'晴天',reading:'せいてん'}]}))
  const corrections={'s:1:1':'せいせい'},state={progress:{corrections},annotations:{s:raw}}
  const snapshot={annotations:raw,reviewAnnotations:raw.map(line=>({...line,tokens:prepareLyricReadings(line.tokens,groupSong.lines[line.id].romaji,corrections,'s',line.id).tokens})),fingerprint:reviewFingerprint(groupSong,corrections),suggestions:[{line_id:0,token_index:0,suggested_reading:'あすせいてん'}]}
  const next=applyLyricReview(state,groupSong,snapshot,['0:0'])
  assert.equal(next.annotations.s[0].tokens.length,1)
  assert.equal(next.annotations.s[1].tokens.length,2)
  assert.equal(lineReading(next.annotations.s[0].tokens,next.progress.corrections,'s',0,'hiragana','a su se i te n'),'あすせいてん')
  assert.equal(lineReading(next.annotations.s[1].tokens,next.progress.corrections,'s',1,'hiragana','a su se i te n'),'あすせいせい')
})
