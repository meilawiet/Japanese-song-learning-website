import { useState } from 'react'
import { SINGLE_LINE_REPEAT_PRESETS, MAX_SINGLE_LINE_REPEATS } from '../lib/singleLinePlayback'

export default function DesktopLessonToolbar({ annotating, annotationError, displayMode, onDisplayMode, rate, onRate, audioAvailable, repeatCount = 1, onRepeatCount, playback }) {
  const [custom, setCustom] = useState(false)
  const customVisible = repeatCount !== 'infinite' && (custom || !SINGLE_LINE_REPEAT_PRESETS.includes(repeatCount))
  const repeatStatus = !playback || playback.total === 1 ? '' : playback.phase === 'complete'
    ? `已完成 ${playback.completed} 次`
    : `${playback.total === 'infinite' ? `第 ${playback.completed + 1} 次 · 无限循环` : `第 ${playback.completed + 1} / ${playback.total} 次`}${playback.phase === 'paused' ? ' · 已暂停' : ''}`
  const hint = annotating ? '正在生成读音…' : annotationError || '点词校对'
  const detail = annotating ? '正在为整首歌词生成读音…' : annotationError || '点击带注音的汉字词，可在右侧修改读音'
  return <>
    <div className="panel-head desktop-lesson-toolbar">
      <div className="desktop-lyrics-heading"><h2 id="lyrics-heading">逐句读音</h2><span className={`desktop-reading-hint${annotationError ? ' has-error' : ''}`} role={annotationError ? 'alert' : annotating ? 'status' : undefined} title={detail}>{hint}</span></div>
      <div className="desktop-lesson-controls">
        <label className="desktop-lesson-display-label"><span>显示</span><select aria-label="学习页读音显示方式" value={displayMode} onChange={event => onDisplayMode(event.target.value)}><option value="both">假名＋罗马音</option><option value="kana">仅假名</option><option value="romaji">仅罗马音</option><option value="lyrics">仅歌词</option></select></label>
        <label className="speed-control"><span>慢放</span><select aria-label="逐句播放速度" value={rate} onChange={event => onRate(Number(event.target.value))}><option value={1}>1×</option><option value={0.75}>0.75×</option><option value={0.5}>0.5×</option><option value={0.25}>0.25×</option></select></label>
        <div className="desktop-single-line-repeat">
          <label className="speed-control"><span>循环</span><select aria-label="单句循环次数" value={customVisible ? 'custom' : repeatCount} onChange={event => {
            const value = event.target.value
            setCustom(value === 'custom')
            if (value === 'custom' && repeatCount === 'infinite') onRepeatCount(1)
            if (value !== 'custom') onRepeatCount(value === 'infinite' ? value : Number(value))
          }}>{SINGLE_LINE_REPEAT_PRESETS.map(count => <option key={count} value={count}>{count} 次</option>)}<option value="custom">自定义</option><option value="infinite">无限</option></select></label>
          {customVisible && <label className="desktop-single-line-custom"><input aria-label="自定义单句循环次数" type="number" min="1" max={MAX_SINGLE_LINE_REPEATS} step="1" value={repeatCount} onChange={event => {
            const value = event.target.valueAsNumber
            if (Number.isInteger(value) && value >= 1 && value <= MAX_SINGLE_LINE_REPEATS) onRepeatCount(value)
          }}/><span>次</span></label>}
        </div>
      </div>
    </div>
    <div className="desktop-lesson-help"><span>{audioAvailable ? <>双击播放／暂停 · <kbd>Ctrl</kbd> 点首末句选段</> : '未找到同名音频，可继续练习读音与词义。'}</span>{repeatStatus && <span className="desktop-single-line-status" role="status" data-phase={playback.phase} data-completed={playback.completed}>{repeatStatus}</span>}</div>
  </>
}
