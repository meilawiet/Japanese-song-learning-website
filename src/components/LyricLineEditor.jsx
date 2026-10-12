import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
// 原来统一使用 toHiragana；转换由明确的逐词输入方式决定。
import { defaultManualReadingMode, prepareManualReading } from '../lib/manualReading'
import { annotateSongLines } from '../lib/annotationApi'
import { lyricSurface, prepareLyricReadings, tokenReading } from '../lib/lyricReadings'

// 单句编辑同时提供词典重注音和逐词人工读音，适配歌手使用的特殊读法。
export default function LyricLineEditor({ song, line, annotation, corrections, onSave, onClose }) {
  const [text, setText] = useState(line.text)
  // LRC 自带翻译直接带入，空字符串表示主动清空，不进行必填校验。
  const [translation, setTranslation] = useState(line.translation || '')
  const [annotatedText, setAnnotatedText] = useState(annotation ? line.text : '')
  const initialTokens = prepareLyricReadings(annotation?.tokens || [],line.romaji,corrections,song.id,line.id).tokens || []
  // 原 tokens 为本地词典结果；编辑与显示共用来源优先级，括号假名不单独列词。
  const [tokens, setTokens] = useState(initialTokens)
  const [manualIndices,setManualIndices] = useState(()=>new Set(initialTokens.filter(token=>corrections[`${song.id}:${line.id}:${token.index}`]!=null||token.manual_group_reading!=null).map(token=>token.index)))
  // 空字符串表示用户主动取消注音，不能用原来的 || 恢复词典读音。
  const [readings, setReadings] = useState(Object.fromEntries(initialTokens.map((token) => [token.index,tokenReading(token,corrections,song.id,line.id)])))
  // 英文词及已有原样读音默认保留文字，日语词默认支持罗马音转假名。
  const [readingModes, setReadingModes] = useState(Object.fromEntries(initialTokens.map(token => [token.index, defaultManualReadingMode(token,tokenReading(token,corrections,song.id,line.id))])))
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
      const raw = result.find((item) => item.id === line.id)?.tokens
      const generated = prepareLyricReadings(raw,value===line.text?line.romaji:'',{},song.id,line.id).tokens
      if (!generated?.length) throw new Error('未能生成读音，请重试。')
      setTokens(generated)
      setReadings(Object.fromEntries(generated.map((token) => [token.index,tokenReading(token,{},song.id,line.id)])))
      setReadingModes(Object.fromEntries(generated.map(token => [token.index, defaultManualReadingMode(token,tokenReading(token,{},song.id,line.id))])))
      setManualIndices(new Set())
      setAnnotatedText(value)
    } catch (reason) { if (request === requestRef.current) setError(reason.message || '重新注音失败。') }
    finally { if (request === requestRef.current) setBusy(false) }
  }

  async function save(event) {
    event.preventDefault()
    if (text.trim() !== annotatedText || !tokens.length) { setError('歌词已调整，请先点击“重新注音”，再确认读音。'); return }
    // 原来所有字段都 toHiragana，导致 news 变成 ねws；现按用户选定方式保存。
    const prepared = Object.fromEntries(tokens.map((token) => [token.index, prepareManualReading(readings[token.index], readingModes[token.index])]))
    // 按用户要求允许留空：空读音会作为人工校对保存，两个学习模式均不再显示该词注音。
    // 原限制：if (tokens.some((token) => !token.is_symbol && !prepared[token.index])) { setError('请补全每个词的读音。'); return }
    setBusy(true)
    // 原保存仅提交 annotation 和 readings；翻译与当前句一并保存。
    // 仅真正编辑过的字段记为人工校正，不把预填的来源注音全部提升为人工数据。
    try { await onSave({ annotation: { id: line.id, text: annotatedText, tokens }, readings: prepared, translation: translation.trim(), manualIndices:[...manualIndices] }) }
    catch (reason) { setError(reason.message || '保存失败，请重试。') }
    finally { setBusy(false) }
  }

  return <div className="line-editor-backdrop" onClick={() => { if (!busy) onClose() }}><form className="line-editor" role="dialog" aria-modal="true" aria-labelledby="line-editor-title" onClick={(event) => event.stopPropagation()} onSubmit={save}>
    <header><h2 id="line-editor-title">编辑这一句</h2><button type="button" disabled={busy} onClick={onClose} aria-label="关闭歌词编辑"><X size={20} /></button></header>
    <label className="line-editor-lyric">日文歌词<textarea value={text} lang="ja" maxLength={500} disabled={busy} onChange={(event) => setText(event.target.value)} /></label>
    {/* 可独立修改翻译，无须重新注音；清空后不再显示该句翻译。 */}
    <label className="line-editor-lyric line-editor-translation">翻译<textarea aria-label="这一句的翻译" value={translation} maxLength={5000} disabled={busy} placeholder="没有翻译可留空" onChange={event => setTranslation(event.target.value)} /></label>
    <div className="line-editor-reading-head"><strong>读音校对</strong><button type="button" disabled={busy} onClick={regenerate}><RefreshCw size={15} />{busy ? '处理中…' : '重新注音'}</button></div>
    {/* 原说明：可按歌手实际唱法修改读音；重新注音会恢复词典读音。 */}
    <p>人工校正优先，其次是歌词自带注音，最后是本地自动注音。留空不显示注音。日语可用罗马音转假名；英语等请选择按原样保留。</p>
    {text.trim() !== annotatedText && <p className="line-editor-warning">歌词已变化，请重新注音。</p>}
    {/* 原字段只有单一读音输入框；增加逐词方式，避免自动猜测不同语言。 */}
    <div className="line-editor-readings">{tokens.filter((token) => !token.is_symbol).map((token) => <label key={token.index}><span lang="ja">{lyricSurface(token)}</span><select aria-label={`${lyricSurface(token)}的读音输入方式`} value={readingModes[token.index]} disabled={busy || text.trim() !== annotatedText} onChange={event => {setReadingModes(previous => ({ ...previous, [token.index]: event.target.value }));setManualIndices(previous=>new Set([...previous,token.index]))}}><option value="romaji">日语罗马音转假名</option><option value="literal">按原样保留</option></select><input aria-label={`${lyricSurface(token)}的读音`} lang={readingModes[token.index] === 'literal' ? undefined : 'ja'} autoCorrect="off" autoCapitalize="none" spellCheck={false} value={readings[token.index] || ''} disabled={busy || text.trim() !== annotatedText} onChange={(event) => {setReadings((previous) => ({ ...previous, [token.index]: event.target.value }));setManualIndices(previous=>new Set([...previous,token.index]))}} /></label>)}</div>
    {error && <p className="line-editor-error" role="alert">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" disabled={busy || !tokens.length || text.trim() !== annotatedText}>保存修改</button></footer>
  </form></div>
}
