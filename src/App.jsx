import DesktopLyricRangeControls from './components/DesktopLyricRangeControls'
import { lyricRangeBounds } from './lib/lyricRange'
import BatchSongImportDialog from './components/BatchSongImportDialog'
import { DesktopChrome, DesktopSongHeader, DesktopLibrary, DesktopReview, DesktopPlayer } from './components/DesktopWorkspace'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { BookOpenCheck, Bot, Check, ChevronDown, ChevronRight, Circle, CircleAlert, Download, Heart, LoaderCircle, MousePointer2, Pause, Pencil, Play, Plus, Save, Search, Settings, Sparkles, Trash2, Upload, Volume2, WandSparkles, X } from 'lucide-react'
import AnnotatedLine from './components/AnnotatedLine'
import ComputerImportDialog from './components/ComputerImportDialog'
import ArtworkPicker from './components/ArtworkPicker'
import AndroidHome, { AndroidBottomNav } from './components/AndroidHome'
import AndroidSongLibrary from './components/AndroidSongLibrary'
import AndroidSingAlong from './components/AndroidSingAlong'
import AndroidLessonHeader, { FloatingPlaybackSpeed } from './components/AndroidLessonHeader'
import OnlineSongSearch from './components/OnlineSongSearch'
import SongDetailsEditor from './components/SongDetailsEditor'
import LyricLineEditor from './components/LyricLineEditor'
import LyricChat from './components/LyricChat'
import { applyLyricEdits, commitEditedLine } from './lib/lyricEditing'
import SettingsDialog from './components/SettingsDialog'
import { importedSongs } from './data/songs.generated'
import { demoSongs } from './data/demoSongs'
import { songArtworkBySource } from './data/songArtwork'
import twilightStation from './assets/uta-twilight-station.png'
// 安卓启动页沿用用户提供的原图，图标另使用加上「うた」背景字样的版本。
import androidLaunchPortrait from './assets/uta-launch-portrait.png'
import { annotateSongLines, explainSelectionWithAi, explainSentenceBatchWithAi, reviewSongWithAi, searchSongArtwork } from './lib/annotationApi'
import { createAndStoreLocalSong, createAndStoreLocalSongs, deleteLocalSong, loadLocalSongs, parseLrcFile, replaceLocalSongs, storeTransferredSong, updateLocalSongArtworkIfUrl, updateLocalSongMetadata } from './lib/localSongStore'
import { downloadComputerSong, mergeTransferredLearning, startComputerTransfer } from './lib/computerSongTransfer'
import { BACKUP_STORAGE_KEYS, createLearningBackup, inspectLearningBackup, songsFromLearningBackup } from './lib/learningBackup'
import { correctionKey, hasKanji } from './lib/ruby'
import { inferAudioMetadata } from './lib/audioMetadata'
import { cacheArtworkSelection } from './lib/artworkSearch'
import { isSongHeadingLine, withoutSongHeadingLines } from './lib/songMetadata'
import { annotationMatchesLine, reconcileLearningState } from './lib/learningIdentity'
import { displayReading, lineReading as getLineReading, normalizeReadingStyle, normalizeReadingFontSize, normalizeLineReadingFontSize } from './lib/readingDisplay'
import { inspectCloudBackup } from './lib/cloudBackup'
import { wrapCloudBackup,restoreCloudData } from './lib/cloudData'
import { markCloudDirty } from './lib/webDav'
import WebDavAutoSync from './components/WebDavAutoSync'
import {useAppUpdates,AppUpdatePrompt} from './components/AppUpdates'

const PROGRESS_KEY = BACKUP_STORAGE_KEYS.progress
const ANNOTATION_KEY = BACKUP_STORAGE_KEYS.annotations
const AI_REVIEW_KEY = BACKUP_STORAGE_KEYS.aiReviews
const SENTENCE_EXPLANATION_KEY = BACKUP_STORAGE_KEYS.sentenceExplanations
const LINE_PLAYBACK_LEAD_IN_SECONDS = 0.5
const SENTENCE_BATCH_SIZE = 8
// 选择“导入并生成 AI 解析”后记录待处理歌曲，应用重开时可续做未完成批次。
const PENDING_AI_IMPORT_KEY = 'uta-pending-ai-imports-v1'
// 内置歌曲和项目文件夹歌曲的封面选择保存在当前设备。
const ARTWORK_OVERRIDES_KEY = 'uta-artwork-overrides-v1'
// 学习首页的两个入口分别记住最近进入的歌曲。
const RECENT_LEARN_KEY = 'uta-recent-learn-v1'
const RECENT_SING_KEY = 'uta-recent-sing-v1'
// 手机上的导入入口增加来源选择；电脑网页仍保留原来的文件导入流程。
const IS_ANDROID_APP = Capacitor.isNativePlatform()
const IS_DESKTOP_APP = Boolean(globalThis.window?.utaDesktop)

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

function normalizeSongSearch(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '')
}

async function findArtworkWithRetry(title, artist) {
  try {
    return await searchSongArtwork(title, artist)
  } catch {
    await new Promise((resolve) => window.setTimeout(resolve, 900))
    try { return await searchSongArtwork(title, artist) } catch { return null }
  }
}

function initialSong() {
  return importedSongs.find((song) => song.title === 'Lemon') || importedSongs[0] || demoSongs[0]
}

function fallbackTokens(text) {
  return [{
    index: 0, surface: text, reading: '', base: text, ruby: '', suffix: '',
    part_of_speech: '待注音', dictionary_form: text, normalized_form: text,
    inflection_type: '待分析', inflection_form: '待分析', meaning: null, examples: [], needs_review: true, is_symbol: false,
  }]
}

function cleanSelectedText(value) {
  return value.replace(/\s+/g, '').trim().slice(0, 100)
}

function hasCachedSentenceExplanation(cache, line) {
  const entry = cache?.[line.id]
  return entry?.text === line.text && typeof entry.explanation?.meaning === 'string' && Boolean(entry.explanation.meaning.trim())
}

function SentenceAnalysis({ explanation, id }) {
  return <section className="sentence-inline-analysis" id={id} aria-label="整句解析" onClick={(event) => event.stopPropagation()}>
    <h3><Sparkles size={14} /> 整句解析</h3>
    <div className="sentence-analysis-section"><h4>整句意思</h4><p>{explanation.meaning}</p></div>
    {explanation.vocabulary?.length > 0 && <div className="sentence-analysis-section"><h4>关键表达</h4><dl>{explanation.vocabulary.map((item, index) => <div key={`${item.surface}-${index}`}><dt lang="ja">{item.surface}</dt><dd>{item.meaning}</dd></div>)}</dl></div>}
    {explanation.grammar?.length > 0 && <div className="sentence-analysis-section"><h4>语法与语境</h4><ul>{explanation.grammar.map((point, index) => <li key={`${point}-${index}`}>{point}</li>)}</ul></div>}
    {explanation.pronunciation_tip && <div className="sentence-analysis-section"><h4>发音提示</h4><p>{explanation.pronunciation_tip}</p></div>}
    <p className="sentence-analysis-footnote">AI 解析仅供学习参考；想了解具体词句，仍可在歌词中选中后单独提问。</p>
  </section>
}

function formatLrcTimestamp(seconds) {
  const milliseconds = Math.round(seconds * 1000)
  const minutes = Math.floor(milliseconds / 60000)
  const remainder = milliseconds % 60000
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(remainder / 1000)).padStart(2, '0')}.${String(remainder % 1000).padStart(3, '0')}`
}

function parseLrcTimestamp(value) {
  const match = String(value).trim().match(/^\[?(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)\]?$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export default function App() {
  // 安卓每次启动检查官方版本，只提示更新，不自动下载安装。
  const appUpdates=useAppUpdates(IS_ANDROID_APP)
  // 旧初始化只读原歌词；先应用当前设备的人工歌词，避免重开时丢失对应的读音校对。
  // [...importedSongs, ...demoSongs].map(withoutSongHeadingLines)
  const initialLearning = useMemo(() => reconcileLearningState(
    [...importedSongs, ...demoSongs].map((song) => applyLyricEdits(withoutSongHeadingLines(song), loadLocal(PROGRESS_KEY, {}).lyricEditsBySong)), {
      progress: loadLocal(PROGRESS_KEY, {}), annotations: loadLocal(ANNOTATION_KEY, {}),
      aiReviews: loadLocal(AI_REVIEW_KEY, {}), sentenceExplanations: loadLocal(SENTENCE_EXPLANATION_KEY, {}),
    },
  ), [])
  const savedProgress = initialLearning.progress
  const [learningState, setLearningState] = useState(initialLearning)
  const [activeSongId, setActiveSongId] = useState(initialSong().id)
  // 旧网页入口：useState('lesson')；安卓改为从三栏首页的“学习”页启动。
  const [desktopAudio, setDesktopAudio] = useState({ time: 0, duration: 0, playing: false })
  const [desktopVolume, setDesktopVolume] = useState(1)
  const [activePage, setActivePage] = useState(IS_ANDROID_APP ? 'mobile-learn' : 'lesson')
  const [mobileTab, setMobileTab] = useState('learn')
  // 安卓页面原先只切换组件状态，系统返回键因此直接退出；现在记录实际访问顺序。
  const androidRouteRef = useRef({ page: IS_ANDROID_APP ? 'mobile-learn' : 'lesson', tab: 'learn' })
  const androidBackStackRef = useRef([])
  const androidBackHandlerRef = useRef(() => {})
  // 三个主页面双击返回才退出；切换页面会清除上一次返回提示。
  const androidExitAttemptRef = useRef(0)
  const [androidLaunchVisible, setAndroidLaunchVisible] = useState(IS_ANDROID_APP)
  const [activeLineId, setActiveLineId] = useState(0)
  const [mode, setMode] = useState('reading')
  const [practiceActive, setPracticeActive] = useState(false)
  const [practiceRevealed, setPracticeRevealed] = useState(false)
  const [practiceScope, setPracticeScope] = useState('all')
  const [practiceSessionLineIds, setPracticeSessionLineIds] = useState([])
  const [practicePosition, setPracticePosition] = useState(0)
  const [meaningOverrides, setMeaningOverrides] = useState(savedProgress.meaningOverrides || {})
  const [playbackRate, setPlaybackRate] = useState(savedProgress.playbackRate || 1)
  const [readingStyle, setReadingStyle] = useState(() => normalizeReadingStyle(savedProgress.readingStyle))
  const [readingFontSize, setReadingFontSize] = useState(() => normalizeReadingFontSize(savedProgress.readingFontSize))
  const [lineReadingFontSize, setLineReadingFontSize] = useState(() => normalizeLineReadingFontSize(savedProgress.lineReadingFontSize))
  // 原网页端保持原字体；仅安卓 WebView 切换为用户提供的本地字体。
  useEffect(() => {
    if (!IS_ANDROID_APP) return undefined
    document.documentElement.classList.add('uta-android-font')
    return () => document.documentElement.classList.remove('uta-android-font')
  }, [])
  useEffect(() => {
    if (!IS_ANDROID_APP) return undefined
    // 等网页界面准备好后，短暂显示完整启动图和两行日文，再进入学习首页。
    const timer = window.setTimeout(() => setAndroidLaunchVisible(false), 1800)
    return () => window.clearTimeout(timer)
  }, [])
  const readingLabel = readingStyle === 'romaji' ? '罗马音' : '平假名'
  const readingLang = readingStyle === 'romaji' ? 'ja-Latn' : 'ja'
  const [localSongs, setLocalSongs] = useState([])
  const [localSongsReady, setLocalSongsReady] = useState(false)
  const [localAudioUrls, setLocalAudioUrls] = useState({})
  const [sentenceExplanationOpen, setSentenceExplanationOpen] = useState(null)
  const [sentenceExplanationJob, setSentenceExplanationJob] = useState(null)
  const [sentenceExplanationError, setSentenceExplanationError] = useState(null)
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
  const [desktopLyricSelection, setDesktopLyricSelection] = useState(null)
  const [selectedRangePlaying, setSelectedRangePlaying] = useState(false)
  // 跟唱模式不截断每句；播放位置只用于高亮当前歌词。
  const [singAlongPlaying, setSingAlongPlaying] = useState(false)
  const [singAlongLineId, setSingAlongLineId] = useState(null)
  const [audioError, setAudioError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importSource, setImportSource] = useState('phone')
  const [importLrcFile, setImportLrcFile] = useState(null)
  const [importAudioFile, setImportAudioFile] = useState(null)
  const [importAutoQuery, setImportAutoQuery] = useState('')
  const [importAudioGuess, setImportAudioGuess] = useState(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importAiProgress, setImportAiProgress] = useState(null)
  const [importAiMode, setImportAiMode] = useState('later')
  const [pendingAiRevision, setPendingAiRevision] = useState(0)
  const [importPreparing, setImportPreparing] = useState(false)
  const [importDraft, setImportDraft] = useState(null)
  const [importArtworkStatus, setImportArtworkStatus] = useState('idle')
  const [importArtwork, setImportArtwork] = useState(null)
  const [importArtworkUrl, setImportArtworkUrl] = useState('')
  const [artworkOverrides, setArtworkOverrides] = useState(() => loadLocal(ARTWORK_OVERRIDES_KEY, {}))
  const [editingArtworkSong, setEditingArtworkSong] = useState(null)
  const [editingDetailsSong, setEditingDetailsSong] = useState(null)
  const [editingDetailsBusy, setEditingDetailsBusy] = useState(false)
  const [lyricEditMenu, setLyricEditMenu] = useState(null)
  const [editingLyric, setEditingLyric] = useState(null)
  const [lyricEditSaving, setLyricEditSaving] = useState(false)
  const lyricPressRef = useRef(null)
  const lyricPressSuppressionRef = useRef(0)
  const [recentLearnId, setRecentLearnId] = useState(() => localStorage.getItem(RECENT_LEARN_KEY) || '')
  const [recentSingId, setRecentSingId] = useState(() => localStorage.getItem(RECENT_SING_KEY) || '')
  const [editingArtworkChoice, setEditingArtworkChoice] = useState(null)
  const [artworkEditBusy, setArtworkEditBusy] = useState(false)
  const [artworkEditSaving, setArtworkEditSaving] = useState(false)
  const [artworkEditError, setArtworkEditError] = useState('')
  const [importError, setImportError] = useState('')
  const [librarySearch, setLibrarySearch] = useState('')
  const [songPickerOpen, setSongPickerOpen] = useState(false)
  const [songPickerSearch, setSongPickerSearch] = useState('')
  const [deletingSongId, setDeletingSongId] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [backupBusy, setBackupBusy] = useState('')
  const [backupPreview, setBackupPreview] = useState(null)
  const [backupError, setBackupError] = useState('')
  const [computerShare, setComputerShare] = useState(null)
  const [toast, setToast] = useState('')
  const dragSelectionRef = useRef(null)
  const suppressNextTokenClick = useRef(false)
  const audioRef = useRef(null)
  const desktopSelectionAnchorRef = useRef(null)
  const selectedRangePlaybackRef = useRef(null)
  const selectedRangeEndTimerRef = useRef(null)
  const clipEndRef = useRef(null)
  const pendingClipRef = useRef(null)
  const continuousPlaybackRef = useRef(false)
  const pendingContinuousRef = useRef(null)
  const continuousLineIdRef = useRef(null)
  const localAudioUrlRef = useRef({})
  const artworkLookupRef = useRef(new Set())
  const artworkMigrationRef = useRef(new Set())
  const importPreviewRequestRef = useRef(0)
  const importAudioRequestRef = useRef(0)
  const importArtworkRequestRef = useRef(0)
  const sentenceExplanationJobRef = useRef(null)
  const attemptedBackgroundAiRef = useRef(new Set())
  const cancelledAiSongsRef = useRef(new Set())

  useEffect(() => {
    if (!IS_ANDROID_APP) return undefined
    let cancelled = false
    let listener
    CapacitorApp.addListener('backButton', () => androidBackHandlerRef.current())
      .then((handle) => { if (cancelled) handle.remove(); else listener = handle })
      .catch((error) => console.error('安卓返回键监听失败', error))
    return () => { cancelled = true; listener?.remove() }
  }, [])

  function navigateAndroid(page, tab) {
    const current = androidRouteRef.current
    if (current.page === page && current.tab === tab) return
    androidExitAttemptRef.current = 0
    if (toast === '再次返回后退出') setToast('')
    // 旧逻辑：切换底栏主页面也入栈，导致从“我的”返回到“复习”等历史主页面。
    // androidBackStackRef.current.push(current)
    if (page.startsWith('mobile-')) androidBackStackRef.current = []
    else androidBackStackRef.current.push(current)
    androidRouteRef.current = { page, tab }
    setMobileTab(tab)
    setActivePage(page)
  }

  function goBackAndroid() {
    // 封面选歌作为当前练习页的弹层，系统返回只关闭选歌页。
    if (songPickerOpen) { setSongPickerOpen(false); return }
    // 歌词长按菜单与编辑窗口先关闭，再返回所属页面。
    if (editingLyric) { if (!lyricEditSaving) setEditingLyric(null); return }
    if (lyricEditMenu) { setLyricEditMenu(null); return }
    // 子组件中的歌曲操作菜单先消失，再处理上层弹窗和页面。
    const menuBack = new Event('uta:navigate-back', { cancelable: true })
    window.dispatchEvent(menuBack)
    if (menuBack.defaultPrevented) { androidExitAttemptRef.current = 0; return }
    // 弹窗关闭也算一次正常返回，不能沿用主页面之前的退出倒计时。
    if (backupPreview || editingDetailsSong || editingArtworkSong || importOpen || settingsOpen || detailOpen || sentenceExplanationOpen) androidExitAttemptRef.current = 0
    if (backupPreview) { if (backupBusy !== 'restore') { setBackupPreview(null); setBackupError('') } return }
    if (editingDetailsSong) { if (!editingDetailsBusy) setEditingDetailsSong(null); return }
    if (editingArtworkSong) { if (!artworkEditSaving) setEditingArtworkSong(null); return }
    if (importOpen) {
      if (importBusy) return
      if (importSource !== null) setImportSource(null)
      else closeImportDialog()
      return
    }
    if (settingsOpen) { setSettingsOpen(false); return }
    if (detailOpen) { closeDetail(); return }
    if (sentenceExplanationOpen) { setSentenceExplanationOpen(null); return }
    // 旧逻辑：练习卡片展开时只收起卡片，返回键未离开逐句学习页。
    // if (practiceActive) { exitPractice(); return }
    if (practiceActive) exitPractice()
    const current = androidRouteRef.current
    if (current.page.startsWith('mobile-')) {
      const now = Date.now()
      if (now - androidExitAttemptRef.current <= 2000) {
        androidExitAttemptRef.current = 0
        CapacitorApp.exitApp()
      } else {
        androidExitAttemptRef.current = now
        setToast('再次返回后退出')
      }
      return
    }
    androidExitAttemptRef.current = 0
    const previous = androidBackStackRef.current.pop()
    if (previous) {
      stopLinePlayback()
      androidRouteRef.current = previous
      setActivePage(previous.page)
      setMobileTab(previous.tab)
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      return
    }
    // 旧逻辑：没有历史页面时直接最小化应用。
    // CapacitorApp.minimizeApp()
    // 恢复异常页面栈时仍按所属底栏返回主页面，不直接退出。
    stopLinePlayback()
    const fallback = { page: `mobile-${current.tab}`, tab: current.tab }
    androidRouteRef.current = fallback
    setActivePage(fallback.page)
    setMobileTab(fallback.tab)
  }
  androidBackHandlerRef.current = goBackAndroid

  // 旧列表只读取原歌词；项目内歌曲也可保留本设备的人工单句修改。
  // [...importedSongs, ...localSongs, ...demoSongs].map(withoutSongHeadingLines)
  const allSongs = useMemo(() => [...importedSongs, ...localSongs, ...demoSongs].map((song) => applyLyricEdits(withoutSongHeadingLines(song), learningState.progress.lyricEditsBySong)).filter((song) => song.lines.length), [localSongs, importedSongs, learningState.progress.lyricEditsBySong])
  // Reconcile before rendering and before every write, including after Vite
  // reloads generated lyrics or browser-local songs finish loading.
  const learning = useMemo(() => reconcileLearningState(allSongs, learningState), [allSongs, learningState])
  const { learnedBySong, reviewItems, favoriteSongIds, corrections, lyricSnapshots, lyricEditsBySong } = learning.progress
  const { annotations: annotationsBySong, aiReviews, sentenceExplanations: sentenceExplanationsBySong } = learning
  function updateLearningMap(key, update, inProgress = false) {
    setLearningState((previous) => {
      const next = reconcileLearningState(allSongs, previous)
      const container = inProgress ? next.progress : next
      container[key] = typeof update === 'function' ? update(container[key]) : update
      return next
    })
  }
  const setLearnedBySong = (update) => updateLearningMap('learnedBySong', update, true)
  const setReviewItems = (update) => updateLearningMap('reviewItems', update, true)
  const setFavoriteSongIds = (update) => updateLearningMap('favoriteSongIds', update, true)
  const setCorrections = (update) => updateLearningMap('corrections', update, true)
  const setAnnotationsBySong = (update) => updateLearningMap('annotations', update)
  const setAiReviews = (update) => updateLearningMap('aiReviews', update)
  const setSentenceExplanationsBySong = (update) => updateLearningMap('sentenceExplanations', update)
  const visibleLibrarySongs = useMemo(() => {
    const query = normalizeSongSearch(librarySearch)
    if (!query) return allSongs
    return allSongs.filter((song) => normalizeSongSearch(`${song.title}${song.artist}`).includes(query))
  }, [allSongs, librarySearch])
  // 旧实现直接展示全部歌曲；安卓歌曲库按需求隐藏内置原创示例，学习数据仍保留。
  const androidLibrarySongs = useMemo(() => visibleLibrarySongs.filter((song) => !song.isDemo), [visibleLibrarySongs])
  const androidLibraryTotal = useMemo(() => allSongs.filter((song) => !song.isDemo).length, [allSongs])
  const reviewQueue = useMemo(() => reviewItems.flatMap((item) => {
    const song = allSongs.find((candidate) => candidate.id === item.songId)
    const line = song?.lines.find((candidate) => candidate.id === item.lineId)
    return song && line ? [{ song, line }] : []
  }), [allSongs, reviewItems])
  const activeSong = allSongs.find((song) => song.id === activeSongId) || initialSong()
  function artworkForSong(song) {
    if (!song) return null
    const chosen = Object.hasOwn(artworkOverrides, song.id) ? artworkOverrides[song.id] : song
    return chosen.artworkChoice === 'default' ? null : chosen.artworkUrl ? { artworkUrl: chosen.artworkUrl } : songArtworkBySource[song.sourceFile] || null
  }
  const recentLearnSong = allSongs.find((song) => song.id === recentLearnId)
  const recentSingSong = allSongs.find((song) => song.id === recentSingId)
  // 进入模式或在模式内换歌时更新最近学习记录。
  useEffect(() => {
    if (!IS_ANDROID_APP || !allSongs.some((song) => song.id === activeSong.id)) return
    if (activePage === 'lesson' && mobileTab === 'learn') {
      setRecentLearnId(activeSong.id)
      localStorage.setItem(RECENT_LEARN_KEY, activeSong.id)
    } else if (activePage === 'sing-along') {
      setRecentSingId(activeSong.id)
      localStorage.setItem(RECENT_SING_KEY, activeSong.id)
    }
  }, [activePage, activeSong.id, mobileTab])
  const audioUrl = activeSong.isLocal
    ? localAudioUrls[activeSong.id] || ''
    : activeSong.audioFile
    ? `${import.meta.env.BASE_URL}${activeSong.audioFile.split('/').map((part) => encodeURIComponent(part)).join('/')}`
    : ''
  const activeLine = activeSong.lines.find((line) => line.id === activeLineId) || activeSong.lines[0]
  const annotations = useMemo(() => annotationsBySong[activeSong.id]?.filter((annotation) =>
    activeSong.lines.some((line) => annotationMatchesLine(annotation, line))), [annotationsBySong, activeSong])
  const activeAnnotation = annotations?.find((line) => line.id === activeLine.id)
  const desktopLyricRange = useMemo(() => desktopLyricSelection?.songId === activeSong.id
    ? lyricRangeBounds(activeSong.lines, desktopLyricSelection.anchorId, desktopLyricSelection.focusId, desktopAudio.duration) : null,
  [desktopLyricSelection, activeSong.id, activeSong.lines, desktopAudio.duration])
  const desktopSelectedLineIds = useMemo(() => new Set(desktopLyricRange?.lineIds || []), [desktopLyricRange])
  const activeLineReading = getLineReading(activeAnnotation?.tokens, corrections, activeSong.id, activeLine.id, readingStyle)
  const activeTokens = useMemo(
    () => activeAnnotation?.tokens || fallbackTokens(activeLine.text),
    [activeAnnotation, activeLine.text],
  )
  const lexicalActiveTokens = activeTokens.filter((token) => !token.is_symbol)
  const focusToken = lexicalActiveTokens.find((token) => token.index === selectedTokenIndex)
    || lexicalActiveTokens.find((token) => hasKanji(token.surface)) || lexicalActiveTokens[0] || activeTokens[0]
  const focusKey = correctionKey(activeSong.id, activeLine.id, focusToken.index)
  const focusReading = corrections[focusKey] || focusToken.reading
  const focusDisplayReading = displayReading(focusReading, readingStyle, focusToken, Boolean(corrections[focusKey]))
  const meaningKey = `${focusToken.dictionary_form || focusToken.surface}:${focusToken.reading}`
  const wordMeaning = meaningOverrides[meaningKey] || focusToken.meaning || ''
  const learnedLines = new Set((learnedBySong[activeSong.id] || []).filter((lineId) => activeSong.lines.some((line) => line.id === lineId)))
  const progress = activeSong.lines.length ? Math.round((learnedLines.size / activeSong.lines.length) * 100) : 0
  const isFavorite = favoriteSongIds.includes(activeSong.id)
  const hasReview = reviewItems.some((item) => item.songId === activeSong.id && item.lineId === activeLine.id)
  const currentSongReviewCount = reviewQueue.filter((item) => item.song.id === activeSong.id).length
  const practiceFinished = practiceActive && practiceSessionLineIds.length > 0 && practicePosition >= practiceSessionLineIds.length
  const totalCorrections = Object.keys(corrections).filter((key) => key.startsWith(`${activeSong.id}:`)).length
  const reviewNeeded = annotations?.filter((line) => activeSong.lines.some((lyric) => lyric.id === line.id)).flatMap((line) => line.tokens).filter((token) => token.needs_review).length || 0
  const aiReview = aiReviews[activeSong.id]
  const pendingAiSuggestions = (aiReview?.suggestions || []).filter((suggestion) => activeSong.lines.some((line) => line.id === suggestion.line_id) && !corrections[correctionKey(activeSong.id, suggestion.line_id, suggestion.token_index)])
  const focusSuggestion = pendingAiSuggestions.find((item) => item.line_id === activeLine.id && item.token_index === focusToken.index)
  const currentSentenceCache = sentenceExplanationsBySong[activeSong.id] || {}
  const readySentenceCount = activeSong.lines.filter((line) => hasCachedSentenceExplanation(currentSentenceCache, line)).length

  useEffect(() => {
    // 人工单句歌词随学习进度保存。
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ learnedBySong, reviewItems, favoriteSongIds, corrections, meaningOverrides, playbackRate, lyricSnapshots, readingStyle, readingFontSize, lineReadingFontSize, lyricEditsBySong }))
  }, [learnedBySong, reviewItems, favoriteSongIds, corrections, meaningOverrides, playbackRate, lyricSnapshots, readingStyle, readingFontSize, lineReadingFontSize, lyricEditsBySong])

  useEffect(() => { localStorage.setItem(ANNOTATION_KEY, JSON.stringify(annotationsBySong)) }, [annotationsBySong])
  useEffect(() => { localStorage.setItem(AI_REVIEW_KEY, JSON.stringify(aiReviews)) }, [aiReviews])
  useEffect(() => { localStorage.setItem(SENTENCE_EXPLANATION_KEY, JSON.stringify(sentenceExplanationsBySong)) }, [sentenceExplanationsBySong])
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
        setLocalSongsReady(true)
      })
      .catch(() => { setLocalSongsReady(true); /* 本地歌曲读取失败时仍可显示其他页面。 */ })
    return () => { disposed = true }
  }, [])
  useEffect(() => {
    if (!localSongsReady || sentenceExplanationJobRef.current) return
    const stored = loadLocal(PENDING_AI_IMPORT_KEY, [])
    const pending = Array.isArray(stored) ? stored : []
    const song = localSongs.find((item) => pending.includes(item.id) && !attemptedBackgroundAiRef.current.has(item.id))
    if (!song) return
    attemptedBackgroundAiRef.current.add(song.id)
    // AI 请求在页面可继续使用时逐批处理；中断的任务保留，下次打开应用续做。
    void generateSentenceExplanations(song).then((result) => {
      if (result.complete) {
        const latest = loadLocal(PENDING_AI_IMPORT_KEY, [])
        localStorage.setItem(PENDING_AI_IMPORT_KEY, JSON.stringify((Array.isArray(latest) ? latest : []).filter((id) => id !== song.id)))
        setToast(`《${song.title}》的 AI 解析已生成完成。`)
      } else setToast(`《${song.title}》已导入，AI 解析完成 ${result.ready} / ${song.lines.length} 句；稍后可继续。`)
    }).catch((error) => setSentenceExplanationError({ songId: song.id, message: error instanceof Error ? error.message : 'AI 解析暂时不可用。' }))
      .finally(() => setPendingAiRevision((value) => value + 1))
  }, [localSongsReady, localSongs, pendingAiRevision])
  useEffect(() => () => {
    Object.values(localAudioUrlRef.current).forEach((url) => URL.revokeObjectURL(url))
  }, [])
  useEffect(() => {
    if (!localSongsReady) return
    // 旧版已保存的在线 URL 在联网时迁移到本机，断网后即可从 IndexedDB 读取。
    localSongs.filter((song) => song.isLocal && /^https:\/\//iu.test(song.artworkUrl || '')).forEach((song) => {
      const key = `${song.id}:${song.artworkUrl}`
      if (artworkMigrationRef.current.has(key)) return
      artworkMigrationRef.current.add(key)
      void cacheArtworkSelection(song).then(async (cached) => {
        const changed = await updateLocalSongArtworkIfUrl(song.id, song.artworkUrl, { artworkUrl: cached.artworkUrl, artworkChoice: song.artworkChoice || 'selected' })
        if (changed) setLocalSongs((previous) => previous.map((item) => item.id === song.id && item.artworkUrl === song.artworkUrl ? { ...item, artworkUrl: cached.artworkUrl, artworkChoice: song.artworkChoice || 'selected' } : item))
      }).catch(() => { /* 本次网络不可用时保留原封面链接，下次打开再尝试迁移。 */ })
    })
    Object.entries(artworkOverrides).filter(([, choice]) => /^https:\/\//iu.test(choice?.artworkUrl || '')).forEach(([songId, choice]) => {
      const key = `override:${songId}:${choice.artworkUrl}`
      if (artworkMigrationRef.current.has(key)) return
      artworkMigrationRef.current.add(key)
      void cacheArtworkSelection(choice).then((cached) => {
        const latest = loadLocal(ARTWORK_OVERRIDES_KEY, {})
        if (latest[songId]?.artworkUrl !== choice.artworkUrl) return
        const next = { ...latest, [songId]: { ...latest[songId], artworkUrl: cached.artworkUrl } }
        localStorage.setItem(ARTWORK_OVERRIDES_KEY, JSON.stringify(next))
        setArtworkOverrides(next)
      }).catch(() => { /* 离线或来源失效时保留原选择，下次启动再试。 */ })
    })
  }, [localSongsReady, localSongs, artworkOverrides])
  useEffect(() => {
    // 用户明确选择默认封面后，不再被旧版的后台自动查找覆盖。
    const missingArtwork = localSongs.filter((song) => song.isLocal && !song.artworkUrl && !song.artworkChoice && song.title && !artworkLookupRef.current.has(song.id))
    missingArtwork.forEach((song) => {
      artworkLookupRef.current.add(song.id)
      findArtworkWithRetry(song.title, song.artist)
        .then(async (artwork) => {
          if (!artwork) return
          const cached = await cacheArtworkSelection(artwork)
          const changed = await updateLocalSongArtworkIfUrl(song.id, '', { ...cached, artworkChoice: 'auto' })
          if (changed) setLocalSongs((previous) => previous.map((item) => item.id === song.id && !item.artworkUrl ? { ...item, ...cached, artworkChoice: 'auto' } : item))
        })
        .catch(() => { /* The fallback card remains usable if online lookup fails. */ })
    })
  }, [localSongs])
  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const cached = (annotationsBySong[activeSong.id] || []).filter((annotation) => activeSong.lines.some((line) => annotationMatchesLine(annotation, line)))
    const missing = activeSong.lines.filter((line) => !cached.some((annotation) => annotationMatchesLine(annotation, line)))
    if (!missing.length) { setAnnotating(false); return undefined }
    let abandoned = false
    setAnnotating(true)
    setAnnotationError('')
    annotateSongLines(missing)
      .then((annotation) => {
        if (!missing.every((line) => annotation.some((item) => annotationMatchesLine(item, line)))) throw new Error('注音与歌词内容不匹配')
        if (!abandoned) setAnnotationsBySong((all) => ({ ...all, [activeSong.id]: [
          ...cached, ...annotation.map((item) => ({ ...item, text: missing.find((line) => line.id === item.id)?.text })),
        ] }))
      })
      .catch(() => {
        // 手机注音使用 APK 内词典，错误提示应指向本地资源而非电脑后端。
        if (!abandoned) setAnnotationError(Capacitor.isNativePlatform()
          ? '离线注音词典加载失败，请重新打开应用或重新安装最新版。'
          : '自动注音服务未连接。请使用 npm.cmd run dev 启动完整学习环境。')
      })
      .finally(() => { if (!abandoned) setAnnotating(false) })
    return () => { abandoned = true }
  }, [activeSong.id, activeSong.lines, annotationsBySong[activeSong.id]])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    clipEndRef.current = null
    pendingClipRef.current = null
    continuousPlaybackRef.current = false
    pendingContinuousRef.current = null
    continuousLineIdRef.current = null
    setPlayingLineId(null)
    setSingAlongPlaying(false)
    setSingAlongLineId(null)
    setAudioError('')
  }, [activeSong.id])

  useEffect(() => {
    if (!IS_DESKTOP_APP) return
    setDesktopLyricSelection(null)
    desktopSelectionAnchorRef.current = null
    if (selectedRangePlaybackRef.current) stopLinePlayback()
  }, [activeSong.id, activeSong.lines, practiceActive])

  useEffect(() => () => clearSelectedRangeEndTimer(), [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    const finishOnWindow = () => finishTokenSelection()
    window.addEventListener('pointerup', finishOnWindow)
    return () => window.removeEventListener('pointerup', finishOnWindow)
  }, [activeSong.id, annotations])

  useEffect(() => {
    const firstToken = activeTokens.find((token) => !token.is_symbol && hasKanji(token.surface))
      || activeTokens.find((token) => !token.is_symbol) || activeTokens[0]
    if (firstToken) setSelectedTokenIndex(firstToken.index)
  }, [activeSong.id, activeLine.id, activeTokens])

  useEffect(() => { setDraftReading(focusReading) }, [focusKey, focusReading])
  useEffect(() => { setDraftMeaning(wordMeaning) }, [meaningKey, wordMeaning])

  function stopLinePlayback() {
    clearSelectedRangePlayback()
    audioRef.current?.pause()
    clipEndRef.current = null
    pendingClipRef.current = null
    continuousPlaybackRef.current = false
    pendingContinuousRef.current = null
    continuousLineIdRef.current = null
    setPlayingLineId(null)
    setSingAlongPlaying(false)
    setSingAlongLineId(null)
  }

  function chooseSong(songId) {
    stopLinePlayback()
    setActiveSongId(songId)
    setActiveLineId(0)
    setPracticeActive(false)
    setPracticeRevealed(false)
    setSelectedText(null)
    dragSelectionRef.current = null
    setDragSelection(null)
    setSelectedPhraseRange(null)
    setAiExplanation(null)
    setAiError('')
    setSentenceExplanationOpen(null)
    setSentenceExplanationError(null)
    setToast('已切换歌词，正在准备自动读音。')
  }

  function clearDesktopLyricSelection() {
    if (selectedRangePlaybackRef.current || pendingClipRef.current?.kind === 'selected-range') stopLinePlayback()
    setDesktopLyricSelection(null)
  }

  function chooseLine(lineId) {
    if (IS_DESKTOP_APP) {
      clearDesktopLyricSelection()
      desktopSelectionAnchorRef.current = lineId
    }
    setActiveLineId(lineId)
  }

  function selectDesktopLyricRange(lineId) {
    if (selectedRangePlaybackRef.current || pendingClipRef.current?.kind === 'selected-range') stopLinePlayback()
    const anchorId = desktopLyricSelection?.songId === activeSong.id ? desktopLyricSelection.anchorId
      : desktopSelectionAnchorRef.current ?? activeLine.id
    setDesktopLyricSelection({ songId: activeSong.id, anchorId, focusId: lineId })
    setActiveLineId(lineId)
    dragSelectionRef.current = null
    setDragSelection(null)
    setSelectedText(null)
    setSelectedPhraseRange(null)
  }

  function isDesktopRangeClick(event) {
    return IS_DESKTOP_APP && event.ctrlKey && !event.target.closest('.line-actions, .sentence-inline-analysis, .phrase-explain-button')
  }

  function handleLyricPointerDown(event, lineId) {
    if (event.button === 0 && isDesktopRangeClick(event)) { event.preventDefault(); event.stopPropagation(); return }
    beginLyricPress(event, lineId)
  }

  function handleLyricClickCapture(event, lineId) {
    if (isDesktopRangeClick(event)) {
      event.preventDefault(); event.stopPropagation(); selectDesktopLyricRange(lineId); return
    }
    suppressLyricPressClick(event)
  }

  // 长按覆盖整句区域，移动超过阈值时取消，保证正常上下滚动。
  function cancelLyricPress() {
    if (lyricPressRef.current) window.clearTimeout(lyricPressRef.current.timer)
    lyricPressRef.current = null
  }
  useEffect(() => { cancelLyricPress(); return cancelLyricPress }, [activePage, activeSong.id])
  function beginLyricPress(event, lineId) {
    if (!IS_ANDROID_APP || event.button !== 0 || event.target.closest('.line-actions, .sentence-inline-analysis')) return
    cancelLyricPress()
    lyricPressSuppressionRef.current = 0
    const press = { x: event.clientX, y: event.clientY }
    press.timer = window.setTimeout(() => {
      lyricPressSuppressionRef.current = Date.now() + 1000
      dragSelectionRef.current = null
      setDragSelection(null)
      setSelectedText(null)
      setSelectedPhraseRange(null)
      stopLinePlayback()
      setLyricEditMenu({ songId: activeSong.id, lineId })
    }, 550)
    lyricPressRef.current = press
  }
  function moveLyricPress(event) {
    const press = lyricPressRef.current
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) cancelLyricPress()
  }
  function suppressLyricPressClick(event) {
    if (Date.now() < lyricPressSuppressionRef.current) { event.preventDefault(); event.stopPropagation() }
  }
  async function saveEditedLyric({ annotation, readings }) {
    const target = editingLyric
    const song = allSongs.find((item) => item.id === target?.songId)
    if (!song) throw new Error('找不到当前歌曲。')
    if (sentenceExplanationJobRef.current === song.id) throw new Error('这首歌正在生成解析，请稍后再编辑。')
    const editedLines = song.lines.map((line) => line.id === target.lineId ? { ...line, text: annotation.text } : line)
    setLyricEditSaving(true)
    try {
      if (song.isLocal) {
        const updated = await updateLocalSongMetadata(song.id, { lines: editedLines })
        if (!updated) throw new Error('歌词保存失败，请重试。')
        const { audioBlob, ...visibleSong } = updated
        setLocalSongs((previous) => previous.map((item) => item.id === song.id ? visibleSong : item))
      }
      setLearningState((previous) => commitEditedLine(allSongs, previous, song.id, target.lineId, annotation, readings).state)
      setEditingLyric(null)
      setSentenceExplanationOpen(null)
      setSelectedTokenIndex(0)
      setToast('这一句的歌词与读音已保存。')
    } finally { setLyricEditSaving(false) }
  }

  // 手机端整句都是播放热区；电脑端继续使用原来的“点击选中句子”行为。
  function isMobileLyricPlayback() {
    return IS_ANDROID_APP || window.matchMedia('(max-width: 650px)').matches
  }

  function handleLyricRowClick(event, lineId) {
    // 原逻辑：onClick={() => chooseLine(line.id)}，现保留给电脑端。
    if (event.target.closest('button, a, input, select, textarea, .sentence-inline-analysis')) return
    chooseLine(lineId)
    if (isMobileLyricPlayback()) playLine(lineId)
  }

  function startPractice(scope = 'all', songId = activeSong.id, targetLineId = null) {
    const song = allSongs.find((item) => item.id === songId)
    if (!song) return
    const lineIds = song.lines
      .filter((line) => scope === 'all' || reviewItems.some((item) => item.songId === songId && item.lineId === line.id))
      .map((line) => line.id)
    if (!lineIds.length) {
      setToast('这首歌还没有待复习的句子。')
      return
    }
    stopLinePlayback()
    if (songId !== activeSong.id) chooseSong(songId)
    const position = Math.max(0, lineIds.indexOf(targetLineId))
    // 从复习清单进入练习时，底栏仍标记“复习”。
    // 旧实现分别更新 tab 与页面；安卓改为一次入栈，系统返回可回到练习来源。
    if (IS_ANDROID_APP) navigateAndroid('lesson', scope === 'review' ? 'review' : 'learn')
    else setActivePage('lesson')
    setPracticeScope(scope)
    setPracticeSessionLineIds(lineIds)
    setPracticePosition(position)
    setActiveLineId(lineIds[position])
    setPracticeRevealed(false)
    setSentenceExplanationOpen(null)
    setPracticeActive(true)
    window.requestAnimationFrame(() => document.getElementById('guided-practice')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function goToPracticePosition(position) {
    const lineId = practiceSessionLineIds[position]
    if (lineId == null) return
    stopLinePlayback()
    setPracticePosition(position)
    setActiveLineId(lineId)
    setPracticeRevealed(false)
    setSentenceExplanationOpen(null)
  }

  function gradePracticeLine(learned) {
    if (!practiceRevealed || practiceFinished) return
    const lineId = practiceSessionLineIds[practicePosition]
    const line = activeSong.lines.find((item) => item.id === lineId)
    if (!line) return
    setLearnedBySong((previous) => {
      const next = new Set(previous[activeSong.id] || [])
      if (learned) next.add(lineId)
      else next.delete(lineId)
      return { ...previous, [activeSong.id]: [...next] }
    })
    setReviewItems((previous) => {
      const remaining = previous.filter((item) => !(item.songId === activeSong.id && item.lineId === lineId))
      return learned ? remaining : [...remaining, { songId: activeSong.id, lineId, text: line.text }]
    })
    if (practicePosition + 1 < practiceSessionLineIds.length) {
      goToPracticePosition(practicePosition + 1)
      setToast(learned ? '已标记掌握，继续下一句。' : '已加入复习清单，继续下一句。')
    } else {
      stopLinePlayback()
      setPracticePosition(practiceSessionLineIds.length)
      setPracticeRevealed(false)
      setToast(learned ? '本轮练习完成。' : '本轮练习完成，错句已加入复习清单。')
    }
  }

  function exitPractice() {
    stopLinePlayback()
    setPracticeActive(false)
    setPracticeRevealed(false)
  }

  function chooseSongFromLibrary(songId) {
    chooseSong(songId)
    // 从歌曲库进入歌曲详情后，返回键要回到歌曲库。
    if (IS_ANDROID_APP) navigateAndroid('lesson', 'learn')
    else setActivePage('lesson')
    window.requestAnimationFrame(() => {
      document.getElementById('lesson')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  // 安卓底栏始终切换到三个顶层页面；原学习、复习和歌曲库在入口内打开。
  function showMobileTab(tab) {
    stopLinePlayback()
    navigateAndroid(`mobile-${tab}`, tab)
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }

  function showSingAlong() {
    exitPractice()
    if (recentSingSong && recentSingSong.id !== activeSong.id) chooseSong(recentSingSong.id)
    navigateAndroid('sing-along', 'learn')
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }

  function openStudySongPicker() {
    stopLinePlayback()
    setSongPickerSearch('')
    setSongPickerOpen(true)
  }

  function showLessonPage() {
    if (IS_ANDROID_APP) { showMobileTab('learn'); return }
    setActivePage('lesson')
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  function showReviewQueue() {
    if (IS_DESKTOP_APP) { setActivePage('review-list'); return }
    if (IS_ANDROID_APP) {
      navigateAndroid('review-list', 'review')
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      return
    }
    setActivePage('lesson')
    window.requestAnimationFrame(() => document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function showLibraryPage({ focusSearch = false } = {}) {
    if (IS_ANDROID_APP) navigateAndroid('library', 'mine')
    else setActivePage('library')
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      if (focusSearch) window.setTimeout(() => document.getElementById('library-search')?.focus(), 100)
    })
  }

  function openImportDialog() {
    setImportError('')
    setImportAiMode('later')
    // 手机先让用户决定从手机文件还是电脑网页导入。
    setImportSource(IS_ANDROID_APP ? null : 'phone')
    setImportOpen(true)
  }

  function closeImportDialog() {
    if (importBusy) return
    importPreviewRequestRef.current += 1
    importAudioRequestRef.current += 1
    importArtworkRequestRef.current += 1
    setImportOpen(false)
    setImportSource('phone')
    setImportLrcFile(null)
    setImportAudioFile(null)
    setImportAutoQuery('')
    setImportAudioGuess(null)
    setImportDraft(null)
    setImportPreparing(false)
    setImportArtworkStatus('idle')
    setImportArtwork(null)
    setImportArtworkUrl('')
    setImportAiMode('later')
    setImportError('')
  }

  async function searchImportArtwork(title, artist) {
    const requestId = ++importArtworkRequestRef.current
    if (!title.trim()) {
      setImportArtworkStatus('idle')
      return
    }
    setImportArtworkStatus('loading')
    setImportArtwork(null)
    setImportArtworkUrl('')
    const artwork = await findArtworkWithRetry(title.trim(), artist.trim())
    if (requestId !== importArtworkRequestRef.current) return
    setImportArtwork(artwork)
    setImportArtworkUrl(artwork?.artworkUrl || '')
    setImportArtworkStatus(artwork ? 'found' : 'none')
  }

  async function prepareLrcPreview(file) {
    const requestId = ++importPreviewRequestRef.current
    importArtworkRequestRef.current += 1
    setImportLrcFile(file)
    setImportDraft(null)
    setImportArtwork(null)
    setImportArtworkUrl('')
    setImportArtworkStatus('idle')
    setImportError('')
    if (!file) { setImportPreparing(false); return }
    setImportPreparing(true)
    try {
      const parsed = await parseLrcFile(file)
      if (requestId !== importPreviewRequestRef.current) return
      setImportDraft({
        ...parsed,
        lines: parsed.lines.map((line) => ({ ...line, draftId: `parsed-${line.id}`, timeText: formatLrcTimestamp(line.start) })),
      })
      setImportPreparing(false)
      // 旧版自动选 Apple Music 首张封面；现在由选择器展示多来源结果，用户亲自确认。
      // void searchImportArtwork(parsed.title, parsed.artist)
    } catch (error) {
      if (requestId !== importPreviewRequestRef.current) return
      setImportError(error instanceof Error ? error.message : '无法解析这份 LRC 歌词。')
      setImportPreparing(false)
    }
  }

  function updateImportMetadata(field, value) {
    setImportDraft((previous) => previous ? { ...previous, [field]: value } : previous)
    if (importArtworkStatus !== 'manual' && importArtworkStatus !== 'default') {
      importArtworkRequestRef.current += 1
      setImportArtwork(null)
      setImportArtworkUrl('')
      setImportArtworkStatus('idle')
    }
  }

  function updateImportLine(draftId, field, value) {
    setImportDraft((previous) => previous ? {
      ...previous,
      lines: previous.lines.map((line) => line.draftId === draftId ? { ...line, [field]: value } : line),
    } : previous)
  }

  function addImportLine() {
    setImportDraft((previous) => {
      if (!previous) return previous
      const lastLine = previous.lines.at(-1)
      const lastStart = parseLrcTimestamp(lastLine?.timeText) ?? 0
      return {
        ...previous,
        lines: [...previous.lines, {
          draftId: globalThis.crypto?.randomUUID?.() || `new-${Date.now()}`,
          timeText: formatLrcTimestamp(lastStart + 5), text: '', translation: '',
        }],
      }
    })
  }

  function removeImportLine(draftId) {
    setImportDraft((previous) => previous ? { ...previous, lines: previous.lines.filter((line) => line.draftId !== draftId) } : previous)
  }

  function useDefaultImportArtwork() {
    importArtworkRequestRef.current += 1
    setImportArtwork(null)
    setImportArtworkUrl('')
    setImportArtworkStatus('default')
  }

  function changeImportArtworkUrl(value) {
    importArtworkRequestRef.current += 1
    setImportArtwork(null)
    setImportArtworkUrl(value)
    setImportArtworkStatus(value.trim() ? 'manual' : 'idle')
  }

  function focusLibrarySearch() {
    showLibraryPage({ focusSearch: true })
  }

  async function generateSentenceExplanations(song, requestedLines = song.lines, onProgress) {
    const cache = { ...(sentenceExplanationsBySong[song.id] || {}) }
    const pending = requestedLines.filter((line) => !hasCachedSentenceExplanation(cache, line))
    const countReady = () => song.lines.filter((line) => hasCachedSentenceExplanation(cache, line)).length
    if (!pending.length) return { cache, complete: true, ready: countReady(), error: '' }
    if (sentenceExplanationJobRef.current) {
      return { cache, complete: false, ready: countReady(), error: '已有一首歌曲正在生成解析，请稍后重试。' }
    }
    sentenceExplanationJobRef.current = song.id
    setSentenceExplanationError(null)
    setSentenceExplanationJob({ songId: song.id, ready: countReady(), total: song.lines.length })
    onProgress?.(countReady(), song.lines.length)
    let failure = ''
    try {
      for (let offset = 0; offset < pending.length; offset += SENTENCE_BATCH_SIZE) {
        if (cancelledAiSongsRef.current.has(song.id)) return { cache, complete: false, ready: countReady(), error: '歌曲已删除，解析已停止。' }
        const batch = pending.slice(offset, offset + SENTENCE_BATCH_SIZE)
        const contextLines = batch.map((line) => {
          const index = song.lines.findIndex((item) => item.id === line.id)
          return {
            id: line.id, text: line.text, translation: line.translation || '',
            previous_line: song.lines[index - 1]?.text || '',
            next_line: song.lines[index + 1]?.text || '',
          }
        })
        try {
          const result = await explainSentenceBatchWithAi(contextLines)
          if (cancelledAiSongsRef.current.has(song.id)) return { cache, complete: false, ready: countReady(), error: '歌曲已删除，解析已停止。' }
          const knownIds = new Set(batch.map((line) => line.id))
          const lineById = new Map(batch.map((line) => [line.id, line]))
          for (const explanation of result.explanations || []) {
            if (!knownIds.has(explanation.line_id) || !explanation.meaning) continue
            const line = lineById.get(explanation.line_id)
            cache[line.id] = { text: line.text, explanation }
          }
          setSentenceExplanationsBySong((previous) => ({ ...previous, [song.id]: { ...(previous[song.id] || {}), ...cache } }))
          const ready = countReady()
          setSentenceExplanationJob({ songId: song.id, ready, total: song.lines.length })
          onProgress?.(ready, song.lines.length)
        } catch (error) {
          failure = error instanceof Error ? error.message : 'AI 整句解析暂时不可用。'
          break
        }
      }
      const complete = requestedLines.every((line) => hasCachedSentenceExplanation(cache, line))
      if (!complete && !failure) failure = '部分句子的解析未生成，可稍后重试。'
      if (failure) setSentenceExplanationError({ songId: song.id, message: failure })
      return { cache, complete, ready: countReady(), error: failure }
    } finally {
      sentenceExplanationJobRef.current = null
      setSentenceExplanationJob(null)
    }
  }

  async function showSentenceExplanation(line) {
    const songId = activeSong.id
    if (sentenceExplanationOpen?.songId === songId && sentenceExplanationOpen.line.id === line.id) {
      setSentenceExplanationOpen(null)
      return
    }
    const cached = sentenceExplanationsBySong[activeSong.id]?.[line.id]
    if (hasCachedSentenceExplanation(sentenceExplanationsBySong[activeSong.id], line)) {
      setSentenceExplanationOpen({ songId, line, explanation: cached.explanation })
      return
    }
    const result = await generateSentenceExplanations(activeSong, [line])
    const prepared = result.cache[line.id]
    if (hasCachedSentenceExplanation(result.cache, line)) setSentenceExplanationOpen({ songId, line, explanation: prepared.explanation })
    else setToast(result.error || '这句的解析暂未生成，请稍后重试。')
  }

  async function generateCurrentSongExplanations() {
    const result = await generateSentenceExplanations(activeSong)
    if (result.complete) {
      const pending = loadLocal(PENDING_AI_IMPORT_KEY, [])
      localStorage.setItem(PENDING_AI_IMPORT_KEY, JSON.stringify((Array.isArray(pending) ? pending : []).filter((id) => id !== activeSong.id)))
    }
    setToast(result.complete ? `《${activeSong.title}》的 ${result.ready} 句解析已准备好。`
      : `${result.error || '部分句子未完成'}：已准备 ${result.ready} / ${activeSong.lines.length} 句，可重试。`)
  }

  async function exportLearningData() {
    if (backupBusy) return
    setBackupBusy('export')
    setBackupError('')
    try {
      const records = await loadLocalSongs()
      const progressState = { learnedBySong, reviewItems, favoriteSongIds, corrections, meaningOverrides, playbackRate, lyricSnapshots, readingStyle, readingFontSize, lineReadingFontSize, lyricEditsBySong }
      const blob = createLearningBackup(records, {
        progress: progressState, annotations: annotationsBySong, aiReviews,
        sentenceExplanations: sentenceExplanationsBySong,
        artworkOverrides,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `UTA-学习备份-${new Date().toISOString().slice(0, 10)}.uta-backup`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      setToast(`备份已生成：${records.length} 首网页导入歌曲及学习数据。请妥善保管下载的文件。`)
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : '生成备份失败。')
    } finally {
      setBackupBusy('')
    }
  }

  // 云端保存当前完整数据，并由用户决定是否包含 AI Key。
  async function createCloudData(includeKey=false) {
    const core=createLearningBackup(await loadLocalSongs(),{progress:{learnedBySong,reviewItems,favoriteSongIds,corrections,meaningOverrides,playbackRate,lyricSnapshots,readingStyle,readingFontSize,lineReadingFontSize,lyricEditsBySong},annotations:annotationsBySong,aiReviews,sentenceExplanations:sentenceExplanationsBySong,artworkOverrides})
    return wrapCloudBackup(core,includeKey)
  }
  useEffect(()=>{if(IS_ANDROID_APP&&localSongsReady)markCloudDirty()},[localSongsReady,localSongs,learningState,artworkOverrides,readingStyle,playbackRate])
  useEffect(()=>{if(!IS_ANDROID_APP)return undefined;const changed=()=>markCloudDirty();for(const event of ['uta:profile-changed','uta:chats-changed','uta:ai-settings'])window.addEventListener(event,changed);return()=>{for(const event of ['uta:profile-changed','uta:chats-changed','uta:ai-settings'])window.removeEventListener(event,changed)}},[])

  async function chooseImportAudioFile(file) {
    const requestId = ++importAudioRequestRef.current
    setImportAudioFile(file)
    setImportAudioGuess(null)
    setImportAutoQuery('')
    setImportError('')
    if (!file) return
    // 先读取音频标签，缺少标签时用文件名；识别后直接搜索同步歌词。
    const guessed = await inferAudioMetadata(file)
    if (requestId !== importAudioRequestRef.current) return
    setImportAudioGuess(guessed)
    setImportAutoQuery([guessed.title, guessed.artist].filter(Boolean).join(' ').trim())
  }

  function selectImportArtwork(artwork) {
    // 保存封面选择本身；未选择时和“默认封面”都不会偷偷采用搜索结果。
    setImportArtwork(artwork)
    setImportArtworkUrl(artwork.artworkUrl || '')
    setImportArtworkStatus(artwork.artworkChoice === 'default' ? 'default' : 'found')
  }

  function openArtworkEditor(song) {
    const current = Object.hasOwn(artworkOverrides, song.id) ? artworkOverrides[song.id]
      : song.artworkChoice === 'default' ? { artworkUrl: '', artworkProvider: '默认封面', artworkChoice: 'default' }
        : song.artworkUrl ? { artworkUrl: song.artworkUrl, artworkSourceUrl: song.artworkSourceUrl || '', artworkProvider: song.artworkProvider || '已有封面' }
          : songArtworkBySource[song.sourceFile] || null
    setEditingArtworkSong(song)
    setEditingArtworkChoice(current)
    setArtworkEditError('')
  }

  async function saveArtworkEditor() {
    if (!editingArtworkSong || artworkEditSaving) return
    const choice = editingArtworkChoice || { artworkUrl: '', artworkSourceUrl: '', artworkProvider: '默认封面', artworkChoice: 'default' }
    setArtworkEditSaving(true)
    setArtworkEditError('')
    try {
      const cached = await cacheArtworkSelection(choice)
      const metadata = { artworkUrl: cached.artworkUrl || '', artworkSourceUrl: cached.artworkSourceUrl || '',
        artworkProvider: cached.artworkProvider || '默认封面', artworkChoice: cached.artworkChoice || 'selected' }
      if (editingArtworkSong.isLocal) {
        await updateLocalSongMetadata(editingArtworkSong.id, metadata)
        setLocalSongs((previous) => previous.map((song) => song.id === editingArtworkSong.id ? { ...song, ...metadata } : song))
      } else {
        const next = { ...artworkOverrides, [editingArtworkSong.id]: metadata }
        localStorage.setItem(ARTWORK_OVERRIDES_KEY, JSON.stringify(next))
        setArtworkOverrides(next)
      }
      setEditingArtworkSong(null)
      setToast(`已更新《${editingArtworkSong.title}》的展示封面。`)
    } catch (error) { setArtworkEditError(error instanceof Error ? error.message : '封面下载或保存失败，请重试。') }
    finally { setArtworkEditSaving(false) }
  }

  // 电脑网页读取自己的浏览器歌曲，用户点击后才交给本机临时传歌服务。
  async function shareComputerSongs() {
    if (computerShare?.busy) return
    setComputerShare({ busy: true, error: '' })
    try {
      const records = await loadLocalSongs()
      const progressState = { learnedBySong, reviewItems, favoriteSongIds, corrections, meaningOverrides, playbackRate, lyricSnapshots, readingStyle, readingFontSize, lineReadingFontSize, lyricEditsBySong }
      const session = await startComputerTransfer(records, {
        progress: progressState, annotations: annotationsBySong, aiReviews,
        sentenceExplanations: sentenceExplanationsBySong,
        artworkOverrides,
      })
      setComputerShare({ busy: false, ...session, error: '' })
    } catch (error) {
      setComputerShare({ busy: false, error: error instanceof Error ? error.message : '无法准备电脑歌曲。' })
    }
  }

  async function stopComputerSharing() {
    if (computerShare?.code) {
      try { await fetch(`http://127.0.0.1:8765/api/transfer/session/${encodeURIComponent(computerShare.code)}`, { method: 'DELETE' }) } catch { /* 服务退出后会自行清理临时数据。 */ }
    }
    setComputerShare(null)
  }

  // 用户勾选后逐首下载；每首成功保存后再合并它的学习记录。
  async function importSelectedComputerSongs(listing, selectedIds, origin, code, report) {
    const existing = new Set((await loadLocalSongs()).map((song) => song.id))
    let imported = 0
    for (const [index, id] of selectedIds.entries()) {
      if (existing.has(id)) continue
      const song = listing.songs.find((item) => item.id === id)
      if (!song) throw new Error('所选歌曲不在电脑清单中，请重新检索。')
      report(`正在传送第 ${index + 1} / ${selectedIds.length} 首：《${song.title}》`)
      const record = await downloadComputerSong(origin, code, song, (received, total) => {
        report(`正在传送《${song.title}》：${Math.round(received / total * 100)}%`)
      })
      await storeTransferredSong(record)
      const { audioBlob, ...songWithoutAudio } = record
      const audioObjectUrl = URL.createObjectURL(audioBlob)
      localAudioUrlRef.current = { ...localAudioUrlRef.current, [id]: audioObjectUrl }
      setLocalAudioUrls((previous) => ({ ...previous, [id]: audioObjectUrl }))
      setLocalSongs((previous) => [songWithoutAudio, ...previous])
      setLearningState((previous) => mergeTransferredLearning(previous, listing, [id]))
      existing.add(id)
      imported += 1
    }
    setToast(`已从电脑网页导入 ${imported} 首歌曲，原有手机歌曲保留。`)
  }

  async function prepareBackupRestore(file) {
    if (backupBusy || !file) return
    setBackupBusy('inspect')
    setBackupPreview(null)
    setBackupError('')
    try {
      // 旧入口：inspectLearningBackup(file)；云备份额外读取头像、对话和 AI 配置。
      setBackupPreview(await inspectCloudBackup(file))
      return true
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : '无法读取备份文件。')
    } finally {
      setBackupBusy('')
    }
  }

  async function restoreLearningData() {
    if (!backupPreview || backupBusy) return
    if (!window.confirm('这会用备份中的歌曲和学习记录覆盖当前浏览器的数据。建议先导出当前备份。确定继续吗？')) return
    setBackupBusy('restore')
    setBackupError('')
    const previousStorage = Object.fromEntries(Object.values(BACKUP_STORAGE_KEYS).map((key) => [key, localStorage.getItem(key)]))
    let previousSongs = null
    try {
      const { manifest } = backupPreview
      if(backupPreview.extras){await restoreCloudData(backupPreview);window.location.reload();return}
      const restoredStorage = {
        [PROGRESS_KEY]: JSON.stringify(manifest.progress),
        [ANNOTATION_KEY]: JSON.stringify(manifest.annotations),
        [AI_REVIEW_KEY]: JSON.stringify(manifest.aiReviews),
        [SENTENCE_EXPLANATION_KEY]: JSON.stringify(manifest.sentenceExplanations),
        [ARTWORK_OVERRIDES_KEY]: JSON.stringify(manifest.artworkOverrides || {}),
      }
      previousSongs = await loadLocalSongs()
      await replaceLocalSongs(songsFromLearningBackup(backupPreview))
      try {
        Object.entries(restoredStorage).forEach(([key, value]) => localStorage.setItem(key, value))
      } catch (error) {
        let rollbackFailed = false
        try {
          Object.keys(previousStorage).forEach((key) => localStorage.removeItem(key))
          Object.entries(previousStorage).forEach(([key, value]) => { if (value !== null) localStorage.setItem(key, value) })
        } catch { rollbackFailed = true }
        try { await replaceLocalSongs(previousSongs) } catch { rollbackFailed = true }
        if (rollbackFailed) throw new Error('恢复未完成，且自动回滚失败。请不要清除浏览器数据，并用原备份重试。')
        throw error
      }
      window.location.reload()
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : '恢复失败，原有数据未更改。')
      setBackupBusy('')
    }
  }

  async function importLocalSongBatch(items) {
    setImportBusy(true)
    try {
      const records = await createAndStoreLocalSongs(items.map(item => ({ ...item, metadata: { artworkChoice: 'default', artworkProvider: '默认封面' } })))
      const urls = {}, songs = []
      for (const { audioBlob, ...song } of records) {
        urls[song.id] = URL.createObjectURL(audioBlob)
        songs.push(song)
      }
      localAudioUrlRef.current = { ...localAudioUrlRef.current, ...urls }
      setLocalAudioUrls(previous => ({ ...previous, ...urls }))
      setLocalSongs(previous => [...songs, ...previous])
      setImportOpen(false)
      setImportSource('phone')
      setLibrarySearch('')
      showLibraryPage()
      setToast(`已批量导入 ${songs.length} 首歌曲。`)
    } finally { setImportBusy(false) }
  }

  async function importLocalSong() {
    if (!importLrcFile || !importAudioFile || !importDraft) {
      setImportError('请选择一个 LRC 歌词文件和一个音频文件。')
      return
    }
    // 旧流程必须等单一来源查找结束；多来源选择可留空，留空即使用默认封面。
    // if (importArtworkStatus === 'idle' || importArtworkStatus === 'loading') return
    const title = importDraft.title.trim()
    const artist = importDraft.artist.trim() || '本地导入'
    if (!title) { setImportError('请填写歌曲名。'); return }
    const lines = []
    for (const [index, line] of importDraft.lines.entries()) {
      const start = parseLrcTimestamp(line.timeText)
      const text = line.text.trim().replace(/\s+/g, ' ')
      if (start == null) { setImportError(`第 ${index + 1} 行的时间戳无效，请使用 00:12.345 格式。`); return }
      if (!text) { setImportError(`第 ${index + 1} 行缺少日文歌词。`); return }
      if (!isSongHeadingLine(text, title, artist)) lines.push({ start, text, translation: line.translation.trim() })
    }
    if (!lines.length) { setImportError('预览中没有可学习的歌词句子。'); return }
    if (importArtworkStatus === 'manual') {
      try {
        const coverUrl = new URL(importArtworkUrl.trim())
        if (!['http:', 'https:'].includes(coverUrl.protocol)) throw new Error('invalid URL')
      } catch { setImportError('封面链接需要是有效的 http 或 https 地址。'); return }
    }
    lines.sort((left, right) => left.start - right.start)
    const parsed = {
      title, artist, album: importDraft.album || '', sourceFile: importLrcFile.name,
      duration: lines.at(-1).start,
      lines: lines.map((line, id) => ({ id, ...line })),
    }
    // 旧单图搜索与手填链接的分支保留作对照，改为统一保存用户的选择。
    // const artwork = importArtworkStatus === 'found' ? importArtwork : null
    const artwork = importArtwork || { artworkUrl: '', artworkSourceUrl: '', artworkProvider: '默认封面', artworkChoice: 'default' }
    setImportBusy(true)
    setImportAiProgress(null)
    setImportError('')
    try {
      // 旧版直接保存远程 URL；现在下载并压缩后才写入歌曲记录。
      const storedArtwork = await cacheArtworkSelection(artwork)
      const record = await createAndStoreLocalSong(parsed, importAudioFile, storedArtwork || {})
      const { audioBlob, ...song } = record
      const audioObjectUrl = URL.createObjectURL(audioBlob)
      localAudioUrlRef.current = { ...localAudioUrlRef.current, [song.id]: audioObjectUrl }
      if (importAiMode === 'background') {
        const queued = loadLocal(PENDING_AI_IMPORT_KEY, [])
        localStorage.setItem(PENDING_AI_IMPORT_KEY, JSON.stringify([...new Set([...(Array.isArray(queued) ? queued : []), song.id])]))
      }
      setLocalSongs((previous) => [song, ...previous])
      setLocalAudioUrls((previous) => ({ ...previous, [song.id]: audioObjectUrl }))
      // 旧版在此 await 全曲 AI 解析，用户必须在导入窗口等待；现在保存成功即关闭。
      // const explanationResult = await generateSentenceExplanations(song, song.lines, (ready, total) => setImportAiProgress({ ready, total }))
      setImportLrcFile(null)
      setImportAudioFile(null)
      setImportAutoQuery('')
      setImportAudioGuess(null)
      setImportDraft(null)
      setImportAiProgress(null)
      setImportArtworkStatus('idle')
      setImportArtwork(null)
      setImportArtworkUrl('')
      setImportOpen(false)
      chooseSongFromLibrary(song.id)
      setToast(importAiMode === 'background' ? `已导入《${song.title}》，AI 解析正在后台生成。` : `已导入《${song.title}》，可在学习页按需生成 AI 解析。`)
      if (importAiMode === 'background') setPendingAiRevision((value) => value + 1)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '导入失败，请检查歌词和音频文件。')
      setImportAiProgress(null)
    } finally {
      setImportBusy(false)
    }
  }

  async function saveSongDetails({ title, artist, lines, audioFile, sourceFile }) {
    const song = editingDetailsSong
    if (!song?.isLocal) throw new Error('只有本机导入的歌曲可以修改详细信息。')
    if (sentenceExplanationJobRef.current === song.id) throw new Error('这首歌正在生成 AI 解析，请完成后再编辑歌词。')
    const lineFields = (items) => items.map(({ id, start, text, translation }) => ({ id, start, text, translation: translation || '' }))
    const lyricsChanged = JSON.stringify(lineFields(song.lines)) !== JSON.stringify(lineFields(lines))
    const metadata = { title, artist, lines, sourceFile, duration: lines.at(-1).start, ...(audioFile ? { audioBlob: audioFile, audioName: audioFile.name } : {}) }
    setEditingDetailsBusy(true)
    try {
      const updated = await updateLocalSongMetadata(song.id, metadata)
      if (!updated) throw new Error('找不到要编辑的本地歌曲。')
      if (audioFile) {
        stopLinePlayback()
        const oldUrl = localAudioUrlRef.current[song.id]
        const newUrl = URL.createObjectURL(audioFile)
        localAudioUrlRef.current = { ...localAudioUrlRef.current, [song.id]: newUrl }
        setLocalAudioUrls((previous) => ({ ...previous, [song.id]: newUrl }))
        if (oldUrl) URL.revokeObjectURL(oldUrl)
      }
      const { audioBlob, ...visibleSong } = updated
      setLocalSongs((previous) => previous.map((item) => item.id === song.id ? visibleSong : item))
      if (lyricsChanged) {
        // 歌词或时间轴改变后，旧的逐句读音、掌握状态和 AI 结果不能沿用。
        setLearningState((previous) => {
          const withoutSong = (value) => { const { [song.id]: removed, ...remaining } = value || {}; return remaining }
          const progress = previous.progress
          return { ...previous, annotations: withoutSong(previous.annotations), aiReviews: withoutSong(previous.aiReviews), sentenceExplanations: withoutSong(previous.sentenceExplanations), progress: { ...progress, learnedBySong: withoutSong(progress.learnedBySong), lyricSnapshots: withoutSong(progress.lyricSnapshots), reviewItems: (progress.reviewItems || []).filter((item) => item.songId !== song.id), corrections: Object.fromEntries(Object.entries(progress.corrections || {}).filter(([key]) => !key.startsWith(`${song.id}:`))) } }
        })
        const pending = loadLocal(PENDING_AI_IMPORT_KEY, [])
        localStorage.setItem(PENDING_AI_IMPORT_KEY, JSON.stringify((Array.isArray(pending) ? pending : []).filter((id) => id !== song.id)))
        if (activeSong.id === song.id) setActiveLineId(lines[0]?.id ?? 0)
      }
      setEditingDetailsSong(null)
      setToast(`《${title}》的歌曲信息已保存。`)
    } finally { setEditingDetailsBusy(false) }
  }

  async function removeImportedSong(song) {
    if (!song.isLocal || deletingSongId) return
    if (!window.confirm(`确定删除《${song.title}》吗？歌词、音频和这首歌的学习进度都会从当前浏览器移除。`)) return
    setDeletingSongId(song.id)
    try {
      await deleteLocalSong(song.id)
      cancelledAiSongsRef.current.add(song.id)
      const pendingAi = loadLocal(PENDING_AI_IMPORT_KEY, [])
      localStorage.setItem(PENDING_AI_IMPORT_KEY, JSON.stringify((Array.isArray(pendingAi) ? pendingAi : []).filter((id) => id !== song.id)))
      const audioObjectUrl = localAudioUrlRef.current[song.id]
      if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl)
      const { [song.id]: removedUrl, ...remainingUrls } = localAudioUrlRef.current
      localAudioUrlRef.current = remainingUrls
      setLocalAudioUrls(remainingUrls)
      setLocalSongs((previous) => previous.filter((item) => item.id !== song.id))
      setAnnotationsBySong((previous) => { const { [song.id]: removed, ...rest } = previous; return rest })
      setAiReviews((previous) => { const { [song.id]: removed, ...rest } = previous; return rest })
      setSentenceExplanationsBySong((previous) => { const { [song.id]: removed, ...rest } = previous; return rest })
      setLearnedBySong((previous) => { const { [song.id]: removed, ...rest } = previous; return rest })
      setReviewItems((previous) => previous.filter((item) => item.songId !== song.id))
      setFavoriteSongIds((previous) => previous.filter((songId) => songId !== song.id))
      setCorrections((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${song.id}:`))))
      setLearningState((previous) => {
        const { [song.id]: removed, ...lyricSnapshots } = previous.progress.lyricSnapshots || {}
        return { ...previous, progress: { ...previous.progress, lyricSnapshots } }
      })
      if (song.id === activeSong.id) {
        const nextSong = allSongs.find((item) => item.id !== song.id) || initialSong()
        chooseSong(nextSong.id)
      }
      setToast(`已删除《${song.title}》及其本机保存的数据。`)
    } catch {
      setToast('删除失败：浏览器未能更新本地歌曲库。')
    } finally {
      setDeletingSongId('')
    }
  }

  function choosePlaybackRate(nextRate) {
    setPlaybackRate(nextRate)
    if (IS_DESKTOP_APP && audioRef.current) audioRef.current.playbackRate = nextRate
    setToast(`已切换为 ${nextRate}× 速度播放。`)
  }

  function clearSelectedRangeEndTimer() {
    if (selectedRangeEndTimerRef.current != null) window.clearTimeout(selectedRangeEndTimerRef.current)
    selectedRangeEndTimerRef.current = null
  }

  function clearSelectedRangePlayback() {
    clearSelectedRangeEndTimer()
    selectedRangePlaybackRef.current = null
    setSelectedRangePlaying(false)
  }

  function finishSelectedRangePlayback() {
    const range = selectedRangePlaybackRef.current, audio = audioRef.current
    if (!range || !audio) return
    clearSelectedRangePlayback()
    clipEndRef.current = null
    continuousPlaybackRef.current = false
    audio.pause()
    audio.currentTime = range.end
    setPlayingLineId(null)
    setSingAlongPlaying(false)
    updateDesktopAudio()
  }

  // timeupdate alone can arrive after the next lyric has started. A timer based
  // on media time and rate also guards the boundary while the window is hidden.
  function scheduleSelectedRangeEnd() {
    clearSelectedRangeEndTimer()
    const range = selectedRangePlaybackRef.current, audio = audioRef.current
    if (!range || !audio || audio.paused) return
    const remaining = range.end - audio.currentTime
    if (remaining <= 0) { finishSelectedRangePlayback(); return }
    selectedRangeEndTimerRef.current = window.setTimeout(() => {
      selectedRangeEndTimerRef.current = null
      scheduleSelectedRangeEnd()
    }, Math.max(8, Math.min(2147483647, remaining * 1000 / (audio.playbackRate || 1))))
  }

  function startSelectedRangePlayback(clip) {
    const audio = audioRef.current
    if (!audio) return
    const range = lyricRangeBounds(activeSong.lines, clip.anchorId, clip.focusId, audio.duration)
    if (!range || range.error || !Number.isFinite(range.end)) {
      setAudioError(range?.error || '无法确定选段的音频结束位置，请检查音频与时间轴。'); return
    }
    const run = { ...clip, start: range.start, end: range.end }
    selectedRangePlaybackRef.current = run
    clipEndRef.current = range.end
    continuousPlaybackRef.current = true
    continuousLineIdRef.current = range.first.id
    setSingAlongLineId(range.first.id)
    setPlayingLineId(null)
    audio.playbackRate = playbackRate
    try { audio.currentTime = range.start } catch { clearSelectedRangePlayback(); clipEndRef.current = null; continuousPlaybackRef.current = false; setAudioError('无法跳转到选段起点。'); return }
    audio.play().then(() => {
      if (selectedRangePlaybackRef.current !== run) return
      setSingAlongPlaying(!audio.paused && !audio.ended)
      setAudioError('')
      updateDesktopAudio()
    }).catch(error => {
      if (error.name === 'AbortError' || selectedRangePlaybackRef.current !== run) return
      clearSelectedRangePlayback(); clipEndRef.current = null; continuousPlaybackRef.current = false
      setSingAlongPlaying(false); setAudioError('未能播放选中的歌词片段。')
    })
  }

  function playSelectedLyricRange() {
    const audio = audioRef.current
    if (!desktopLyricSelection || !audioUrl || !audio || !desktopLyricRange || desktopLyricRange.error) return
    stopLinePlayback()
    const clip = { kind: 'selected-range', anchorId: desktopLyricSelection.anchorId, focusId: desktopLyricSelection.focusId }
    if (audio.readyState < 1) { pendingClipRef.current = clip; audio.load(); return }
    startSelectedRangePlayback(clip)
  }

  function toggleSelectedLyricRange() {
    const audio = audioRef.current, range = selectedRangePlaybackRef.current
    if (!range || !audio || audio.ended || audio.currentTime >= range.end) { playSelectedLyricRange(); return }
    if (!audio.paused) { audio.pause(); setSingAlongPlaying(false); updateDesktopAudio(); return }
    audio.play().then(() => {
      if (selectedRangePlaybackRef.current === range) { setSingAlongPlaying(!audio.paused); setAudioError(''); updateDesktopAudio() }
    }).catch(error => { if (error.name !== 'AbortError') setAudioError('未能继续播放选中片段。') })
  }

  function startClipPlayback(clip) {
    clearSelectedRangePlayback()
    const audio = audioRef.current
    if (!audio) return
    // 逐句播放沿用旧截断行为，进入时关闭连续跟唱状态。
    continuousPlaybackRef.current = false
    pendingContinuousRef.current = null
    setSingAlongPlaying(false)
    const fallbackEnd = Number.isFinite(audio.duration) ? audio.duration : clip.start + 8
    clipEndRef.current = Math.max(clip.start + 0.12, clip.end ?? fallbackEnd)
    audio.playbackRate = playbackRate
    try { audio.currentTime = clip.start } catch { /* Wait for metadata if the browser has not seeked yet. */ }
    audio.play()
      .then(() => { if (!audio.paused) setPlayingLineId(clip.lineId); setAudioError('') })
      .catch(error => {
        if (error.name === 'AbortError') return
        setPlayingLineId(null)
        setAudioError('浏览器未能开始播放该句音频。')
      })
  }

  function playLine(lineId) {
    if (selectedRangePlaybackRef.current) stopLinePlayback()
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

  // 跟唱从指定时间开始持续播放到音频结束；不设置逐句的 clipEnd。
  function startContinuousPlayback(start, lineId) {
    clearSelectedRangePlayback()
    const audio = audioRef.current
    if (!audioUrl || !audio) { setAudioError('这首歌尚无可播放的音频。'); return }
    pendingClipRef.current = null
    clipEndRef.current = null
    continuousPlaybackRef.current = true
    continuousLineIdRef.current = lineId
    setSingAlongLineId(lineId)
    setPlayingLineId(null)
    if (audio.readyState < 1) {
      pendingContinuousRef.current = { start, lineId }
      audio.load()
      return
    }
    pendingContinuousRef.current = null
    try { audio.currentTime = start } catch { setAudioError('无法跳转到选中的歌词位置。'); return }
    audio.playbackRate = IS_DESKTOP_APP ? playbackRate : 1
    audio.play().then(() => { setSingAlongPlaying(!audio.paused && !audio.ended); setAudioError('') })
      .catch(error => { if (error.name === 'AbortError') return; continuousPlaybackRef.current = false; setSingAlongPlaying(false); setAudioError('未能开始播放歌曲。') })
  }

  function playSingAlongFromLine(lineId) {
    // 点击正在唱的句子暂停；再次点击从句首重播，并持续唱到后面。
    const audio = audioRef.current
    if (singAlongLineId === lineId && audio && !audio.paused) { audio.pause(); setSingAlongPlaying(false); return }
    const line = activeSong.lines.find((item) => item.id === lineId)
    if (line) startContinuousPlayback(Math.max(0, (line.start || 0) - LINE_PLAYBACK_LEAD_IN_SECONDS), line.id)
  }

  function toggleSingAlong() {
    if (selectedRangePlaybackRef.current) { toggleSelectedLyricRange(); return }
    const audio = audioRef.current
    if (!audioUrl || !audio) return
    if (!continuousPlaybackRef.current || audio.ended) { startContinuousPlayback(0, activeSong.lines[0]?.id ?? null); return }
    if (!audio.paused) { audio.pause(); setSingAlongPlaying(false); return }
    audio.play().then(() => { setSingAlongPlaying(!audio.paused && !audio.ended); setAudioError('') })
      .catch(error => { if (error.name !== 'AbortError') setAudioError('未能继续播放歌曲。') })
  }

  function handleAudioLoadedMetadata() {
    updateDesktopAudio()
    const continuous = pendingContinuousRef.current
    if (continuous) { startContinuousPlayback(continuous.start, continuous.lineId); return }
    const clip = pendingClipRef.current
    if (!clip) return
    pendingClipRef.current = null
    if (clip.kind === 'selected-range') { startSelectedRangePlayback(clip); return }
    startClipPlayback(clip)
  }

  function handleAudioTimeUpdate() {
    updateDesktopAudio()
    const audio = audioRef.current
    if (selectedRangePlaybackRef.current && audio && audio.currentTime >= selectedRangePlaybackRef.current.end) {
      finishSelectedRangePlayback(); return
    }
    if (continuousPlaybackRef.current && audio) {
      // LRC 时间戳决定当前句；高亮更新不会暂停或跳转音频。
      let lineId = activeSong.lines[0]?.id ?? null
      for (const line of activeSong.lines) {
        if ((line.start || 0) > audio.currentTime + (selectedRangePlaybackRef.current ? 0 : 0.04)) break
        lineId = line.id
      }
      if (lineId !== continuousLineIdRef.current) {
        continuousLineIdRef.current = lineId
        setSingAlongLineId(lineId)
      }
      return
    }
    if (!audio || clipEndRef.current == null || audio.currentTime < clipEndRef.current - 0.04) return
    audio.pause()
    audio.currentTime = clipEndRef.current
    clipEndRef.current = null
    setPlayingLineId(null)
  }

  function toggleLearnedLine(lineId) {
    const willLearn = !learnedLines.has(lineId)
    setLearnedBySong((previous) => {
      const next = new Set(previous[activeSong.id] || [])
      if (willLearn) next.add(lineId)
      else next.delete(lineId)
      return { ...previous, [activeSong.id]: [...next] }
    })
    if (willLearn) setReviewItems((previous) => previous.filter((item) => !(item.songId === activeSong.id && item.lineId === lineId)))
    setToast(willLearn ? '本句已标记为掌握。' : '本句已改为未掌握。')
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
    if (!hasReview) setLearnedBySong((previous) => ({ ...previous, [activeSong.id]: (previous[activeSong.id] || []).filter((lineId) => lineId !== activeLine.id) }))
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
    // 词语按钮会阻止冒泡；手机上点歌词文字也应算点到了整句播放热区。
    if (isMobileLyricPlayback()) playLine(lineId)
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

  function updateDesktopAudio() {
    if (!IS_DESKTOP_APP || !audioRef.current) return
    const audio = audioRef.current
    setDesktopAudio({ time: audio.currentTime || 0, duration: Number.isFinite(audio.duration) ? audio.duration : 0, playing: !audio.paused && !audio.ended })
    setSelectedRangePlaying(Boolean(selectedRangePlaybackRef.current && !audio.paused && !audio.ended))
    scheduleSelectedRangeEnd()
  }

  function seekDesktopAudio(time) {
    clearSelectedRangePlayback()
    const audio = audioRef.current
    if (!audio || !audioUrl || !Number.isFinite(audio.duration)) return
    clipEndRef.current = null
    continuousPlaybackRef.current = true
    setPlayingLineId(null)
    audio.currentTime = Math.max(0, Math.min(time, audio.duration))
    handleAudioTimeUpdate()
  }

  function playDesktopAdjacent(offset) {
    const index = activeSong.lines.findIndex(line => line.id === (singAlongLineId ?? activeLine.id))
    const line = activeSong.lines[Math.max(0, Math.min(index + offset, activeSong.lines.length - 1))]
    if (line) startContinuousPlayback(line.start || 0, line.id)
  }

  useEffect(() => {
    if (!IS_DESKTOP_APP) return
    return window.utaDesktop.onCommand(command => {
      if (command === 'import') openImportDialog()
      if (command === 'search') showLibraryPage({ focusSearch: true })
      if (command === 'settings') setSettingsOpen(true)
      if (command === 'backup') exportLearningData()
      if (command === 'library') showLibraryPage()
      if (command === 'lesson') showLessonPage()
      if (command === 'review') showReviewQueue()
    })
  })

  return <div className={IS_DESKTOP_APP ? 'desktop-shell' : undefined}>
    {IS_DESKTOP_APP && <DesktopChrome page={activePage} song={activeSong} songs={allSongs} reviewCount={reviewQueue.length} onLesson={showLessonPage} onLibrary={() => showLibraryPage()} onReview={showReviewQueue} onSettings={() => setSettingsOpen(true)} onSong={chooseSongFromLibrary}/>}
    {IS_ANDROID_APP && songPickerOpen && <div className="study-song-picker" role="dialog" aria-modal="true" aria-label="选择歌曲"><button className="study-picker-close" type="button" onClick={() => setSongPickerOpen(false)} aria-label="返回当前练习">‹ 返回</button><AndroidSongLibrary selectionMode songs={allSongs.filter((song) => !song.isDemo && normalizeSongSearch(`${song.title}${song.artist}`).includes(normalizeSongSearch(songPickerSearch)))} total={androidLibraryTotal} search={songPickerSearch} onSearch={setSongPickerSearch} artworkFor={artworkForSong} learnedBySong={learnedBySong} activeSongId={activeSong.id} onOpen={(id) => { chooseSong(id); setSongPickerOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }) }} /></div>}
    {/* 长按后只露出编辑入口；完整编辑窗口按需打开。 */}
    {/* 长按抬手会产生一次兼容点击；短暂忽略背景点击，避免刚弹出的菜单自动关闭。 */}
    {lyricEditMenu && <div className="lyric-edit-menu-backdrop" onClick={() => { if (Date.now() >= lyricPressSuppressionRef.current) setLyricEditMenu(null) }}><div className="lyric-edit-menu" role="dialog" aria-label="歌词操作" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => { setEditingLyric(lyricEditMenu); setLyricEditMenu(null) }}><Pencil size={18} />编辑</button><button type="button" onClick={() => setLyricEditMenu(null)}>取消</button></div></div>}
    {editingLyric && (() => {
      const song = allSongs.find((item) => item.id === editingLyric.songId)
      const line = song?.lines.find((item) => item.id === editingLyric.lineId)
      return line ? <LyricLineEditor key={`${song.id}:${line.id}`} song={song} line={line} annotation={annotationsBySong[song.id]?.find((item) => item.id === line.id)} corrections={corrections} onClose={() => { if (!lyricEditSaving) setEditingLyric(null) }} onSave={saveEditedLyric} /> : null
    })()}
    {IS_ANDROID_APP && androidLaunchVisible && <div className="android-launch-screen" role="img" aria-label="UTA 启动图：私のうた，聴いてください"><img src={androidLaunchPortrait} alt="" /><div className="android-launch-title" lang="ja"><span>私のうた</span><span>聴いてください</span></div></div>}
    <div className="page-grain" aria-hidden="true" />
    <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" onPlay={updateDesktopAudio} onPause={updateDesktopAudio} onEmptied={updateDesktopAudio} onDurationChange={updateDesktopAudio} onLoadedMetadata={handleAudioLoadedMetadata} onTimeUpdate={handleAudioTimeUpdate} onRateChange={scheduleSelectedRangeEnd} onSeeking={clearSelectedRangeEndTimer} onSeeked={scheduleSelectedRangeEnd} onEnded={() => { clearSelectedRangePlayback(); clipEndRef.current = null; continuousPlaybackRef.current = false; setPlayingLineId(null); setSingAlongPlaying(false) }} onError={() => { clearSelectedRangePlayback(); continuousPlaybackRef.current = false; setPlayingLineId(null); setSingAlongPlaying(false); setAudioError(`未能加载《${activeSong.title}》的音频文件。`) }} />
    {/* 学习详情页由歌曲栏承担页头，原品牌栏保留给主页面和网页。 */}
    <header className={`topbar ${IS_ANDROID_APP ? `android-topbar ${['lesson', 'sing-along'].includes(activePage) ? 'study-topbar-hidden' : ''}` : ''}`}>
      <button className="brand" type="button" onClick={showLessonPage} aria-label="UTA 首页"><span className="brand-mark">う</span><span>UTA<span className="brand-dot">.</span></span></button>
      {/* 旧网页顶部导航保留；安卓使用下方固定的三按钮导航。 */}
      {!IS_ANDROID_APP && <nav className="main-nav" aria-label="主导航"><button className={activePage === 'lesson' ? 'active' : ''} type="button" onClick={showLessonPage}>发音学习</button><button className={activePage === 'library' ? 'active' : ''} type="button" onClick={() => showLibraryPage()}>歌曲库</button><button type="button" onClick={showReviewQueue}>复习</button></nav>}
      {!IS_ANDROID_APP && <div className="top-actions"><button className="icon-button" type="button" onClick={focusLibrarySearch} aria-label="搜索歌曲"><Search size={20} /></button><button className="settings-trigger" type="button" onClick={() => setSettingsOpen(true)} aria-label="设置"><Settings size={19} /><span>设置</span></button></div>}
    </header>

    {IS_ANDROID_APP && <WebDavAutoSync onCreateBackup={createCloudData} onNotice={setToast}/>}
    {IS_ANDROID_APP && <AppUpdatePrompt updates={appUpdates}/>}
    <main id="top" className={IS_ANDROID_APP ? `android-main ${activePage === 'lesson' ? 'android-lesson-page' : ''}` : ''} data-reading-style={readingStyle} style={IS_DESKTOP_APP ? { '--reading-font-size': `${readingFontSize}px`, '--line-reading-font-size': `${lineReadingFontSize}px` } : undefined}>
      {/* 安卓三屏首页按确认稿呈现，模式卡片只负责进入现有功能。 */}
      {IS_ANDROID_APP && activePage.startsWith('mobile-') && <AndroidHome tab={mobileTab} recentLearn={recentLearnSong ? { song: recentLearnSong, artwork: artworkForSong(recentLearnSong) } : null} recentSing={recentSingSong ? { song: recentSingSong, artwork: artworkForSong(recentSingSong) } : null} onEnterLearn={() => { exitPractice(); if (recentLearnSong && recentLearnSong.id !== activeSong.id) chooseSong(recentLearnSong.id); navigateAndroid('lesson', 'learn'); window.scrollTo({ top: 0, behavior: 'instant' }) }} onEnterSingAlong={showSingAlong} onEnterReview={showReviewQueue} onOpenLibrary={() => showLibraryPage()} onOpenSettings={() => setSettingsOpen(true)} />}
      {IS_ANDROID_APP && activePage === 'sing-along' && <AndroidSingAlong song={activeSong} songs={allSongs} artwork={artworkForSong(activeSong)} audioReady={Boolean(audioUrl)} playing={singAlongPlaying} currentLineId={singAlongLineId} onSelectSong={chooseSong} onPlayFromStart={() => startContinuousPlayback(0, activeSong.lines[0]?.id ?? null)} onPlayFromLine={playSingAlongFromLine} onToggle={toggleSingAlong} error={audioError} onChoose={openStudySongPicker} annotations={annotations} corrections={corrections} readingStyle={readingStyle} />}
      {activePage === 'lesson' && <>
      {IS_ANDROID_APP && <AndroidLessonHeader song={activeSong} artwork={artworkForSong(activeSong)} learned={learnedLines.size} mode={mode} onMode={setMode} readingStyle={readingStyle} onReadingStyle={setReadingStyle} onChoose={openStudySongPicker} ready={readySentenceCount} generating={Boolean(sentenceExplanationJob)} onGenerate={generateCurrentSongExplanations} onWordDetails={openWordDetails} error={annotationError || audioError || sentenceExplanationError?.songId === activeSong.id && sentenceExplanationError.message} />}
      {IS_ANDROID_APP && <FloatingPlaybackSpeed rate={playbackRate} onChange={choosePlaybackRate} />}
      {/* 问 AI 固定在倍速上方，每首歌曲独立会话，提问实时带入歌词和校正读音。 */}
      {IS_ANDROID_APP && <LyricChat key={activeSong.id} song={activeSong} lineId={activeLine.id} annotations={annotations} corrections={corrections} />}
      {/* 已按用户要求移除逐句页顶部返回按钮；系统返回手势和底部导航继续可用。 */}
      {IS_DESKTOP_APP && <DesktopSongHeader song={activeSong} artwork={artworkForSong(activeSong)} learned={learnedLines.size} progress={progress} favorite={isFavorite} busy={aiBusy === 'review'} onFavorite={toggleFavorite} onReview={runAiReview} onPractice={() => startPractice('all', activeSong.id, activeLine.id)}/>}
      {!IS_DESKTOP_APP && <section className="hero anime-hero" aria-labelledby="song-title" style={{ '--hero-art': `url(${twilightStation})` }}>
        <div className="hero-art" aria-hidden="true" />
        <div className="hero-wash" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-label"><span />日语歌词 · 一句一句唱清楚</div>
          <div className="anime-hero-grid">
            <div className="song-intro">
              <p className="hero-kicker">LYRICS, SLOWLY</p>
              <p className="hero-season">夜风 · 电车 · 一首歌</p>
              <h1 id="song-title">{activeSong.title}</h1>
              {IS_ANDROID_APP && <span className="android-lesson-cover" aria-label={`当前歌曲《${activeSong.title}》封面`}>{artworkForSong(activeSong)?.artworkUrl ? <img src={artworkForSong(activeSong).artworkUrl} alt="" referrerPolicy="no-referrer" /> : activeSong.title.slice(0, 2)}</span>}
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
              <button type="button" onClick={() => showLibraryPage()}>换一首歌 <ChevronDown size={14} /></button>
            </aside>
          </div>
        </div>
      </section>}

      <section className={`practice-layout ${practiceActive ? 'guided-practice-layout' : ''}`} id="lesson" aria-label="歌词发音学习工作区">
        <aside className="lesson-rail">
          <div className="rail-heading"><span>已导入歌曲</span><span>{allSongs.length} 首</span></div>
          <ol className="song-import-list">{allSongs.map((song, index) => <li className={song.id === activeSong.id ? 'current' : ''} key={song.id}><button onClick={() => chooseSong(song.id)} type="button"><em>{String(index + 1).padStart(2, '0')}</em><span><b>{song.title}</b><small>{song.artist} · {song.lines.length} 句</small></span></button></li>)}</ol>
          <div className="learning-tip"><span>→</span><p><b>用法</b>先看自动标注，再点词修正。你保存的版本始终优先。</p></div>
        </aside>

        <section className="lyrics-panel" aria-labelledby="lyrics-heading">
          <div className="panel-head"><div><p className="eyebrow">{practiceActive ? 'LISTEN, RECALL, REVEAL' : 'AUTO ANNOTATE, THEN VERIFY'}</p><h2 id="lyrics-heading">{practiceActive ? '逐句练习' : '逐句读音'}</h2></div>{!practiceActive && <div className="view-toggle" role="group" aria-label="读音显示方式">{[['original', '原文'], ['reading', readingLabel], ['practice', '遮住练习']].map(([value, label]) => <button className={mode === value ? 'selected' : ''} onClick={() => setMode(value)} type="button" key={value}>{label}</button>)}</div>}</div>
          {!practiceActive && <div className="pronunciation-strip"><div><span className="strip-index">{annotating ? 'ANNOTATING' : annotationError ? 'OFFLINE' : 'AUTO READY'}</span><b>{annotating ? '正在为整首歌词生成读音…' : annotationError || '点击带注音的汉字词，可在右侧修改读音'}</b></div><span className="source-badge"><WandSparkles size={13} /> SudachiPy + 本地日中词典</span></div>}
          <div className="audio-tools"><p className="audio-play-tip"><Volume2 size={13} /> {audioUrl ? practiceActive ? '先听这一句，再尝试自己读出歌词。' : IS_ANDROID_APP ? '点整句区域播放，再点暂停；暂停后再点，从句首重播。' : '点击每句右侧的播放按钮；手机上也可点击整句区域播放或暂停。' : '未找到同名音频，仍可练习读音与词义。'}</p><label className="speed-control"><span>慢放</span><select value={playbackRate} onChange={(event) => choosePlaybackRate(Number(event.target.value))} aria-label="逐句播放速度"><option value={1}>1×</option><option value={0.75}>0.75×</option><option value={0.5}>0.5×</option><option value={0.25}>0.25×</option></select></label></div>
          {!practiceActive && <div className="sentence-explanation-status"><div><Sparkles size={15} /><span>{sentenceExplanationJob?.songId === activeSong.id ? `正在生成整句解析 ${sentenceExplanationJob.ready} / ${sentenceExplanationJob.total}` : readySentenceCount === activeSong.lines.length ? `整首歌的 ${readySentenceCount} 句解析已就绪` : `整句解析已准备 ${readySentenceCount} / ${activeSong.lines.length} 句`}</span></div>{readySentenceCount < activeSong.lines.length && <button type="button" disabled={Boolean(sentenceExplanationJob)} onClick={generateCurrentSongExplanations}>{sentenceExplanationJob?.songId === activeSong.id ? '生成中…' : '生成剩余解析'}</button>}</div>}
          {!practiceActive && readySentenceCount < activeSong.lines.length && <p className="sentence-explanation-disclosure">生成时会将歌词及已有译文发送给设置中的 AI 服务，可能产生 API 调用费用。</p>}
          {!practiceActive && sentenceExplanationError?.songId === activeSong.id && <p className="sentence-explanation-error" role="alert"><CircleAlert size={13} /> {sentenceExplanationError.message}</p>}
          {!IS_DESKTOP_APP && !practiceActive && <div className="practice-launch"><div><b>把这一句真正练会</b><span>先听、自己读并猜意思，再揭晓答案。</span></div><div><button className="practice-start" type="button" onClick={() => startPractice('all', activeSong.id, activeLine.id)}><BookOpenCheck size={15} /> 开始逐句练习</button>{currentSongReviewCount > 0 && <button className="practice-review-start" type="button" onClick={() => startPractice('review')}>只练待复习的 {currentSongReviewCount} 句</button>}</div></div>}
          {practiceActive && <section className="guided-card" id="guided-practice" aria-label="逐句练习卡片">
            <div className="guided-card-top"><span>{practiceScope === 'review' ? '待复习句练习' : '全曲逐句练习'}</span><button type="button" onClick={exitPractice}>退出练习 <X size={13} /></button></div>
            {practiceFinished ? <div className="guided-finished" role="status"><BookOpenCheck size={28} /><h3>本轮练习完成</h3><p>已掌握的句子会计入歌曲进度；没把握的句子留在复习清单中。</p><div><button type="button" onClick={() => startPractice('all')}>再练整首</button><button type="button" disabled={!currentSongReviewCount} onClick={() => startPractice('review')}>练习待复习的 {currentSongReviewCount} 句</button></div></div> : <>
              <p className="guided-counter">第 {practicePosition + 1} / {practiceSessionLineIds.length} 句 <span>·</span> {currentSongReviewCount} 句待复习</p>
              <h3 lang="ja">{activeLine.text}</h3>
              <p className="guided-prompt">先听原声，自己读一遍，并猜猜这句的意思。答案在你点击前不会显示。</p>
              <div className="guided-listen"><button type="button" disabled={!audioUrl} onClick={() => playLine(activeLine.id)}>{playingLineId === activeLine.id ? <Pause size={14} /> : <Play size={14} />} {playingLineId === activeLine.id ? '暂停原声' : '听这一句'}</button><span>{audioUrl ? `当前 ${playbackRate}× 速度` : '这首歌尚无音频'}</span></div>
              {audioError && <p className="guided-error" role="alert">{audioError}</p>}
              {practiceRevealed ? <div className="guided-answer" aria-live="polite"><span>读音</span><p lang={readingLang}>{activeLineReading || '自动读音尚未准备好，请先到校对页面确认。'}</p><span>中文释义</span><p>{activeLine.translation || '原 LRC 未提供中文译文，请结合词汇理解这一句。'}</p><button className="guided-sentence-explain" type="button" aria-expanded={sentenceExplanationOpen?.songId === activeSong.id && sentenceExplanationOpen.line.id === activeLine.id} aria-controls={`guided-sentence-analysis-${activeSong.id}-${activeLine.id}`} onClick={() => showSentenceExplanation(activeLine)}><Sparkles size={13} /> {sentenceExplanationOpen?.songId === activeSong.id && sentenceExplanationOpen.line.id === activeLine.id ? '收起整句解析' : '查看整句解析'}</button>{sentenceExplanationOpen?.songId === activeSong.id && sentenceExplanationOpen.line.id === activeLine.id && <SentenceAnalysis explanation={sentenceExplanationOpen.explanation} id={`guided-sentence-analysis-${activeSong.id}-${activeLine.id}`} />}<div className="guided-grade"><button type="button" onClick={() => gradePracticeLine(false)}>还要再练 · 加入复习</button><button type="button" onClick={() => gradePracticeLine(true)}>我会了 · 下一句 <Check size={14} /></button></div></div> : <button className="guided-reveal" type="button" disabled={!activeLineReading} onClick={() => setPracticeRevealed(true)}>{activeLineReading ? '揭晓读音与译文' : annotationError || '正在准备自动读音…'}</button>}
              <div className="guided-navigation"><button type="button" disabled={practicePosition === 0} onClick={() => goToPracticePosition(practicePosition - 1)}>← 上一句</button><button type="button" disabled={practicePosition + 1 >= practiceSessionLineIds.length} onClick={() => goToPracticePosition(practicePosition + 1)}>跳过这一句 →</button></div>
            </>}
          </section>}
          {!practiceActive && <>
          <p className="selection-guide"><MousePointer2 size={13} /> 按住鼠标左键向右拖过词语，松开后点高亮段右上角的“AI 解释”。</p>
          <div className="mobile-word-dock"><div><b>{focusToken.surface} <span lang={readingLang}>{focusDisplayReading}</span></b><small>{wordMeaning || '常用意思待补充'}</small></div><button type="button" onClick={openWordDetails}>查看详情</button></div>
          {reviewNeeded > 0 && <p className="annotation-tip warn"><CircleAlert size={13} /> 有 {reviewNeeded} 个词典未能确定读音，请优先人工校对。</p>}
          {aiError && <p className="annotation-tip ai-error"><CircleAlert size={13} /> {aiError}</p>}
          {aiReview && <p className="ai-review-summary"><Sparkles size={13} /> AI 已复核 {aiReview.reviewed_token_count} 个词素：{pendingAiSuggestions.length ? <>还有 {pendingAiSuggestions.length} 处待处理建议，<button type="button" onClick={() => document.getElementById('ai-review-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>查看全部</button></> : aiReview.suggestions?.length ? '所有建议均已处理。' : '未发现明显异常；仍建议以原唱为准。'}</p>}
          {IS_DESKTOP_APP && <DesktopLyricRangeControls range={desktopLyricRange} available={Boolean(audioUrl)} playing={selectedRangePlaying} paused={Boolean(selectedRangePlaybackRef.current) && !selectedRangePlaying} rate={playbackRate} onRate={choosePlaybackRate} onToggle={toggleSelectedLyricRange} onReplay={playSelectedLyricRange} onClear={clearDesktopLyricSelection}/>}
          <div className="lyrics-list">
            {activeSong.lines.map((line) => {
              const annotation = annotations?.find((item) => item.id === line.id)
              const lineTokens = annotation?.tokens
              const current = line.id === activeLine.id
              const isPlaying = playingLineId === line.id
              const isLearned = learnedLines.has(line.id)
              const lineReading = getLineReading(lineTokens, corrections, activeSong.id, line.id, readingStyle)
              const hasSentenceExplanation = hasCachedSentenceExplanation(currentSentenceCache, line)
              const sentenceExpanded = sentenceExplanationOpen?.songId === activeSong.id && sentenceExplanationOpen.line.id === line.id
              // 原点击播放保留；新增整句长按与滚动取消，抬手后不误触播放或词语详情。
              return <article id={`lyric-row-${activeSong.id}-${line.id}`} className={`lyric-row ${current ? 'active' : ''} ${IS_DESKTOP_APP && desktopSelectedLineIds.has(line.id) ? 'desktop-range-selected' : ''} ${IS_DESKTOP_APP && singAlongLineId === line.id && singAlongPlaying ? 'desktop-now-playing' : ''}`} onPointerDownCapture={(event) => handleLyricPointerDown(event, line.id)} onPointerMoveCapture={moveLyricPress} onPointerUpCapture={(event) => { cancelLyricPress(); suppressLyricPressClick(event) }} onPointerCancel={cancelLyricPress} onPointerLeave={cancelLyricPress} onClickCapture={(event) => handleLyricClickCapture(event, line.id)} onContextMenu={(event) => { if (IS_ANDROID_APP) event.preventDefault() }} onClick={(event) => handleLyricRowClick(event, line.id)} key={`${activeSong.id}-${line.id}`}>
                <span className="line-number">{String(line.displayNumber).padStart(2, '0')}</span>
                <div className="auto-line-wrap">
                  <div className="japanese"><AnnotatedLine interactive={!IS_ANDROID_APP} tokens={lineTokens} corrections={corrections} songId={activeSong.id} lineId={line.id} mode={mode} readingStyle={readingStyle} selectedIndex={current ? selectedTokenIndex : -1} selectionRange={dragSelection?.lineId === line.id ? dragSelection : selectedPhraseRange?.lineId === line.id ? selectedPhraseRange : null} showSelectionAction={selectedText?.lineId === line.id && selectedPhraseRange?.lineId === line.id} onStartSelection={(tokenIndex) => beginTokenSelection(line.id, tokenIndex)} onExtendSelection={(tokenIndex) => extendTokenSelection(line.id, tokenIndex)} onFinishSelection={finishTokenSelection} onExplainSelection={() => askAiToExplain(selectedText)} onSelectToken={(tokenIndex) => handleTokenClick(line.id, tokenIndex)} /></div>
                  <div className={`reading ${lineTokens ? '' : 'needs-review'}`}>{mode === 'reading' ? lineReading || '正在生成读音…' : mode === 'practice' ? '读音已隐藏，尝试自己读出这一句' : `切换到“${readingLabel}”查看自动标注`}</div>
                  {line.translation && <div className="translation lyric-translation">{line.translation}</div>}
                </div>
                <div className="line-actions"><button className={`line-action line-play ${isPlaying ? 'playing' : ''}`} type="button" onClick={(event) => { event.stopPropagation(); playLine(line.id) }} aria-label={`${isPlaying ? '暂停' : '播放'}第 ${line.displayNumber} 句`} title={`${isPlaying ? '暂停' : '播放'}这一句`}>{isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button><button className={`line-mastery ${isLearned ? 'mastered' : ''}`} type="button" aria-pressed={isLearned} onClick={(event) => { event.stopPropagation(); toggleLearnedLine(line.id) }} title={isLearned ? '点击改为未掌握' : '点击标记为已掌握'}>{isLearned ? <Check size={12} /> : <Circle size={11} />}<span>{isLearned ? '已掌握' : '未掌握'}</span></button><button className="sentence-explain-link" type="button" aria-expanded={sentenceExpanded} aria-controls={`sentence-analysis-${activeSong.id}-${line.id}`} disabled={!hasSentenceExplanation && Boolean(sentenceExplanationJob)} onClick={(event) => { event.stopPropagation(); showSentenceExplanation(line) }}><Sparkles size={11} /> {sentenceExpanded ? '收起解析' : hasSentenceExplanation ? '查看解析' : sentenceExplanationJob ? '生成中…' : '生成解析'}</button></div>
                {IS_ANDROID_APP && <span className="android-line-state">{isPlaying ? '♪ 正在播放' : current ? '点整句播放 · 长按编辑' : ''}</span>}
                {sentenceExpanded && <SentenceAnalysis explanation={sentenceExplanationOpen.explanation} id={`sentence-analysis-${activeSong.id}-${line.id}`} />}
              </article>
            })}
          </div>
          <div className="lyrics-footer"><span>点击任一词即可在右侧校对；选中短语可请求 AI 解释</span><span>每句右侧可切换掌握状态</span></div>
          </>}
        </section>

        {!practiceActive && <aside className="word-panel" aria-labelledby="word-heading">
          <div className="panel-head compact"><div><p className="eyebrow">EDIT THE READING</p><h2 id="word-heading">校对读音</h2></div><span className={`annotation-state ${corrections[focusKey] ? 'corrected' : ''}`}>{corrections[focusKey] ? '已修正' : '自动初稿'}</span></div>
          <div className="word-card correction-card">
            <div className="word-topline"><span className="word-level">{focusToken.part_of_speech || '词素'}</span><button type="button" aria-label="选中词"><Pencil size={15} /></button></div>
            <div className="word-main"><h3>{focusToken.surface}</h3><p className="word-kana" lang={readingLang}>{focusDisplayReading || '暂无词典读音'}</p><p className="word-meaning">{wordMeaning || '常用意思暂未收录，可在详情中补充'}</p><button className="detail-link" type="button" onClick={openWordDetails}>查看详情 <ChevronRight size={14} /></button></div>
            {focusSuggestion && <div className="ai-suggestion"><span><Sparkles size={12} /> AI 复核建议 · {(focusSuggestion.confidence * 100).toFixed(0)}%</span><p>建议读作「{displayReading(focusSuggestion.suggested_reading, readingStyle)}」：{focusSuggestion.reason}</p><button type="button" onClick={applyAiSuggestion}>采用建议</button></div>}
            <label className="reading-editor"><span>{readingStyle === 'romaji' ? '假名输入（用于校对）' : '假名读音'}</span><input value={draftReading} onChange={(event) => setDraftReading(event.target.value)} placeholder="输入平假名或片假名" lang="ja" /><small>{readingStyle === 'romaji' ? `罗马音预览：${displayReading(draftReading, 'romaji') || '请先输入假名'}` : '如：わすれた / もの / かえる'}</small></label>
            <div className="editor-actions"><button className="save-reading" onClick={saveCorrection} type="button"><Save size={13} /> 保存修正</button>{corrections[focusKey] && <button className="reset-reading" onClick={resetCorrection} type="button">恢复初稿</button>}</div>
          </div>
          {pendingAiSuggestions.length > 0 && <section className="ai-review-queue" id="ai-review-queue" aria-labelledby="ai-review-queue-title">
            <div><span className="eyebrow">AI REVIEW QUEUE</span><h3 id="ai-review-queue-title">复核建议 <b>{pendingAiSuggestions.length}</b></h3></div>
            <ol>{pendingAiSuggestions.map((suggestion) => <li className={suggestion.line_id === activeLine.id && suggestion.token_index === focusToken.index ? 'current' : ''} key={`${suggestion.line_id}-${suggestion.token_index}`}><button type="button" onClick={() => jumpToAiSuggestion(suggestion)}><span>第 {activeSong.lines.find((line) => line.id === suggestion.line_id)?.displayNumber} 句 · {suggestion.surface}</span><small>{displayReading(suggestion.original_reading, readingStyle)} <ChevronRight size={11} /> {displayReading(suggestion.suggested_reading, readingStyle)}</small></button></li>)}</ol>
          </section>}
          <div className="word-context"><span>所在句子</span><p>{activeLine.text}</p><small>点击歌词中的其他词，可继续逐词校对。</small></div>
          <div className="practice-checklist"><span>校对建议</span><p>① 先确认自动读音是否合理<br />② 歌词特殊读法按原唱实际修正<br />③ 将有疑问的整句加入复习</p></div>
          <button className={`review-button ${hasReview ? 'added' : ''}`} onClick={toggleReview} type="button">{hasReview ? <><Check size={13} /> 已加入今日复习</> : <><Plus size={13} /> 加入今日复习</>}</button>
        </aside>}
      </section>

      {/* 旧网页复习区仍保留在学习页；安卓从“复习模式”入口打开独立清单。 */}
      {!IS_ANDROID_APP && !IS_DESKTOP_APP && <section className="review-queue-section" id="review-queue" aria-labelledby="review-queue-title">
        <div className="review-queue-heading"><div><p className="eyebrow">WORDS IN CONTEXT, ONE LINE AT A TIME</p><h2 id="review-queue-title">待复习的句子 <span>{reviewQueue.length}</span></h2><p>练习时选择“还要再练”，句子就会来到这里；学会后会自动移出。</p></div>{currentSongReviewCount > 0 && <button type="button" onClick={() => startPractice('review')}>练习本首待复习句 <ChevronRight size={15} /></button>}</div>
        {reviewQueue.length ? <ol className="review-line-list">{reviewQueue.map(({ song, line }) => <li key={`${song.id}:${line.id}`}><button type="button" onClick={() => startPractice('review', song.id, line.id)}><span>{song.title} · 第 {line.displayNumber} 句</span><b lang="ja">{line.text}</b><small>开始练习 <ChevronRight size={13} /></small></button></li>)}</ol> : <p className="review-queue-empty">目前没有待复习句。开始逐句练习，把没把握的句子留下来。</p>}
      </section>}

      {!IS_DESKTOP_APP && <section className="method-section"><div className="method-title"><p className="eyebrow">THE CORRECTION LOOP</p><h2>自动起稿，<br />由学习者校准。</h2></div><div className="method-cards"><article><span>01</span><h3>全曲自动注音</h3><p>导入任意日语歌词后，由 Sudachi 词典逐词生成读音初稿。</p></article><article><span>02</span><h3>AI 复核与人工确认</h3><p>AI 只标出可能不合理的读法；采用、修改或忽略建议始终由你决定。</p></article><article><span>03</span><h3>按语境理解词汇</h3><p>选中词或短语再请求讲解，结合相邻歌词学习词义和变形。</p></article></div></section>}

      </>}

      {IS_DESKTOP_APP && activePage === 'review-list' && <DesktopReview queue={reviewQueue} onPractice={(songId,lineId) => startPractice('review',songId,lineId)}/>}
      {IS_ANDROID_APP && activePage === 'review-list' && <section className="android-review-detail" aria-labelledby="review-queue-title">
        <button className="android-detail-back" type="button" onClick={goBackAndroid}>‹　返回复习</button>
        <p className="android-home-eyebrow">REVIEW / 复习</p>
        <h1 id="review-queue-title">待复习的句子 <span>{reviewQueue.length}</span></h1>
        <p>练习时选择“还要再练”，句子就会来到这里；学会后会自动移出。</p>
        {reviewQueue.length ? <ol className="review-line-list">{reviewQueue.map(({ song, line }) => <li key={`${song.id}:${line.id}`}><button type="button" onClick={() => startPractice('review', song.id, line.id)}><span>{song.title} · 第 {line.displayNumber} 句</span><b lang="ja">{line.text}</b><small>开始练习 <ChevronRight size={13} /></small></button></li>)}</ol> : <div className="review-queue-empty">目前没有待复习句。学习时可把没把握的句子加入复习。</div>}
      </section>}

      {activePage === 'library' && <section className="library-section library-page" id="library" aria-labelledby="library-title">
        {IS_ANDROID_APP && <AndroidSongLibrary songs={androidLibrarySongs} total={androidLibraryTotal} search={librarySearch} onSearch={setLibrarySearch} onImport={openImportDialog} artworkFor={artworkForSong} learnedBySong={learnedBySong} onOpen={chooseSongFromLibrary} onDelete={removeImportedSong} onArtwork={openArtworkEditor} onEdit={setEditingDetailsSong} deletingSongId={deletingSongId} activeSongId={activeSong.id} />}
        {/* 原网页歌曲库保留作对照；安卓使用上方独立的简洁布局。 */}
        {IS_DESKTOP_APP && <DesktopLibrary songs={visibleLibrarySongs} search={librarySearch} onSearch={setLibrarySearch} favoriteIds={favoriteSongIds} learnedBySong={learnedBySong} activeId={activeSong.id} artworkFor={artworkForSong} onOpen={chooseSongFromLibrary} onImport={openImportDialog} onEdit={setEditingDetailsSong} onArtwork={openArtworkEditor} onDelete={removeImportedSong} deletingId={deletingSongId}/>}
        {!IS_ANDROID_APP && !IS_DESKTOP_APP && <>
        <div className="library-top"><div><p className="eyebrow">YOUR IMPORTED SONGS</p><h2 id="library-title">歌曲库</h2><p>从已导入的歌词中选一首，继续练习发音与词汇。</p></div><div className="library-top-actions"><label className="library-search"><Search size={14} /><input id="library-search" type="search" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="搜索歌名或歌手" aria-label="搜索歌名或歌手" />{librarySearch && <button type="button" onClick={() => setLibrarySearch('')} aria-label="清除搜索"><X size={13} /></button>}</label><span className="library-count">{librarySearch ? `找到 ${visibleLibrarySongs.length} / ${allSongs.length} 首` : `已导入 ${allSongs.length} 首`}</span><button className="library-import-trigger" type="button" onClick={openImportDialog}><Upload size={14} /> 导入歌曲</button>{!IS_ANDROID_APP && !IS_DESKTOP_APP && <button className="library-import-trigger" type="button" onClick={shareComputerSongs}><Upload size={14} /> 共享到手机</button>}</div></div>
        <div className="library-backup-bar"><div><b>保存你的学习记录</b><span>在设置中统一管理数据备份与 AI 服务。</span></div><div className="library-backup-actions"><button type="button" onClick={() => setSettingsOpen(true)}><Settings size={14} /> 数据管理</button></div></div>
        {/* 电脑网页主动开启一次性传歌，手机才能看见网页缓存中的歌曲。 */}
        {!IS_ANDROID_APP && computerShare && <div className="computer-share-card" role="status">
          {computerShare.busy ? <p><LoaderCircle className="spin" size={16} /> 正在读取电脑网页保存的歌曲和音频…</p>
            : computerShare.error ? <><p>{computerShare.error}</p><button type="button" onClick={shareComputerSongs}>重试</button></>
              : <><h3>电脑网页已准备 {computerShare.count} 首歌曲</h3><p>请在手机 UTA 中选择“从电脑网页导入”，输入下面的连接码。USB 和 Wi-Fi 使用同一个码，30 分钟后失效。</p>{/* 旧实现保留作对照：原来分别显示 USB 四位码和 Wi-Fi 长码。 */}<div className="computer-share-codes"><div><span>USB / Wi-Fi 通用：4 位数字</span><strong className="computer-share-code">{computerShare.pin}</strong></div></div>{/* 旧实现保留作对照：Wi-Fi 曾要求手机填写电脑地址。 */}<p>USB：保持数据线和 USB 调试连接。Wi-Fi：手机和电脑连接同一 Wi-Fi，建议电脑连接手机热点，查找成功率更高；若找不到，可手动填写地址 {computerShare.addresses?.join(' 或 ') || '请查看电脑的局域网 IP'}。</p><button type="button" onClick={stopComputerSharing}>结束本次共享</button></>}
        </div>}
        {backupError && !backupPreview && <p className="library-backup-error" role="alert"><CircleAlert size={14} /> {backupError}</p>}
        {visibleLibrarySongs.length ? <div className="song-library-grid">{visibleLibrarySongs.map((song, index) => {
          // 本机显式选择优先于歌曲原有封面；默认封面也是一种明确选择。
          const chosen = Object.hasOwn(artworkOverrides, song.id) ? artworkOverrides[song.id] : song
          const artwork = chosen.artworkChoice === 'default' ? null
            : chosen.artworkUrl ? { artworkUrl: chosen.artworkUrl, sourceUrl: chosen.artworkSourceUrl, provider: chosen.artworkProvider }
              : songArtworkBySource[song.sourceFile]
          const learnedCount = (learnedBySong[song.id] || []).filter((lineId) => song.lines.some((line) => line.id === lineId)).length
          const isCurrentSong = song.id === activeSong.id
          return <article className={`library-song-card ${isCurrentSong ? 'current' : ''}`} key={song.id}>
            <button className="library-song-open" type="button" onClick={() => chooseSongFromLibrary(song.id)} aria-label={`学习 ${song.title}，${song.artist}`}>
              <span className="library-cover">
                <span className="library-cover-fallback" aria-hidden="true">{song.title.slice(0, 2)}</span>
                {artwork?.artworkUrl && <img src={artwork.artworkUrl} alt={`${song.title} 的发行封面`} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true }} />}
                <span className="library-cover-shade" aria-hidden="true" />
                <span className="library-card-index">{String(index + 1).padStart(2, '0')}</span>
                {isCurrentSong && <span className="library-current-badge">正在学习</span>}
                <span className="library-local-badge">{song.isLocal ? '网页导入 · 当前浏览器' : song.isDemo ? '内置原创示例' : '来自项目文件夹'}</span>
              </span>
              <span className="library-card-copy"><b>{song.title}</b><small>{song.artist}</small><span><BookOpenCheck size={13} /> {learnedCount} / {song.lines.length} 句已掌握</span></span>
            </button>
            <p className="library-source-note">{song.isLocal ? '可在此删除当前浏览器保存的歌曲，不会删除电脑上的原文件。' : song.isDemo ? '随项目提供的原创练习示例，不提供网页删除入口。' : '如需移除，请将 LRC 移出 geci 后重新同步；构建部署版需重新构建并部署。'}</p>
            {artwork?.sourceUrl && <a className="library-artwork-source" href={artwork.sourceUrl} target="_blank" rel="noreferrer">封面来源 · {artwork.provider || 'Apple Music'}</a>}
            <button className="library-artwork-edit" type="button" onClick={() => openArtworkEditor(song)}>更换封面</button>
            {song.isLocal && <button className="library-delete-button" type="button" disabled={deletingSongId === song.id} onClick={() => removeImportedSong(song)} aria-label={`删除 ${song.title}`} title="删除这首本地导入歌曲"><Trash2 size={13} /> {deletingSongId === song.id ? '删除中' : '删除'}</button>}
          </article>
        })}</div> : <div className="library-empty-search"><Search size={20} /><p>没有找到匹配的歌曲</p><button type="button" onClick={() => setLibrarySearch('')}>清除搜索</button></div>}
        </>}
      </section>}
    </main>
    {IS_DESKTOP_APP && <DesktopPlayer song={activeSong} artwork={artworkForSong(activeSong)} available={Boolean(audioUrl)} playing={desktopAudio.playing} currentTime={desktopAudio.time} duration={desktopAudio.duration} rate={playbackRate} error={audioError || annotationError} onToggle={toggleSingAlong} onSeek={seekDesktopAudio} onRate={choosePlaybackRate} onPrevious={() => playDesktopAdjacent(-1)} onNext={() => playDesktopAdjacent(1)} volume={desktopVolume} onVolume={value => { setDesktopVolume(value); if (audioRef.current) audioRef.current.volume = value }}/>}
    {IS_ANDROID_APP && <AndroidBottomNav activeTab={mobileTab} onSelect={showMobileTab} />}

    {editingDetailsSong && <SongDetailsEditor key={editingDetailsSong.id} song={editingDetailsSong} onClose={() => { if (!editingDetailsBusy) setEditingDetailsSong(null) }} onSave={saveSongDetails} busy={editingDetailsBusy} />}

    {editingArtworkSong && <div className="settings-backdrop" onClick={() => { if (!artworkEditSaving) setEditingArtworkSong(null) }}><section className="artwork-edit-dialog" role="dialog" aria-modal="true" aria-label={`更换《${editingArtworkSong.title}》的封面`} onClick={(event) => event.stopPropagation()}>
      <button className="song-import-close" type="button" disabled={artworkEditSaving} onClick={() => setEditingArtworkSong(null)} aria-label="关闭封面选择"><X size={18} /></button>
      <h2>更换《{editingArtworkSong.title}》的封面</h2><p>可从音乐平台候选中选择、上传图片，或使用默认封面。</p>
      <ArtworkPicker title={editingArtworkSong.title} artist={editingArtworkSong.artist} selected={editingArtworkChoice} onSelect={setEditingArtworkChoice} onBusy={setArtworkEditBusy} />
      {editingArtworkChoice?.artworkUrl && <div className="artwork-edit-preview"><img src={editingArtworkChoice.artworkUrl} alt="选中的封面" referrerPolicy="no-referrer" /><span>将展示：{editingArtworkChoice.artworkProvider}</span></div>}
      {artworkEditError && <p className="artwork-picker-error" role="alert">{artworkEditError}</p>}
      <div className="artwork-edit-actions"><button type="button" disabled={artworkEditSaving} onClick={() => setEditingArtworkSong(null)}>取消</button><button type="button" disabled={artworkEditSaving || artworkEditBusy} onClick={saveArtworkEditor}>{artworkEditSaving ? '正在保存到本机…' : '保存封面'}</button></div>
    </section></div>}

    {/* 旧网页页脚保留；安卓让底部主导航固定在屏幕下沿。 */}
    {!IS_ANDROID_APP && !IS_DESKTOP_APP && <footer><span>UTA. Learn Japanese, one lyric at a time.</span><span>自动注音在本机生成 · 词义数据：<a href="https://github.com/tomoshi-app/tomoshi-dict-data" target="_blank" rel="noreferrer">Tomoshi / EDRDG</a> · AI 请求仅在你主动点击后发起</span></footer>}

    {settingsOpen && <SettingsDialog updates={appUpdates} onCloudExport={createCloudData} readingStyle={readingStyle} onReadingStyleChange={setReadingStyle} readingFontSize={readingFontSize} onReadingFontSizeChange={value => setReadingFontSize(normalizeReadingFontSize(value))} lineReadingFontSize={lineReadingFontSize} onLineReadingFontSizeChange={value => setLineReadingFontSize(normalizeLineReadingFontSize(value))} onClose={() => setSettingsOpen(false)} onExport={exportLearningData} onRestore={async (file) => { const ready = await prepareBackupRestore(file); if (ready) setSettingsOpen(false) }} backupBusy={backupBusy} backupError={backupError} />}
    {backupPreview && <div className="backup-backdrop" role="presentation" onClick={() => { if (backupBusy !== 'restore') { setBackupPreview(null); setBackupError('') } }}><section className="backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-dialog-title" onClick={(event) => event.stopPropagation()}>
      <button className="backup-close" type="button" disabled={backupBusy === 'restore'} onClick={() => { setBackupPreview(null); setBackupError('') }} aria-label="关闭备份预览"><X size={18} /></button>
      <p className="eyebrow">RESTORE LOCAL DATA</p><h2 id="backup-dialog-title">确认恢复备份</h2>
      <p className="backup-file-name">{backupPreview.file.name || 'UTA 备份文件'}</p>
      {backupPreview.extras && <p className="backup-cloud-note">包含个人资料、头像和历史对话。{backupPreview.extras.ai?.api_key ? <strong role="alert">此备份包含 API Key，请妥善保管。</strong> : '不含 API Key；恢复后需重新填写 AI 密钥。'}</p>}
      <dl className="backup-summary"><div><dt>备份时间</dt><dd>{new Date(backupPreview.manifest.createdAt).toLocaleString('zh-CN')}</dd></div><div><dt>导入歌曲</dt><dd>{backupPreview.manifest.songs.length} 首（含音频）</dd></div><div><dt>读音修正</dt><dd>{Object.keys(backupPreview.manifest.progress.corrections).length} 处</dd></div><div><dt>待复习句</dt><dd>{backupPreview.manifest.progress.reviewItems.length} 句</dd></div><div><dt>文件大小</dt><dd>{(backupPreview.file.size / 1048576).toFixed(1)} MB</dd></div></dl>
      <p className="backup-warning"><CircleAlert size={16} /> 恢复会替换当前保存的导入歌曲和学习数据，包括已掌握句子、读音修正与复习清单。建议先导出当前数据。</p>
      {backupError && <p className="library-backup-error" role="alert">{backupError}</p>}
      <div className="backup-dialog-actions"><button type="button" disabled={backupBusy === 'restore'} onClick={() => { setBackupPreview(null); setBackupError('') }}>取消</button><button type="button" disabled={backupBusy === 'restore'} onClick={restoreLearningData}>{backupBusy === 'restore' ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}{backupBusy === 'restore' ? '正在恢复…' : '覆盖当前数据并恢复'}</button></div>
    </section></div>}

    {importOpen && <div className="song-import-backdrop" role="presentation" onClick={closeImportDialog}>
      {/* 手机先选来源；原有的手机文件导入表单仍可直接使用。 */}
      {importSource === null ? <section className="song-import-dialog import-source-dialog" role="dialog" aria-modal="true" aria-labelledby="import-source-title" onClick={(event) => event.stopPropagation()}>
        <button className="song-import-close" type="button" onClick={closeImportDialog} aria-label="关闭导入窗口"><X size={18} /></button>
        <p className="eyebrow">CHOOSE A SOURCE</p><h2 id="import-source-title">从哪里导入歌曲？</h2>
        <p className="song-import-intro">你可以选手机上的歌词和音频文件，也可以连接电脑网页，选择它已经保存的歌曲。</p>
        <div className="import-source-options"><button type="button" onClick={() => setImportSource('phone')}><strong>从手机文件导入</strong><span>选择手机里的 LRC 歌词和音频文件。</span></button><button type="button" onClick={() => setImportSource('computer')}><strong>从电脑网页导入</strong><span>连接电脑后查看已有歌曲，可全部或部分导入。</span></button></div>
      </section> : importSource === 'computer' ? <ComputerImportDialog onClose={closeImportDialog} onImport={importSelectedComputerSongs} existingSongIds={localSongs.map((song) => song.id)} /> : IS_DESKTOP_APP && importSource === 'batch' ? <BatchSongImportDialog onClose={closeImportDialog} onSwitchSingle={() => setImportSource('phone')} onImport={importLocalSongBatch} busy={importBusy} /> : <form className="song-import-dialog" onSubmit={(event) => { event.preventDefault(); importLocalSong() }} onClick={(event) => event.stopPropagation()}>
      <button className="song-import-close" type="button" onClick={closeImportDialog} aria-label="关闭导入窗口"><X size={18} /></button>
      <p className="eyebrow">ADD A LOCAL SONG</p><h2>导入歌曲开始学习</h2>
      {IS_DESKTOP_APP && <nav className="desktop-import-modes" aria-label="歌曲导入方式"><button type="button" aria-pressed="true">单首导入</button><button type="button" disabled={importBusy || importPreparing} onClick={() => setImportSource('batch')}>批量导入</button></nav>}
      <p className="song-import-intro">选择音频和 LRC，或先选音频再联网查找歌词。检查歌词、时间与封面后即可保存。</p>
      {/* 旧版先选 LRC 再选音频；现在让音频在前，选中后即可自动搜索歌词。 */}
      <label className={`song-file-field ${importAudioFile ? 'selected' : ''}`}><span>01 · 原声音频</span><strong>{importAudioFile?.name || '选择 MP3、M4A、WAV、OGG 等音频'}</strong><small>{importAudioGuess?.title ? `识别：${importAudioGuess.title}${importAudioGuess.artist ? ` · ${importAudioGuess.artist}` : ''}，正在自动查找歌词` : '选择后会按音频标签或文件名自动查找歌词'}</small><input key={importAudioFile?.name || 'empty-audio'} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" onChange={(event) => chooseImportAudioFile(event.target.files?.[0] || null)} /></label>
      <label className={`song-file-field ${importLrcFile ? 'selected' : ''}`}><span>02 · 歌词文件</span><strong>{importLrcFile?.name || '选择 .lrc 文件，或从搜索结果选用'}</strong><small>需要每句开头的时间戳，例如 [01:23.45]</small><input key={importLrcFile?.name || 'empty-lrc'} type="file" accept=".lrc,text/plain" onChange={(event) => prepareLrcPreview(event.target.files?.[0] || null)} /></label>
      {/* 音频可先选；在线命中同步歌词后直接生成同等的 LRC 文件进入原预览流程。 */}
      <OnlineSongSearch onChooseLyrics={prepareLrcPreview} autoQuery={importAutoQuery} />
      {importPreparing && <p className="import-preview-loading"><LoaderCircle className="spin" size={14} /> 正在解析歌词与译文…</p>}
      {importDraft && <section className="import-preview" aria-labelledby="import-preview-title">
        <div className="import-preview-heading"><div><p className="eyebrow">REVIEW BEFORE SAVING</p><h3 id="import-preview-title">导入预览</h3></div><span>{importDraft.lines.length} 句 · 歌名与歌手资料行已排除</span></div>
        <div className="import-meta-fields"><label>歌曲名<input value={importDraft.title} onChange={(event) => updateImportMetadata('title', event.target.value)} maxLength={160} /></label><label>歌手<input value={importDraft.artist} onChange={(event) => updateImportMetadata('artist', event.target.value)} maxLength={160} /></label></div>
        {/* 旧单来源封面预览保留作对照，实际使用下方多来源选择器。 */}{false && <div className="import-cover-preview"><div className="import-cover-thumb"><span>{importDraft.title.slice(0, 2) || 'UTA'}</span>{/^https?:\/\//i.test(importArtworkUrl) && <img key={importArtworkUrl} src={importArtworkUrl} alt="候选歌曲封面" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true }} />}</div><div className="import-cover-controls"><b>封面预览</b><p>{importArtworkStatus === 'loading' ? '正在按歌名与歌手查找封面…' : importArtworkStatus === 'found' ? '已找到候选封面，请核对是否正确。' : importArtworkStatus === 'none' ? '未找到可靠封面，可填写链接或使用默认封面。' : importArtworkStatus === 'manual' ? '使用你填写的封面链接。' : importArtworkStatus === 'default' ? '将使用默认封面。' : '请查找封面，或选择默认封面。'}</p><div><button type="button" disabled={importArtworkStatus === 'loading'} onClick={() => searchImportArtwork(importDraft.title, importDraft.artist)}>重新查找</button><button type="button" onClick={useDefaultImportArtwork}>使用默认封面</button></div><label>也可以填写封面图片链接<input type="url" value={importArtworkUrl} onChange={(event) => changeImportArtworkUrl(event.target.value)} placeholder="https://example.com/cover.jpg" /></label>{importArtworkStatus === 'found' && importArtwork?.artworkSourceUrl && <a href={importArtwork.artworkSourceUrl} target="_blank" rel="noreferrer">查看封面来源 · {importArtwork.artworkProvider || 'Apple Music'}</a>}</div></div>}
        <ArtworkPicker title={importDraft.title} artist={importDraft.artist} selected={importArtwork} onSelect={selectImportArtwork} />
        <div className="import-lines-heading"><div><b>歌词与时间轴</b><span>可修改时间、日文、中文译文；保存时会按时间排序。</span></div><button type="button" onClick={addImportLine}><Plus size={13} /> 添加一句</button></div>
        <ol className="import-preview-lines">{importDraft.lines.map((line, index) => <li key={line.draftId}><span>{String(index + 1).padStart(2, '0')}</span><div><label>时间戳<input value={line.timeText} onChange={(event) => updateImportLine(line.draftId, 'timeText', event.target.value)} placeholder="00:12.345" aria-label={`第 ${index + 1} 句时间戳`} /></label><label>日文歌词<input value={line.text} onChange={(event) => updateImportLine(line.draftId, 'text', event.target.value)} maxLength={500} lang="ja" aria-label={`第 ${index + 1} 句日文歌词`} /></label><label>中文译文<input value={line.translation} onChange={(event) => updateImportLine(line.draftId, 'translation', event.target.value)} maxLength={500} aria-label={`第 ${index + 1} 句中文译文`} placeholder="没有译文可留空" /></label></div><button className="import-remove-line" type="button" onClick={() => removeImportLine(line.draftId)} aria-label={`删除第 ${index + 1} 句`} title="删除这一句"><Trash2 size={14} /></button></li>)}</ol>
      </section>}
      {/* 原来强制导入时等待全曲解析；现在让用户明确选择，保存成功即关闭导入窗口。 */}
      <fieldset className="import-ai-choice"><legend>AI 解析</legend><label><input type="radio" name="import-ai-mode" checked={importAiMode === 'later'} onChange={() => setImportAiMode('later')} /><span><strong>直接导入</strong><small>立即开始学习，需要时在学习页生成整句解析。</small></span></label><label><input type="radio" name="import-ai-mode" checked={importAiMode === 'background'} onChange={() => setImportAiMode('background')} /><span><strong>导入并在后台生成</strong><small>保存后即可继续使用；解析会逐句完成，可能产生 AI 调用费用。</small></span></label></fieldset>
      {importAiMode === 'background' && <p className="import-ai-disclosure"><Sparkles size={14} /> AI 生成期间可以继续在应用内学习。若应用被系统关闭，未完成的句子会在下次打开时续做；需要先在设置中配置 AI 服务。</p>}
      {/* 旧导入等待提示保留供对照：{importAiProgress && <p className="import-ai-progress">正在生成整句解析</p>} */}
      {importError && <p className="song-import-error"><CircleAlert size={14} /> {importError}</p>}
      <div className="song-import-actions"><button type="button" onClick={closeImportDialog} disabled={importBusy}>取消</button><button className="song-import-submit" type="submit" disabled={importBusy || importPreparing || importArtworkStatus === 'loading'}>{importBusy ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}{importBusy ? '正在保存…' : importAiMode === 'background' ? '导入并后台生成' : '直接导入歌曲'}</button></div>
    </form>}</div>}

    {detailOpen && <div className="detail-backdrop" role="presentation" onClick={closeDetail}><section className={`word-detail ${detailView === 'ai' ? 'ai-only-detail' : ''}`} role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={(event) => event.stopPropagation()}>
      <button className="detail-close" type="button" onClick={closeDetail} aria-label="关闭详情"><X size={18} /></button>
      {detailView !== 'ai' && <p className="eyebrow">WORD DETAILS</p>}
      {detailView !== 'ai' && <><div className="detail-heading"><div><h2 id="detail-title">{focusToken.surface}</h2><p lang={readingLang}>{focusDisplayReading || '读音待校对'}</p></div><span>{focusToken.part_of_speech || '词素'}</span></div>
      <dl className="detail-metadata"><div><dt>常用意思</dt><dd>{wordMeaning || '暂未收录；可在下方补充。'}</dd></div><div><dt>词典形</dt><dd>{focusToken.dictionary_form || focusToken.surface}</dd></div><div><dt>当前形式</dt><dd>{focusToken.surface}</dd></div><div><dt>活用信息</dt><dd>{focusToken.inflection_type || '无活用'} · {focusToken.inflection_form || '基本形'}</dd></div></dl>
      <div className="meaning-editor"><label htmlFor="meaning-input">补充或修正常用意思</label><input id="meaning-input" value={draftMeaning} onChange={(event) => setDraftMeaning(event.target.value)} placeholder="例如：梦；梦想" /><button type="button" onClick={saveMeaning}><Save size={14} /> 保存意思</button></div>
      <div className="detail-ai-action"><div><Bot size={15} /><span>想了解这个词在歌词中的具体用法？</span></div><button type="button" disabled={aiBusy === 'explain'} onClick={() => askAiToExplain({ text: focusToken.surface, lineId: activeLine.id })}>{aiBusy === 'explain' ? <LoaderCircle className="spin" size={13} /> : <Sparkles size={13} />} AI 语境讲解</button></div></>}
      {aiExplanation && <section className="ai-explanation"><p className="eyebrow">AI IN CONTEXT</p><h3 id={detailView === 'ai' ? 'detail-title' : undefined}>{aiExplanation.term} <small lang={readingLang}>{displayReading(aiExplanation.reading, readingStyle)} · 本句推荐</small></h3><dl><div><dt>常用义</dt><dd>{aiExplanation.common_meaning || '未给出'}</dd></div><div><dt>歌词中</dt><dd>{aiExplanation.contextual_meaning || '未给出'}</dd></div>{aiExplanation.dictionary_form && <div><dt>词典形</dt><dd>{aiExplanation.dictionary_form}</dd></div>}{aiExplanation.conjugation && <div><dt>变形</dt><dd>{aiExplanation.conjugation}</dd></div>}</dl>{aiExplanation.alternative_readings?.length > 0 && <div className="alternative-readings"><h4>其他常见读音</h4><ul>{aiExplanation.alternative_readings.map((item) => <li key={item.reading}><b lang={readingLang}>{displayReading(item.reading, readingStyle)}</b><span>{item.meaning || '常见异读'}</span>{item.when_to_use && <small>{item.when_to_use}</small>}</li>)}</ul></div>}{aiExplanation.usages?.length > 0 && <ul>{aiExplanation.usages.map((item) => <li key={item}>{item}</li>)}</ul>}{aiExplanation.learning_tip && <p className="ai-tip">学习提示：{aiExplanation.learning_tip}</p>}{aiExplanation.caution && <p className="ai-caution">注意：{aiExplanation.caution}</p>}</section>}
      {detailView !== 'ai' && <><div className="detail-examples"><h3>常见搭配</h3>{focusToken.examples?.length ? <ul>{focusToken.examples.map((example) => <li key={example}>{example}</li>)}</ul> : <p>暂未收录搭配。可先根据当前歌词语境补充常用意思。</p>}</div>
      <div className="detail-line"><span>歌词语境</span><p>{activeLine.text}</p></div></>}
    </section></div>}
    {/* 原来所有提示使用相同颜色；失败提示用红色并作为错误宣告。 */}
    {/* <div className={`toast ${toast ? 'visible' : ''}`} role="status">{toast}</div> */}
    <div className={`toast ${toast ? 'visible' : ''} ${/失败|错误|无法/.test(toast) ? 'toast-error' : ''}`} role={/失败|错误|无法/.test(toast) ? 'alert' : 'status'}>{toast}</div>
  </div>
}
