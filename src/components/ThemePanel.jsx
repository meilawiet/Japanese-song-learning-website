import { useEffect, useRef, useState } from 'react'
// 原导入不含字体选项：import { DEFAULT_APPEARANCE, THEMES, readAppearance, saveAppearance } from '../lib/appearance'
// 原字体列表导入：import { DEFAULT_APPEARANCE, FONTS, THEMES, readAppearance, saveAppearance } from '../lib/appearance'
import { DEFAULT_APPEARANCE, FONTS, SOURCE_HAN_WEIGHTS, THEMES, applyAppearance, readAppearance, saveAppearance } from '../lib/appearance'
import { deleteRemoteFont, downloadRemoteFont, isRemoteFont, listDownloadedRemoteFonts, remoteFontBytes, restoreRemoteFont } from '../lib/remoteFonts'
import { deleteCustomFont, importCustomFont, isCustomFont, listCustomFonts, restoreCustomFont } from '../lib/customFonts'

// 即时预览并保存；失败时保留当前选择，明确提示用户。
export default function ThemePanel() {
  const [appearance, setAppearance] = useState(readAppearance)
  const [error, setError] = useState('')
  const [remoteReady, setRemoteReady] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [customFonts, setCustomFonts] = useState([])
  const [downloadedFonts, setDownloadedFonts] = useState([])
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState('')
  const fileInput = useRef(null)
  const busy = downloading || importing || Boolean(deleting)
  // 原主字体列表只有六种内置字体；自定义字体以单独条目附在末尾。
  // const fontGroup = appearance.font.startsWith('sourcehan') ? 'sourcehan' : appearance.font
  const fontGroup = appearance.font.startsWith('sourcehan') ? 'sourcehan' : appearance.font
  const customEntry = customFonts.find(font => font.id === appearance.font)
  const fontName = customEntry?.name || (isCustomFont(appearance.font) ? '自定义字体' : FONTS.find(font => font.id === fontGroup)?.name || '应用字体')
  const weights = fontGroup === 'sourcehan' ? SOURCE_HAN_WEIGHTS : [{ id: appearance.font, name: '常规' }]

  async function refreshStoredFonts() {
    const [custom, downloaded] = await Promise.all([listCustomFonts(), listDownloadedRemoteFonts()])
    setCustomFonts(custom)
    setDownloadedFonts(downloaded)
  }

  // 列表只读取元数据与缓存键，不把全部字体内容加载进设置页面。
  useEffect(() => { refreshStoredFonts().catch(() => setError('已保存字体列表读取失败，请重试打开设置。')) }, [])

  // 字体缓存可跨应用重启；切换到远程字重时先尝试加载已下载的原文件。
  useEffect(() => {
    let active = true
    setRemoteReady(!isRemoteFont(appearance.font))
    setDownloadProgress(0)
    if (isRemoteFont(appearance.font)) restoreRemoteFont(appearance.font).then(ready => {
      if (active) setRemoteReady(ready)
    }).catch(() => { if (active) setRemoteReady(false) })
    if (isCustomFont(appearance.font)) restoreCustomFont(appearance.font).then(ready => {
      if (active && ready) applyAppearance(readAppearance())
      if (active && !ready) setError('本机字体文件不存在，请重新导入或选择其他字体。')
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '自定义字体加载失败。') })
    return () => { active = false }
  }, [appearance.font])

  function update(next) {
    try { setAppearance(saveAppearance(next)); setError(''); return true } catch { setError('外观设置保存失败，请检查设备存储空间。'); return false }
  }
  async function downloadSelectedFont() {
    setDownloading(true)
    setDownloadProgress(0)
    setError('')
    try {
      await downloadRemoteFont(appearance.font, setDownloadProgress)
      setRemoteReady(true)
      applyAppearance(readAppearance())
      await refreshStoredFonts()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '字体下载失败，请重试。') }
    finally { setDownloading(false) }
  }
  async function importSelectedFont(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImporting(true)
    setError('')
    try {
      const font = await importCustomFont(file)
      await refreshStoredFonts()
      update({ ...appearance, font: font.id })
    } catch (cause) { setError(cause instanceof Error ? cause.message : '字体导入失败，请重试。') }
    finally { setImporting(false) }
  }
  async function removeStoredFont(id) {
    setDeleting(id)
    setError('')
    try {
      // 删除当前字体前先切回内置颜真卿，避免设置仍指向已经清除的文件。
      if (appearance.font === id && !update({ ...appearance, font: 'yan' })) return
      if (isCustomFont(id)) await deleteCustomFont(id)
      else await deleteRemoteFont(id)
      await refreshStoredFonts()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '字体删除失败，请重试。') }
    finally { setDeleting('') }
  }
  // 原列表只显示四档远程思源字重；现在所有按需字体都能在此单独删除。
  // const downloadedWeights = SOURCE_HAN_WEIGHTS.filter(weight => downloadedFonts.includes(weight.id))
  const downloadedEntries = downloadedFonts.filter(isRemoteFont).map(id => ({
    id,
    name: id.startsWith('sourcehan')
      ? `思源宋体 · ${SOURCE_HAN_WEIGHTS.find(weight => weight.id === id)?.name || '常规'}`
      : FONTS.find(font => font.id === id)?.name || id,
  }))
  // 原内容区另有“主题设置”标题；弹窗顶部已显示当前子页名称，避免同屏重复。
  return <div className="settings-content theme-panel"><p className="settings-description">调整后立即生效，保存在当前设备。</p>
    <label>歌词大小 <output>{appearance.lyricSize}%</output><input aria-label="歌词大小" type="range" min="80" max="160" step="5" value={appearance.lyricSize} onChange={event => update({ ...appearance, lyricSize: Number(event.target.value) })} /></label>
    <label>应用文字大小 <output>{appearance.textSize}%</output><input aria-label="应用文字大小" type="range" min="80" max="130" step="5" value={appearance.textSize} onChange={event => update({ ...appearance, textSize: Number(event.target.value) })} /></label>
    {/* 原单层选择框：<label className="theme-font-label">应用字体<select aria-label="应用字体" value={appearance.font} onChange={event => update({ ...appearance, font: event.target.value })}>{FONTS.map(font => <option key={font.id} value={font.id}>{font.name}</option>)}</select></label> */}
    {/* 原第二层仅思源宋体显示；现在所有字体都有粗细框，其他字体只列常规。 */}
    <label className="theme-font-label">应用字体<select aria-label="应用字体" disabled={busy} value={fontGroup} onChange={event => update({ ...appearance, font: event.target.value })}>{FONTS.map(font => <option key={font.id} value={font.id}>{font.name}</option>)}{customFonts.length > 0 && <optgroup label="本机导入">{customFonts.map(font => <option key={font.id} value={font.id}>{font.name}</option>)}</optgroup>}{isCustomFont(appearance.font) && !customEntry && <option value={appearance.font}>自定义字体（文件缺失）</option>}</select></label>
    <label className="theme-font-label theme-weight-label">{fontName}粗细<select aria-label={`${fontName}粗细`} disabled={busy} value={appearance.font} onChange={event => update({ ...appearance, font: event.target.value })}>{weights.map(weight => <option key={weight.id} value={weight.id}>{weight.name}</option>)}</select></label>
    {isRemoteFont(appearance.font) && !remoteReady && <div className="theme-font-download"><p>此字体需要下载；下载后保存在本机，约 {(remoteFontBytes(appearance.font) / 1024 / 1024).toFixed(1)} MB。</p><button type="button" disabled={downloading} onClick={downloadSelectedFont}>{downloading ? `下载中 ${downloadProgress}%` : '下载并应用'}</button></div>}
    <div className="theme-font-tools"><button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{importing ? '导入中…' : '从文件导入字体'}</button><input ref={fileInput} type="file" accept=".ttf,.otf,.woff,.woff2" aria-label="选择本机字体文件" hidden onChange={importSelectedFont} /><p>支持 TTF、OTF、WOFF、WOFF2，单个文件不超过 50 MB；仅保存在本机。</p></div>
    {(downloadedEntries.length > 0 || customFonts.length > 0) && <section className="theme-stored-fonts" aria-label="已保存字体管理">
      {downloadedEntries.length > 0 && <><h4>已下载的仓库字体</h4><ul>{downloadedEntries.map(font => <li key={font.id}><span>{font.name}</span><button type="button" disabled={busy} onClick={() => removeStoredFont(font.id)}>{deleting === font.id ? '删除中…' : '删除已下载字体'}</button></li>)}</ul></>}
      {customFonts.length > 0 && <><h4>本机导入的字体</h4><ul>{customFonts.map(font => <li key={font.id}><span>{font.name}<small>{font.format.toUpperCase()} · {(font.bytes / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" disabled={busy} onClick={() => removeStoredFont(font.id)}>{deleting === font.id ? '删除中…' : '删除自定义字体'}</button></li>)}</ul></>}
    </section>}
    <p className="theme-preview" lang="ja">好きな歌で、日本語を学ぶ<small>用喜欢的歌，练习日语。</small></p>
    {/* 主题卡片只显示配色与名称，保留由用户自行发现的设计彩蛋。 */}
    <h3>应用主题色</h3><div className="theme-options">{THEMES.map(theme => <button key={theme.id} type="button" aria-pressed={appearance.theme === theme.id} onClick={() => update({ ...appearance, theme: theme.id })}><span className="theme-swatches" aria-hidden="true">{theme.colors.map(color => <i key={color} style={{ background: color }} />)}</span>{theme.name}</button>)}</div>
    {error && <p role="alert">{error}</p>}<button className="theme-reset" type="button" onClick={() => update(DEFAULT_APPEARANCE)}>恢复默认外观</button>
  </div>
}
