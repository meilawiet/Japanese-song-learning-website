import test from 'node:test'
import assert from 'node:assert/strict'
import { insertLyricLine } from '../src/lib/songTimeline.js'
const parse = Number, format = String
const original = [{ id: 0, time: '2', text: '一' }, { id: 5, time: '6', text: '二' }]
// 插入后保存时的时间排序仍保留用户指定的位置，且不会复用原句编号。
test('句首、句中与句尾插入都保持时间顺序及原句数据', () => {
  for (const position of [0, 1, 2]) {
    const result = insertLyricLine(original, position, parse, format)
    assert.equal(result[position].id, 6)
    assert.equal(result[position].text, '')
    assert.deepEqual(result.filter(line => line.id !== 6), original)
    assert.deepEqual([...result].sort((a,b) => Number(a.time)-Number(b.time)), result)
  }
  assert.equal(original.length, 2)
})
test('空歌词、相同时刻和毫秒相邻时刻均可插入', () => {
  assert.equal(insertLyricLine([], 0, parse, format)[0].id, 0)
  for (const end of ['0', '0.001']) {
    const result = insertLyricLine([{id:1,time:'0'}, {id:2,time:end}], 1, parse, format)
    assert.deepEqual([...result].sort((a,b) => Number(a.time)-Number(b.time)), result)
  }
})
test('拒绝无效位置与倒序时间，避免保存后新句子跳到错误位置', () => {
  assert.throws(() => insertLyricLine(original, -1, parse, format))
  assert.throws(() => insertLyricLine(original, 3, parse, format))
  assert.throws(() => insertLyricLine([...original].reverse(), 1, parse, format), /时间顺序/)
})
