import { useEffect, useState } from 'react'
import { PLAYBACK_RATES } from '../lib/playbackRate'
import { BookOpenCheck, Mic2, Library, RotateCcw, Settings, FolderOpen, Music2, Search, Upload, Heart, Play, Pause, Pencil, Image, Trash2, ChevronRight, SkipBack, SkipForward, Volume2, ListTodo } from 'lucide-react'
import DesktopResizeHandle from './DesktopResizeHandle'
import utaIcon from '../../desktop/icon.png'

export function DesktopChrome({ page, song, songs, reviewCount, onLesson, onSingAlong, onLibrary, onReview, onSettings, onSong, onTasks, taskCount, sidebarWidth, onSidebarWidth, editUndo }) {
  return <>
    <header className="desktop-titlebar"><span className="desktop-app-icon"><img src={utaIcon} alt="" /></span><b>UTA</b><span className="desktop-window-caption">日语歌学习</span><div className="desktop-menu">{[['file', '文件'], ['edit', '编辑'], ['view', '视图'], ['help', '帮助']].map(([id, label]) => <button key={id} type="button" onClick={() => window.utaDesktop.openMenu(id)}>{label}</button>)}</div><span className="desktop-title-context">{song.title}</span></header>
    <aside className="desktop-sidebar" aria-label="桌面导航">
      <div className="desktop-product"><span><img src={utaIcon} alt="" /></span><div><b>UTA</b><small>日语歌学习工作室</small></div></div>
      <nav>{[[onLesson, 'lesson', BookOpenCheck, '发音学习'], [onSingAlong, 'sing-along', Mic2, '跟唱练习'], [onLibrary, 'library', Library, '歌曲库'], [onReview, 'review-list', RotateCcw, '复习']].map(([action, id, Icon, label]) => <button key={id} type="button" aria-current={page === id ? 'page' : undefined} onClick={action}><Icon size={18}/><span>{label}</span>{id === 'review-list' && reviewCount > 0 && <small>{reviewCount}</small>}</button>)}<button type="button" onClick={onTasks} aria-label="打开任务面板"><ListTodo size={18}/><span>任务面板</span>{taskCount > 0 && <small>{taskCount}</small>}</button></nav>
      <div className="desktop-sidebar-section"><span>快速打开</span><div className="desktop-recent">{songs.filter(item => !item.isDemo).slice(0, 8).map(item => <button key={item.id} type="button" className={item.id === song.id ? 'current' : ''} onClick={() => onSong(item.id)} title={`${item.title} · ${item.artist}`}><Music2 size={15}/><span>{item.title}<small>{item.artist}</small></span></button>)}</div></div>
      <div className="desktop-sidebar-bottom">{editUndo && <div className="desktop-edit-checkpoint"><p>《{editUndo.title}》已保存，可恢复到本次编辑前的歌曲与学习记录。</p><button type="button" disabled={editUndo.busy} onClick={editUndo.onUndo}>撤销本次歌曲编辑</button><button type="button" disabled={editUndo.busy} onClick={editUndo.onDismiss}>关闭撤销提示</button></div>}<button type="button" onClick={() => window.utaDesktop.openDataFolder()}><FolderOpen size={17}/>数据文件夹</button><button type="button" onClick={onSettings}><Settings size={17}/>设置</button><small>WINDOWS EDITION · 1.2</small></div>
      <DesktopResizeHandle label="调整导航栏宽度" value={sidebarWidth} min={176} max={320} onChange={onSidebarWidth} onReset={() => onSidebarWidth(204)}/>
    </aside>
  </>
}

export function DesktopSongHeader({ song, artwork, learned, progress, favorite, busy, onFavorite, onReview, onSingAlong }) {
  return <header className="desktop-song-header">
    <Cover song={song} artwork={artwork}/><div className="desktop-song-copy"><span>学习工作区</span><h1 id="song-title">{song.title}</h1><p>{song.artist}<i/> {song.lines.length} 句歌词 <i/> 已掌握 {learned} 句</p></div>
    <div className="desktop-song-progress"><strong>{progress}%</strong><span>学习进度</span><div><i style={{ width: `${progress}%` }}/></div></div>
    <div className="desktop-song-actions"><button type="button" aria-label={favorite ? '取消收藏' : '收藏歌曲'} aria-pressed={favorite} onClick={onFavorite}><Heart size={16} fill={favorite ? 'currentColor' : 'none'}/></button><button type="button" disabled={busy} onClick={onReview}>AI 复核</button><button className="desktop-primary" type="button" onClick={onSingAlong}><Mic2 size={15}/>跟唱练习</button></div>
  </header>
}

function Cover({ song, artwork }) { return <span className="desktop-cover">{artwork?.artworkUrl ? <img src={artwork.artworkUrl} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }}/>: <Music2 size={24}/>}</span> }

export function DesktopLibrary({ songs, search, onSearch, favoriteIds, learnedBySong, activeId, artworkFor, onOpen, onImport, onEdit, onArtwork, onDelete, deletingId }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('default')
  const [selectedId, setSelectedId] = useState(activeId)
  let visible = songs.filter(song => !song.isDemo && (filter === 'all' || favoriteIds.includes(song.id)))
  if (sort === 'title') visible = [...visible].sort((a, b) => a.title.localeCompare(b.title, 'ja'))
  const selected = visible.find(song => song.id === selectedId) || visible[0]
  useEffect(() => { if (selected) setSelectedId(selected.id) }, [selected?.id])
  const learned = song => (learnedBySong[song.id] || []).filter(id => song.lines.some(line => line.id === id)).length
  return <section className="desktop-library" aria-labelledby="library-title">
    <header className="desktop-page-heading"><div><span>我的音乐</span><h1 id="library-title">歌曲库</h1></div><button className="desktop-primary" type="button" onClick={onImport}><Upload size={16}/>导入歌曲</button></header>
    <div className="desktop-library-toolbar"><div className="desktop-segment">{[['all', '全部歌曲'], ['favorites', '我的收藏']].map(([id,label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div><label className="desktop-search"><Search size={16}/><input id="library-search" type="search" aria-label="搜索歌名或歌手" placeholder="搜索歌名或歌手  Ctrl+F" value={search} onChange={e => onSearch(e.target.value)}/></label><select aria-label="歌曲排序" value={sort} onChange={e => setSort(e.target.value)}><option value="default">导入顺序</option><option value="title">歌曲名称</option></select></div>
    <div className="desktop-library-body"><div className="desktop-song-table-wrap"><table className="desktop-song-table"><thead><tr><th>歌曲</th><th>歌手</th><th>学习进度</th><th>来源</th></tr></thead><tbody>{visible.map(song => <tr key={song.id} className={selected?.id === song.id ? 'selected' : ''} onClick={() => setSelectedId(song.id)} onDoubleClick={() => onOpen(song.id)}><td><button type="button" className="desktop-song-select" aria-label={`选择 ${song.title}`} aria-pressed={selected?.id === song.id} onClick={() => setSelectedId(song.id)}><Cover song={song} artwork={artworkFor(song)}/><span><b>{song.title}</b><small>{song.lines.length} 句歌词{song.id === activeId ? ' · 正在学习' : ''}</small></span>{favoriteIds.includes(song.id) && <Heart size={13}/>}</button></td><td>{song.artist}</td><td><span className="desktop-table-progress"><i style={{width: `${Math.round(learned(song)/song.lines.length*100)}%`}}/></span><small>{learned(song)} / {song.lines.length}</small></td><td>{song.isLocal ? '本机导入' : song.isDemo ? '内置示例' : '项目歌曲'}</td></tr>)}</tbody></table>{!visible.length && <div className="desktop-empty"><Search size={32}/><h2>{search ? '没有匹配的歌曲' : '还没有歌曲'}</h2><p>{search ? '试试其他名称，或导入一首新歌。' : '点击右上角的“导入歌曲”，添加音频和歌词。'}</p></div>}</div>
      {selected && <aside className="desktop-song-inspector"><Cover song={selected} artwork={artworkFor(selected)}/><h2>{selected.title}</h2><p>{selected.artist}</p><dl><div><dt>歌词</dt><dd>{selected.lines.length} 句</dd></div><div><dt>已掌握</dt><dd>{learned(selected)} 句</dd></div><div><dt>来源</dt><dd>{selected.isLocal ? '本机导入' : '内置示例'}</dd></div></dl><button className="desktop-primary" type="button" onClick={() => onOpen(selected.id)} aria-label={`学习 ${selected.title}，${selected.artist}`}><BookOpenCheck size={16}/>开始学习<ChevronRight size={15}/></button>{selected.isLocal && <button type="button" onClick={() => onEdit(selected)}><Pencil size={15}/>编辑歌曲信息</button>}<button type="button" onClick={() => onArtwork(selected)}><Image size={15}/>更换封面</button>{selected.isLocal && <button className="desktop-danger" type="button" disabled={deletingId === selected.id} onClick={() => onDelete(selected)}><Trash2 size={15}/>删除歌曲</button>}<small>双击列表中的歌曲可以直接开始学习。</small></aside>}
    </div><div className="desktop-list-status">{visible.length} 首歌曲<span>歌词、音频与学习记录保存在本机</span></div>
  </section>
}

export function DesktopReview({ queue, onSingAlong }) {
  return <section className="desktop-review"><header className="desktop-page-heading"><div><span>巩固与练习</span><h1>待复习的句子</h1></div><span className="desktop-count">{queue.length} 句</span></header><p className="desktop-review-note">选择一句进入跟唱并定位；点击歌词即可连续播放。掌握状态仍可在发音学习页调整。</p><div className="desktop-review-scroll">{queue.length ? <ol>{queue.map(({song,line}) => <li key={`${song.id}:${line.id}`}><div><span>{song.title} · 第 {line.displayNumber} 句</span><b lang="ja">{line.text}</b>{line.translation && <p>{line.translation}</p>}</div><button type="button" onClick={() => onSingAlong(song.id,line.id)}>前往跟唱<ChevronRight size={16}/></button></li>)}</ol> : <div className="desktop-empty"><BookOpenCheck size={40}/><h2>复习清单已清空</h2><p>学习时把没把握的句子加入这里，稍后再练。</p></div>}</div></section>
}

const time = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`
export function DesktopPlayer({ song, artwork, available, playing, currentTime, duration, rate, onToggle, onSeek, onRate, onPrevious, onNext, volume, onVolume }) {
  return <section className="desktop-player" aria-label="播放控制"><div className="desktop-player-song"><Cover song={song} artwork={artwork}/><div><b>{song.title}</b><span>{available ? song.artist : '未导入音频 · 可继续学习歌词'}</span></div></div><div className="desktop-player-center"><div className="desktop-player-buttons"><button type="button" disabled={!available} aria-label="播放上一句" onClick={onPrevious}><SkipBack size={17}/></button><button className="desktop-play" type="button" disabled={!available} aria-label={playing ? '暂停歌曲' : '播放歌曲'} onClick={onToggle}>{playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button><button type="button" disabled={!available} aria-label="播放下一句" onClick={onNext}><SkipForward size={17}/></button></div><div className="desktop-seek"><span>{time(currentTime)}</span><input aria-label="播放进度" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 0)} disabled={!available || !duration} onChange={e => onSeek(Number(e.target.value))}/><span>{time(duration)}</span></div></div><div className="desktop-player-options"><select aria-label="歌曲播放速度" value={rate} onChange={e => onRate(Number(e.target.value))}>{PLAYBACK_RATES.map(r => <option key={r} value={r}>{r}×</option>)}</select><Volume2 size={17}/><input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => onVolume(Number(e.target.value))} aria-label="音量"/></div></section>
}

export function DesktopStatusBar({ error }) {
  return <div className="desktop-statusbar"><span><i/>{error || '本地注音与词典已就绪'}</span><span>UTA · Windows x64</span></div>
}
