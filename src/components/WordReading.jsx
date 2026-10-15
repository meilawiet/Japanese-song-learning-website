import { hasKanji, splitRuby } from '../lib/ruby'
import { displayReading } from '../lib/readingDisplay'

// Keep one segmented word and both readings together when lyrics wrap.
export default function WordReading({ token, reading = token.reading, hidden = false, corrected = false }) {
  const parts = splitRuby(token.surface, reading)
  const latin = /^[\x00-\x7F]+$/.test(token.surface)
  const kana = !hidden && hasKanji(token.surface) ? displayReading(parts.ruby, 'hiragana') : ''
  const roman = !hidden && !token.is_symbol && !latin ? displayReading(reading, 'romaji', token, corrected) : ''
  const fraction = kana ? [...parts.base].length / [...token.surface].length * 100 : 100
  return <span className={`token-reading${token.is_symbol ? ' token-reading-symbol' : ''}`} style={{ '--ruby-fraction': `${fraction}%` }}>
    <span className="token-reading-kana" lang="ja" aria-hidden="true">{kana}</span>
    <span className={`token-reading-surface${latin ? ' plain-text' : ''}`} lang="ja">{latin ? token.surface : [...token.surface].map((character, index) => <span key={index}>{character}</span>)}</span>
    <span className="token-reading-romaji" lang="ja-Latn" aria-hidden="true">{roman}</span>
  </span>
}
