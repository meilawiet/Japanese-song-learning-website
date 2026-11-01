import { toHiragana, toKatakana, toRomaji } from 'wanakana'
import { correctionKey } from './ruby.js'

export const DEFAULT_LYRIC_FONT_SIZE = 21

export function normalizeLyricFontSize(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(40, Math.max(14, Math.round(value))) : DEFAULT_LYRIC_FONT_SIZE
}

export const DEFAULT_READING_FONT_SIZE = 10

export function normalizeReadingFontSize(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(24, Math.max(8, Math.round(value))) : DEFAULT_READING_FONT_SIZE
}

export const DEFAULT_LINE_READING_FONT_SIZE = 11

export function normalizeLineReadingFontSize(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(24, Math.max(8, Math.round(value))) : DEFAULT_LINE_READING_FONT_SIZE
}

export const DEFAULT_TRANSLATION_FONT_SIZE = 12

export function normalizeTranslationFontSize(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(24, Math.max(10, Math.round(value))) : DEFAULT_TRANSLATION_FONT_SIZE
}

export function normalizeReadingStyle(style) {
  return style === 'romaji' || style === 'both' ? style : 'hiragana'
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
  // Android's literal manual annotations are already display text, even when
  // they contain kana. Converting them would silently change user intent.
  if (token?.manual_reading_mode === 'literal') return reading
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

export function lyricSurface(token) {
  return typeof token?.display_surface === 'string' ? token.display_surface : token?.surface || ''
}

export function tokenHasManualReading(token, corrections = {}, key) {
  return token?.manual_group_reading != null || Object.hasOwn(corrections, key)
}

// A present empty correction means "no annotation". Keep that distinct from
// missing data, and preserve the Android priority of whole-group corrections.
export function tokenReading(token, corrections = {}, key, style = 'hiragana', options = {}) {
  if (tokenHasManualReading(token, corrections, key)) {
    if (options.showManualReadings === false) return ''
    return token.manual_group_reading ?? corrections[key]
  }
  if (token?.source_reading != null) {
    if (options.showSourceReadings === false) return ''
    const source = style === 'romaji' ? token.source_pronunciation ?? token.source_reading : token.source_reading
    // Preserve written particle kana while romanization uses source pronunciation.
    if (style !== 'romaji' && token.part_of_speech?.split('・')[0] === '助詞') {
      const surface = lyricSurface(token)
      if (({ は: ['は', 'わ'], へ: ['へ', 'え'], を: ['を', 'お'] })[surface]?.includes(source)) return surface
    }
    return source
  }
  return token?.reading ?? ''
}

export function lineReading(tokens, corrections, songId, lineId, style = 'hiragana') {
  return tokens?.filter((token) => !token.is_symbol).map((token) => {
    const key = correctionKey(songId, lineId, token.index)
    const manual = tokenHasManualReading(token, corrections, key)
    return displayReading(tokenReading(token, corrections, key, style), style, token, manual || token.source_reading != null)
  }).filter(Boolean).join(' ') || ''
}
