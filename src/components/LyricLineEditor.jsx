import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { toHiragana } from 'wanakana'
import { annotateSongLines } from '../lib/annotationApi'
import { displayReading } from '../lib/readingDisplay'
import { buildSegmentedTokens } from '../lib/lyricSegmentation'
import { useDesktopUnsavedDraft } from '../lib/useDesktopUnsavedDraft'
import LyricSegmentationDialog from './LyricSegmentationDialog'

// 单句编辑同时提供词典重注音和逐词人工读音，适配歌手使用的特殊读法。
export default function LyricLineEditor({ song, line, annotation, corrections, hiddenReadings = {}, desktop = false, segmentationSuggestion = null, onSave, onClose }) {
  const [text, setText] = useState(line.text)
  const [translation, setTranslation] = useState(line.translation || '')
  const [start, setStart] = useState(() => {
    const minutes = Math.floor(line.start / 60)
    return `${String(minutes).padStart(2, '0')}:${(line.start % 60).toFixed(3).padStart(6, '0')}`
  })
  const [annotatedText, setAnnotatedText] = useState(annotation ? line.text : '')
  const [tokens, setTokens] = useState(annotation?.tokens || [])
  const [readings, setReadings] = useState(Object.fromEntries((annotation?.tokens || []).map((token) => [token.index, corrections[`${song.id}:${line.id}:${token.index}`] || token.reading])))
  const [hidden, setHidden] = useState(Object.fromEntries((annotation?.tokens || []).map((token) => [token.index, Boolean(hiddenReadings[`${song.id}:${line.id}:${token.index}`])])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [segmentationOpen, setSegmentationOpen] = useState(Boolean(segmentationSuggestion))
  const [activeSegmentationSuggestion, setActiveSegmentationSuggestion] = useState(segmentationSuggestion)
  const [segmentationError, setSegmentationError] = useState('')
  const [segmentationNotice, setSegmentationNotice] = useState('')
  const requestRef = useRef(0)
  useEffect(() => () => { requestRef.current += 1 }, [])
  const initialStart = `${String(Math.floor(line.start / 60)).padStart(2, '0')}:${(line.start % 60).toFixed(3).padStart(6, '0')}`
  const initialReadings = Object.fromEntries((annotation?.tokens || []).map(token => [token.index, corrections[`${song.id}:${line.id}:${token.index}`] || token.reading]))
  const initialHidden = Object.fromEntries((annotation?.tokens || []).map(token => [token.index, Boolean(hiddenReadings[`${song.id}:${line.id}:${token.index}`])]))
  const dirty = text !== line.text || translation !== (line.translation || '') || start !== initialStart
    || JSON.stringify(readings) !== JSON.stringify(initialReadings) || JSON.stringify(hidden) !== JSON.stringify(initialHidden)
    || JSON.stringify(tokens) !== JSON.stringify(annotation?.tokens || [])
  useDesktopUnsavedDraft('lyric-editor', desktop && dirty)
  function close() { if (!busy && (!dirty || window.confirm('这一句还有未保存的修改，确定放弃吗？'))) onClose() }

  async function regenerate() {
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
    const timestamp = start.trim().match(/^(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)$/)
    if (!timestamp) { setError('时间格式应为 mm:ss.sss，例如 01:23.456。'); return }
    const seconds = Number(timestamp[1]) * 60 + Number(timestamp[2])
    const position = song.lines.findIndex((item) => item.id === line.id)
    if (position > 0 && seconds < song.lines[position - 1].start || position < song.lines.length - 1 && seconds > song.lines[position + 1].start) { setError('时间不能早于上一句或晚于下一句。'); return }
    if (!text.trim() || text.trim().length > 500 || translation.length > 1000) { setError('请检查歌词和译文长度。'); return }
    if (text.trim() !== annotatedText && text.trim() !== line.text) { setError('歌词已调整，请先点击“重新注音”，再确认读音。'); return }
    const prepared = Object.fromEntries(tokens.map((token) => [token.index, toHiragana(String(readings[token.index] || '').trim())]))
    if (tokens.some((token) => !token.is_symbol && !prepared[token.index])) { setError('请补全每个词的读音。'); return }
    setBusy(true)
    try { await onSave({ annotation: tokens.length ? { id: line.id, text: text.trim(), tokens } : null, readings: prepared, translation, start: seconds, hidden }) }
    catch (reason) { setError(reason.message || '保存失败，请重试。') }
    finally { setBusy(false) }
  }

  return <div className="line-editor-backdrop" onClick={close}><form className="line-editor" role="dialog" aria-modal={!segmentationOpen} aria-labelledby="line-editor-title" onClick={(event) => event.stopPropagation()} onSubmit={save}>
    <header><h2 id="line-editor-title">编辑这一句</h2><button type="button" disabled={busy} onClick={close} aria-label="关闭歌词编辑"><X size={20} /></button></header>
    <label className="line-editor-lyric">日文歌词<textarea value={text} lang="ja" maxLength={500} disabled={busy} onChange={(event) => setText(event.target.value)} /></label>
    {desktop && <div className="line-editor-metadata"><label>开始时间（分:秒.毫秒）<input value={start} inputMode="decimal" disabled={busy} onChange={(event) => setStart(event.target.value)} /></label><label>中文译文<textarea value={translation} maxLength={1000} disabled={busy} onChange={(event) => setTranslation(event.target.value)} /></label></div>}
    <div className="line-editor-reading-head"><strong>读音校对</strong><div className="line-editor-reading-actions"><button type="button" disabled={busy || !tokens.length || text.trim() !== annotatedText} onClick={() => { setSegmentationError(''); setActiveSegmentationSuggestion(null); setSegmentationOpen(true) }}>自定义分词</button><button type="button" disabled={busy} onClick={regenerate}><RefreshCw size={15} />{busy ? '处理中…' : '重新注音'}</button></div></div>
    <p>可按歌手实际唱法修改读音；重新注音会恢复词典读音。</p>
    {text.trim() !== annotatedText && <p className="line-editor-warning">歌词已变化，请重新注音。</p>}
    {segmentationNotice && <p className="line-editor-segmentation-notice">{segmentationNotice}</p>}
    <div className="line-editor-readings">{tokens.filter((token) => !token.is_symbol).map((token) => <div className="line-editor-word" key={token.index}><label><span lang="ja">{token.surface}</span><input aria-label={`${token.surface}的读音`} lang="ja" value={readings[token.index] || ''} disabled={busy || text.trim() !== annotatedText} onChange={(event) => setReadings((previous) => ({ ...previous, [token.index]: event.target.value }))} /></label><span className="line-editor-romaji" lang="ja-Latn">{displayReading(readings[token.index] || '', 'romaji', token, readings[token.index] !== token.reading)}</span>{desktop && /[\u3400-\u9fff]/u.test(token.surface) && <label className="line-editor-hide"><input type="checkbox" checked={Boolean(hidden[token.index])} disabled={busy || text.trim() !== annotatedText} onChange={(event) => setHidden((previous) => ({ ...previous, [token.index]: event.target.checked }))} />隐藏此词注音</label>}</div>)}</div>
    {error && <p className="line-editor-error" role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={close}>取消</button><button type="submit" disabled={busy || text.trim() !== annotatedText && text.trim() !== line.text}>保存修改</button></footer>
    {segmentationOpen && <LyricSegmentationDialog text={annotatedText} tokens={tokens} suggestion={activeSegmentationSuggestion} busy={busy} error={segmentationError} onConfirm={confirmSegmentation} onCancel={() => { setSegmentationOpen(false); setActiveSegmentationSuggestion(null) }} />}
  </form></div>
}
