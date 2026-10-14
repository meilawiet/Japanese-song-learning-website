import { correctionKey, hasKanji, splitRuby } from '../lib/ruby'
// 原单层注音 import { displayReading } from '../lib/readingDisplay'
import ReadingRuby from './ReadingRuby'
import { lyricSurface, plainLyric, prepareLyricReadings, tokenReading } from '../lib/lyricReadings'
import { displayReading } from '../lib/readingDisplay'

// 跟唱与逐句使用同一 annotations/corrections 数据，只输出文本，避免在歌词按钮里嵌套按钮。
export default function ReadingLyric({ text, tokens, corrections, songId, lineId, readingStyle, importedRomaji = '', stacked=false }) {
  // 不注音仅切换显示，不删除来源读音或人工校正；括号注音也不混入原文。
  if (readingStyle === 'none') return plainLyric(text || tokens?.map(token => token.surface).join('') || '')
  if (!tokens?.length) return plainLyric(text)
  // 原来直接渲染本地 tokens；现在先解析括号注音并对齐来源读音。
  const prepared=prepareLyricReadings(tokens,importedRomaji,corrections,songId,lineId)
  // 安卓按完整词组上下对齐；假名只标含汉字的词，罗马音覆盖助词，整组同时换行。
  if(stacked)return <span className={`word-aligned-lyrics ${readingStyle==='both'?'both':readingStyle}`}>
    {prepared.tokens.map(token=>{
      const surface=lyricSurface(token),reading=tokenReading(token,corrections,songId,lineId)
      const manual=corrections?.[correctionKey(songId,lineId,token.index)]!=null||token.manual_group_reading!=null
      const pronunciation=!manual&&token.source_reading!=null?(token.source_pronunciation??token.source_reading):reading
      const romaji=token.is_symbol?'':displayReading(pronunciation,'romaji',token,manual||token.source_reading!=null)
      return <span className="word-aligned-token" key={token.index}>
        {readingStyle!=='romaji'&&<span className="word-aligned-kana" lang="ja">{hasKanji(surface)&&reading?reading:'\u00a0'}</span>}
        {readingStyle!=='hiragana'&&<span className="word-aligned-romaji" lang="ja-Latn">{romaji||'\u00a0'}</span>}
        <span className="word-aligned-original" lang="ja">{surface}</span>
      </span>
    })}
    {/* 来源无法可靠分配到词时仍显示完整来源，明确区分尚未词级对齐。 */}
    {prepared.hasSource&&!prepared.aligned&&readingStyle!=='hiragana'&&<small className="word-aligned-unresolved">来源罗马音（尚未按词对齐）：{importedRomaji}</small>}
  </span>
  return prepared.tokens.map((token) => {
    const key = correctionKey(songId, lineId, token.index)
    // 原来使用 ||；现在尊重人工留空，不恢复自动注音。
    const surface=lyricSurface(token)
    const parts = splitRuby(surface, tokenReading(token,corrections,songId,lineId))
    // 原注音为单层 ruby/rt；改用共用组件支持双层显示。
    // <ruby>{parts.base}<rt lang={readingStyle === 'romaji' ? 'ja-Latn' : 'ja'}>{displayReading(parts.ruby, readingStyle)}</rt></ruby>
    return <span key={key}>{hasKanji(surface) && parts.ruby ? <><ReadingRuby base={parts.base} reading={parts.ruby} readingStyle={readingStyle} />{parts.suffix}</> : surface}</span>
  })
}
