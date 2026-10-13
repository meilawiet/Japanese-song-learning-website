import assert from 'node:assert/strict'
import test from 'node:test'
import {lockModalScroll} from '../src/lib/useModalScrollLock.js'

// 同一窗口重复清理、嵌套弹层和原始样式恢复都不能让页面提前解锁或跳到顶部。
test('嵌套弹窗持锁，最后关闭才恢复原滚动位置和样式',()=>{
  const oldDocument=globalThis.document,oldWindow=globalThis.window
  const body={position:'relative',top:'',left:'',right:'',width:'',overflow:'auto'}
  const root={overflow:'',overscrollBehavior:'contain',scrollBehavior:'smooth'},scroll=[]
  globalThis.document={body:{style:body},documentElement:{style:root}}
  globalThis.window={scrollX:0,scrollY:640,scrollTo:value=>scroll.push(value)}
  try{
    const first=lockModalScroll(),second=lockModalScroll()
    assert.equal(body.position,'fixed');assert.equal(body.top,'-640px');assert.equal(root.overflow,'hidden')
    first();first();assert.equal(body.position,'fixed');assert.equal(scroll.length,0)
    second();assert.equal(body.position,'relative');assert.equal(body.overflow,'auto')
    assert.equal(root.overscrollBehavior,'contain');assert.equal(root.scrollBehavior,'smooth')
    assert.deepEqual(scroll,[{left:0,top:640,behavior:'instant'}])
  }finally{globalThis.document=oldDocument;globalThis.window=oldWindow}
})
