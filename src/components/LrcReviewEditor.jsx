import { CircleAlert, Plus, Trash2 } from 'lucide-react'
import { compileLrcCues, confirmLrcTrackClassifications, insertLrcCue } from '../lib/lrcReview'

const trackLabels = { original: '原文', translation: '译文', romaji: '罗马音', ignore: '忽略此行' }

export default function LrcReviewEditor({ cues, onChange, disabled = false, label = '歌词' }) {
  const { lines, issues } = compileLrcCues(cues)
  const issuesByCue = new Map()
  for (const issue of issues) issuesByCue.set(issue.cueId, [...(issuesByCue.get(issue.cueId) || []), issue])
  const trackReviewCount = cues.filter(cue => cue.track !== 'ignore' && cue.reviewReason && !cue.reviewed && !cue.trackReviewed).length
  const update = (id, patch) => onChange(cues.map(cue => cue.id === id ? { ...cue, ...patch } : cue))
  return <section className="lrc-review-editor" aria-label={`${label}轨道预览`}>
    <div className="lrc-review-summary"><strong>{lines.length} 句原文 · {issues.length ? `${issues.length} 项待处理` : '可以导入'}</strong><span>同时间戳译文自动归类；其余不确定的轨道可检查后批量确认。</span>{trackReviewCount > 0 && <button className="lrc-review-confirm-all" type="button" disabled={disabled} onClick={() => onChange(confirmLrcTrackClassifications(cues))}>确认 {trackReviewCount} 行当前归类</button>}</div>
    <div className="lrc-review-scroll"><div className="lrc-review-head" aria-hidden="true"><span>时间戳</span><span>轨道</span><span>原文</span><span>译文</span><span>罗马音</span><span/></div>
      <ol className="lrc-review-rows">{cues.map((cue, index) => {
        const warnings = issuesByCue.get(cue.id) || []
        return <li key={cue.id} className={warnings.length ? 'has-warning' : ''}>
          <div className="lrc-review-row">
            <input value={cue.timeText} onChange={event => update(cue.id, { timeText: event.target.value, reviewed: false })} aria-label={`第 ${index + 1} 行时间戳`} disabled={disabled} placeholder="00:12.345" />
            <select value={cue.track} onChange={event => update(cue.id, { track: event.target.value, trackReviewed: true })} aria-label={`第 ${index + 1} 行轨道`} disabled={disabled}>{Object.entries(trackLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
            {['original', 'translation', 'romaji'].map(track => <div className="lrc-review-cell" key={track}>{cue.track === track ? <input value={cue.text} onChange={event => update(cue.id, { text: event.target.value })} aria-label={`第 ${index + 1} 行${trackLabels[track]}`} disabled={disabled} maxLength={1000} /> : track === 'romaji' && cue.track === 'original' && cue.romaji ? <input value={cue.romaji} onChange={event => update(cue.id, { romaji: event.target.value })} aria-label={`第 ${index + 1} 行自带罗马音`} disabled={disabled} maxLength={1000}/> : null}</div>)}
            <button type="button" aria-label={`删除第 ${index + 1} 行`} title="删除这一行" disabled={disabled} onClick={() => onChange(cues.filter(item => item.id !== cue.id))}><Trash2 size={14}/></button>
          </div>
          {cue.track === 'ignore' && <p className="lrc-review-ignore">这一行不会导入。</p>}
          {warnings.length > 0 && <div className="lrc-review-warnings">{warnings.map((warning, warningIndex) => <span key={`${warning.kind}-${warningIndex}`}><CircleAlert size={12}/>{warning.message}</span>)}{warnings.some(warning => warning.kind === 'review') && <button type="button" disabled={disabled} onClick={() => update(cue.id, { reviewed: true })}>确认当前归类与时间</button>}</div>}
          <button className="lrc-review-insert" type="button" disabled={disabled} onClick={() => onChange(insertLrcCue(cues, index + 1))}><Plus size={12}/> 在此后插入一句</button>
        </li>
      })}</ol>
    </div>
    <button className="lrc-review-insert first" type="button" disabled={disabled} onClick={() => onChange(insertLrcCue(cues, 0))}><Plus size={12}/> 在最前面插入一句</button>
  </section>
}
