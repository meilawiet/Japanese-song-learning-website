import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Check, Database, Download, Eye, EyeOff, KeyRound, Languages, Palette, Settings, Info, UserRound, LoaderCircle, Save, Search, Upload, X } from 'lucide-react'
import { clearAiSettings, DEFAULT_AI_SETTINGS, loadAiSettings, loadAiSettingsFromDevice, saveAiSettings } from '../lib/aiSettings'
import { getAiStatus, testAiConnection } from '../lib/annotationApi'
import ProfilePanel from './ProfilePanel'
import { webSearchAvailable } from '../lib/mobileWebSearch'
import WebDavPanel from './WebDavPanel'
import {AboutPanel} from './AppUpdates'
import { DEFAULT_LYRIC_FONT_SIZE, DEFAULT_READING_FONT_SIZE, DEFAULT_LINE_READING_FONT_SIZE, DEFAULT_TRANSLATION_FONT_SIZE } from '../lib/readingDisplay'
import { DEFAULT_DESKTOP_THEME, DESKTOP_THEMES } from '../lib/desktopThemes'
import WordReading from './WordReading'
import DesktopAboutSettings from './DesktopAboutSettings'
import DesktopLyricSourcesPanel from './DesktopLyricSourcesPanel'
import DesktopFontSettings from './DesktopFontSettings'
import DesktopGeneralSettings from './DesktopGeneralSettings'
import DesktopCrossPlatformPanel from './DesktopCrossPlatformPanel'
import { DEFAULT_DESKTOP_FONT } from '../lib/desktopFonts'

const previewTokens = [
  { index: 0, surface: '学校', reading: 'がっこう' },
  { index: 1, surface: 'へ', reading: 'へ', part_of_speech: '助詞' },
  { index: 2, surface: '帰る', reading: 'かえる' },
  { index: 3, surface: '。', reading: '', is_symbol: true },
]

export default function SettingsDialog({ onClose, onExport, onRestore, onCloudExport, onCrossCollect, onCrossRestore, onCrossAudioReady, updates, backupBusy, backupError, readingStyle = 'hiragana', onReadingStyleChange, lyricFontSize = DEFAULT_LYRIC_FONT_SIZE, onLyricFontSizeChange, readingFontSize = DEFAULT_READING_FONT_SIZE, onReadingFontSizeChange, lineReadingFontSize = DEFAULT_LINE_READING_FONT_SIZE, onLineReadingFontSizeChange, translationFontSize = DEFAULT_TRANSLATION_FONT_SIZE, onTranslationFontSizeChange, desktopTheme = DEFAULT_DESKTOP_THEME, onDesktopThemeChange, desktopFont = DEFAULT_DESKTOP_FONT, onDesktopFontChange, initialTab = 'data', updateDrop, onUpdateDropHandled }) {
  const isDesktop = Boolean(globalThis.window?.utaDesktop)
  const canUpdateDesktop = isDesktop && window.utaDesktop.packaged
  const [tab, setTab] = useState(() => isDesktop && ['reading', 'fonts'].includes(initialTab) ? 'theme'
    : isDesktop && initialTab === 'update' ? 'about'
    : Capacitor.isNativePlatform() && initialTab === 'reading' ? 'data' : initialTab)
  const [sourcesDirty, setSourcesDirty] = useState(false)
  const [crossBusy, setCrossBusy] = useState(false)
  const handledDrop = useRef(null)
  useEffect(() => {
    if (crossBusy) return
    if (!updateDrop || handledDrop.current === updateDrop) return
    handledDrop.current = updateDrop
    if (!sourcesDirty || window.confirm('歌词源配置尚未保存，确定放弃修改并打开更新页面吗？')) setTab('about')
    else onUpdateDropHandled?.()
  }, [updateDrop, crossBusy])
  const confirmLeaveSources = () => !crossBusy && (!sourcesDirty || window.confirm('歌词源配置尚未保存，确定放弃修改吗？'))
  const closeSettings = () => { if (confirmLeaveSources()) onClose() }
  const changeTab = value => { if (value !== tab && confirmLeaveSources()) setTab(value) }
  const [draft, setDraft] = useState(loadAiSettings)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [serverStatus, setServerStatus] = useState(null)
  const dialogRef = useRef(null)
  const fileRef = useRef(null)
  const controllerRef = useRef(null)
  const isAndroid = Capacitor.isNativePlatform()
  const closeRef = useRef(onClose)
  closeRef.current = closeSettings

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    const controller = new AbortController()
    getAiStatus(controller.signal).then(setServerStatus).catch(() => {})
    // 手机从 Android Keystore 异步读取用户选择记住的 AI Key。
    if (isAndroid || window.utaDesktop) loadAiSettingsFromDevice().then(setDraft).catch(() => setMessage({ kind: 'error', text: '无法读取保存的 AI Key，请重新填写。' }))
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current() }
      if (event.key !== 'Tab') return
      const focusable = [...dialogRef.current.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
        .filter((element) => !element.disabled && element.getClientRects().length)
      const first = focusable[0], last = focusable.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault(); first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      controller.abort(); controllerRef.current?.abort()
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  function update(field, value) { setDraft((current) => ({ ...current, [field]: value })); setMessage(null) }
  function applyPreset(value) {
    const preset = value === 'deepseek'
      ? { name: 'DeepSeek', protocol: 'deepseek', base_url: 'https://api.deepseek.com', model: 'deepseek-flash' }
      : value === 'local'
        ? { name: '本地模型', protocol: 'openai-compatible', base_url: 'http://localhost:11434/v1', model: '' }
        : { name: '自定义服务', protocol: 'openai-compatible', base_url: '', model: '' }
    setDraft((current) => ({ ...current, ...preset, web_search_enabled:false, useServerDefault: false, api_key: '', rememberKey: false }))
    setMessage(null); setVisible(false)
  }

  async function save(event) {
    event.preventDefault()
    try {
      await saveAiSettings(draft)
      setMessage({ kind: 'success', text: '已保存，后续 AI 请求会使用此配置。已有解析会保留。' })
      setVisible(false)
    } catch { setMessage({ kind: 'error', text: isDesktop ? '未能保存设置，请检查程序数据文件夹是否可写。' : '浏览器未能保存设置，请检查存储空间或浏览器权限。' }) }
  }

  async function test() {
    if (!dialogRef.current.querySelector('form').reportValidity()) return
    setBusy(true); setMessage(null)
    controllerRef.current = new AbortController()
    try {
      const result = await testAiConnection(draft, controllerRef.current.signal)
      setMessage({ kind: 'success', text: `连接成功：${result.provider} / ${result.model}，JSON 输出正常。配置尚未自动保存。` })
    } catch (error) {
      if (error.name !== 'AbortError') setMessage({ kind: 'error', text: error.message })
    } finally { setBusy(false) }
  }

  const readingSettings = <div className="settings-content">
        <h3>{isDesktop ? '注音显示' : '选择你习惯的注音'}</h3><p className="settings-description">切换后立即生效。歌词原文不会改变。</p>
        <fieldset className="reading-style-options"><legend>注音方式</legend>
          <label><input type="radio" name="reading-style" value="hiragana" checked={readingStyle === 'hiragana'} onChange={() => onReadingStyleChange('hiragana')} /><span><b>平假名</b><small>夢 → ゆめ　·　学校 → がっこう</small></span></label>
          <label><input type="radio" name="reading-style" value="romaji" checked={readingStyle === 'romaji'} onChange={() => onReadingStyleChange('romaji')} /><span><b>罗马音</b><small>夢 → yume　·　学校 → gakkou</small></span></label>
          {isDesktop && <label><input type="radio" name="reading-style" value="both" checked={readingStyle === 'both'} onChange={() => onReadingStyleChange('both')} /><span><b>假名＋罗马音</b><small>上方假名 · 词下罗马音</small></span></label>}
        </fieldset>
        {isDesktop && <section className="reading-font-settings" aria-label="歌词与注音字号">
          <div className="reading-font-heading"><label id="lyric-font-size-label" htmlFor="lyric-font-size">歌词字体大小</label><output htmlFor="lyric-font-size">{lyricFontSize} px</output></div>
          <div className="reading-font-control"><span>小</span><input id="lyric-font-size" type="range" min="14" max="40" step="1" value={lyricFontSize} onChange={event => onLyricFontSizeChange(Number(event.target.value))}/><span>大</span><button type="button" disabled={lyricFontSize === DEFAULT_LYRIC_FONT_SIZE} onClick={() => onLyricFontSizeChange(DEFAULT_LYRIC_FONT_SIZE)}>恢复歌词默认字号</button></div>
          <div className="reading-font-heading"><label id="reading-font-size-label" htmlFor="reading-font-size">歌词上方假名字体大小</label><output htmlFor="reading-font-size">{readingFontSize} px</output></div>
          <div className="reading-font-control"><span>小</span><input id="reading-font-size" type="range" min="8" max="24" step="1" value={readingFontSize} onChange={event => onReadingFontSizeChange(Number(event.target.value))}/><span>大</span><button type="button" disabled={readingFontSize === DEFAULT_READING_FONT_SIZE} onClick={() => onReadingFontSizeChange(DEFAULT_READING_FONT_SIZE)}>恢复默认字号</button></div>
          <div className="reading-font-heading"><label id="line-reading-font-size-label" htmlFor="line-reading-font-size">词语下方罗马音字体大小</label><output htmlFor="line-reading-font-size">{lineReadingFontSize} px</output></div>
          <div className="reading-font-control"><span>小</span><input id="line-reading-font-size" type="range" min="8" max="24" step="1" value={lineReadingFontSize} onChange={event => onLineReadingFontSizeChange(Number(event.target.value))}/><span>大</span><button type="button" disabled={lineReadingFontSize === DEFAULT_LINE_READING_FONT_SIZE} onClick={() => onLineReadingFontSizeChange(DEFAULT_LINE_READING_FONT_SIZE)}>恢复罗马音默认字号</button></div>
          <div className="reading-font-heading"><label htmlFor="translation-font-size">翻译字体大小</label><output htmlFor="translation-font-size">{translationFontSize} px</output></div>
          <div className="reading-font-control"><span>小</span><input id="translation-font-size" type="range" min="10" max="24" step="1" value={translationFontSize} onChange={event => onTranslationFontSizeChange(Number(event.target.value))}/><span>大</span><button type="button" disabled={translationFontSize === DEFAULT_TRANSLATION_FONT_SIZE} onClick={() => onTranslationFontSizeChange(DEFAULT_TRANSLATION_FONT_SIZE)}>恢复翻译默认字号</button></div>
          <div className="reading-font-preview" aria-label="歌词与注音字号预览" style={{ '--lyric-font-size': `${lyricFontSize}px`, '--reading-font-size': `${readingFontSize}px`, '--line-reading-font-size': `${lineReadingFontSize}px`, '--translation-font-size': `${translationFontSize}px` }}>
            <div className={'auto-lyric word-aligned word-aligned-' + readingStyle}>{previewTokens.map(token => <WordReading key={token.index} token={token}/>)}</div>
            <div className="reading-preview-translation">回学校。</div><small>预览 · 立即生效，自动保存</small>
          </div>
          <p className="settings-description reading-font-help">歌词、上方假名、词语下方罗马音和翻译分别调节。三种注音模式都按词对齐，长读音会适当撑开字间距。</p>
        </section>}
        <p className="settings-note">歌词上方注音、下方读音行、逐句练习及词语读音会随之切换。罗马音根据现有读音在本地转换，不额外调用 AI；长音使用连续元音表示。校对时仍输入假名，旁边会显示罗马音预览，已有修正不会被改写。</p>
      </div>

  return <div className="settings-backdrop" onClick={closeSettings}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1} ref={dialogRef} onClick={(event) => event.stopPropagation()}>
      <header className="settings-heading"><div><p className="eyebrow">MAKE IT YOURS</p><h2 id="settings-title">设置</h2><p>{isDesktop ? '调整阅读、字体与主题，管理学习数据、歌词源和 AI 服务。' : '管理学习数据，连接你的 AI 服务。'}</p></div><button type="button" className="settings-close" onClick={closeSettings} aria-label="关闭设置"><X size={21} /></button></header>
      {/* Windows 将配色、字体与注音集中到主题设置；网页与安卓保留各自入口。 */}
      <div className="settings-tabs" aria-label="设置分类">{isDesktop && <button type="button" aria-pressed={tab === 'general'} onClick={() => changeTab('general')}><Settings size={17} /> 常规设置</button>}{isAndroid ? <button className="profile-settings-tab" type="button" aria-pressed={tab === 'profile'} onClick={() => changeTab('profile')}><UserRound size={17} /> 个人资料</button> : !isDesktop && <button type="button" aria-pressed={tab === 'reading'} onClick={() => changeTab('reading')}><Languages size={17} /> 注音显示</button>}{isDesktop && <button type="button" aria-pressed={tab === 'theme'} onClick={() => changeTab('theme')}><Palette size={17} /> 主题设置</button>}<button type="button" aria-pressed={tab === 'data'} onClick={() => changeTab('data')}><Database size={17} /> 数据管理</button>{isDesktop && <button type="button" aria-pressed={tab === 'cross'} onClick={() => changeTab('cross')}><Database size={17}/> 跨端互通</button>}<button type="button" aria-pressed={tab === 'ai'} onClick={() => changeTab('ai')}><KeyRound size={17} /> AI 服务</button>{isDesktop && <button type="button" aria-pressed={tab === 'sources'} onClick={() => changeTab('sources')}><Search size={17}/> 歌词源</button>}{isDesktop && <button type="button" aria-pressed={tab === 'about'} onClick={() => changeTab('about')}><Info size={17}/> 关于</button>}{isAndroid && <button className="about-settings-tab" type="button" aria-pressed={tab === 'about'} onClick={()=>changeTab('about')}>关于</button>}</div>

      {tab === 'cross' && isDesktop ? <DesktopCrossPlatformPanel onCollect={onCrossCollect} onRestore={onCrossRestore} onAudioReady={onCrossAudioReady} onBusyChange={setCrossBusy} externalBusy={Boolean(backupBusy)}/> : tab === 'about' && isAndroid ? <AboutPanel updates={updates}/> : tab === 'about' && isDesktop ? <DesktopAboutSettings canUpdate={canUpdateDesktop} updateDrop={updateDrop} onUpdateDropHandled={onUpdateDropHandled}/> : tab === 'sources' && isDesktop ? <DesktopLyricSourcesPanel onDirtyChange={setSourcesDirty}/> : tab === 'profile' && isAndroid ? <div className="settings-content"><ProfilePanel editable /></div> : tab === 'reading' && !isAndroid ? readingSettings : tab === 'general' && isDesktop ? <DesktopGeneralSettings/> : tab === 'theme' && isDesktop ? <div className="settings-content desktop-theme-settings desktop-appearance-settings">
        <h3>应用主题色</h3><p className="settings-description">选择一套配色，让学习界面更合你的心意。</p>
        <div className="desktop-theme-grid" aria-label="应用主题色">{DESKTOP_THEMES.map(theme => <button key={theme.id} type="button" className="desktop-theme-card" data-theme-card={theme.id} aria-pressed={desktopTheme === theme.id} onClick={() => onDesktopThemeChange(theme.id)} style={{ '--swatch-bg': theme.colors.surface, '--swatch-accent': theme.colors.accent, '--swatch-soft': theme.colors.soft }}>
          <span className="desktop-theme-swatches" aria-hidden="true"><i/><i/><i/></span><b>{theme.name}</b><small>{theme.description}</small>{desktopTheme === theme.id && <Check className="desktop-theme-check" size={16} aria-hidden="true"/>}
        </button>)}</div>
        <div className="desktop-theme-sample" aria-label="主题阅读预览"><span>READING PREVIEW</span><p lang="ja"><ruby>風<rt>かぜ</rt></ruby>を<ruby>待<rt>ま</rt></ruby>っている</p><small>等候一阵风，也等候下一句。</small><div><span>已掌握 3 / 12 句</span><button type="button" onClick={onClose}>继续学习</button></div></div>
        <p className="settings-note">切换后立即生效，自动保存。主题不改变歌词内容、读音修正或学习进度。</p>
        <section className="desktop-settings-section" aria-label="字体设置"><DesktopFontSettings value={desktopFont} onChange={onDesktopFontChange}/></section>
        <section className="desktop-settings-section" aria-label="注音显示">{readingSettings}</section>
      </div> : tab === 'data' ? <div className="settings-content">
        {/* 安卓端按用户要求暂时移除网站导入导出入口；网页端保留原数据管理。 */}
        {!isAndroid && <>
        <h3>让学习记录随你同行</h3><p className="settings-description">备份导入的歌曲、音频、学习进度、读音修正、复习记录与 AI 解析。</p>
        <div className="settings-data-card"><div><h4>导出学习数据</h4><p>保存一个 .uta-backup 文件，备份或迁移学习记录。</p></div><button type="button" onClick={onExport} disabled={Boolean(backupBusy)}>{backupBusy === 'export' ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />} 导出备份</button></div>
        <div className="settings-data-card"><div><h4>恢复学习数据</h4><p>先预览备份内容，确认后恢复学习数据。</p></div><button type="button" onClick={() => fileRef.current?.click()} disabled={Boolean(backupBusy)}>{backupBusy === 'inspect' ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />} 导入备份</button><input ref={fileRef} type="file" accept=".uta-backup,application/octet-stream" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onRestore(file) }} /></div>
        {backupError && <p className="settings-message error" role="alert">{backupError}</p>}
        <p className="settings-note">API Key 不会包含在备份中。项目文件夹中的歌曲与音频需另行保留。导入新歌曲请前往歌曲库。</p>
        {isDesktop && <div className="settings-data-card"><div><h4>恢复前自动快照</h4><p>每次恢复前自动保存歌曲、音频和学习记录。保留最近 3 次，可从此文件夹选择快照再恢复。</p></div><button type="button" disabled={Boolean(backupBusy)} onClick={() => window.utaDesktop.openRestoreSnapshots().catch(() => {})}>打开快照文件夹</button></div>}
        </>}
        {/* 安卓数据管理只保留完整的本机云备份。 */}
        {isAndroid && <WebDavPanel onCreateBackup={onCloudExport} onRestore={onRestore}/>}
      </div> : <form className={`settings-content ${isDesktop ? 'desktop-ai-form' : ''}`} onSubmit={save}>
        <div className="settings-ai-fields">
        <fieldset disabled={busy} className="settings-fields">
          {!isAndroid && <label className="settings-checkbox"><input type="checkbox" checked={draft.useServerDefault} onChange={(event) => update('useServerDefault', event.target.checked)} /> 使用服务端默认配置</label>}
          {!isAndroid && draft.useServerDefault ? <div className="settings-server-note"><b>{serverStatus?.configured ? `${serverStatus.provider} · ${serverStatus.model}` : '服务端默认配置'}</b><p>{serverStatus === null ? '无法确认服务状态，可点击测试连接。' : serverStatus.configured ? '已检测到服务端密钥，可以直接测试和使用。密钥不会返回浏览器。' : '服务端尚未配置密钥，请取消上方勾选并填写自己的服务。'}</p></div> : <>
            <div className="settings-presets"><span>快速填写</span><button type="button" onClick={() => applyPreset('deepseek')}>DeepSeek</button><button type="button" onClick={() => applyPreset('custom')}>其他兼容服务</button>{!isAndroid && <button type="button" onClick={() => applyPreset('local')}>本地服务</button>}</div>
            <div className="settings-grid"><label>供应商名称<input required maxLength={80} value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="例如：我的 AI 服务" /></label><label>接口类型<select value={draft.protocol} onChange={(event) => update('protocol', event.target.value)}><option value="openai-compatible">OpenAI 兼容</option><option value="deepseek">DeepSeek</option></select></label></div>
            <label className="settings-field">API 地址<input required type="url" maxLength={2048} value={draft.base_url} onChange={(event) => { update('base_url', event.target.value); if (!webSearchAvailable(event.target.value)) update('web_search_enabled',false); if (draft.api_key) update('api_key', '') }} placeholder="https://api.example.com/v1" /></label><p className="settings-hint">填写基础地址或完整的 /chat/completions 地址。支持 HTTPS，以及局域网 IP 的 HTTP 地址。手机不能使用电脑的 localhost；更换地址会清空密钥。</p>
            <label className="settings-field">API Key<span className="settings-secret"><input type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false} maxLength={4096} value={draft.api_key} onChange={(event) => update('api_key', event.target.value)} placeholder="无需鉴权的服务可留空" /><button type="button" aria-label={visible ? '隐藏 API Key' : '显示 API Key'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
            <label className="settings-field">模型名称<input required maxLength={160} value={draft.model} onChange={(event) => update('model', event.target.value)} placeholder="填写供应商提供的模型 ID" /></label>
            <label className="settings-checkbox"><input type="checkbox" checked={draft.json_mode} onChange={(event) => update('json_mode', event.target.checked)} /> 启用 JSON 输出模式</label><p className="settings-hint">若兼容服务不支持此参数，可关闭；模型仍需能返回 JSON。</p>
            {/* 只对已适配的官方服务开放，明确标注费用和问 AI 的使用范围。 */}
            {isAndroid && <><label className="settings-checkbox"><input type="checkbox" name="web-search" checked={Boolean(draft.web_search_enabled)} disabled={!webSearchAvailable(draft.base_url)} onChange={event=>update('web_search_enabled',event.target.checked)}/>启用联网查询</label><p className="settings-hint">联网查询可能产生更多费用，包括额外模型调用与搜索费用。用于“问 AI”，由模型判断是否搜索；目前支持 DeepSeek 官方接口。</p></>}
            <label className="settings-checkbox"><input type="checkbox" checked={draft.rememberKey} onChange={(event) => update('rememberKey', event.target.checked)} /> {isAndroid ? '在这部手机上记住 API Key' : isDesktop ? '在这台电脑上记住 API Key' : '在此浏览器记住 API Key'}</label><p className="settings-hint">{isAndroid ? '勾选后由 Android 系统加密保存；不勾选时仅在本次应用会话中使用。' : isDesktop ? '勾选后由 Windows 加密保存；未勾选时仅在本次程序会话中使用。' : '默认仅在当前标签页会话保存。勾选后会明文保存在此浏览器，请只在自己的设备上使用。'}</p>
          </>}
        </fieldset>
        <p className="settings-note">{isAndroid ? '手机直接连接你配置的 AI 服务，不需要电脑开机。测试连接会发送一条短测试文本；词句解析会发送对应歌词文字，可能产生费用。' : '测试连接会发送一条短测试文本，可能产生少量费用。使用 AI 功能时，歌词经网站后端发送到你配置的服务。当前支持 Chat Completions 兼容接口。'}</p>
        </div>
        <div className="settings-ai-footer">
        {message && <p className={`settings-message ${message.kind}`} role="status">{message.text}</p>}
        <div className="settings-form-actions"><button type="button" disabled={busy} onClick={async () => { try { await clearAiSettings(); setDraft({ ...DEFAULT_AI_SETTINGS }); setVisible(false); setMessage({ kind: 'success', text: isAndroid ? '已清除手机中的 AI 配置与密钥。' : '已清除浏览器中的 AI 配置与密钥，恢复服务端默认配置。' }) } catch { setMessage({ kind: 'error', text: '无法清除 AI 配置。' }) } }}>清除配置</button><span /><button type="button" disabled={busy} onClick={test}>{busy && <LoaderCircle size={15} className="spin" />}{busy ? '测试中…' : '测试连接'}</button><button type="submit" disabled={busy} className="settings-primary"><Save size={15} /> 保存设置</button></div>
        </div>
      </form>}
    </section>
  </div>
}
