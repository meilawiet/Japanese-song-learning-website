// 检查用户指定方向、纵向滚动判定、轻扫速度与边界，避免误跳页或越过两个页面。
import test from 'node:test'
import assert from 'node:assert/strict'
import {swipeAxis,swipeDestination,swipeOffset} from '../src/lib/homeSwipe.js'
// 原坐标映射与用户现场操作预期相反，本轮按要求整体对调并检查端点。
test('现场反馈后整体对调物理坐标映射，端点不循环穿过另一侧',()=>{
  assert.equal(swipeDestination('review',130,0,390),'learn')
  assert.equal(swipeDestination('review',-130,0,390),'mine')
  assert.equal(swipeDestination('learn',300,1,390),'learn')
  assert.equal(swipeDestination('mine',-300,-1,390),'mine')
  assert.equal(swipeDestination('learn',-1000,-3,390),'review')
})
test('短拖动回弹、有效快速轻扫切页、反向速度和取消不误跳',()=>{
  assert.equal(swipeDestination('review',-20,-1,390),'review')
  assert.equal(swipeDestination('review',-35,-.8,390),'mine')
  assert.equal(swipeDestination('review',-35,.8,390),'review')
  assert.equal(swipeDestination('review',-300,-1,390,true),'review')
  assert.equal(swipeDestination('review',-300,-1,0),'review')
})
test('纵向和斜向优先原滚动，小抖动不锁轴，端点有阻尼且最多移动一屏',()=>{
  assert.equal(swipeAxis(8,5),null)
  assert.equal(swipeAxis(40,60),'vertical')
  assert.equal(swipeAxis(60,55),'vertical')
  assert.equal(swipeAxis(60,15),'horizontal')
  assert.equal(swipeOffset('review',-600,390),-390)
  assert.equal(swipeOffset('mine',-100,390),-18)
  assert.equal(swipeOffset('learn',100,390),18)
})
