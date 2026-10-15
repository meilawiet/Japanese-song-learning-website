export const PLAYBACK_RATES = Object.freeze([0.25, 0.5, 0.75, 1])
export const LEGACY_FAST_RATES = Object.freeze([1.25, 1.5])

// Older installations may have remembered a fast rate. Learning now uses
// normal speed or slow playback; opening old data safely returns to 1x.
export function normalizePlaybackRate(value) {
  return PLAYBACK_RATES.includes(value) ? value : 1
}
