import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shiftLineTimestamp, mergeTimestampChanges, makeTimeOverrides, applySavedTimings, timestampSignature, resetLineTimestamp } from '../src/lib/timestampTuning.js'
import { reconcileLearningState } from '../src/lib/learningIdentity.js'

const lines=[{id:10,start:1,text:'空',romaji:'sora',translation:'天空'},{id:30,start:10,text:'風',romaji:'kaze',translation:'风'},{id:90,start:40,text:'歌'}]
test('只移动选中句、稳定毫秒与编号，来源读音和译文保留',()=>{
  const signature=timestampSignature(lines)
  let draft=lines
  for(let i=0;i<100;i++)draft=shiftLineTimestamp(draft,30,200)
  assert.equal(draft[1].start,30)
  assert.equal(draft[0],lines[0]);assert.equal(draft[2],lines[2])
  for(let i=0;i<100;i++)draft=shiftLineTimestamp(draft,30,-200)
  assert.deepEqual(draft,lines);assert.equal(timestampSignature(lines),signature)
  assert.equal(shiftLineTimestamp(lines,30,200)[1].romaji,'kaze')
})
test('阻止越界、相邻句重叠和缺失时间，不给普通文本编造时间',()=>{
  assert.throws(()=>shiftLineTimestamp([{id:0,start:0,text:'空'}],0,-200),/0秒/)
  assert.throws(()=>shiftLineTimestamp([{id:0,start:1},{id:1,start:1.2}],1,-200),/上一句/)
  assert.throws(()=>shiftLineTimestamp([{id:0,start:1},{id:1,start:1.2}],0,200),/下一句/)
  assert.throws(()=>shiftLineTimestamp(lines,90,200,40.1),/音频时长/)
  assert.throws(()=>shiftLineTimestamp([{id:0,start:null}],0,200),/没有时间戳/)
  assert.throws(()=>shiftLineTimestamp(lines,30,20),/0.2秒/)
})
test('保存仅合并时间并保留并发译文，冲突的原文或时间不能覆盖',()=>{
  const draft=shiftLineTimestamp(lines,30,200)
  const current=lines.map(line=>({...line,translation:'新的译文'}))
  const saved=mergeTimestampChanges(current,lines,draft)
  assert.equal(saved[1].start,10.2);assert.equal(saved[1].translation,'新的译文')
  assert.equal(saved[0],current[0]);assert.equal(saved[2],current[2])
  assert.throws(()=>mergeTimestampChanges(lines.map(line=>line.id===30?{...line,start:11}:line),lines,draft),/已变化/)
  assert.throws(()=>mergeTimestampChanges(lines.map(line=>line.id===30?{...line,text:'別'}:line),lines,draft),/已变化/)
  assert.throws(()=>mergeTimestampChanges(lines,lines,lines.map(line=>line.id===30?{...line,start:40.2}:line)),/相邻句子/)
  assert.throws(()=>mergeTimestampChanges(lines,lines,lines.map(line=>line.id===30?{...line,start:NaN}:line)),/时间戳无效/)
})

test('重置只还原所选句首次调试前的原点，多次即时保存及重启后仍可恢复',()=>{
  const first=mergeTimestampChanges(lines,lines,shiftLineTimestamp(lines,30,200))
  assert.equal(first[1].timestampOriginalStart,10)
  const second=mergeTimestampChanges(first,first,shiftLineTimestamp(first,30,200))
  const reloaded=JSON.parse(JSON.stringify(second)),restored=resetLineTimestamp(reloaded,30)
  assert.equal(restored[1].start,10);assert.equal(restored[1].timestampOriginalStart,10)
  assert.equal(restored[0],reloaded[0]);assert.equal(restored[2],reloaded[2])
  assert.throws(()=>resetLineTimestamp([{id:0,start:11},{id:1,start:12,timestampOriginalStart:10}],1),/相邻句子/)
  // 允许恢复原文件中原本同一时刻的两句，保持原顺序，不传播偏移。
  assert.equal(resetLineTimestamp([{id:0,start:1},{id:1,start:1.2,timestampOriginalStart:1}],1)[1].start,1)
})
test('项目歌曲覆盖只绑定对应原文和原时间，不污染更新后的歌词',()=>{
  const draft=shiftLineTimestamp(lines,30,200),timeOverrides=makeTimeOverrides(lines,draft)
  const song={id:'folder-test',lines}
  assert.deepEqual(Object.keys(timeOverrides),['30'])
  assert.equal(applySavedTimings(song,{timeOverrides}).lines[1].start,10.2)
  const next={...song,lines:lines.map(line=>line.id===30?{...line,start:12}:line)}
  assert.equal(applySavedTimings(next,{timeOverrides}).lines[1].start,12)
  assert.equal(applySavedTimings(song,{timeOverrides:{bad:true}}),song)
})
test('单改时间不清空掌握、人工读音、复核和逐句解析',()=>{
  const song={id:'local-tuning',sourceFile:'原创.lrc',isLocal:true,lines}
  const saved={progress:{learnedBySong:{[song.id]:[30]},corrections:{[`${song.id}:30:0`]:'かぜ'},lyricSnapshots:{[song.id]:{sourceFile:song.sourceFile,lines:lines.map(({id,text})=>({id,text}))}}},annotations:{[song.id]:[{id:30,text:'風',tokens:[{index:0,surface:'風',reading:'かぜ'}]}]},aiReviews:{[song.id]:{reviewed:true}},sentenceExplanations:{[song.id]:{30:{text:'風',explanation:{meaning:'风'}}}}}
  const next=reconcileLearningState([{...song,lines:shiftLineTimestamp(lines,30,200)}],saved)
  assert.deepEqual(next.progress.learnedBySong,saved.progress.learnedBySong)
  assert.deepEqual(next.progress.corrections,saved.progress.corrections)
  assert.deepEqual(next.annotations,saved.annotations);assert.deepEqual(next.aiReviews,saved.aiReviews);assert.deepEqual(next.sentenceExplanations,saved.sentenceExplanations)
})
