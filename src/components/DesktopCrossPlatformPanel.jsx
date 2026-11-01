import { useEffect, useRef, useState } from 'react'
import { Cloud, Download, Eye, EyeOff, FolderOpen, LoaderCircle, RefreshCw, Save, Upload, X } from 'lucide-react'
import { listCrossPlatformSnapshots, uploadCrossPlatformSnapshot, previewCrossPlatformSnapshot, downloadPendingAudio, normalizedWebDav } from '../lib/desktopCrossPlatform.js'
import { loadLocalSongs } from '../lib/localSongStore.js'
import { useDesktopUnsavedDraft } from '../lib/useDesktopUnsavedDraft.js'
import '../crossPlatform.css'

const emptyConfig = { url: '', username: '', password: '' }
const transferPhases = { upload: '正在上传文件', download: '正在下载文件', confirmed: '服务器已确认文件' }
function readableBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '大小未知'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}
function dateLabel(value, fallback) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN') : fallback
}

export default function DesktopCrossPlatformPanel({ onCollect, onRestore, onAudioReady, onBusyChange, externalBusy = false }) {
  const [config, setConfig] = useState(emptyConfig)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [includeKey, setIncludeKey] = useState(false)
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [files, setFiles] = useState(null)
  const [preview, setPreview] = useState(null)
  const [aiPolicy, setAiPolicy] = useState('keep')
  const [pending, setPending] = useState([])
  const [recovery, setRecovery] = useState(null)
  const alive = useRef(true)
  const operation = useRef(null)
  const busyChange = useRef(onBusyChange)
  const committing = useRef(false)
  busyChange.current = onBusyChange
  const disabled = loading || Boolean(busy) || externalBusy
  useDesktopUnsavedDraft('cross-platform-transfer', Boolean(busy))

  async function refreshPending() {
    const songs = await loadLocalSongs()
    if (alive.current) setPending(songs.filter(song => song.cloudPending))
  }
  useEffect(() => {
    alive.current = true
    const desktop = window.utaDesktop
    ;(async () => {
      const saved = await desktop.webDav('load')
      const interrupted = await desktop.webDav('recoveryStatus')
      await refreshPending()
      if (alive.current) { setConfig({ ...emptyConfig, ...saved }); setRecovery(interrupted) }
    })()
      .catch(failure => { if (alive.current) setError(failure.message || '无法读取跨端互通配置，请重新填写。') })
      .finally(() => { if (alive.current) setLoading(false) })
    const unsubscribe = desktop.onWebDavProgress?.(event => {
      if (alive.current && operation.current && !committing.current) setStatus(previous => ({ ...previous, ...event, phase: transferPhases[event.phase] || event.phase }))
    })
    return () => {
      alive.current = false
      unsubscribe?.()
      operation.current?.abort()
      if (operation.current && !committing.current) void desktop.webDav('cancel').catch(() => {})
      busyChange.current?.(false)
    }
  }, [])
  useEffect(() => { if (preview) document.querySelector('.cross-platform-preview')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [preview])

  function update(field, value) {
    setConfig(previous => ({ ...previous, [field]: value }))
    setFiles(null); setPreview(null); setError(''); setMessage('')
  }
  const report = value => {
    if (value.phase?.includes('恢复学习资料')) committing.current = true
    if (alive.current) setStatus(previous => ({ ...previous, ...value }))
  }
  async function run(label, work) {
    // A synchronous guard closes the double-click gap before React paints busy.
    if (operation.current || loading || externalBusy) return
    const controller = new AbortController()
    operation.current = controller
    committing.current = false
    setBusy(label); setError(''); setMessage(''); setStatus({ phase: label })
    busyChange.current?.(true)
    try {
      await work({ signal: controller.signal, report })
    } catch (failure) {
      if (alive.current) {
        if (controller.signal.aborted || failure.name === 'AbortError') setMessage('操作已取消。已上传的音频会保留，重试时可复用。')
        else setError(failure.message || '操作失败，请检查连接后重试。')
      }
    } finally {
      operation.current = null
      committing.current = false
      busyChange.current?.(false)
      if (alive.current) { setBusy(''); setStatus(null) }
    }
  }
  function cancel() {
    if (committing.current) return
    operation.current?.abort()
    void window.utaDesktop.webDav('cancel').catch(() => {})
  }
  async function readFiles(options, successText) {
    const result = await listCrossPlatformSnapshots(config, options.signal)
    if (alive.current) { setFiles(result); setMessage(successText) }
  }
  function upload() {
    void run('准备本机快照', async options => {
      normalizedWebDav(config)
      if (includeKey && !window.confirm('本次上传将包含可直接读取的 AI API Key。拿到云文件的人可以使用它消费账户余额。确定上传密钥吗？')) return
      const data = await onCollect(includeKey)
      options.signal.throwIfAborted()
      const result = await uploadCrossPlatformSnapshot(config, data, options)
      if (alive.current) setMessage(`快照已上传：${result.songs} 首歌曲，新增 ${result.uploaded} 份音频，复用 ${result.reused} 份音频；新增音频 ${readableBytes(result.uploadedBytes)}。${includeKey ? '本次包含 API Key。' : '未包含 API Key。'}`)
      // Publishing succeeded even if a later directory refresh fails.
      try { const resultFiles = await listCrossPlatformSnapshots(config, options.signal); if (alive.current) setFiles(resultFiles) }
      catch (failure) { if (!options.signal.aborted && alive.current) setError(`快照已上传，但列表刷新失败：${failure.message || '请重新刷新列表。'}`) }
    })
  }
  function restore() {
    if (!preview || disabled) return
    const aiNote = aiPolicy === 'snapshot' && preview.extras.ai && !preview.extras.ai.api_key ? '\n快照没有 AI Key，所选恢复方式会清空本机 AI Key。' : ''
    if (!window.confirm(`将用此快照整体替换本机导入歌曲、学习记录、个人资料和对话，不会合并两端修改。程序会先保存本机恢复点。${aiNote}\n确定恢复吗？`)) return
    void run('准备恢复', async options => {
      const result = await onRestore(preview, { aiPolicy, ...options })
      if (alive.current) {
        setPreview(null)
        setMessage(`恢复已完成。${result?.pending ? `另有 ${result.pending} 首歌曲的音频可按需下载。` : '已有音频可继续使用。'}`)
      }
      await refreshPending()
    })
  }

  const previewSongs = preview?.catalogSongs || []
  const progress = preview?.manifest.progress
  const learnedCount = Object.values(progress?.learnedBySong || {}).reduce((sum, ids) => sum + ids.length, 0)
  const timedSongs = previewSongs.filter(song => song.cloudPending).length
  const percentage = status?.total > 0 ? Math.max(0, Math.min(100, Math.round(status.done / status.total * 100))) : null

  return <section className="settings-content cross-platform-panel" aria-label="跨端互通设置">
    <div className="cross-platform-title"><Cloud size={22}/><div><h3>跨端互通</h3><p className="settings-description">让 Windows 与安卓通过同一 WebDAV 目录交换歌曲和学习资料。</p></div></div>
    <p className="cross-platform-intro">两端手动上传资料快照，再由用户预览并确认恢复。相同音频只需上传一次；修改歌词、封面或学习进度时复用音频。恢复会整体替换本机资料。</p>
    <p className="settings-note">需要安卓端支持跨端快照协议 v3。旧云备份需先在对应客户端恢复，再重新上传。两端各自编辑后，请先选择要保留的那份资料；此功能不自动合并修改。</p>

    {recovery && <div className="cross-platform-recovery" role="alert"><b>上次恢复可能中断</b><p>请先核对本机数据。恢复前的资料保存在 {recovery.name}，需要时可从“数据管理”导入此恢复点。</p><button type="button" disabled={disabled} onClick={() => window.utaDesktop.openRestoreSnapshots().catch(failure => setError(failure.message))}><FolderOpen size={15}/> 打开恢复点文件夹</button></div>}

    <fieldset className="cross-platform-config" disabled={disabled}>
      <legend>连接自己的 WebDAV</legend>
      <label>服务器目录<input name="cross-webdav-url" type="url" autoComplete="off" spellCheck={false} placeholder="https://example.com/dav/UTA/" value={config.url} onChange={event => update('url', event.target.value)}/></label>
      <label>账号<input name="cross-webdav-username" type="text" autoComplete="off" spellCheck={false} value={config.username} onChange={event => update('username', event.target.value)}/></label>
      <label className="cross-platform-password">应用密码<span><input name="cross-webdav-password" type={visible ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} value={config.password} onChange={event => update('password', event.target.value)}/><button type="button" aria-label={visible ? '隐藏 WebDAV 密码' : '显示 WebDAV 密码'} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
      <p className="settings-note">请使用 HTTPS，并让两端填写同一目录。应用密码保存在本机 Windows 加密存储中，不会写入云快照。</p>
      <div className="cross-platform-actions">
        <button type="button" onClick={() => run('保存连接配置', async () => { await window.utaDesktop.webDav('save', config); if (alive.current) { setVisible(false); setMessage('连接配置已保存。') } })}><Save size={15}/> 保存配置</button>
        <button type="button" onClick={() => run('测试连接', options => readFiles(options, '连接成功，已读取云目录。配置请另行保存。'))}><Cloud size={15}/> 测试连接</button>
        <button type="button" onClick={() => { if (window.confirm('仅清除本机保存的 WebDAV 地址、账号与密码。云文件和本机学习资料会保留。确定清除吗？')) void run('清除连接配置', async () => { await window.utaDesktop.webDav('clear'); if (alive.current) { setConfig(emptyConfig); setFiles(null); setPreview(null); setMessage('已清除本机连接配置。') } }) }}>清除配置</button>
      </div>
    </fieldset>

    <section className="cross-platform-upload" aria-label="上传本机快照"><div><h4>上传本机资料</h4><p>包含歌词、封面、注音、学习进度、个人资料、对话及 AI 配置。主题、字体和窗口设置留在本机。</p></div><label className="cross-platform-checkbox"><input type="checkbox" checked={includeKey} disabled={disabled} onChange={event => setIncludeKey(event.target.checked)}/> 本次同时上传 AI API Key</label>{includeKey && <p className="cross-platform-warning">云快照未加密，上传前会再次确认密钥范围。通常两端分别配置密钥即可。</p>}<button className="cross-platform-primary" type="button" disabled={disabled || Boolean(recovery)} onClick={upload}><Upload size={16}/> 上传本机快照</button>{recovery && <small>请先完成上次恢复的数据核对，再上传，避免把未完整恢复的资料写入云端。</small>}</section>

    {busy && <div className="cross-platform-progress" role="status"><div><LoaderCircle className="spin" size={17}/><b>{status?.phase || busy}</b>{percentage !== null && <span>{percentage}%</span>}{!committing.current && <button type="button" onClick={cancel}><X size={14}/> 取消</button>}</div>{status?.title && <small>{status.title}</small>}{status?.total > 0 && <><progress max="100" value={percentage}/><small>{status.total === 100 && status.phase === '保存恢复前快照' ? `${percentage}%` : `${readableBytes(status.done)} / ${readableBytes(status.total)}`}</small></>}{committing.current && <small>正在写入资料，请等待完成。</small>}</div>}
    {error && <p className="settings-message error" role="alert">{error}</p>}
    {message && <p className="settings-message success" role="status">{message}</p>}

    <section className="cross-platform-snapshots" aria-label="云端快照"><div className="cross-platform-section-heading"><div><h4>云端快照</h4><p>上传会保留历史快照和音频，下载后先预览。</p></div><button type="button" disabled={disabled} onClick={() => run('读取云端快照', options => readFiles(options, '云端快照列表已更新。'))}><RefreshCw size={15}/> 刷新列表</button></div>{files === null ? <p className="cross-platform-empty">测试连接或刷新列表后，可查看另一端上传的快照。</p> : files.length === 0 ? <p className="cross-platform-empty">目录内还没有资料快照，可先在任一端上传。</p> : <ul>{files.map(file => <li key={file.name}><div><b>{dateLabel(file.modified, file.name)}</b><small title={file.name}>{file.name}</small><small>{readableBytes(file.size)}</small></div><button type="button" disabled={disabled} onClick={() => run('下载快照并预览', async options => { const inspection = await previewCrossPlatformSnapshot(config, file.name, options); if (alive.current) { setPreview(inspection); setAiPolicy('keep') } })}><Download size={15}/> 下载并预览</button></li>)}</ul>}</section>

    {preview && <section className="cross-platform-preview" aria-label="跨端快照预览"><div className="cross-platform-section-heading"><div><h4>快照预览</h4><small>{dateLabel(preview.extras.createdAt, preview.snapshotName)}</small></div><button type="button" disabled={disabled} aria-label="关闭跨端快照预览" onClick={() => setPreview(null)}><X size={16}/></button></div><dl><div><dt>导入歌曲</dt><dd>{previewSongs.length} 首</dd></div><div><dt>带音频歌曲</dt><dd>{timedSongs} 首</dd></div><div><dt>纯歌词</dt><dd>{previewSongs.length - timedSongs} 首</dd></div><div><dt>已掌握</dt><dd>{learnedCount} 句</dd></div><div><dt>读音修正</dt><dd>{Object.keys(progress.corrections || {}).length} 处</dd></div><div><dt>待复习</dt><dd>{progress.reviewItems.length} 句</dd></div><div><dt>历史对话</dt><dd>{preview.extras.chats.length} 份</dd></div><div><dt>AI 密钥</dt><dd>{preview.extras.ai?.api_key ? '快照中包含' : '快照中未包含'}</dd></div></dl><p>恢复时自动复用本机经校验一致的音频，其余歌曲先恢复歌词，再按需下载音频。歌曲、行及注音身份保持原样。</p><details><summary>查看歌曲清单</summary><ul className="cross-platform-preview-songs">{previewSongs.map(song => <li key={song.id}><span>{song.title}<small>{song.artist}</small></span><small>{song.lyricsOnly ? '纯歌词' : '音频可下载'} · {song.lines.length} 句</small></li>)}</ul></details><fieldset disabled={disabled}><legend>AI 配置如何处理</legend><label><input type="radio" name="cross-ai-policy" checked={aiPolicy === 'keep'} onChange={() => setAiPolicy('keep')}/> 保留本机 AI 配置和密钥</label><label><input type="radio" name="cross-ai-policy" checked={aiPolicy === 'snapshot'} onChange={() => setAiPolicy('snapshot')}/> 使用快照中的 AI 配置{!preview.extras.ai && '（此快照未提供配置，将保留本机配置）'}</label></fieldset>{aiPolicy === 'snapshot' && preview.extras.ai && !preview.extras.ai.api_key && <p className="cross-platform-warning">快照未包含密钥：恢复此 AI 配置会清空本机 AI Key，之后需要重新填写。</p>}<p className="cross-platform-warning">确认恢复会整体替换本机导入歌曲、学习记录、个人资料和对话。恢复前自动保存本机恢复点。</p><button className="cross-platform-primary" type="button" disabled={disabled} onClick={restore}>确认恢复此快照</button></section>}

    <section className="cross-platform-pending" aria-label="待下载音频"><div className="cross-platform-section-heading"><div><h4>待下载音频</h4><p>这些歌曲的歌词已可学习，下载音频后即可播放。</p></div><button type="button" disabled={disabled} onClick={() => run('核对待下载歌曲', refreshPending)}><RefreshCw size={15}/> 刷新</button></div>{pending.length === 0 ? <p className="cross-platform-empty">当前没有待下载音频。</p> : <ul>{pending.map(song => <li key={song.id}><div><b>{song.title}</b><small>{song.artist} · {readableBytes(song.cloudAudio?.size)}</small></div><button type="button" disabled={disabled} onClick={() => run('下载歌曲音频', async options => { const record = await downloadPendingAudio(config, song.id, options); await onAudioReady?.(record); await refreshPending(); if (alive.current) setMessage(`《${record.title}》音频已下载并校验，歌词和学习记录已保留。`) })}><Download size={15}/> 下载音频</button></li>)}</ul>}</section>
  </section>
}
