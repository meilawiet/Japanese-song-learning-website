import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lyricRangeBounds } from '../src/lib/lyricRange.js'

const lines=[{id:10,start:0.5},{id:21,start:1},{id:35,start:2},{id:57,start:4}]
test('selected lines include the last sentence and use exact timestamps without lead-in',()=>{
  const range=lyricRangeBounds(lines,21,35,6)
  assert.deepEqual(range.lineIds,[21,35]);assert.equal(range.start,1);assert.equal(range.end,4)
  assert.equal(range.count,2);assert.equal(range.error,'')
})
test('reverse selection follows visible order and sparse line IDs',()=>{
  assert.deepEqual(lyricRangeBounds(lines,35,10,6).lineIds,[10,21,35])
  assert.equal(lyricRangeBounds(lines,35,10,6).start,0.5)
})
test('last selected sentence continues to audio end, including the final single line',()=>{
  assert.equal(lyricRangeBounds(lines,35,57,6).end,6)
  assert.equal(lyricRangeBounds(lines,57,57,6).start,4)
  assert.equal(lyricRangeBounds(lines,57,57).end,null)
})
test('duplicate timestamps use the next distinct cue and short intervals stay exact',()=>{
  const duplicate=[{id:0,start:1},{id:1,start:1},{id:2,start:1.04}]
  assert.equal(lyricRangeBounds(duplicate,0,0,2).end,1.04)
  assert.equal(lyricRangeBounds(duplicate,1,2,1.07).end,1.07)
})
test('audio length clamps the range while invalid timestamps and stale IDs fail safely',()=>{
  assert.equal(lyricRangeBounds(lines,21,35,3).end,3)
  assert.match(lyricRangeBounds(lines,57,57,3).error,/超出音频长度/)
  assert.match(lyricRangeBounds([{id:0,start:2},{id:1,start:1}],0,1,5).error,/时间戳无效/)
  assert.equal(lyricRangeBounds(lines,999,21,6),null)
})

test('a selected range uses the last selected sentence manual end without shifting its start', () => {
  const custom = lines.map(line => line.id === 35 ? { ...line, end: 3.6 } : line)
  const range = lyricRangeBounds(custom, 21, 35, 6)
  assert.equal(range.start, 1); assert.equal(range.end, 3.6)
  assert.equal(lyricRangeBounds(custom, 21, 35, 3).end, 3)
})
