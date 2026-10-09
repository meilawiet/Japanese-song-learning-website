import assert from 'node:assert/strict'
import {test} from 'node:test'
import {DEFAULT_SYNC_SECONDS,parseSyncSeconds,syncSeconds,syncDue} from '../src/lib/webDavSchedule.js'
// 验证真实周期边界，避免配置 60 秒却提前同步或 0 秒产生忙循环。
test('默认一天，支持零与正整数秒，拒绝负数小数和空值',()=>{
  assert.equal(DEFAULT_SYNC_SECONDS,86400);assert.equal(syncSeconds({}),86400)
  for(const value of [0,60,'86400'])assert.equal(parseSyncSeconds(value),Number(value))
  for(const value of [-1,'1.5','','1e3','abc',Infinity])assert.throws(()=>parseSyncSeconds(value))
})
test('按秒检查到期，关闭和零周期均不自动运行',()=>{
  assert.equal(syncDue({auto:true,syncSeconds:60},1000,60999),false)
  assert.equal(syncDue({auto:true,syncSeconds:60},1000,61000),true)
  assert.equal(syncDue({auto:false,syncSeconds:60},1000,999999),false)
  assert.equal(syncDue({auto:true,syncSeconds:0},1000,999999),false)
  assert.equal(syncDue({auto:true},1000,86400999),false)
  assert.equal(syncDue({auto:true},1000,86401000),true)
})
