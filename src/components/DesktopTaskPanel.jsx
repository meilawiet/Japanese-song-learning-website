import { Check, CircleAlert, LoaderCircle, RotateCcw, X } from 'lucide-react'

const stateName = { queued: '等待中', running: '进行中', done: '已完成', failed: '失败', cancelled: '已取消' }

export default function DesktopTaskPanel({ open, tasks, currentSongTitle, remainingAi, aiBusy, onGenerateAi, onClose, onRetry, onCancel }) {
  if (!open) return null
  return <aside className="desktop-task-panel" role="dialog" aria-modal="false" aria-label="任务面板">
    <header><div><small>BACKGROUND TASKS</small><h2>任务面板</h2><p>导入、注音与 AI 解析的进度都在这里。</p></div><button type="button" aria-label="关闭任务面板" onClick={onClose}><X size={18}/></button></header>
    <div className="desktop-task-current"><span>当前歌曲 · {currentSongTitle}</span><button type="button" disabled={!remainingAi || aiBusy} onClick={onGenerateAi}>生成剩余 AI 解析（{remainingAi} 句）</button><small>仅点击后发送歌词和已有译文；可能产生 API 费用。</small></div>
    <div className="desktop-task-list" aria-live="polite">
      {!tasks.length && <div className="desktop-task-empty">目前没有任务。导入歌曲、生成注音或解析时会显示进度。</div>}
      {tasks.map(task => <article className={`desktop-task-item state-${task.state}`} key={task.id}>
        <div className="desktop-task-top"><span className="desktop-task-kind">{task.kind}</span><span className="desktop-task-state">{task.state === 'running' ? <LoaderCircle size={13} className="spin"/> : task.state === 'failed' ? <CircleAlert size={13}/> : task.state === 'done' ? <Check size={13}/> : null}{stateName[task.state] || task.state}</span></div>
        <h3>{task.title}</h3>
        <p>{task.detail || (task.state === 'failed' ? '任务没有完成。' : '')}</p>
        {task.total > 0 && <><div className="desktop-task-meter" role="progressbar" aria-label={`${task.title}进度`} aria-valuenow={task.done} aria-valuemin="0" aria-valuemax={task.total}><span style={{ width: `${Math.round(100 * task.done / task.total)}%` }}/></div><small>{task.done} / {task.total}</small></>}
        {task.error && <p className="desktop-task-error" role="alert">{task.error}</p>}
        <div className="desktop-task-actions">{task.state === 'failed' || task.state === 'cancelled' ? <button type="button" onClick={() => onRetry(task.id)}><RotateCcw size={13}/>重试</button> : null}{task.state === 'queued' || task.state === 'running' ? <button type="button" onClick={() => onCancel(task.id)}><X size={13}/>取消</button> : null}</div>
      </article>)}
    </div>
    <footer>关闭面板不会停止任务；取消后已完成的内容会保留。</footer>
  </aside>
}
