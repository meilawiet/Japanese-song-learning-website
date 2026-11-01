import { lyricRangeBounds } from './lyricRange.js'

export const SINGLE_LINE_REPEAT_PRESETS = Object.freeze([1, 2, 3, 5, 10])
export const MAX_SINGLE_LINE_REPEATS = 99

export function validSingleLineRepeatCount(value) {
  return value === 'infinite' || Number.isInteger(value) && value >= 1 && value <= MAX_SINGLE_LINE_REPEATS
}

export function normalizeSingleLineRepeatCount(value) {
  return validSingleLineRepeatCount(value) ? value : 1
}

// Keep the original single-line lead-in, while sharing the range player's
// distinct-timestamp and audio-end handling. A zero-length clip cannot loop.
export function singleLinePlaybackBounds(lines, lineId, duration) {
  const range = lyricRangeBounds(lines, lineId, lineId, duration)
  if (!range || range.error || !Number.isFinite(range.end)) return null
  const start = Math.max(0, range.start - 0.5)
  return range.end > range.start && range.end > start ? { lineId, start, end: range.end } : null
}
