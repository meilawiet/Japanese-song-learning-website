import { hasKanji, splitRuby } from '../lib/ruby'
import { displayReading } from '../lib/readingDisplay'
import ReadingLyric from './ReadingLyric'
import ReadingRuby from './ReadingRuby'
import { plainLyric } from '../lib/lyricReadings'
import LiteralLyric from './LiteralLyric'

export default function AnnotatedLine({
  tokens,
  text = '',
  corrections,
  songId,
  lineId,
  mode,
  readingStyle = 'hiragana',
  importedRomaji = '',
  // 仅安卓静态歌词使用位置偏好；旧网页交互仍按原有 ruby 渲染。
  romajiPosition = 'above',
  selectedIndex,
  selectionRange,
  showSelectionAction,
  onSelectToken,
  onStartSelection,
  onExtendSelection,
  onFinishSelection,
  onExplainSelection,
  interactive = true,
  language = 'ja',
  showSourceReadings = true,
  showManualReadings = true,
}) {
  // 外语直接使用自然文字排版，避免日语 ruby、词间距和罗马音转换污染内容。
  if (language !== 'ja') return <LiteralLyric {...{text,tokens,corrections,songId,lineId,readingStyle,importedRomaji,language,showSourceReadings,showManualReadings}} />
  // 原等待逻辑保留：if (!tokens?.length) return <span>正在生成自动读音…</span>
  // 字典尚未就绪时先显示原文，避免纯阅读界面空白。
  if (!tokens?.length) return <span className="auto-lyric">{plainLyric(text) || '正在生成自动读音…'}</span>

  // 安卓逐句取消旧选词/拖选入口，静态注音仍使用同一人工校正数据；整句点击由父层播放。
  if (!interactive) return <span className={`auto-lyric ${readingStyle === 'romaji' ? 'romaji' : ''}`}>{mode === 'reading' ? <ReadingLyric romajiPosition={romajiPosition} stacked tokens={tokens} corrections={corrections} songId={songId} lineId={lineId} readingStyle={readingStyle} importedRomaji={importedRomaji} /> : plainLyric(tokens.map(token => token.surface).join(''))}</span>

  return <span className={`auto-lyric ${readingStyle === 'romaji' ? 'romaji' : ''}`}>
    {tokens.map((token) => {
      const key = `${songId}:${lineId}:${token.index}`
      if (token.is_symbol) return <span className="lyric-symbol" key={key}>{token.surface}</span>
      // 原来使用 ||，人工取消注音后仍保留歌词原文。
      const reading = corrections[key] ?? token.reading
      const ruby = splitRuby(token.surface, reading)
      const annotatable = hasKanji(token.surface)
      const isSelected = selectedIndex === token.index
      const isInRange = selectionRange
        && token.index >= Math.min(selectionRange.startIndex, selectionRange.endIndex)
        && token.index <= Math.max(selectionRange.startIndex, selectionRange.endIndex)
      const isRangeEnd = selectionRange && token.index === Math.max(selectionRange.startIndex, selectionRange.endIndex)
      // 按用户要求取消 corrected 变色类；读音数据仍优先使用人工校正。
      // 原颜色标记保留供对照：${corrections[key] ? 'corrected' : ''}
      return <span className="lyric-token-group" key={key}><button className={`lyric-token ${annotatable ? 'has-ruby' : ''} ${isSelected ? 'selected' : ''} ${isInRange ? 'range-selected' : ''}`} type="button" onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        onStartSelection?.(token.index)
      }} onPointerEnter={(event) => {
        if (event.buttons & 1) onExtendSelection?.(token.index)
      }} onPointerUp={() => onFinishSelection?.()} onClick={(event) => { event.stopPropagation(); onSelectToken(token.index) }} aria-label={`${token.surface}，读音 ${displayReading(reading, readingStyle, token, Boolean(corrections[key]))}`}>
        {/* 原注音：<ruby>{ruby.base}<rt lang={readingStyle === 'romaji' ? 'ja-Latn' : 'ja'}>{displayReading(ruby.ruby, readingStyle)}</rt></ruby>；新组件共用人工校正。 */}
        {/* 原条件仅判断 annotatable 和 reading 模式；留空时不生成空 ruby。 */}
        {annotatable && mode === 'reading' && ruby.ruby ? <ReadingRuby base={ruby.base} reading={ruby.ruby} readingStyle={readingStyle} /> : token.surface}
        {annotatable && mode === 'reading' && ruby.ruby ? ruby.suffix : ''}
      </button>
      {isRangeEnd && showSelectionAction && <button className="phrase-explain-button" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onExplainSelection?.() }}>AI 解释</button>}</span>
    })}
  </span>
}
