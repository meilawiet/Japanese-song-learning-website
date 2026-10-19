import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
// 原图标导入保留对照：import { ChevronDown, LoaderCircle, MoreHorizontal, Pause, Play, X } from 'lucide-react'
import { LoaderCircle, Menu, MoreHorizontal, Pause, Play, X } from 'lucide-react'
import { SongCoverButton } from './AndroidLessonHeader'
import ReadingStyleOptions from './ReadingStyleOptions'
// 日语罗马音位置沿用当前歌曲的显示设置，切换练习模式不重置。
import RomajiPositionOptions from './RomajiPositionOptions'
import SongLanguageSelect from './SongLanguageSelect'
import useModalScrollLock from '../lib/useModalScrollLock'
// 并排显示开关和AI主操作，状态与整曲管理仍复用原回调。
import StudyMoreActions from './StudyMoreActions'

const timeLabel = value => `${String(Math.floor((value || 0) / 60)).padStart(2, '0')}:${String(Math.floor((value || 0) % 60)).padStart(2, '0')}`

// 学习与跟唱共享紧凑页头，歌曲封面仍然负责选歌；旧双入口页头保留供对照。
export function AndroidStudyHeader({ song, artwork, learned, onChoose, error }) {
  // 原紧凑版把进度放在封面左侧；恢复旧版的独立整行进度，歌曲信息和歌词之间更清晰。
  // <div className="android-study-song"><div>歌名、歌手、学习进度</div><SongCoverButton /></div>
  return <header className="android-study-header unified-study-header"><div className="android-study-song"><div><h1>{song.title}</h1><p>{song.artist}</p></div><SongCoverButton song={song} artwork={artwork} onChoose={onChoose} /></div><div className="android-study-progress"><span>{learned} / {song.lines.length} 句已掌握</span><div><i style={{ width: `${song.lines.length ? learned / song.lines.length * 100 : 0}%` }} /></div></div>{error && <p className="android-study-error" role="alert">{error}</p>}</header>
}

// 原组件参数保留对照：AndroidStudyPlayer({ transport, rate, onRate, readingStyle, onReadingStyle, showTranslation, onTranslation, chat, onReview, ready, total, generating, onGenerate, song, onLanguage, readingOptions = {}, onReadingOptions })
// 原参数保留，新增整曲解析管理与任务进度。
// export default function AndroidStudyPlayer({ transport, rate, onRate, onChooseSong, readingStyle, onReadingStyle, showTranslation, onTranslation, chat, onReview, ready, total, generating, onGenerate, song, onLanguage, readingOptions = {}, onReadingOptions }) {
export default function AndroidStudyPlayer({ transport, rate, onRate, onChooseSong, readingStyle, onReadingStyle, showTranslation, onTranslation, chat, onReview, ready, total, generating, onGenerate, onRegenerate, onDeleteAnalyses, hasAnalyses=false, generationProgress, timestampEditing=false, onTimestampEditing, timestampBusy=false, song, onLanguage, readingOptions = {}, onReadingOptions }) {
  const state = useSyncExternalStore(transport.subscribe, transport.getSnapshot, transport.getSnapshot)
  const [panel, setPanel] = useState(null)
  // 原来另存拖动预览：const [scrub, setScrub] = useState(null)
  // 原生 range 可能先 pointerup 再派发最后一次 input；旧预览会被重新写入且无法清空。
  // seek 已同步发布播放时间，直接订阅这一份状态，避免出现声音继续、进度冻结。
  const root = useRef(null)
  useModalScrollLock(Boolean(panel))
  useEffect(() => {
    if (!panel) return undefined
    const back = event => { event.preventDefault(); setPanel(null) }
    window.addEventListener('uta:navigate-back', back)
    return () => { window.removeEventListener('uta:navigate-back', back); requestAnimationFrame(() => window.dispatchEvent(new Event('uta:study-follow'))) }
  }, [panel])
  // 实测播放器高度决定底部预留，大字体、横屏及安全区变化后歌词不会被挡住。
  useEffect(() => {
    const size = () => document.documentElement.style.setProperty('--study-player-height', `${root.current?.getBoundingClientRect().height || 130}px`)
    const observer = new ResizeObserver(size)
    if (root.current) observer.observe(root.current)
    size()
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--study-player-height') }
  }, [])
  // 原显示：const shownTime = scrub ?? state.time
  const shownTime = state.time
  return <footer className="unified-study-player" ref={root} aria-label="学习播放器">
    {/* 原时间轴提示只区分未就绪/静音；复用此位置显示起点和选段说明，不额外弹窗。 */}
    {/* <p className="study-timeline-note" role="status">{!state.ready ? '歌词缺少完整时间戳，可阅读和编辑，补全后可跟随播放。' : state.silent ? `仅歌词 · ${state.mode === 'continuous' ? '静音跟唱' : '静音计时'}` : '\u00a0'}</p> */}
    <p id="study-range-note" className="study-timeline-note" role="status">{!state.ready ? '歌词缺少完整时间戳，可阅读和编辑，补全后可跟随播放。' : state.rangeAnchorId != null ? `已选第 ${song.lines.findIndex(line => line.id === state.rangeAnchorId) + 1} 句，请双击另一句确定范围` : state.range ? `选段播放 · 第 ${state.range.startIndex + 1}～${state.range.endIndex + 1} 句 · 单击播放或暂停，双击退出` : state.silent ? `仅歌词 · ${state.mode === 'continuous' ? '静音跟唱' : '静音计时'}` : '\u00a0'}</p>
    {/* 原拖动预览事件保留对照：
      <input type="range" value={scrub ?? state.time} onPointerDown={() => setScrub(state.time)}
        onChange={event => { const time = Number(event.target.value); setScrub(time); transport.seek(time) }}
        onPointerUp={() => setScrub(null)} onPointerCancel={() => setScrub(null)}
        onBlur={() => setScrub(null)} onKeyUp={() => setScrub(null)} />
    */}
    <div className="study-seek"><span>{timeLabel(shownTime)}</span><input type="range" aria-label="歌曲播放进度" min="0" max={state.duration || 0} step="0.01" value={shownTime} disabled={!state.ready || !state.duration} onChange={event => transport.seek(Number(event.target.value))} /><span>{timeLabel(state.duration)}</span></div>
    {/* 原模式下拉按钮保留对照：
      <button type="button" className="study-mode-trigger" aria-label="选择练习模式" aria-expanded={panel === 'mode'} onClick={() => setPanel(panel === 'mode' ? null : 'mode')}>{state.mode === 'sentence' ? '逐句学习' : '连续跟唱'}<ChevronDown size={13} /></button>
    */}
    <div className="study-player-controls">
      <div className="study-player-left">
        {/* 当前模式点一次切到另一模式；三横线复用封面已有的选歌弹窗。 */}
        <button type="button" className="study-mode-trigger" aria-label={state.mode === 'sentence' ? '切换到跟唱练习' : '切换到逐句学习'} onClick={() => transport.setMode(state.mode === 'sentence' ? 'continuous' : 'sentence')}>{state.mode === 'sentence' ? '逐句学习' : '跟唱练习'}</button>
        <button type="button" className="study-song-trigger" aria-label="选择其他歌曲" title="选择其他歌曲" onClick={onChooseSong}><Menu size={21} strokeWidth={1.8} /></button>
      </div>
      {/* 原 disabled={!state.ready}；尚待选终点时保持暂停，完成后继续复用原播放按钮。 */}
      <button className="study-central-play" type="button" aria-label={state.busy ? '取消载入' : state.playing ? '暂停播放' : '开始播放'} disabled={!state.ready || state.rangeAnchorId != null} onClick={transport.toggle}>{state.busy ? <LoaderCircle size={24} className="spin" /> : state.playing ? <Pause size={24} fill="currentColor" /> : <Play size={25} fill="currentColor" />}</button>
      <div className="study-player-right"><button type="button" className="study-rate-trigger" aria-label="选择播放倍速" aria-expanded={panel === 'rate'} onClick={() => setPanel(panel === 'rate' ? null : 'rate')}>{rate}×</button>{chat}<button type="button" className="study-more-trigger" aria-label="更多学习选项" aria-expanded={panel === 'more'} onClick={() => setPanel(panel === 'more' ? null : 'more')}><MoreHorizontal size={21} /></button></div>
    </div>
    {/* 原模式选单保留对照：{panel === 'mode' ? <div className="study-mode-options">{[['sentence', '逐句学习', '播放选中句，句末停下'], ['continuous', '连续跟唱', '按时间轴连续播放后续歌词']].map(([value, label, note]) => <button type="button" key={value} aria-pressed={state.mode === value} onClick={() => { transport.setMode(value); setPanel(null) }}><strong>{label}</strong><small>{note}</small></button>)}</div> */}
    {/* 原更多面板整曲解析只有生成按钮；下面保留源码对照。 */}
    {panel && <div className="study-options-backdrop unified-options-backdrop" onClick={() => setPanel(null)}><section className="study-options unified-study-options" role="dialog" aria-modal="true" aria-label={panel === 'more' ? '更多学习选项' : '选择播放倍速'} onClick={event => event.stopPropagation()}><header><h2>{panel === 'more' ? '更多' : '播放倍速'}</h2><button type="button" aria-label="关闭学习选项" onClick={() => setPanel(null)}><X size={22} /></button></header>{panel === 'rate' ? <div className="study-rate-options">{[1, 0.75, 0.5, 0.25].map(value => <button key={value} type="button" aria-pressed={rate === value} onClick={() => { onRate(value); setPanel(null) }}>{value}×</button>)}</div> : <>{/* 语言修改入口按要求放在更多中；切换不会删除已有人工标注。 */}<SongLanguageSelect language={song.language} lines={song.lines} onChange={onLanguage}/><ReadingStyleOptions language={song.language} readingStyle={readingStyle} onReadingStyle={onReadingStyle} includeNone />{song.language==='ja'&&<RomajiPositionOptions position={readingOptions.romajiPosition} onChange={romajiPosition=>onReadingOptions({romajiPosition})}/>}{song.language!=='ja'&&song.language!=='zh'&&readingStyle==='romaji'&&<>{[['showSourceReadings','显示来源标注'],['showManualReadings','显示人工标注']].map(([key,label])=><label className="study-translation-toggle" key={key}><span>{label}</span><input type="checkbox" checked={readingOptions[key]!==false} onChange={event=>onReadingOptions({[key]:event.target.checked})}/></label>)}</>}{/* 原纵向开关和AI布局见文件末尾注释；复核说明按要求移除。 */}<StudyMoreActions language={song.language} showTranslation={showTranslation} onTranslation={onTranslation} timestampEditing={timestampEditing} timestampBusy={timestampBusy} onTimestampEditing={onTimestampEditing?value=>{onTimestampEditing(value);setPanel(null)}:undefined} onReview={()=>{setPanel(null);onReview()}} generating={generating} ready={ready} total={total} generationProgress={generationProgress} onGenerate={onGenerate} onRegenerate={onRegenerate} onDeleteAnalyses={onDeleteAnalyses} hasAnalyses={hasAnalyses}/></>}</section></div>}
  </footer>
}

// 多语言适配前的相关实现保留对照（新逻辑在原位置）。
// import ReadingStyleOptions from './ReadingStyleOptions'
// onGenerate }) {
// <ReadingStyleOptions readingStyle={readingStyle} onReadingStyle={onReadingStyle} includeNone />
// <div className="study-ai"><strong>AI复核歌词</strong>
//>复核歌词</button></div><div className="study-ai">

// 原更多面板保留对照：
// {panel && <div className="study-options-backdrop unified-options-backdrop" onClick={() => setPanel(null)}><section className="study-options unified-study-options" role="dialog" aria-modal="true" aria-label={panel === 'more' ? '更多学习选项' : '选择播放倍速'} onClick={event => event.stopPropagation()}><header><h2>{panel === 'more' ? '更多' : '播放倍速'}</h2><button type="button" aria-label="关闭学习选项" onClick={() => setPanel(null)}><X size={22} /></button></header>{panel === 'rate' ? <div className="study-rate-options">{[1, 0.75, 0.5, 0.25].map(value => <button key={value} type="button" aria-pressed={rate === value} onClick={() => { onRate(value); setPanel(null) }}>{value}×</button>)}</div> : <>{/* 语言修改入口按要求放在更多中；切换不会删除已有人工标注。 */}<SongLanguageSelect language={song.language} lines={song.lines} onChange={onLanguage}/><ReadingStyleOptions language={song.language} readingStyle={readingStyle} onReadingStyle={onReadingStyle} includeNone />{song.language!=='ja'&&song.language!=='zh'&&readingStyle==='romaji'&&<>{[['showSourceReadings','显示来源标注'],['showManualReadings','显示人工标注']].map(([key,label])=><label className="study-translation-toggle" key={key}><span>{label}</span><input type="checkbox" checked={readingOptions[key]!==false} onChange={event=>onReadingOptions({[key]:event.target.checked})}/></label>)}</>}<label className="study-translation-toggle"><span>显示翻译</span><input type="checkbox" role="switch" checked={showTranslation} onChange={event => onTranslation(event.target.checked)} /></label>{song.language==='ja'&&<div className="study-ai"><strong>AI复核歌词</strong><p>查看读音、分词建议及历史记录。</p><button type="button" onClick={() => { setPanel(null); onReview() }}>复核歌词</button></div>}<div className="study-ai"><strong>整曲 AI 解析</strong><p>已生成 {ready} / {total} 句</p><button type="button" disabled={generating || ready === total} onClick={onGenerate}>{generating ? '正在后台生成…' : ready === total ? '解析已完整' : '生成整曲解析'}</button><small>主动生成时会将歌词发送给设置中的 AI 服务，可能产生调用费用。</small></div></>}</section></div>}

// 原更多纵向布局保留供对照（不再渲染）：
// <label className="study-translation-toggle"><span>显示翻译</span><input type="checkbox" role="switch" checked={showTranslation} onChange={event => onTranslation(event.target.checked)} /></label>{/* 独立开关放在翻译下方，左侧名称、右侧勾选框；进入后关闭更多面板。 */}{onTimestampEditing&&<label className="study-translation-toggle"><span>调试时间戳模式</span><input type="checkbox" role="switch" checked={timestampEditing} disabled={timestampBusy} onChange={event=>{onTimestampEditing(event.target.checked);setPanel(null)}}/></label>}{song.language==='ja'&&<div className="study-ai"><strong>AI复核歌词</strong><p>查看读音、分词建议及历史记录。</p><button type="button" onClick={() => { setPanel(null); onReview() }}>复核歌词</button></div>}<div className="study-ai"><strong>整曲 AI 解析</strong><p>{generationProgress?`${generationProgress.regenerating?'正在重新生成':'正在生成'} ${generationProgress.ready} / ${generationProgress.total} 句`:`已生成 ${ready} / ${total} 句`}</p>{/* 原三个按钮直接相邻排列；保留旧实现供对照。 */}{/* <button type="button" disabled={generating || ready === total} onClick={onGenerate}>{generating ? '正在后台生成…' : ready === total ? '解析已完整' : '生成整曲解析'}</button>{onRegenerate&&hasAnalyses&&<button type="button" disabled={generating} onClick={onRegenerate}>重新生成整曲解析</button>}{onDeleteAnalyses&&(hasAnalyses||generating)&&<button className="sentence-delete-all" type="button" onClick={onDeleteAnalyses}>删除整曲解析</button>} */}{/* 管理按钮独立成行，两端对齐并保留按钮间距。 */}<div className="study-analysis-actions"><button type="button" disabled={generating || ready === total} onClick={onGenerate}>{generating ? '正在后台生成…' : ready === total ? '解析已完整' : '生成整曲解析'}</button>{onRegenerate&&hasAnalyses&&<button type="button" disabled={generating} onClick={onRegenerate}>重新生成整曲解析</button>}{onDeleteAnalyses&&(hasAnalyses||generating)&&<button className="sentence-delete-all" type="button" onClick={onDeleteAnalyses}>删除整曲解析</button>}</div><small>主动生成时会将歌词发送给设置中的 AI 服务，可能产生调用费用。</small></div>
