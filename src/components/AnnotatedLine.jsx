import { hasKanji, splitRuby } from '../lib/ruby'
import { displayReading } from '../lib/readingDisplay'
import ReadingLyric from './ReadingLyric'
import WordReading from './WordReading'

export default function AnnotatedLine({
  tokens,
  corrections,
  hiddenReadings = {},
  fallbackText = '',
  songId,
  lineId,
  mode,
  readingStyle = 'hiragana',
  selectedIndex,
  selectionRange,
  showSelectionAction,
  onSelectToken,
  onStartSelection,
  onExtendSelection,
  onFinishSelection,
  onExplainSelection,
  interactive = true,
  wordAlignedReadings = false,
}) {
  if (!tokens?.length) return <span className="auto-lyric loading-lyric">{fallbackText || '正在生成自动读音…'}</span>

  // 安卓逐句取消旧选词/拖选入口，静态注音仍使用同一人工校正数据；整句点击由父层播放。
  if (!interactive) return <span className={`auto-lyric ${readingStyle === 'romaji' ? 'romaji' : ''}`}>{mode === 'reading' ? <ReadingLyric tokens={tokens} corrections={corrections} songId={songId} lineId={lineId} readingStyle={readingStyle} /> : tokens.map(token => token.surface).join('')}</span>

  const wordAligned = wordAlignedReadings && mode === 'reading'
    && tokens.some(token => /[^\x00-\x7F]/.test(token.surface) && !token.is_symbol)
  return <span className={`auto-lyric ${readingStyle === 'romaji' ? 'romaji' : ''}${wordAligned ? ' word-aligned word-aligned-' + readingStyle : ''}`}>
    {tokens.map((token) => {
      const key = `${songId}:${lineId}:${token.index}`
      if (token.is_symbol) return <span className="lyric-symbol" key={key}>{wordAligned ? <WordReading token={token} /> : token.surface}</span>
      const reading = corrections[key] || token.reading
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
      }} onPointerUp={() => onFinishSelection?.()} onClick={(event) => { event.stopPropagation(); onSelectToken(token.index) }} aria-label={`${token.surface}，读音 ${displayReading(reading, readingStyle === 'both' ? 'hiragana' : readingStyle, token, Boolean(corrections[key]))}${hiddenReadings[key] ? '，注音已隐藏' : ''}`}>
        {wordAligned ? <WordReading token={token} reading={reading} hidden={Boolean(hiddenReadings[key])} corrected={Boolean(corrections[key])} /> : <>
          {annotatable && mode === 'reading' && !hiddenReadings[key] ? <ruby>{ruby.base}<rt lang={readingStyle === 'romaji' ? 'ja-Latn' : 'ja'}>{readingStyle === 'both' ? <span className="ruby-both"><span>{displayReading(ruby.ruby, 'hiragana')}</span><span lang="ja-Latn">{displayReading(ruby.ruby, 'romaji')}</span></span> : displayReading(ruby.ruby, readingStyle)}</rt></ruby> : annotatable ? ruby.base : token.surface}
          {annotatable ? ruby.suffix : ''}
        </>}
      </button>
      {isRangeEnd && showSelectionAction && <button className="phrase-explain-button" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onExplainSelection?.() }}>AI 解释</button>}</span>
    })}
  </span>
}
