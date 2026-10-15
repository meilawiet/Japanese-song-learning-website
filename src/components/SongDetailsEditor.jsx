import { useReducer, useState } from 'react'
import { Plus, Trash2, X, Undo2, Redo2 } from 'lucide-react'
import { parseLrcFile } from '../lib/localSongStore'
import { editHistoryReducer, newEditHistory } from '../lib/editHistory'
import { useDesktopUnsavedDraft } from '../lib/useDesktopUnsavedDraft'

const timeText = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(3).padStart(6, '0')}`
const parseTime = value => {
  const match = String(value).trim().match(/^(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}
const draftFor = song => ({ title: song.title, artist: song.artist || '',
  lines: song.lines.map(line => ({ ...line, time: timeText(line.start) })), audioFile: null, sourceFile: song.sourceFile })

export default function SongDetailsEditor({ song, onClose, onSave, busy }) {
  const [history, dispatch] = useReducer(editHistoryReducer, song, value => newEditHistory(draftFor(value)))
  const { title, artist, lines, audioFile, sourceFile } = history.present
  const [error, setError] = useState('')
  const [parsing, setParsing] = useState(false)
  const locked = busy || parsing
  const dirty = JSON.stringify(history.present) !== JSON.stringify(draftFor(song)) || Boolean(audioFile)
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
    if (!file) return
    setParsing(true)
    try {
      const parsed = await parseLrcFile(file)
      edit({ lines: parsed.lines.map(line => ({ ...line, time: timeText(line.start) })), sourceFile: file.name })
    } catch (reason) { setError(reason instanceof Error ? reason.message : '歌词文件无法读取。') }
    finally { setParsing(false) }
  }
  async function save(event) {
    event.preventDefault()
    if (locked) return
    if (!title.trim()) { setError('请填写歌曲名称。'); return }
    if (!lines.length) { setError('至少保留一句歌词。'); return }
    const prepared = []
    for (const [index, line] of lines.entries()) {
      const start = parseTime(line.time)
      if (start == null || !line.text.trim()) { setError(`第 ${index + 1} 句的时间或日文歌词无效。`); return }
      const { time, ...fields } = line
      prepared.push({ ...fields, start, text: line.text.trim(), translation: String(line.translation || '').trim(), ...(line.romaji != null ? { romaji: String(line.romaji).trim() } : {}) })
    }
    prepared.sort((a, b) => a.start - b.start)
    setError('')
    try { await onSave({ title: title.trim(), artist: artist.trim() || '未知歌手', lines: prepared, audioFile, sourceFile }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。') }
  }
  return <div className="song-editor-backdrop" onClick={close}><form className="song-editor" role="dialog" aria-modal="true" aria-label={`编辑《${song.title}》`} onClick={event => event.stopPropagation()} onSubmit={save} onKeyDown={event => {
    if (!event.ctrlKey || event.altKey || locked) return
    const key = event.key.toLowerCase()
    if (key === 'z' || key === 'y') { event.preventDefault(); navigateHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo') }
  }}>
    <div className="song-editor-head"><div><p>SONG DETAILS</p><h2>编辑歌曲</h2></div><button type="button" disabled={locked} onClick={close} aria-label="关闭编辑"><X size={20} /></button></div>
    <div className="song-editor-history" role="group" aria-label="编辑历史"><button type="button" disabled={locked || !history.past.length} onClick={() => navigateHistory('undo')} aria-label="撤销编辑"><Undo2 size={14} />撤销</button><button type="button" disabled={locked || !history.future.length} onClick={() => navigateHistory('redo')} aria-label="重做编辑"><Redo2 size={14} />重做</button><small>Ctrl+Z / Ctrl+Y · 可撤销输入、添加、删除和文件替换</small></div>
    <div className="song-editor-fields"><fieldset className="song-editor-fieldset" disabled={locked}>
    <div className="song-editor-meta"><label>歌曲名称<input value={title} onChange={event => edit({ title: event.target.value })} maxLength={160} /></label><label>歌手名称<input value={artist} onChange={event => edit({ artist: event.target.value })} maxLength={160} /></label></div>
    <div className="song-editor-files"><label>重新上传歌曲音频<input key={audioFile ? `${audioFile.name}-${audioFile.lastModified}` : 'no-audio'} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" onChange={event => edit({ audioFile: event.target.files?.[0] || null })} /><small>{audioFile?.name || `当前文件：${song.audioName || '未记录文件名'}`}</small></label><label>用 LRC 替换整首歌词<input type="file" accept=".lrc,text/plain" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void replaceLyrics(file) }} /><small>{parsing ? '正在读取歌词…' : '也可以直接修改下方每一句。'}</small></label></div>
    <div className="song-editor-lines-head"><strong>歌词与时间轴 · {lines.length} 句</strong><button type="button" onClick={() => edit({ lines: [...lines, { id: Math.max(-1, ...lines.map(line => line.id)) + 1, time: lines.at(-1)?.time || '00:00.000', text: '', translation: '' }] })}><Plus size={15} /> 添加一句</button></div>
    <ol className="song-editor-lines">{lines.map((line, index) => <li key={line.id}><span>{String(index + 1).padStart(2, '0')}</span><div><label>时间<input value={line.time} onChange={event => changeLine(line.id, 'time', event.target.value)} placeholder="00:12.345" /></label><label>日文歌词<input value={line.text} onChange={event => changeLine(line.id, 'text', event.target.value)} lang="ja" /></label><label>中文译文<input value={line.translation || ''} onChange={event => changeLine(line.id, 'translation', event.target.value)} /></label><label>导入的罗马音<input value={line.romaji || ''} onChange={event => changeLine(line.id, 'romaji', event.target.value)} /></label></div><button type="button" onClick={() => edit({ lines: lines.filter(item => item.id !== line.id) })} aria-label={`删除第 ${index + 1} 句`}><Trash2 size={15} /></button></li>)}</ol>
    </fieldset></div>
    <p className="song-editor-note">仅改译文、时间或歌曲信息会保留掌握与读音校对；改原文只重置对应句子的学习记录。保存后可在侧栏撤销本次歌曲编辑。</p>
    {error && <p className="song-editor-error" role="alert">{error}</p>}
    <div className="song-editor-actions"><button type="button" disabled={locked} onClick={close}>取消</button><button type="submit" disabled={locked}>{busy ? '保存中…' : parsing ? '读取中…' : '保存修改'}</button></div>
  </form></div>
}
