import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSingleLineRepeatCount, validSingleLineRepeatCount, singleLinePlaybackBounds } from '../src/lib/singleLinePlayback.js'

test('single-line repeat preferences accept finite counts and infinity, with safe legacy defaults', () => {
  for (const count of [1, 2, 4, 10, 99, 'infinite']) {
    assert.equal(validSingleLineRepeatCount(count), true)
    assert.equal(normalizeSingleLineRepeatCount(count), count)
  }
  for (const value of [undefined, null, 0, -1, 100, 2.5, Infinity, '3', {}, true]) {
    assert.equal(validSingleLineRepeatCount(value), false)
    assert.equal(normalizeSingleLineRepeatCount(value), 1)
  }
})

test('single-line boundaries keep the lead-in, skip duplicate timestamps, and end at audio EOF', () => {
  const lines = [{ id: 7, start: 0.3 }, { id: 20, start: 0.3 }, { id: 42, start: 2 }]
  assert.deepEqual(singleLinePlaybackBounds(lines, 7, 4), { lineId: 7, start: 0, end: 2 })
  assert.deepEqual(singleLinePlaybackBounds(lines, 20, 4), { lineId: 20, start: 0, end: 2 })
  assert.deepEqual(singleLinePlaybackBounds(lines, 42, 4), { lineId: 42, start: 1.5, end: 4 })
  assert.equal(singleLinePlaybackBounds(lines, 99, 4), null)
  assert.equal(singleLinePlaybackBounds(lines, 42, 1), null)
  assert.equal(singleLinePlaybackBounds(lines, 42, Infinity), null)
  assert.equal(singleLinePlaybackBounds([{ id: 7, start: NaN }], 7, 4), null)
})

test('manual sentence ends control single-line loops and remain clamped to audio duration', () => {
  const lines = [{ id: 0, start: 1, end: 3.8 }, { id: 1, start: 5, end: 9 }]
  assert.deepEqual(singleLinePlaybackBounds(lines, 0, 10), { lineId: 0, start: 0.5, end: 3.8 })
  assert.deepEqual(singleLinePlaybackBounds(lines, 1, 8), { lineId: 1, start: 4.5, end: 8 })
  assert.deepEqual(singleLinePlaybackBounds([{ ...lines[0], end: null }, lines[1]], 0, 10), { lineId: 0, start: 0.5, end: 5 })
  assert.equal(singleLinePlaybackBounds([{ id: 0, start: 2, end: 1 }], 0, 10), null)
})
