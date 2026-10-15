import { useEffect, useRef, useState } from 'react'
import { Download, FileArchive, FolderOpen, RefreshCw } from 'lucide-react'

function size(bytes) { return Number.isFinite(bytes) && bytes > 0 ? `${(bytes / 1048576).toFixed(1)} MiB` : '未知大小' }
const errorMessage = failure => String(failure?.message || '更新失败，请重试。').replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/u, '')
const phaseLabels = { importing: '正在读取本地增量包', 'preparing-local': '正在校验增量包并准备新版', downloading: '正在下载增量包', 'downloading-full': '正在下载完整包', fallback: '增量包不可用，改用完整包', preparing: '正在校验并准备新版', ready: '新版已准备好', failed: '更新准备失败' }

export default function DesktopUpdatePanel({ updateDrop, onUpdateDropHandled }) {
  const [mode, setMode] = useState(updateDrop ? 'local' : 'online')
  const [release, setRelease] = useState(null)
  const [progress, setProgress] = useState(null)
  const [prepared, setPrepared] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null), lastDrop = useRef(null), operations = useRef(0), busyRef = useRef(false)
  const setWorking = value => { busyRef.current = value; setBusy(value) }
  useEffect(() => {
    let alive = true
    const initialOperation = operations.current
    const receive = state => {
      setProgress(state)
      if (state.source) setMode(state.source === 'local' ? 'local' : 'online')
      setWorking(!['ready', 'failed'].includes(state.phase))
      setPrepared(state.phase === 'ready' ? state : null)
      if (state.phase === 'failed') setError(state.error || '更新准备失败。')
    }
    const unsubscribe = window.utaDesktop.onUpdateProgress(receive)
    window.utaDesktop.getUpdateStatus?.().then(state => {
      if (!alive || operations.current !== initialOperation) return
      if (state.progress) receive(state.progress)
      setPrepared(state.prepared); setWorking(state.busy)
    }).catch(failure => { if (alive && operations.current === initialOperation) setError(errorMessage(failure)) })
    return () => { alive = false; unsubscribe?.() }
  }, [])

  async function check() {
    operations.current++; setWorking(true); setError(''); setProgress(null); setPrepared(null)
    try { setRelease(await window.utaDesktop.checkUpdate()) }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setWorking(false) }
  }
  async function prepare() {
    operations.current++; setWorking(true); setError(''); setPrepared(null)
    try { await window.utaDesktop.prepareUpdate() }
    catch (failure) { setError(errorMessage(failure)) }
    finally { setWorking(false) }
  }
  async function importFiles(files) {
    setDragging(false)
    if (busyRef.current) { setError('更新任务正在进行，请等待当前校验完成。'); return }
    setMode('local'); setError('')
    if (files.length !== 1 || !/\.utapatch$/i.test(files[0].name)) { setError('请一次选择或拖入一个 .utapatch 增量包。完整 ZIP 和 .sha256 文件不支持此模式。'); return }
    operations.current++; setWorking(true); setPrepared(null)
    setProgress({ phase: 'importing', source: 'local', filename: files[0].name, percent: 0 })
    try { setPrepared(await window.utaDesktop.prepareLocalUpdate(files[0])) }
    catch (failure) { const message = errorMessage(failure); setError(message); setProgress({ phase: 'failed', source: 'local', error: message }) }
    finally { setWorking(false) }
  }
  useEffect(() => {
    if (!updateDrop || lastDrop.current === updateDrop) return
    lastDrop.current = updateDrop
    void importFiles(updateDrop.files)
    onUpdateDropHandled?.()
  }, [updateDrop])
  async function install() {
    setWorking(true); setError('')
    try { const result = await window.utaDesktop.installUpdate(); if (!result?.started) setWorking(false) }
    catch (failure) { setError(errorMessage(failure)); setWorking(false) }
  }

  return <div className="settings-content desktop-update-settings">
    <h3>Windows 应用更新</h3>
    <p className="settings-description">选择在线更新，或导入自己下载的增量包。学习数据保留在原来的 uta-data 文件夹。</p>
    <div className="desktop-segment desktop-update-modes" aria-label="更新方式">{[['online', '在线检查'], ['local', '本地增量包']].map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setError('') }}>{label}</button>)}</div>
    {mode === 'online' ? <>
      <button type="button" className="settings-primary" disabled={busy} onClick={check}><RefreshCw size={16}/> {busy && !progress ? '检查中…' : '检查更新'}</button>
      {release && <div className="settings-data-card desktop-update-result"><div>
        <h4>{release.available ? `发现新版 ${release.version}` : `当前版本 ${release.current} 已是最新版本`}</h4>
        {release.available && <p>{release.mode === 'incremental' ? '优先使用增量包' : release.mode === 'full' ? '下载完整包自动更新' : '此版本需手动使用完整包'} · 下载约 {size(release.downloadBytes)}</p>}
        {release.notes && <p className="desktop-update-notes">{release.notes}</p>}
      </div>{release.available && release.mode !== 'full-manual' && <button type="button" disabled={busy || progress?.phase === 'ready'} onClick={prepare}><Download size={16}/> 下载并校验</button>}</div>}
      {release?.available && release.mode === 'full-manual' && <p className="settings-note">当前版本没有对应的增量包。请从官方 Windows Release 下载完整 ZIP，关闭 UTA 后替换程序文件，并保留 uta-data。</p>}
      <p className="settings-note">在线检查需要访问 GitHub；网络不便时可切换到本地增量包模式。</p>
    </> : <>
      <div className={`desktop-update-dropzone${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`} role="region" aria-label="拖放增量包"
        onDragOver={event => { event.preventDefault(); event.stopPropagation(); if (!busy) setDragging(true) }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
        onDrop={event => { event.preventDefault(); event.stopPropagation(); void importFiles([...event.dataTransfer.files]) }}>
        <FileArchive size={32}/><strong>将 .utapatch 增量包拖到这里</strong><span>也可以拖到 UTA 主界面，会自动打开此页面</span>
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}><FolderOpen size={15}/>选择增量包</button>
        <input ref={fileRef} type="file" accept=".utapatch" aria-label="选择本地增量包" hidden disabled={busy} onChange={event => { const files = [...event.target.files]; event.target.value = ''; if (files.length) void importFiles(files) }}/>
      </div>
      <p className="settings-note">使用项目 Windows Release 发布的、适用于当前版本的增量包，无需解压。导入后会离线核对版本号和文件完整性；如果同目录有对应的 .sha256 文件，也会一并校验。</p>
    </>}
    {progress && <div className="desktop-update-progress" role="status">
      <span>{phaseLabels[progress.phase] || '正在准备更新'}{Number.isFinite(progress.percent) ? ` · ${progress.percent}%` : ''}</span>
      {progress.filename && <small className="desktop-update-filename">{progress.filename}</small>}
      {Number.isFinite(progress.percent) && <progress value={progress.percent} max="100"/>}
      {progress.reason && <small>原因：{progress.reason}</small>}
    </div>}
    {prepared && progress?.phase === 'ready' && <div className="desktop-update-prepared"><strong>{prepared.current} → {prepared.version}</strong>{prepared.source === 'local' && <p>本地增量包已校验 · {size(prepared.bytes)}{prepared.checksumVerified ? ' · SHA-256 校验通过' : ''}</p>}<button className="settings-primary" type="button" disabled={busy} onClick={install}>退出 UTA、安装并重新打开</button></div>}
    {error && <p className="settings-message error" role="alert">{error}</p>}
    <p className="settings-note">仅在你点击安装后退出。若新版启动失败会尝试恢复旧版；歌曲、学习记录和 API 设置继续保留。</p>
  </div>
}
