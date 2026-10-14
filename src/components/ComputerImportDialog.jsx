import { useState } from 'react'
import { Download, LoaderCircle, X } from 'lucide-react'
import { computerTransferOrigin, discoverComputerTransferOrigins, listComputerSongs } from '../lib/computerSongTransfer'

export default function ComputerImportDialog({ onClose, onImport, existingSongIds }) {
  const [method, setMethod] = useState('usb')
  const [address, setAddress] = useState('')
  const [showManualAddress, setShowManualAddress] = useState(false)
  const [code, setCode] = useState('')
  const [origin, setOrigin] = useState('')
  const [listing, setListing] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const available = (listing?.songs || []).filter((song) => !existingSongIds.includes(song.id))

  // 旧实现保留作对照：切换 USB/Wi-Fi 时清除连接码，避免把短码误用于 Wi-Fi。
  // 切换方式时清除上一次连接状态，Wi-Fi 默认自动寻找电脑。
  function chooseMethod(nextMethod) {
    setMethod(nextMethod)
    setCode('')
    setOrigin('')
    setListing(null)
    setSelectedIds([])
    setError('')
    setShowManualAddress(false)
  }

  // 输入连接码后，手机自动读取电脑网页已发布的歌曲名单。
  async function connect(event) {
    event.preventDefault()
    setBusy('connect')
    setError('')
    setListing(null)
    try {
      // 旧实现保留作对照：const nextOrigin = computerTransferOrigin(method, address)。
      // Wi-Fi 默认发现局域网中的电脑；手动地址只作为查找失败后的备用入口。
      const origins = method === 'usb' || showManualAddress
        ? [computerTransferOrigin(method, address)]
        : await discoverComputerTransferOrigins()
      if (!origins.length) throw new Error('没有找到电脑。请确认两台设备连接同一 Wi-Fi，并保持电脑传歌窗口打开。')
      let nextOrigin = ''
      let result
      let lastError
      for (const candidate of origins) {
        try {
          result = await listComputerSongs(candidate, code)
          nextOrigin = candidate
          break
        } catch (cause) { lastError = cause }
      }
      if (!result) throw lastError || new Error('没有找到对应的传歌连接，请检查 4 位数字码。')
      if (!Array.isArray(result.songs)) throw new Error('电脑返回的歌曲名单无效。')
      setOrigin(nextOrigin)
      setListing(result)
      setSelectedIds(result.songs.filter((song) => !existingSongIds.includes(song.id)).map((song) => song.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法连接电脑，请检查连接方式和连接码。')
      if (method === 'wifi') setShowManualAddress(true)
    } finally {
      setBusy('')
    }
  }

  async function importSelected() {
    if (!listing || !selectedIds.length) return
    setBusy('import')
    setError('')
    try {
      // 恢复 USB 调试映射与 Wi-Fi 共用的四位码网络传歌流程。
      await onImport(listing, selectedIds, origin, code.trim(), setProgress)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入失败，请保持电脑传歌窗口打开后重试。')
    } finally {
      setBusy('')
    }
  }

  return <section className="song-import-dialog computer-import-dialog" role="dialog" aria-modal="true" aria-labelledby="computer-import-title" onClick={(event) => event.stopPropagation()}>
    <button className="song-import-close" type="button" disabled={Boolean(busy)} onClick={onClose} aria-label="关闭电脑导入窗口"><X size={18} /></button>
    <p className="eyebrow">FROM YOUR COMPUTER</p>
    <h2 id="computer-import-title">从电脑网页导入歌曲</h2>
    <p className="song-import-intro">先在电脑双击“启动 UTA 手机传歌.cmd”，打开网页歌曲库并点击“共享到手机”。网页会自动检索它保存的歌曲，并显示连接码。</p>
    <form className="computer-connect-form" onSubmit={connect}>
      <fieldset disabled={Boolean(busy)}>
        <legend>选择电脑与手机的连接方式</legend>
        {/* 恢复原来的 ADB 调试端口映射，USB 连接仍使用电脑网页的四位码。 */}
        <label><input type="radio" name="computer-connection" checked={method === 'usb'} onChange={() => chooseMethod('usb')} /> USB 数据线<span>手机需开启 USB 调试，并保持与电脑连接；使用 4 位数字短码。</span></label>
        <label><input type="radio" name="computer-connection" checked={method === 'wifi'} onChange={() => chooseMethod('wifi')} /> 同一 Wi-Fi<span>手机会自动寻找电脑；只需输入电脑网页显示的 4 位数字码。</span></label>
        {method === 'wifi' && <p className="computer-discovery-hint">建议电脑连接手机热点，查找电脑成功率更高。</p>}
        {/* 旧实现保留作对照：Wi-Fi 曾始终要求填写电脑局域网地址。 */}
        {method === 'wifi' && !showManualAddress && <p className="computer-discovery-hint">连接时会自动寻找正在传歌的电脑。</p>}
        {method === 'wifi' && showManualAddress && <label className="computer-field">电脑局域网地址（备用方式）<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="如 192.168.1.23" inputMode="decimal" autoComplete="off" required /></label>}
        {method === 'wifi' && <button type="button" className="computer-manual-toggle" onClick={() => { setShowManualAddress((current) => !current); setError('') }}>{showManualAddress ? '返回自动查找电脑' : '找不到电脑？手动填写地址'}</button>}
        {/* 旧实现保留作对照：Wi-Fi 曾使用 12 位连接码，USB 使用 4 位短码。 */}
        <label className="computer-field">4 位数字连接码<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="例如 0427" inputMode="numeric" autoComplete="off" maxLength={4} required /></label>
        <button type="submit" className="song-import-submit">{busy === 'connect' ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />} {busy === 'connect' && method === 'wifi' && !showManualAddress ? '正在寻找电脑…' : '检索电脑网页歌曲'}</button>
      </fieldset>
    </form>
    {listing && <section className="computer-song-selection" aria-label="选择要导入的歌曲">
      <div className="computer-song-selection-heading"><h3>电脑网页找到 {listing.songs.length} 首歌曲</h3><div><button type="button" disabled={Boolean(busy)} onClick={() => setSelectedIds(available.map((song) => song.id))}>全选</button><button type="button" disabled={Boolean(busy)} onClick={() => setSelectedIds([])}>取消全选</button></div></div>
      <p>已选择 {selectedIds.length} 首。已有歌曲会保留在手机中，不会重复导入或覆盖。</p>
      <ul>{listing.songs.map((song) => {
        const alreadyHere = existingSongIds.includes(song.id)
        return <li key={song.id}><label><input type="checkbox" disabled={Boolean(busy) || alreadyHere} checked={selectedIds.includes(song.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, song.id] : current.filter((id) => id !== song.id))} /><span><strong>{song.title}</strong><small>{song.artist} · {song.lines.length} 句 · {((song.audio?.size||0) / 1048576).toFixed(1)} MB{alreadyHere ? ' · 手机中已有' : ''}</small></span></label></li>
      })}</ul>
      <button type="button" className="song-import-submit" disabled={Boolean(busy) || !selectedIds.length} onClick={importSelected}>{busy === 'import' ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />} 导入选中的 {selectedIds.length} 首</button>
    </section>}
    {progress && <p className="computer-transfer-progress" role="status">{progress}</p>}
    {error && <p className="song-import-error" role="alert">{error}</p>}
    <div className="song-import-actions"><button type="button" disabled={Boolean(busy)} onClick={onClose}>取消</button></div>
  </section>
}
