import { useEffect, useState } from 'react'
import { MoreHorizontal, X } from 'lucide-react'
import ReadingStyleOptions from './ReadingStyleOptions'

// 原注音菜单（保留供对照）：
// <fieldset><legend>注音类型</legend>{[['hiragana', '假名'], ['romaji', '罗马音']].map(([value, label]) => <label key={value}><input type="radio" name="study-reading" value={value} checked={readingStyle === value} onChange={() => onReadingStyle(value)} />{label}</label>)}</fieldset>
// 封面是两个学习模式共用的选歌入口，不在页面重复放下拉选择器。
export function SongCoverButton({ song, artwork, onChoose }) {
  return <button className="android-study-cover" type="button" onClick={onChoose} aria-label={`选择歌曲，当前为${song.title}`}><span>{artwork?.artworkUrl ? <img src={artwork.artworkUrl} alt="" referrerPolicy="no-referrer" /> : song.title.slice(0, 2)}</span></button>
}

export default function AndroidLessonHeader({ song, artwork, learned, mode, onMode, readingStyle, onReadingStyle, onChoose, ready, generating, onGenerate, error, onWordDetails, onReview }) {
  const [more, setMore] = useState(false)
  useEffect(() => {
    if (!more) return undefined
    const back = (event) => { event.preventDefault(); setMore(false) }
    window.addEventListener('uta:navigate-back', back)
    return () => window.removeEventListener('uta:navigate-back', back)
  }, [more])
  return <header className="android-study-header">
    <p className="android-study-mode">逐句学习</p>
    <div className="android-study-song"><div><h1>{song.title}</h1><p>{song.artist}</p></div><SongCoverButton song={song} artwork={artwork} onChoose={onChoose} /></div>
    <div className="android-study-progress"><span>{learned} / {song.lines.length} 句已掌握</span><div><i style={{ width: `${song.lines.length ? learned / song.lines.length * 100 : 0}%` }} /></div></div>
    <div className="android-study-toolbar"><div className="android-study-segment" role="group" aria-label="歌词显示方式">{/* 原选项：[['original', '原文'], ['reading', '读音'], ['practice', '遮住']]；按用户要求仅保留两个入口。 */ [['original', '原文'], ['reading', '读音']].map(([value, label]) => <button key={value} type="button" className={(mode === 'practice' ? 'original' : mode) === value ? 'selected' : ''} aria-pressed={(mode === 'practice' ? 'original' : mode) === value} onClick={() => onMode(value)}>{label}</button>)}</div><button className="android-study-more" aria-label="更多学习选项" type="button" onClick={() => setMore(true)}><MoreHorizontal size={23} /></button></div>
    {error && <p className="android-study-error" role="alert">{error}</p>}
    {more && <div className="study-options-backdrop" onClick={() => setMore(false)}><section className="study-options" role="dialog" aria-modal="true" aria-label="更多学习选项" onClick={(event) => event.stopPropagation()}><header><h2>学习选项</h2><button type="button" aria-label="关闭学习选项" onClick={() => setMore(false)}><X size={20} /></button></header>{/* 原二选一假名/罗马音改为共用三选一组件。 */}<ReadingStyleOptions readingStyle={readingStyle} onReadingStyle={onReadingStyle} />{/* 复核侧重来源注音查漏，整曲解析仍用于语法词义。 */}<div className="study-ai"><strong>AI复核歌词</strong><p>检查遗漏读音与歌词异常，优先采用自带罗马音。</p><button type="button" onClick={() => { setMore(false); onReview() }}>复核歌词</button></div><div className="study-ai"><strong>整曲 AI 解析</strong><p>已生成 {ready} / {song.lines.length} 句</p><button type="button" disabled={generating || ready === song.lines.length} onClick={onGenerate}>{generating ? '正在后台生成…' : ready === song.lines.length ? '解析已完整' : '生成整曲解析'}</button><small>将歌词发送给设置中的 AI 服务，可能产生调用费用。生成期间可继续学习。</small></div>{/* 原当前词语详情入口停用，改用悬浮问 AI。 */}{false && <button className="study-word-details" type="button" onClick={() => { setMore(false); onWordDetails() }}>当前词语详情</button>}</section></div>}
  </header>
}

// 倍速控件固定在右下角、底栏上方，滚动歌词时仍然可见。
export function FloatingPlaybackSpeed({ rate, onChange }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return undefined
    const back = (event) => { event.preventDefault(); setOpen(false) }
    window.addEventListener('uta:navigate-back', back)
    return () => window.removeEventListener('uta:navigate-back', back)
  }, [open])
  return <div className="study-floating-speed">{open && <div className="study-speed-options" role="group" aria-label="选择播放速度">{[1, 0.75, 0.5, 0.25].map((value) => <button key={value} type="button" aria-pressed={rate === value} onClick={() => { onChange(value); setOpen(false) }}>{value}×</button>)}</div>}<button className="study-speed-trigger" type="button" aria-label="逐句播放速度" aria-expanded={open} onClick={() => setOpen(!open)}>{rate}×</button></div>
}
