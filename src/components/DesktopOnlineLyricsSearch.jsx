import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Search } from 'lucide-react'
import { desktopLyricsRecordToFile, searchDesktopLyrics } from '../lib/desktopLyricsSearch'

export default function DesktopOnlineLyricsSearch({ autoQuery = '', onChooseLyrics, disabled = false }) {
  const [query, setQuery] = useState(autoQuery)
  const [source, setSource] = useState('all')
  const [results, setResults] = useState([])
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const [chosen, setChosen] = useState('')
  const [message, setMessage] = useState('')
  const request = useRef(0)

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
    setChosen(record.id); setMessage('')
    try {
      const file = await desktopLyricsRecordToFile(record)
      await onChooseLyrics(file, record)
    } catch (error) { setMessage(error.message || '获取歌词失败，请重试。') }
    finally { setChosen('') }
  }

  return <section className="online-song-search desktop-online-lyrics" aria-label="联网搜索歌词">
    <h3>联网查找歌词</h3>
    <p>本地没有匹配歌词时，可搜索候选版本。选用后先检查歌词与时间轴，确认后才保存；歌词自带假名会优先于自动注音。</p>
    <div className="online-song-search-row"><input aria-label="在线搜索歌曲名称" value={query} onChange={event => setQuery(event.target.value)} maxLength={160} placeholder="歌曲名或歌手" disabled={disabled}/><select aria-label="歌词来源" value={source} onChange={event => setSource(event.target.value)} disabled={disabled}><option value="all">全部来源</option><option value="lrclib">LRCLIB · 有时间轴</option><option value="utaten">UtaTen · 可能带假名</option></select><button type="button" disabled={disabled || busy || !query.trim()} onClick={() => search(query)}>{busy ? <LoaderCircle size={15} className="spin"/> : <Search size={15}/>} 搜索</button></div>
    {message && <p className="online-song-search-error" role="status">{message}</p>}
    {errors.length > 0 && <p className="online-song-search-error" role="status">{errors.join('；')}</p>}
    {results.length > 0 && <div className="online-song-results"><span>找到 {results.length} 份候选歌词，请核对歌曲版本</span><ol>{results.map(record => <li key={record.id}><div><strong>{record.title}</strong><small>{record.artist} · {record.provider === 'utaten' ? 'UtaTen · 通常无时间轴，需逐句填写' : 'LRCLIB · 有时间轴'}{record.hasAnnotation || record.annotationHint ? ' · 可能带假名' : ''}</small></div><button type="button" disabled={disabled || Boolean(chosen)} onClick={() => void choose(record)}>{chosen === record.id ? '正在获取…' : '选用并预览'}</button></li>)}</ol></div>}
  </section>
}
