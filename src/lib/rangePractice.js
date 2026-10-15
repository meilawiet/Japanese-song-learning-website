export const RANGE_REPEAT_COUNTS = Object.freeze([1, 3, 5, 'infinite'])
export const RANGE_GAP_SECONDS = Object.freeze([1, 2, 3])
export const DEFAULT_RANGE_PRACTICE_SETTINGS = Object.freeze({ mode: 'repeat', repeatCount: 1, gapSeconds: 2 })

export function normalizeRangePracticeSettings(value) {
  return {
    mode: value?.mode === 'recall' ? 'recall' : 'repeat',
    repeatCount: RANGE_REPEAT_COUNTS.includes(value?.repeatCount) ? value.repeatCount : 1,
    gapSeconds: RANGE_GAP_SECONDS.includes(value?.gapSeconds) ? value.gapSeconds : 2,
  }
}

export function validRangePracticeSettings(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && ['repeat', 'recall'].includes(value.mode) && RANGE_REPEAT_COUNTS.includes(value.repeatCount)
    && RANGE_GAP_SECONDS.includes(value.gapSeconds)
}

export function rangePracticeTotal(settings) {
  return settings.mode === 'recall' ? 2 : settings.repeatCount
}

export function nextRangePracticeStep(settings, completed) {
  const total = rangePracticeTotal(settings)
  if (total !== 'infinite' && completed >= total) return 'complete'
  return settings.mode === 'recall' ? 'recall' : 'gap'
}

// Monotonic time preserves the remaining silence when paused. Cancellation
// invalidates queued callbacks so an old gap cannot restart a different song.
export class PracticeGapTimer {
  constructor({ onTick, onComplete, now = () => performance.now(),
    schedule = (callback, delay) => setTimeout(callback, delay), cancel = handle => clearTimeout(handle) }) {
    Object.assign(this, { onTick, onComplete, now, schedule, cancel })
    this.running = false
    this.remaining = 0
    this.timer = null
    this.generation = 0
  }

  get remainingMs() { return this.running ? Math.max(0, this.deadline - this.now()) : this.remaining }

  start(milliseconds) {
    this.stop()
    this.remaining = Math.max(0, milliseconds)
    this.resume()
  }

  resume() {
    if (this.running) return
    this.running = true
    this.deadline = this.now() + this.remaining
    const generation = ++this.generation
    const tick = () => {
      if (!this.running || generation !== this.generation) return
      this.timer = null
      this.remaining = this.remainingMs
      this.onTick?.(this.remaining)
      if (!this.running || generation !== this.generation) return
      if (this.remaining <= 0) {
        this.running = false
        this.onComplete()
        return
      }
      this.timer = this.schedule(tick, Math.min(200, this.remaining))
    }
    tick()
  }

  pause() {
    if (!this.running) return
    this.remaining = this.remainingMs
    this.running = false
    this.generation += 1
    if (this.timer != null) this.cancel(this.timer)
    this.timer = null
    this.onTick?.(this.remaining)
  }

  stop() {
    this.pause()
    this.generation += 1
    this.remaining = 0
  }
}
