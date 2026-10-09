import { reconcileLearningState } from './learningIdentity.js'

// 项目内歌曲的人工歌词只覆盖当前设备；本地导入歌曲仍写入歌曲库。
export function applyLyricEdits(song, editsBySong = {}) {
  const edits = editsBySong[song.id]
  if (!edits || song.isLocal) return song
  return { ...song, lines: song.lines.map((line) => typeof edits[line.id] === 'string' ? { ...line, text: edits[line.id] } : line) }
}

// 只替换被编辑句子的读音与词索引，其他句子的掌握记录继续保留。
export function commitEditedLine(songs, state, songId, lineId, annotation, readings) {
  const song = songs.find((item) => item.id === songId)
  if (!song || !song.lines.some((line) => line.id === lineId)) throw new Error('找不到要编辑的歌词。')
  const updatedSong = { ...song, lines: song.lines.map((line) => line.id === lineId ? { ...line, text: annotation.text } : line) }
  const next = reconcileLearningState(songs.map((item) => item.id === songId ? updatedSong : item), state)
  next.annotations[songId] = [...(next.annotations[songId] || []).filter((line) => line.id !== lineId), annotation]
  const prefix = `${songId}:${lineId}:`
  next.progress.corrections = Object.fromEntries(Object.entries(next.progress.corrections).filter(([key]) => !key.startsWith(prefix)))
  annotation.tokens.forEach((token) => {
    if (!token.is_symbol && readings[token.index] !== token.reading) next.progress.corrections[`${prefix}${token.index}`] = readings[token.index]
  })
  if (!song.isLocal) next.progress.lyricEditsBySong = { ...next.progress.lyricEditsBySong, [songId]: { ...next.progress.lyricEditsBySong?.[songId], [lineId]: annotation.text } }
  return { song: updatedSong, state: next }
}
