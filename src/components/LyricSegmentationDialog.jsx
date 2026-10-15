import { useState } from 'react'
import { fixedLyricBoundaries, lyricGraphemes, segmentSurfaces, suggestedTokenBoundaries } from '../lib/lyricSegmentation'

export default function LyricSegmentationDialog({ text, tokens, suggestion, busy, error, onConfirm, onCancel }) {
  const [boundaries, setBoundaries] = useState(() => suggestedTokenBoundaries(text, tokens, suggestion))
  const graphemes = lyricGraphemes(text)
  const fixed = fixedLyricBoundaries(text)

  function toggle(offset) {
    if (fixed.has(offset) || busy) return
    setBoundaries(previous => {
      const next = new Set(previous)
      if (next.has(offset)) next.delete(offset)
      else next.add(offset)
      return next
    })
  }

  return <div className="segmentation-backdrop" onClick={busy ? undefined : onCancel}>
    <div className="segmentation-dialog" role="dialog" aria-modal="true" aria-labelledby="segmentation-title" onClick={event => event.stopPropagation()}>
      <h3 id="segmentation-title">自定义分词</h3>
      {suggestion && <div className="segmentation-ai-proposal"><strong>AI 分词建议 · {Math.round(suggestion.confidence * 100)}%</strong><span>现有：{suggestion.original_segments.join('｜')}</span><span>建议：{suggestion.suggested_segments.join('｜')}</span><small>{suggestion.reason}</small></div>}
      <p>点击竖线调整词界，再次点击恢复。绿色竖线表示分词边界，灰色竖线表示同一个词；标点和空格会单独保留。</p>
      <div className="segmentation-characters" lang="ja" aria-label="分词边界">
        {graphemes.map((item, index) => <span className="segmentation-character" key={item.start}>
          <span className="segmentation-glyph">{item.text === ' ' ? '␣' : item.text}</span>
          {index < graphemes.length - 1 && (fixed.has(item.end)
            ? <span className="segmentation-boundary fixed" aria-hidden="true">│</span>
            : <button type="button" className={`segmentation-boundary${boundaries.has(item.end) ? ' active' : ''}`} aria-label={`${item.text}和${graphemes[index + 1].text}之间${boundaries.has(item.end) ? '合并' : '拆分'}`} aria-pressed={boundaries.has(item.end)} disabled={busy} onClick={() => toggle(item.end)}>│</button>)}
        </span>)}
      </div>
      {error && <p className="segmentation-error" role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onCancel}>取消</button><button type="button" disabled={busy} onClick={() => onConfirm(segmentSurfaces(text, boundaries))}>{busy ? '生成读音中…' : '确认分词'}</button></footer>
    </div>
  </div>
}
