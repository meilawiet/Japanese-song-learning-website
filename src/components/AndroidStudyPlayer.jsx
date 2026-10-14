import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronDown, LoaderCircle, MoreHorizontal, Pause, Play, X } from 'lucide-react'
import { SongCoverButton } from './AndroidLessonHeader'
import ReadingStyleOptions from './ReadingStyleOptions'
import useModalScrollLock from '../lib/useModalScrollLock'

const timeLabel = value => `${String(Math.floor((value || 0) / 60)).padStart(2, '0')}:${String(Math.floor((value || 0) % 60)).padStart(2, '0')}`

// 学习与跟唱共享紧凑页头，歌曲封面仍然负责选歌；旧双入口页头保留供对照。
export function AndroidStudyHeader({ song, artwork, learned, onChoose, error }) {
  // 原紧凑版把进度放在封面左侧；恢复旧版的独立整行进度，歌曲信息和歌词之间更清晰。
  // <div className="android-study-song"><div>歌名、歌手、学习进度</div><SongCoverButton /></div>
  return <header className="android-study-header unified-study-header"><div className="android-study-song"><div><h1>{song.title}</h1><p>{song.artist}</p></div><SongCoverButton song={song} artwork={artwork} onChoose={onChoose} /></div><div className="android-study-progress"><span>{learned} / {song.lines.length} 句已掌握</span><div><i style={{ width: `${song.lines.length ? learned / song.lines.length * 100 : 0}%` }} /></div></div>{error && <p className="android-study-error" role="alert">{error}</p>}</header>
}

export default function AndroidStudyPlayer({ transport, rate, onRate, readingStyle, onReadingStyle, showTranslation, onTranslation, chat, onReview, ready, total, generating, onGenerate }) {
  const state = useSyncExternalStore(transport.subscribe, transport.getSnapshot, transport.getSnapshot)
  const [panel, setPanel] = useState(null)
  const [scrub, setScrub] = useState(null)
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
  const shownTime = scrub ?? state.time
  return <footer className="unified-study-player" ref={root} aria-label="学习播放器">
    <p className="study-timeline-note" role="status">{!state.ready ? '歌词缺少完整时间戳，可阅读和编辑，补全后可跟随播放。' : state.silent ? `仅歌词 · ${state.mode === 'continuous' ? '静音跟唱' : '静音计时'}` : '\u00a0'}</p>
    <div className="study-seek"><span>{timeLabel(shownTime)}</span><input type="range" aria-label="歌曲播放进度" min="0" max={state.duration || 0} step="0.01" value={shownTime} disabled={!state.ready || !state.duration} onPointerDown={() => setScrub(state.time)} onChange={event => { const time = Number(event.target.value); setScrub(time); transport.seek(time) }} onPointerUp={() => setScrub(null)} onPointerCancel={() => setScrub(null)} onBlur={() => setScrub(null)} onKeyUp={() => setScrub(null)} /><span>{timeLabel(state.duration)}</span></div>
    <div className="study-player-controls"><div className="study-player-left"><button type="button" className="study-mode-trigger" aria-label="选择练习模式" aria-expanded={panel === 'mode'} onClick={() => setPanel(panel === 'mode' ? null : 'mode')}>{state.mode === 'sentence' ? '逐句学习' : '连续跟唱'}<ChevronDown size={13} /></button></div><button className="study-central-play" type="button" aria-label={state.busy ? '取消载入' : state.playing ? '暂停播放' : '开始播放'} disabled={!state.ready} onClick={transport.toggle}>{state.busy ? <LoaderCircle size={24} className="spin" /> : state.playing ? <Pause size={24} fill="currentColor" /> : <Play size={25} fill="currentColor" />}</button><div className="study-player-right"><button type="button" className="study-rate-trigger" aria-label="选择播放倍速" aria-expanded={panel === 'rate'} onClick={() => setPanel(panel === 'rate' ? null : 'rate')}>{rate}×</button>{chat}<button type="button" className="study-more-trigger" aria-label="更多学习选项" aria-expanded={panel === 'more'} onClick={() => setPanel(panel === 'more' ? null : 'more')}><MoreHorizontal size={21} /></button></div></div>
    {panel && <div className="study-options-backdrop unified-options-backdrop" onClick={() => setPanel(null)}><section className="study-options unified-study-options" role="dialog" aria-modal="true" aria-label={panel === 'more' ? '更多学习选项' : panel === 'mode' ? '选择练习模式' : '选择播放倍速'} onClick={event => event.stopPropagation()}><header><h2>{panel === 'more' ? '更多' : panel === 'mode' ? '练习模式' : '播放倍速'}</h2><button type="button" aria-label="关闭学习选项" onClick={() => setPanel(null)}><X size={22} /></button></header>{panel === 'mode' ? <div className="study-mode-options">{[['sentence', '逐句学习', '播放选中句，句末停下'], ['continuous', '连续跟唱', '按时间轴连续播放后续歌词']].map(([value, label, note]) => <button type="button" key={value} aria-pressed={state.mode === value} onClick={() => { transport.setMode(value); setPanel(null) }}><strong>{label}</strong><small>{note}</small></button>)}</div> : panel === 'rate' ? <div className="study-rate-options">{[1, 0.75, 0.5, 0.25].map(value => <button key={value} type="button" aria-pressed={rate === value} onClick={() => { onRate(value); setPanel(null) }}>{value}×</button>)}</div> : <><ReadingStyleOptions readingStyle={readingStyle} onReadingStyle={onReadingStyle} includeNone /><label className="study-translation-toggle"><span>显示翻译</span><input type="checkbox" role="switch" checked={showTranslation} onChange={event => onTranslation(event.target.checked)} /></label><div className="study-ai"><strong>AI复核歌词</strong><p>查看读音、分词建议及历史记录。</p><button type="button" onClick={() => { setPanel(null); onReview() }}>复核歌词</button></div><div className="study-ai"><strong>整曲 AI 解析</strong><p>已生成 {ready} / {total} 句</p><button type="button" disabled={generating || ready === total} onClick={onGenerate}>{generating ? '正在后台生成…' : ready === total ? '解析已完整' : '生成整曲解析'}</button><small>主动生成时会将歌词发送给设置中的 AI 服务，可能产生调用费用。</small></div></>}</section></div>}
  </footer>
}
