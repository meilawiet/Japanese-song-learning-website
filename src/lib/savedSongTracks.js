import { compileLrcCues, formatLrcTime } from './lrcReview.js'
import { validLyricEnd } from './lyricTiming.js'

// Reopen exactly the saved tracks. Never infer their language or guess a new split.
export function savedSongTrackCues(lines) {
  return lines.flatMap(line => {
    const originalId = `saved-${line.id}-original`
    const timeText = line.time ?? (Number.isFinite(line.start) ? formatLrcTime(line.start) : '')
    return ['original', 'translation', 'romaji'].flatMap(track => {
      const text = track === 'original' ? line.text : line[track]
      if (track !== 'original' && !String(text || '').trim()) return []
      return [{ id: `saved-${line.id}-${track}`, timeText, text: text || '', track,
        sourceLineId: line.id, sourceField: track, reviewed: true, reviewReason: '',
        ...(track !== 'original' ? { targetCueId: originalId } : {}) }]
    })
  })
}

export function compileSavedSongTracks(cues, previousLines) {
  const compiled = compileLrcCues(cues, { mode: 'saved' })
  const byId = new Map(previousLines.map(line => [line.id, line]))
  const byCue = new Map(cues.map(cue => [cue.id, cue]))
  const used = new Set(), issues = [...compiled.issues]
  let nextId = Math.max(-1, ...previousLines.map(line => line.id)) + 1
  const lines = compiled.lines.map(({ sourceId, id: ignored, ...line }) => {
    const cue = byCue.get(sourceId)
    const original = cue?.sourceField === 'original' ? byId.get(cue.sourceLineId) : null
    // Display numbers are derived from the current order, never stored as identity.
    const { time, displayNumber, romaji, sourceReadings, ...metadata } = original || {}
    const id = original && !used.has(original.id) ? original.id : nextId++
    used.add(id)
    const result = { ...metadata, ...line, id, romaji: line.romaji || '',
      ...(original?.text === line.text && sourceReadings ? { sourceReadings } : {}) }
    if (!validLyricEnd(result)) issues.push({ cueId: sourceId, kind: 'error', message: '结束时间必须晚于开始时间；请先取消轨道调整，在单句编辑中校正起止时间。' })
    return result
  })
  return { lines, issues }
}
