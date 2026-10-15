import { useEffect, useState } from 'react'
import { LoaderCircle, Plus, Save, Search, Trash2 } from 'lucide-react'
import { DEFAULT_LYRIC_SOURCES, PLATFORM_LYRIC_SOURCES, lyricSourceAdapter, lyricSourceKindLabel, loadDesktopLyricSources, saveDesktopLyricSources } from '../lib/desktopLyricSources'
import { searchDesktopLyrics } from '../lib/desktopLyricsSearch'
import { useDesktopUnsavedDraft } from '../lib/useDesktopUnsavedDraft'

export default function DesktopLyricSourcesPanel({ onDirtyChange }) {
  const [sources, setSources] = useState(() => DEFAULT_LYRIC_SOURCES.map(source => ({ ...source })))
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState('loading')
  const [message, setMessage] = useState(null)
  const dirty = saved !== '' && JSON.stringify(sources) !== saved
  useDesktopUnsavedDraft('lyrics-source-settings', dirty)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  useEffect(() => {
    let alive = true
    loadDesktopLyricSources().then(items => {
      if (alive) { setSources(items); setSaved(JSON.stringify(items)) }
    }).catch(error => {
      if (alive) { setSaved(JSON.stringify(DEFAULT_LYRIC_SOURCES)); setMessage({ kind: 'error', text: error.message }) }
    }).finally(() => { if (alive) setBusy('') })
    return () => { alive = false }
  }, [])
  const update = (id, patch) => { setSources(items => items.map(item => item.id === id ? { ...item, ...patch } : item)); setMessage(null) }
  const addSource = preset => { setSources(items => [...items, { id: `custom-${crypto.randomUUID()}`, name: '自定义歌词源', kind: 'lrclib', baseUrl: '', enabled: true, builtin: false, ...preset }]); setMessage(null) }
  const changeAddress = (source, baseUrl) => {
    const kind = source.builtin ? source.kind : lyricSourceAdapter(baseUrl) || 'lrclib'
    update(source.id, { baseUrl, kind, ...(source.name === '自定义歌词源' && PLATFORM_LYRIC_SOURCES.some(item => item.kind === kind) ? { name: PLATFORM_LYRIC_SOURCES.find(item => item.kind === kind).name } : {}) })
  }

  async function save(event) {
    event.preventDefault(); setBusy('saving'); setMessage(null)
    try {
      const items = await saveDesktopLyricSources(sources)
      setSources(items); setSaved(JSON.stringify(items))
      setMessage({ kind: 'success', text: '歌词源已保存，导入界面会使用已启用的来源。' })
    } catch (error) { setMessage({ kind: 'error', text: error.message }) }
    finally { setBusy('') }
  }
  async function test(source) {
    setBusy(source.id); setMessage(null)
    try {
      const found = await searchDesktopLyrics('Lemon', source.id)
      setMessage({ kind: 'success', text: `${source.name} 搜索请求成功：找到 ${found.results.length} 份候选歌词。` })
    } catch (error) { setMessage({ kind: 'error', text: error.message }) }
    finally { setBusy('') }
  }

  return <div className="settings-content desktop-lyric-sources">
    <h3>歌词源</h3><p className="settings-description">管理导入歌曲时使用的在线来源。“全部来源”会搜索所有已启用的歌词源，本地已有歌词时不会联网搜索。</p>
    <form onSubmit={save}>
      <div className="lyric-source-cards">{sources.map((source, index) => <fieldset className="lyric-source-card" key={source.id} disabled={Boolean(busy)}>
        <legend>{source.builtin ? '内置来源' : '自定义来源'} {index + 1}</legend>
        <div className="lyric-source-heading"><label><input type="checkbox" checked={source.enabled} onChange={event => update(source.id, { enabled: event.target.checked })}/>启用</label><span>{lyricSourceKindLabel(source.kind)}</span>{!source.builtin && <button type="button" aria-label={`删除歌词源 ${source.name}`} onClick={() => { setSources(items => items.filter(item => item.id !== source.id)); setMessage(null) }}><Trash2 size={14}/></button>}</div>
        <label>名称<input aria-label={`歌词源 ${index + 1} 名称`} value={source.name} onChange={event => update(source.id, { name: event.target.value })} required maxLength={40}/></label>
        <label>{source.kind === 'lrclib' ? '服务地址' : '来源网址'}<input aria-label={`歌词源 ${index + 1} 服务地址`} value={source.baseUrl} onChange={event => changeAddress(source, event.target.value)} type="url" required maxLength={1024} readOnly={source.builtin && source.kind === 'utaten'}/></label>
        <div className="lyric-source-foot"><small>{source.kind === 'utaten' ? '此来源需要专用网页解析；通常需自行补充时间轴。' : source.kind === 'lrclib' ? '支持 /api/search?q=关键词，返回 LRCLIB 格式的 JSON 歌词列表。' : '已识别平台网址，使用专用搜索及歌词接口；选用候选后获取时间轴与可用辅助轨。'}</small><button type="button" disabled={dirty || !source.enabled || Boolean(busy)} onClick={() => void test(source)}><Search size={13}/>测试搜索</button></div>
      </fieldset>)}</div>
      <div className="lyric-source-actions"><button type="button" disabled={Boolean(busy) || sources.length >= 12} onClick={() => addSource({})}><Plus size={14}/>添加歌词源</button><select aria-label="添加平台歌词源" value="" disabled={Boolean(busy) || sources.length >= 12} onChange={event => addSource(PLATFORM_LYRIC_SOURCES.find(item => item.kind === event.target.value))}><option value="" disabled>快捷添加平台…</option>{PLATFORM_LYRIC_SOURCES.map(item => <option key={item.kind} value={item.kind}>{item.name}</option>)}</select><button type="button" disabled={Boolean(busy)} onClick={() => { setSources(DEFAULT_LYRIC_SOURCES.map(source => ({ ...source }))); setMessage(null) }}>恢复默认来源</button></div>
      <p className="settings-note">修改后请保存。QQ、网易云、酷狗、酷我网址会自动识别为专用接口，其他地址按 LRCLIB 兼容接口处理。测试搜索会用“Lemon”发起一次请求；有未保存修改时，请先保存。</p>
      {message && <p className={`settings-message ${message.kind}`} role="status">{message.text}</p>}
      <div className="settings-form-actions"><button className="settings-primary" type="submit" disabled={Boolean(busy)}>{busy ? <LoaderCircle size={15} className="spin"/> : <Save size={15}/>}保存歌词源</button><small>{dirty ? '有未保存的修改' : '配置保存在本机数据文件夹，更新程序后继续保留'}</small></div>
    </form>
  </div>
}
