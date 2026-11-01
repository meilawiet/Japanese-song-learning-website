import { hasKanji, splitRuby } from '../lib/ruby'
import { displayReading, lyricSurface, tokenReading } from '../lib/readingDisplay'

// Keep one segmented word and both readings together when lyrics wrap.
export default function WordReading({ token, reading, hidden = false, corrected = false, readingOptions = {} }) {
  const surface = lyricSurface(token)
  const manual = corrected || token.manual_group_reading != null
  const concealed = hidden || manual && readingOptions.showManualReadings === false
    || !manual && token.source_reading != null && readingOptions.showSourceReadings === false
  const value = reading === undefined ? tokenReading(token, {}, '', 'hiragana', readingOptions) : reading
  const parts = splitRuby(surface, value)
  const latin = /^[\x00-\x7F]+$/.test(surface)
  const pronunciation = !manual && token.source_reading != null ? token.source_pronunciation ?? token.source_reading : value
  const kana = !concealed && hasKanji(surface) ? displayReading(parts.ruby, 'hiragana', token, manual) : ''
  const roman = !concealed && !token.is_symbol && !latin ? displayReading(pronunciation, 'romaji', token, manual || token.source_reading != null) : ''
  const fraction = kana ? [...parts.base].length / [...surface].length * 100 : 100
  return <span className={`token-reading${token.is_symbol ? ' token-reading-symbol' : ''}`} data-romaji-position={readingOptions.romajiPosition === 'above' ? 'above' : 'below'} style={{ '--ruby-fraction': `${fraction}%` }}>
    <span className="token-reading-kana" lang="ja" aria-hidden="true">{kana}</span>
    <span className={`token-reading-surface${latin ? ' plain-text' : ''}`} lang="ja">{latin ? surface : [...surface].map((character, index) => <span key={index}>{character}</span>)}</span>
    <span className="token-reading-romaji" lang="ja-Latn" aria-hidden="true">{roman}</span>
  </span>
}
