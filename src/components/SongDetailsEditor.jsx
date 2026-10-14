import { useRef, useState } from 'react'
import { ChevronDown, Plus, Trash2, X } from 'lucide-react'
import { parseLrcFile } from '../lib/localSongStore'
import ArtworkPicker from './ArtworkPicker'
import OnlineSongSearch from './OnlineSongSearch'
import { insertLyricLine } from '../lib/songTimeline'
import {orderLyricLines} from '../lib/lyricDocument.js'

// 原格式函数会将 null 转成零；空时间继续显示空白。
const timeText = (seconds) => Number.isFinite(seconds)?`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(3).padStart(6, '0')}`:''
const parseTime = (value) => {
  const match = String(value).trim().match(/^(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

// 每一分区独立展开；不打开联网分区时不发起封面或歌词请求。
function EditorSection({ title, children, onOpen }) {
  const [open, setOpen] = useState(false)
  return <details className="song-editor-section" onToggle={(event) => { setOpen(event.currentTarget.open); onOpen?.(event.currentTarget.open) }}><summary>{title}<ChevronDown size={18}/></summary>{open && <div className="song-editor-section-body">{children}</div>}</details>
}
export default function SongDetailsEditor({ song, artwork, onClose, onSave, busy }) {
  const [title, setTitle] = useState(song.title)
  const [artist, setArtist] = useState(song.artist || '')
  const [lines, setLines] = useState(song.lines.map((line) => ({ ...line, time: timeText(line.start) })))
  const [audioFile, setAudioFile] = useState(null)
  const [sourceFile, setSourceFile] = useState(song.sourceFile)
  const [error, setError] = useState('')
  const [selectedArtwork, setSelectedArtwork] = useState(artwork || song)
  const [artworkChanged, setArtworkChanged] = useState(false)
  const [insertAt, setInsertAt] = useState(0)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [artworkUploading, setArtworkUploading] = useState(false)
  const lyricRequest = useRef(0)
  // 文件读取结束才能保存，避免把用户刚选的歌词漏掉；后来的选择覆盖早先请求。
  function changeLine(id, field, value) {
    setLines((previous) => previous.map((line) => line.id === id ? { ...line, [field]: value } : line))
  }
  async function replaceLyrics(file) {
    if (!file) return
    const request = ++lyricRequest.current
    setLyricsLoading(true)
    try {
      const parsed = await parseLrcFile(file)
      if (request !== lyricRequest.current) return
      setLines(parsed.lines.map((line) => ({ ...line, time: timeText(line.start) })))
      setSourceFile(file.name);setInsertAt(0);setError('')
    } catch (reason) { if(request === lyricRequest.current)setError(reason instanceof Error ? reason.message : '歌词文件无法读取。') }
    finally { if(request === lyricRequest.current)setLyricsLoading(false) }
  }
  async function save(event) {
    event.preventDefault()
    if (busy || lyricsLoading || artworkUploading) return
    if (!title.trim()) { setError('请填写歌曲名称。'); return }
    if (!lines.length) { setError('至少保留一句歌词。'); return }
    const prepared = []
    for (const [index, line] of lines.entries()) {
      const start = parseTime(line.time)
      // 原来 start==null 就禁止保存；允许留空供稍后补充，但拒绝错误的非空时间。
      if (line.time.trim()&&start == null || !line.text.trim()) { setError(`第 ${index + 1} 句的时间或歌词无效。时间可留空。`); return }
      // 原保存字段不包含罗马音；同时保留用户导入和编辑的罗马音。
      // prepared.push({ id: line.id, start, text: line.text.trim(), translation: String(line.translation || '').trim() })
      prepared.push({ id: line.id, start, text: line.text.trim(), translation: String(line.translation || '').trim(), romaji: String(line.romaji || '').trim() })
    }
    // 原 prepared.sort(...) 会移动未设置时间的句子。
    const ordered=orderLyricLines(prepared)
    setError('')
    // 保留整句顺序与未填写的时间，补音频提示在文件区和保存后的学习页持续显示。
    try { await onSave({ title: title.trim(), artist: artist.trim() || '未知歌手', lines: ordered, audioFile, sourceFile, artwork: artworkChanged ? selectedArtwork : undefined }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。') }
  }
  const blocked = busy || lyricsLoading || artworkUploading
  return <div className="song-editor-backdrop" onClick={() => {if(!blocked)onClose()}}><form className="song-editor" role="dialog" aria-modal="true" aria-label={`编辑《${song.title}》`} onClick={(event) => event.stopPropagation()} onSubmit={save}>
    <div className="song-editor-head"><div><p>SONG DETAILS</p><h2>编辑歌曲信息</h2></div><button type="button" disabled={blocked} onClick={onClose} aria-label="关闭编辑"><X size={20} /></button></div>
    {/* 原滚动容器：<fieldset className="song-editor-scroll" disabled={blocked}>；真机上内容会越过底部操作区。
        使用独立滚动容器，避免 Android WebView 的 fieldset 内容溢出遮挡底部按钮。 */}
    <div className="song-editor-scroll"><fieldset className="song-editor-fields" disabled={blocked}>
      <EditorSection title="歌曲名称"><div className="song-editor-meta"><label>歌曲名称<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></label></div></EditorSection>
      <EditorSection title="歌手名称"><div className="song-editor-meta"><label>歌手名称<input value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={160} /></label></div></EditorSection>
      <EditorSection title="编辑歌曲封面"><ArtworkPicker title={title} artist={artist} selected={selectedArtwork} onUploading={setArtworkUploading} onSelect={(choice) => {setSelectedArtwork(choice);setArtworkChanged(true)}} /></EditorSection>
      <EditorSection title="重新上传歌曲或歌词"><div className="song-editor-files"><label>重新上传歌曲音频<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} /><small>{audioFile?.name || `当前文件：${song.audioName || '尚未添加音频'}`}</small></label><label>重新上传歌词（支持无时间戳文本）<input type="file" onChange={(event) => replaceLyrics(event.target.files?.[0])} /><small>{sourceFile || '也可以直接修改每一句。'}</small></label></div>{/* 原歌词限定 LRC；现在读取所有可识别的歌词文本，音频缺少时可在此补充。 */}{(audioFile||song.audioName)&&lines.some(line=>!line.time.trim())&&<p className="song-editor-note" role="status">当前歌词没有完整时间戳。音频可以保存，但逐句试听和跟唱需先手动编辑时间戳，或重新上传带时间戳的歌词文件。</p>}<OnlineSongSearch onChooseLyrics={replaceLyrics} autoQuery={[title, artist].filter(Boolean).join(' / ')} /></EditorSection>
      <EditorSection title="编辑歌词与时间轴">
        <div className="song-editor-lines-head"><strong>共 {lines.length} 句</strong></div>
        <div className="song-editor-insert"><label>添加位置<select value={Math.min(insertAt, lines.length)} onChange={(event) => setInsertAt(Number(event.target.value))}><option value={0}>第1句之前</option>{lines.map((line,index)=><option key={line.id} value={index+1}>第{index+1}句之后{index===lines.length-1?'（最后）':''}</option>)}</select></label><button type="button" onClick={() => {try{setLines(insertLyricLine(lines, Math.min(insertAt,lines.length), parseTime, timeText));setError('')}catch(reason){setError(reason.message)}}}><Plus size={15}/>添加一句</button></div>
        <ol className="song-editor-lines">{lines.map((line, index) => <li key={line.id}><span>{String(index + 1).padStart(2, '0')}</span><div><label>时间<input value={line.time} onChange={(event) => changeLine(line.id, 'time', event.target.value)} placeholder="00:12.345" /></label><label>日文歌词<input value={line.text} onChange={(event) => changeLine(line.id, 'text', event.target.value)} lang="ja" /></label><label>中文译文<input value={line.translation || ''} onChange={(event) => changeLine(line.id, 'translation', event.target.value)} /></label>{/* 罗马音与原文、译文同属当前句，可随时修正或清空。 */}<label>罗马音<input value={line.romaji || ''} maxLength={1000} lang="ja-Latn" onChange={(event) => changeLine(line.id, 'romaji', event.target.value)} placeholder="留空使用自动注音" /></label></div><button type="button" onClick={() => setLines((previous) => previous.filter((item) => item.id !== line.id))} aria-label={`删除第 ${index + 1} 句`}><Trash2 size={15} /></button></li>)}</ol>
        <p className="song-editor-note">新增句子先填入相邻时间，请按实际演唱调整；保存时按时间排序。修改歌词后，本歌逐句掌握记录与 AI 解析会重新计算。</p>
      </EditorSection>
    </fieldset></div>
    {error && <p className="song-editor-error" role="alert">{error}</p>}
    <div className="song-editor-actions"><button type="button" disabled={blocked} onClick={onClose}>取消</button><button type="submit" disabled={blocked}>{busy ? '保存中…' : lyricsLoading ? '读取歌词中…' : '保存修改'}</button></div>
  </form></div>
}

// 旧版平铺编辑界面保留作对照。
// // 只编辑本机导入的歌曲；保存时由父组件一次性替换 IndexedDB 中的资料与可选音频。
// export default function SongDetailsEditor({ song, onClose, onSave, busy }) {
//   const [title, setTitle] = useState(song.title)
//   const [artist, setArtist] = useState(song.artist || '')
//   const [lines, setLines] = useState(song.lines.map((line) => ({ ...line, time: timeText(line.start) })))
//   const [audioFile, setAudioFile] = useState(null)
//   const [sourceFile, setSourceFile] = useState(song.sourceFile)
//   const [error, setError] = useState('')
//
//   function changeLine(id, field, value) {
//     setLines((previous) => previous.map((line) => line.id === id ? { ...line, [field]: value } : line))
//   }
//
//   async function replaceLyrics(file) {
//     if (!file) return
//     try {
//       const parsed = await parseLrcFile(file)
//       setLines(parsed.lines.map((line) => ({ ...line, time: timeText(line.start) })))
//       setSourceFile(file.name)
//       setError('')
//     } catch (reason) { setError(reason instanceof Error ? reason.message : '歌词文件无法读取。') }
//   }
//
//   async function save(event) {
//     event.preventDefault()
//     if (!title.trim()) { setError('请填写歌曲名称。'); return }
//     if (!lines.length) { setError('至少保留一句歌词。'); return }
//     const prepared = []
//     for (const [index, line] of lines.entries()) {
//       const start = parseTime(line.time)
//       if (start == null || !line.text.trim()) { setError(`第 ${index + 1} 句的时间或日文歌词无效。`); return }
//       prepared.push({ id: line.id, start, text: line.text.trim(), translation: String(line.translation || '').trim() })
//     }
//     prepared.sort((a, b) => a.start - b.start)
//     setError('')
//     try { await onSave({ title: title.trim(), artist: artist.trim() || '未知歌手', lines: prepared, audioFile, sourceFile }) }
//     catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。') }
//   }
//
//   return <div className="song-editor-backdrop" onClick={onClose}><form className="song-editor" role="dialog" aria-modal="true" aria-label={`编辑《${song.title}》`} onClick={(event) => event.stopPropagation()} onSubmit={save}>
//     <div className="song-editor-head"><div><p>SONG DETAILS</p><h2>编辑歌曲</h2></div><button type="button" onClick={onClose} aria-label="关闭编辑"><X size={20} /></button></div>
//     <div className="song-editor-meta"><label>歌曲名称<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></label><label>歌手名称<input value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={160} /></label></div>
//     <div className="song-editor-files"><label>重新上传歌曲音频<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} /><small>{audioFile?.name || `当前文件：${song.audioName || '尚未添加音频'}`}</small></label><label>重新上传歌词（支持无时间戳文本）<input type="file" onChange={(event) => replaceLyrics(event.target.files?.[0])} /><small>也可以直接修改下方每一句。</small></label></div>
//     <div className="song-editor-lines-head"><strong>歌词与时间轴 · {lines.length} 句</strong><button type="button" onClick={() => { const id = Math.max(-1, ...lines.map((line) => line.id)) + 1; setLines((previous) => [...previous, { id, time: previous.at(-1)?.time || '00:00.000', text: '', translation: '' }]) }}><Plus size={15} /> 添加一句</button></div>
//     <ol className="song-editor-lines">{lines.map((line, index) => <li key={line.id}><span>{String(index + 1).padStart(2, '0')}</span><div><label>时间<input value={line.time} onChange={(event) => changeLine(line.id, 'time', event.target.value)} placeholder="00:12.345" /></label><label>日文歌词<input value={line.text} onChange={(event) => changeLine(line.id, 'text', event.target.value)} lang="ja" /></label><label>中文译文<input value={line.translation || ''} onChange={(event) => changeLine(line.id, 'translation', event.target.value)} /></label></div><button type="button" onClick={() => setLines((previous) => previous.filter((item) => item.id !== line.id))} aria-label={`删除第 ${index + 1} 句`}><Trash2 size={15} /></button></li>)}</ol>
//     <p className="song-editor-note">修改歌词后，这首歌原有的逐句掌握记录与 AI 解析会重新计算；其他歌曲不受影响。</p>
//     {error && <p className="song-editor-error" role="alert">{error}</p>}
//     <div className="song-editor-actions"><button type="button" onClick={onClose}>取消</button><button type="submit" disabled={busy}>{busy ? '保存中…' : '保存修改'}</button></div>
//   </form></div>
// }
