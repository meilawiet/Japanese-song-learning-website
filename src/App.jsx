import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenCheck, Bot, Check, ChevronDown, ChevronRight, CircleAlert, Heart, LoaderCircle, MousePointer2, Pause, Pencil, Play, Plus, Save, Search, Sparkles, Upload, UserRound, Volume2, WandSparkles, X } from 'lucide-react'
import AnnotatedLine from './components/AnnotatedLine'
import { importedSongs } from './data/songs.generated'
import { demoSongs } from './data/demoSongs'
import { songArtworkBySource } from './data/songArtwork'
import twilightStation from './assets/uta-twilight-station.png'
import { annotateSongLines, explainSelectionWithAi, reviewSongWithAi } from './lib/annotationApi'
import { createAndStoreLocalSong, loadLocalSongs } from './lib/localSongStore'
import { correctionKey, hasKanji } from './lib/ruby'

const PROGRESS_KEY = 'uta-pronunciation-progress-v2'
const ANNOTATION_KEY = 'uta-auto-annotations-v4'
const AI_REVIEW_KEY = 'uta-ai-reviews-v1'
const LINE_PLAYBACK_LEAD_IN_SECONDS = 0.5

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

function initialSong() {
  return importedSongs.find((song) => song.title === 'Lemon') || importedSongs[0] || demoSongs[0]
}

function fallbackTokens(text) {
  return [{
    index: 0, surface: text, reading: '', base: text, ruby: '', suffix: '',
    part_of_speech: '待注音', dictionary_form: text, normalized_form: text,
    inflection_type: '待分析', inflection_form: '待分析', meaning: null, examples: [], needs_review: true,
  }]
}

function cleanSelectedText(value) {
  return value.replace(/\s+/g, '').trim().slice(0, 100)
}

export default function App() {
  const savedProgress = useMemo(() => loadLocal(PROGRESS_KEY, {
    learnedBySong: {}, reviewItems: [], favoriteSongIds: [], corrections: {}, meaningOverrides: {},
  }), [])
  const [activeSongId, setActiveSongId] = useState(initialSong().id)
  const [activeLineId, setActiveLineId] = useState(0)
  const [mode, setMode] = useState('reading')
  const [learnedBySong, setLearnedBySong] = useState(savedProgress.learnedBySong || {})
  const [reviewItems, setReviewItems] = useState(savedProgress.reviewItems || [])
  const [favoriteSongIds, setFavoriteSongIds] = useState(savedProgress.favoriteSongIds || [])
  const [corrections, setCorrections] = useState(savedProgress.corrections || {})
  const [meaningOverrides, setMeaningOverrides] = useState(savedProgress.meaningOverrides || {})
  const [playbackRate, setPlaybackRate] = useState(savedProgress.playbackRate || 1)
  const [localSongs, setLocalSongs] = useState([])
  const [localAudioUrls, setLocalAudioUrls] = useState({})
  const [annotationsBySong, setAnnotationsBySong] = useState(() => loadLocal(ANNOTATION_KEY, {}))
  const [aiReviews, setAiReviews] = useState(() => loadLocal(AI_REVIEW_KEY, {}))
  const [annotating, setAnnotating] = useState(false)
  const [annotationError, setAnnotationError] = useState('')
  const [selectedTokenIndex, setSelectedTokenIndex] = useState(0)
  const [draftReading, setDraftReading] = useState('')
  const [draftMeaning, setDraftMeaning] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailView, setDetailView] = useState('word')
  const [selectedText, setSelectedText] = useState(null)
  const [dragSelection, setDragSelection] = useState(null)
  const [selectedPhraseRange, setSelectedPhraseRange] = useState(null)
  const [aiExplanation, setAiExplanation] = useState(null)
  const [aiBusy, setAiBusy] = useState('')
  const [aiError, setAiError] = useState('')
  const [playingLineId, setPlayingLineId] = useState(null)
  const [audioError, setAudioError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importLrcFile, setImportLrcFile] = useState(null)
  const [importAudioFile, setImportAudioFile] = useState(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState('')
  const [toast, setToast] = useState('')
  const dragSelectionRef = useRef(null)
  const suppressNextTokenClick = useRef(false)
  const audioRef = useRef(null)
  const clipEndRef = useRef(null)
  const pendingClipRef = useRef(null)
  const localAudioUrlRef = useRef({})

  const allSongs = useMemo(() => [...importedSongs, ...localSongs, ...demoSongs], [localSongs])
  const activeSong = allSongs.find((song) => song.id === activeSongId) || initialSong()
  const audioUrl = activeSong.isLocal
    ? localAudioUrls[activeSong.id] || ''
    : activeSong.audioFile
    ? `${import.meta.env.BASE_URL}${activeSong.audioFile.split('/').map((part) => encodeURIComponent(part)).join('/')}`
    : ''
  const activeLine = activeSong.lines.find((line) => line.id === activeLineId) || activeSong.lines[0]
  const annotations = annotationsBySong[activeSong.id]
  const activeAnnotation = annotations?.find((line) => line.id === activeLine.id)
  const activeTokens = useMemo(
    () => activeAnnotation?.tokens || fallbackTokens(activeLine.text),
    [activeAnnotation, activeLine.text],
  )
  const focusToken = activeTokens.find((token) => token.index === selectedTokenIndex)
    || activeTokens.find((token) => hasKanji(token.surface)) || activeTokens[0]
  const focusKey = correctionKey(activeSong.id, activeLine.id, focusToken.index)
  const focusReading = corrections[focusKey] || focusToken.reading
  const meaningKey = `${focusToken.dictionary_form || focusToken.surface}:${focusToken.reading}`
  const wordMeaning = meaningOverrides[meaningKey] || focusToken.meaning || ''
  const learnedLines = new Set(learnedBySong[activeSong.id] || [])
  const progress = activeSong.lines.length ? Math.round((learnedLines.size / activeSong.lines.length) * 100) : 0
  const isFavorite = favoriteSongIds.includes(activeSong.id)
  const hasReview = reviewItems.some((item) => item.songId === activeSong.id && item.lineId === activeLine.id)
  const totalCorrections = Object.keys(corrections).filter((key) => key.startsWith(`${activeSong.id}:`)).length
  const reviewNeeded = annotations?.flatMap((line) => line.tokens).filter((token) => token.needs_review).length || 0
  const aiReview = aiReviews[activeSong.id]
  const pendingAiSuggestions = (aiReview?.suggestions || []).filter((suggestion) => !corrections[correctionKey(activeSong.id, suggestion.line_id, suggestion.token_index)])
  const focusSuggestion = pendingAiSuggestions.find((item) => item.line_id === activeLine.id && item.token_index === focusToken.index)

  useEffect(() => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ learnedBySong, reviewItems, favoriteSongIds, corrections, meaningOverrides, playbackRate }))
  }, [learnedBySong, reviewItems, favoriteSongIds, corrections, meaningOverrides, playbackRate])

  useEffect(() => { localStorage.setItem(ANNOTATION_KEY, JSON.stringify(annotationsBySong)) }, [annotationsBySong])
  useEffect(() => { localStorage.setItem(AI_REVIEW_KEY, JSON.stringify(aiReviews)) }, [aiReviews])
  useEffect(() => {
    let disposed = false
    loadLocalSongs()
      .then((records) => {
        const nextUrls = {}
        records.forEach((record) => { nextUrls[record.id] = URL.createObjectURL(record.audioBlob) })
        if (disposed) {
          Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url))
          return
        }
        localAudioUrlRef.current = nextUrls
        setLocalAudioUrls(nextUrls)
        setLocalSongs(records.map(({ audioBlob, ...song }) => song))
      })
      .catch(() => { /* Local import is optional; built-in songs remain available. */ })
    return () => { disposed = true }
  }, [])
  useEffect(() => () => {
    Object.values(localAudioUrlRef.current).forEach((url) => URL.revokeObjectURL(url))
  }, [])
  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const cached = annotationsBySong[activeSong.id]
    if (cached?.length === activeSong.lines.length) return undefined
    let abandoned = false
    setAnnotating(true)
    setAnnotationError('')
    annotateSongLines(activeSong.lines)
      .then((annotation) => {
        if (!abandoned) setAnnotationsBySong((all) => ({ ...all, [activeSong.id]: annotation }))
      })
      .catch(() => {
        if (!abandoned) setAnnotationError('自动注音服务未连接。请使用 npm.cmd run dev 启动完整学习环境。')
      })
      .finally(() => { if (!abandoned) setAnnotating(false) })
    return () => { abandoned = true }
  }, [activeSong.id, activeSong.lines, annotationsBySong])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    clipEndRef.current = null
    pendingClipRef.current = null
    setPlayingLineId(null)
    setAudioError('')
  }, [activeSong.id])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    const finishOnWindow = () => finishTokenSelection()
    window.addEventListener('pointerup', finishOnWindow)
    return () => window.removeEventListener('pointerup', finishOnWindow)
  }, [activeSong.id, annotations])

  useEffect(() => {
    const firstToken = activeTokens.find((token) => hasKanji(token.surface)) || activeTokens[0]
    if (firstToken) setSelectedTokenIndex(firstToken.index)
  }, [activeSong.id, activeLine.id, activeTokens])

  useEffect(() => { setDraftReading(focusReading) }, [focusKey, focusReading])
  useEffect(() => { setDraftMeaning(wordMeaning) }, [meaningKey, wordMeaning])

  function chooseSong(songId) {
    audioRef.current?.pause()
    setActiveSongId(songId)
    setActiveLineId(0)
    setSelectedText(null)
    dragSelectionRef.current = null
    setDragSelection(null)
    setSelectedPhraseRange(null)
    setAiExplanation(null)
    setAiError('')
    setToast('已切换歌词，正在准备自动读音。')
  }

  function chooseLine(lineId) { setActiveLineId(lineId) }

  function chooseSongFromLibrary(songId) {
    chooseSong(songId)
    window.requestAnimationFrame(() => {
      document.getElementById('lesson')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function openImportDialog() {
    setImportError('')
    setImportOpen(true)
  }

  function closeImportDialog() {
    if (importBusy) return
    setImportOpen(false)
    setImportError('')
  }

  async function importLocalSong() {
    if (!importLrcFile || !importAudioFile) {
      setImportError('请选择一个 LRC 歌词文件和一个音频文件。')
      return
    }
    setImportBusy(true)
    setImportError('')
    try {
      const record = await createAndStoreLocalSong(importLrcFile, importAudioFile)
      const { audioBlob, ...song } = record
      const audioObjectUrl = URL.createObjectURL(audioBlob)
      localAudioUrlRef.current = { ...localAudioUrlRef.current, [song.id]: audioObjectUrl }
      setLocalSongs((previous) => [song, ...previous])
      setLocalAudioUrls((previous) => ({ ...previous, [song.id]: audioObjectUrl }))
      setImportLrcFile(null)
      setImportAudioFile(null)
      setImportOpen(false)
      chooseSong(song.id)
      window.requestAnimationFrame(() => {
        document.getElementById('lesson')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      setToast(`已导入《${song.title}》，现在可以开始学习。`)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '导入失败，请检查歌词和音频文件。')
    } finally {
      setImportBusy(false)
    }
  }

  function choosePlaybackRate(nextRate) {
    setPlaybackRate(nextRate)
    setToast(`已切换为 ${nextRate}× 速度播放。`)
  }

  function startClipPlayback(clip) {
    const audio = audioRef.current
    if (!audio) return
    const fallbackEnd = Number.isFinite(audio.duration) ? audio.duration : clip.start + 8
    clipEndRef.current = Math.max(clip.start + 0.12, clip.end ?? fallbackEnd)
    audio.playbackRate = playbackRate
    try { audio.currentTime = clip.start } catch { /* Wait for metadata if the browser has not seeked yet. */ }
    audio.play()
      .then(() => { setPlayingLineId(clip.lineId); setAudioError('') })
      .catch(() => {
        setPlayingLineId(null)
        setAudioError('浏览器未能开始播放该句音频。')
      })
  }

  function playLine(lineId) {
    if (!audioUrl) {
      setAudioError('未找到与这首歌词同名的音频文件。')
      return
    }
    const lineIndex = activeSong.lines.findIndex((line) => line.id === lineId)
    const line = activeSong.lines[lineIndex]
    const audio = audioRef.current
    if (!line || !audio) return
    if (playingLineId === lineId && !audio.paused) {
      audio.pause()
      setPlayingLineId(null)
      return
    }
    const nextStart = activeSong.lines[lineIndex + 1]?.start
    const clip = {
      lineId,
      // LRC marks often land just after the initial consonant. Start a little
      // early so learners hear the complete onset of the sung line.
      start: Math.max(0, (line.start || 0) - LINE_PLAYBACK_LEAD_IN_SECONDS),
      end: Number.isFinite(nextStart) ? nextStart : null,
    }
    if (audio.readyState < 1) {
      pendingClipRef.current = clip
      audio.load()
      return
    }
    startClipPlayback(clip)
  }

  function handleAudioLoadedMetadata() {
    const clip = pendingClipRef.current
    if (!clip) return
    pendingClipRef.current = null
    startClipPlayback(clip)
  }

  function handleAudioTimeUpdate() {
    const audio = audioRef.current
    if (!audio || clipEndRef.current == null || audio.currentTime < clipEndRef.current - 0.04) return
    audio.pause()
    audio.currentTime = clipEndRef.current
    clipEndRef.current = null
    setPlayingLineId(null)
  }

  function toggleLearned() {
    setLearnedBySong((previous) => {
      const next = new Set(previous[activeSong.id] || [])
      next.has(activeLine.id) ? next.delete(activeLine.id) : next.add(activeLine.id)
      setToast(next.has(activeLine.id) ? '本句已标记为掌握。' : '已取消本句掌握状态。')
      return { ...previous, [activeSong.id]: [...next] }
    })
  }

  function toggleFavorite() {
    setFavoriteSongIds((previous) => previous.includes(activeSong.id)
      ? previous.filter((id) => id !== activeSong.id) : [...previous, activeSong.id])
    setToast(isFavorite ? '已从收藏中移除。' : `已收藏《${activeSong.title}》。`)
  }

  function toggleReview() {
    setReviewItems((previous) => hasReview
      ? previous.filter((item) => !(item.songId === activeSong.id && item.lineId === activeLine.id))
      : [...previous, { songId: activeSong.id, lineId: activeLine.id, text: activeLine.text }])
    setToast(hasReview ? '已移出复习清单。' : '本句已加入今日复习。')
  }

  function saveCorrection() {
    const nextReading = draftReading.trim()
    if (!nextReading) { setToast('读音不能为空。'); return }
    setCorrections((previous) => ({ ...previous, [focusKey]: nextReading }))
    setToast(`已保存「${focusToken.surface}」的读音修正。`)
  }

  function resetCorrection() {
    setCorrections((previous) => {
      const { [focusKey]: ignored, ...rest } = previous
      return rest
    })
    setToast('已恢复词典自动读音。')
  }

  function saveMeaning() {
    const nextMeaning = draftMeaning.trim()
    if (!nextMeaning) { setToast('常用意思不能为空。'); return }
    setMeaningOverrides((previous) => ({ ...previous, [meaningKey]: nextMeaning }))
    setToast(`已保存「${focusToken.surface}」的常用意思。`)
  }

  function openWordDetails() {
    setDetailView('word')
    setAiExplanation(null)
    setDetailOpen(true)
  }

  function closeDetail() {
    setDetailOpen(false)
    setDetailView('word')
  }

  async function runAiReview() {
    setAiBusy('review')
    setAiError('')
    try {
      const result = await reviewSongWithAi(activeSong)
      setAiReviews((previous) => ({ ...previous, [activeSong.id]: { ...result, reviewedAt: Date.now() } }))
      setToast(result.suggestions?.length ? `AI 标出了 ${result.suggestions.length} 处待确认读音。` : 'AI 未发现明显需要复核的读音。')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 复核暂时不可用。'
      setAiError(message)
      setToast(message)
    } finally {
      setAiBusy('')
    }
  }

  function applyAiSuggestion() {
    if (!focusSuggestion) return
    setDraftReading(focusSuggestion.suggested_reading)
    setCorrections((previous) => ({ ...previous, [focusKey]: focusSuggestion.suggested_reading }))
    setToast(`已采用建议读音「${focusSuggestion.suggested_reading}」，仍可继续修改。`)
  }

  function beginTokenSelection(lineId, tokenIndex) {
    const next = { lineId, startIndex: tokenIndex, endIndex: tokenIndex }
    dragSelectionRef.current = next
    setDragSelection(next)
    setSelectedPhraseRange(null)
    setSelectedText(null)
  }

  function extendTokenSelection(lineId, tokenIndex) {
    const current = dragSelectionRef.current
    if (!current || current.lineId !== lineId || current.endIndex === tokenIndex) return
    const next = { ...current, endIndex: tokenIndex }
    dragSelectionRef.current = next
    setDragSelection(next)
  }

  function finishTokenSelection() {
    const range = dragSelectionRef.current
    if (!range) return
    dragSelectionRef.current = null
    setDragSelection(null)

    if (range.startIndex === range.endIndex) {
      chooseLine(range.lineId)
      setSelectedTokenIndex(range.startIndex)
      setSelectedText(null)
      setSelectedPhraseRange(null)
      return
    }

    const tokens = annotations?.find((line) => line.id === range.lineId)?.tokens || []
    const first = Math.min(range.startIndex, range.endIndex)
    const last = Math.max(range.startIndex, range.endIndex)
    const text = tokens.filter((token) => token.index >= first && token.index <= last).map((token) => token.surface).join('')
    if (!text) return
    suppressNextTokenClick.current = true
    window.setTimeout(() => { suppressNextTokenClick.current = false }, 0)
    chooseLine(range.lineId)
    setSelectedTokenIndex(range.endIndex)
    setSelectedText({ text, lineId: range.lineId, aiOnly: true })
    setSelectedPhraseRange(range)
    setAiError('')
  }

  function handleTokenClick(lineId, tokenIndex) {
    if (suppressNextTokenClick.current) {
      suppressNextTokenClick.current = false
      return
    }
    chooseLine(lineId)
    setSelectedTokenIndex(tokenIndex)
    setSelectedText(null)
    setSelectedPhraseRange(null)
  }

  function jumpToAiSuggestion(suggestion) {
    chooseLine(suggestion.line_id)
    setSelectedTokenIndex(suggestion.token_index)
    setSelectedText(null)
    setSelectedPhraseRange(null)
    window.requestAnimationFrame(() => {
      document.getElementById(`lyric-row-${activeSong.id}-${suggestion.line_id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function getAiTargetToken(target) {
    const targetTokens = annotations?.find((line) => line.id === target.lineId)?.tokens || []
    const token = targetTokens.find((item) => item.surface === target.text)
    return token ? {
      surface: token.surface,
      reading: corrections[correctionKey(activeSong.id, target.lineId, token.index)] || token.reading,
      dictionary_form: token.dictionary_form,
      part_of_speech: token.part_of_speech,
    } : undefined
  }

  async function askAiToExplain(target) {
    if (!target?.text) return
    const lineIndex = activeSong.lines.findIndex((line) => line.id === target.lineId)
    const targetLine = activeSong.lines[lineIndex] || activeLine
    setAiBusy('explain')
    setAiError('')
    try {
      const result = await explainSelectionWithAi({
        selection: target.text,
        line_text: targetLine.text,
        previous_line: activeSong.lines[lineIndex - 1]?.text || '',
        next_line: activeSong.lines[lineIndex + 1]?.text || '',
        learner_level: 'N3',
        token: getAiTargetToken(target),
      })
      setAiExplanation(result)
      setDetailView(target.aiOnly ? 'ai' : 'word')
      setDetailOpen(true)
      setToast('AI 语境讲解已生成，可结合词典信息确认。')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 讲解暂时不可用。'
      setAiError(message)
      setToast(message)
    } finally {
      setAiBusy('')
    }
  }

  return <>
    <div className="page-grain" aria-hidden="true" />
    <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" onLoadedMetadata={handleAudioLoadedMetadata} onTimeUpdate={handleAudioTimeUpdate} onEnded={() => { clipEndRef.current = null; setPlayingLineId(null) }} onError={() => { setPlayingLineId(null); setAudioError(`未能加载《${activeSong.title}》的音频文件。`) }} />
    <header className="topbar">
      <a className="brand" href="#top" aria-label="UTA 首页"><span className="brand-mark">う</span><span>UTA<span className="brand-dot">.</span></span></a>
      <nav className="main-nav" aria-label="主导航"><a className="active" href="#lesson">发音学习</a><a href="#library">歌曲库</a><a href="#review">复习</a></nav>
      <div className="top-actions"><button className="icon-button" type="button" aria-label="搜索"><Search size={20} /></button><button className="avatar" type="button" aria-label="个人中心"><UserRound size={15} /></button></div>
    </header>

    <main id="top">
      <section className="hero anime-hero" aria-labelledby="song-title" style={{ '--hero-art': `url(${twilightStation})` }}>
        <div className="hero-art" aria-hidden="true" />
        <div className="hero-wash" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-label"><span />日语歌词 · 一句一句唱清楚</div>
          <div className="anime-hero-grid">
            <div className="song-intro">
              <p className="hero-kicker">LYRICS, SLOWLY</p>
              <p className="hero-season">夜风 · 电车 · 一首歌</p>
              <h1 id="song-title">{activeSong.title}</h1>
              <p className="roman">{activeSong.artist} <span>·</span> <strong>{activeSong.lines.length} 句日语歌词</strong></p>
              <p className="song-description">把喜欢的歌拆成一句一句：先听见、读准，再慢慢唱出来。读音初稿和词义都可由你校正。</p>
              <div className="song-meta"><span><b>本次选曲</b> {activeSong.sourceFile}</span><span><b>已修正</b> {totalCorrections} 词</span><span><b>待复习</b> {reviewItems.length} 句</span></div>
              <div className="hero-cta">
                <a className="play-button" href="#lesson"><BookOpenCheck size={14} /> 从第一句开始</a>
                <button className={`save-button ${isFavorite ? 'saved' : ''}`} onClick={toggleFavorite} type="button"><Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} /> {isFavorite ? '已收藏' : '收藏'}</button>
                <button className="ai-review-button" onClick={runAiReview} disabled={aiBusy === 'review'} type="button">{aiBusy === 'review' ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />} {aiBusy === 'review' ? '正在复核…' : 'AI 复核全曲'}</button>
              </div>
              <p className="ai-privacy-note">AI 只会在你主动点击时参与复核，始终由你决定是否采用建议。</p>
            </div>
            <aside className="hero-focus-card" aria-label="当前歌曲学习进度">
              <p className="hero-focus-label">NOW PLAYING</p>
              <div className="hero-focus-title"><span>{String(allSongs.indexOf(activeSong) + 1).padStart(2, '0')}</span><div><b>{activeSong.title}</b><small>{activeSong.artist}</small></div></div>
              <div className="hero-progress"><div><span>读音掌握</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><p>{learnedLines.size} / {activeSong.lines.length} 句已掌握</p></div>
              <button type="button" onClick={() => document.getElementById('library')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>换一首歌 <ChevronDown size={14} /></button>
            </aside>
          </div>
        </div>
      </section>

      <section className="practice-layout" id="lesson" aria-label="歌词发音学习工作区">
        <aside className="lesson-rail">
          <div className="rail-heading"><span>已导入歌曲</span><span>{allSongs.length} 首</span></div>
          <ol className="song-import-list">{allSongs.map((song, index) => <li className={song.id === activeSong.id ? 'current' : ''} key={song.id}><button onClick={() => chooseSong(song.id)} type="button"><em>{String(index + 1).padStart(2, '0')}</em><span><b>{song.title}</b><small>{song.artist} · {song.lines.length} 句</small></span></button></li>)}</ol>
          <div className="learning-tip"><span>→</span><p><b>用法</b>先看自动标注，再点词修正。你保存的版本始终优先。</p></div>
        </aside>

        <section className="lyrics-panel" aria-labelledby="lyrics-heading">
          <div className="panel-head"><div><p className="eyebrow">AUTO ANNOTATE, THEN VERIFY</p><h2 id="lyrics-heading">逐句读音</h2></div><div className="view-toggle" role="group" aria-label="读音显示方式">{[['original', '原文'], ['reading', '假名'], ['practice', '遮住练习']].map(([value, label]) => <button className={mode === value ? 'selected' : ''} onClick={() => setMode(value)} type="button" key={value}>{label}</button>)}</div></div>
          <div className="pronunciation-strip"><div><span className="strip-index">{annotating ? 'ANNOTATING' : annotationError ? 'OFFLINE' : 'AUTO READY'}</span><b>{annotating ? '正在为整首歌词生成读音…' : annotationError || '点击带假名的汉字词，可在右侧修改读音'}</b></div><span className="source-badge"><WandSparkles size={13} /> SudachiPy + 本地日中词典</span></div>
          <div className="audio-tools"><p className="audio-play-tip"><Volume2 size={13} /> {audioUrl ? '点击每句右侧的播放按钮，系统会提前 0.5 秒进入本句，并播到下一句。' : '未找到同名音频，无法逐句播放。'}</p><label className="speed-control"><span>慢放</span><select value={playbackRate} onChange={(event) => choosePlaybackRate(Number(event.target.value))} aria-label="逐句播放速度"><option value={1}>1×</option><option value={0.75}>0.75×</option><option value={0.5}>0.5×</option><option value={0.25}>0.25×</option></select></label></div>
          <p className="selection-guide"><MousePointer2 size={13} /> 按住鼠标左键向右拖过词语，松开后点高亮段右上角的“AI 解释”。</p>
          <div className="mobile-word-dock"><div><b>{focusToken.surface} <span>{focusReading}</span></b><small>{wordMeaning || '常用意思待补充'}</small></div><button type="button" onClick={openWordDetails}>查看详情</button></div>
          {reviewNeeded > 0 && <p className="annotation-tip warn"><CircleAlert size={13} /> 有 {reviewNeeded} 个词典未能确定读音，请优先人工校对。</p>}
          {aiError && <p className="annotation-tip ai-error"><CircleAlert size={13} /> {aiError}</p>}
          {aiReview && <p className="ai-review-summary"><Sparkles size={13} /> AI 已复核 {aiReview.reviewed_token_count} 个词素：{pendingAiSuggestions.length ? <>还有 {pendingAiSuggestions.length} 处待处理建议，<button type="button" onClick={() => document.getElementById('ai-review-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>查看全部</button></> : aiReview.suggestions?.length ? '所有建议均已处理。' : '未发现明显异常；仍建议以原唱为准。'}</p>}
          <div className="lyrics-list">
            {activeSong.lines.map((line) => {
              const annotation = annotations?.find((item) => item.id === line.id)
              const lineTokens = annotation?.tokens
              const current = line.id === activeLine.id
              const isPlaying = playingLineId === line.id
              const lineReading = lineTokens?.map((token) => corrections[correctionKey(activeSong.id, line.id, token.index)] || token.reading).join(' ')
              return <article id={`lyric-row-${activeSong.id}-${line.id}`} className={`lyric-row ${current ? 'active' : ''}`} onClick={() => chooseLine(line.id)} key={`${activeSong.id}-${line.id}`}>
                <span className="line-number">{String(line.id + 1).padStart(2, '0')}</span>
                <div className="auto-line-wrap"><div className="japanese"><AnnotatedLine tokens={lineTokens} corrections={corrections} songId={activeSong.id} lineId={line.id} mode={mode} selectedIndex={current ? selectedTokenIndex : -1} selectionRange={dragSelection?.lineId === line.id ? dragSelection : selectedPhraseRange?.lineId === line.id ? selectedPhraseRange : null} showSelectionAction={selectedText?.lineId === line.id && selectedPhraseRange?.lineId === line.id} onStartSelection={(tokenIndex) => beginTokenSelection(line.id, tokenIndex)} onExtendSelection={(tokenIndex) => extendTokenSelection(line.id, tokenIndex)} onFinishSelection={finishTokenSelection} onExplainSelection={() => askAiToExplain(selectedText)} onSelectToken={(tokenIndex) => handleTokenClick(line.id, tokenIndex)} /></div><div className={`reading ${lineTokens ? '' : 'needs-review'}`}>{mode === 'reading' ? lineReading || '正在生成假名…' : mode === 'practice' ? '假名已隐藏，尝试自己读出这一句' : '切换到“假名”查看自动标注'}</div><div className="translation">{lineTokens ? `${lineTokens.length} 个词素 · ${lineTokens.some((token) => token.needs_review) ? '含待复核词' : '自动初稿已就绪'}` : '等待自动分词'}</div></div>
                <button className={`line-action line-play ${isPlaying ? 'playing' : ''}`} type="button" onClick={(event) => { event.stopPropagation(); playLine(line.id) }} aria-label={`${isPlaying ? '暂停' : '播放'}第 ${line.id + 1} 句`} title={`${isPlaying ? '暂停' : '播放'}这一句`}>{isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button>
              </article>
            })}
          </div>
          <div className="lyrics-footer"><span>点击任一词即可在右侧校对；选中短语可请求 AI 解释</span><button type="button" onClick={toggleLearned}>{learnedLines.has(activeLine.id) ? <><Check size={14} /> 已掌握本句</> : <><Check size={14} /> 标记本句已掌握</>}</button></div>
        </section>

        <aside className="word-panel" aria-labelledby="word-heading">
          <div className="panel-head compact"><div><p className="eyebrow">EDIT THE READING</p><h2 id="word-heading">校对读音</h2></div><span className={`annotation-state ${corrections[focusKey] ? 'corrected' : ''}`}>{corrections[focusKey] ? '已修正' : '自动初稿'}</span></div>
          <div className="word-card correction-card">
            <div className="word-topline"><span className="word-level">{focusToken.part_of_speech || '词素'}</span><button type="button" aria-label="选中词"><Pencil size={15} /></button></div>
            <div className="word-main"><h3>{focusToken.surface}</h3><p className="word-kana">{focusReading || '暂无词典读音'}</p><p className="word-meaning">{wordMeaning || '常用意思暂未收录，可在详情中补充'}</p><button className="detail-link" type="button" onClick={openWordDetails}>查看详情 <ChevronRight size={14} /></button></div>
            {focusSuggestion && <div className="ai-suggestion"><span><Sparkles size={12} /> AI 复核建议 · {(focusSuggestion.confidence * 100).toFixed(0)}%</span><p>建议读作「{focusSuggestion.suggested_reading}」：{focusSuggestion.reason}</p><button type="button" onClick={applyAiSuggestion}>采用建议</button></div>}
            <label className="reading-editor"><span>假名读音</span><input value={draftReading} onChange={(event) => setDraftReading(event.target.value)} placeholder="输入平假名或片假名" lang="ja" /><small>如：わすれた / もの / かえる</small></label>
            <div className="editor-actions"><button className="save-reading" onClick={saveCorrection} type="button"><Save size={13} /> 保存修正</button>{corrections[focusKey] && <button className="reset-reading" onClick={resetCorrection} type="button">恢复初稿</button>}</div>
          </div>
          {pendingAiSuggestions.length > 0 && <section className="ai-review-queue" id="ai-review-queue" aria-labelledby="ai-review-queue-title">
            <div><span className="eyebrow">AI REVIEW QUEUE</span><h3 id="ai-review-queue-title">复核建议 <b>{pendingAiSuggestions.length}</b></h3></div>
            <ol>{pendingAiSuggestions.map((suggestion) => <li className={suggestion.line_id === activeLine.id && suggestion.token_index === focusToken.index ? 'current' : ''} key={`${suggestion.line_id}-${suggestion.token_index}`}><button type="button" onClick={() => jumpToAiSuggestion(suggestion)}><span>第 {suggestion.line_id + 1} 句 · {suggestion.surface}</span><small>{suggestion.original_reading} <ChevronRight size={11} /> {suggestion.suggested_reading}</small></button></li>)}</ol>
          </section>}
          <div className="word-context"><span>所在句子</span><p>{activeLine.text}</p><small>点击歌词中的其他词，可继续逐词校对。</small></div>
          <div className="practice-checklist"><span>校对建议</span><p>① 先确认自动假名是否合理<br />② 歌词特殊读法按原唱实际修正<br />③ 将有疑问的整句加入复习</p></div>
          <button className={`review-button ${hasReview ? 'added' : ''}`} onClick={toggleReview} type="button">{hasReview ? <><Check size={13} /> 已加入今日复习</> : <><Plus size={13} /> 加入今日复习</>}</button>
        </aside>
      </section>

      <section className="method-section"><div className="method-title"><p className="eyebrow">THE CORRECTION LOOP</p><h2>自动起稿，<br />由学习者校准。</h2></div><div className="method-cards"><article><span>01</span><h3>全曲自动注音</h3><p>导入任意日语歌词后，由 Sudachi 词典逐词生成读音初稿。</p></article><article><span>02</span><h3>AI 复核与人工确认</h3><p>AI 只标出可能不合理的读法；采用、修改或忽略建议始终由你决定。</p></article><article><span>03</span><h3>按语境理解词汇</h3><p>选中词或短语再请求讲解，结合相邻歌词学习词义和变形。</p></article></div></section>

      <section className="library-section" id="library" aria-labelledby="library-title">
        <div className="library-top"><div><p className="eyebrow">YOUR IMPORTED SONGS</p><h2 id="library-title">歌曲库</h2><p>从已导入的歌词中选一首，继续练习发音与词汇。</p></div><div className="library-top-actions"><span className="library-count">已导入 {allSongs.length} 首</span><button className="library-import-trigger" type="button" onClick={openImportDialog}><Upload size={14} /> 导入歌曲</button></div></div>
        <div className="song-library-grid">{allSongs.map((song, index) => {
          const artwork = songArtworkBySource[song.sourceFile]
          const learnedCount = (learnedBySong[song.id] || []).length
          const isCurrentSong = song.id === activeSong.id
          return <article className={`library-song-card ${isCurrentSong ? 'current' : ''}`} key={song.id}>
            <button type="button" onClick={() => chooseSongFromLibrary(song.id)} aria-label={`学习 ${song.title}，${song.artist}`}>
              <span className="library-cover">
                <span className="library-cover-fallback" aria-hidden="true">{song.title.slice(0, 2)}</span>
                {artwork?.artworkUrl && <img src={artwork.artworkUrl} alt={`${song.title} 的发行封面`} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true }} />}
                <span className="library-cover-shade" aria-hidden="true" />
                <span className="library-card-index">{String(index + 1).padStart(2, '0')}</span>
                {isCurrentSong && <span className="library-current-badge">正在学习</span>}
                {song.isLocal && <span className="library-local-badge">本地导入</span>}
              </span>
              <span className="library-card-copy"><b>{song.title}</b><small>{song.artist}</small><span><BookOpenCheck size={13} /> {learnedCount} / {song.lines.length} 句已掌握</span></span>
            </button>
            {artwork?.sourceUrl && <a className="library-artwork-source" href={artwork.sourceUrl} target="_blank" rel="noreferrer">封面来源 · Apple Music</a>}
          </article>
        })}</div>
      </section>
    </main>

    <footer><span>UTA. Learn Japanese, one lyric at a time.</span><span>自动注音在本机生成 · 词义数据：<a href="https://github.com/tomoshi-app/tomoshi-dict-data" target="_blank" rel="noreferrer">Tomoshi / EDRDG</a> · AI 请求仅在你主动点击后发起</span></footer>

    {importOpen && <div className="song-import-backdrop" role="presentation" onClick={closeImportDialog}><form className="song-import-dialog" onSubmit={(event) => { event.preventDefault(); importLocalSong() }} onClick={(event) => event.stopPropagation()}>
      <button className="song-import-close" type="button" onClick={closeImportDialog} aria-label="关闭导入窗口"><X size={18} /></button>
      <p className="eyebrow">ADD A LOCAL SONG</p><h2>导入歌曲开始学习</h2><p className="song-import-intro">选择带时间轴的 LRC 歌词和对应音频。它们只保存在当前浏览器中，不会上传。</p>
      <label className={`song-file-field ${importLrcFile ? 'selected' : ''}`}><span>01 · 歌词文件</span><strong>{importLrcFile?.name || '选择 .lrc 文件'}</strong><small>需要每句开头的时间戳，例如 [01:23.45]</small><input key={importLrcFile?.name || 'empty-lrc'} type="file" accept=".lrc,text/plain" onChange={(event) => { setImportLrcFile(event.target.files?.[0] || null); setImportError('') }} /></label>
      <label className={`song-file-field ${importAudioFile ? 'selected' : ''}`}><span>02 · 原声音频</span><strong>{importAudioFile?.name || '选择 MP3、M4A、WAV、OGG 等音频'}</strong><small>播放时会根据 LRC 时间戳逐句截取</small><input key={importAudioFile?.name || 'empty-audio'} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" onChange={(event) => { setImportAudioFile(event.target.files?.[0] || null); setImportError('') }} /></label>
      {importError && <p className="song-import-error"><CircleAlert size={14} /> {importError}</p>}
      <div className="song-import-actions"><button type="button" onClick={closeImportDialog}>取消</button><button className="song-import-submit" type="submit" disabled={importBusy}>{importBusy ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}{importBusy ? '正在导入…' : '导入并开始学习'}</button></div>
    </form></div>}

    {detailOpen && <div className="detail-backdrop" role="presentation" onClick={closeDetail}><section className={`word-detail ${detailView === 'ai' ? 'ai-only-detail' : ''}`} role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={(event) => event.stopPropagation()}>
      <button className="detail-close" type="button" onClick={closeDetail} aria-label="关闭详情"><X size={18} /></button>
      {detailView !== 'ai' && <p className="eyebrow">WORD DETAILS</p>}
      {detailView !== 'ai' && <><div className="detail-heading"><div><h2 id="detail-title">{focusToken.surface}</h2><p>{focusReading || '读音待校对'}</p></div><span>{focusToken.part_of_speech || '词素'}</span></div>
      <dl className="detail-metadata"><div><dt>常用意思</dt><dd>{wordMeaning || '暂未收录；可在下方补充。'}</dd></div><div><dt>词典形</dt><dd>{focusToken.dictionary_form || focusToken.surface}</dd></div><div><dt>当前形式</dt><dd>{focusToken.surface}</dd></div><div><dt>活用信息</dt><dd>{focusToken.inflection_type || '无活用'} · {focusToken.inflection_form || '基本形'}</dd></div></dl>
      <div className="meaning-editor"><label htmlFor="meaning-input">补充或修正常用意思</label><input id="meaning-input" value={draftMeaning} onChange={(event) => setDraftMeaning(event.target.value)} placeholder="例如：梦；梦想" /><button type="button" onClick={saveMeaning}><Save size={14} /> 保存意思</button></div>
      <div className="detail-ai-action"><div><Bot size={15} /><span>想了解这个词在歌词中的具体用法？</span></div><button type="button" disabled={aiBusy === 'explain'} onClick={() => askAiToExplain({ text: focusToken.surface, lineId: activeLine.id })}>{aiBusy === 'explain' ? <LoaderCircle className="spin" size={13} /> : <Sparkles size={13} />} AI 语境讲解</button></div></>}
      {aiExplanation && <section className="ai-explanation"><p className="eyebrow">AI IN CONTEXT</p><h3 id={detailView === 'ai' ? 'detail-title' : undefined}>{aiExplanation.term} <small>{aiExplanation.reading} · 本句推荐</small></h3><dl><div><dt>常用义</dt><dd>{aiExplanation.common_meaning || '未给出'}</dd></div><div><dt>歌词中</dt><dd>{aiExplanation.contextual_meaning || '未给出'}</dd></div>{aiExplanation.dictionary_form && <div><dt>词典形</dt><dd>{aiExplanation.dictionary_form}</dd></div>}{aiExplanation.conjugation && <div><dt>变形</dt><dd>{aiExplanation.conjugation}</dd></div>}</dl>{aiExplanation.alternative_readings?.length > 0 && <div className="alternative-readings"><h4>其他常见读音</h4><ul>{aiExplanation.alternative_readings.map((item) => <li key={item.reading}><b>{item.reading}</b><span>{item.meaning || '常见异读'}</span>{item.when_to_use && <small>{item.when_to_use}</small>}</li>)}</ul></div>}{aiExplanation.usages?.length > 0 && <ul>{aiExplanation.usages.map((item) => <li key={item}>{item}</li>)}</ul>}{aiExplanation.learning_tip && <p className="ai-tip">学习提示：{aiExplanation.learning_tip}</p>}{aiExplanation.caution && <p className="ai-caution">注意：{aiExplanation.caution}</p>}</section>}
      {detailView !== 'ai' && <><div className="detail-examples"><h3>常见搭配</h3>{focusToken.examples?.length ? <ul>{focusToken.examples.map((example) => <li key={example}>{example}</li>)}</ul> : <p>暂未收录搭配。可先根据当前歌词语境补充常用意思。</p>}</div>
      <div className="detail-line"><span>歌词语境</span><p>{activeLine.text}</p></div></>}
    </section></div>}
    <div className={`toast ${toast ? 'visible' : ''}`} role="status">{toast}</div>
  </>
}
