import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeDesktopTask, groupDesktopTasks, canCancelDesktopTask, desktopTaskSongId } from '../src/lib/desktopTasks.js'
test('task history trimming never drops queued, running, failed or cancelled work', () => {
  let tasks = Array.from({length:25},(_,i)=>({id:`ai:${i}`,state:'queued'}))
  tasks.push({id:'failure',state:'failed'},{id:'cancel',state:'cancelled'})
  for(let i=0;i<30;i++) tasks=mergeDesktopTask(tasks,`done:${i}`,{state:'done'})
  assert.equal(tasks.filter(t=>t.state==='queued').length,25)
  assert.equal(tasks.filter(t=>t.state==='done').length,20)
  assert.ok(tasks.some(t=>t.id==='failure'));assert.ok(tasks.some(t=>t.id==='cancel'))
})
test('cancellation acknowledgement preserves progress and belongs to active group', () => {
  let tasks=[{id:'ai:one',state:'running',done:8,total:48}]
  tasks=mergeDesktopTask(tasks,'ai:one',{state:'cancelling'})
  assert.equal(groupDesktopTasks(tasks).active.length,1)
  assert.equal(canCancelDesktopTask(tasks[0]),false)
  tasks=mergeDesktopTask(tasks,'ai:one',{state:'cancelled'})
  assert.equal(tasks[0].done,8);assert.equal(groupDesktopTasks(tasks).attention.length,1)
})
test('local commit stages and completed tasks cannot be cancelled',()=>{
  assert.equal(canCancelDesktopTask({state:'running',cancellable:false}),false)
  assert.equal(canCancelDesktopTask({state:'done'}),false)
  assert.equal(canCancelDesktopTask({state:'queued'}),true)
})
test('task links use stable song ids and do not parse import job ids as songs',()=>{
  assert.equal(desktopTaskSongId({id:'ai:local:a:b'}),'local:a:b')
  assert.equal(desktopTaskSongId({id:'import:batch:123'}),null)
  assert.equal(desktopTaskSongId({id:'import:single',songId:'local:42'}),'local:42')
})
