// Millisecond arithmetic keeps repeated 0.2-second adjustments exact.
export function formatLyricTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const ms = Math.round(seconds * 1000)
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${(ms % 60000 / 1000).toFixed(3).padStart(6, '0')}`
}

export function parseLyricTime(value) {
  const match = String(value).trim().match(/^(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function shiftLyricTime(value, delta, fallback = null) {
  if (String(value).trim() && parseLyricTime(value) === null) throw new Error('请先填写有效时间，格式为 mm:ss.sss。')
  const seconds = String(value).trim() ? parseLyricTime(value) : fallback
  if (!Number.isFinite(seconds)) throw new Error('无法推算时间，请先手动填写。')
  const ms = Math.max(0, Math.round(seconds * 1000) + Math.round(delta * 1000))
  if (ms > 59999999) throw new Error('时间不能超过 999:59.999。')
  return formatLyricTime(ms / 1000)
}

export function validLyricEnd(line) {
  return line.end == null || Number.isFinite(line.start) && line.start >= 0
    && Number.isFinite(line.end) && line.end > line.start
}
