import { useState } from 'react'
export default function DesktopAiReviewPanel({ song, reading, segmentation, skipped, onSkip, onRestore, onReading, onSegmentation }) {
  const [tab, setTab] = useState('pending')
  const pending = [...reading, ...segmentation]
  if (!pending.length && !skipped.length) return null
  const items = tab === 'pending' ? pending : skipped
  return <section id="desktop-ai-review" className="desktop-review-cards" tabIndex={-1} aria-label="AI 复核建议"><header><h3>复核建议 <span>{pending.length}</span></h3></header><nav><button type="button" aria-pressed={tab === 'pending'} onClick={() => setTab('pending')}>待处理 {pending.length}</button><button type="button" aria-pressed={tab === 'skipped'} onClick={() => setTab('skipped')}>已跳过 {skipped.length}</button></nav>
    {tab === 'skipped' && skipped.length > 0 && <button className="desktop-review-restore-all" type="button" onClick={() => { onRestore(); setTab('pending') }}>恢复已跳过建议</button>}
    {items.map((item, index) => { const line = song.lines.find(line => line.id === item.line_id); const split = Boolean(item.suggested_segments); return <article className="desktop-review-card" key={`${item.line_id}-${item.token_index ?? item.start_token_index}-${index}`}><small>第 {line?.displayNumber} 句 · {split ? '分词' : '读音'}</small><p lang="ja">{line?.text}</p><div className="desktop-review-compare"><div><small>当前标注</small><strong>{split ? item.original_segments.join('｜') : item.original_reading}</strong></div><div><small>AI 建议</small><strong>{split ? item.suggested_segments.join('｜') : item.suggested_reading}</strong></div></div><p className="desktop-review-reason">{item.reason}</p>{tab === 'pending' && <footer><button type="button" onClick={() => onSkip(item)}>跳过</button><button type="button" onClick={() => split ? onSegmentation(item) : onReading(item)}>{split ? '核对分词' : '采用读音'}</button></footer>}</article> })}
    {!items.length && <p className="desktop-review-empty">暂无待处理建议。</p>}
  </section>
}
