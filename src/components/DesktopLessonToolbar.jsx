export default function DesktopLessonToolbar({ annotating, annotationError, displayMode, onDisplayMode, rate, onRate, audioAvailable }) {
  const hint = annotating ? '正在生成读音…' : annotationError || '点词校对'
  const detail = annotating ? '正在为整首歌词生成读音…' : annotationError || '点击带注音的汉字词，可在右侧修改读音'
  return <>
    <div className="panel-head desktop-lesson-toolbar">
      <div className="desktop-lyrics-heading"><h2 id="lyrics-heading">逐句读音</h2><span className={`desktop-reading-hint${annotationError ? ' has-error' : ''}`} role={annotationError ? 'alert' : annotating ? 'status' : undefined} title={detail}>{hint}</span></div>
      <div className="desktop-lesson-controls">
        <label className="desktop-lesson-display-label"><span>显示</span><select aria-label="学习页读音显示方式" value={displayMode} onChange={event => onDisplayMode(event.target.value)}><option value="both">假名＋罗马音</option><option value="kana">仅假名</option><option value="romaji">仅罗马音</option><option value="lyrics">仅歌词</option></select></label>
        <label className="speed-control"><span>慢放</span><select aria-label="逐句播放速度" value={rate} onChange={event => onRate(Number(event.target.value))}><option value={1}>1×</option><option value={0.75}>0.75×</option><option value={0.5}>0.5×</option><option value={0.25}>0.25×</option></select></label>
      </div>
    </div>
    <div className="desktop-lesson-help">{audioAvailable ? <>双击播放／暂停 · <kbd>Ctrl</kbd> 点首末句选段</> : '未找到同名音频，可继续练习读音与词义。'}</div>
  </>
}
