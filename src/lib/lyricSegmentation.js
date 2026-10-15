import { toHiragana } from 'wanakana'

// 1.1.24 marked every token in an edited sentence as locked. Use the marker on
// changed groups so untouched dictionary tokens can still receive AI proposals.
export function isManuallySegmentedToken(token) {
  return Boolean(token?.segmentation_user_changed || token?.reading_source === 'manual-segmentation')
}

export function lyricGraphemes(text) {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })
  return [...segmenter.segment(text)].map(({ segment, index }) => ({ text: segment, start: index, end: index + segment.length }))
}

// Keep punctuation and whitespace separate so a click cannot turn them into
// part of a spoken word. All other boundaries can be toggled independently.
export function fixedLyricBoundaries(text) {
  const graphemes = lyricGraphemes(text)
  const word = (value) => /^[\p{L}\p{N}々ー]+$/u.test(value)
  return new Set(graphemes.slice(0, -1).filter((item, index) => !word(item.text) || !word(graphemes[index + 1].text)).map(item => item.end))
}

export function tokenBoundaries(text, tokens) {
  if ((tokens || []).map(token => token.surface).join('') !== text) throw new Error('歌词与注音不一致，请先重新注音。')
  let offset = 0
  const boundaries = new Set(fixedLyricBoundaries(text))
  for (const token of tokens) { offset += token.surface.length; if (offset < text.length) boundaries.add(offset) }
  return boundaries
}

export function suggestedTokenBoundaries(text, tokens, suggestion) {
  const boundaries = tokenBoundaries(text, tokens)
  if (!suggestion) return boundaries
  const first = tokens.findIndex(token => token.index === suggestion.start_token_index)
  const last = tokens.findIndex(token => token.index === suggestion.end_token_index)
  if (first < 0 || last < first || JSON.stringify(tokens.slice(first, last + 1).map(token => token.surface)) !== JSON.stringify(suggestion.original_segments)
    || !Array.isArray(suggestion.suggested_segments) || suggestion.suggested_segments.join('') !== suggestion.original_segments.join('')) return boundaries
  const start = tokens.slice(0, first).reduce((sum, token) => sum + token.surface.length, 0)
  const end = start + suggestion.original_segments.join('').length
  const fixed = fixedLyricBoundaries(text)
  for (const offset of [...boundaries]) if (offset > start && offset < end && !fixed.has(offset)) boundaries.delete(offset)
  let offset = start
  for (const surface of suggestion.suggested_segments.slice(0, -1)) {
    offset += surface.length
    if (offset > start && offset < end) boundaries.add(offset)
  }
  return boundaries
}

export function segmentSurfaces(text, boundaries) {
  const allowed = new Set(lyricGraphemes(text).map(item => item.end))
  const fixed = fixedLyricBoundaries(text)
  if ([...boundaries].some(offset => !allowed.has(offset)) || [...fixed].some(offset => !boundaries.has(offset))) throw new Error('分词边界无效。')
  const ends = [...new Set([...boundaries, text.length])].sort((a, b) => a - b)
  let start = 0
  return ends.map(end => { const result = { start, end, surface: text.slice(start, end) }; start = end; return result })
}

export function buildSegmentedTokens(tokens, readings, hidden, surfaces, sourceReadings = []) {
  let offset = 0
  const old = tokens.map(token => {
    const item = { ...token, start: offset, end: offset + token.surface.length }
    offset = item.end
    return item
  })
  if (surfaces.map(part => part.surface).join('') !== old.map(token => token.surface).join('')) throw new Error('分词结果与歌词不一致。')
  const nextReadings = {}, nextHidden = {}, needsGeneration = []
  const nextTokens = surfaces.map((part, index) => {
    const overlapping = old.filter(token => token.start < part.end && token.end > part.start)
    const exact = overlapping.length === 1 && overlapping[0].start === part.start && overlapping[0].end === part.end
    const whole = overlapping.length > 1 && overlapping[0].start === part.start && overlapping.at(-1).end === part.end
    const isSymbol = !/[\p{L}\p{N}々ー]/u.test(part.surface)
    const hint = sourceReadings.find(item => item.start === part.start && item.end === part.end)
    let token
    if (exact) {
      const { start, end, ...previous } = overlapping[0]
      token = { ...previous, index }
      nextReadings[index] = readings[overlapping[0].index] ?? overlapping[0].reading
    } else if (whole) {
      token = { index, surface: part.surface, reading: overlapping.map(item => item.reading || '').join(''), is_symbol: isSymbol, reading_source: 'manual-segmentation', segmentation_locked: true, segmentation_user_changed: true }
      nextReadings[index] = overlapping.map(item => readings[item.index] ?? item.reading ?? '').join('')
    } else {
      const source = typeof hint?.reading === 'string' ? toHiragana(hint.reading) : ''
      const direct = /^[\u3040-\u30ffー]+$/u.test(part.surface) ? toHiragana(part.surface) : /^[A-Za-z0-9]+$/u.test(part.surface) ? part.surface : ''
      token = { index, surface: part.surface, reading: source || direct, is_symbol: isSymbol, reading_source: source ? 'lyric' : 'manual-segmentation', segmentation_locked: true, segmentation_user_changed: true }
      nextReadings[index] = token.reading
      if (!isSymbol && !token.reading) needsGeneration.push(index)
    }
    if (overlapping.some(item => hidden[item.index])) nextHidden[index] = true
    return token
  })
  return { tokens: nextTokens, readings: nextReadings, hidden: nextHidden, needsGeneration }
}
