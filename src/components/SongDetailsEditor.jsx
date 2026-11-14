import UnsavedChangesDialog from './UnsavedChangesDialog'
import { formatLyricTime, parseLyricTime, shiftLyricTime, validLyricEnd } from '../lib/lyricTiming'
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { ImagePlus, Music2, Plus, Trash2, X, Undo2, Redo2 } from 'lucide-react'
import ArtworkPicker from './ArtworkPicker'
import LyricLineEditor from './LyricLineEditor'
import { annotationMatchesLine } from '../lib/learningIdentity'
import { parseLrcFile } from '../lib/localSongStore'
import { editHistoryReducer, newEditHistory } from '../lib/editHistory'
import DesktopOnlineLyricsSearch from './DesktopOnlineLyricsSearch'
import LrcReviewEditor from './LrcReviewEditor'
import { savedSongTrackCues, compileSavedSongTracks } from '../lib/savedSongTracks'
import { compileLrcCues } from '../lib/lrcReview'
import { useDesktopUnsavedDraft } from '../lib/useDesktopUnsavedDraft'

const timeText = formatLyricTime
const parseTime = parseLyricTime
const draftFor = song => ({ title: song.title, artist: song.artist || '',
  lines: song.lines.map(line => ({ ...line, time: timeText(line.start), endTime: timeText(line.end) })), audioFile: null, sourceFile: song.sourceFile, lyricsReplaced: false, artworkDraft: null, readingDrafts: {} })

function SongDraftDialog({ label, className = '', onCancel, children }) {
  const dialogRef = useRef(null)
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const trigger = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialogRef} className={'song-draft-dialog ' + className} aria-label={label}
    onCancel={event => { event.preventDefault(); onCancel?.() }}
    onClick={event => event.stopPropagation()}>
    {children}
  </dialog>
}

export default function SongDetailsEditor({ song, onClose, onSave, busy,
  annotations = [], corrections = {}, hiddenReadings = {}, initialArtwork = null }) {
  const [history, dispatch] = useReducer(editHistoryReducer, song, value => newEditHistory(draftFor(value)))
  const { title, artist, lines, audioFile, sourceFile, lyricsReplaced, artworkDraft, readingDrafts } = history.present
  const desktop = Boolean(window.utaDesktop)
  const [tab, setTab] = useState('lyrics')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const formRef = useRef(null)
  const [error, setError] = useState('')
  const [parsing, setParsing] = useState(false)
  const [searchQuery, setSearchQuery] = useState(null)
  const [replacement, setReplacement] = useState(null)
  const [notice, setNotice] = useState('')
  const [readingLineId, setReadingLineId] = useState(null)
  const [coverOpen, setCoverOpen] = useState(false)
  const [coverChoice, setCoverChoice] = useState(null)
  const [coverProcessing, setCoverProcessing] = useState(false)
  const chosenCover = artworkDraft || initialArtwork
  const draftLine = lines.find(line => line.id === readingLineId)
  const readingLine = draftLine && { ...draftLine, text: draftLine.text.trim() }
  const previousReading = readingLine && readingDrafts[readingLine.id]
  const readingAnnotation = readingLine && (previousReading?.annotation
    || annotations.find(item => annotationMatchesLine(item, readingLine)))
  const readingOverrides = previousReading ? Object.fromEntries(Object.entries(previousReading.readings).map(([index, value]) =>
    [song.id + ':' + readingLine.id + ':' + index, value])) : corrections
  const readingHidden = previousReading ? Object.fromEntries(Object.entries(previousReading.hidden).map(([index, value]) =>
    [song.id + ':' + readingLine.id + ':' + index, value])) : hiddenReadings
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
    if (locked || readingLine || coverOpen) return
    if (!dirty) onClose()
    else setConfirmLeave(true)
  }
  function changeLine(id, field, value) {
    const nextReadings = { ...readingDrafts }
    if (field === 'text' && lines.find(line => line.id === id)?.text !== value) delete nextReadings[id]
    edit({ readingDrafts: nextReadings, lines: lines.map(line => {
      if (line.id !== id) return line
      const updated = { ...line, [field]: value }
      if (field === 'text' && value !== line.text) delete updated.sourceReadings
      return updated
    }) })
  }
  function applyReadingDraft({ annotation, readings, hidden }) {
    if (!readingLine || !annotationMatchesLine(annotation, readingLine)) throw new Error('歌词与当前读音不一致，请重新注音。')
    edit({ readingDrafts: { ...readingDrafts, [readingLine.id]: { lineId: readingLine.id, annotation, readings, hidden } } })
    setReadingLineId(null)
    setNotice('分词与读音已更新到整首草稿。')
  }
  function removeLine(id) {
    const nextReadings = { ...readingDrafts }
    delete nextReadings[id]
    edit({ lines: lines.filter(line => line.id !== id), readingDrafts: nextReadings })
  }
  function applyCover() {
    if (!coverChoice || coverProcessing) return
    if (JSON.stringify(coverChoice) !== JSON.stringify(chosenCover)) {
      edit({ artworkDraft: coverChoice })
      setNotice('封面已应用到歌曲草稿。')
    }
    setCoverOpen(false)
  }
  function startTrackAdjustment() {
    const baseLines = lines.map(line => ({ ...line, end: parseTime(line.endTime) }))
    setReplacement({ kind: 'saved', fileName: '当前编辑中的歌词', cues: savedSongTrackCues(lines), baseLines })
    setError(''); setNotice(''); setSearchQuery(null)
  }
  async function replaceLyrics(file) {
    if (!file || locked || adjustingTracks) return
    setParsing(true); setError(''); setNotice('')
    try {
      const parsed = await parseLrcFile(file)
      if (alive.current) { setReplacement({ fileName: file.name, cues: parsed.cues, untimed: parsed.untimed }); setTab('tracks') }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '歌词文件无法读取。') }
    finally { if (alive.current) setParsing(false) }
  }
  function applyReplacement() {
    if (locked || !preview || preview.issues.length) return
    const retained = adjustingTracks ? Object.fromEntries(Object.entries(readingDrafts).filter(([id, draft]) =>
      preview.lines.some(line => line.id === Number(id) && annotationMatchesLine(draft.annotation, line)))) : {}
    edit({ readingDrafts: retained, lines: preview.lines.map(line => ({ ...line, time: timeText(line.start), endTime: line.endTime ?? timeText(line.end) })),
      ...(adjustingTracks ? {} : { sourceFile: replacement.fileName, lyricsReplaced: true }) })
    setReplacement(null); setTab('lyrics')
    setNotice(adjustingTracks ? '轨道调整已应用到草稿，可撤销；点击“保存修改”后才会写入歌曲。' : '新歌词已应用到编辑草稿，可撤销；点击“保存修改”后才会写入歌曲。')
  }
  async function save(event) {
    event?.preventDefault()
    if (locked || readingLine || coverOpen) return
    if (replacement) { setError('请先应用或取消歌词预览。'); return }
    if (!title.trim()) { setTab('meta'); setError('请填写歌曲名称。'); return }
    if (!lines.length) { setError('至少保留一句歌词。'); return }
    const prepared = []
    for (const [index, line] of lines.entries()) {
      const start = parseTime(line.time)
      if (start == null && line.time.trim() || !line.text.trim()) { setError(`第 ${index + 1} 句的时间或歌词无效。`); return }
      const end = line.endTime?.trim() ? parseLyricTime(line.endTime) : null
      if (line.endTime?.trim() && end === null) { setError(`第 ${index + 1} 句的结束时间无效。`); return }
      if (!validLyricEnd({ ...line, start, end })) { setError(`第 ${index + 1} 句的结束时间必须晚于开始时间，请调整后保存。`); return }
      const { time, endTime, ...fields } = line
      prepared.push({ ...fields, start, end, text: line.text.trim(), translation: String(line.translation || '').trim(), ...(line.romaji != null ? { romaji: String(line.romaji).trim() } : {}) })
    }
    // Preserve imported line order and identity, including untimed lyrics.
    setError('')
    const lineReadingDrafts = Object.values(readingDrafts).filter(draft =>
      prepared.some(line => annotationMatchesLine(draft.annotation, line)))
    try { await onSave({ title: title.trim(), artist: artist.trim() || '未知歌手', lines: prepared, audioFile, sourceFile, lyricsReplaced, artworkDraft, lineReadingDrafts }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。') }
  }
  return <><div className={`song-editor-backdrop${desktop ? " desktop-editor-workspace" : ""}`} onClick={close}><form ref={formRef} className="song-editor" role="dialog" aria-modal="true" aria-label={`编辑《${song.title}》`} onClick={event => event.stopPropagation()} onSubmit={save} onKeyDown={event => {
    if (!event.ctrlKey || event.altKey || locked || replacement) return
    const key = event.key.toLowerCase()
    if (key === 'z' || key === 'y') { event.preventDefault(); navigateHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo') }
  }}>
    <div className="song-editor-head"><div><p>{song.title}</p><h2>编辑歌曲 <small className="editor-draft-state" role="status">{dirty ? "未保存" : "已保存"}</small></h2></div><button type="button" disabled={locked} onClick={close} aria-label="关闭编辑"><X size={20} /></button></div>
    <div className="song-editor-history" role="group" aria-label="编辑历史"><button type="button" disabled={locked || Boolean(replacement) || !history.past.length} onClick={() => navigateHistory('undo')} aria-label="撤销编辑"><Undo2 size={14} />撤销</button><button type="button" disabled={locked || Boolean(replacement) || !history.future.length} onClick={() => navigateHistory('redo')} aria-label="重做编辑"><Redo2 size={14} />重做</button><small>Ctrl+Z / Ctrl+Y · 可撤销歌词、分词与封面等草稿修改</small></div>
    {desktop && <nav className="song-editor-tabs" aria-label="歌曲编辑任务">{[['lyrics', '歌词与时间'], ['meta', '歌曲信息'], ['tracks', '归类与配对']].map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}{id === 'tracks' && replacement ? ' · 预览待应用' : ''}</button>)}</nav>}
    <div className="song-editor-fields"><fieldset className="song-editor-fieldset" disabled={locked}>
    <section hidden={desktop && tab !== "meta"}><div className="song-editor-meta"><label>歌曲名称<input value={title} onChange={event => edit({ title: event.target.value })} maxLength={160} /></label><label>歌手名称<input value={artist} onChange={event => edit({ artist: event.target.value })} maxLength={160} /></label></div>
    {desktop && <section className="song-editor-cover-card" aria-label="歌曲封面">
      {chosenCover?.artworkUrl ? <img src={chosenCover.artworkUrl} alt="当前草稿封面" referrerPolicy="no-referrer"/>
        : <span className="song-editor-cover-placeholder"><Music2 size={27}/></span>}
      <div><b>歌曲封面</b><p>{chosenCover?.artworkProvider || '默认封面'} · 随整首草稿一起保存</p>
        <button type="button" onClick={() => { setCoverChoice(chosenCover); setCoverOpen(true) }}><ImagePlus size={15}/>更换封面</button>
      </div>
    </section>}
    <div className="song-editor-files"><label>重新上传歌曲音频<input key={audioFile ? `${audioFile.name}-${audioFile.lastModified}` : 'no-audio'} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" onChange={event => edit({ audioFile: event.target.files?.[0] || null })} /><small>{audioFile?.name || `当前文件：${song.audioName || '未记录文件名'}`}</small></label><label>用 LRC 替换整首歌词<input type="file" disabled={adjustingTracks} accept=".lrc,.uta-lyrics.json,text/plain,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void replaceLyrics(file) }} /><small>{parsing ? '正在读取歌词…' : '也可以直接修改下方每一句。'}</small></label></div>
    {window.utaDesktop && <div className="song-editor-online">
      <button className="song-editor-search-toggle" type="button" disabled={locked || adjustingTracks} aria-expanded={searchQuery !== null} onClick={() => setSearchQuery(searchQuery === null ? [title.trim(), !['本地导入', '未知歌手'].includes(artist.trim()) ? artist.trim() : ''].filter(Boolean).join(' ') : null)}>{searchQuery === null ? '联网搜索并替换歌词' : '收起联网搜索'}</button>
      {searchQuery !== null && <DesktopOnlineLyricsSearch autoQuery={searchQuery} onChooseLyrics={replaceLyrics} disabled={locked || adjustingTracks} description="按当前歌名和歌手搜索其他歌词版本。选用后预览，应用到草稿，再保存修改；歌曲名称、歌手和音频保留。"/>}
    </div>}
    </section><section hidden={desktop && tab !== "tracks"}>
    {window.utaDesktop && <div className="song-editor-track-entry"><button type="button" disabled={locked || Boolean(replacement)} onClick={startTrackAdjustment}>重新归类与配对</button><p>将误判的原文、译文或罗马音重新归类，不必重新导入音频。只包含当前保存的内容，已丢弃的行需从原歌词补回。</p></div>}
    {replacement && <section className="song-editor-replacement" aria-label={adjustingTracks ? '已导入歌词轨道调整' : '替换歌词预览'}>
      <h3>{adjustingTracks ? '调整原文、译文与罗马音' : '替换歌词预览'}</h3>
      <p>{replacement.fileName} · {preview.lines.length} 句。核对后应用到草稿，不会立即覆盖已保存的歌曲。</p>
      {replacement.untimed && <p role="status">这份歌词没有时间轴，请逐句填写时间戳后再应用；自带假名会优先保留。</p>}
      <LrcReviewEditor cues={replacement.cues} onChange={cues => setReplacement(previous => ({ ...previous, cues }))} disabled={locked} label={adjustingTracks ? '已导入歌词' : '替换歌词'} mode={adjustingTracks ? 'saved' : 'import'} inspection={preview} issueNavigation={desktop}/>
      {adjustingTracks && <div className="song-editor-track-result" aria-label="调整后的歌词预览"><strong>调整后 · {preview.lines.length} 句</strong><ol>{preview.lines.map((line, index) => <li key={line.id}><span>第 {index + 1} 句 · {timeText(line.start) || '无时间'}</span><b>{line.text}</b>{line.translation && <p>译文：{line.translation}</p>}{line.romaji && <p>罗马音：{line.romaji}</p>}</li>)}</ol></div>}
      <div className="song-editor-replacement-actions"><button type="button" disabled={locked} onClick={() => { setReplacement(null); setError('') }}>{adjustingTracks ? '取消轨道调整' : '取消替换'}</button><button type="button" disabled={locked || Boolean(preview.issues.length)} onClick={applyReplacement}>{adjustingTracks ? '应用轨道调整到草稿' : '应用替换到草稿'}</button></div>
      {preview.issues.length > 0 && <p role="status">请先处理预览中的 {preview.issues.length} 项问题。</p>}
    </section>}
    </section>{notice && <p className="song-editor-notice" role="status">{notice}</p>}<section hidden={desktop && tab !== "lyrics"}>
    {!adjustingTracks && <><div className="song-editor-lines-head"><strong>歌词与时间轴 · {lines.length} 句</strong><button type="button" onClick={() => edit({ lines: [...lines, { id: Math.max(-1, ...lines.map(line => line.id)) + 1, time: lines.at(-1)?.time || '00:00.000', endTime: '', text: '', translation: '' }] })}><Plus size={15} /> 添加一句</button></div>
    <ol className="song-editor-lines">{lines.map((line, index) => <li key={line.id}><span>{String(index + 1).padStart(2, '0')}</span><div><label>日文歌词<input value={line.text} onChange={event => changeLine(line.id, 'text', event.target.value)} lang="ja" /></label><label>中文译文<input value={line.translation || ''} onChange={event => changeLine(line.id, 'translation', event.target.value)} /></label><label>开始时间<input aria-label="开始时间" value={line.time} onChange={event => changeLine(line.id, 'time', event.target.value)} placeholder="00:12.345" />{desktop && <span className="editor-time-nudges">{[-0.2, 0.2].map(delta => <button key={delta} type="button" aria-label={`第 ${index + 1} 句开始时间${delta > 0 ? '增加' : '减少'}0.2秒`} onClick={() => { try { changeLine(line.id, 'time', shiftLyricTime(line.time, delta, parseLyricTime(lines[index - 1]?.time || '00:00.000')) ) } catch (reason) { setError(reason.message) } }}>{delta > 0 ? '+' : '−'}0.2s</button>)}</span>}</label><label>结束时间<input aria-label="结束时间" value={line.endTime || ''} placeholder="留空自动结束" onChange={event => changeLine(line.id, 'endTime', event.target.value)}/>{desktop && <span className="editor-time-nudges">{[-0.2, 0.2].map(delta => <button key={delta} type="button" aria-label={`第 ${index + 1} 句结束时间${delta > 0 ? '增加' : '减少'}0.2秒`} onClick={() => { try { changeLine(line.id, 'endTime', shiftLyricTime(line.endTime || '', delta, parseLyricTime(lines[index + 1]?.time) ?? ((parseLyricTime(line.time) ?? 0) + 1))) } catch (reason) { setError(reason.message) } }}>{delta > 0 ? '+' : '−'}0.2s</button>)}</span>}</label><label>导入的罗马音<input value={line.romaji || ''} onChange={event => changeLine(line.id, 'romaji', event.target.value)} /></label>{desktop && <div className="song-editor-line-reading"><button type="button" disabled={Boolean(replacement) || !line.text.trim()}
      aria-label={'第 ' + (index + 1) + ' 句分词与读音'} onClick={() => setReadingLineId(line.id)}>分词与读音</button>
      {readingDrafts[line.id] && <small role="status">分词和读音待保存</small>}</div>}</div>
      <button type="button" onClick={() => removeLine(line.id)} aria-label={`删除第 ${index + 1} 句`}><Trash2 size={15} /></button></li>)}</ol></>}
    </section></fieldset></div>
    <p className="song-editor-note">仅改译文、时间或歌曲信息会保留掌握与读音校对；替换时原文未变且能对应的句子保留学习进度，原文或自带注音变化会更新对应的读音校对。保存后可在侧栏撤销本次歌曲编辑。</p>
    {error && <p className="song-editor-error" role="alert">{error}</p>}
    <div className="song-editor-actions"><button type="button" disabled={locked} onClick={close}>取消</button><button type="submit" disabled={locked || Boolean(replacement)}>{busy ? '保存中…' : parsing ? '读取中…' : '保存修改'}</button></div>
    {confirmLeave && <UnsavedChangesDialog title="歌曲修改尚未保存" busy={locked} canSave={!replacement} onContinue={() => setConfirmLeave(false)} onDiscard={onClose} onSave={() => { setConfirmLeave(false); formRef.current.requestSubmit() }}>{replacement && <p>请先应用或取消歌词预览，再保存。</p>}</UnsavedChangesDialog>}
  </form></div>
  {coverOpen && <SongDraftDialog label="更换歌曲封面" className="song-draft-artwork" onCancel={() => { if (!coverProcessing) setCoverOpen(false) }}>
    <section className="artwork-edit-dialog">
      <header className="song-draft-cover-heading"><h2>更换歌曲封面</h2><button type="button" aria-label="关闭封面选择" disabled={coverProcessing} onClick={() => setCoverOpen(false)}><X size={18}/></button></header>
      <ArtworkPicker title={title} artist={artist} selected={coverChoice} onSelect={setCoverChoice} onProcessing={setCoverProcessing}/>
      <div className="song-editor-replacement-actions"><button type="button" disabled={coverProcessing} onClick={() => setCoverOpen(false)}>取消</button>
        <button type="button" disabled={!coverChoice || coverProcessing} onClick={applyCover}>应用封面到草稿</button></div>
    </section>
  </SongDraftDialog>}
  {readingLine && <SongDraftDialog label="整首歌词分词草稿" className="song-draft-reading">
    <LyricLineEditor key={readingLine.id} song={song} line={{ ...readingLine, start: parseTime(readingLine.time), end: parseTime(readingLine.endTime) }}
      annotation={readingAnnotation} corrections={readingOverrides} hiddenReadings={readingHidden}
      desktop draftOnly onSave={applyReadingDraft} onClose={() => setReadingLineId(null)}/>
  </SongDraftDialog>}
  </>
}
