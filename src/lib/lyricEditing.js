import { validLyricEnd, reorderEditedLyricTimes } from './lyricTiming.js'
import { applySongDetailsEdit } from './songDetailsEditing.js'

// 项目内歌曲的人工歌词只覆盖当前设备；本地导入歌曲仍写入歌曲库。
export function applyLyricEdits(song, editsBySong = {}) {
  const edits = editsBySong[song.id]
  if (!edits || song.isLocal) return song
  return { ...song, lines: song.lines.map((line) => {
    const edit = edits[line.id]
    return typeof edit === 'string' ? { ...line, text: edit, romaji: edit === line.text ? line.romaji : '' } : edit && typeof edit === 'object' ? { ...line, ...edit, romaji: edit.text === line.text ? line.romaji : '' } : line
  }) }
}

// 只替换被编辑句子的读音与词索引，其他句子的掌握记录继续保留。
export function commitEditedLine(songs, state, songId, lineId, annotation, readings, changes = {}) {
  const song = songs.find((item) => item.id === songId)
  if (!song || !song.lines.some((line) => line.id === lineId)) throw new Error('找不到要编辑的歌词。')
  const oldLine = song.lines.find((line) => line.id === lineId)
  const { hidden, reorderTimes, ...metadata } = changes
  const lineChanges = { text: annotation?.text ?? oldLine.text, ...metadata }
  const updatedSong = { ...song, lines: song.lines.map((line) => line.id === lineId ? { ...line, ...lineChanges } : line) }
  if (!validLyricEnd(updatedSong.lines.find(line => line.id === lineId))) throw new Error('结束时间必须晚于开始时间。')
  if (reorderTimes && song.isLocal) updatedSong.lines = reorderEditedLyricTimes(song.lines, updatedSong.lines)
  const next = applyLineReadingDrafts(applySongDetailsEdit(song, updatedSong, state), songId,
    [{ lineId, annotation, readings, hidden }], state.annotations?.[songId])
  if (!song.isLocal) {
    const edit = { text: lineChanges.text, translation: lineChanges.translation ?? oldLine.translation ?? '', start: Object.hasOwn(lineChanges, 'start') ? lineChanges.start : oldLine.start, end: Object.hasOwn(lineChanges, 'end') ? lineChanges.end : oldLine.end ?? null }
    next.progress.lyricEditsBySong = { ...next.progress.lyricEditsBySong, [songId]: { ...next.progress.lyricEditsBySong?.[songId], [lineId]: edit } }
  }
  return { song: updatedSong, state: next }
}


// Install drafts only after the owning song edit succeeds. Remap token-index
// overrides for edited lines while keeping mastery and review items by line ID.
export function applyLineReadingDrafts(state, songId, drafts, previous = state.annotations?.[songId]) {
  if (!drafts.length) return state
  const next = {
    ...state,
    annotations: { ...state.annotations },
    aiReviews: { ...state.aiReviews },
    progress: { ...state.progress, corrections: { ...state.progress.corrections }, hiddenReadings: { ...state.progress.hiddenReadings } },
  }
  for (const { lineId, annotation, readings, hidden } of drafts) {
    const previousTokens = previous?.find(line => line.id === lineId)?.tokens || []
    const segmentationChanged = annotation && previousTokens.map(token => token.surface).join('\u0000')
      !== annotation.tokens.map(token => token.surface).join('\u0000')
    if (segmentationChanged && next.aiReviews[songId]) {
      const review = next.aiReviews[songId]
      next.aiReviews[songId] = { ...review,
        suggestions: (review.suggestions || []).filter(item => item.line_id !== lineId),
        segmentation_suggestions: (review.segmentation_suggestions || []).filter(item => item.line_id !== lineId),
      }
    }
    const prefix = songId + ':' + lineId + ':'
    if (annotation) {
      next.annotations[songId] = [...(next.annotations[songId] || []).filter(line => line.id !== lineId), annotation]
      for (const key of Object.keys(next.progress.corrections)) {
        if (key.startsWith(prefix)) delete next.progress.corrections[key]
      }
      for (const token of annotation.tokens) {
        if (!token.is_symbol && Object.hasOwn(readings, token.index) && readings[token.index] !== token.reading) {
          next.progress.corrections[prefix + token.index] = readings[token.index]
        }
      }
    }
    if (hidden) {
      for (const key of Object.keys(next.progress.hiddenReadings)) {
        if (key.startsWith(prefix)) delete next.progress.hiddenReadings[key]
      }
      for (const [index, isHidden] of Object.entries(hidden)) if (isHidden) next.progress.hiddenReadings[prefix + index] = true
    }
  }
  return next
}
