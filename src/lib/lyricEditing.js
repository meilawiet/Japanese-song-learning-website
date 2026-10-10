import { reconcileLearningState } from './learningIdentity.js'

// 项目内歌曲的人工歌词只覆盖当前设备；本地导入歌曲仍写入歌曲库。
export function applyLyricEdits(song, editsBySong = {}) {
  const edits = editsBySong[song.id]
  if (!edits || song.isLocal) return song
  // 原来仅支持字符串歌词；旧记录仍兼容，新记录可同时保存翻译（含留空）。
  return { ...song, lines: song.lines.map((line) => {
    const edit = edits[line.id]
    if (typeof edit === 'string') return { ...line, text: edit }
    return edit && typeof edit.text === 'string' ? { ...line, text: edit.text, ...(typeof edit.translation === 'string' ? { translation: edit.translation } : {}) } : line
  }) }
}

// 只替换被编辑句子的读音与词索引，其他句子的掌握记录继续保留。
// translation 未传入时保留旧行为，传入空字符串时清空翻译。
export function commitEditedLine(songs, state, songId, lineId, annotation, readings, translation) {
  const song = songs.find((item) => item.id === songId)
  if (!song || !song.lines.some((line) => line.id === lineId)) throw new Error('找不到要编辑的歌词。')
  // 原来只替换 text，翻译编辑不影响时间、罗马音及其他句子。
  const updatedSong = { ...song, lines: song.lines.map((line) => line.id === lineId ? { ...line, text: annotation.text, ...(typeof translation === 'string' ? { translation } : {}) } : line) }
  const next = reconcileLearningState(songs.map((item) => item.id === songId ? updatedSong : item), state)
  next.annotations[songId] = [...(next.annotations[songId] || []).filter((line) => line.id !== lineId), annotation]
  const prefix = `${songId}:${lineId}:`
  next.progress.corrections = Object.fromEntries(Object.entries(next.progress.corrections).filter(([key]) => !key.startsWith(prefix)))
  annotation.tokens.forEach((token) => {
    if (!token.is_symbol && readings[token.index] !== token.reading) next.progress.corrections[`${prefix}${token.index}`] = readings[token.index]
  })
  // 原项目歌曲覆盖值为 annotation.text；传入翻译时保存对象，兼容旧字符串。
  if (!song.isLocal) next.progress.lyricEditsBySong = { ...next.progress.lyricEditsBySong, [songId]: { ...next.progress.lyricEditsBySong?.[songId], [lineId]: typeof translation === 'string' ? { text: annotation.text, translation } : annotation.text } }
  return { song: updatedSong, state: next }
}
