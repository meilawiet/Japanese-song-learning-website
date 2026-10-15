import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RANGE_PRACTICE_SETTINGS, normalizeRangePracticeSettings, validRangePracticeSettings,
  rangePracticeTotal, nextRangePracticeStep, PracticeGapTimer } from '../src/lib/rangePractice.js'

function clock() {
  let time = 0, nextId = 0
  const tasks = new Map()
  return {
    now: () => time,
    schedule: (callback, delay) => { const id = ++nextId; tasks.set(id, { callback, at:time + delay }); return id },
    cancel: id => tasks.delete(id), tasks,
    advance(milliseconds) {
      const target = time + milliseconds
      for (;;) {
        const next = [...tasks.entries()].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        tasks.delete(next[0]); time = next[1].at; next[1].callback()
      }
      time = target
    },
  }
}

test('legacy data keeps one pass; invalid preferences normalize without mutating input', () => {
  assert.deepEqual(normalizeRangePracticeSettings(undefined), DEFAULT_RANGE_PRACTICE_SETTINGS)
  const input = { mode:'invalid', repeatCount:2, gapSeconds:10 }
  assert.deepEqual(normalizeRangePracticeSettings(input), DEFAULT_RANGE_PRACTICE_SETTINGS)
  assert.deepEqual(input, { mode:'invalid', repeatCount:2, gapSeconds:10 })
  assert.ok(validRangePracticeSettings({ mode:'recall', repeatCount:'infinite', gapSeconds:3 }))
  for (const value of [null, [], {}, { mode:'repeat', repeatCount:'3', gapSeconds:1 }, { mode:'repeat', repeatCount:3, gapSeconds:0 }]) assert.equal(validRangePracticeSettings(value), false)
})

test('three and five passes include the first playback and finish without an extra gap', () => {
  for (const repeatCount of [1, 3, 5]) {
    const settings = { ...DEFAULT_RANGE_PRACTICE_SETTINGS, repeatCount }
    assert.equal(rangePracticeTotal(settings), repeatCount)
    for (let completed = 1; completed < repeatCount; completed++) assert.equal(nextRangePracticeStep(settings, completed), 'gap')
    assert.equal(nextRangePracticeStep(settings, repeatCount), 'complete')
  }
})

test('infinite repetition has no implicit completion limit; recall listens exactly twice', () => {
  const infinite = { ...DEFAULT_RANGE_PRACTICE_SETTINGS, repeatCount:'infinite' }
  for (const count of [1, 3, 5, 1000]) assert.equal(nextRangePracticeStep(infinite, count), 'gap')
  const recall = { ...infinite, mode:'recall' }
  assert.equal(rangePracticeTotal(recall), 2)
  assert.equal(nextRangePracticeStep(recall, 1), 'recall')
  assert.equal(nextRangePracticeStep(recall, 2), 'complete')
})

test('one to three second gaps complete once at the requested deadline', () => {
  for (const seconds of [1, 2, 3]) {
    const fake = clock(), ticks = []
    let completions = 0
    const timer = new PracticeGapTimer({ ...fake, onTick:value => ticks.push(value), onComplete:() => completions++ })
    timer.start(seconds * 1000)
    fake.advance(seconds * 1000 - 1)
    assert.equal(completions, 0)
    fake.advance(1)
    assert.equal(completions, 1)
    assert.equal(ticks.at(-1), 0)
    fake.advance(10000)
    assert.equal(completions, 1)
  }
})

test('pausing silence preserves its remaining time and does not restart the full gap', () => {
  const fake = clock()
  let completions = 0
  const timer = new PracticeGapTimer({ ...fake, onComplete:() => completions++ })
  timer.start(2000)
  fake.advance(750)
  timer.pause()
  assert.equal(timer.remainingMs, 1250)
  fake.advance(10000)
  assert.equal(completions, 0)
  assert.equal(timer.remainingMs, 1250)
  timer.resume()
  fake.advance(1249)
  assert.equal(completions, 0)
  fake.advance(1)
  assert.equal(completions, 1)
})

test('stopped and replaced gaps ignore callbacks that were already queued', () => {
  const fake = clock()
  let completions = 0
  const timer = new PracticeGapTimer({ ...fake, onComplete:() => completions++ })
  timer.start(1000)
  const queued = [...fake.tasks.values()][0].callback
  timer.stop()
  queued()
  fake.advance(2000)
  assert.equal(completions, 0)
  timer.start(1000)
  const pending = fake.tasks.size
  queued()
  assert.equal(fake.tasks.size, pending)
  fake.advance(1000)
  assert.equal(completions, 1)
})

test('cancellation from a tick callback cannot run the completion callback afterwards', () => {
  const fake = clock()
  let completions = 0
  const timer = new PracticeGapTimer({ ...fake, onTick:remaining => { if (!remaining) timer.stop() }, onComplete:() => completions++ })
  timer.start(1000)
  fake.advance(2000)
  assert.equal(completions, 0)
})

test('default timer callbacks do not use the practice object as a native timer receiver', () => {
  const fake = clock(), nativeTimeout = globalThis.setTimeout, nativeClear = globalThis.clearTimeout
  let completions = 0
  globalThis.setTimeout = function (callback, delay) {
    assert.ok(this == null || this === globalThis, 'A browser timer rejects an unrelated receiver')
    return fake.schedule(callback, delay)
  }
  globalThis.clearTimeout = function (handle) {
    assert.ok(this == null || this === globalThis, 'A browser timer rejects an unrelated receiver')
    return fake.cancel(handle)
  }
  try {
    const timer = new PracticeGapTimer({ now:fake.now, onComplete:() => completions++ })
    timer.start(1000)
    fake.advance(1000)
    assert.equal(completions, 1)
    timer.start(1000)
    timer.stop()
    fake.advance(1000)
    assert.equal(completions, 1)
  } finally {
    globalThis.setTimeout = nativeTimeout
    globalThis.clearTimeout = nativeClear
  }
})
