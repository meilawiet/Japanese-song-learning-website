import { validLyricEnd } from '../lib/lyricTiming'
import { useEffect, useReducer, useRef, useState } from 'react'
import { Plus, Trash2, X, Undo2, Redo2 } from 'lucide-react'
import { parseLrcFile } from '../lib/localSongStore'
import { editHistoryReducer, newEditHistory } from '../lib/editHistory'
import DesktopOnlineLyricsSearch from './DesktopOnlineLyricsSearch'
import LrcReviewEditor from './LrcReviewEditor'
import { savedSongTrackCues, compileSavedSongTracks } from '../lib/savedSongTracks'
import { compileLrcCues } from '../lib/lrcReview'
import { useDesktopUnsavedDraft } from '../lib/useDesktopUnsavedDraft'

const timeText = seconds => Number.isFinite(seconds) ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(3).padStart(6, '0')}` : ''
const parseTime = value => {
  const match = String(value).trim().match(/^(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}
const draftFor = song => ({ title: song.title, artist: song.artist || '',
  lines: song.lines.map(line => ({ ...line, time: timeText(line.start) })), audioFile: null, sourceFile: song.sourceFile, lyricsReplaced: false })

export default function SongDetailsEditor({ song, onClose, onSave, busy }) {
  const [history, dispatch] = useReducer(editHistoryReducer, song, value => newEditHistory(draftFor(value)))
  const { title, artist, lines, audioFile, sourceFile, lyricsReplaced } = history.present
  const [error, setError] = useState('')
  const [parsing, setParsing] = useState(false)
  const [searchQuery, setSearchQuery] = useState(null)
  const [replacement, setReplacement] = useState(null)
  const [notice, setNotice] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const adjustingTracks = replacement?.kind === 'saved'
  const preview = replacement ? adjustingTracks ? compileSavedSongTracks(replacement.cues, replacement.baseLines) : compileLrcCues(replacement.cues) : null
  const locked = busy || parsing
  const dirty = JSON.stringify(history.present) !== JSON.stringify(draftFor(song)) || Boolean(audioFile) || Boolean(replacement)
  useDesktopUnsavedDraft('song-editor', dirty)
  const edit = patch => { dispatch({ type: 'edit', patch }); setError('') }
  const navigateHistory = type => { if (!locked) { dispatch({ type }); setError('') } }
  function close() {
    if (locked) return
    if (!dirty || window.confirm('还有未保存的歌曲修改，确定放弃修改并关闭吗？')) onClose()
  }
  function changeLine(id, field, value) {
    edit({ lines: lines.map(line => {
      if (line.id !== id) return line
      const updated = { ...line, [field]: value }
      if (field === 'text' && value !== line.text) delete updated.sourceReadings
      return updated
    }) })
  }
  async function replaceLyrics(file) {
    if (!file || locked || adjustingTracks) return
    setParsing(true); setError(''); setNotice('')
    try {
      const parsed = await parseLrcFile(file)
      if (alive.current) setReplacement({ fileName: file.name, cues: parsed.cues, untimed: parsed.untimed })
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '歌词文件无法读取。') }
    finally { if (alive.current) setParsing(false) }
  }
  function applyReplacement() {
    if (locked || !preview || preview.issues.length) return
    edit({ lines: preview.lines.map(line => ({ ...line, time: timeText(line.start) })), ...(adjustingTracks ? {} : { sourceFile: replacement.fileName, lyricsReplaced: true }) })
    setReplacement(null)
    setNotice(adjustingTracks ? '轨道调整已应用到草稿，可撤销；点击“保存修改”后才会写入歌曲。' : '新歌词已应用到编辑草稿，可撤销；点击“保存修改”后才会写入歌曲。')
  }
  async function save(event) {
    event.preventDefault()
    if (locked) return
    if (replacement) { setError('请先应用或取消歌词预览。'); return }
    if (!title.trim()) { setError('请填写歌曲名称。'); return }
    if (!lines.length) { setError('至少保留一句歌词。'); return }
    const prepared = []
    for (const [index, line] of lines.entries()) {
      const start = parseTime(line.time)
      if (start == null && line.time.trim() || !line.text.trim()) { setError(`第 ${index + 1} 句的时间或歌词无效。`); return }
      if (!validLyricEnd({ ...line, start })) { setError(`第 ${index + 1} 句的结束时间必须晚于开始时间，请在单句编辑中调整。`); return }
      const { time, ...fields } = line
      prepared.push({ ...fields, start, text: line.text.trim(), translation: String(line.translation || '').trim(), ...(line.romaji != null ? { romaji: String(line.romaji).trim() } : {}) })
    }
    // Preserve imported line order and identity, including untimed lyrics.
    setError('')
    try { await onSave({ title: title.trim(), artist: artist.trim() || '未知歌手', lines: prepared, audioFile, sourceFile, lyricsReplaced }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。') }
  }
  return <div className="song-editor-backdrop" onClick={close}><form className="song-editor" role="dialog" aria-modal="true" aria-label={`编辑《${song.title}》`} onClick={event => event.stopPropagation()} onSubmit={save} onKeyDown={event => {
    if (!event.ctrlKey || event.altKey || locked || replacement) return
    const key = event.key.toLowerCase()
    if (key === 'z' || key === 'y') { event.preventDefault(); navigateHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo') }
  }}>
    <div className="song-editor-head"><div><p>SONG DETAILS</p><h2>编辑歌曲</h2></div><button type="button" disabled={locked} onClick={close} aria-label="关闭编辑"><X size={20} /></button></div>
    <div className="song-editor-history" role="group" aria-label="编辑历史"><button type="button" disabled={locked || Boolean(replacement) || !history.past.length} onClick={() => navigateHistory('undo')} aria-label="撤销编辑"><Undo2 size={14} />撤销</button><button type="button" disabled={locked || Boolean(replacement) || !history.future.length} onClick={() => navigateHistory('redo')} aria-label="重做编辑"><Redo2 size={14} />重做</button><small>Ctrl+Z / Ctrl+Y · 可撤销输入、添加、删除和文件替换</small></div>
    <div className="song-editor-fields"><fieldset className="song-editor-fieldset" disabled={locked}>
    <div className="song-editor-meta"><label>歌曲名称<input value={title} onChange={event => edit({ title: event.target.value })} maxLength={160} /></label><label>歌手名称<input value={artist} onChange={event => edit({ artist: event.target.value })} maxLength={160} /></label></div>
    <div className="song-editor-files"><label>重新上传歌曲音频<input key={audioFile ? `${audioFile.name}-${audioFile.lastModified}` : 'no-audio'} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" onChange={event => edit({ audioFile: event.target.files?.[0] || null })} /><small>{audioFile?.name || `当前文件：${song.audioName || '未记录文件名'}`}</small></label><label>用 LRC 替换整首歌词<input type="file" disabled={adjustingTracks} accept=".lrc,.uta-lyrics.json,text/plain,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void replaceLyrics(file) }} /><small>{parsing ? '正在读取歌词…' : '也可以直接修改下方每一句。'}</small></label></div>
    {window.utaDesktop && <div className="song-editor-online">
      <button className="song-editor-search-toggle" type="button" disabled={locked || adjustingTracks} aria-expanded={searchQuery !== null} onClick={() => setSearchQuery(searchQuery === null ? [title.trim(), !['本地导入', '未知歌手'].includes(artist.trim()) ? artist.trim() : ''].filter(Boolean).join(' ') : null)}>{searchQuery === null ? '联网搜索并替换歌词' : '收起联网搜索'}</button>
      {searchQuery !== null && <DesktopOnlineLyricsSearch autoQuery={searchQuery} onChooseLyrics={replaceLyrics} disabled={locked || adjustingTracks} description="按当前歌名和歌手搜索其他歌词版本。选用后预览，应用到草稿，再保存修改；歌曲名称、歌手和音频保留。"/>}
    </div>}
    {window.utaDesktop && <div className="song-editor-track-entry"><button type="button" disabled={locked || Boolean(replacement)} onClick={() => { setReplacement({ kind: 'saved', fileName: '当前编辑中的歌词', cues: savedSongTrackCues(lines), baseLines: structuredClone(lines) }); setError(''); setNotice(''); setSearchQuery(null) }}>重新归类与配对</button><p>将误判的原文、译文或罗马音重新归类，不必重新导入音频。只包含当前保存的内容，已丢弃的行需从原歌词补回。</p></div>}
    {replacement && <section className="song-editor-replacement" aria-label={adjustingTracks ? '已导入歌词轨道调整' : '替换歌词预览'}>
      <h3>{adjustingTracks ? '调整原文、译文与罗马音' : '替换歌词预览'}</h3>
      <p>{replacement.fileName} · {preview.lines.length} 句。核对后应用到草稿，不会立即覆盖已保存的歌曲。</p>
      {replacement.untimed && <p role="status">这份歌词没有时间轴，请逐句填写时间戳后再应用；自带假名会优先保留。</p>}
      <LrcReviewEditor cues={replacement.cues} onChange={cues => setReplacement(previous => ({ ...previous, cues }))} disabled={locked} label={adjustingTracks ? '已导入歌词' : '替换歌词'} mode={adjustingTracks ? 'saved' : 'import'} inspection={preview}/>
      {adjustingTracks && <div className="song-editor-track-result" aria-label="调整后的歌词预览"><strong>调整后 · {preview.lines.length} 句</strong><ol>{preview.lines.map((line, index) => <li key={line.id}><span>第 {index + 1} 句 · {timeText(line.start) || '无时间'}</span><b>{line.text}</b>{line.translation && <p>译文：{line.translation}</p>}{line.romaji && <p>罗马音：{line.romaji}</p>}</li>)}</ol></div>}
      <div className="song-editor-replacement-actions"><button type="button" disabled={locked} onClick={() => { setReplacement(null); setError('') }}>{adjustingTracks ? '取消轨道调整' : '取消替换'}</button><button type="button" disabled={locked || Boolean(preview.issues.length)} onClick={applyReplacement}>{adjustingTracks ? '应用轨道调整到草稿' : '应用替换到草稿'}</button></div>
      {preview.issues.length > 0 && <p role="status">请先处理预览中的 {preview.issues.length} 项问题。</p>}
    </section>}
    {notice && <p className="song-editor-notice" role="status">{notice}</p>}
    {!adjustingTracks && <><div className="song-editor-lines-head"><strong>歌词与时间轴 · {lines.length} 句</strong><button type="button" onClick={() => edit({ lines: [...lines, { id: Math.max(-1, ...lines.map(line => line.id)) + 1, time: lines.at(-1)?.time || '00:00.000', text: '', translation: '' }] })}><Plus size={15} /> 添加一句</button></div>
    <ol className="song-editor-lines">{lines.map((line, index) => <li key={line.id}><span>{String(index + 1).padStart(2, '0')}</span><div><label>时间<input value={line.time} onChange={event => changeLine(line.id, 'time', event.target.value)} placeholder="00:12.345" /></label><label>日文歌词<input value={line.text} onChange={event => changeLine(line.id, 'text', event.target.value)} lang="ja" /></label><label>中文译文<input value={line.translation || ''} onChange={event => changeLine(line.id, 'translation', event.target.value)} /></label><label>导入的罗马音<input value={line.romaji || ''} onChange={event => changeLine(line.id, 'romaji', event.target.value)} /></label></div><button type="button" onClick={() => edit({ lines: lines.filter(item => item.id !== line.id) })} aria-label={`删除第 ${index + 1} 句`}><Trash2 size={15} /></button></li>)}</ol></>}
    </fieldset></div>
    <p className="song-editor-note">仅改译文、时间或歌曲信息会保留掌握与读音校对；替换时原文未变且能对应的句子保留学习进度，原文或自带注音变化会更新对应的读音校对。保存后可在侧栏撤销本次歌曲编辑。</p>
    {error && <p className="song-editor-error" role="alert">{error}</p>}
    <div className="song-editor-actions"><button type="button" disabled={locked} onClick={close}>取消</button><button type="submit" disabled={locked || Boolean(replacement)}>{busy ? '保存中…' : parsing ? '读取中…' : '保存修改'}</button></div>
  </form></div>
}
