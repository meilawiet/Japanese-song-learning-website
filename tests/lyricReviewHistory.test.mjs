import test from 'node:test'
import assert from 'node:assert/strict'
import {applyLyricReview,reviewFingerprint,reviewLines,validateReviewResult} from '../src/lib/lyricAiReview.js'
import {createReviewRecord,recordDecisions} from '../src/lib/lyricReviewHistory.js'
import {prepareLyricReadings} from '../src/lib/lyricReadings.js'
import { resegmentLyricTokens } from '../src/lib/lyricSegmentation.js'

const song={id:'s',title:'分词回归',lines:[{id:0,text:'わかれ道と一人'}]}
const annotations=[{id:0,text:song.lines[0].text,tokens:[{index:0,surface:'わかれ道',reading:'わかれみち'},{index:1,surface:'と',reading:'と'},{index:2,surface:'一',reading:'いち'},{index:3,surface:'人',reading:'にん'}]}]
const result=()=>validateReviewResult({suggestions:[
  {line_id:0,token_index:0,token_indices:[0],kind:'segmentation',segments:[{surface:'わかれ',reading:'わかれ'},{surface:'道',reading:'みち'}],confidence:.95,reason:'整体读音无误，但用户可将假名和名词分开学习'},
  {line_id:0,token_index:2,token_indices:[2,3],kind:'segmentation',segments:[{surface:'一人',reading:'ひとり'}],confidence:.95,reason:'作为完整词理解'}
]},reviewLines(song,annotations,{}))
const snapshot=()=>({...result(),annotations,reviewAnnotations:annotations,fingerprint:reviewFingerprint(song,{})})

// 历史中的另一处建议必须在首次采用后仍能正确定位；新索引不影响原词。
test('分词拆分合并保持原文，历史未采纳项可以在另一次采用后继续使用',()=>{
  const record=snapshot()
  assert.equal(record.suggestions.length,2)
  const original={progress:{corrections:{}},annotations:{s:annotations}}
  const first=applyLyricReview(original,song,record,['0:0'])
  assert.equal(first.annotations.s[0].tokens.map(token=>token.surface).join(''),song.lines[0].text)
  assert.deepEqual(first.annotations.s[0].tokens.slice(0,2).map(token=>token.surface),['わかれ','道'])
  const next=applyLyricReview(first,song,record,['0:2'],{historical:true})
  assert.deepEqual(next.annotations.s[0].tokens.map(token=>token.surface),['わかれ','道','と','一人'])
  assert.equal(next.progress.corrections['s:0:2'],'ひとり')
  assert.deepEqual(original.annotations.s,annotations)
  assert.throws(()=>applyLyricReview(first,{...song,lines:[{id:0,text:'変更後'}]},record,['0:2'],{historical:true}),/重新复核/)
})
test('人工读音可被质疑，明确采用后改写，未采用不变',()=>{
  const s={id:'s',lines:[{id:0,text:'一人'}]},ann=[{id:0,text:'一人',tokens:[{index:0,surface:'一人',reading:'ひとり'}]}]
  const state={progress:{corrections:{'s:0:0':'いちにん'}},annotations:{s:ann}}
  const r=validateReviewResult({suggestions:[{line_id:0,token_index:0,suggested_reading:'ひとり',confidence:.95,reason:'人工读音与一人语境不符'}]},reviewLines(s,ann,state.progress.corrections))
  assert.equal(r.suggestions[0].manual_challenge,true)
  const snap={...r,annotations:ann,reviewAnnotations:ann,fingerprint:reviewFingerprint(s,state.progress.corrections)}
  assert.equal(state.progress.corrections['s:0:0'],'いちにん')
  assert.equal(applyLyricReview(state,s,snap,['0:0']).progress.corrections['s:0:0'],'ひとり')
})
test('跳过决定保留，重新采用写入时间，不影响其他历史建议',()=>{
  const record=createReviewRecord(song,snapshot())
  const skipped=recordDecisions(record,['0:0'],'skipped',100)
  const adopted=recordDecisions(skipped,['0:0'],'adopted',200)
  assert.deepEqual(adopted.decisions['0:0'],{status:'adopted',skippedAt:100,adoptedAt:200})
  assert.deepEqual(record.decisions,{})
  assert.equal(adopted.decisions['0:2'],undefined)
})
test('无效分词、原文改写和重叠建议不能落盘',()=>{
  const lines=reviewLines(song,annotations,{})
  assert.equal(validateReviewResult({suggestions:[{...result().suggestions[0],segments:[{surface:'道',reading:'みち'}]}]},lines).suggestions.length,0)
  const snap=snapshot();snap.suggestions.push({...snap.suggestions[0],token_index:4})
  assert.throws(()=>applyLyricReview({progress:{corrections:{}},annotations:{s:annotations}},song,snap,['0:0','0:4']),/同一处/)
})
test('用户选择的连续汉字边界不被来源匹配再次吞并',()=>{
  const tokens=[{index:0,surface:'明日',reading:'あす',segmentation_locked:true},{index:1,surface:'晴天',reading:'せいてん',segmentation_locked:true}]
  assert.equal(prepareLyricReadings(tokens,'a su se i te n',{},'s',0).tokens.length,2)
})

// 整句点选词界不能丢失未变更词的人工编辑，也不能将括号注音当作歌词字符。
test('整句词界点选拆分混合词，保留其他词索引与人工留空',()=>{
  const original=[{index:0,surface:'もう',reading:'もう'},{index:1,surface:'わかれ道',reading:'わかれみち'},{index:2,surface:'が',reading:'が'}]
  const changed=resegmentLyricTokens(original,['もう','わかれ','道','が'],{0:'',1:'わかれみち',2:'が'},new Set([0]))
  assert.deepEqual(changed.tokens.map(token=>token.surface),['もう','わかれ','道','が'])
  assert.deepEqual(changed.tokens.map(token=>token.reading),['','わかれ','みち','が'])
  assert.equal(changed.tokens[0].index,0);assert.equal(changed.tokens.at(-1).index,2)
  assert.deepEqual([...changed.manualIndices],[0]);assert.equal(original[1].surface,'わかれ道')
  const inline=resegmentLyricTokens([{index:0,surface:'囚(とら)われた',reading:'とらわれた'}],['囚','われ','た'],{0:'とらわれた'})
  assert.equal(inline.tokens.map(token=>token.surface).join(''),'囚(とら)われた')
  assert.deepEqual(inline.tokens.map(token=>token.reading),['とら','われ','た'])
})
