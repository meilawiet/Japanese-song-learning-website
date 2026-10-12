import { useEffect, useRef, useState } from 'react'
// 原导入图标 Upload 向上；改用 Download 向下，保留上传类操作的原图标。
import { BookOpenCheck, Download, Grid2X2, List, MoreVertical, Search, Upload, X } from 'lucide-react'

const VIEW_KEY = 'uta-android-library-view-v1'

function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' }
}

// 安卓歌曲库独立呈现，保留网页端原有卡片作为对照；长按封面打开操作菜单。
export default function AndroidSongLibrary({ songs, total, search, onSearch, onImport, artworkFor, learnedBySong, onOpen, onDelete, onArtwork, onEdit, deletingSongId, activeSongId, selectionMode = false }) {
  const [view, setView] = useState(readView)
  const [menuSong, setMenuSong] = useState(null)
  const pressTimer = useRef(null)
  const longPressed = useRef(false)

  useEffect(() => () => window.clearTimeout(pressTimer.current), [])
  // 菜单关闭后清除长按标记，下一次轻点可以正常打开歌曲。
  useEffect(() => { if (!menuSong) longPressed.current = false }, [menuSong])
  // 系统返回先关闭歌曲操作菜单，避免直接离开歌曲库。
  useEffect(() => {
    if (!menuSong) return undefined
    const closeOnBack = (event) => { event.preventDefault(); setMenuSong(null) }
    window.addEventListener('uta:navigate-back', closeOnBack)
    return () => window.removeEventListener('uta:navigate-back', closeOnBack)
  }, [menuSong])

  function changeView(next) {
    setView(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* 存储不可用时仍可切换本次视图。 */ }
    setMenuSong(null)
  }

  function beginPress(song) {
    longPressed.current = false
    window.clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      setMenuSong(song)
    }, 500)
  }

  function endPress() { window.clearTimeout(pressTimer.current) }

  function openSong(song) {
    if (longPressed.current) { longPressed.current = false; return }
    onOpen(song.id)
  }

  return <section className="android-library" aria-labelledby="library-title">
    <header className="android-library-heading">
      {/* 选歌页复用歌曲库的搜索和展示方式，避免出现两套不同的操作。 */}
      <div><span className="android-library-kicker">我的音乐</span><h1 id="library-title">{selectionMode ? '选择歌曲' : '歌曲库'}</h1><p>{search ? `找到 ${songs.length} 首歌曲` : `${total} 首歌曲，等你继续学习`}</p></div>
      <div className="android-library-view" role="group" aria-label="歌曲展示样式">
        <button type="button" className={view === 'grid' ? 'selected' : ''} onClick={() => changeView('grid')} aria-label="图标展示" aria-pressed={view === 'grid'} title="图标展示"><Grid2X2 size={19} /></button>
        <button type="button" className={view === 'list' ? 'selected' : ''} onClick={() => changeView('list')} aria-label="列表展示" aria-pressed={view === 'list'} title="列表展示"><List size={21} /></button>
      </div>
    </header>
    <div className="android-library-tools">
      <label className="android-library-search"><Search size={18} /><input id="library-search" type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索歌曲或歌手" aria-label="搜索歌曲或歌手" />{search && <button type="button" onClick={() => onSearch('')} aria-label="清除搜索"><X size={16} /></button>}</label>
      {!selectionMode && <button className="android-library-import" type="button" onClick={onImport} aria-label="导入歌曲"><Download size={20} /><span>导入</span></button>}
    </div>
    {songs.length ? <div className={`android-library-songs ${view}`}>
      {songs.map((song) => {
        const artwork = artworkFor(song)
        const learned = (learnedBySong[song.id] || []).filter((lineId) => song.lines.some((line) => line.id === lineId)).length
        return <article className={`android-library-song ${song.id === activeSongId ? 'current' : ''}`} key={song.id}>
          <button className="android-library-song-main" type="button" onClick={() => openSong(song)} aria-label={`学习 ${song.title}，${song.artist}`}>
            {/* 仅封面承接长按；轻点卡片其他区域仍直接进入歌曲。 */}
            <span className="android-library-cover" onPointerDown={view === 'grid' && !selectionMode ? () => beginPress(song) : undefined} onPointerUp={endPress} onPointerCancel={endPress} onPointerLeave={endPress} onContextMenu={(event) => { event.preventDefault(); if (!selectionMode) { endPress(); longPressed.current = true; setMenuSong(song) } }}><span aria-hidden="true">{song.title.slice(0, 2)}</span>{artwork?.artworkUrl && <img src={artwork.artworkUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true }} />}</span>
            <span className="android-library-song-copy"><strong>{song.title}</strong><small>{song.artist || '未知歌手'}</small><span className="android-library-progress"><BookOpenCheck size={14} /> {learned} / {song.lines.length} 句已掌握</span></span>
          </button>
          {view === 'list' && !selectionMode && <button className="android-library-more" type="button" onClick={() => setMenuSong(song)} aria-label={`更多操作：${song.title}`} aria-haspopup="dialog"><MoreVertical size={20} /></button>}
        </article>
      })}
    </div> : <div className="android-library-empty"><BookOpenCheck size={28} /><p>{search ? '没有找到这首歌' : '歌曲库还是空的'}</p><span>{search ? '换个歌名或歌手试试' : '导入歌曲后，就可以从这里开始学习'}</span>{!search && !selectionMode && <button type="button" onClick={onImport}>导入歌曲</button>}</div>}
    {menuSong && <div className="android-library-menu-backdrop" onClick={() => setMenuSong(null)}><div className="android-library-menu" role="dialog" aria-modal="true" aria-label={`${menuSong.title}的操作`} onClick={(event) => event.stopPropagation()}><div className="android-library-menu-handle" /><strong>{menuSong.title}</strong><button className="danger" type="button" disabled={!menuSong.isLocal || deletingSongId === menuSong.id} onClick={() => { const song = menuSong; setMenuSong(null); onDelete(song) }}>{menuSong.isLocal ? '删除歌曲' : '此歌曲不可删除'}</button>{/* 封面编辑已移入“编辑歌曲信息”下的独立分区。 */}{/* 原菜单仅有删除与封面操作；本机歌曲现在可编辑完整资料。 */}<button type="button" disabled={!menuSong.isLocal} onClick={() => { const song = menuSong; setMenuSong(null); onEdit(song) }}>{menuSong.isLocal ? '编辑歌曲信息' : '此歌曲不可编辑'}</button><button type="button" onClick={() => setMenuSong(null)}>取消</button></div></div>}
  </section>
}
