import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ImagePlus, Music2, RotateCcw, X } from 'lucide-react'
import stationBackground from '../assets/uta-twilight-station.png'
import WordReading from './WordReading'
import { correctionKey } from '../lib/ruby'
import { tokenReading, tokenHasManualReading } from '../lib/readingDisplay'
import { DEFAULT_SING_ALONG_APPEARANCE, loadSingAlongAppearance, saveSingAlongAppearance, validateSingAlongImage } from '../lib/singAlongAppearance'

const displayModes = [['both', '假名＋罗马音'], ['kana', '仅假名'], ['romaji', '仅罗马音'], ['lyrics', '仅歌词']]

function useImageUrl(blob) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!blob) { setUrl(''); return undefined }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

export default function DesktopSingAlong({ song, artwork, annotations, corrections = {}, hiddenReadings = {}, audioReady, playing, currentLineId, selectedLineId, error, onPlayFromStart, onPlayFromLine, onBack, annotationError, readingOptions = {}, onReadingSettingsChange }) {
  const [displayMode, setDisplayMode] = useState(() => ({ none: 'lyrics', hiragana: 'kana', romaji: 'romaji', both: 'both' })[readingOptions.readingStyle] || 'both')
  const [showTranslation, setShowTranslation] = useState(readingOptions.showTranslation !== false)
  const [followPlayback, setFollowPlayback] = useState(true)
  const [appearance, setAppearance] = useState(DEFAULT_SING_ALONG_APPEARANCE)
  const [draft, setDraft] = useState(DEFAULT_SING_ALONG_APPEARANCE)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [appearanceBusy, setAppearanceBusy] = useState(false)
  const [appearanceError, setAppearanceError] = useState('')
  const imageInput = useRef(null)
  const lyricList = useRef(null)
  const rows = useRef(new Map())
  const appliedImageUrl = useImageUrl(appearance.mode === 'image' ? appearance.imageBlob : null)
  const draftImageUrl = useImageUrl(appearanceOpen && draft.mode === 'image' ? draft.imageBlob : null)
  const visible = appearanceOpen ? draft : appearance
  const backgroundUrl = visible.mode === 'image' ? (appearanceOpen ? draftImageUrl : appliedImageUrl) : visible.mode === 'default' ? stationBackground : ''
  const annotationByLine = new Map(annotations?.map(item => [item.id, item]) || [])
  const currentIndex = song.lines.findIndex(line => line.id === currentLineId)
  useEffect(() => {
    setDisplayMode(({ none: 'lyrics', hiragana: 'kana', romaji: 'romaji', both: 'both' })[readingOptions.readingStyle] || 'both')
    setShowTranslation(readingOptions.showTranslation !== false)
  }, [song.id, readingOptions.readingStyle, readingOptions.showTranslation])

  useEffect(() => {
    const shell = document.querySelector('.desktop-shell-singalong')
    if (!shell) return
    shell.style.setProperty('--sing-background-image', backgroundUrl ? `url("${backgroundUrl}")` : 'none')
    shell.style.setProperty('--sing-background-color', visible.color)
    shell.style.setProperty('--sing-background-blur', `${visible.blur}px`)
    shell.style.setProperty('--sing-background-dim', String(visible.dim / 100))
  }, [backgroundUrl, visible.color, visible.blur, visible.dim])

  useEffect(() => () => {
    const shell = document.querySelector('.desktop-shell')
    for (const name of ['--sing-background-image', '--sing-background-color', '--sing-background-blur', '--sing-background-dim']) shell?.style.removeProperty(name)
  }, [])

  useEffect(() => {
    let live = true
    loadSingAlongAppearance().then(saved => { if (live) { setAppearance(saved); setDraft(saved) } })
      .catch(() => { if (live) setAppearanceError('无法读取上次的背景设置，可重新选择并保存。') })
    return () => { live = false }
  }, [])

  useEffect(() => {
    const target = currentLineId ?? selectedLineId
    const list = lyricList.current
    const row = rows.current.get(target)
    if (followPlayback && list && row) {
      const listBounds = list.getBoundingClientRect()
      const rowBounds = row.getBoundingClientRect()
      list.scrollTo({ top: list.scrollTop + rowBounds.top - listBounds.top - (listBounds.height - rowBounds.height) / 2, behavior: 'smooth' })
    }
  }, [currentLineId, selectedLineId, followPlayback, song.id])

  useEffect(() => {
    if (!appearanceOpen) return undefined
    const onKeyDown = event => { if (event.key === 'Escape' && !appearanceBusy) { event.stopPropagation(); setAppearanceOpen(false) } }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [appearanceOpen, appearanceBusy])

  function openAppearance() {
    setDraft(appearance)
    setAppearanceError('')
    setAppearanceOpen(true)
  }

  function chooseImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      validateSingAlongImage(file)
      setDraft(previous => ({ ...previous, mode: 'image', imageBlob: file }))
      setAppearanceError('')
    } catch (cause) { setAppearanceError(cause.message) }
  }

  async function applyAppearance() {
    setAppearanceBusy(true)
    setAppearanceError('')
    try {
      const saved = await saveSingAlongAppearance(draft)
      setAppearance(saved)
      setAppearanceOpen(false)
    } catch { setAppearanceError('保存背景失败，请检查本机存储空间后重试。') }
    finally { setAppearanceBusy(false) }
  }

  return <section className="desktop-sing" aria-labelledby="desktop-sing-title" style={{ '--sing-blur': `${visible.blur}px`, '--sing-dim': visible.dim / 100, '--sing-color': visible.color }}>
    <div className="desktop-sing-wallpaper" style={{ backgroundImage: backgroundUrl ? `url("${backgroundUrl}")` : 'none' }} aria-hidden="true" />
    <div className="desktop-sing-shade" aria-hidden="true" />
    <div className="desktop-sing-content">
      <header className="desktop-sing-player-header">
        <span className="desktop-sing-cover">{artwork?.artworkUrl ? <img src={artwork.artworkUrl} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} /> : <Music2 size={27} />}</span>
        <div className="desktop-sing-heading"><span>UTA · 跟唱播放器</span><h1 id="desktop-sing-title">{song.title}</h1><p>{song.artist} · 连续播放 · {song.lines.length} 句歌词</p></div>
        <div className="desktop-sing-actions">
          <button type="button" className="desktop-sing-background-button" onClick={openAppearance}><ImagePlus size={16} /> 自定义背景</button>
          <label className="desktop-sing-display-label"><span className="sr-only">跟唱读音显示</span><select aria-label="跟唱读音显示" value={displayMode} onChange={event => { setDisplayMode(event.target.value); onReadingSettingsChange?.({ readingStyle: ({ lyrics: 'none', kana: 'hiragana', both: 'both', romaji: 'romaji' })[event.target.value] }) }}>{displayModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button type="button" className="desktop-sing-start" disabled={!audioReady} onClick={onPlayFromStart}><RotateCcw size={16} /> 从头播放</button>
          <button type="button" className="desktop-sing-back" onClick={onBack}><ArrowLeft size={15} /> 返回学习</button>
        </div>
      </header>
      <div className="desktop-sing-guide"><span>{audioReady ? '点击任一句，从该句时间戳开始连续播放' : '导入这首歌的音频后，可点击任一句开始跟唱。'}</span><div><label><input type="checkbox" checked={showTranslation} onChange={event => { setShowTranslation(event.target.checked); onReadingSettingsChange?.({ showTranslation: event.target.checked }) }} /> 显示译文</label><label><input type="checkbox" checked={followPlayback} onChange={event => setFollowPlayback(event.target.checked)} /> 跟随歌词</label></div></div>
      {error && <p className="desktop-sing-error" role="alert">{error}</p>}
      {annotationError && <p className="desktop-sing-note" role="status">部分注音未就绪：{annotationError}</p>}
      <ol className="desktop-sing-list" ref={lyricList} aria-label="跟唱歌词" data-reading-mode={displayMode}>
        {song.lines.map((line, index) => {
          const isCurrent = currentLineId === line.id
          const tokens = annotationByLine.get(line.id)?.tokens
          return <li key={line.id} ref={node => { if (node) rows.current.set(line.id, node); else rows.current.delete(line.id) }} className={`${isCurrent ? 'current' : ''} ${selectedLineId === line.id ? 'selected' : ''}`}>
            <button type="button" disabled={!audioReady || !Number.isFinite(line.start) || line.start < 0} className="desktop-sing-line" onClick={() => onPlayFromLine(line.id)} aria-label={`从第 ${index + 1} 句开始跟唱`} aria-current={isCurrent ? 'true' : undefined} title={Number.isFinite(line.start) ? undefined : '这句尚未设置时间，可先编辑时间再播放'}>
              <span className="desktop-sing-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="desktop-sing-line-body"><span className="desktop-sing-words" lang="ja">{tokens?.length ? tokens.map(token => {
                const key = correctionKey(song.id, line.id, token.index)
                return <WordReading key={key} token={token} reading={tokenReading(token, corrections, key, 'hiragana', readingOptions)} corrected={tokenHasManualReading(token, corrections, key)} hidden={Boolean(hiddenReadings[key])} readingOptions={readingOptions} />
              }) : <span className="desktop-sing-fallback">{line.text}</span>}</span>{showTranslation && line.translation && <span className="desktop-sing-translation">{line.translation}</span>}</span>
              <span className="desktop-sing-line-state">{isCurrent ? playing ? '♪ 正在播放' : '已定位' : ''}</span>
            </button>
          </li>
        })}
      </ol>
      <div className="desktop-sing-footer"><span>{currentIndex < 0 ? '选择一句开始跟唱' : `第 ${currentIndex + 1} / ${song.lines.length} 句`}</span><span>播放、进度、速度和音量由下方播放器控制</span></div>
      {appearanceOpen && <section className="desktop-sing-appearance" role="dialog" aria-label="跟唱背景"><header><div><h2>跟唱背景</h2><p>仅影响跟唱播放器，图片保存在本机。</p></div><button type="button" aria-label="关闭跟唱背景设置" disabled={appearanceBusy} onClick={() => setAppearanceOpen(false)}><X size={16}/></button></header>
        <div className="desktop-sing-background-preview" style={{ backgroundImage: backgroundUrl ? `url("${backgroundUrl}")` : 'none', backgroundColor: visible.color }} />
        <p className="desktop-sing-field-label">背景来源</p><div className="desktop-sing-background-choices"><button type="button" aria-pressed={draft.mode === 'default'} onClick={() => setDraft(previous => ({ ...previous, mode: 'default' }))}>默认背景</button><button type="button" aria-pressed={draft.mode === 'image'} onClick={() => imageInput.current?.click()}>选择本地图片</button><button type="button" aria-pressed={draft.mode === 'color'} onClick={() => setDraft(previous => ({ ...previous, mode: 'color' }))}>纯色</button></div>
        <input className="desktop-sing-file-input" ref={imageInput} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={chooseImage} aria-label="选择跟唱背景图片" />
        {draft.mode === 'color' && <label className="desktop-sing-color-label">背景颜色 <input type="color" value={draft.color} onChange={event => setDraft(previous => ({ ...previous, color: event.target.value }))} /></label>}
        {draft.mode !== 'color' && <label className="desktop-sing-slider">背景模糊 <output>{draft.blur} px</output><input type="range" min="0" max="18" step="1" value={draft.blur} onChange={event => setDraft(previous => ({ ...previous, blur: Number(event.target.value) }))} /></label>}
        <label className="desktop-sing-slider">深色遮罩 <output>{draft.dim}%</output><input type="range" min="25" max="85" step="1" value={draft.dim} onChange={event => setDraft(previous => ({ ...previous, dim: Number(event.target.value) }))} /></label>
        {appearanceError && <p className="desktop-sing-appearance-error" role="alert">{appearanceError}</p>}
        <footer><button type="button" disabled={appearanceBusy} onClick={() => setDraft(DEFAULT_SING_ALONG_APPEARANCE)}>恢复默认</button><button type="button" className="desktop-sing-apply" disabled={appearanceBusy} onClick={applyAppearance}><Check size={14} /> {appearanceBusy ? '保存中…' : '应用背景'}</button></footer>
      </section>}
    </div>
  </section>
}
