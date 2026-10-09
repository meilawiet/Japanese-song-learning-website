import { correctionKey, hasKanji, splitRuby } from '../lib/ruby'
import { displayReading } from '../lib/readingDisplay'

// 跟唱与逐句使用同一 annotations/corrections 数据，只输出文本，避免在歌词按钮里嵌套按钮。
export default function ReadingLyric({ text, tokens, corrections, songId, lineId, readingStyle }) {
  if (!tokens?.length) return text
  return tokens.map((token) => {
    const key = correctionKey(songId, lineId, token.index)
    const parts = splitRuby(token.surface, corrections[key] || token.reading)
    return <span key={key}>{hasKanji(token.surface) && parts.ruby ? <><ruby>{parts.base}<rt lang={readingStyle === 'romaji' ? 'ja-Latn' : 'ja'}>{displayReading(parts.ruby, readingStyle)}</rt></ruby>{parts.suffix}</> : token.surface}</span>
  })
}
