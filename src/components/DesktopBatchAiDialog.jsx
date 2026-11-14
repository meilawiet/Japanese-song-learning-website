import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export default function DesktopBatchAiDialog({ songs, busyIds = [], onClose, onQueue }) {
  const ref = useRef(null)
  const [selected, setSelected] = useState([])
  const [error, setError] = useState('')
  const eligible = selected.filter(id => songs.some(song => song.id === id && song.remaining > 0) && !busyIds.includes(id))
  useEffect(() => {
    const previous = document.activeElement
    ref.current.showModal()
    return () => { ref.current?.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  return <dialog className="desktop-batch-ai-dialog" ref={ref} aria-labelledby="batch-ai-title" onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <header><h2 id="batch-ai-title">选择歌曲进行 AI 解析</h2><button type="button" aria-label="关闭批量 AI 选择" onClick={onClose}><X size={18}/></button></header>
    <p>仅处理明确勾选的歌曲，已有的有效解析会保留。</p>
    <div className="desktop-batch-ai-songs">{songs.length ? songs.map(song => <label key={song.id}><input type="checkbox" checked={eligible.includes(song.id)} disabled={!song.remaining || busyIds.includes(song.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, song.id] : previous.filter(id => id !== song.id))}/><span><b>{song.title}</b><small>{song.artist}</small></span><small>{busyIds.includes(song.id) ? '已在队列' : song.remaining ? `剩余 ${song.remaining} 句` : '已全部生成'}</small></label>) : <p>请先导入歌曲。</p>}</div>
    <p>将向已配置的 AI 服务发送歌词和已有译文，可能产生 API 费用。</p>
    {error && <p role="alert" className="desktop-batch-ai-error">{error}</p>}
    <footer><button type="button" onClick={onClose}>取消</button><button type="button" className="desktop-primary" disabled={!eligible.length} onClick={() => { try { onQueue(eligible); onClose() } catch (cause) { setError(cause.message) } }}>启动解析（{eligible.length} 首）</button></footer>
  </dialog>
}
