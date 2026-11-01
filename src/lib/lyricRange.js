import { validLyricEnd } from './lyricTiming.js'

// Line IDs can be sparse after lyric edits. A range follows the visible order,
// includes its last line, and respects its explicit end (otherwise the next distinct cue or EOF).
export function lyricRangeBounds(lines, anchorId, focusId, audioDuration = null) {
  const anchor = lines.findIndex(line => line.id === anchorId)
  const focus = lines.findIndex(line => line.id === focusId)
  if (anchor < 0 || focus < 0) return null
  const firstIndex = Math.min(anchor, focus), lastIndex = Math.max(anchor, focus)
  const selected = lines.slice(firstIndex, lastIndex + 1)
  const first = selected[0], last = selected.at(-1)
  const result = { first, last, lineIds: selected.map(line => line.id), count: selected.length, start: first.start, end: null, error: '' }
  if (selected.some((line, index) => !Number.isFinite(line.start) || line.start < 0 || index > 0 && line.start < selected[index - 1].start)) {
    return { ...result, error: '所选歌词的时间戳无效，请先编辑时间轴。' }
  }
  const next = lines.slice(lastIndex + 1).find(line => Number.isFinite(line.start) && line.start > last.start)
  const duration = Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : null
  if (!validLyricEnd(last)) return { ...result, error: '结束时间必须晚于这一句的开始时间，请先编辑时间轴。' }
  result.end = last.end ?? (next ? next.start : duration)
  if (duration != null && result.end != null) result.end = Math.min(result.end, duration)
  if (result.end != null && result.end <= result.start) result.error = '所选起点已超出音频长度，请检查时间轴。'
  return result
}
