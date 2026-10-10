import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { ExternalLink, LoaderCircle, Search } from 'lucide-react'
import { lyricsRecordToFile, searchSyncedLyrics } from '../lib/onlineLyrics'

// 只有歌曲宝已确认可把关键词写进站内网址；其他站点用限定域名的网页搜索。
const scopedSearch = (domain, query) => query ? `https://www.bing.com/search?q=${encodeURIComponent(`site:${domain} ${query}`)}` : `https://${domain}/`
const SITES = [
  { name: 'Toomic / MusicEnc', url: (query) => scopedSearch('musicenc.com', query) },
  // 新增下歌吧入口；未确认其搜索参数，直接打开用户提供的网站。
  // 旧名称：{ name: '刘明野音乐', url: () => 'https://so.liumingye.cn/' },
  // 使用网站自己的名称：下歌吧。
  { name: '下歌吧', url: () => 'https://so.liumingye.cn/' },
  // { name: '歌曲宝', url: (query) => `https://www.gequbao.com/s/${encodeURIComponent(query)}` },
  // 歌曲宝不重复添加；有关键词进入搜索页，没有关键词打开首页。
  { name: '歌曲宝', url: (query) => query ? `https://www.gequbao.com/s/${encodeURIComponent(query)}` : 'https://www.gequbao.com/' },
  { name: '爱歌词网', url: (query) => scopedSearch('22lrc.com', query) },
  { name: '世纪音乐网', url: (query) => scopedSearch('4c44.com', query) },
]

// 在线搜索只替用户打开网站，音频文件由用户在网站下载后自行确认并选择。
export default function OnlineSongSearch({ onChooseLyrics, autoQuery = '' }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const searchRequest = useRef(0)

  // 音频文件识别出歌名后自动发起一次搜索；手动搜索仍可覆盖关键词。
  useEffect(() => {
    if (!autoQuery.trim()) return undefined
    const requestId = ++searchRequest.current
    const controller = new AbortController()
    setQuery(autoQuery)
    setBusy(true)
    setError('')
    setResults([])
    searchSyncedLyrics(autoQuery, controller.signal).then((found) => {
      if (requestId !== searchRequest.current) return
      setResults(found)
      if (!found.length) setError('没有找到带时间轴的歌词，请修改关键词再试。')
    }).catch((reason) => { if (!controller.signal.aborted && requestId === searchRequest.current) setError(reason instanceof Error ? reason.message : '搜索失败，请稍后重试。') })
      .finally(() => { if (requestId === searchRequest.current) setBusy(false) })
    return () => controller.abort()
  }, [autoQuery])

  async function search(event) {
    event.preventDefault()
    const requestId = ++searchRequest.current
    setBusy(true)
    setError('')
    setResults([])
    try {
      const found = await searchSyncedLyrics(query)
      if (requestId === searchRequest.current) {
        setResults(found)
        if (!found.length) setError('没有找到带时间轴的歌词。可以换一个歌名，或到下方网站继续寻找。')
      }
    } catch (reason) { if (requestId === searchRequest.current) setError(reason instanceof Error ? reason.message : '搜索失败，请稍后重试。') }
    finally { if (requestId === searchRequest.current) setBusy(false) }
  }

  async function openSite(site) {
    const url = site.url(query.trim())
    try {
      if (Capacitor.isNativePlatform()) await Browser.open({ url })
      else window.open(url, '_blank', 'noopener,noreferrer')
    } catch { setError(`无法打开 ${site.name}，请检查网络连接。`) }
  }

  return <section className="online-song-search" aria-label="联网搜索歌曲和歌词">
    <h3>联网查找歌词与歌曲</h3>
    <p>输入歌名搜索带时间轴的歌词；已有音频时，可以只选歌词。找到的歌词会先进入预览，确认后才保存。</p>
    <div className="online-song-search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={160} placeholder="输入歌曲名称或歌手" aria-label="在线搜索歌曲名称" /><button type="button" disabled={busy || !query.trim()} onClick={search}>{busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />} 搜索歌词</button></div>
    {error && <p className="online-song-search-error" role="status">{error}</p>}
    {results.length > 0 && <div className="online-song-results"><span>LRCLIB · 找到 {results.length} 份带时间轴歌词</span><ol>{results.map((record) => <li key={record.id}><div><strong>{record.title}</strong><small>{record.artist}{record.duration ? ` · ${Math.round(record.duration / 60)} 分钟` : ''}</small></div><button type="button" onClick={() => { onChooseLyrics(lyricsRecordToFile(record)); setSelectedId(record.id) }}>{selectedId === record.id ? '已选用' : '选用歌词'}</button></li>)}</ol></div>}
    <div className="online-song-sites"><span>继续到网站查找歌曲或歌词</span><div>{SITES.map((site) => <button type="button" key={site.name} onClick={() => openSite(site)}>{site.name} <ExternalLink size={13} /></button>)}</div></div>
    <p className="online-song-hint">歌曲宝支持带关键词搜索；下歌吧直接打开网站，其他入口使用限定网站的网页搜索。网站下载会保存在手机中；返回 UTA 后，使用上方文件选择按钮导入音频或 LRC。</p>
  </section>
}
