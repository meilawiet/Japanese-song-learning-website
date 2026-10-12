import { toHiragana, toKatakana, toRomaji } from 'wanakana'
import { correctionKey } from './ruby.js'
// 原导入：import { prepareLyricReadings, tokenReading } from './lyricReadings.js'
import { isLatinLyric, prepareLyricReadings, tokenReading } from './lyricReadings.js'

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

// 旧实现仅把来源罗马音用于整句行；现在可靠对齐后同样用于 ruby，仍不猜测歧义边界。
// 原签名：lineReading(tokens, corrections, songId, lineId, style = 'hiragana')
export function lineReading(tokens, corrections, songId, lineId, style = 'hiragana', importedRomaji = '') {
  // 原来整句罗马音直接返回，导致人工校正无法覆盖；现在统一读音优先级。
  // if (style === 'romaji' && String(importedRomaji || '').trim()) return importedRomaji.trim()
  const prepared = prepareLyricReadings(tokens, importedRomaji, corrections, songId, lineId)
  const hasManual = tokens?.some(token=>corrections[correctionKey(songId,lineId,token.index)]!=null)
  // 全英文句保留原来的大小写、空格及标点，不重复生成假名或两行相同注音。
  // 人工明确填写的读音（包括留空）仍优先，英语词也可以手动指定日语唱法。
  const originalText = tokens?.map(token => token.surface).join('') || ''
  if (!hasManual && isLatinLyric(originalText)) return originalText
  if (style === 'romaji' && prepared.hasSource && !hasManual) return importedRomaji.trim()
  // 两行均从同一份人工校正生成，避免逐词交错、避免修改保存的假名。
  if (style === 'both') return [lineReading(tokens, corrections, songId, lineId, 'hiragana', importedRomaji), lineReading(tokens, corrections, songId, lineId, 'romaji', importedRomaji)].filter(Boolean).join('\n')
  if(style==='hiragana'&&prepared.hasSource&&!prepared.aligned&&!hasManual)return prepared.sourceKana || importedRomaji.trim()
  return prepared.tokens?.filter((token) => !token.is_symbol).map((token) => {
    const correction = corrections[correctionKey(songId, lineId, token.index)]
    // 原来使用 correction || token.reading；空字符串也是有效的人工校对。
    // 原来同一读音用于两个模式。假名保留助词字形，罗马音仍按来源实际唱法。
    // return displayReading(tokenReading(token,corrections,songId,lineId), style, token, correction != null || token.source_reading!=null)
    const manual=correction!=null || token.manual_group_reading!=null
    // 原来源字段兼作字形与发音；现在づ字形仍用づ，来源zu的罗马音仍按ず发音转换。
    const reading=style==='romaji'&&!manual&&token.source_reading!=null?(token.source_pronunciation??token.source_reading):tokenReading(token,corrections,songId,lineId)
    return displayReading(reading, style, token, manual || token.source_reading!=null)
  }).filter(Boolean).join(' ') || ''
}
