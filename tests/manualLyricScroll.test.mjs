import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLyricScrollGuard } from '../src/lib/manualLyricScroll.js'

// 可控时钟验证连续滑动、惯性及切歌清理，不等待真实5秒。
function fixture() {
  let time=0, next=0, resumed=0
  const timers=new Map()
  const guard=createLyricScrollGuard({resume:()=>resumed++,now:()=>time,setTimer:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id},clearTimer:id=>timers.delete(id)})
  const advance=ms=>{time+=ms;for(const [id,timer] of timers)if(timer.at<=time){timers.delete(id);timer.fn()}}
  return {guard,advance,resumed:()=>resumed,timers}
}
test('手动滑动与惯性后留出完整5秒，持续拖动不提前恢复',()=>{
  const f=fixture();assert.equal(f.guard.paused(),false)
  f.guard.begin();f.advance(6000);assert.equal(f.guard.paused(),true);assert.equal(f.resumed(),0)
  f.guard.end();f.advance(4500);f.guard.scroll();f.advance(4999);assert.equal(f.guard.paused(),true);assert.equal(f.resumed(),0)
  f.advance(1);assert.equal(f.guard.paused(),false);assert.equal(f.resumed(),1)
})
test('程序滚动和单击不触发暂停，滚轮重复操作延长，离页后不再恢复跟随',()=>{
  const f=fixture();f.guard.scroll();f.guard.end();assert.equal(f.timers.size,0)
  f.guard.interact();f.advance(4000);f.guard.interact();f.advance(4999);assert.equal(f.resumed(),0)
  f.guard.dispose();f.advance(10000);assert.equal(f.resumed(),0);assert.equal(f.timers.size,0)
})
