import { Mic2, RotateCcw } from 'lucide-react'
import { SongCoverButton } from './AndroidLessonHeader'
import ReadingLyric from './ReadingLyric'

// 跟唱页只保留选曲、连续播放和歌词定位，避免复用逐句学习页的解析工具栏。
export default function AndroidSingAlong({ song, songs, artwork, audioReady, playing, currentLineId, onSelectSong, onPlayFromStart, onPlayFromLine, onToggle, error, onChoose, annotations, corrections, readingStyle }) {
  return <section className="android-sing" aria-labelledby="android-sing-title">
    {/* 旧头部为小封面和歌曲下拉框；改用与逐句页相同的大封面选歌。 */}
    {/* <label className="android-sing-song">选择歌曲<select value={song.id} onChange={(event) => onSelectSong(event.target.value)}>{songs.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.artist}</option>)}</select></label> */}
    <p className="android-study-mode" id="android-sing-title">跟唱练习</p><div className="android-study-song"><div><h1>{song.title}</h1><p>{song.artist}</p></div><SongCoverButton song={song} artwork={artwork} onChoose={onChoose} /></div>
    {/* 按用户要求移除独立暂停按钮，播放控制直接放在歌词点击操作中。 */}
    <div className="android-sing-controls"><button className="android-sing-start" type="button" disabled={!audioReady} onClick={onPlayFromStart}><RotateCcw size={17} /> 从头跟唱</button></div>
    <p className="android-sing-hint">{audioReady ? '点一句开始跟唱；再点正在唱的句子暂停，再点从句首继续。' : '这首歌尚无音频，请到歌曲库导入带音频的歌曲。'}</p>
    {error && <p className="android-sing-error" role="alert">{error}</p>}
    {/* 旧版渲染 line.text 和 line.translation；跟唱隐藏译文，并实时读取逐句页的人工注音。 */}
    <ol className="android-sing-lyrics">{song.lines.map((line, index) => <li key={line.id}><button className={currentLineId === line.id ? 'current' : ''} type="button" disabled={!audioReady} onClick={() => onPlayFromLine(line.id)} aria-label={`从第 ${index + 1} 句开始跟唱`}><span className="android-sing-number">{String(index + 1).padStart(2, '0')}</span><span className="android-sing-text"><strong lang="ja"><ReadingLyric text={line.text} tokens={annotations?.find((item) => item.id === line.id)?.tokens} corrections={corrections} songId={song.id} lineId={line.id} readingStyle={readingStyle} /></strong></span>{currentLineId === line.id && playing && <span className="android-sing-playing" aria-label="正在播放">♪</span>}</button></li>)}</ol>
  </section>
}
