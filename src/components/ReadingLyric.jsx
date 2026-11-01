import { correctionKey, hasKanji, splitRuby } from '../lib/ruby'
import { displayReading, lyricSurface, tokenReading, tokenHasManualReading } from '../lib/readingDisplay'

// 跟唱与逐句使用同一 annotations/corrections 数据，只输出文本，避免在歌词按钮里嵌套按钮。
export default function ReadingLyric({ text, tokens, corrections = {}, songId, lineId, readingStyle, readingOptions = {} }) {
  if (!tokens?.length) return text
  if (readingStyle === 'none') return tokens.map(lyricSurface).join('')
  return tokens.map((token) => {
    const key = correctionKey(songId, lineId, token.index)
    const surface = lyricSurface(token)
    const parts = splitRuby(surface, tokenReading(token, corrections, key, readingStyle, readingOptions))
    return <span key={key}>{hasKanji(surface) && parts.ruby ? <><ruby>{parts.base}<rt lang={readingStyle === 'romaji' ? 'ja-Latn' : 'ja'}>{displayReading(parts.ruby, readingStyle, token, tokenHasManualReading(token, corrections, key) || token.source_reading != null)}</rt></ruby>{parts.suffix}</> : surface}</span>
  })
}
