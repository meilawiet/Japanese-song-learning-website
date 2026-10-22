import test from 'node:test'
import assert from 'node:assert/strict'
import { StudyTransport } from '../src/lib/studyTransport.js'
import { LyricTapGesture } from '../src/lib/lyricTapGesture.js'

// 原创歌词时间轴与可控时钟，不读取用户歌曲或调用 AI。
const song = { id: 'original-range-test', lines: [{id: 12, start: 1}, {id: 5, start: 3}, {id: 41, start: 5}, {id: 9, start: 7}] }
function fixture(audio) {
  let clock = 0
  const t = new StudyTransport({ now: () => clock, getAudio: () => audio })
  t.configure({ song, enabled: true, audioUrl: audio ? 'blob:original-test' : '' })
  return { t, advance(seconds) { clock += seconds * 1000; t.tick() } }
}

test('双击起止点只选段不自动播放，反向和不连续句号按歌词顺序归一', () => {
  const {t} = fixture()
  t.doubleTapLine(41)
  assert.equal(t.state.rangeAnchorId, 41); assert.equal(t.state.range, null); assert.equal(t.state.playing, false)
  t.doubleTapLine(12)
  assert.deepEqual(t.state.range, {startIndex: 0, endIndex: 2, startId: 12, endId: 41})
  assert.equal(t.state.rangeAnchorId, null); assert.equal(t.state.playing, false); assert.equal(t.state.busy, false)
  assert.equal(t.state.time, 1)
})

test('段内任一句单击按整段播放、暂停、段首重播；段尾停止且不会自动无限循环', () => {
  const {t, advance} = fixture()
  t.doubleTapLine(12); t.doubleTapLine(41)
  t.playLine(5); assert.equal(t.state.playing, true); assert.equal(t.state.time, 1)
  advance(3); assert.equal(t.state.time, 4); assert.equal(t.selected, 5)
  t.playLine(41); assert.equal(t.state.playing, false)
  t.playLine(5); assert.equal(t.state.time, 1); assert.equal(t.state.playing, true)
  advance(10); assert.equal(t.state.time, 7); assert.equal(t.state.playing, false); assert.equal(t.selected, 41)
  advance(30); assert.equal(t.state.time, 7); assert.equal(t.state.playing, false)
  t.playLine(41); assert.equal(t.state.time, 1); assert.equal(t.state.playing, true)
})

// 原断言要求段外单击直接选中并播放：assert.equal(t.state.range, null); assert.equal(t.selected, 9)
// 用户修正：第一次只退出；下一次点击才恢复普通单句。
test('段外单击仅退出且不跳句，下次单击恢复单句；段内双击及重复起点均可取消', () => {
  const {t} = fixture()
  t.doubleTapLine(12); t.doubleTapLine(41); t.playLine(9)
  assert.equal(t.state.range, null); assert.equal(t.selected, 12); assert.equal(t.state.playing, false)
  t.playLine(9); assert.equal(t.selected, 9)
  t.doubleTapLine(12); t.doubleTapLine(41); t.playLine(12); t.doubleTapLine(5)
  assert.equal(t.state.range, null); assert.equal(t.state.playing, false)
  t.doubleTapLine(5); t.doubleTapLine(5)
  assert.equal(t.state.rangeAnchorId, null); assert.equal(t.state.playing, false)
})

// 对正在播放、暂停、已播完及等待终点分别回归，避免只修好未开始的情况。
test('逐句和跟唱的各种选段状态，段外单击都只退出并保留当前位置', () => {
  for (const mode of ['sentence','continuous']) for (const phase of ['selected','playing','paused','finished','anchor']) {
    const {t,advance}=fixture()
    t.setMode(mode);t.doubleTapLine(12)
    if(phase!=='anchor')t.doubleTapLine(41)
    if(['playing','paused','finished'].includes(phase)){t.playLine(12);advance(phase==='finished'?20:1)}
    if(phase==='paused')t.pause()
    const time=t.state.time,selected=t.selected
    t.playLine(9)
    assert.equal(t.state.range,null,`${mode}/${phase}`)
    assert.equal(t.state.rangeAnchorId,null)
    assert.equal(t.state.playing,false);assert.equal(t.state.busy,false)
    assert.equal(t.state.time,time);assert.equal(t.selected,selected)
    advance(20);assert.equal(t.state.time,time)
  }
})

test('选段载入中单击段外会取消旧请求，元信息到达也不会开始播放', async () => {
  const events=new EventTarget()
  const audio={duration:10,readyState:0,currentTime:0,pause(){},load(){},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)}
  const {t}=fixture(audio)
  t.doubleTapLine(12);t.doubleTapLine(41);t.playLine(5)
  assert.equal(t.state.busy,true)
  t.playLine(9);events.dispatchEvent(new Event('loadedmetadata'));await Promise.resolve();await Promise.resolve()
  assert.equal(t.state.range,null);assert.equal(t.state.busy,false);assert.equal(t.state.playing,false)
})

test('跟唱模式选段仍只播一次，底部播放完成后重播段首，切换模式清除范围', () => {
  const {t, advance} = fixture()
  t.setMode('continuous'); t.doubleTapLine(12); t.doubleTapLine(5)
  t.toggle(); advance(6)
  assert.equal(t.state.time, 5); assert.equal(t.state.playing, false)
  t.toggle(); assert.equal(t.state.time, 1); assert.equal(t.state.playing, true)
  t.setMode('sentence'); assert.equal(t.state.range, null); assert.equal(t.state.playing, false)
})

// 原要求“缺时间戳不能选择”；收藏入口统一后允许阅读选区，但不允许播放或伪造时间。
test('拖动、切歌及离页清除临时范围；纯歌词可选择收藏但不能播放', () => {
  const {t} = fixture()
  t.doubleTapLine(12); t.doubleTapLine(41); t.seek(4)
  assert.ok(t.state.range); assert.equal(t.state.time, 4)
  t.seek(7); assert.equal(t.state.range, null)
  t.doubleTapLine(12); t.doubleTapLine(5); t.configure({song, enabled:false})
  assert.equal(t.state.range, null); assert.equal(t.state.rangeAnchorId, null)
  t.doubleTapLine(12); assert.equal(t.state.rangeAnchorId, null)
  t.configure({song:{lines:[{id:1,start:null},{id:9,start:null}]},enabled:true}); t.doubleTapLine(9)
  // 原断言：assert.equal(t.state.rangeAnchorId, null)
  assert.equal(t.state.rangeAnchorId, 9)
  t.doubleTapLine(1)
  assert.deepEqual(t.state.range,{startIndex:0,endIndex:1,startId:1,endId:9})
  t.playRange(); t.toggle()
  assert.equal(t.state.playing,false); assert.equal(t.state.ready,false); assert.equal(t.state.time,0)
  t.doubleTapLine(9); assert.equal(t.state.range,null)
})

test('真实音频从段首开始、按真实段尾暂停；最后一句以实际媒体时长结束', async () => {
  const audio = {duration: 10, readyState: 1, currentTime: 0, paused: true, pause() {this.paused=true}, async play() {this.paused=false}}
  const {t} = fixture(audio)
  t.doubleTapLine(5); t.doubleTapLine(9)
  assert.equal(audio.paused, true); assert.equal(t.state.playing, false)
  t.playLine(41); await Promise.resolve(); await Promise.resolve()
  assert.equal(audio.currentTime, 3); assert.equal(audio.paused, false)
  audio.currentTime=10.1; t.tick()
  assert.equal(audio.currentTime, 10); assert.equal(audio.paused,true); assert.equal(t.state.playing,false)
})

test('同时间戳结束句按随后更晚的时间结束，AI单句试听不继承选段', async () => {
  const {t, advance} = fixture()
  t.configure({song:{lines:[{id:1,start:0},{id:2,start:2},{id:3,start:2},{id:4,start:4}]},enabled:true})
  t.doubleTapLine(1); t.doubleTapLine(2); t.playLine(1); advance(10)
  assert.equal(t.state.time,4); assert.equal(t.state.playing,false)
  t.configure({song,enabled:true});t.doubleTapLine(12);t.doubleTapLine(41)
  t.playLine(5,true); advance(10)
  assert.equal(t.state.range,null);assert.equal(t.state.time,5)
})

test('选段载入未完成时再次双击退出，旧元信息事件不能复活播放', async () => {
  const events=new EventTarget()
  const audio={duration:10,readyState:0,currentTime:0,pause(){},load(){},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)}
  const {t}=fixture(audio)
  t.doubleTapLine(12);t.doubleTapLine(41);t.playLine(5)
  assert.equal(t.state.busy,true)
  t.doubleTapLine(5);events.dispatchEvent(new Event('loadedmetadata'));await Promise.resolve();await Promise.resolve()
  assert.equal(t.state.range,null);assert.equal(t.state.busy,false);assert.equal(t.state.playing,false)
})

function gestures() {
  let clock=0,sequence=0
  const timers=new Map(), calls=[]
  const g=new LyricTapGesture({onSingle:id=>calls.push(['single',id]),onDouble:id=>calls.push(['double',id]),now:()=>clock,
    schedule:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,due:clock+delay});return id},unschedule:id=>timers.delete(id)})
  return {g,calls,advance(ms){clock+=ms;for(const [id,timer] of [...timers])if(timer.due<=clock){timers.delete(id);timer.fn()}}}
}
test('300毫秒内同一句双击只触发双击，慢速两次和不同句均按单击处理', () => {
  const {g,calls,advance}=gestures()
  g.tap(1);advance(120);assert.deepEqual(calls,[]);g.tap(1);advance(500)
  assert.deepEqual(calls,[['double',1]])
  g.tap(2);advance(301);g.tap(2);advance(301)
  assert.deepEqual(calls.slice(1),[['single',2],['single',2]])
  g.tap(3);advance(100);g.tap(4);advance(301)
  assert.deepEqual(calls.slice(3),[['single',3],['single',4]])
})
test('滚动、长按、按钮或离页取消后，延迟单击不会再触发播放', () => {
  const {g,calls,advance}=gestures()
  for(const id of [1,2,3,4]){g.tap(id);advance(100);g.cancel();advance(500)}
  assert.deepEqual(calls,[])
})

// 回归真机发现的问题：浏览器定时器不能以手势实例作为 this 调用，Node原生定时器恰好不报错。
test('默认定时器保留浏览器调用语义，不作为手势实例方法非法调用', () => {
  const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout
  let g,task
  const calls=[]
  try {
    globalThis.setTimeout=function(fn){assert.notEqual(this,g);task=fn;return 1}
    globalThis.clearTimeout=function(){assert.notEqual(this,g)}
    g=new LyricTapGesture({onSingle:id=>calls.push(['single',id]),onDouble:id=>calls.push(['double',id])})
    g.tap(1);g.tap(1);g.tap(2);task()
    assert.deepEqual(calls,[['double',1],['single',2]])
  }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear}
})
