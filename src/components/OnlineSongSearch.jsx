import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { ExternalLink, LoaderCircle, Search } from 'lucide-react'
import { lyricsRecordToFile, searchSyncedLyrics } from '../lib/onlineLyrics'
// 安卓增加直连平台来源，网页继续保留已有 LRCLIB，不依赖新增网页后端。
// 原固定列表：import { fetchPlatformLyrics, LYRIC_SOURCES, searchPlatformSongs } from '../lib/platformLyrics'
import { fetchPlatformLyrics, searchPlatformSongs } from '../lib/platformLyrics'
import { readResourceSources, resourceSearchUrl, sourceAdapter } from '../lib/resourceSources'

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
  const native = Capacitor.isNativePlatform()
  // 原来默认选网易云；现在只启用用户保存的来源，三个平台不预配置。
  // const [source, setSource] = useState(native ? 'netease' : 'lrclib')
  const [configuredSources, setConfiguredSources] = useState(readResourceSources)
  const lyricSources = native ? configuredSources.filter(item => sourceAdapter(item)).map(item => ({ ...item, adapter: sourceAdapter(item) })) : [{id:'lrclib',name:'LRCLIB',adapter:'lrclib'}]
  const [source, setSource] = useState(() => lyricSources[0]?.id || '')
  const adapter = lyricSources.find(item=>item.id===source)?.adapter
  const sites = native ? configuredSources.filter(item=>!sourceAdapter(item)).map(item=>({id:item.id,name:item.name,url:query=>resourceSearchUrl(item,query)})) : SITES
  const [loadingId, setLoadingId] = useState(null)
  const searchRequest = useRef(0)
  const selectionRequest = useRef(0)
  const manualController = useRef(null)
  const selectionController = useRef(null)
  // 关闭或切换来源后旧请求不得触发导入，也不得覆盖新结果。
  useEffect(() => () => { searchRequest.current++; selectionRequest.current++; manualController.current?.abort(); selectionController.current?.abort() }, [])
  // 配置删除或修改后取消旧结果，避免继续使用已删除来源。
  useEffect(() => {
    const refresh=()=>{searchRequest.current++;selectionRequest.current++;manualController.current?.abort();selectionController.current?.abort();setResults([]);setBusy(false);setLoadingId(null);setConfiguredSources(readResourceSources())}
    window.addEventListener('uta:resource-sources-changed',refresh)
    return ()=>window.removeEventListener('uta:resource-sources-changed',refresh)
  }, [])
  useEffect(()=>{if(native&&!lyricSources.some(item=>item.id===source))setSource(lyricSources[0]?.id||'')},[configuredSources,native,source])
  // 原来直接用固定 source 标识；现在通过用户配置网址匹配适配器。
  const find = (keyword, signal) => {
    if (!adapter) throw new Error('请先在设置 → 数据管理 → 歌曲与歌词来源中添加可搜索的来源。')
    return adapter === 'lrclib' ? searchSyncedLyrics(keyword, signal) : searchPlatformSongs(adapter, keyword, signal)
  }

  // 音频文件识别出歌名后自动发起一次搜索；手动搜索仍可覆盖关键词。
  useEffect(() => {
    // 更换音频时取消旧歌曲的歌词获取，避免较慢的旧请求导入到新歌曲。
    selectionRequest.current++; selectionController.current?.abort(); manualController.current?.abort()
    setLoadingId(null); setSelectedId(null)
    const requestId = ++searchRequest.current
    if (!autoQuery.trim() || !adapter) { setBusy(false); return undefined }
    const controller = new AbortController()
    setQuery(autoQuery)
    setBusy(true)
    setError('')
    setResults([])
    // 原来仅调用 searchSyncedLyrics；现在按用户选择来源检索歌曲候选。
    find(autoQuery, controller.signal).then((found) => {
      if (requestId !== searchRequest.current) return
      setResults(found)
      if (!found.length) setError('没有找到结果，请修改关键词或更换来源。')
    }).catch((reason) => { if (!controller.signal.aborted && requestId === searchRequest.current) setError(reason instanceof Error ? reason.message : '搜索失败，请稍后重试。') })
      .finally(() => { if (requestId === searchRequest.current) setBusy(false) })
    return () => controller.abort()
  }, [autoQuery])

  async function search(event) {
    event.preventDefault()
    const requestId = ++searchRequest.current
    manualController.current?.abort(); selectionController.current?.abort(); selectionRequest.current++
    const controller = new AbortController(); manualController.current = controller
    setLoadingId(null)
    setBusy(true)
    setError('')
    setResults([])
    try {
      // 原请求：searchSyncedLyrics(query)，保留 LRCLIB 为可选来源。
      const found = await find(query, controller.signal)
      if (requestId === searchRequest.current) {
        setResults(found)
        if (!found.length) setError('没有找到结果。可以换一个来源、歌名，或到下方网站继续寻找。')
      }
    } catch (reason) { if (requestId === searchRequest.current) setError(reason instanceof Error ? reason.message : '搜索失败，请稍后重试。') }
    finally { if (requestId === searchRequest.current) setBusy(false) }
  }

  function changeSource(value) {
    // 切换只清理当前结果；保留用户关键词，下一次搜索使用新来源。
    searchRequest.current++; selectionRequest.current++
    manualController.current?.abort(); selectionController.current?.abort()
    setSource(value); setResults([]); setBusy(false); setLoadingId(null); setSelectedId(null); setError('')
  }

  async function chooseLyrics(record) {
    const requestId = ++selectionRequest.current
    selectionController.current?.abort()
    const controller = new AbortController(); selectionController.current = controller
    setLoadingId(record.id); setError('')
    try {
      const ready = adapter === 'lrclib' ? record : await fetchPlatformLyrics(record, controller.signal)
      if (requestId !== selectionRequest.current || controller.signal.aborted) return
      // 每个候选获取后才能确认辅助轨是否存在；只导入真实返回的数据，不覆盖人工校对表。
      setResults(previous => previous.map(item => item.id === record.id ? ready : item))
      await onChooseLyrics(lyricsRecordToFile(ready))
      if (requestId !== selectionRequest.current || controller.signal.aborted) return
      setSelectedId(record.id)
      if (ready.trackSummary?.unmatched) setError(`有 ${ready.trackSummary.unmatched} 行翻译或罗马音的时间戳与原文不一致，未自动配对，请核对预览。`)
    } catch (reason) {
      if (!controller.signal.aborted && requestId === selectionRequest.current) setError(reason instanceof Error ? reason.message : '歌词获取失败，请选择其他版本。')
    } finally { if (requestId === selectionRequest.current) setLoadingId(null) }
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
    {/* 原说明仅介绍 LRCLIB；平台辅助轨按实际可获取情况展示。 */}
    <p>输入歌名和歌手，选择正确版本；已有音频时可只导入歌词。获取到的原文、翻译和罗马音先进入预览，确认后才保存。</p>
    {native && <label className="online-lyrics-source">歌词来源<select aria-label="歌词来源" value={source} onChange={event => changeSource(event.target.value)}>{!lyricSources.length && <option value="">未配置可搜索来源</option>}{lyricSources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    <div className="online-song-search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={160} placeholder="输入歌曲名称或歌手" aria-label="在线搜索歌曲名称" /><button type="button" disabled={busy || !query.trim() || !adapter} onClick={search}>{busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />} 搜索歌词</button></div>
    {error && <p className="online-song-search-error" role="status">{error}</p>}
    {/* 原结果固定写 LRCLIB、点击直接转文件；音乐平台需先获取具体版本的歌词。 */}
    {results.length > 0 && <div className="online-song-results"><span>{lyricSources.find(item => item.id === source)?.name} · 找到 {results.length} 个结果</span><ol>{results.map((record) => <li key={record.id}><div><strong>{record.title}</strong><small>{record.artist}{record.album ? ` · ${record.album}` : ''}{record.duration ? ` · ${Math.floor(record.duration / 60)}:${String(Math.round(record.duration) % 60).padStart(2, '0')}` : ''}</small>{record.trackSummary && <small>原文 {record.trackSummary.original} 句 · 翻译 {record.trackSummary.translation} 句 · 罗马音 {record.trackSummary.romaji} 句</small>}</div><button type="button" disabled={Boolean(loadingId) || busy} onClick={() => chooseLyrics(record)}>{loadingId === record.id ? '获取中…' : selectedId === record.id ? '已选用' : '选用歌词'}</button></li>)}</ol></div>}
    {native && <p className="online-song-hint">来源可在设置 → 数据管理 → 歌曲与歌词来源中管理。翻译和罗马音按来源实际返回内容导入；缺少罗马音的句子继续自动注音。</p>}
    <div className="online-song-sites"><span>继续到网站查找歌曲或歌词</span><div>{sites.map((site) => <button type="button" key={site.id || site.name} onClick={() => openSite(site)}>{site.name} <ExternalLink size={13} /></button>)}</div></div>
    <p className="online-song-hint">{native ? '网站入口按你的配置打开。下载后返回 UTA，使用文件选择按钮导入音频或 LRC。' : '歌曲宝支持带关键词搜索；下歌吧直接打开网站，其他入口使用限定网站的网页搜索。网站下载会保存在手机中；返回 UTA 后，使用上方文件选择按钮导入音频或 LRC。'}</p>
  </section>
}
