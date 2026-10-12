// 原图标导入：import { Mic2, RotateCcw } from 'lucide-react'
// 原导入：import { useEffect, useState } from 'react'
import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, RotateCcw, X } from 'lucide-react'
import ReadingStyleOptions from './ReadingStyleOptions'
import { lineReading } from '../lib/readingDisplay'
import { SongCoverButton } from './AndroidLessonHeader'
import ReadingLyric from './ReadingLyric'

// 跟唱页只保留选曲、连续播放和歌词定位，避免复用逐句学习页的解析工具栏。
export default function AndroidSingAlong({ song, songs, artwork, audioReady, playing, currentLineId, onSelectSong, onPlayFromStart, onPlayFromLine, onToggle, error, onChoose, annotations, corrections, readingStyle, onReadingStyle }) {
  // 跟唱更多菜单只提供注音选择；系统返回先关闭菜单。
  const [more, setMore] = useState(false)
  const container = useRef(null)
  // 当前句变化或继续播放时居中；暂停不抢滚动，关闭菜单后恢复跟随。
  useEffect(() => {
    if (!playing || more || currentLineId == null) return undefined
    const follow = () => {
      // 弹窗开启时不滚动背后的歌词；字号变化与窗口变化后重新计算位置。
      if (document.body.style.overflow === 'hidden') return
      const list = container.current?.querySelector('.android-sing-lyrics')
      const first = list?.querySelector('button')
      if (first) {
        const rect = first.getBoundingClientRect(), padding = parseFloat(list.style.paddingTop) || 0
        // 高屏幕也为第1句留出居中空间，末句空间由样式中的底部留白提供。
        list.style.paddingTop = `${Math.max(0, innerHeight / 2 - (rect.top + scrollY + rect.height / 2 - padding))}px`
      }
      // 歌词已提交到 DOM，直接定位，避免后台帧调度延迟导致跟随滞后。
      container.current?.querySelector('button.current')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    follow()
    window.addEventListener('resize', follow)
    window.addEventListener('uta:appearance-changed', follow)
    return () => { window.removeEventListener('resize', follow); window.removeEventListener('uta:appearance-changed', follow) }
  }, [song.id, currentLineId, playing, more, readingStyle])
  useEffect(() => {
    if (!more) return undefined
    const back = (event) => { event.preventDefault(); setMore(false) }
    window.addEventListener('uta:navigate-back', back)
    return () => window.removeEventListener('uta:navigate-back', back)
  }, [more])
  return <section ref={container} className="android-sing" aria-labelledby="android-sing-title">
    {/* 旧头部为小封面和歌曲下拉框；改用与逐句页相同的大封面选歌。 */}
    {/* <label className="android-sing-song">选择歌曲<select value={song.id} onChange={(event) => onSelectSong(event.target.value)}>{songs.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.artist}</option>)}</select></label> */}
    <p className="android-study-mode" id="android-sing-title">跟唱练习</p><div className="android-study-song"><div><h1>{song.title}</h1><p>{song.artist}</p></div><SongCoverButton song={song} artwork={artwork} onChoose={onChoose} /></div>
    {/* 按用户要求移除独立暂停按钮，播放控制直接放在歌词点击操作中。 */}
    <div className="android-sing-controls"><button className="android-sing-start" type="button" disabled={!audioReady} onClick={onPlayFromStart}><RotateCcw size={17} /> 从头跟唱</button>{/* 新增与逐句一致的更多入口。 */}<button className="android-study-more" type="button" aria-label="更多跟唱选项" aria-expanded={more} onClick={() => setMore(true)}><MoreHorizontal size={23} /></button></div>
    <p className="android-sing-hint">{audioReady ? '点一句开始跟唱；再点正在唱的句子暂停，再点从句首继续。' : '这首歌尚无音频，请到歌曲库导入带音频的歌曲。'}</p>
    {error && <p className="android-sing-error" role="alert">{error}</p>}
    {/* 旧版渲染 line.text 和 line.translation；跟唱隐藏译文，并实时读取逐句页的人工注音。 */}
    <ol className="android-sing-lyrics">{song.lines.map((line, index) => <li key={line.id}><button className={currentLineId === line.id ? 'current' : ''} type="button" disabled={!audioReady} onClick={() => onPlayFromLine(line.id)} aria-label={`从第 ${index + 1} 句开始跟唱`}><span className="android-sing-number">{String(index + 1).padStart(2, '0')}</span><span className="android-sing-text"><strong lang="ja"><ReadingLyric importedRomaji={line.romaji} text={line.text} tokens={annotations?.find((item) => item.id === line.id)?.tokens} corrections={corrections} songId={song.id} lineId={line.id} readingStyle={readingStyle} /></strong>{/* 双注音补充完整读音行，纯假名歌词也能对照罗马音。 */}{(readingStyle === 'both' || readingStyle === 'romaji' && line.romaji) && <small className="dual-line-reading">{lineReading(annotations?.find((item) => item.id === line.id)?.tokens, corrections, song.id, line.id, readingStyle, line.romaji)}</small>}</span>{currentLineId === line.id && playing && <span className="android-sing-playing" aria-label="正在播放">♪</span>}</button></li>)}</ol>
    {more && <div className="study-options-backdrop" onClick={() => setMore(false)}><section className="study-options" role="dialog" aria-modal="true" aria-label="更多跟唱选项" onClick={(event) => event.stopPropagation()}><header><h2>跟唱选项</h2><button type="button" aria-label="关闭跟唱选项" onClick={() => setMore(false)}><X size={20} /></button></header><ReadingStyleOptions readingStyle={readingStyle} onReadingStyle={onReadingStyle} name="sing-reading" /></section></div>}
  </section>
}
