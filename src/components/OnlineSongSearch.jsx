import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { ExternalLink, LoaderCircle, Search } from 'lucide-react'
import { lyricsRecordToFile, searchSyncedLyrics } from '../lib/onlineLyrics'
// 安卓增加直连平台来源，网页继续保留已有 LRCLIB，不依赖新增网页后端。
// 原固定列表：import { fetchPlatformLyrics, LYRIC_SOURCES, searchPlatformSongs } from '../lib/platformLyrics'
import { fetchPlatformLyrics, searchPlatformSongs } from '../lib/platformLyrics'
import { readResourceSources, resourceSearchUrl, sourceAdapter } from '../lib/resourceSources'
// 原导入：import {searchLyricsSources,rankLyricResults} from '../lib/lyricSearch.js'
// 分享链接识别后优先使用已配置的同平台来源，未配置时使用混合搜索。
import {searchLyricsSources,rankLyricResults,shareSearchSource} from '../lib/lyricSearch.js'
// 原行为：分享平台只负责识别歌曲，后续检索继续使用用户选择的歌词来源。
import {resolveSongShare} from '../lib/songShare.js'

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
// 普通歌词搜索继续将完整候选转为文件，交给原导入/替换流程处理。
export default function OnlineSongSearch({ onChooseLyrics, autoQuery = '' }) {
  const [query, setQuery] = useState('')
  const [sharedSong, setSharedSong] = useState(null)
  const [resolvingShare, setResolvingShare] = useState(false)
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const native = Capacitor.isNativePlatform()
  // 原来默认选网易云；现在只启用用户保存的来源，三个平台不预配置。
  // const [source, setSource] = useState(native ? 'netease' : 'lrclib')
  const [configuredSources, setConfiguredSources] = useState(readResourceSources)
  const lyricSources = native ? configuredSources.filter(item => sourceAdapter(item)).map(item => ({ ...item, adapter: sourceAdapter(item) })) : [{id:'lrclib',name:'LRCLIB',adapter:'lrclib'}]
  // 原默认选择第一个来源；现在默认混合检索已配置来源，不启用未配置音乐平台。
  const [source, setSource] = useState(() => native?'mixed':lyricSources[0]?.id||'')
  const adapter = source==='mixed'&&lyricSources.length?'mixed':lyricSources.find(item=>item.id===source)?.adapter
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
    // 来源配置变化也会取消正在进行的链接识别，避免使用已删除的来源。
    // 原实现保留对照：
    // const refresh=()=>{searchRequest.current++;selectionRequest.current++;manualController.current?.abort();selectionController.current?.abort();setResults([]);setBusy(false);setLoadingId(null);setConfiguredSources(readResourceSources())}
    const refresh=()=>{searchRequest.current++;selectionRequest.current++;manualController.current?.abort();selectionController.current?.abort();setResults([]);setBusy(false);setResolvingShare(false);setLoadingId(null);setConfiguredSources(readResourceSources())}
    window.addEventListener('uta:resource-sources-changed',refresh)
    return ()=>window.removeEventListener('uta:resource-sources-changed',refresh)
  }, [])
  // 原来源删除后只回退第一个；混合模式保留，单源被删后回到混合。
  useEffect(()=>{if(native&&source!=='mixed'&&!lyricSources.some(item=>item.id===source))setSource('mixed')},[configuredSources,native,source])
  // 原来直接用固定 source 标识；现在通过用户配置网址匹配适配器。
  // 原签名：const find = (keyword, signal) => {
  // 显式传入本次来源，避免 setSource 尚未重新渲染时仍按上一次来源搜索。
  const find = (keyword, signal, requestSource = source) => {
    // 原校验：if (!adapter) throw new Error('请先在设置 → 数据管理 → 歌曲与歌词来源中添加可搜索的来源。')
    const requestSources = requestSource==='mixed'?lyricSources:lyricSources.filter(item=>item.id===requestSource)
    if (!requestSources.length) throw new Error('请先在设置 → 数据管理 → 歌曲与歌词来源中添加可搜索的来源。')
    // 原来只搜索当前 adapter；混合模式按适配器去重，某个来源失败时保留其他结果。
    // 原请求：return searchLyricsSources(source==='mixed'?lyricSources:lyricSources.filter(item=>item.id===source),keyword,signal)
    return searchLyricsSources(requestSources,keyword,signal)
  }

  // 音频文件识别出歌名后自动发起一次搜索；手动搜索仍可覆盖关键词。
  useEffect(() => {
    // 更换音频时取消旧歌曲的歌词获取，避免较慢的旧请求导入到新歌曲。
    selectionRequest.current++; selectionController.current?.abort(); manualController.current?.abort()
    setLoadingId(null); setSelectedId(null)
    // 更换音频时清理上一首分享链接的识别状态。
    setSharedSong(null); setResolvingShare(false)
    const requestId = ++searchRequest.current
    if (!autoQuery.trim() || !adapter) { setBusy(false); return undefined }
    const controller = new AbortController()
    setQuery(autoQuery)
    setBusy(true)
    setError('')
    setResults([])
    // 原来仅调用 searchSyncedLyrics；现在按用户选择来源检索歌曲候选。
    find(autoQuery, controller.signal).then(({records:found,errors}) => {
      if (requestId !== searchRequest.current) return
      setResults(found)
      if(errors.length)setError(errors.join('；'))
      if (!found.length) setError('没有找到结果，请修改关键词或更换来源。')
    }).catch((reason) => { if (!controller.signal.aborted && requestId === searchRequest.current) setError(reason instanceof Error ? reason.message : '搜索失败，请稍后重试。') })
      .finally(() => { if (requestId === searchRequest.current) setBusy(false) })
    return () => controller.abort()
  }, [autoQuery])

  async function search(event) {
    event.preventDefault()
    await searchKeyword(query)
  }

  // 原 search 直接 find(query)；现在链接先识别，再把真实歌名和歌手交给原有搜索流程。
  async function searchKeyword(value) {
    const requestId = ++searchRequest.current
    manualController.current?.abort(); selectionController.current?.abort(); selectionRequest.current++
    const controller = new AbortController(); manualController.current = controller
    setLoadingId(null)
    setBusy(true)
    setError('')
    setResults([])
    setSharedSong(null)
    const isShare = /https?:\/\//i.test(value)
    setResolvingShare(isShare)
    try {
      // 原请求：searchSyncedLyrics(query)，保留 LRCLIB 为可选来源。
      // const {records:found,errors} = await find(query, controller.signal)
      let keyword = value
      // 普通关键词沿用用户选择；分享链接在识别平台后单独决定本次来源。
      let requestSource = source
      if (isShare) {
        const identified = await resolveSongShare(value, controller.signal)
        if (requestId !== searchRequest.current || controller.signal.aborted) return
        keyword = identified.query
        // 仅安卓有用户配置的平台适配器；网页仍保持原有 LRCLIB 搜索。
        if (native) {
          requestSource = shareSearchSource(lyricSources, identified.provider)
          setSource(requestSource)
        }
        setQuery(keyword); setSharedSong(identified); setResolvingShare(false)
      }
      // 原请求：const {records:found,errors} = await find(keyword, controller.signal)
      const {records:found,errors} = await find(keyword, controller.signal, requestSource)
      if (requestId === searchRequest.current) {
        setResults(found)
        if(errors.length)setError(errors.join('；'))
        if (!found.length) setError('没有找到结果。可以换一个来源、歌名，或到下方网站继续寻找。')
      }
    } catch (reason) { if (requestId === searchRequest.current) setError(reason instanceof Error ? reason.message : '搜索失败，请稍后重试。') }
    // 原实现：finally { if (requestId === searchRequest.current) setBusy(false) }
    // 识别错误也必须恢复按钮，以便重试。
    finally { if (requestId === searchRequest.current) { setBusy(false); setResolvingShare(false) } }
  }

  // 粘贴整段分享文案后自动识别并搜索；普通关键词仍由搜索按钮提交。
  function pasteQuery(event) {
    const text = event.clipboardData.getData('text/plain').trim()
    if (!/https?:\/\//i.test(text)) return
    event.preventDefault()
    setQuery(text)
    void searchKeyword(text)
  }

  function editQuery(value) {
    // 输入新内容立即取消旧请求，防止较慢的分享请求覆盖新关键词。
    searchRequest.current++; selectionRequest.current++
    manualController.current?.abort(); selectionController.current?.abort()
    setQuery(value); setSharedSong(null); setBusy(false); setResolvingShare(false); setLoadingId(null); setError('')
  }

  function changeSource(value) {
    // 切换只清理当前结果；保留用户关键词，下一次搜索使用新来源。
    searchRequest.current++; selectionRequest.current++
    manualController.current?.abort(); selectionController.current?.abort()
    setSource(value); setResults([]); setBusy(false); setLoadingId(null); setSelectedId(null); setError('')
    setResolvingShare(false)
  }

  async function chooseLyrics(record) {
    const requestId = ++selectionRequest.current
    selectionController.current?.abort()
    const controller = new AbortController(); selectionController.current = controller
    setLoadingId(record.id); setError('')
    try {
      // 已预取的候选复用结果；混合列表按记录自身的来源获取，不用下拉框来源判断。
      const ready = record.lyrics ? record : await fetchPlatformLyrics(record, controller.signal)
      if (requestId !== selectionRequest.current || controller.signal.aborted) return
      // 每个候选获取后才能确认辅助轨是否存在；只导入真实返回的数据，不覆盖人工校对表。
      setResults(previous => rankLyricResults(previous.map(item => item.id === record.id ? ready : item)))
      await onChooseLyrics(lyricsRecordToFile(ready))
      if (requestId !== selectionRequest.current || controller.signal.aborted) return
      setSelectedId(record.id)
      // 原提示只包含时间戳差异；QQ 来源轨道解码异常也要明确保留提示。
      // if (ready.trackSummary?.unmatched) setError(`有 ${ready.trackSummary.unmatched} 行翻译或罗马音的时间戳与原文不一致，未自动配对，请核对预览。`)
      const notices=[...(ready.sourceWarnings||[]),...(ready.trackSummary?.unmatched?[`有 ${ready.trackSummary.unmatched} 行翻译或罗马音的时间戳与原文不一致，未自动配对，请核对预览。`]:[])]
      if(notices.length)setError(notices.join('；'))
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
    {/* 原标题保留：<h3>联网查找歌词与歌曲</h3> */}
    <h3>联网查找歌词</h3>
    {/* 原说明仅介绍 LRCLIB；平台辅助轨按实际可获取情况展示。 */}
    {/* 原说明仅支持手写关键词；安卓可粘贴链接自动识别，但选用与保存仍需用户确认。 */}
    {/* <p>输入歌名或“歌名 / 歌手”，选择正确版本；只选歌词也能直接导入。获取到的原文、翻译和罗马音先进入预览，确认后才保存。</p> */}
    {/* 原说明保留：<p>{native ? '输入歌名或“歌名 / 歌手”，也可粘贴网易云、QQ 音乐、酷狗、酷我的歌曲分享链接或整段分享文案，自动识别并搜索。' : '输入歌名或“歌名 / 歌手”，选择正确版本。'}只选歌词也能直接导入，确认预览后才保存。</p> */}
    {native && <label className="online-lyrics-source">歌词来源<select aria-label="歌词来源" value={source} onChange={event => changeSource(event.target.value)}><option value="mixed">混合搜索（已配置来源）</option>{!lyricSources.length && <option value="">未配置可搜索来源</option>}{lyricSources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {/* 原输入框 maxLength=160，仅提交关键词；分享文案放宽长度，歌词平台仍限制搜索词长度。 */}
    {/* <div className="online-song-search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={160} placeholder="输入歌曲名称或歌手" aria-label="在线搜索歌曲名称" /><button type="button" disabled={busy || !query.trim() || !adapter} onClick={search}>{busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />} 搜索歌词</button></div> */}
    <div className="online-song-search-row"><input value={query} onChange={(event) => editQuery(event.target.value)} onPaste={pasteQuery} maxLength={4096} placeholder={native ? '歌名、歌手或歌曲分享链接' : '输入歌曲名称或歌手'} aria-label="在线搜索歌曲名称" /><button type="button" disabled={busy || !query.trim() || !adapter} onClick={search}>{busy ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />} {resolvingShare ? '识别链接…' : busy ? '搜索中…' : /https?:\/\//i.test(query) ? '识别并搜索' : '搜索歌词'}</button></div>
    {sharedSong && <p className="share-song-info" role="status"><strong>已识别 · {sharedSong.platform}</strong><span>{sharedSong.title}</span><small>{sharedSong.artist}</small><small>歌词从当前选择的来源搜索，请核对歌曲版本。</small></p>}
    {error && <p className="online-song-search-error" role="status">{error}</p>}
    {/* 原结果固定写 LRCLIB、点击直接转文件；音乐平台需先获取具体版本的歌词。 */}
    {results.length > 0 && <div className="online-song-results"><span>{source==='mixed'?'混合搜索':lyricSources.find(item => item.id === source)?.name} · 找到 {results.length} 个结果</span><ol>{results.map((record) => <li key={record.id}><div><strong>{record.title}</strong><small>{lyricSources.find(item=>item.adapter===record.provider)?.name||record.provider} · {record.artist}{record.album ? ` · ${record.album}` : ''}{record.duration ? ` · ${Math.floor(record.duration / 60)}:${String(Math.round(record.duration) % 60).padStart(2, '0')}` : ''}</small>{record.hasAnnotation&&<small>含来源注音</small>}{record.timed===false&&<small>无时间轴 · 可先导入阅读</small>}{record.trackSummary && <small>原文 {record.trackSummary.original} 句 · 翻译 {record.trackSummary.translation} 句 · 假名 {record.trackSummary.kana||0} 句 · 罗马音 {record.trackSummary.romaji} 句</small>}</div><button type="button" disabled={Boolean(loadingId) || busy} onClick={() => chooseLyrics(record)}>{loadingId === record.id ? '获取中…' : selectedId === record.id ? '已选用' : '选用歌词'}</button></li>)}</ol></div>}
    {/* 原说明：来源可在设置 → 数据管理 → 歌曲与歌词来源中管理。含注音结果优先展示；假名、翻译和罗马音按来源实际内容导入。音乐平台仅搜索你手动配置的来源。 */}
    {/* 说明链接优先来源及未配置时的回退行为，用户仍可手动切换来源。 */}
    {/* 原说明保留：{native && <p className="online-song-hint">来源可在设置 → 数据管理 → 歌曲与歌词来源中管理。分享链接优先搜索已配置的对应平台，未配置时使用混合搜索。含注音结果优先展示；假名、翻译和罗马音按来源实际内容导入。音乐平台仅搜索你手动配置的来源。</p>} */}
    <div className="online-song-sites"><span>继续到网站查找歌曲或歌词</span><div>{sites.map((site) => <button type="button" key={site.id || site.name} onClick={() => openSite(site)}>{site.name} <ExternalLink size={13} /></button>)}</div></div>
    {/* 原说明保留：<p className="online-song-hint">{native ? '网站入口按你的配置打开。下载后返回 UTA，使用文件选择按钮导入音频或歌词文本。' : '歌曲宝支持带关键词搜索；下歌吧直接打开网站，其他入口使用限定网站的网页搜索。网站下载会保存在手机中；返回 UTA 后，使用上方文件选择按钮导入音频或歌词文本。'}</p> */}
  </section>
}
