import { toHiragana, toKatakana, toRomaji } from 'wanakana'
import { correctionKey } from './ruby.js'

export function normalizeReadingStyle(style) {
  // 原二选一：return style === 'romaji' ? 'romaji' : 'hiragana'
  // 同时显示作为独立设置持久保存，旧设置仍然兼容。
  return ['romaji', 'both'].includes(style) ? style : 'hiragana'
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
  // 同时显示时，短读音用于详情与无障碍提示；歌词整句另外分行。
  if (style === 'both') return reading ? `${reading} / ${displayReading(reading, 'romaji', token, corrected)}` : ''
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

// 可选的整句罗马音优先用于罗马音行，不把音节强行对齐到汉字 ruby。
// 原签名：lineReading(tokens, corrections, songId, lineId, style = 'hiragana')
export function lineReading(tokens, corrections, songId, lineId, style = 'hiragana', importedRomaji = '') {
  if (style === 'romaji' && String(importedRomaji || '').trim()) return importedRomaji.trim()
  // 两行均从同一份人工校正生成，避免逐词交错、避免修改保存的假名。
  if (style === 'both') return [lineReading(tokens, corrections, songId, lineId, 'hiragana'), lineReading(tokens, corrections, songId, lineId, 'romaji', importedRomaji)].filter(Boolean).join('\n')
  return tokens?.filter((token) => !token.is_symbol).map((token) => {
    const correction = corrections[correctionKey(songId, lineId, token.index)]
    // 原来使用 correction || token.reading；空字符串也是有效的人工校对。
    return displayReading(correction ?? token.reading, style, token, correction != null)
  }).filter(Boolean).join(' ') || ''
}
