import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { toHiragana } from 'wanakana'
import { annotateSongLines } from '../lib/annotationApi'
import { displayReading, tokenReading } from '../lib/readingDisplay'
import { buildSegmentedTokens } from '../lib/lyricSegmentation'
import { useDesktopUnsavedDraft } from '../lib/useDesktopUnsavedDraft'
import { formatLyricTime, parseLyricTime, shiftLyricTime } from '../lib/lyricTiming'
import { lyricRangeBounds } from '../lib/lyricRange'
import LyricSegmentationDialog from './LyricSegmentationDialog'

// 单句编辑同时提供词典重注音和逐词人工读音，适配歌手使用的特殊读法。
export default function LyricLineEditor({ song, line, annotation, corrections, hiddenReadings = {}, desktop = false, audioDuration = null, segmentationSuggestion = null, onSave, onClose }) {
  const [text, setText] = useState(line.text)
  const [translation, setTranslation] = useState(line.translation || '')
  const [start, setStart] = useState(() => formatLyricTime(line.start))
  const [end, setEnd] = useState(() => formatLyricTime(line.end))
  const [annotatedText, setAnnotatedText] = useState(annotation ? line.text : '')
  const [tokens, setTokens] = useState(annotation?.tokens || [])
  const [readings, setReadings] = useState(Object.fromEntries((annotation?.tokens || []).map((token) => [token.index, tokenReading(token, corrections, `${song.id}:${line.id}:${token.index}`)])))
  const [hidden, setHidden] = useState(Object.fromEntries((annotation?.tokens || []).map((token) => [token.index, Boolean(hiddenReadings[`${song.id}:${line.id}:${token.index}`])])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [segmentationOpen, setSegmentationOpen] = useState(Boolean(segmentationSuggestion))
  const [activeSegmentationSuggestion, setActiveSegmentationSuggestion] = useState(segmentationSuggestion)
  const [segmentationError, setSegmentationError] = useState('')
  const [segmentationNotice, setSegmentationNotice] = useState('')
  const requestRef = useRef(0)
  useEffect(() => () => { requestRef.current += 1 }, [])
  const initialStart = formatLyricTime(line.start)
  const initialEnd = formatLyricTime(line.end)
  const inferredEnd = lyricRangeBounds(song.lines.map(item => item.id === line.id ? { ...item, start: parseLyricTime(start), end: null } : item), line.id, line.id, audioDuration)?.end
  const initialReadings = Object.fromEntries((annotation?.tokens || []).map(token => [token.index, tokenReading(token, corrections, `${song.id}:${line.id}:${token.index}`)]))
  const initialHidden = Object.fromEntries((annotation?.tokens || []).map(token => [token.index, Boolean(hiddenReadings[`${song.id}:${line.id}:${token.index}`])]))
  const dirty = text !== line.text || translation !== (line.translation || '') || start !== initialStart || end !== initialEnd
    || JSON.stringify(readings) !== JSON.stringify(initialReadings) || JSON.stringify(hidden) !== JSON.stringify(initialHidden)
    || JSON.stringify(tokens) !== JSON.stringify(annotation?.tokens || [])
  useDesktopUnsavedDraft('lyric-editor', desktop && dirty)
  function close() { if (!busy && (!dirty || window.confirm('这一句还有未保存的修改，确定放弃吗？'))) onClose() }

  async function regenerate() {
    if (song.language && song.language !== 'ja') { setError('Windows 内置词典仅自动注音日语，其他语言请保留来源读音或直接编辑已有词的读音。'); return }
    const value = text.trim()
    if (!value || value.length > 500) { setError('请填写 1～500 字的歌词。'); return }
    const request = ++requestRef.current
    setBusy(true)
    setError('')
    try {
      const result = await annotateSongLines([{ id: line.id, text: value }])
      if (request !== requestRef.current) return
      const generated = result.find((item) => item.id === line.id)?.tokens
      if (!generated?.length) throw new Error('未能生成读音，请重试。')
      setTokens(generated)
      setReadings(Object.fromEntries(generated.map((token) => [token.index, token.reading])))
      setHidden({})
      setAnnotatedText(value)
      setSegmentationNotice('')
    } catch (reason) { if (request === requestRef.current) setError(reason.message || '重新注音失败。') }
    finally { if (request === requestRef.current) setBusy(false) }
  }

  async function confirmSegmentation(surfaces) {
    const request = ++requestRef.current
    setBusy(true)
    setSegmentationError('')
    try {
      const draft = buildSegmentedTokens(tokens, readings, hidden, surfaces, line.sourceReadings)
      if (draft.needsGeneration.length) {
        const pending = draft.needsGeneration.map(index => ({ id: index, text: draft.tokens[index].surface }))
        const generated = await annotateSongLines(pending)
        if (request !== requestRef.current) return
        for (const index of draft.needsGeneration) {
          const result = generated.find(item => item.id === index)
          if (!result?.tokens?.length || result.tokens.map(item => item.surface).join('') !== draft.tokens[index].surface) throw new Error('部分新词未能生成读音，请重试或调整分词。')
          const reading = result.tokens.filter(item => !item.is_symbol).map(item => item.reading || '').join('')
          if (!reading) throw new Error('部分新词未能生成读音，请重试或调整分词。')
          draft.tokens[index].reading = reading
          draft.readings[index] = reading
        }
      }
      setTokens(draft.tokens)
      setReadings(draft.readings)
      setHidden(draft.hidden)
      setSegmentationOpen(false)
      setActiveSegmentationSuggestion(null)
      setSegmentationNotice('分词已更新。请核对下方每个词的假名和罗马音；拆开的词已生成读音草稿，保存修改后才会应用到歌词。')
    } catch (reason) { if (request === requestRef.current) setSegmentationError(reason.message || '调整分词失败，请重试。') }
    finally { if (request === requestRef.current) setBusy(false) }
  }

  async function save(event) {
    event.preventDefault()
    const seconds = parseLyricTime(start)
    const endSeconds = parseLyricTime(end)
    if (start.trim() && seconds === null || end.trim() && endSeconds === null) { setError('时间格式应为 mm:ss.sss，例如 01:23.456；未设置时间可留空。'); return }
    if (endSeconds !== null && (seconds === null || endSeconds <= seconds)) { setError('结束时间必须晚于开始时间，请同时检查两个时间。'); return }
    const position = song.lines.findIndex((item) => item.id === line.id)
    const previousTimed = song.lines.slice(0, position).findLast(item => Number.isFinite(item.start))
    const nextTimed = song.lines.slice(position + 1).find(item => Number.isFinite(item.start))
    if (seconds !== null && (previousTimed && seconds < previousTimed.start || nextTimed && seconds > nextTimed.start)) { setError('时间不能早于上一句或晚于下一句。'); return }
    if (!text.trim() || text.trim().length > 500 || translation.length > 1000) { setError('请检查歌词和译文长度。'); return }
    if (text.trim() !== annotatedText && text.trim() !== line.text) { setError('歌词已调整，请先点击“重新注音”，再确认读音。'); return }
    const prepared = Object.fromEntries(tokens.map((token) => {
      const value = String(readings[token.index] ?? '').trim()
      return [token.index, token.manual_reading_mode === 'literal' ? value : toHiragana(value)]
    }))
    setBusy(true)
    const preparedTokens = tokens.map(token => token.manual_group_reading != null ? { ...token, manual_group_reading: prepared[token.index] } : token)
    try { await onSave({ annotation: preparedTokens.length ? { id: line.id, text: text.trim(), tokens: preparedTokens } : null, readings: prepared, translation, start: seconds, end: endSeconds, hidden }) }
    catch (reason) { setError(reason.message || '保存失败，请重试。') }
    finally { setBusy(false) }
  }

  function adjustTime(kind, delta) {
    try {
      if (kind === 'start') setStart(shiftLyricTime(start, delta, line.start ?? 0))
      else setEnd(shiftLyricTime(end, delta, inferredEnd))
      setError('')
    } catch (reason) { setError(reason.message) }
  }

  return <div className="line-editor-backdrop" onClick={close}><form className="line-editor" role="dialog" aria-modal={!segmentationOpen} aria-labelledby="line-editor-title" onClick={(event) => event.stopPropagation()} onSubmit={save}>
    <header><h2 id="line-editor-title">编辑这一句</h2><button type="button" disabled={busy} onClick={close} aria-label="关闭歌词编辑"><X size={20} /></button></header>
    <label className="line-editor-lyric">日文歌词<textarea value={text} lang="ja" maxLength={500} disabled={busy} onChange={(event) => setText(event.target.value)} /></label>
    {desktop && <div className="line-editor-metadata"><div className="line-editor-timing" role="group" aria-label="单句起止时间">
      <div className="line-editor-time-field"><label htmlFor="line-start-time">开始时间（分:秒.毫秒）</label><input id="line-start-time" value={start} inputMode="decimal" placeholder="未设置，可留空" disabled={busy} onChange={(event) => { setStart(event.target.value); setError('') }} /><div className="line-editor-time-steps"><button type="button" disabled={busy} aria-label="开始时间减少0.2秒" onClick={() => adjustTime('start', -0.2)}>−0.2 秒</button><button type="button" disabled={busy} aria-label="开始时间增加0.2秒" onClick={() => adjustTime('start', 0.2)}>＋0.2 秒</button></div></div>
      <div className="line-editor-time-field"><label htmlFor="line-end-time">结束时间（分:秒.毫秒）</label><input id="line-end-time" value={end} inputMode="decimal" placeholder={Number.isFinite(inferredEnd) ? `自动 ${formatLyricTime(inferredEnd)}` : '留空：自动结束'} disabled={busy} onChange={(event) => { setEnd(event.target.value); setError('') }} /><div className="line-editor-time-steps"><button type="button" disabled={busy} aria-label="结束时间减少0.2秒" onClick={() => adjustTime('end', -0.2)}>−0.2 秒</button><button type="button" disabled={busy} aria-label="结束时间增加0.2秒" onClick={() => adjustTime('end', 0.2)}>＋0.2 秒</button></div></div>
      <small>结束时间留空时，按下一句或音频结尾自动结束。单句播放保留原有的 0.5 秒提前量。</small>
    </div><label>中文译文<textarea value={translation} maxLength={1000} disabled={busy} onChange={(event) => setTranslation(event.target.value)} /></label></div>}
    <div className="line-editor-reading-head"><strong>读音校对</strong><div className="line-editor-reading-actions"><button type="button" disabled={busy || !tokens.length || text.trim() !== annotatedText} onClick={() => { setSegmentationError(''); setActiveSegmentationSuggestion(null); setSegmentationOpen(true) }}>自定义分词</button><button type="button" disabled={busy} onClick={regenerate}><RefreshCw size={15} />{busy ? '处理中…' : '重新注音'}</button></div></div>
    <p>可按歌手实际唱法修改读音；留空表示不注音，重新注音会恢复词典读音。</p>
    {text.trim() !== annotatedText && <p className="line-editor-warning">歌词已变化，请重新注音。</p>}
    {segmentationNotice && <p className="line-editor-segmentation-notice">{segmentationNotice}</p>}
    <div className="line-editor-readings">{tokens.filter((token) => !token.is_symbol).map((token) => <div className="line-editor-word" key={token.index}><label><span lang="ja">{token.surface}</span><input aria-label={`${token.surface}的读音`} lang="ja" value={readings[token.index] || ''} disabled={busy || text.trim() !== annotatedText} onChange={(event) => setReadings((previous) => ({ ...previous, [token.index]: event.target.value }))} /></label><span className="line-editor-romaji" lang="ja-Latn">{displayReading(readings[token.index] || '', 'romaji', token, readings[token.index] !== token.reading)}</span>{desktop && /[\u3400-\u9fff]/u.test(token.surface) && <label className="line-editor-hide"><input type="checkbox" checked={Boolean(hidden[token.index])} disabled={busy || text.trim() !== annotatedText} onChange={(event) => setHidden((previous) => ({ ...previous, [token.index]: event.target.checked }))} />隐藏此词注音</label>}</div>)}</div>
    {error && <p className="line-editor-error" role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={close}>取消</button><button type="submit" disabled={busy || text.trim() !== annotatedText && text.trim() !== line.text}>保存修改</button></footer>
    {segmentationOpen && <LyricSegmentationDialog text={annotatedText} tokens={tokens} suggestion={activeSegmentationSuggestion} busy={busy} error={segmentationError} onConfirm={confirmSegmentation} onCancel={() => { setSegmentationOpen(false); setActiveSegmentationSuggestion(null) }} />}
  </form></div>
}
