import { toHiragana, toKatakana, toRomaji } from 'wanakana'
import { correctionKey } from './ruby.js'

export const DEFAULT_READING_FONT_SIZE = 10

export function normalizeReadingFontSize(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(24, Math.max(8, Math.round(value))) : DEFAULT_READING_FONT_SIZE
}

export function normalizeReadingStyle(style) {
  return style === 'romaji' ? 'romaji' : 'hiragana'
}

// Prefer readable loanword spellings over keyboard-input spellings (e.g. ti,
// fa, not tei, fua). Long vowels are written out: ou, oo, uu, etc.
const customRomajiMapping = {
  てぃ: 'ti', でぃ: 'di', とぅ: 'tu', どぅ: 'du',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', ふゅ: 'fyu',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo', ゔゅ: 'vyu',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
}

// Convert only reading fields, never lyrics, Chinese explanations or stored
// corrections. Non-kana characters in mixed readings are left untouched.
export function displayReading(value, style = 'hiragana', token = null, corrected = false) {
  const reading = String(value || '')
  if (normalizeReadingStyle(style) !== 'romaji') return reading
  if (!corrected && token?.part_of_speech?.split('・')[0] === '助詞') {
    const particles = { は: 'wa', へ: 'e', を: 'o' }
    if (particles[token.surface] && toHiragana(reading) === token.surface) return particles[token.surface]
  }
  return reading.replace(/[\u3041-\u3096\u3099-\u309c\u30a1-\u30fa\u30fc\uff66-\uff9f]+/gu, (kana) => {
    const katakana = toKatakana(kana.normalize('NFKC'), { passRomaji: true })
    // A final small tsu is a clipped stop, not a silent character.
    const trailingStops = katakana.match(/ッ+$/u)?.[0] || ''
    const body = trailingStops ? katakana.slice(0, -trailingStops.length) : katakana
    return toRomaji(body, { customRomajiMapping }) + "'".repeat(trailingStops.length)
  })
}

export function lineReading(tokens, corrections, songId, lineId, style = 'hiragana') {
  return tokens?.filter((token) => !token.is_symbol).map((token) => {
    const correction = corrections[correctionKey(songId, lineId, token.index)]
    return displayReading(correction || token.reading, style, token, Boolean(correction))
  }).filter(Boolean).join(' ') || ''
}
