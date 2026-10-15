import { parseTimedLyrics } from './timedLyrics.js'

// Preserve the platform's known original/translation/romaji roles rather than
// sending the merged tracks back through language-based classification.
export function platformLyricsRecordToFile(record) {
  const lines = parseTimedLyrics(record.lyrics, record.title, record.artist)
  if (!lines.length) throw new Error('这份歌词没有可导入的正文，请选择其他版本。')
  const document = { format: 'uta-annotated-lyrics', version: 1, title: record.title, artist: record.artist, timed: true,
    lines: lines.map(line => ({ ...line, segments: [{ surface: line.text }] })) }
  const base = `${record.title}-${record.artist}`.replace(/[\\/:*?"<>|]/gu, '_').slice(0, 100)
  const file = new File([JSON.stringify(document)], `${base}.uta-lyrics.json`, { type: 'application/json' })
  file.sourceWarnings = record.sourceWarnings || []
  return file
}
