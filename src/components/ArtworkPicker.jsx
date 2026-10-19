import { useEffect, useState } from 'react'
import { ImagePlus, LoaderCircle, Search } from 'lucide-react'
import { prepareUploadedArtwork, searchArtworkCandidates } from '../lib/artworkSearch'

export default function ArtworkPicker({ title, artist, selected, onSelect, onBusy = () => {}, disabled = false, onProcessing = () => {} }) {
  const [candidates, setCandidates] = useState([])
  const [unavailable, setUnavailable] = useState([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [requestId, setRequestId] = useState(0)

  useEffect(() => {
    if (!title?.trim()) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      setBusy(true); onBusy(true); setError('')
      try {
        const result = await searchArtworkCandidates(title, artist)
        if (!cancelled) { setCandidates(result.candidates || []); setUnavailable(result.unavailable || []) }
      } catch (failure) {
        if (!cancelled) { setCandidates([]); setError(failure instanceof Error ? failure.message : '封面搜索失败。') }
      } finally {
        if (!cancelled) { setBusy(false); onBusy(false) }
      }
    }, requestId ? 0 : 350)
    return () => { cancelled = true; clearTimeout(timer); onBusy(false) }
  }, [title, artist, requestId])

  async function upload(file) {
    if (!file || disabled) return
    setUploading(true); onProcessing(true); setError('')
    try { onSelect(await prepareUploadedArtwork(file)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : '无法读取图片。') }
    finally { setUploading(false); onProcessing(false) }
  }

  function applyUrl() {
    if (disabled) return
    let url
    try { url = new URL(manualUrl.trim()) } catch { setError('请输入完整的图片链接。'); return }
    if (url.protocol !== 'https:') { setError('在线封面链接需要使用 HTTPS。'); return }
    setError('')
    onSelect({ artworkUrl: url.href, artworkSourceUrl: '', artworkProvider: '手动链接' })
  }

  const selectedUrl = selected?.artworkUrl || ''
  return <section className="artwork-picker" aria-label="选择歌曲封面">
    <div className="artwork-picker-heading"><div><b>选择展示封面</b><p>按歌曲名与歌手搜索；选中的在线图片会在保存时下载到本机，供离线显示。</p></div><button type="button" disabled={disabled || busy || !title?.trim()} onClick={() => setRequestId((value) => value + 1)}>{busy ? <LoaderCircle className="spin" size={13} /> : <Search size={13} />} 重新搜索</button></div>
    {candidates.length > 0 && <div className="artwork-candidates">{candidates.map((item) => <button type="button" key={`${item.artworkProvider}:${item.artworkUrl}`} className={selectedUrl === item.artworkUrl ? 'selected' : ''} disabled={disabled} onClick={() => onSelect(item)} aria-pressed={selectedUrl === item.artworkUrl}>
      <img src={item.artworkUrl} alt={`${item.trackTitle} 的候选封面`} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.opacity = '0.2' }} />
      <span><strong>{item.trackTitle}</strong><small>{item.artistName}</small><em>{item.artworkProvider}</em></span>
    </button>)}</div>}
    {busy && <p className="artwork-picker-status">正在搜索 Apple Music、网易云音乐、QQ 音乐和酷狗音乐…</p>}
    {!busy && !candidates.length && <p className="artwork-picker-status">没有找到可用候选，可上传图片或使用默认封面。</p>}
    {unavailable.length > 0 && <p className="artwork-picker-status">暂时无法访问：{unavailable.join('、')}。其他来源仍可选。</p>}
    <div className="artwork-picker-alternatives"><label className="artwork-upload"><ImagePlus size={14} /> {uploading ? '正在处理图片…' : '上传本地图片'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} /></label><button type="button" disabled={disabled} onClick={() => onSelect({ artworkUrl: '', artworkSourceUrl: '', artworkProvider: '默认封面', artworkChoice: 'default' })}>使用默认封面</button></div>
    <div className="artwork-manual"><input type="url" disabled={disabled} value={manualUrl} onChange={(event) => setManualUrl(event.target.value)} placeholder="也可粘贴封面图片链接" aria-label="封面图片链接" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); applyUrl() } }} /><button type="button" disabled={disabled} onClick={applyUrl}>使用链接</button></div>
    {selected?.artworkProvider && <div className="artwork-picker-selected">
      {selected.artworkUrl && <img src={selected.artworkUrl} alt="当前选中的封面" referrerPolicy="no-referrer" />}
      <span>当前选择：{selected.artworkProvider}{selected.artworkSourceUrl && <a href={selected.artworkSourceUrl} target="_blank" rel="noreferrer">查看来源</a>}</span>
    </div>}
    {error && <p className="artwork-picker-error" role="alert">{error}</p>}
  </section>
}
