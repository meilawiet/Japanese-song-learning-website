import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { parseLrcFile } from '../lib/localSongStore'

const timeText = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(3).padStart(6, '0')}`
const parseTime = (value) => {
  const match = String(value).trim().match(/^(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

// 只编辑本机导入的歌曲；保存时由父组件一次性替换 IndexedDB 中的资料与可选音频。
export default function SongDetailsEditor({ song, onClose, onSave, busy }) {
  const [title, setTitle] = useState(song.title)
  const [artist, setArtist] = useState(song.artist || '')
  const [lines, setLines] = useState(song.lines.map((line) => ({ ...line, time: timeText(line.start) })))
  const [audioFile, setAudioFile] = useState(null)
  const [sourceFile, setSourceFile] = useState(song.sourceFile)
  const [error, setError] = useState('')

  function changeLine(id, field, value) {
    setLines((previous) => previous.map((line) => line.id === id ? { ...line, [field]: value } : line))
  }

  async function replaceLyrics(file) {
    if (!file) return
    try {
      const parsed = await parseLrcFile(file)
      setLines(parsed.lines.map((line) => ({ ...line, time: timeText(line.start) })))
      setSourceFile(file.name)
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '歌词文件无法读取。') }
  }

  async function save(event) {
    event.preventDefault()
    if (!title.trim()) { setError('请填写歌曲名称。'); return }
    if (!lines.length) { setError('至少保留一句歌词。'); return }
    const prepared = []
    for (const [index, line] of lines.entries()) {
      const start = parseTime(line.time)
      if (start == null || !line.text.trim()) { setError(`第 ${index + 1} 句的时间或日文歌词无效。`); return }
      prepared.push({ id: line.id, start, text: line.text.trim(), translation: String(line.translation || '').trim() })
    }
    prepared.sort((a, b) => a.start - b.start)
    setError('')
    try { await onSave({ title: title.trim(), artist: artist.trim() || '未知歌手', lines: prepared, audioFile, sourceFile }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。') }
  }

  return <div className="song-editor-backdrop" onClick={onClose}><form className="song-editor" role="dialog" aria-modal="true" aria-label={`编辑《${song.title}》`} onClick={(event) => event.stopPropagation()} onSubmit={save}>
    <div className="song-editor-head"><div><p>SONG DETAILS</p><h2>编辑歌曲</h2></div><button type="button" onClick={onClose} aria-label="关闭编辑"><X size={20} /></button></div>
    <div className="song-editor-meta"><label>歌曲名称<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} /></label><label>歌手名称<input value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={160} /></label></div>
    <div className="song-editor-files"><label>重新上传歌曲音频<input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} /><small>{audioFile?.name || `当前文件：${song.audioName || '未记录文件名'}`}</small></label><label>用 LRC 替换整首歌词<input type="file" accept=".lrc,text/plain" onChange={(event) => replaceLyrics(event.target.files?.[0])} /><small>也可以直接修改下方每一句。</small></label></div>
    <div className="song-editor-lines-head"><strong>歌词与时间轴 · {lines.length} 句</strong><button type="button" onClick={() => { const id = Math.max(-1, ...lines.map((line) => line.id)) + 1; setLines((previous) => [...previous, { id, time: previous.at(-1)?.time || '00:00.000', text: '', translation: '' }]) }}><Plus size={15} /> 添加一句</button></div>
    <ol className="song-editor-lines">{lines.map((line, index) => <li key={line.id}><span>{String(index + 1).padStart(2, '0')}</span><div><label>时间<input value={line.time} onChange={(event) => changeLine(line.id, 'time', event.target.value)} placeholder="00:12.345" /></label><label>日文歌词<input value={line.text} onChange={(event) => changeLine(line.id, 'text', event.target.value)} lang="ja" /></label><label>中文译文<input value={line.translation || ''} onChange={(event) => changeLine(line.id, 'translation', event.target.value)} /></label></div><button type="button" onClick={() => setLines((previous) => previous.filter((item) => item.id !== line.id))} aria-label={`删除第 ${index + 1} 句`}><Trash2 size={15} /></button></li>)}</ol>
    <p className="song-editor-note">修改歌词后，这首歌原有的逐句掌握记录与 AI 解析会重新计算；其他歌曲不受影响。</p>
    {error && <p className="song-editor-error" role="alert">{error}</p>}
    <div className="song-editor-actions"><button type="button" onClick={onClose}>取消</button><button type="submit" disabled={busy}>{busy ? '保存中…' : '保存修改'}</button></div>
  </form></div>
}
