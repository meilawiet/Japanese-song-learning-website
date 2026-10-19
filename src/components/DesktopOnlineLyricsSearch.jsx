import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Search } from 'lucide-react'
import { desktopLyricsRecordToFile, searchDesktopLyrics } from '../lib/desktopLyricsSearch'
import { loadDesktopLyricSources, LYRIC_SOURCES_CHANGED } from '../lib/desktopLyricSources'

export default function DesktopOnlineLyricsSearch({ autoQuery = '', onChooseLyrics, disabled = false, description = '本地没有匹配歌词时，可搜索候选版本。选用后先检查歌词与时间轴，确认后才保存；歌词自带假名会优先于自动注音。' }) {
  const [query, setQuery] = useState(autoQuery)
  const [source, setSource] = useState('all')
  const [sources, setSources] = useState([])
  const [results, setResults] = useState([])
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const [chosen, setChosen] = useState('')
  const [message, setMessage] = useState('')
  const request = useRef(0)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current += 1 } }, [])

  useEffect(() => {
    let alive = true
    const load = () => loadDesktopLyricSources().then(items => {
      if (!alive) return
      setSources(items.filter(item => item.enabled))
      setSource(current => current === 'all' || items.some(item => item.id === current && item.enabled) ? current : 'all')
      request.current += 1; setBusy(false); setChosen(''); setResults([]); setErrors([]); setMessage('')
    }).catch(error => { if (alive) setMessage(error.message) })
    // Initial loading must not invalidate the automatic search started below.
    loadDesktopLyricSources().then(items => { if (alive) setSources(items.filter(item => item.enabled)) }).catch(error => { if (alive) setMessage(error.message) })
    window.addEventListener(LYRIC_SOURCES_CHANGED, load)
    return () => { alive = false; window.removeEventListener(LYRIC_SOURCES_CHANGED, load) }
  }, [])

  async function search(keyword, selectedSource = source) {
    const current = ++request.current
    setBusy(true); setResults([]); setErrors([]); setMessage('')
    try {
      const found = await searchDesktopLyrics(keyword, selectedSource)
      if (current !== request.current) return
      setResults(found.results); setErrors(found.errors)
      if (!found.results.length) setMessage('没有找到可预览的歌词，请修改关键词或选择本地歌词。')
    } catch (error) { if (current === request.current) setMessage(error.message || '搜索失败，请重试。') }
    finally { if (current === request.current) setBusy(false) }
  }

  useEffect(() => {
    if (!autoQuery.trim()) return undefined
    setQuery(autoQuery)
    void search(autoQuery, source)
    return () => { request.current += 1 }
  }, [autoQuery])

  async function choose(record) {
    const current = ++request.current
    setChosen(record.id); setMessage('')
    try {
      const file = await desktopLyricsRecordToFile(record)
      if (!alive.current || current !== request.current) return
      await onChooseLyrics(file, record)
      if (alive.current && current === request.current && file.sourceWarnings?.length) setMessage(file.sourceWarnings.join('；'))
    } catch (error) { if (alive.current && current === request.current) setMessage(error.message || '获取歌词失败，请重试。') }
    finally { if (alive.current && current === request.current) setChosen('') }
  }

  return <section className="online-song-search desktop-online-lyrics" aria-label="联网搜索歌词">
    <h3>联网查找歌词</h3>
    <p>{description}</p>
    <div className="online-song-search-row"><input aria-label="在线搜索歌曲名称" value={query} onChange={event => setQuery(event.target.value)} maxLength={160} placeholder="歌曲名或歌手" disabled={disabled || Boolean(chosen)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (!disabled && !busy && !chosen && query.trim() && sources.length) void search(query) } else if (event.ctrlKey && ['z', 'y'].includes(event.key.toLowerCase())) event.stopPropagation() }}/><select aria-label="歌词来源" value={source} onChange={event => setSource(event.target.value)} disabled={disabled || busy || Boolean(chosen)}><option value="all">全部已启用来源</option>{sources.map(item => <option key={item.id} value={item.id}>{item.name} · {item.kind === 'utaten' ? '可能带假名' : item.kind === 'lrclib' ? '有时间轴' : '平台歌词'}</option>)}</select><button type="button" disabled={disabled || busy || Boolean(chosen) || !query.trim() || !sources.length} onClick={() => search(query)}>{busy ? <LoaderCircle size={15} className="spin"/> : <Search size={15}/>} 搜索</button></div>
    {!sources.length && !busy && <p className="settings-note">暂无已启用的歌词源，请到“设置 → 歌词源”启用或添加来源。</p>}
    {message && <p className="online-song-search-error" role="status">{message}</p>}
    {errors.length > 0 && <div className="online-song-source-warnings" role="status"><strong>{results.length ? '部分来源暂不可用，其他来源的结果可正常选用。' : '部分来源暂不可用；其余来源未找到匹配歌词。'}</strong>{errors.map(error => <p key={error}>{error}</p>)}</div>}
    {results.length > 0 && <div className="online-song-results"><span>找到 {results.length} 份候选歌词，请核对歌曲版本</span><ol>{results.map(record => <li key={record.id}><div><strong>{record.title}</strong><small>{record.artist} · {record.sourceName} · {record.provider === 'utaten' ? '通常无时间轴，需逐句填写' : record.provider === 'lrclib' ? '有时间轴' : '选用后获取歌词与时间轴'}{record.hasAnnotation || record.annotationHint ? ' · 可能带假名' : ''}</small></div><button type="button" disabled={disabled || Boolean(chosen)} onClick={() => void choose(record)}>{chosen === record.id ? '正在获取…' : '选用并预览'}</button></li>)}</ol></div>}
  </section>
}
