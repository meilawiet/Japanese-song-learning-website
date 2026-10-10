import { correctionKey, hasKanji, splitRuby } from '../lib/ruby'
// 原单层注音 import { displayReading } from '../lib/readingDisplay'
import ReadingRuby from './ReadingRuby'

// 跟唱与逐句使用同一 annotations/corrections 数据，只输出文本，避免在歌词按钮里嵌套按钮。
export default function ReadingLyric({ text, tokens, corrections, songId, lineId, readingStyle }) {
  if (!tokens?.length) return text
  return tokens.map((token) => {
    const key = correctionKey(songId, lineId, token.index)
    // 原来使用 ||；现在尊重人工留空，不恢复自动注音。
    const parts = splitRuby(token.surface, corrections[key] ?? token.reading)
    // 原注音为单层 ruby/rt；改用共用组件支持双层显示。
    // <ruby>{parts.base}<rt lang={readingStyle === 'romaji' ? 'ja-Latn' : 'ja'}>{displayReading(parts.ruby, readingStyle)}</rt></ruby>
    return <span key={key}>{hasKanji(token.surface) && parts.ruby ? <><ReadingRuby base={parts.base} reading={parts.ruby} readingStyle={readingStyle} />{parts.suffix}</> : token.surface}</span>
  })
}
