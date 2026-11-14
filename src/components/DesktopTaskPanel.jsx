import { useRef, useState } from 'react'
import { Check, CircleAlert, LoaderCircle, RotateCcw, X, ArrowRight } from 'lucide-react'
import { canCancelDesktopTask, desktopTaskSongId, groupDesktopTasks } from '../lib/desktopTasks'

const stateName = { queued: '等待中', running: '进行中', cancelling: '正在取消', done: '已完成', failed: '失败', cancelled: '已取消' }
export default function DesktopTaskPanel({ open, tasks, currentSongTitle, remainingAi, aiBusy, onGenerateAi, onChooseAi, onLocate, onClose, onRetry, onCancel, reviewBusy, reviewDisabled, onReview, onReviewResult, reviewCountFor, songExists }) {
  const [completedOpen, setCompletedOpen] = useState(false)
  const listRef = useRef(null)
  if (!open) return null
  const groups = groupDesktopTasks(tasks)
  const jump = id => { if (id === 'completed') setCompletedOpen(true); requestAnimationFrame(() => { const target = listRef.current?.querySelector(`[data-task-group="${id}"]`); if (target) listRef.current.scrollTop += target.getBoundingClientRect().top - listRef.current.getBoundingClientRect().top }) }
  const card = task => {
    const review = task.kind === 'AI 复核'
    const songId = desktopTaskSongId(task)
    const reviewCount = review && task.state === 'done' ? reviewCountFor(songId) : 0
    const canRetry = ['failed', 'cancelled'].includes(task.state)
      && (!review || !reviewDisabled && songExists(songId))
    return <article className={`desktop-task-item state-${task.state}`} key={task.id}>
    <div className="desktop-task-top"><span className="desktop-task-kind">{task.kind}</span><span className="desktop-task-state">{['running', 'cancelling'].includes(task.state) ? <LoaderCircle size={13} className="spin"/> : task.state === 'failed' ? <CircleAlert size={13}/> : task.state === 'done' ? <Check size={13}/> : null}{stateName[task.state] || task.state}</span></div>
    <h3>{task.title}</h3><p>{review && task.state === 'done' ? reviewCount ? reviewCount + ' 条待处理建议。' : '没有待处理建议。'
      : task.detail || (task.state === 'failed' ? '任务没有完成。' : '')}</p>
    {task.total > 0 && <><div className="desktop-task-meter" role="progressbar" aria-label={`${task.title}进度`} aria-valuenow={task.done} aria-valuemin="0" aria-valuemax={task.total}><span style={{ width: `${Math.min(100, Math.round(100 * task.done / task.total))}%` }}/></div><small>{task.done} / {task.total}{task.state === 'running' && task.cancellable === false ? ' · 正在保存' : ''}</small></>}
    {task.error && <p className="desktop-task-error">{task.error}</p>}
    <div className="desktop-task-actions">
      {canRetry && <button type="button" onClick={() => onRetry(task.id)}><RotateCcw size={13}/>{review ? '重试复核' : task.kind === 'AI 解析' ? '重试剩余' : '重试'}</button>}
      {canCancelDesktopTask(task) && <button type="button" onClick={() => onCancel(task.id)}><X size={13}/>{review ? '取消复核' : '取消'}</button>}
      {task.state === 'cancelling' && <button type="button" disabled>正在取消…</button>}
      {task.state === 'running' && task.cancellable === false && <small>本机保存中，暂不可取消</small>}
      {reviewCount > 0 && <button type="button" onClick={() => onReviewResult(songId)}>查看建议<ArrowRight size={12}/></button>}
      {!review && songId && onLocate && <button type="button" onClick={() => onLocate(songId)}>前往学习<ArrowRight size={12}/></button>}
    </div>
    </article>
  }
  return <aside id="desktop-task-panel" className="desktop-task-panel" role="dialog" aria-modal="false" aria-label="任务面板">
    <header><div><h2>任务面板</h2><p>导入、注音、AI 解析与复核</p></div><button type="button" aria-label="关闭任务面板" onClick={onClose}><X size={18}/></button></header>
    <div className="desktop-task-summary">{[['active','进行中'],['attention','需处理'],['completed','已完成']].map(([id,label]) => <button key={id} type="button" onClick={() => jump(id)}>{label} {groups[id].length}</button>)}</div>
    <div className="desktop-task-list" ref={listRef}>
      <div className="desktop-task-current"><b>由你决定何时使用 AI</b><button type="button" onClick={onChooseAi}>选择歌曲并解析</button><span>当前歌曲 · {currentSongTitle}</span><button type="button" disabled={!remainingAi || aiBusy} onClick={onGenerateAi}>生成剩余 AI 解析（{remainingAi} 句）</button>
        <button type="button" className="desktop-task-review-trigger" disabled={reviewBusy || reviewDisabled} onClick={onReview}>复核整首读音与分词</button>
        <small>AI 解析解释句意，复核检查读音和词界。启动后会向配置的 AI 服务发送所需内容。</small></div>
      {['attention', 'active'].map(id => <section key={id} data-task-group={id}><h3 className="desktop-task-group-title">{id === 'attention' ? '失败与已取消' : '进行中'} <span>{groups[id].length}</span></h3>{groups[id].length ? groups[id].map(card) : <p className="desktop-task-empty">暂无任务。</p>}</section>)}
      <details data-task-group="completed" open={completedOpen} onToggle={event => setCompletedOpen(event.currentTarget.open)}><summary>已完成 · {groups.completed.length} 项</summary>{groups.completed.map(card)}</details>
    </div>
    <footer>关闭面板不会停止任务；取消后已完成的内容会保留。</footer>
  </aside>
}
