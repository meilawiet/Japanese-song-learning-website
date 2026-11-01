import test from 'node:test'
import assert from 'node:assert/strict'
import { formatLyricTime, parseLyricTime, shiftLyricTime, validLyricEnd } from '../src/lib/lyricTiming.js'

test('time formatting carries rounded milliseconds across minute boundaries', () => {
  assert.equal(formatLyricTime(59.9996), '01:00.000')
  assert.equal(formatLyricTime(61.2), '01:01.200')
  assert.equal(formatLyricTime(null), '')
  assert.equal(formatLyricTime(NaN), '')
  assert.equal(parseLyricTime('01:23.456'), 83.456)
  for (const value of ['', '1:60.0', '-00:01', 'Infinity', '1000:00.000']) assert.equal(parseLyricTime(value), null)
})

test('0.2-second steps keep exact milliseconds and clamp below zero', () => {
  let value = '00:59.900'
  for (let i = 0; i < 10; i++) value = shiftLyricTime(value, 0.2)
  assert.equal(value, '01:01.900')
  for (let i = 0; i < 10; i++) value = shiftLyricTime(value, -0.2)
  assert.equal(value, '00:59.900')
  assert.equal(shiftLyricTime('00:00.100', -0.2), '00:00.000')
  assert.equal(shiftLyricTime('', -0.2, 4), '00:03.800')
  assert.throws(() => shiftLyricTime('bad', 0.2, 4), /有效时间/)
  assert.throws(() => shiftLyricTime('', 0.2), /手动填写/)
  assert.throws(() => shiftLyricTime('999:59.999', 0.2), /不能超过/)
})

test('optional end supports legacy data and rejects invalid or untimed intervals', () => {
  for (const line of [{ start: 1 }, { start: null, end: null }, { start: 1, end: 1.2 }]) assert.equal(validLyricEnd(line), true)
  for (const line of [{ start: 1, end: 1 }, { start: 1, end: 0 }, { start: null, end: 3 }, { start: 1, end: '3' }, { start: 1, end: Infinity }]) assert.equal(validLyricEnd(line), false)
})
