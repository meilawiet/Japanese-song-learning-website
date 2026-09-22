import { hasKanji, splitRuby } from '../lib/ruby'

export default function AnnotatedLine({
  tokens,
  corrections,
  songId,
  lineId,
  mode,
  selectedIndex,
  selectionRange,
  showSelectionAction,
  onSelectToken,
  onStartSelection,
  onExtendSelection,
  onFinishSelection,
  onExplainSelection,
}) {
  if (!tokens?.length) return <span className="auto-lyric loading-lyric">正在生成自动读音…</span>

  return <span className="auto-lyric">
    {tokens.map((token) => {
      const key = `${songId}:${lineId}:${token.index}`
      const reading = corrections[key] || token.reading
      const ruby = splitRuby(token.surface, reading)
      const annotatable = hasKanji(token.surface)
      const isSelected = selectedIndex === token.index
      const isInRange = selectionRange
        && token.index >= Math.min(selectionRange.startIndex, selectionRange.endIndex)
        && token.index <= Math.max(selectionRange.startIndex, selectionRange.endIndex)
      const isRangeEnd = selectionRange && token.index === Math.max(selectionRange.startIndex, selectionRange.endIndex)
      return <span className="lyric-token-group" key={key}><button className={`lyric-token ${annotatable ? 'has-ruby' : ''} ${isSelected ? 'selected' : ''} ${isInRange ? 'range-selected' : ''} ${corrections[key] ? 'corrected' : ''}`} type="button" onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        onStartSelection?.(token.index)
      }} onPointerEnter={(event) => {
        if (event.buttons & 1) onExtendSelection?.(token.index)
      }} onPointerUp={() => onFinishSelection?.()} onClick={(event) => { event.stopPropagation(); onSelectToken(token.index) }} aria-label={`${token.surface}，读音 ${reading}`}>
        {annotatable && mode === 'reading' ? <ruby>{ruby.base}<rt>{ruby.ruby}</rt></ruby> : token.surface}
        {annotatable && mode === 'reading' ? ruby.suffix : ''}
      </button>
      {isRangeEnd && showSelectionAction && <button className="phrase-explain-button" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onExplainSelection?.() }}>AI 解释</button>}</span>
    })}
  </span>
}
