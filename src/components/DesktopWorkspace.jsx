import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { captureScrollPosition, restoreScrollPosition, keepRowInView } from '../lib/desktopEditPosition'
import { PLAYBACK_RATES } from '../lib/playbackRate'
import { BookOpenCheck, Mic2, Library, RotateCcw, Settings, FolderOpen, Music2, Search, Upload, Heart, Play, Pause, Pencil, Image, Trash2, ChevronRight, SkipBack, SkipForward, Volume2, ListTodo, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, MoreHorizontal, X } from 'lucide-react'
import DesktopResizeHandle from './DesktopResizeHandle'
import DesktopPane from './DesktopPane'
import DesktopSongTitle from './DesktopSongTitle'
import utaIcon from '../../desktop/icon.png'
import appPackage from '../../package.json'

export function DesktopChrome({ page, song, songs, artworkFor = () => null, reviewCount, onLesson, onSingAlong, onLibrary, onReview, onSettings, onSong, onTasks, taskCount, sidebarWidth, onSidebarWidth, editUndo, sidebarOpen = true, sidebarDrawer = false, sidebarCompact = false, onCloseSidebar, wordPanelOpen = false, canToggleWordPanel = false, onToggleSidebar, onToggleWordPanel }) {
  const navToggle = useRef(null)

  function dismissSidebar() {
    onCloseSidebar()
    requestAnimationFrame(() => navToggle.current?.focus({ preventScroll: true }))
  }

  function runNavigation(action, ...args) {
    if (sidebarDrawer) onCloseSidebar()
    action(...args)
  }

  return <>
    <header className="desktop-titlebar"><span className="desktop-app-icon"><img src={utaIcon} alt="" /></span><b>UTA</b><span className="desktop-window-caption">日语歌学习</span><div className="desktop-menu">{[['file', '文件'], ['edit', '编辑'], ['view', '视图'], ['help', '帮助']].map(([id, label]) => <button key={id} type="button" onClick={() => window.utaDesktop.openMenu(id)}>{label}</button>)}</div><span className="desktop-title-context">{song.title}</span><div className="desktop-pane-toggles" aria-label="边栏显示"><button ref={navToggle} type="button" aria-label={sidebarOpen ? '收起左侧栏' : '展开左侧栏'} title={page === 'sing-along' ? '跟唱模式已隐藏导航栏' : sidebarOpen ? '收起左侧栏' : '展开左侧栏'} aria-controls="desktop-navigation" aria-expanded={sidebarOpen && page !== 'sing-along'} disabled={page === 'sing-along'} onClick={onToggleSidebar}>{sidebarOpen ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}</button><button type="button" aria-label={wordPanelOpen ? '收起右侧栏' : '展开右侧栏'} title={canToggleWordPanel ? wordPanelOpen ? '收起右侧栏' : '展开右侧栏' : '在发音学习中查看词语详情'} data-desktop-pane-toggle="right" aria-controls="desktop-word-panel" aria-expanded={wordPanelOpen && canToggleWordPanel} disabled={!canToggleWordPanel} onClick={onToggleWordPanel}>{wordPanelOpen ? <PanelRightClose size={17}/> : <PanelRightOpen size={17}/>}</button></div></header>
    <DesktopPane side="left" modal={sidebarDrawer && sidebarOpen && page !== 'sing-along'} label="桌面导航" onDismiss={dismissSidebar}>
    <aside id="desktop-navigation" className="desktop-sidebar" aria-label="桌面导航" hidden={!sidebarOpen}>
      {sidebarDrawer && <button type="button" className="desktop-nav-dismiss" aria-label="关闭导航" onClick={dismissSidebar}><X size={17}/></button>}
      <div className="desktop-product"><span><img src={utaIcon} alt="" /></span><div><b>UTA</b><small>日语歌学习工作室</small></div></div>
      <nav>{[[onLesson, 'lesson', BookOpenCheck, '发音学习'], [onSingAlong, 'sing-along', Mic2, '跟唱练习'], [onLibrary, 'library', Library, '歌曲库'], [onReview, 'review-list', RotateCcw, '复习']].map(([action, id, Icon, label]) => <button key={id} type="button" aria-current={page === id ? 'page' : undefined} aria-label={sidebarCompact ? label : undefined} title={label} onClick={() => runNavigation(action)}><Icon size={18}/><span>{label}</span>{id === 'review-list' && reviewCount > 0 && <small>{reviewCount}</small>}</button>)}<button type="button" onClick={() => runNavigation(onTasks)} aria-label="打开任务面板" title="任务面板"><ListTodo size={18}/><span>任务面板</span>{taskCount > 0 && <small>{taskCount}</small>}</button></nav>
      <div className="desktop-sidebar-section"><span>快速打开</span><div className="desktop-recent">{songs.filter(item => !item.isDemo).slice(0, 8).map(item => <button key={item.id} type="button" className={item.id === song.id ? 'current' : ''} onClick={() => runNavigation(onSong, item.id)} title={`${item.title} · ${item.artist}`}><Cover song={item} artwork={artworkFor(item)}/><span className="desktop-recent-copy"><b>{item.title}</b><small>{item.artist}</small></span></button>)}</div></div>
      <div className="desktop-sidebar-bottom">{editUndo && <div className="desktop-edit-checkpoint"><p>《{editUndo.title}》已保存，可恢复到本次编辑前的歌曲与学习记录。</p><button type="button" disabled={editUndo.busy} onClick={editUndo.onUndo}>撤销本次歌曲编辑</button><button type="button" disabled={editUndo.busy} onClick={editUndo.onDismiss}>关闭撤销提示</button></div>}<button type="button" title="数据文件夹" aria-label="数据文件夹" onClick={() => runNavigation(() => window.utaDesktop.openDataFolder())}><FolderOpen size={17}/><span>数据文件夹</span></button><button type="button" title="设置" aria-label="设置" onClick={() => runNavigation(onSettings)}><Settings size={17}/><span>设置</span></button><small>WINDOWS EDITION · {appPackage.version}</small></div>
      {!sidebarCompact && !sidebarDrawer && <DesktopResizeHandle label="调整导航栏宽度" value={sidebarWidth} min={176} max={320} onChange={onSidebarWidth} onReset={() => onSidebarWidth(204)}/>}
    </aside>
    </DesktopPane>
  </>
}

export function DesktopSongHeader({ song, artwork, learned, progress, favorite, onFavorite, onSingAlong }) {
  return <header className="desktop-song-header">
    <Cover song={song} artwork={artwork}/><div className="desktop-song-copy"><span>学习工作区</span><DesktopSongTitle id="song-title" title={song.title}/><p>{song.artist}<i/> {song.lines.length} 句歌词 <i/> 已掌握 {learned} 句</p></div>
    <div className="desktop-song-progress"><strong>{progress}%</strong><span>学习进度</span><div><i style={{ width: `${progress}%` }}/></div></div>
    <div className="desktop-song-actions"><button type="button" aria-label={favorite ? '取消收藏' : '收藏歌曲'} aria-pressed={favorite} onClick={onFavorite}><Heart size={16} fill={favorite ? 'currentColor' : 'none'}/></button><button className="desktop-primary" type="button" onClick={onSingAlong}><Mic2 size={15}/>跟唱练习</button></div>
  </header>
}

function Cover({ artwork }) {
  const url = artwork?.artworkUrl
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [url])
  return <span className="desktop-cover" aria-hidden="true">{url && !failed ? <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <Music2 size={24}/>}</span>
}

export function DesktopLibrary({ songs, allSongs, search, onSearch, favoriteIds, learnedBySong, activeId, artworkFor, onOpen, onBatchAi, onSingAlong, onImport, onEdit, onArtwork, onDelete, deletingId, view, editing }) {
  const [filter, setFilter] = useState(view.current.filter || 'all')
  const [sort, setSort] = useState(view.current.sort || 'default')
  const [selectedId, setSelectedId] = useState(view.current.selectedId ?? activeId)
  const [inspectorOpen, setInspectorOpen] = useState(() => view.current.inspectorOpen ?? window.innerWidth > 1250)
  const [moreId, setMoreId] = useState(null)
  const [menuLayout, setMenuLayout] = useState({ opensUp: false, maxHeight: undefined })
  const tableRef = useRef(null)
  const restoreRef = useRef(view.current.position)
  const editPositionRef = useRef(null)
  useEffect(() => {
    const outside = event => { if (!event.target.closest('.desktop-library-row-actions')) setMoreId(null) }
    const key = event => { if (event.key === 'Escape') setMoreId(null) }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key) }
  }, [])
  let visible = songs.filter(song => !song.isDemo && (filter === 'all' || favoriteIds.includes(song.id)))
  if (sort === 'title') visible = [...visible].sort((a, b) => a.title.localeCompare(b.title, 'ja'))
  const selected = allSongs.find(song => !song.isDemo && song.id === selectedId) || visible[0]

  function capturePosition() {
    const container = tableRef.current
    const rows = Array.from(container.querySelectorAll('tbody tr'))
    const top = container.getBoundingClientRect().top + container.querySelector('thead').offsetHeight
    const anchor = rows.find(row => row.getBoundingClientRect().bottom > top)
    const selectedRow = rows.find(row => row.dataset.songId === selected?.id)
    const bounds = selectedRow?.getBoundingClientRect()
    return { ...captureScrollPosition(container, anchor), anchorId: anchor?.dataset.songId,
      selectedVisible: Boolean(bounds && bounds.top >= top - 1 && bounds.bottom <= container.getBoundingClientRect().bottom + 1) }
  }

  function toggleSongMenu(songId, event) {
    if (moreId === songId) { setMoreId(null); return }
    const container = tableRef.current
    const list = container.getBoundingClientRect()
    const trigger = event.currentTarget.parentElement.getBoundingClientRect()
    const above = trigger.top - list.top - container.querySelector('thead').offsetHeight - 6
    const below = list.bottom - trigger.bottom - 6
    const opensUp = below < 164 && above > below
    setMenuLayout({ opensUp, maxHeight: Math.max(32, opensUp ? above : below) })
    setMoreId(songId)
  }
  function editSong(action, song) {
    editPositionRef.current = capturePosition()
    action(song)
  }

  function resetPosition() {
    view.current.position = null
    tableRef.current.scrollTop = 0
  }

  useLayoutEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
    Object.assign(view.current, { filter, sort, selectedId: selected?.id, inspectorOpen })
    if (editing) return
    const afterEdit = editPositionRef.current
    const position = afterEdit || restoreRef.current
    if (!position) return
    editPositionRef.current = null
    restoreRef.current = null
    const container = tableRef.current
    const rows = Array.from(container.querySelectorAll('tbody tr'))
    const selectedRow = rows.find(row => row.dataset.songId === selected?.id)
    restoreScrollPosition(container, rows.find(row => row.dataset.songId === position.anchorId), position)
    if (position.selectedVisible) keepRowInView(container, selectedRow, container.querySelector('thead').offsetHeight)
    view.current.position = capturePosition()
    if (afterEdit) (selectedRow?.querySelector('.desktop-song-select') || document.getElementById('library-search'))?.focus({ preventScroll: true })
  })

  const learned = song => (learnedBySong[song.id] || []).filter(id => song.lines.some(line => line.id === id)).length
  return <section className="desktop-library" aria-labelledby="library-title">
    <header className="desktop-page-heading"><div><span>我的音乐</span><h1 id="library-title">歌曲库</h1></div><div className="desktop-library-heading-actions"><button type="button" onClick={onBatchAi}>批量 AI</button><button className="desktop-primary" type="button" onClick={onImport}><Upload size={16}/>导入歌曲</button></div></header>
    <div className="desktop-library-toolbar"><div className="desktop-segment">{[['all', '全部歌曲'], ['favorites', '我的收藏']].map(([id,label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => { if (filter !== id) { resetPosition(); setSelectedId(null); setFilter(id) } }}>{label}</button>)}</div><label className="desktop-search"><Search size={16}/><input id="library-search" type="search" aria-label="搜索歌名或歌手" placeholder="搜索歌名或歌手  Ctrl+F" value={search} onChange={e => { resetPosition(); setSelectedId(null); onSearch(e.target.value) }}/></label><select aria-label="歌曲排序" value={sort} onChange={e => { resetPosition(); setSort(e.target.value) }}><option value="default">导入顺序</option><option value="title">歌曲名称</option></select><button type="button" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(value => !value)}>歌曲详情</button></div>
    <div className="desktop-library-body"><div className="desktop-song-table-wrap" ref={tableRef} onScroll={() => { if (!editing) view.current.position = capturePosition() }}><table className="desktop-song-table"><thead><tr><th>歌曲</th><th>歌手</th><th>学习进度</th><th>操作</th></tr></thead><tbody>{visible.map(song => <tr key={song.id} data-song-id={song.id} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(song.id) }} aria-selected={selected?.id === song.id} className={selected?.id === song.id ? 'selected' : ''} onClick={() => setSelectedId(song.id)} onDoubleClick={() => onOpen(song.id)}><td><button type="button" className="desktop-song-select" aria-label={`选择 ${song.title}`} aria-pressed={selected?.id === song.id} onClick={() => setSelectedId(song.id)}><Cover song={song} artwork={artworkFor(song)}/><span><b>{song.title}</b><small>{song.lines.length} 句歌词{song.id === activeId ? ' · 正在学习' : ''}</small></span>{favoriteIds.includes(song.id) && <Heart size={13}/>}</button></td><td>{song.artist}</td><td><span className="desktop-table-progress"><i style={{width: `${Math.round(learned(song)/song.lines.length*100)}%`}}/></span><small>{learned(song)} / {song.lines.length}</small></td><td><div className="desktop-library-row-actions" onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}><button type="button" className="desktop-library-start" onClick={() => onOpen(song.id)}>开始学习</button><button type="button" aria-label={`${song.title}更多操作`} aria-expanded={moreId === song.id} onClick={event => toggleSongMenu(song.id, event)}><MoreHorizontal size={16}/></button>{moreId === song.id && <div className={`desktop-library-row-menu${menuLayout.opensUp ? " opens-up" : ""}`} style={{ maxHeight: menuLayout.maxHeight }} role="group" aria-label={`${song.title}操作`}><button type="button" onClick={() => { setMoreId(null); onSingAlong(song.id) }}><Mic2 size={14}/>跟唱练习</button>{song.isLocal && <button type="button" onClick={() => { setMoreId(null); editSong(onEdit, song) }}><Pencil size={14}/>编辑歌曲信息</button>}<button type="button" onClick={() => { setMoreId(null); editSong(onArtwork, song) }}><Image size={14}/>更换封面</button>{song.isLocal && <button type="button" className="desktop-danger" disabled={deletingId === song.id} onClick={() => { setMoreId(null); onDelete(song) }}><Trash2 size={14}/>删除歌曲</button>}</div>}</div></td></tr>)}</tbody></table>{!visible.length && <div className="desktop-empty"><Search size={32}/><h2>{search ? '没有匹配的歌曲' : '还没有歌曲'}</h2><p>{search ? '试试其他名称，或导入一首新歌。' : '点击右上角的“导入歌曲”，添加音频和歌词。'}</p></div>}</div>
      {selected && inspectorOpen && <aside className="desktop-song-inspector"><button type="button" className="desktop-inspector-close" aria-label="关闭歌曲详情" onClick={() => setInspectorOpen(false)}><X size={16}/></button><Cover song={selected} artwork={artworkFor(selected)}/><h2>{selected.title}</h2><p>{selected.artist}</p>{!visible.some(song => song.id === selected.id) && <p>当前筛选未显示此曲。</p>}<dl><div><dt>歌词</dt><dd>{selected.lines.length} 句</dd></div><div><dt>已掌握</dt><dd>{learned(selected)} 句</dd></div><div><dt>来源</dt><dd>{selected.isLocal ? '本机导入' : '内置示例'}</dd></div></dl><button className="desktop-primary" type="button" onClick={() => onOpen(selected.id)} aria-label={`学习 ${selected.title}，${selected.artist}`}><BookOpenCheck size={16}/>开始学习<ChevronRight size={15}/></button><button type="button" onClick={() => onSingAlong(selected.id)}><Mic2 size={15}/>跟唱练习</button>{selected.isLocal && <button type="button" onClick={() => editSong(onEdit, selected)}><Pencil size={15}/>编辑歌曲信息</button>}<button type="button" onClick={() => editSong(onArtwork, selected)}><Image size={15}/>更换封面</button>{selected.isLocal && <button className="desktop-danger" type="button" disabled={deletingId === selected.id} onClick={() => onDelete(selected)}><Trash2 size={15}/>删除歌曲</button>}<small>双击列表中的歌曲可以直接开始学习。</small></aside>}
    </div><div className="desktop-list-status">{visible.length} 首歌曲<span>歌词、音频与学习记录保存在本机</span></div>
  </section>
}

export function DesktopReview({ queue, onSingAlong }) {
  return <section className="desktop-review"><header className="desktop-page-heading"><div><span>巩固与练习</span><h1>待复习的句子</h1></div><span className="desktop-count">{queue.length} 句</span></header><p className="desktop-review-note">选择一句进入跟唱并定位；点击歌词即可连续播放。掌握状态仍可在发音学习页调整。</p><div className="desktop-review-scroll">{queue.length ? <ol>{queue.map(({song,line}) => <li key={`${song.id}:${line.id}`}><div><span>{song.title} · 第 {line.displayNumber} 句</span><b lang="ja">{line.text}</b>{line.translation && <p>{line.translation}</p>}</div><button type="button" onClick={() => onSingAlong(song.id,line.id)}>前往跟唱<ChevronRight size={16}/></button></li>)}</ol> : <div className="desktop-empty"><BookOpenCheck size={40}/><h2>复习清单已清空</h2><p>学习时把没把握的句子加入这里，稍后再练。</p></div>}</div></section>
}

const time = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`
export function DesktopPlayer({ song, artwork, available, playing, currentTime, duration, rate, onToggle, onSeek, onRate, onPrevious, onNext, volume, onVolume }) {
  return <section className="desktop-player" aria-label="播放控制"><div className="desktop-player-song"><Cover song={song} artwork={artwork}/><div><b>{song.title}</b><span>{available ? song.artist : '未导入音频 · 可继续学习歌词'}</span></div></div><div className="desktop-player-center"><div className="desktop-player-buttons"><button type="button" disabled={!available} aria-label="播放上一句" onClick={onPrevious}><SkipBack size={17}/></button><button className="desktop-play" type="button" disabled={!available} aria-label={playing ? '暂停歌曲' : '播放歌曲'} onClick={onToggle}>{playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button><button type="button" disabled={!available} aria-label="播放下一句" onClick={onNext}><SkipForward size={17}/></button></div><div className="desktop-seek"><span>{time(currentTime)}</span><input aria-label="播放进度" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 0)} disabled={!available || !duration} onChange={e => onSeek(Number(e.target.value))}/><span>{time(duration)}</span></div></div><div className="desktop-player-options"><select aria-label="歌曲播放速度" value={rate} onChange={e => onRate(Number(e.target.value))}>{PLAYBACK_RATES.map(r => <option key={r} value={r}>{r}×</option>)}</select><Volume2 size={17}/><input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => onVolume(Number(e.target.value))} aria-label="音量"/></div></section>
}

export function DesktopStatusBar({ error }) {
  return <div className="desktop-statusbar"><span><i/>{error || '本地注音与词典已就绪'}</span><span>UTA · Windows x64</span></div>
}
