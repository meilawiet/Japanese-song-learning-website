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
  const { hidden, ...metadata } = changes
  const lineChanges = { text: annotation?.text ?? oldLine.text, ...metadata }
  const updatedSong = { ...song, lines: song.lines.map((line) => line.id === lineId ? { ...line, ...lineChanges } : line) }
  const next = applySongDetailsEdit(song, updatedSong, state)
  const previousTokens = state.annotations?.[songId]?.find((item) => item.id === lineId)?.tokens || []
  const segmentationChanged = annotation && previousTokens.map(token => token.surface).join('\u0000') !== annotation.tokens.map(token => token.surface).join('\u0000')
  if (segmentationChanged && next.aiReviews[songId]) {
    next.aiReviews[songId] = { ...next.aiReviews[songId],
      suggestions: (next.aiReviews[songId].suggestions || []).filter(item => item.line_id !== lineId),
      segmentation_suggestions: (next.aiReviews[songId].segmentation_suggestions || []).filter(item => item.line_id !== lineId) }
  }
  if (annotation) next.annotations[songId] = [...(next.annotations[songId] || []).filter((line) => line.id !== lineId), annotation]
  const prefix = `${songId}:${lineId}:`
  if (annotation) {
    next.progress.corrections = Object.fromEntries(Object.entries(next.progress.corrections).filter(([key]) => !key.startsWith(prefix)))
    annotation.tokens.forEach((token) => {
      if (!token.is_symbol && readings[token.index] !== token.reading) next.progress.corrections[`${prefix}${token.index}`] = readings[token.index]
    })
  }
  if (hidden) {
    next.progress.hiddenReadings = Object.fromEntries(Object.entries(next.progress.hiddenReadings || {}).filter(([key]) => !key.startsWith(prefix)))
    for (const [index, isHidden] of Object.entries(hidden)) if (isHidden) next.progress.hiddenReadings[`${prefix}${index}`] = true
  }
  if (!song.isLocal) {
    const edit = { text: lineChanges.text, translation: lineChanges.translation ?? oldLine.translation ?? '', start: lineChanges.start ?? oldLine.start }
    next.progress.lyricEditsBySong = { ...next.progress.lyricEditsBySong, [songId]: { ...next.progress.lyricEditsBySong?.[songId], [lineId]: edit } }
  }
  return { song: updatedSong, state: next }
}
