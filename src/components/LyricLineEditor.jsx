import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { toHiragana } from 'wanakana'
import { annotateSongLines } from '../lib/annotationApi'

// 单句编辑同时提供词典重注音和逐词人工读音，适配歌手使用的特殊读法。
export default function LyricLineEditor({ song, line, annotation, corrections, onSave, onClose }) {
  const [text, setText] = useState(line.text)
  const [annotatedText, setAnnotatedText] = useState(annotation ? line.text : '')
  const [tokens, setTokens] = useState(annotation?.tokens || [])
  const [readings, setReadings] = useState(Object.fromEntries((annotation?.tokens || []).map((token) => [token.index, corrections[`${song.id}:${line.id}:${token.index}`] || token.reading])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  useEffect(() => () => { requestRef.current += 1 }, [])

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
      setAnnotatedText(value)
    } catch (reason) { if (request === requestRef.current) setError(reason.message || '重新注音失败。') }
    finally { if (request === requestRef.current) setBusy(false) }
  }

  async function save(event) {
    event.preventDefault()
    if (text.trim() !== annotatedText || !tokens.length) { setError('歌词已调整，请先点击“重新注音”，再确认读音。'); return }
    const prepared = Object.fromEntries(tokens.map((token) => [token.index, toHiragana(String(readings[token.index] || '').trim())]))
    if (tokens.some((token) => !token.is_symbol && !prepared[token.index])) { setError('请补全每个词的读音。'); return }
    setBusy(true)
    try { await onSave({ annotation: { id: line.id, text: annotatedText, tokens }, readings: prepared }) }
    catch (reason) { setError(reason.message || '保存失败，请重试。') }
    finally { setBusy(false) }
  }

  return <div className="line-editor-backdrop" onClick={() => { if (!busy) onClose() }}><form className="line-editor" role="dialog" aria-modal="true" aria-labelledby="line-editor-title" onClick={(event) => event.stopPropagation()} onSubmit={save}>
    <header><h2 id="line-editor-title">编辑这一句</h2><button type="button" disabled={busy} onClick={onClose} aria-label="关闭歌词编辑"><X size={20} /></button></header>
    <label className="line-editor-lyric">日文歌词<textarea value={text} lang="ja" maxLength={500} disabled={busy} onChange={(event) => setText(event.target.value)} /></label>
    <div className="line-editor-reading-head"><strong>读音校对</strong><button type="button" disabled={busy} onClick={regenerate}><RefreshCw size={15} />{busy ? '处理中…' : '重新注音'}</button></div>
    <p>可按歌手实际唱法修改读音；重新注音会恢复词典读音。</p>
    {text.trim() !== annotatedText && <p className="line-editor-warning">歌词已变化，请重新注音。</p>}
    <div className="line-editor-readings">{tokens.filter((token) => !token.is_symbol).map((token) => <label key={token.index}><span lang="ja">{token.surface}</span><input aria-label={`${token.surface}的读音`} lang="ja" value={readings[token.index] || ''} disabled={busy || text.trim() !== annotatedText} onChange={(event) => setReadings((previous) => ({ ...previous, [token.index]: event.target.value }))} /></label>)}</div>
    {error && <p className="line-editor-error" role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" disabled={busy || !tokens.length || text.trim() !== annotatedText}>保存修改</button></footer>
  </form></div>
}
