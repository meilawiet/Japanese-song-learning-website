import { toHiragana } from 'wanakana'

// Offsets refer to displayed lyrics, not the parenthetical annotation text.
const INLINE_KANA = /([\u3400-\u9fff々][\u3400-\u9fff々\u3041-\u3096\u30a1-\u30faー]*)[ \t\u3000]*[（(]([\u3041-\u3096\u30a1-\u30faー\s]+)[）)]/gu

export function extractSourceKana(value) {
  const raw = String(value || '')
  let text = '', cursor = 0
  const readings = []
  for (const match of raw.matchAll(INLINE_KANA)) {
    text += raw.slice(cursor, match.index)
    const start = text.length
    text += match[1]
    readings.push({ start, end: text.length, reading: toHiragana(match[2].replace(/\s+/gu, '')) })
    cursor = match.index + match[0].length
  }
  text += raw.slice(cursor)
  return { text, readings }
}

export function applySourceKana(annotation, line) {
  const hints = Array.isArray(line?.sourceReadings) ? line.sourceReadings : []
  if (!hints.length || !Array.isArray(annotation?.tokens)) return annotation
  const tokens = annotation.tokens
  const offsets = []
  let position = 0
  for (const token of tokens) { offsets.push({ start: position, end: position + token.surface.length }); position += token.surface.length }
  if (position !== line.text.length) return annotation
  const result = []
  for (let index = 0; index < tokens.length;) {
    let last = index
    let groupEnd = offsets[last].end
    let relevant = hints.filter(hint => hint.start < groupEnd && hint.end > offsets[index].start)
    if (!relevant.length) { result.push(tokens[index]); index += 1; continue }
    while (relevant.some(hint => hint.end > groupEnd) && last + 1 < tokens.length) {
      last += 1; groupEnd = offsets[last].end
      relevant = hints.filter(hint => hint.start < groupEnd && hint.end > offsets[index].start)
    }
    const groupStart = offsets[index].start
    let reading = '', cursor = groupStart, valid = true
    for (const hint of relevant.sort((a, b) => a.start - b.start)) {
      if (!Number.isInteger(hint.start) || !Number.isInteger(hint.end) || hint.start < cursor || hint.end > groupEnd || hint.end <= hint.start || typeof hint.reading !== 'string') { valid = false; break }
      const unannotated = line.text.slice(cursor, hint.start)
      if (/[\u3400-\u9fff々]/u.test(unannotated)) { valid = false; break }
      reading += toHiragana(unannotated) + toHiragana(hint.reading)
      cursor = hint.end
    }
    const tail = line.text.slice(cursor, groupEnd)
    if (/[\u3400-\u9fff々]/u.test(tail)) valid = false
    if (valid) result.push({ ...tokens[index], surface: line.text.slice(groupStart, groupEnd), reading: reading + toHiragana(tail), reading_source: 'lyric', needs_review: false })
    else result.push(...tokens.slice(index, last + 1))
    index = last + 1
  }
  return { ...annotation, tokens: result }
}
