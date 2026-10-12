import { lyricSurface, prepareLyricReadings, tokenReading } from './lyricReadings.js'
// 提问时重新取当前歌词与人工读音，避免编辑后仍沿用旧上下文；长歌优先保留当前句附近。
export function buildLyricChatContext(song, lineId, annotations = [], corrections = {}) {
  const index = Math.max(0, song.lines.findIndex(line => line.id === lineId))
  // 原来仅使用本地词典；问 AI 同样遵守人工 > 来源 > 本地的优先级。
  const describe = (line) => ({ id: line.id, text: line.text, readings: (prepareLyricReadings(annotations.find(a => a.id === line.id)?.tokens || [],line.romaji,corrections,song.id,line.id).tokens || []).filter(t => !t.is_symbol).map(t => ({ word: lyricSurface(t), reading: tokenReading(t,corrections,song.id,line.id) })) })
  return { title: song.title, artist: song.artist, current_line: describe(song.lines[index]), nearby_lines: song.lines.slice(Math.max(0, index - 3), index + 4).map(describe), lyrics: song.lines.map(l => l.text).join('\n').slice(0, 24000) }
}

// 历史对话仅保留最近六轮，控制调用大小；歌词作为数据而非指令。
export function buildLyricChatPayload(context, history, question) {
  return { context, conversation: history.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 6000) })), question: question.trim().slice(0, 2000) }
}
