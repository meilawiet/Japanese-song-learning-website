import { useEffect, useRef, useState } from 'react'
import { CircleAlert, LoaderCircle, Upload, X } from 'lucide-react'
import { inferAudioMetadata } from '../lib/audioMetadata'
import { parseLrcFile } from '../lib/localSongStore'
import { batchFileId, batchRowProblem, buildBatchImportRows, prepareBatchImport } from '../lib/batchSongImport'

export default function BatchSongImportDialog({ onClose, onSwitchSingle, onImport, busy }) {
  const [audios, setAudios] = useState([])
  const [lyrics, setLyrics] = useState([])
  const [rows, setRows] = useState([])
  const [preparing, setPreparing] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const alive = useRef(true)
  const locked = Boolean(preparing || busy || submitting)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  async function addFiles(kind, files) {
    if (!files.length || locked) return
    setError('')
    const next = [...(kind === 'audio' ? audios : lyrics)]
    const seen = new Set(next.map(entry => entry.id))
    setPreparing('正在读取文件…')
    try {
      for (const [index, file] of files.entries()) {
        const id = batchFileId(file)
        if (seen.has(id)) continue
        setPreparing(`正在读取 ${index + 1} / ${files.length} 个文件…`)
        if (kind === 'audio') next.push({ id, file, metadata: await inferAudioMetadata(file) })
        else {
          try { next.push({ id, file, parsed: await parseLrcFile(file) }) }
          catch (failure) { next.push({ id, file, error: failure.message || '无法读取歌词文件' }) }
        }
        seen.add(id)
        if (!alive.current) return
      }
      const nextAudios = kind === 'audio' ? next : audios
      const nextLyrics = kind === 'lyrics' ? next : lyrics
      setAudios(nextAudios); setLyrics(nextLyrics)
      setRows(buildBatchImportRows(nextAudios, nextLyrics, rows))
    } catch (failure) {
      if (alive.current) setError(failure.message || '文件读取失败，请重新选择。')
    } finally { if (alive.current) setPreparing('') }
  }

  function changeRow(audioId, field, value) {
    setError('')
    setRows(previous => previous.map(row => row.audioId === audioId ? { ...row, [field]: value } : row))
  }

  function pairLyric(audioId, lyricId) {
    const lyric = lyrics.find(entry => entry.id === lyricId)
    const audio = audios.find(entry => entry.id === audioId)
    setError('')
    setRows(previous => previous.map(row => row.audioId === audioId ? {
      ...row, lyricId, manualPair: true,
      title: lyric?.parsed?.title || audio.metadata?.title || row.title,
      artist: lyric?.parsed?.artist !== '本地导入' && lyric?.parsed?.artist || audio.metadata?.artist || row.artist,
      selected: Boolean(lyric?.parsed && !lyric.error),
    } : row))
  }

  function removeAudio(audioId) {
    const next = audios.filter(entry => entry.id !== audioId)
    setAudios(next); setRows(buildBatchImportRows(next, lyrics, rows))
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    if (locked) return
    setError(''); setSubmitting(true)
    try { await onImport(prepareBatchImport(rows, audios, lyrics)) }
    catch (failure) { if (alive.current) setError(failure.message || '导入失败，请重试。') }
    finally { if (alive.current) setSubmitting(false) }
  }

  const ready = rows.filter(row => !batchRowProblem(row, rows, lyrics))
  const selected = rows.filter(row => row.selected)
  const usedLyrics = new Map(rows.filter(row => row.lyricId).map(row => [row.lyricId, row.audioId]))
  const unpairedLyrics = lyrics.filter(entry => !rows.some(row => row.lyricId === entry.id))
  return <form className="song-import-dialog batch-import-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-import-title" onSubmit={submit} onClick={event => event.stopPropagation()}>
    <header className="batch-import-heading">
      <button className="song-import-close" type="button" disabled={busy || submitting} onClick={onClose} aria-label="关闭导入窗口"><X size={18}/></button>
      <h2 id="batch-import-title">导入歌曲</h2>
      <nav className="desktop-import-modes" aria-label="歌曲导入方式"><button type="button" disabled={locked} onClick={onSwitchSingle} aria-pressed="false">单首导入</button><button type="button" aria-pressed="true">批量导入</button></nav>
    </header>
    <div className="batch-import-content">
      <p className="song-import-intro">一次选择多个音频和 LRC 文件。同名文件自动配对；文件名不同或重名时，请在列表中选择对应歌词。</p>
      <div className="batch-import-file-fields">
        <label className={`song-file-field ${audios.length ? 'selected' : ''}`}><span>01 · 音频文件</span><strong>{audios.length ? `已选择 ${audios.length} 个音频 · 点击继续添加` : '选择多首歌曲的音频'}</strong><small>支持 MP3、M4A、WAV、OGG、FLAC 等格式</small><input type="file" multiple accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac,.webm" aria-label="批量选择音频文件" disabled={locked} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void addFiles('audio', files) }}/></label>
        <label className={`song-file-field ${lyrics.length ? 'selected' : ''}`}><span>02 · LRC 歌词</span><strong>{lyrics.length ? `已选择 ${lyrics.length} 份歌词 · 点击继续添加` : '选择多份 LRC 歌词'}</strong><small>在文件窗口按 Ctrl 或 Shift 可以多选</small><input type="file" multiple accept=".lrc" aria-label="批量选择歌词文件" disabled={locked} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void addFiles('lyrics', files) }}/></label>
      </div>
      {preparing && <p className="batch-import-progress" role="status"><LoaderCircle className="spin" size={14}/>{preparing}</p>}
      <div className="batch-import-toolbar"><span>{audios.length} 首音频 · {lyrics.length} 份歌词 · {ready.length} 首可导入</span><button type="button" disabled={locked || !ready.length} onClick={() => setRows(previous => previous.map(row => ({ ...row, selected: !batchRowProblem(row, previous, lyrics) })))}>全选可导入歌曲</button><button type="button" disabled={locked || !selected.length} onClick={() => setRows(previous => previous.map(row => ({ ...row, selected: false })))}>清空选择</button><button type="button" disabled={locked || (!audios.length && !lyrics.length)} onClick={() => { setAudios([]); setLyrics([]); setRows([]); setError('') }}>清空文件</button></div>
      {rows.length ? <div className="batch-import-table">
        <div className="batch-import-columns" aria-hidden="true"><span/><span>歌名 / 歌手</span><span>音频 / 对应歌词</span><span>状态</span><span/></div>
        <ol className="batch-import-rows">{rows.map((row, index) => {
          const problem = batchRowProblem(row, rows, lyrics)
          const audio = audios.find(entry => entry.id === row.audioId)
          const lyric = lyrics.find(entry => entry.id === row.lyricId)
          return <li className={`batch-import-row ${problem ? 'needs-pair' : 'ready'}`} key={row.audioId}>
            <input type="checkbox" checked={row.selected} disabled={locked || !lyric?.parsed || Boolean(lyric?.error)} aria-label={`选择第 ${index + 1} 首歌曲`} onChange={event => changeRow(row.audioId, 'selected', event.target.checked)}/>
            <div className="batch-song-meta"><input aria-label={`第 ${index + 1} 首歌曲名`} value={row.title} maxLength={200} disabled={locked} onChange={event => changeRow(row.audioId, 'title', event.target.value)}/><input aria-label={`第 ${index + 1} 首歌手`} value={row.artist} maxLength={200} disabled={locked} onChange={event => changeRow(row.audioId, 'artist', event.target.value)}/></div>
            <div className="batch-song-files"><strong title={audio.file.name}>{audio.file.name}</strong><select aria-label={`第 ${index + 1} 首对应歌词`} value={row.lyricId} disabled={locked} onChange={event => pairLyric(row.audioId, event.target.value)}><option value="">请选择歌词文件</option>{lyrics.map(entry => <option key={entry.id} value={entry.id} disabled={usedLyrics.has(entry.id) && usedLyrics.get(entry.id) !== row.audioId}>{entry.file.name}{entry.error ? '（读取失败）' : ''}</option>)}</select></div>
            <span className={`batch-song-status ${problem ? 'error' : ''}`}>{problem || `可导入 · ${lyric.parsed.lines.length} 句`}</span>
            <button type="button" className="batch-remove-audio" aria-label={`移除第 ${index + 1} 首音频`} disabled={locked} onClick={() => removeAudio(row.audioId)}><X size={14}/></button>
          </li>
        })}</ol>
      </div> : <div className="batch-import-empty">先选择音频和歌词，配对结果会显示在这里。</div>}
      {unpairedLyrics.length > 0 && <details className="batch-unpaired-lyrics" open><summary>{unpairedLyrics.length} 份歌词尚未配对</summary><ul>{unpairedLyrics.map(entry => <li key={entry.id}>{entry.file.name}{entry.error && <span> · {entry.error}</span>}</li>)}</ul></details>}
      <p className="batch-import-note">使用默认封面。导入后可在歌曲库编辑歌词、时间轴与封面，也可在学习页生成 AI 解析。</p>
    </div>
    <footer className="batch-import-footer">
      {error && <p className="song-import-error" role="alert"><CircleAlert size={14}/>{error}</p>}
      <div className="song-import-actions"><span>已勾选 {selected.length} 首</span><button type="button" disabled={busy || submitting} onClick={onClose}>取消</button><button className="song-import-submit" type="submit" disabled={locked || !selected.length || selected.some(row => batchRowProblem(row, rows, lyrics))}>{busy || submitting ? <LoaderCircle className="spin" size={14}/> : <Upload size={14}/>} {busy || submitting ? `正在导入 ${selected.length} 首…` : `导入选中的 ${selected.length} 首歌曲`}</button></div>
    </footer>
  </form>
}
