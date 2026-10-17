import { useEffect, useMemo, useRef, useState } from 'react'
// 原导入保留对照：import { Capacitor } from '@capacitor/core'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { BookOpenCheck, Bot, Check, ChevronDown, ChevronRight, Circle, CircleAlert, Download, Heart, LoaderCircle, MousePointer2, Pause, Pencil, Play, Plus, Save, Search, Settings, Sparkles, Trash2, Upload, Volume2, WandSparkles, X } from 'lucide-react'
import AnnotatedLine from './components/AnnotatedLine'
import ComputerImportDialog from './components/ComputerImportDialog'
import ArtworkPicker from './components/ArtworkPicker'
import AndroidHome, { AndroidBottomNav } from './components/AndroidHome'
import AndroidSongLibrary from './components/AndroidSongLibrary'
import DeleteSongDialog from './components/DeleteSongDialog'
import AndroidSingAlong from './components/AndroidSingAlong'
import AndroidLessonHeader, { FloatingPlaybackSpeed } from './components/AndroidLessonHeader'
// 合并学习页保留旧组件，新增统一播放器与共享静音时间轴。
import { songLanguage, songReadingStyle, annotationForLanguage } from './lib/songLanguage.js'
import SongLanguageSelect from './components/SongLanguageSelect'
import AndroidStudyPlayer, { AndroidStudyHeader } from './components/AndroidStudyPlayer'
import useStudyPlayback from './lib/useStudyPlayback'
// 安卓整句单击与双击互斥，滚动、长按或离页时可取消尚未确认的单击。
import { LyricTapGesture } from './lib/lyricTapGesture'
import OnlineSongSearch from './components/OnlineSongSearch'
import SongDetailsEditor from './components/SongDetailsEditor'
import LyricLineEditor from './components/LyricLineEditor'
import LyricAiReview from './components/LyricAiReview'
import useModalScrollLock from './lib/useModalScrollLock'
import { applyLyricReview, reviewFingerprint } from './lib/lyricAiReview'
import LyricChat from './components/LyricChat'
import { applyLyricEdits, commitEditedLine } from './lib/lyricEditing'
import SettingsDialog from './components/SettingsDialog'
// 首页低频邀请，复用内置反馈，不打断学习和其他操作。
import CommunityInvite from './components/CommunityInvite'
// 逐句解析独立展示/删除，日语水平与原文绑定校验共用纯策略。
import SentenceAnalysis from './components/SentenceAnalysis'
import SentenceDeleteDialog from './components/SentenceDeleteDialog'
import JapaneseLevelOnboarding from './components/JapaneseLevelOnboarding'
import {readLocalProfile,readJapaneseLevel} from './lib/localProfile'
import {validJapaneseLevel} from './lib/japaneseLevel'
import {currentSentenceEntry,visibleSentenceEntry,sentenceEntry,removeSentenceEntries,SentenceTaskGate,sentenceSongFingerprint} from './lib/sentenceAnalysis'
import { applyAppearance, readAppearance } from './lib/appearance'
import { restoreRemoteFont } from './lib/remoteFonts'
import { isCustomFont, restoreCustomFont } from './lib/customFonts'
import { importedSongs } from './data/songs.generated'
import { demoSongs } from './data/demoSongs'
import { songArtworkBySource } from './data/songArtwork'
import twilightStation from './assets/uta-twilight-station.png'
// 安卓启动页沿用用户提供的原图，图标另使用加上「うた」背景字样的版本。
import androidLaunchPortrait from './assets/uta-launch-portrait.png'
import { annotateSongLines, explainSelectionWithAi, explainSentenceBatchWithAi, reviewSongWithAi, searchSongArtwork } from './lib/annotationApi'
import { createAndStoreLocalSong, deleteLocalSong, loadLocalSongs, parseLrcFile, replaceLocalSongs, storeTransferredSong, updateLocalSongArtworkIfUrl, updateLocalSongMetadata } from './lib/localSongStore'
import { downloadComputerSong, mergeTransferredLearning, startComputerTransfer } from './lib/computerSongTransfer'
import { BACKUP_STORAGE_KEYS, createLearningBackup, inspectLearningBackup, songsFromLearningBackup } from './lib/learningBackup'
import { correctionKey, hasKanji } from './lib/ruby'
import { inferAudioMetadata } from './lib/audioMetadata'
import { insertLyricLine } from './lib/songTimeline'
import {hasLyricTimeline,lyricDuration,orderLyricLines} from './lib/lyricDocument.js'
import { cacheArtworkSelection } from './lib/artworkSearch'
import { isSongHeadingLine, withoutSongHeadingLines } from './lib/songMetadata'
import { annotationMatchesLine, reconcileLearningState } from './lib/learningIdentity'
import { displayReading, lineReading as getLineReading, normalizeReadingStyle } from './lib/readingDisplay'
import { inspectCloudBackup } from './lib/cloudBackup'
// 原完整云包 wrapCloudBackup 保留在 cloudData；WebDAV 改为目录与独立歌曲附件。
import { collectCloudExtras,restoreCloudData } from './lib/cloudData'
import { markCloudDirty,loadWebDavSettings,validateWebDav,webDavDownload,withWebDavLock } from './lib/webDav'
import {readCloudSongAsset} from './lib/cloudSongBackup'
import WebDavAutoSync from './components/WebDavAutoSync'
import {useAppUpdates,AppUpdatePrompt} from './components/AppUpdates'

// Android 原生耳机断开广播只在手机应用中监听；网页仍沿用浏览器音频行为。
const audioRoute = registerPlugin('UtaAudioRoute')
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

// 原仅按缓存text和编号检查的解析展示保留对照；新组件额外展示原文及缓存状态。
// function hasCachedSentenceExplanation(cache, line, language='ja') {
//   const entry = cache?.[line.id]
//   // 切换语言后原解析仍留在缓存，但不当作新语言下的有效结果。
//   return (entry?.language || 'ja') === language && entry?.text === line.text && typeof entry.explanation?.meaning === 'string' && Boolean(entry.explanation.meaning.trim())
// }
//
// function SentenceAnalysis({ explanation, id }) {
//   return <section className="sentence-inline-analysis" id={id} aria-label="整句解析" onClick={(event) => event.stopPropagation()}>
//     <h3><Sparkles size={14} /> 整句解析</h3>
//     <div className="sentence-analysis-section"><h4>整句意思</h4><p>{explanation.meaning}</p></div>
//     {explanation.vocabulary?.length > 0 && <div className="sentence-analysis-section"><h4>关键表达</h4><dl>{explanation.vocabulary.map((item, index) => <div key={`${item.surface}-${index}`}><dt lang="ja">{item.surface}</dt><dd>{item.meaning}</dd></div>)}</dl></div>}
//     {explanation.grammar?.length > 0 && <div className="sentence-analysis-section"><h4>语法与语境</h4><ul>{explanation.grammar.map((point, index) => <li key={`${point}-${index}`}>{point}</li>)}</ul></div>}
//     {explanation.pronunciation_tip && <div className="sentence-analysis-section"><h4>发音提示</h4><p>{explanation.pronunciation_tip}</p></div>}
//     <p className="sentence-analysis-footnote">AI 解析仅供学习参考；想了解具体词句，仍可在歌词中选中后单独提问。</p>
//   </section>
// }
//
//
function hasCachedSentenceExplanation(cache,line,language='ja') {
  return currentSentenceEntry(cache?.[line.id],line,language,readJapaneseLevel(),IS_ANDROID_APP)
}

function formatLrcTimestamp(seconds) {
  // 没有时间戳保持空输入，不把 null 转成 00:00。
  if(!Number.isFinite(seconds))return ''
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
  // 未设置等级的既有用户也会在升级后首次询问；选择后不再重复打扰。
  const [japaneseLevel,setJapaneseLevel]=useState(readJapaneseLevel)
  const [needsJapaneseLevel,setNeedsJapaneseLevel]=useState(()=>{const profile=readLocalProfile();return !validJapaneseLevel(profile.japaneseLevel)&&profile.japaneseLevelPrompted!==true})
  useEffect(()=>{
    const changed=()=>{const profile=readLocalProfile();setJapaneseLevel(readJapaneseLevel());setNeedsJapaneseLevel(!validJapaneseLevel(profile.japaneseLevel)&&profile.japaneseLevelPrompted!==true)}
    window.addEventListener('uta:profile-changed',changed)
    return()=>window.removeEventListener('uta:profile-changed',changed)
  },[])
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
  const [defaultReadingStyle, setDefaultReadingStyle] = useState(() => normalizeReadingStyle(savedProgress.readingStyle))
  // 翻译是独立显示偏好，开关不会修改歌词中的译文。
  const [defaultStudyTranslation, setDefaultStudyTranslation] = useState(() => localStorage.getItem('uta-study-translation-v1') !== 'false')
  useEffect(() => { localStorage.setItem('uta-study-translation-v1', String(defaultStudyTranslation)) }, [defaultStudyTranslation])
  // 原网页端保持原字体；仅安卓 WebView 切换为用户提供的本地字体。
  useEffect(() => {
    if (!IS_ANDROID_APP) return undefined
    document.documentElement.classList.add('uta-android-font')
    // 冷启动恢复本机主题与字号，页面内容和读音不受影响。
    const savedAppearance = readAppearance()
    applyAppearance(savedAppearance)
    // 已下载的远程字重从本机缓存恢复，冷启动无需再次联网。
    restoreRemoteFont(savedAppearance.font).then(ready => {
      if (ready) applyAppearance(readAppearance())
    }).catch(() => { /* 缓存损坏时保留系统回退字形，设置页提供重新下载入口。 */ })
    // 本机导入字体同样在冷启动时注册；文件缺失时保留内置字形回退和设置入口。
    if (isCustomFont(savedAppearance.font)) restoreCustomFont(savedAppearance.font).then(ready => {
      if (ready) applyAppearance(readAppearance())
    }).catch(() => { /* 设置页可删除损坏字体并重新导入，不影响歌曲数据。 */ })
    return () => document.documentElement.classList.remove('uta-android-font')
  }, [])
  useEffect(() => {
    if (!IS_ANDROID_APP) return undefined
    // 等网页界面准备好后，短暂显示完整启动图和两行日文，再进入学习首页。
    const timer = window.setTimeout(() => setAndroidLaunchVisible(false), 1800)
    return () => window.clearTimeout(timer)
  }, [])
  // 原标签仅区分两种；新增双注音提示。
  // const readingLabel = readingStyle === 'romaji' ? '罗马音' : '平假名'
  // 注音显示偏好在确定当前歌曲语言后计算。
  const [localSongs, setLocalSongs] = useState([])
  const [localSongsReady, setLocalSongsReady] = useState(false)
  const [localAudioUrls, setLocalAudioUrls] = useState({})
  // 复核弹窗持有当前歌曲快照，采用时校验来源和人工读音是否变化。
  const [lyricAiReviewSong,setLyricAiReviewSong]=useState(null)
  // 本次应用运行期间缓存每首歌的复核结果；歌词/来源/人工注音变化后自动失效。
  const lyricAiReviewCacheRef=useRef({})
  const [sentenceExplanationOpen, setSentenceExplanationOpen] = useState(null)
  const [sentenceExplanationJob, setSentenceExplanationJob] = useState(null)
  const [sentenceExplanationError, setSentenceExplanationError] = useState(null)
  // 仅管理解析删除，不复用歌曲删除入口，避免误删音频或学习记录。
  const [sentenceDeleteTarget,setSentenceDeleteTarget]=useState(null)
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
  // 导入预览也支持指定插入位置，默认第一句之前，与歌曲编辑一致。
  const [importInsertAt, setImportInsertAt] = useState(0)
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
  const lyricTapRef = useRef(null)
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
  // 安卓删除先展示适配本机文案的圆角确认框；确认前不修改歌曲数据。
  const [songToDelete,setSongToDelete] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [backupBusy, setBackupBusy] = useState('')
  const [backupPreview, setBackupPreview] = useState(null)
  const [backupError, setBackupError] = useState('')
  const [computerShare, setComputerShare] = useState(null)
  const [toast, setToast] = useState('')
  const [cloudSongRequest,setCloudSongRequest]=useState(null),[cloudSongBusy,setCloudSongBusy]=useState(false),[cloudSongProgress,setCloudSongProgress]=useState(0),[cloudSongError,setCloudSongError]=useState('')
  // 歌词长按菜单与其他安卓弹层也锁住背景；组件内弹窗共享同一计数，支持叠加。
  useModalScrollLock(IS_ANDROID_APP && Boolean(lyricEditMenu||editingDetailsSong||editingArtworkSong||importOpen||songPickerOpen||backupPreview||computerShare||cloudSongRequest))
  const dragSelectionRef = useRef(null)
  const suppressNextTokenClick = useRef(false)
  const audioRef = useRef(null)
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
  const sentenceTaskGateRef=useRef(new SentenceTaskGate())
  useEffect(()=>{
    const task=sentenceTaskGateRef.current.current
    if(task?.level!=null&&task.level!==japaneseLevel)cancelSentenceGeneration(task.songId)
    setSentenceExplanationOpen(previous=>previous?.entry?.language==='ja'?null:previous)
  },[japaneseLevel])
  useEffect(()=>()=>sentenceTaskGateRef.current.cancel(),[])
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
    if(cloudSongRequest){if(!cloudSongBusy)setCloudSongRequest(null);return}
    // 封面选歌作为当前练习页的弹层，系统返回只关闭选歌页。
    if (lyricAiReviewSong) { setLyricAiReviewSong(null); return }
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
  const allSongs = useMemo(() => [...importedSongs, ...localSongs, ...demoSongs].map((song) => ({...applyLyricEdits(withoutSongHeadingLines(song), learningState.progress.lyricEditsBySong), language:learningState.progress.songSettings?.[song.id]?.language || songLanguage(applyLyricEdits(song,learningState.progress.lyricEditsBySong))})).filter((song) => song.lines.length), [localSongs, importedSongs, learningState.progress.lyricEditsBySong, learningState.progress.songSettings])
  // Reconcile before rendering and before every write, including after Vite
  // reloads generated lyrics or browser-local songs finish loading.
  const learning = useMemo(() => reconcileLearningState(allSongs, learningState), [allSongs, learningState])
  // 网络返回时核对最新原文，而不是沿用请求发起时的闭包。
  const sentenceSongsRef=useRef(allSongs)
  sentenceSongsRef.current=allSongs
  const { learnedBySong, reviewItems, favoriteSongIds, corrections, lyricSnapshots, lyricEditsBySong, songSettings = {} } = learning.progress
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
  // 未下载的云歌曲只能展示目录，不能进入注音/播放流程或把占位歌词视为真实内容。
  const activeSong = allSongs.find((song) => song.id === activeSongId&&!song.cloudPending) || allSongs.find(song=>!song.cloudPending) || initialSong()
  // 每首歌保存语言和显示偏好，随学习进度备份；原有全局偏好作为日语歌曲默认值。
  const activeLanguage = songLanguage(activeSong)
  const activeSongSettings = songSettings[activeSong.id] || {}
  const readingStyle = songReadingStyle(activeLanguage, activeSongSettings.readingStyle ?? defaultReadingStyle)
  const showStudyTranslation = activeSongSettings.showTranslation ?? defaultStudyTranslation
  const readingLabel = activeLanguage !== 'ja' ? '自定义注音' : readingStyle === 'both' ? '假名＋罗马音' : readingStyle === 'romaji' ? '罗马音' : '平假名'
  const readingLang = activeLanguage !== 'ja' ? undefined : readingStyle === 'romaji' ? 'ja-Latn' : 'ja'
  function updateSongSettings(patch) {
    updateLearningMap('songSettings', previous => ({...previous,[activeSong.id]:{...previous?.[activeSong.id],...patch}}),true)
  }
  function setReadingStyle(style) { if (IS_ANDROID_APP) updateSongSettings({readingStyle:style}); else setDefaultReadingStyle(style) }
  function setShowStudyTranslation(value) { updateSongSettings({showTranslation:value}) }
  function changeSongLanguage(language) { stopLinePlayback(); setSentenceExplanationOpen(null); updateSongSettings({language}) }
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
  // 音频和完整时间轴均具备后才启用逐句试听/跟唱。
  const playbackReady=Boolean(audioUrl)&&hasLyricTimeline(activeSong)
  // 安卓两种播放方式共用同页；无音频时由同一控制器按真实歌词时间轴计时。
  const unifiedStudy = IS_ANDROID_APP && activePage === 'lesson' && !practiceActive
  const study = useStudyPlayback({ enabled: unifiedStudy, song: activeSong, audioRef, audioUrl, rate: playbackRate, onSelect: setActiveLineId, onError: setAudioError })
  // 仅安卓统一学习页启用双击选段；回调读取控制器当前状态，避免等待期间沿用旧选区。
  useEffect(() => {
    if (!unifiedStudy) return undefined
    const gesture = new LyricTapGesture({
      // 无时间轴仍允许阅读选句；可播放时由控制器决定段首，不能用被点句覆盖它。
      onSingle: id => { if (!study.transport.state.ready) setActiveLineId(id); else study.transport.playLine(id) },
      onDouble: id => {
        if (!study.transport.state.ready) { setToast('歌词缺少完整时间戳，补全后可选段播放。'); return }
        setSentenceExplanationOpen(null)
        study.transport.doubleTapLine(id)
      },
    })
    lyricTapRef.current = gesture
    // 工具栏/掌握/解析等独立按钮及退到后台都会取消待确认单击，不能稍后偷偷播放。
    const action = event => { if (event.target.closest('button,a,input,select,textarea,[role="dialog"]')) gesture.cancel() }
    const hidden = () => { if (document.visibilityState !== 'visible') gesture.cancel() }
    window.addEventListener('pointerdown', action, true)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      gesture.cancel(); window.removeEventListener('pointerdown', action, true); document.removeEventListener('visibilitychange', hidden)
      if (lyricTapRef.current === gesture) lyricTapRef.current = null
    }
  }, [unifiedStudy, activeSong.id, study.transport, study.mode])
  useEffect(() => {
    if (!IS_ANDROID_APP) return undefined
    let active = true
    let listener
    // 与封面选歌、返回页面使用同一暂停入口，连加载中的播放也会取消。
    audioRoute.addListener('audioBecomingNoisy', () => { if (active) stopLinePlayback() })
      .then(handle => { if (active) listener = handle; else handle.remove() })
      .catch(() => { /* 原生桥未就绪时不影响页面正常播放。 */ })
    return () => { active = false; listener?.remove() }
  }, [study.transport])
  // 进入学习或切歌时显示歌曲信息，避免沿用上一首的内部滚动位置。
  useEffect(() => { if (unifiedStudy) document.querySelector('.unified-study-page')?.scrollTo({ top: 0, behavior: 'instant' }) }, [unifiedStudy, activeSong.id])
  useEffect(() => { if (unifiedStudy) setPlayingLineId(study.playing ? activeLineId : null) }, [unifiedStudy, study.playing, activeLineId])
  useEffect(() => {
    if (!unifiedStudy) return undefined
    const follow = () => {
      // 展开解析已暂停；用户手动继续后恢复跟随，不因解析仍展开而卡住滚动。
      if (!study.playing || document.body.style.overflow === 'hidden') return
      // 原列表单独滚动：const list = document.getElementById('lesson')
      // 歌曲信息与歌词一起滚动，自动跟随也以同一个页面容器为准。
      const list = document.querySelector('.unified-study-page'), row = document.getElementById(`lyric-row-${activeSong.id}-${activeLineId}`)
      if (list && row) list.scrollTo({ top: list.scrollTop + row.getBoundingClientRect().top - list.getBoundingClientRect().top - (list.clientHeight - row.offsetHeight) / 2, behavior: 'smooth' })
    }
    follow(); window.addEventListener('uta:study-follow', follow); window.addEventListener('uta:appearance-changed', follow); window.addEventListener('resize', follow)
    return () => { window.removeEventListener('uta:study-follow', follow); window.removeEventListener('uta:appearance-changed', follow); window.removeEventListener('resize', follow) }
  }, [unifiedStudy, study.playing, activeLineId, activeSong.id, sentenceExplanationOpen])
  const annotations = useMemo(() => annotationsBySong[activeSong.id]?.filter((annotation) =>
    activeSong.lines.some((line) => annotationMatchesLine(annotation, line))).map(annotation=>annotationForLanguage(activeSong.lines.find(line=>line.id===annotation.id),activeLanguage,annotation,corrections,activeSong.id)), [annotationsBySong, activeSong, activeLanguage, corrections])
  const activeAnnotation = annotations?.find((line) => line.id === activeLine.id)
  const activeLineReading = activeLanguage!=='ja'?'':getLineReading(activeAnnotation?.tokens, corrections, activeSong.id, activeLine.id, readingStyle, activeLine.romaji)
  const activeTokens = useMemo(
    () => activeAnnotation?.tokens || fallbackTokens(activeLine.text),
    [activeAnnotation, activeLine.text],
  )
  const lexicalActiveTokens = activeTokens.filter((token) => !token.is_symbol)
  const focusToken = lexicalActiveTokens.find((token) => token.index === selectedTokenIndex)
    || lexicalActiveTokens.find((token) => hasKanji(token.surface)) || lexicalActiveTokens[0] || activeTokens[0]
  const focusKey = correctionKey(activeSong.id, activeLine.id, focusToken.index)
  // 原来使用 ||；人工留空应保持不注音。
  const focusReading = corrections[focusKey] ?? focusToken.reading
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
  const readySentenceCount = activeSong.lines.filter((line) => hasCachedSentenceExplanation(currentSentenceCache, line, activeLanguage)).length

  useEffect(() => {
    // 人工单句歌词随学习进度保存。
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ learnedBySong, reviewItems, favoriteSongIds, corrections, meaningOverrides, playbackRate, lyricSnapshots, readingStyle:defaultReadingStyle, lyricEditsBySong, songSettings }))
  }, [learnedBySong, reviewItems, favoriteSongIds, corrections, meaningOverrides, playbackRate, lyricSnapshots, defaultReadingStyle, lyricEditsBySong, songSettings])

  useEffect(() => { localStorage.setItem(ANNOTATION_KEY, JSON.stringify(annotationsBySong)) }, [annotationsBySong])
  useEffect(() => { localStorage.setItem(AI_REVIEW_KEY, JSON.stringify(aiReviews)) }, [aiReviews])
  useEffect(() => { localStorage.setItem(SENTENCE_EXPLANATION_KEY, JSON.stringify(sentenceExplanationsBySong)) }, [sentenceExplanationsBySong])
  useEffect(() => {
    let disposed = false
    loadLocalSongs()
      .then((records) => {
        const nextUrls = {}
        // 原为所有记录创建音频URL；云目录占位记录没有音频。
        records.forEach((record) => { if(record.audioBlob instanceof Blob&&!record.cloudPending)nextUrls[record.id] = URL.createObjectURL(record.audioBlob) })
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
    const song = localSongs.find((item) => !item.cloudPending&&pending.includes(item.id) && !attemptedBackgroundAiRef.current.has(item.id))
    if (!song) return
    attemptedBackgroundAiRef.current.add(song.id)
    // AI 请求在页面可继续使用时逐批处理；中断的任务保留，下次打开应用续做。
    void generateSentenceExplanations(song).then((result) => {
      if(result.cancelled)return
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
    const missing = activeSong.lines.filter((line) => !cached.some((annotation) => annotationMatchesLine(annotation, line) && (activeLanguage !== 'ja' || !annotation.language || annotation.language === 'ja' || annotation.tokens.some(token=>token.segmentation_locked))))
    if (!missing.length) { setAnnotating(false); return undefined }
    let abandoned = false
    setAnnotating(true)
    setAnnotationError('')
    annotateSongLines(missing, activeLanguage)
      .then((annotation) => {
        if (!missing.every((line) => annotation.some((item) => annotationMatchesLine(item, line)))) throw new Error('注音与歌词内容不匹配')
        if (!abandoned) setAnnotationsBySong((all) => ({ ...all, [activeSong.id]: [
          ...cached.filter(item=>!missing.some(line=>line.id===item.id)), ...annotation.map((item) => ({ ...item, text: missing.find((line) => line.id === item.id)?.text })),
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
  }, [activeSong.id, activeSong.lines, activeLanguage, annotationsBySong[activeSong.id]])

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
    // 返回、编辑和解析统一暂停有声/静音进度。
    // 同时取消300毫秒内尚未确认的整句点击，耳机断开或返回后不得延迟启动。
    lyricTapRef.current?.cancel()
    study.transport.pause()
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

  function chooseSong(songId,downloaded=false) {
    if(downloaded!==true&&askCloudSong(songId,id=>chooseSong(id,true)))return false
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
    setToast(songLanguage(allSongs.find(song=>song.id===songId))==='ja'?'已切换歌词，正在准备自动读音。':'已切换歌词。')
  }

  function chooseLine(lineId) { setActiveLineId(lineId) }

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
      // 长按不可再触发延迟单击；选段区域长按只吞掉抬手，不进入编辑或改变播放。
      lyricTapRef.current?.cancel()
      if (unifiedStudy && (study.transport.inRange(lineId) || study.transport.state.rangeAnchorId === lineId)) return
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
    // 原移动只取消长按；现连尚未确认的单击一起取消，滑动找终点不会误播放。
    // if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) cancelLyricPress()
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) { cancelLyricPress(); lyricTapRef.current?.cancel() }
  }
  function suppressLyricPressClick(event) {
    if (Date.now() < lyricPressSuppressionRef.current) { event.preventDefault(); event.stopPropagation() }
  }
  // 单句翻译与歌词读音一并保存，编辑翻译不会改变原时间轴。
  async function saveEditedLyric({ annotation, readings, translation, manualIndices }) {
    const target = editingLyric
    const song = allSongs.find((item) => item.id === target?.songId)
    if (!song) throw new Error('找不到当前歌曲。')
    if (sentenceExplanationJobRef.current === song.id) throw new Error('这首歌正在生成解析，请稍后再编辑。')
    // 原来只覆盖 text；显式留空翻译也必须写入。
    const editedLines = song.lines.map((line) => line.id === target.lineId ? { ...line, text: annotation.text, translation } : line)
    setLyricEditSaving(true)
    try {
      if (song.isLocal) {
        const updated = await updateLocalSongMetadata(song.id, { lines: editedLines })
        if (!updated) throw new Error('歌词保存失败，请重试。')
        const { audioBlob, ...visibleSong } = updated
        setLocalSongs((previous) => previous.map((item) => item.id === song.id ? visibleSong : item))
      }
      // 原提交没有 translation 参数，现兼容项目歌曲与本地歌曲。
      setLearningState((previous) => commitEditedLine(allSongs, previous, song.id, target.lineId, annotation, readings, translation, manualIndices).state)
      setEditingLyric(null)
      setSentenceExplanationOpen(null)
      setSelectedTokenIndex(0)
      setToast('这一句的歌词与读音已保存。')
    } finally { setLyricEditSaving(false) }
  }

  // 用户采用建议后写入现有学习数据，歌曲原文、翻译与时间轴保持原值。
  function acceptLyricAiReview(snapshot, selected, historical=false) {
    const song=allSongs.find(item=>item.id===lyricAiReviewSong?.id)
    // 原来只允许快照首次采用：if(!song || reviewFingerprint(song,corrections)!==snapshot.fingerprint)throw new Error('歌词或人工读音已变化，请重新复核。')
    if(!song)throw new Error('找不到复核对应的歌曲。')
    // 先同步校验再更新，错误可直接显示在弹窗；历史建议由原文范围重新定位。
    const next=applyLyricReview(learningState,song,snapshot,selected,{historical})
    setLearningState(next)
    setToast(`已保存 ${selected.length} 条复核建议，逐句与跟唱同步使用。`)
  }

  // 手机端整句都是播放热区；电脑端继续使用原来的“点击选中句子”行为。
  function isMobileLyricPlayback() {
    return IS_ANDROID_APP || window.matchMedia('(max-width: 650px)').matches
  }

  function handleLyricRowClick(event, lineId) {
    // 原逻辑：onClick={() => chooseLine(line.id)}，现保留给电脑端。
    if (event.target.closest('button, a, input, select, textarea, .sentence-inline-analysis')) return
    // 安卓先区分单击/双击，网页维持原即时选句；第二次双击仅选段，不播放。
    if (unifiedStudy) { lyricTapRef.current?.tap(lineId); return }
    chooseLine(lineId)
    // 原来任何整句点击都尝试播放；纯歌词阅读只切换当前句，避免无音频报错。
    // 原来无音频不能点击播放：if (isMobileLyricPlayback()&&playbackReady) playLine(lineId)
    // 原安卓即时播放：if (unifiedStudy) { study.transport.playLine(lineId); return }
    if (isMobileLyricPlayback()&&playbackReady) playLine(lineId)
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
    if(askCloudSong(songId,id=>{chooseSong(id,true);if(IS_ANDROID_APP)navigateAndroid('lesson','learn');else setActivePage('lesson')}))return
    chooseSong(songId)
    // 从歌曲库进入歌曲详情后，返回键要回到歌曲库。
    if (IS_ANDROID_APP) navigateAndroid('lesson', 'learn')
    else setActivePage('lesson')
    window.requestAnimationFrame(() => {
      // 原来两端均定位歌词区，会把可滚动页头提前藏起来；安卓改为从页头开始。
      if (IS_ANDROID_APP) document.querySelector('.unified-study-page')?.scrollTo({ top: 0, behavior: 'instant' })
      else document.getElementById('lesson')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  // 安卓底栏始终切换到三个顶层页面；原学习、复习和歌曲库在入口内打开。
  function showMobileTab(tab) {
    stopLinePlayback()
    navigateAndroid(`mobile-${tab}`, tab)
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }

  /* 原独立跟唱路由：
  function showSingAlong() {
    // 最近跟唱可能只有云目录，下载确认后再进入；其余入口沿用原流程。
    if(recentSingSong?.cloudPending&&askCloudSong(recentSingSong.id,id=>{chooseSong(id,true);navigateAndroid('sing-along','learn')}))return
    exitPractice()
    if (recentSingSong && recentSingSong.id !== activeSong.id) chooseSong(recentSingSong.id)
    navigateAndroid('sing-along', 'learn')
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  }

  */
  function showSingAlong() {
    study.transport.setMode('continuous')
    enterRecentLearning()
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
    setImportInsertAt(0)
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

  //   function addImportLine() {
  //     setImportDraft((previous) => {
  //       if (!previous) return previous
  //       const lastLine = previous.lines.at(-1)
  //       const lastStart = parseLrcTimestamp(lastLine?.timeText) ?? 0
  //       return {
  //         ...previous,
  //         lines: [...previous.lines, {
  //           draftId: globalThis.crypto?.randomUUID?.() || `new-${Date.now()}`,
  //           timeText: formatLrcTimestamp(lastStart + 5), text: '', translation: '',
  //         }],
  //       }
  //     })
  //   }
  //
  // 将预览字段转换到共用插入算法，保留原有 draftId、罗马音等字段。
  function addImportLine() {
    if (!importDraft) return
    try {
      const prepared = importDraft.lines.map((line, index) => ({ ...line, id:index, time:line.timeText }))
      const inserted = insertLyricLine(prepared, Math.min(importInsertAt, prepared.length), parseLrcTimestamp, formatLrcTimestamp)
      const lines = inserted.map(({ time, ...line }) => ({ ...line, timeText:time, draftId:line.draftId || globalThis.crypto?.randomUUID?.() || `new-${Date.now()}`, romaji:line.romaji || '' }))
      setImportDraft({ ...importDraft, lines }); setImportError('')
    } catch (error) { setImportError(error.message || '无法添加歌词，请检查相邻时间。') }
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

  // 原生成/展示函数保留，下面的新实现加原文绑定、任务失效与显式重生成。
//   async function generateSentenceExplanations(song, requestedLines = song.lines, onProgress) {
//     const cache = { ...(sentenceExplanationsBySong[song.id] || {}) }
//     const pending = requestedLines.filter((line) => !hasCachedSentenceExplanation(cache, line, songLanguage(song)))
//     const countReady = () => song.lines.filter((line) => hasCachedSentenceExplanation(cache, line, songLanguage(song))).length
//     if (!pending.length) return { cache, complete: true, ready: countReady(), error: '' }
//     if (sentenceExplanationJobRef.current) {
//       return { cache, complete: false, ready: countReady(), error: '已有一首歌曲正在生成解析，请稍后重试。' }
//     }
//     sentenceExplanationJobRef.current = song.id
//     setSentenceExplanationError(null)
//     setSentenceExplanationJob({ songId: song.id, ready: countReady(), total: song.lines.length })
//     onProgress?.(countReady(), song.lines.length)
//     let failure = ''
//     try {
//       for (let offset = 0; offset < pending.length; offset += SENTENCE_BATCH_SIZE) {
//         if (cancelledAiSongsRef.current.has(song.id)) return { cache, complete: false, ready: countReady(), error: '歌曲已删除，解析已停止。' }
//         const batch = pending.slice(offset, offset + SENTENCE_BATCH_SIZE)
//         const contextLines = batch.map((line) => {
//           const index = song.lines.findIndex((item) => item.id === line.id)
//           return {
//             id: line.id, text: line.text, translation: line.translation || '',
//             previous_line: song.lines[index - 1]?.text || '',
//             next_line: song.lines[index + 1]?.text || '',
//           }
//         })
//         try {
//           const result = await explainSentenceBatchWithAi(contextLines,songLanguage(song))
//           if (cancelledAiSongsRef.current.has(song.id)) return { cache, complete: false, ready: countReady(), error: '歌曲已删除，解析已停止。' }
//           const knownIds = new Set(batch.map((line) => line.id))
//           const lineById = new Map(batch.map((line) => [line.id, line]))
//           for (const explanation of result.explanations || []) {
//             if (!knownIds.has(explanation.line_id) || !explanation.meaning) continue
//             const line = lineById.get(explanation.line_id)
//             cache[line.id] = { text: line.text, language:songLanguage(song), explanation }
//           }
//           setSentenceExplanationsBySong((previous) => ({ ...previous, [song.id]: { ...(previous[song.id] || {}), ...cache } }))
//           const ready = countReady()
//           setSentenceExplanationJob({ songId: song.id, ready, total: song.lines.length })
//           onProgress?.(ready, song.lines.length)
//         } catch (error) {
//           failure = error instanceof Error ? error.message : 'AI 整句解析暂时不可用。'
//           break
//         }
//       }
//       const complete = requestedLines.every((line) => hasCachedSentenceExplanation(cache, line, songLanguage(song)))
//       if (!complete && !failure) failure = '部分句子的解析未生成，可稍后重试。'
//       if (failure) setSentenceExplanationError({ songId: song.id, message: failure })
//       return { cache, complete, ready: countReady(), error: failure }
//     } finally {
//       sentenceExplanationJobRef.current = null
//       setSentenceExplanationJob(null)
//     }
//   }
//
//   async function showSentenceExplanation(line) {
//     // 选段内禁止逐句 AI 解析，即使旧焦点或异步入口仍存在也不提交请求。
//     if (unifiedStudy && study.transport.inRange(line.id)) return
//     const songId = activeSong.id
//     if (sentenceExplanationOpen?.songId === songId && sentenceExplanationOpen.line.id === line.id) {
//       setSentenceExplanationOpen(null)
//       return
//     }
//     // 展开前立即暂停，生成/收起后均由用户手动继续。
//     if (IS_ANDROID_APP) stopLinePlayback()
//     const cached = sentenceExplanationsBySong[activeSong.id]?.[line.id]
//     if (hasCachedSentenceExplanation(sentenceExplanationsBySong[activeSong.id], line, activeLanguage)) {
//       setSentenceExplanationOpen({ songId, line, explanation: cached.explanation })
//       return
//     }
//     const result = await generateSentenceExplanations(activeSong, [line])
//     const prepared = result.cache[line.id]
//     // 请求途中用户可能进入选段，结果可保留缓存，但不能在段内突然展开解析。
//     if (unifiedStudy && study.transport.inRange(line.id)) return
//     if (hasCachedSentenceExplanation(result.cache, line, activeLanguage)) setSentenceExplanationOpen({ songId, line, explanation: prepared.explanation })
//     else setToast(result.error || '这句的解析暂未生成，请稍后重试。')
//   }
//
//   async function generateCurrentSongExplanations() {
//     const result = await generateSentenceExplanations(activeSong)
//     if (result.complete) {
//       const pending = loadLocal(PENDING_AI_IMPORT_KEY, [])
//       localStorage.setItem(PENDING_AI_IMPORT_KEY, JSON.stringify((Array.isArray(pending) ? pending : []).filter((id) => id !== activeSong.id)))
//     }
//     setToast(result.complete ? `《${activeSong.title}》的 ${result.ready} 句解析已准备好。`
//       : `${result.error || '部分句子未完成'}：已准备 ${result.ready} / ${activeSong.lines.length} 句，可重试。`)
//   }
//
//
  // 删除、重生成和等级改变都取消本曲旧任务，旧响应不可再写回缓存。
  function cancelSentenceGeneration(songId) {
    const gate=sentenceTaskGateRef.current
    if(gate.current?.songId===songId){gate.cancel(songId);sentenceExplanationJobRef.current=null;setSentenceExplanationJob(null)}
  }
  function removePendingSentenceSong(songId){
    const pending=loadLocal(PENDING_AI_IMPORT_KEY,[])
    localStorage.setItem(PENDING_AI_IMPORT_KEY,JSON.stringify((Array.isArray(pending)?pending:[]).filter(id=>id!==songId)))
    attemptedBackgroundAiRef.current.add(songId)
  }
  function deleteSentenceAnalysis(target){
    cancelSentenceGeneration(target.songId)
    removePendingSentenceSong(target.songId)
    setSentenceExplanationsBySong(previous=>removeSentenceEntries(previous,target.songId,target.lineId))
    setSentenceExplanationOpen(previous=>previous?.songId===target.songId&&(target.lineId==null||previous.line.id===target.lineId)?null:previous)
    setSentenceExplanationError(null);setSentenceDeleteTarget(null)
    setToast(target.lineId==null?'已删除整曲AI解析。':'已删除本句AI解析。')
  }
  async function generateSentenceExplanations(song,requestedLines=song.lines,onProgress,force=false){
    const language=songLanguage(song),level=readJapaneseLevel()
    const cache={...(sentenceExplanationsBySong[song.id]||{})}
    const pending=requestedLines.filter(line=>force||!hasCachedSentenceExplanation(cache,line,language))
    const countReady=()=>song.lines.filter(line=>hasCachedSentenceExplanation(cache,line,language)).length
    if(!pending.length)return{cache,complete:true,ready:countReady(),error:''}
    if(sentenceExplanationJobRef.current)return{cache,complete:false,ready:countReady(),error:'已有一首歌曲正在生成解析，请稍后重试。'}
    const gate=sentenceTaskGateRef.current
    const run=gate.begin(song.id,language==='ja'?level:null,sentenceSongFingerprint({...song,language}))
    const generated=new Set()
    const cancelled=()=>!gate.active(run)||cancelledAiSongsRef.current.has(song.id)
    const cancelledResult=()=>({cache,complete:false,ready:countReady(),error:'解析生成已停止。',cancelled:true})
    sentenceExplanationJobRef.current=song.id;setSentenceExplanationError(null)
    setSentenceExplanationJob({songId:song.id,ready:force?0:countReady(),total:force?requestedLines.length:song.lines.length,regenerating:force})
    onProgress?.(force?0:countReady(),song.lines.length)
    let failure=''
    // 日语小批处理减少重复歌词导致的漏句/错配，也为零基础讲解保留足够输出长度。
    const batchSize=IS_ANDROID_APP&&language==='ja'?4:SENTENCE_BATCH_SIZE
    try{
      for(let offset=0;offset<pending.length;offset+=batchSize){
        if(cancelled())return cancelledResult()
        const batch=pending.slice(offset,offset+batchSize)
        const context=batch.map(line=>{const index=song.lines.findIndex(item=>item.id===line.id);return{id:line.id,text:line.text,translation:line.translation||'',previous_line:song.lines[index-1]?.text||'',next_line:song.lines[index+1]?.text||''}})
        try{
          const result=await explainSentenceBatchWithAi(context,language,{japaneseLevel:level,signal:run.controller.signal})
          if(cancelled())return cancelledResult()
          const latest=sentenceSongsRef.current.find(item=>item.id===song.id)
          if(!latest||sentenceSongFingerprint({...latest,language:songLanguage(latest)})!==run.fingerprint){failure='歌词已更改，本次结果未保存，请重新生成。';break}
          const lookup=new Map(batch.map(line=>[line.id,line])),accepted={}
          for(const explanation of result.explanations||[]){
            const line=lookup.get(explanation.line_id)
            if(!line||!explanation.meaning)continue
            if(IS_ANDROID_APP&&(explanation.binding_version!==2||explanation.source_text!==line.text))continue
            accepted[line.id]=sentenceEntry(line,explanation,language,level);cache[line.id]=accepted[line.id];generated.add(line.id)
          }
          // 不把最初整份cache合回去；只写本批通过校验的结果，避免覆盖别处已删除内容。
          if(Object.keys(accepted).length)setSentenceExplanationsBySong(previous=>run.controller.signal.aborted?previous:{...previous,[song.id]:{...(previous[song.id]||{}),...accepted}})
          setSentenceExplanationJob({songId:song.id,ready:force?generated.size:countReady(),total:force?requestedLines.length:song.lines.length,regenerating:force})
          onProgress?.(countReady(),song.lines.length)
          if(result.rejected_count)failure='部分解析与原文或编号不对应，未保存对应条目，可重新生成这些句子。'
        }catch(error){if(cancelled())return cancelledResult();failure=error instanceof Error?error.message:'AI解析暂时不可用。';break}
      }
      const complete=requestedLines.every(line=>(!force||generated.has(line.id))&&hasCachedSentenceExplanation(cache,line,language))
      if(!complete&&!failure)failure='部分句子未生成，可稍后重试。'
      if(failure)setSentenceExplanationError({songId:song.id,message:failure})
      // 重新生成失败时不能拿旧缓存数量冒充本次成功数量。
      return{cache,complete,ready:force?generated.size:countReady(),error:failure}
    }finally{
      if(gate.current===run){gate.finish(run);sentenceExplanationJobRef.current=null;setSentenceExplanationJob(null)}
    }
  }
  async function showSentenceExplanation(line){
    if(unifiedStudy&&study.transport.inRange(line.id))return
    const songId=activeSong.id
    if(sentenceExplanationOpen?.songId===songId&&sentenceExplanationOpen.line.id===line.id){setSentenceExplanationOpen(null);return}
    if(IS_ANDROID_APP)stopLinePlayback()
    const cached=sentenceExplanationsBySong[songId]?.[line.id]
    // 旧解析仍可查看及删除，但明确标注未验证/旧等级，不自动付费替换。
    if(visibleSentenceEntry(cached,line,activeLanguage)){
      setSentenceExplanationOpen({songId,line,entry:cached,explanation:cached.explanation,stale:!hasCachedSentenceExplanation(sentenceExplanationsBySong[songId],line,activeLanguage)})
      return
    }
    const result=await generateSentenceExplanations(activeSong,[line])
    if(result.cancelled||unifiedStudy&&study.transport.inRange(line.id))return
    const prepared=result.cache[line.id]
    if(hasCachedSentenceExplanation(result.cache,line,activeLanguage))setSentenceExplanationOpen({songId,line,entry:prepared,explanation:prepared.explanation})
    else setToast(result.error||'这句的解析暂未生成，请稍后重试。')
  }
  async function regenerateSentence(line){
    const song=activeSong
    if(unifiedStudy&&study.transport.inRange(line.id))return
    stopLinePlayback();cancelSentenceGeneration(song.id);removePendingSentenceSong(song.id)
    const result=await generateSentenceExplanations(song,[line],undefined,true)
    if(result.cancelled)return
    if(result.complete){const entry=result.cache[line.id];setSentenceExplanationOpen({songId:song.id,line,entry,explanation:entry.explanation});setToast('本句解析已重新生成。')}
    else setToast(result.error||'重新生成失败，原有解析已保留。')
  }
  async function generateCurrentSongExplanations(force=false){
    const song=activeSong
    if(force===true){cancelSentenceGeneration(song.id);removePendingSentenceSong(song.id)}
    const result=await generateSentenceExplanations(song,song.lines,undefined,force===true)
    if(result.cancelled)return
    if(result.complete)removePendingSentenceSong(song.id)
    setSentenceExplanationOpen(null)
    setToast(result.complete?'本曲'+result.ready+'句解析已准备好。':(result.error||'部分句子未完成')+'：已准备'+result.ready+'/'+song.lines.length+'句。')
  }

  async function exportLearningData() {
    if (backupBusy) return
    setBackupBusy('export')
    setBackupError('')
    try {
      const records = await loadLocalSongs()
      const progressState = { learnedBySong, reviewItems, favoriteSongIds, corrections, meaningOverrides, playbackRate, lyricSnapshots, readingStyle:defaultReadingStyle, lyricEditsBySong, songSettings }
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
    // 原来把全部音频拼成一个 core 再 wrapCloudBackup；现分离稳定歌曲附件与学习目录。
    // const core=createLearningBackup(await loadLocalSongs(),{...学习记录});return wrapCloudBackup(core,includeKey)
    const {extras,avatar}=await collectCloudExtras(includeKey)
    return {songs:await loadLocalSongs(),state:{progress:{learnedBySong,reviewItems,favoriteSongIds,corrections,meaningOverrides,playbackRate,lyricSnapshots,readingStyle:defaultReadingStyle,lyricEditsBySong,songSettings},annotations:annotationsBySong,aiReviews,sentenceExplanations:sentenceExplanationsBySong,artworkOverrides},extras,avatar}
  }

  // 所有歌曲入口共用确认，下载成功持久保存后才进入歌曲；失败保留暗色封面与原数据。
  function askCloudSong(songId,after){
    const song=allSongs.find(item=>item.id===songId)
    if(!song?.cloudPending)return false
    setCloudSongRequest({song,after});setCloudSongError('');setCloudSongProgress(0);return true
  }
  function enterRecentLearning(){
    // 原首页内联处理：exitPractice();if(recentLearnSong&&recentLearnSong.id!==activeSong.id)chooseSong(recentLearnSong.id);navigateAndroid('lesson','learn');window.scrollTo({top:0,behavior:'instant'})
    if(recentLearnSong?.cloudPending&&askCloudSong(recentLearnSong.id,id=>{chooseSong(id,true);navigateAndroid('lesson','learn')}))return
    exitPractice();if(recentLearnSong&&recentLearnSong.id!==activeSong.id)chooseSong(recentLearnSong.id)
    navigateAndroid('lesson','learn');window.scrollTo({top:0,behavior:'instant'})
  }
  async function downloadRequestedCloudSong(){
    if(!cloudSongRequest||cloudSongBusy)return
    const request=cloudSongRequest;setCloudSongBusy(true);setCloudSongError('')
    try{
      const record=await withWebDavLock(async()=>{
        const config=validateWebDav(await loadWebDavSettings())
        if(request.song.cloudAsset.origin&&request.song.cloudAsset.origin!==config.url)throw new Error('请在WebDAV设置中配置这份备份原来的云目录后重试。')
        const blob=await webDavDownload(config,request.song.cloudAsset.name,setCloudSongProgress,{sha256:request.song.cloudAsset.sha256})
        return readCloudSongAsset(blob,request.song)
      })
      await storeTransferredSong(record)
      const url=record.audioBlob instanceof Blob?URL.createObjectURL(record.audioBlob):'',{audioBlob,...metadata}=record
      localAudioUrlRef.current[record.id]=url;setLocalAudioUrls(previous=>({...previous,[record.id]:url}))
      setLocalSongs(previous=>previous.map(song=>song.id===record.id?metadata:song));setCloudSongRequest(null)
      request.after?.(record.id);setToast(`《${record.title}》已下载，可以离线学习。`)
    }catch(error){setCloudSongError(error.message||'下载失败，请重试。')}
    finally{setCloudSongBusy(false)}
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
    setImportAutoQuery([guessed.title, guessed.artist].filter(Boolean).join(' / ').trim())
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
      const progressState = { learnedBySong, reviewItems, favoriteSongIds, corrections, meaningOverrides, playbackRate, lyricSnapshots, readingStyle:defaultReadingStyle, lyricEditsBySong, songSettings }
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
      const audioObjectUrl = audioBlob instanceof Blob?URL.createObjectURL(audioBlob):''
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

  async function importLocalSong() {
    // 原来 !importAudioFile 也阻止导入；现在歌曲可以只含歌词。
    if (!importLrcFile || !importDraft) {
      setImportError('请选择歌词文件，或搜索并选用歌词。')
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
      // 原来所有空时间均报错；允许留空，非空但格式错误仍需修正。
      if (line.timeText.trim()&&start == null) { setImportError(`第 ${index + 1} 行的时间戳无效，请使用 00:12.345 格式或留空。`); return }
      if (!text) { setImportError(`第 ${index + 1} 行缺少原文歌词。`); return }
      // 原保存不含罗马音：if (!isSongHeadingLine(text, title, artist)) lines.push({ start, text, translation: line.translation.trim() })
      if (!isSongHeadingLine(text, title, artist)) lines.push({ start, text, translation: line.translation.trim(), romaji: String(line.romaji || '').trim() })
    }
    if (!lines.length) { setImportError('预览中没有可学习的歌词句子。'); return }
    if (importArtworkStatus === 'manual') {
      try {
        const coverUrl = new URL(importArtworkUrl.trim())
        if (!['http:', 'https:'].includes(coverUrl.protocol)) throw new Error('invalid URL')
      } catch { setImportError('封面链接需要是有效的 http 或 https 地址。'); return }
    }
    // 原 lines.sort(...) 会把空时间当零；部分未填时保持歌词原顺序。
    const ordered=orderLyricLines(lines)
    const parsed = {
      title, artist, album: importDraft.album || '', sourceFile: importLrcFile.name,
      language: songLanguage(importDraft), // 原文自动识别或用户在导入预览中确认的语言。
      duration: lyricDuration(ordered),
      lines: ordered.map((line, id) => ({ id, ...line })),
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
      // 纯歌词没有 Blob，不创建虚假音频地址。
      const audioObjectUrl = audioBlob instanceof Blob?URL.createObjectURL(audioBlob):''
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

  // 新增封面参数，未调整封面时保留原来的封面与学习数据。
  // async function saveSongDetails({ title, artist, lines, audioFile, sourceFile }) {
  async function saveSongDetails({ title, artist, lines, audioFile, sourceFile, artwork }) {
    const song = editingDetailsSong
    if (!song?.isLocal) throw new Error('只有本机导入的歌曲可以修改详细信息。')
    if (sentenceExplanationJobRef.current === song.id) throw new Error('这首歌正在生成 AI 解析，请完成后再编辑歌词。')
    // 原比较只含 id/start/text/translation，继续用这些字段判定学习内容是否失效。
    // 原比较包括罗马音，单改罗马音会误清空人工校正和学习进度；保留供对照。
    // const lineFields = (items) => items.map(({ id, start, text, translation, romaji }) => ({ id, start, text, translation: translation || '', romaji: romaji || '' }))
    // 罗马音随资料保存并即时显示，仅原文/译文/时间改变才重算学习记录；毫秒统一避免浮点误差。
    // 原 Math.round(null*1000) 会把未设置时间误认成零，比较时保留 null。
    // 补音频/时间轴不改变学习文本，不清空用户已学记录；原比较包含 start，保留说明供对照。
    // const lineFields = items => items.map(({id,start,text,translation})=>({id,start,text,translation:translation||''}))
    const lineFields = (items) => items.map(({ id, text, translation }) => ({ id, text, translation: translation || '' }))
    const lyricsChanged = JSON.stringify(lineFields(song.lines)) !== JSON.stringify(lineFields(lines))
    // 原来以最后一句时间作为时长；无时间轴按零显示，补音频解除纯歌词状态。
    const metadata = { title, artist, lines, sourceFile, duration: lyricDuration(lines), ...(audioFile ? { audioBlob: audioFile, audioName: audioFile.name,lyricsOnly:false } : {}) }
    setEditingDetailsBusy(true)
    try {
      // 在线封面先缓存到本地；缓存失败不会提交歌曲资料。
      if (artwork) {
        const cached = await cacheArtworkSelection(artwork)
        Object.assign(metadata, { artworkUrl: cached.artworkUrl || '', artworkSourceUrl: cached.artworkSourceUrl || '', artworkProvider: cached.artworkProvider || '默认封面', artworkChoice: cached.artworkChoice || 'selected' })
      }
      const updated = await updateLocalSongMetadata(song.id, metadata)
      if (!updated) throw new Error('找不到要编辑的本地歌曲。')
      if (artwork && Object.hasOwn(artworkOverrides, song.id)) {
        // 清理旧覆盖项，避免新版封面被早期的个人选择覆盖。
        const { [song.id]: previousArtwork, ...remaining } = artworkOverrides
        localStorage.setItem(ARTWORK_OVERRIDES_KEY, JSON.stringify(remaining))
        setArtworkOverrides(remaining)
      }
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

  async function removeImportedSong(song,confirmed=false) {
    if (!song.isLocal || deletingSongId) return
    // 原两端共用浏览器确认框；安卓改用 DeleteSongDialog，网页保留原确认流程。
    // if (!window.confirm(`确定删除《${song.title}》吗？歌词、音频和这首歌的学习进度都会从当前浏览器移除。`)) return
    if (IS_ANDROID_APP&&!confirmed) { setSongToDelete(song); return }
    if (!IS_ANDROID_APP&&!window.confirm(`确定删除《${song.title}》吗？歌词、音频和这首歌的学习进度都会从当前浏览器移除。`)) return
    setDeletingSongId(song.id)
    try {
      await deleteLocalSong(song.id)
      cancelledAiSongsRef.current.add(song.id)
      // 删除歌曲同样立即作废其解析任务，释放队列且拒绝迟到响应。
      cancelSentenceGeneration(song.id)
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
      // 安卓错误信息也使用本机文案，避免残留浏览器称呼。
      setToast(IS_ANDROID_APP?'删除失败：未能更新本机歌曲库，请重试。':'删除失败：浏览器未能更新本地歌曲库。')
    } finally {
      setDeletingSongId('')
    }
  }

  function choosePlaybackRate(nextRate) {
    setPlaybackRate(nextRate)
    setToast(`已切换为 ${nextRate}× 速度播放。`)
  }

  function startClipPlayback(clip) {
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
      .then(() => { setPlayingLineId(clip.lineId); setAudioError('') })
      .catch(() => {
        setPlayingLineId(null)
        setAudioError('浏览器未能开始播放该句音频。')
      })
  }

  function playLine(lineId) {
    // AI复核试听仍限定单句，不受主界面的连续跟唱模式影响。
    if (unifiedStudy) { study.transport.playLine(lineId, Boolean(lyricAiReviewSong)); return }
    if(!playbackReady){setAudioError(audioUrl?'当前歌词缺少时间戳，请在歌曲编辑中填写时间或重新上传带时间戳的歌词。':'这首歌仅有歌词，可在歌曲编辑中补充音频。');return}
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
    if(!playbackReady){setAudioError(audioUrl?'当前歌词缺少时间戳，请先在歌曲编辑中补全时间轴。':'这首歌尚无音频，请在歌曲编辑中补充。');return}
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
    audio.playbackRate = 1
    audio.play().then(() => { setSingAlongPlaying(true); setAudioError('') })
      .catch(() => { continuousPlaybackRef.current = false; setSingAlongPlaying(false); setAudioError('未能开始播放歌曲。') })
  }

  function playSingAlongFromLine(lineId) {
    // 点击正在唱的句子暂停；再次点击从句首重播，并持续唱到后面。
    const audio = audioRef.current
    if (singAlongLineId === lineId && audio && !audio.paused) { audio.pause(); setSingAlongPlaying(false); return }
    const line = activeSong.lines.find((item) => item.id === lineId)
    if (line) startContinuousPlayback(Math.max(0, (line.start || 0) - LINE_PLAYBACK_LEAD_IN_SECONDS), line.id)
  }

  function toggleSingAlong() {
    const audio = audioRef.current
    if (!audioUrl || !audio) return
    if (!continuousPlaybackRef.current || audio.ended) { startContinuousPlayback(0, activeSong.lines[0]?.id ?? null); return }
    if (!audio.paused) { audio.pause(); setSingAlongPlaying(false); return }
    audio.play().then(() => { setSingAlongPlaying(true); setAudioError('') })
      .catch(() => setAudioError('未能继续播放歌曲。'))
  }

  function handleAudioLoadedMetadata() {
    const continuous = pendingContinuousRef.current
    if (continuous) { startContinuousPlayback(continuous.start, continuous.lineId); return }
    const clip = pendingClipRef.current
    if (!clip) return
    pendingClipRef.current = null
    startClipPlayback(clip)
  }

  function handleAudioTimeUpdate() {
    // 合并页由统一时间轴处理边界；旧网页/复习播放逻辑仍保留。
    if (unifiedStudy) return
    const audio = audioRef.current
    if (continuousPlaybackRef.current && audio) {
      // LRC 时间戳决定当前句；高亮更新不会暂停或跳转音频。
      let lineId = activeSong.lines[0]?.id ?? null
      for (const line of activeSong.lines) {
        if ((line.start || 0) > audio.currentTime + 0.04) break
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
    // 选段只是临时播放单位，禁止借此批量或逐句改写掌握记录。
    if (unifiedStudy && study.transport.inRange(lineId)) return
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
    // 用户允许主动取消读音：原限制 if (!nextReading) { setToast('读音不能为空。'); return }
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
      // 问 AI 的上下文也保留人工取消读音，不擅自恢复自动读法。
      reading: corrections[correctionKey(activeSong.id, target.lineId, token.index)] ?? token.reading,
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
        selection: target.text, language:activeLanguage, // 释义按歌曲语种处理。
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
    {/* 云目录歌曲按首确认下载，完整校验和本机保存完成后再取消暗色状态。 */}
    {cloudSongRequest&&<div className="line-editor-backdrop" onClick={()=>{if(!cloudSongBusy)setCloudSongRequest(null)}}><section className="line-editor cloud-song-download" role="dialog" aria-modal="true" aria-labelledby="cloud-song-download-title" onClick={event=>event.stopPropagation()}><header><h2 id="cloud-song-download-title">下载歌曲数据</h2></header><p>《{cloudSongRequest.song.title}》的封面和学习进度已恢复。是否下载这首歌的音频与歌词？约 {(cloudSongRequest.song.cloudAsset.size/1048576).toFixed(1)} MB。</p>{cloudSongBusy&&<p role="status">正在下载与校验…{cloudSongProgress}%</p>}{cloudSongError&&<p role="alert" className="line-editor-error">{cloudSongError}</p>}<footer><button type="button" disabled={cloudSongBusy} onClick={()=>setCloudSongRequest(null)}>取消</button><button type="button" disabled={cloudSongBusy} onClick={downloadRequestedCloudSong}>{cloudSongBusy?'下载中…':'确认下载'}</button></footer></section></div>}
    {IS_ANDROID_APP && songPickerOpen && <div className="study-song-picker" role="dialog" aria-modal="true" aria-label="选择歌曲"><button className="study-picker-close" type="button" onClick={() => setSongPickerOpen(false)} aria-label="返回当前练习">‹ 返回</button><AndroidSongLibrary selectionMode songs={allSongs.filter((song) => !song.isDemo && normalizeSongSearch(`${song.title}${song.artist}`).includes(normalizeSongSearch(songPickerSearch)))} total={androidLibraryTotal} search={songPickerSearch} onSearch={setSongPickerSearch} artworkFor={artworkForSong} learnedBySong={learnedBySong} activeSongId={activeSong.id} onOpen={(id) => { if(askCloudSong(id,ready=>{chooseSong(ready,true);setSongPickerOpen(false)}))return;chooseSong(id); setSongPickerOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }) }} /></div>}
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
    {/* 删除框独立于歌曲操作菜单，只有点击中文“删除”按钮才进入原有删除流程。 */}
    {IS_ANDROID_APP&&songToDelete&&<DeleteSongDialog song={songToDelete} onCancel={()=>setSongToDelete(null)} onConfirm={()=>{const song=songToDelete;setSongToDelete(null);void removeImportedSong(song,true)}}/>}
    <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" onLoadedMetadata={handleAudioLoadedMetadata} onTimeUpdate={handleAudioTimeUpdate} onEnded={() => { clipEndRef.current = null; continuousPlaybackRef.current = false; setPlayingLineId(null); setSingAlongPlaying(false) }} onError={() => { continuousPlaybackRef.current = false; setPlayingLineId(null); setSingAlongPlaying(false); setAudioError(`未能加载《${activeSong.title}》的音频文件。`) }} />
    {/* 原条件仅隐藏三个主页的品牌栏：!(IS_ANDROID_APP && activePage.startsWith('mobile-'))。 */}
    {/* 安卓歌曲库也由自身标题承担页头，去掉顶部UTA栏后内容自然上移；网页沿用原页头。 */}
    {!(IS_ANDROID_APP && (activePage.startsWith('mobile-') || activePage === 'library')) && <header className={`topbar ${IS_ANDROID_APP ? `android-topbar ${['lesson', 'sing-along'].includes(activePage) ? 'study-topbar-hidden' : ''}` : ''}`}>
      <button className="brand" type="button" onClick={showLessonPage} aria-label="UTA 首页"><span className="brand-mark">う</span><span>UTA<span className="brand-dot">.</span></span></button>
      {/* 旧网页顶部导航保留；安卓使用下方固定的三按钮导航。 */}
      {!IS_ANDROID_APP && <nav className="main-nav" aria-label="主导航"><button className={activePage === 'lesson' ? 'active' : ''} type="button" onClick={showLessonPage}>发音学习</button><button className={activePage === 'library' ? 'active' : ''} type="button" onClick={() => showLibraryPage()}>歌曲库</button><button type="button" onClick={showReviewQueue}>复习</button></nav>}
      {!IS_ANDROID_APP && <div className="top-actions"><button className="icon-button" type="button" onClick={focusLibrarySearch} aria-label="搜索歌曲"><Search size={20} /></button><button className="settings-trigger" type="button" onClick={() => setSettingsOpen(true)} aria-label="设置"><Settings size={19} /><span>设置</span></button></div>}
    </header>}

    {IS_ANDROID_APP && <WebDavAutoSync onCreateBackup={createCloudData} onNotice={setToast}/>}
    {IS_ANDROID_APP && <AppUpdatePrompt updates={appUpdates}/>}
    {/* 首次询问避开启动页、设置及更新弹窗，个人资料保存后立即关闭。 */}
    {IS_ANDROID_APP&&<JapaneseLevelOnboarding enabled={needsJapaneseLevel&&!androidLaunchVisible&&activePage.startsWith('mobile-')&&!settingsOpen&&!appUpdates.checking&&!appUpdates.prompt&&!appUpdates.installing&&!importOpen}/>}
    {sentenceDeleteTarget&&<SentenceDeleteDialog whole={sentenceDeleteTarget.lineId==null} onCancel={()=>setSentenceDeleteTarget(null)} onConfirm={()=>deleteSentenceAnalysis(sentenceDeleteTarget)}/>}
    {/* 首页连续空闲才允许提醒；更新、导入、编辑、练习与各类面板均优先。 */}
    {IS_ANDROID_APP && <CommunityInvite routeKey={`${activePage}:${mobileTab}`} eligible={
      !needsJapaneseLevel && activePage.startsWith('mobile-') && localSongsReady && !androidLaunchVisible &&
      !practiceActive && !study.playing && !study.busy && playingLineId === null && !singAlongPlaying &&
      !settingsOpen && !importOpen && !importBusy && !importPreparing && !importDraft &&
      !songPickerOpen && !songToDelete && !deletingSongId && !backupBusy && !backupPreview && !computerShare &&
      !editingArtworkSong && !editingDetailsSong && !editingDetailsBusy && !editingArtworkChoice && !artworkEditBusy && !artworkEditSaving &&
      !editingLyric && !lyricEditMenu && !lyricEditSaving && !lyricAiReviewSong && !detailOpen && !sentenceExplanationOpen &&
      !cloudSongRequest && !cloudSongBusy && !annotating && !aiBusy && !toast &&
      !appUpdates.checking && !appUpdates.prompt && !appUpdates.downloadState.busy && !appUpdates.installing
    }/>}
    {/* 原学习页只有 android-lesson-page；统一页单独声明布局，不改网页端。 */}
    {/* 主页单独占满可用高度，去掉品牌栏后不留下原栏占位。 */}
    {/* 原主容器没有滚动处理；选段期间滚动只取消手势，不取消已选起点。 */}
    {/* <main id="top" className={...} data-reading-style={readingStyle}> */}
    <main id="top" className={IS_ANDROID_APP ? `android-main ${activePage.startsWith('mobile-') ? 'android-home-main' : ''} ${activePage === 'lesson' ? `android-lesson-page ${unifiedStudy ? 'unified-study-page' : ''}` : ''}` : ''} data-reading-style={readingStyle} onScrollCapture={unifiedStudy ? () => { lyricTapRef.current?.cancel(); cancelLyricPress() } : undefined}>
      {/* 安卓三屏首页按确认稿呈现，模式卡片只负责进入现有功能。 */}
      {IS_ANDROID_APP && activePage.startsWith('mobile-') && <AndroidHome tab={mobileTab} recentLearn={recentLearnSong ? { song: recentLearnSong, artwork: artworkForSong(recentLearnSong) } : null} recentSing={recentSingSong ? { song: recentSingSong, artwork: artworkForSong(recentSingSong) } : null} onEnterLearn={enterRecentLearning} onEnterSingAlong={showSingAlong} onEnterReview={showReviewQueue} onOpenLibrary={() => showLibraryPage()} onOpenSettings={() => setSettingsOpen(true)} />}
      {/* 原独立界面实现保留供对照：
      {IS_ANDROID_APP && activePage === 'sing-along' && <AndroidSingAlong song={activeSong} songs={allSongs} artwork={artworkForSong(activeSong)} audioReady={playbackReady} audioPresent={Boolean(audioUrl)} playing={singAlongPlaying} currentLineId={singAlongLineId} onSelectSong={chooseSong} onPlayFromStart={() => startContinuousPlayback(0, activeSong.lines[0]?.id ?? null)} onPlayFromLine={playSingAlongFromLine} onToggle={toggleSingAlong} error={audioError} onChoose={openStudySongPicker} annotations={annotations} corrections={corrections} readingStyle={readingStyle} onReadingStyle={setReadingStyle} />}
      */}

      {activePage === 'lesson' && <>
      {/* 安卓AI复核独立预览，不沿用网页词语侧栏。 */}
      {/* 原弹窗关闭即丢失结果；现在保留有效缓存，试听使用既有播放器。 */}
      {lyricAiReviewSong && <LyricAiReview song={lyricAiReviewSong} annotations={annotationsBySong[lyricAiReviewSong.id] || []} corrections={corrections} onApply={acceptLyricAiReview} onClose={() => setLyricAiReviewSong(null)} initialResult={lyricAiReviewCacheRef.current[lyricAiReviewSong.id]?.fingerprint===reviewFingerprint(lyricAiReviewSong,corrections)?lyricAiReviewCacheRef.current[lyricAiReviewSong.id]:null} onResult={result=>{lyricAiReviewCacheRef.current[lyricAiReviewSong.id]=result}} onPlay={playLine} playingLineId={playingLineId} audioReady={playbackReady&&activeSong.id===lyricAiReviewSong.id} audioError={audioError} />}
      {/* 原独立界面实现保留供对照：
      {IS_ANDROID_APP && <AndroidLessonHeader song={activeSong} artwork={artworkForSong(activeSong)} learned={learnedLines.size} mode={mode} onMode={setMode} readingStyle={readingStyle} onReadingStyle={setReadingStyle} onChoose={openStudySongPicker} ready={readySentenceCount} generating={Boolean(sentenceExplanationJob)} onGenerate={generateCurrentSongExplanations} onWordDetails={openWordDetails} onReview={() => setLyricAiReviewSong(activeSong)} error={annotationError || audioError || sentenceExplanationError?.songId === activeSong.id && sentenceExplanationError.message} />}
      */}
      {IS_ANDROID_APP && <AndroidStudyHeader song={activeSong} artwork={artworkForSong(activeSong)} learned={learnedLines.size} onChoose={openStudySongPicker} error={annotationError || audioError || sentenceExplanationError?.songId === activeSong.id && sentenceExplanationError.message} />}
      {/* 原独立界面实现保留供对照：
      {IS_ANDROID_APP && <FloatingPlaybackSpeed rate={playbackRate} onChange={choosePlaybackRate} />}
      */}

      {/* 问 AI 固定在倍速上方，每首歌曲独立会话，提问实时带入歌词和校正读音。 */}
      {/* 原独立界面实现保留供对照：
      {IS_ANDROID_APP && <LyricChat key={activeSong.id} song={activeSong} lineId={activeLine.id} annotations={annotations} corrections={corrections} />}
      */}
      {/* 底部三横线与封面共用选歌弹窗，避免两处维护不同的选歌行为。 */}
      {/* 原播放器传参保留对照：
      {unifiedStudy && <AndroidStudyPlayer song={activeSong} onLanguage={changeSongLanguage} readingOptions={activeSongSettings} onReadingOptions={updateSongSettings} transport={study.transport} rate={playbackRate} onRate={choosePlaybackRate} readingStyle={readingStyle} onReadingStyle={setReadingStyle} showTranslation={showStudyTranslation} onTranslation={setShowStudyTranslation} ready={readySentenceCount} total={activeSong.lines.length} generating={Boolean(sentenceExplanationJob)} onGenerate={generateCurrentSongExplanations} onReview={() => { stopLinePlayback(); setLyricAiReviewSong(activeSong) }} chat={<LyricChat key={activeSong.id} song={activeSong} lineId={activeLine.id} annotations={annotations} corrections={corrections} />} />}
      */}
      {unifiedStudy && <AndroidStudyPlayer song={activeSong} onChooseSong={openStudySongPicker} onLanguage={changeSongLanguage} readingOptions={activeSongSettings} onReadingOptions={updateSongSettings} transport={study.transport} rate={playbackRate} onRate={choosePlaybackRate} readingStyle={readingStyle} onReadingStyle={setReadingStyle} showTranslation={showStudyTranslation} onTranslation={setShowStudyTranslation} ready={readySentenceCount} total={activeSong.lines.length} generating={Boolean(sentenceExplanationJob)} onGenerate={()=>generateCurrentSongExplanations(false)} onRegenerate={()=>generateCurrentSongExplanations(true)} onDeleteAnalyses={()=>setSentenceDeleteTarget({songId:activeSong.id,lineId:null})} hasAnalyses={Object.keys(currentSentenceCache).length>0} generationProgress={sentenceExplanationJob?.songId===activeSong.id?sentenceExplanationJob:null} onReview={() => { stopLinePlayback(); setLyricAiReviewSong(activeSong) }} chat={<LyricChat key={activeSong.id} song={activeSong} lineId={activeLine.id} annotations={annotations} corrections={corrections} />} />}
      {/* 已按用户要求移除逐句页顶部返回按钮；系统返回手势和底部导航继续可用。 */}
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
      </section>

      <section className={`practice-layout ${practiceActive ? 'guided-practice-layout' : ''}`} id="lesson" aria-label="歌词发音学习工作区">
        <aside className="lesson-rail">
          <div className="rail-heading"><span>已导入歌曲</span><span>{allSongs.length} 首</span></div>
          <ol className="song-import-list">{allSongs.map((song, index) => <li className={song.id === activeSong.id ? 'current' : ''} key={song.id}><button onClick={() => chooseSong(song.id)} type="button"><em>{String(index + 1).padStart(2, '0')}</em><span><b>{song.title}</b><small>{song.artist} · {song.lines.length} 句</small></span></button></li>)}</ol>
          <div className="learning-tip"><span>→</span><p><b>用法</b>先看自动标注，再点词修正。你保存的版本始终优先。</p></div>
        </aside>

        <section className="lyrics-panel" aria-labelledby="lyrics-heading">
          <div className="panel-head"><div><p className="eyebrow">{practiceActive ? 'LISTEN, RECALL, REVEAL' : 'AUTO ANNOTATE, THEN VERIFY'}</p><h2 id="lyrics-heading">{practiceActive ? '逐句练习' : '逐句读音'}</h2></div>{!practiceActive && <div className="view-toggle" role="group" aria-label="读音显示方式">{[['original', '原文'], ['reading', readingLabel], ['practice', '遮住练习']].map(([value, label]) => <button className={mode === value ? 'selected' : ''} onClick={() => setMode(value)} type="button" key={value}>{label}</button>)}</div>}</div>
          {!practiceActive && <div className="pronunciation-strip"><div><span className="strip-index">{annotating ? 'ANNOTATING' : annotationError ? 'OFFLINE' : 'AUTO READY'}</span><b>{annotating ? '正在为整首歌词生成读音…' : annotationError || '点击带注音的汉字词，可在右侧修改读音'}</b></div><span className="source-badge"><WandSparkles size={13} /> SudachiPy + 本地日中词典</span></div>}
          <div className="audio-tools">{audioUrl&&!playbackReady&&<p className="song-editor-note" role="status">当前歌词缺少时间戳，请在歌曲编辑中手动补全时间，或重新上传带时间戳的歌词后试听和跟唱。</p>}<p className="audio-play-tip"><Volume2 size={13} /> {audioUrl ? practiceActive ? '先听这一句，再尝试自己读出歌词。' : IS_ANDROID_APP ? '点整句区域播放，再点暂停；暂停后再点，从句首重播。' : '点击每句右侧的播放按钮；手机上也可点击整句区域播放或暂停。' : '仅有歌词，可阅读、校对和学习；需要试听时请在歌曲编辑中补充音频。'}</p><label className="speed-control"><span>慢放</span><select value={playbackRate} onChange={(event) => choosePlaybackRate(Number(event.target.value))} aria-label="逐句播放速度"><option value={1}>1×</option><option value={0.75}>0.75×</option><option value={0.5}>0.5×</option><option value={0.25}>0.25×</option></select></label></div>
          {!practiceActive && <div className="sentence-explanation-status"><div><Sparkles size={15} /><span>{sentenceExplanationJob?.songId === activeSong.id ? `正在生成整句解析 ${sentenceExplanationJob.ready} / ${sentenceExplanationJob.total}` : readySentenceCount === activeSong.lines.length ? `整首歌的 ${readySentenceCount} 句解析已就绪` : `整句解析已准备 ${readySentenceCount} / ${activeSong.lines.length} 句`}</span></div>{readySentenceCount < activeSong.lines.length && <button type="button" disabled={Boolean(sentenceExplanationJob)} onClick={generateCurrentSongExplanations}>{sentenceExplanationJob?.songId === activeSong.id ? '生成中…' : '生成剩余解析'}</button>}</div>}
          {!practiceActive && readySentenceCount < activeSong.lines.length && <p className="sentence-explanation-disclosure">生成时会将歌词及已有译文发送给设置中的 AI 服务，可能产生 API 调用费用。</p>}
          {!practiceActive && sentenceExplanationError?.songId === activeSong.id && <p className="sentence-explanation-error" role="alert"><CircleAlert size={13} /> {sentenceExplanationError.message}</p>}
          {!practiceActive && <div className="practice-launch"><div><b>把这一句真正练会</b><span>先听、自己读并猜意思，再揭晓答案。</span></div><div><button className="practice-start" type="button" onClick={() => startPractice('all', activeSong.id, activeLine.id)}><BookOpenCheck size={15} /> 开始逐句练习</button>{currentSongReviewCount > 0 && <button className="practice-review-start" type="button" onClick={() => startPractice('review')}>只练待复习的 {currentSongReviewCount} 句</button>}</div></div>}
          {practiceActive && <section className="guided-card" id="guided-practice" aria-label="逐句练习卡片">
            <div className="guided-card-top"><span>{practiceScope === 'review' ? '待复习句练习' : '全曲逐句练习'}</span><button type="button" onClick={exitPractice}>退出练习 <X size={13} /></button></div>
            {practiceFinished ? <div className="guided-finished" role="status"><BookOpenCheck size={28} /><h3>本轮练习完成</h3><p>已掌握的句子会计入歌曲进度；没把握的句子留在复习清单中。</p><div><button type="button" onClick={() => startPractice('all')}>再练整首</button><button type="button" disabled={!currentSongReviewCount} onClick={() => startPractice('review')}>练习待复习的 {currentSongReviewCount} 句</button></div></div> : <>
              <p className="guided-counter">第 {practicePosition + 1} / {practiceSessionLineIds.length} 句 <span>·</span> {currentSongReviewCount} 句待复习</p>
              <h3 lang="ja">{activeLine.text}</h3>
              <p className="guided-prompt">先听原声，自己读一遍，并猜猜这句的意思。答案在你点击前不会显示。</p>
              <div className="guided-listen"><button type="button" disabled={!playbackReady} onClick={() => playLine(activeLine.id)}>{playingLineId === activeLine.id ? <Pause size={14} /> : <Play size={14} />} {playingLineId === activeLine.id ? '暂停原声' : '听这一句'}</button><span>{audioUrl ? `当前 ${playbackRate}× 速度` : '这首歌尚无音频'}</span></div>
              {audioError && <p className="guided-error" role="alert">{audioError}</p>}
              {practiceRevealed ? <div className="guided-answer" aria-live="polite"><span>读音</span><p lang={readingLang}>{activeLineReading || '自动读音尚未准备好，请先到校对页面确认。'}</p><span>中文释义</span><p>{activeLine.translation || '原 LRC 未提供中文译文，请结合词汇理解这一句。'}</p><button className="guided-sentence-explain" type="button" aria-expanded={sentenceExplanationOpen?.songId === activeSong.id && sentenceExplanationOpen.line.id === activeLine.id} aria-controls={`guided-sentence-analysis-${activeSong.id}-${activeLine.id}`} onClick={() => showSentenceExplanation(activeLine)}><Sparkles size={13} /> {sentenceExplanationOpen?.songId === activeSong.id && sentenceExplanationOpen.line.id === activeLine.id ? '收起整句解析' : '查看整句解析'}</button>{sentenceExplanationOpen?.songId === activeSong.id && sentenceExplanationOpen.line.id === activeLine.id && <SentenceAnalysis explanation={sentenceExplanationOpen.explanation} id={`guided-sentence-analysis-${activeSong.id}-${activeLine.id}`} line={activeLine} entry={sentenceExplanationOpen.entry} stale={!hasCachedSentenceExplanation(currentSentenceCache,activeLine,activeLanguage)} currentLevel={japaneseLevel} busy={Boolean(sentenceExplanationJob)} onDelete={()=>setSentenceDeleteTarget({songId:activeSong.id,lineId:activeLine.id})} onRegenerate={()=>regenerateSentence(activeLine)} />}<div className="guided-grade"><button type="button" onClick={() => gradePracticeLine(false)}>还要再练 · 加入复习</button><button type="button" onClick={() => gradePracticeLine(true)}>我会了 · 下一句 <Check size={14} /></button></div></div> : <button className="guided-reveal" type="button" disabled={!activeLineReading} onClick={() => setPracticeRevealed(true)}>{activeLineReading ? '揭晓读音与译文' : annotationError || '正在准备自动读音…'}</button>}
              <div className="guided-navigation"><button type="button" disabled={practicePosition === 0} onClick={() => goToPracticePosition(practicePosition - 1)}>← 上一句</button><button type="button" disabled={practicePosition + 1 >= practiceSessionLineIds.length} onClick={() => goToPracticePosition(practicePosition + 1)}>跳过这一句 →</button></div>
            </>}
          </section>}
          {!practiceActive && <>
          <p className="selection-guide"><MousePointer2 size={13} /> 按住鼠标左键向右拖过词语，松开后点高亮段右上角的“AI 解释”。</p>
          <div className="mobile-word-dock"><div><b>{focusToken.surface} <span lang={readingLang}>{focusDisplayReading}</span></b><small>{wordMeaning || '常用意思待补充'}</small></div><button type="button" onClick={openWordDetails}>查看详情</button></div>
          {reviewNeeded > 0 && <p className="annotation-tip warn"><CircleAlert size={13} /> 有 {reviewNeeded} 个词典未能确定读音，请优先人工校对。</p>}
          {aiError && <p className="annotation-tip ai-error"><CircleAlert size={13} /> {aiError}</p>}
          {aiReview && <p className="ai-review-summary"><Sparkles size={13} /> AI 已复核 {aiReview.reviewed_token_count} 个词素：{pendingAiSuggestions.length ? <>还有 {pendingAiSuggestions.length} 处待处理建议，<button type="button" onClick={() => document.getElementById('ai-review-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>查看全部</button></> : aiReview.suggestions?.length ? '所有建议均已处理。' : '未发现明显异常；仍建议以原唱为准。'}</p>}
          <div className="lyrics-list">
            {/* 原 map 只接收 line；数组位置用于判断选段，不能假定句子 id 连续。 */}
            {activeSong.lines.map((line, lineIndex) => {
              const annotation = annotations?.find((item) => item.id === line.id)
              const lineTokens = annotation?.tokens
              const current = line.id === activeLine.id
              const isPlaying = playingLineId === line.id
              const isLearned = learnedLines.has(line.id)
              const lineReading = activeLanguage!=='ja'?'':getLineReading(lineTokens, corrections, activeSong.id, line.id, readingStyle, line.romaji)
              const hasSentenceExplanation = visibleSentenceEntry(currentSentenceCache[line.id], line, activeLanguage)
              const sentenceExpanded = sentenceExplanationOpen?.songId === activeSong.id && sentenceExplanationOpen.line.id === line.id
              // 已选段的各句共享连续底色；操作按钮保留布局位置但禁用并移出可访问控件树。
              const rangeSelected = unifiedStudy && study.range && lineIndex >= study.range.startIndex && lineIndex <= study.range.endIndex
              const rangeAnchor = unifiedStudy && study.rangeAnchorId === line.id
              const rangeEdge = rangeSelected ? `${lineIndex === study.range.startIndex ? 'range-start' : ''} ${lineIndex === study.range.endIndex ? 'range-end' : ''}` : ''
              // 原点击播放保留；新增整句长按与滚动取消，抬手后不误触播放或词语详情。
              // 原行属性：className={`lyric-row ${current ? 'active' : ''}`}；其余原长按/点击事件保留，新加选段样式与双击缩放抑制。
              return <article id={`lyric-row-${activeSong.id}-${line.id}`} className={`lyric-row ${current ? 'active' : ''} ${rangeSelected ? 'lyric-range-selected' : ''} ${rangeAnchor ? 'lyric-range-anchor' : ''} ${rangeEdge}`} data-range-selected={rangeSelected ? 'true' : undefined} data-range-anchor={rangeAnchor ? 'true' : undefined} aria-describedby={rangeSelected || rangeAnchor ? 'study-range-note' : undefined} onPointerDownCapture={(event) => beginLyricPress(event, line.id)} onPointerMoveCapture={moveLyricPress} onPointerUpCapture={(event) => { cancelLyricPress(); suppressLyricPressClick(event) }} onPointerCancel={cancelLyricPress} onPointerLeave={cancelLyricPress} onClickCapture={suppressLyricPressClick} onDoubleClick={unifiedStudy ? event => event.preventDefault() : undefined} onContextMenu={(event) => { if (IS_ANDROID_APP) event.preventDefault() }} onClick={(event) => handleLyricRowClick(event, line.id)} key={`${activeSong.id}-${line.id}`}>
                <span className="line-number">{String(line.displayNumber).padStart(2, '0')}</span>
                <div className="auto-line-wrap">
                  {/* 自带罗马音按可靠边界用于 ruby 与整句读音；人工校正继续优先。 */}<div className="japanese"><AnnotatedLine language={activeLanguage} showSourceReadings={activeSongSettings.showSourceReadings} showManualReadings={activeSongSettings.showManualReadings} text={line.text} interactive={!IS_ANDROID_APP} importedRomaji={line.romaji} tokens={lineTokens} corrections={corrections} songId={activeSong.id} lineId={line.id} mode={IS_ANDROID_APP ? readingStyle === 'none' ? 'original' : 'reading' : mode} readingStyle={readingStyle} selectedIndex={current ? selectedTokenIndex : -1} selectionRange={dragSelection?.lineId === line.id ? dragSelection : selectedPhraseRange?.lineId === line.id ? selectedPhraseRange : null} showSelectionAction={selectedText?.lineId === line.id && selectedPhraseRange?.lineId === line.id} onStartSelection={(tokenIndex) => beginTokenSelection(line.id, tokenIndex)} onExtendSelection={(tokenIndex) => extendTokenSelection(line.id, tokenIndex)} onFinishSelection={finishTokenSelection} onExplainSelection={() => askAiToExplain(selectedText)} onSelectToken={(tokenIndex) => handleTokenClick(line.id, tokenIndex)} /></div>
                  {/* 原来空读音始终显示“正在生成读音…”；已校对留空时隐藏读音行。 */}
                  {/* 原文模式不再逐句显示切换注音提示；保留读音与练习模式的内容。原条件：mode !== 'reading' || !lineTokens || lineReading */}
                  {(!IS_ANDROID_APP || mode !== 'reading') && mode !== 'original' && (mode !== 'reading' || !lineTokens || lineReading) && <div className={`reading ${lineTokens ? '' : 'needs-review'}`}>{mode === 'reading' ? lineTokens ? lineReading : '正在生成读音…' : mode === 'practice' ? '读音已隐藏，尝试自己读出这一句' : `切换到“${readingLabel}”查看自动标注`}</div>}
                  {/* 原来始终显示译文：line.translation && <div className="translation lyric-translation">{line.translation}</div> */}
                  {line.translation && (!IS_ANDROID_APP || showStudyTranslation) && <div className="translation lyric-translation">{line.translation}</div>}
                </div>
                {/* 统一页仅显示操作图标；旧文字保留给网页，图标仍提供完整可访问名称。 */}
                {/* 原 line-actions 无 aria-hidden，播放/掌握按钮无 disabled，解析仅按生成状态 disabled；保留原操作，选段内统一禁用。 */}
                <div className="line-actions" aria-hidden={rangeSelected ? true : undefined}><button className={`line-action line-play ${isPlaying ? 'playing' : ''}`} type="button" disabled={Boolean(rangeSelected)} onClick={(event) => { event.stopPropagation(); playLine(line.id) }} aria-label={`${isPlaying ? '暂停' : '播放'}第 ${line.displayNumber} 句`} title={`${isPlaying ? '暂停' : '播放'}这一句`}>{isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button><button className={`line-mastery ${isLearned ? 'mastered' : ''}`} type="button" disabled={Boolean(rangeSelected)} aria-label={`第 ${line.displayNumber} 句，${isLearned ? '已掌握，改为未掌握' : '未掌握，标记为已掌握'}`} aria-pressed={isLearned} onClick={(event) => { event.stopPropagation(); toggleLearnedLine(line.id) }} title={isLearned ? '点击改为未掌握' : '点击标记为已掌握'}>{isLearned ? <Check size={12} /> : <Circle size={11} />}{!unifiedStudy && <span>{isLearned ? '已掌握' : '未掌握'}</span>}</button><button className="sentence-explain-link" type="button" aria-label={`第 ${line.displayNumber} 句，${sentenceExpanded ? '收起解析' : hasSentenceExplanation ? '查看解析' : '生成解析'}`} title={sentenceExpanded ? '收起解析' : hasSentenceExplanation ? '查看解析' : '生成解析'} aria-expanded={sentenceExpanded} aria-controls={`sentence-analysis-${activeSong.id}-${line.id}`} disabled={Boolean(rangeSelected) || !hasSentenceExplanation && Boolean(sentenceExplanationJob)} onClick={(event) => { event.stopPropagation(); showSentenceExplanation(line) }}><Sparkles size={11} />{!unifiedStudy && (sentenceExpanded ? '收起解析' : hasSentenceExplanation ? '查看解析' : sentenceExplanationJob ? '生成中…' : '生成解析')}</button></div>
                {IS_ANDROID_APP && <span className="android-line-state">{isPlaying ? '♪ 正在播放' : current ? '长按编辑歌词' : ''}</span>}
                {/* 原 sentenceExpanded 即显示；选段内隐藏异步返回的逐句解析，退出后恢复正常入口。 */}
                {!rangeSelected && sentenceExpanded && <SentenceAnalysis explanation={sentenceExplanationOpen.explanation} id={`sentence-analysis-${activeSong.id}-${line.id}`} line={line} entry={sentenceExplanationOpen.entry} stale={!hasCachedSentenceExplanation(currentSentenceCache,line,activeLanguage)} currentLevel={japaneseLevel} busy={Boolean(sentenceExplanationJob)} onDelete={()=>setSentenceDeleteTarget({songId:activeSong.id,lineId:line.id})} onRegenerate={()=>regenerateSentence(line)} />}
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
      {!IS_ANDROID_APP && <section className="review-queue-section" id="review-queue" aria-labelledby="review-queue-title">
        <div className="review-queue-heading"><div><p className="eyebrow">WORDS IN CONTEXT, ONE LINE AT A TIME</p><h2 id="review-queue-title">待复习的句子 <span>{reviewQueue.length}</span></h2><p>练习时选择“还要再练”，句子就会来到这里；学会后会自动移出。</p></div>{currentSongReviewCount > 0 && <button type="button" onClick={() => startPractice('review')}>练习本首待复习句 <ChevronRight size={15} /></button>}</div>
        {reviewQueue.length ? <ol className="review-line-list">{reviewQueue.map(({ song, line }) => <li key={`${song.id}:${line.id}`}><button type="button" onClick={() => startPractice('review', song.id, line.id)}><span>{song.title} · 第 {line.displayNumber} 句</span><b lang="ja">{line.text}</b><small>开始练习 <ChevronRight size={13} /></small></button></li>)}</ol> : <p className="review-queue-empty">目前没有待复习句。开始逐句练习，把没把握的句子留下来。</p>}
      </section>}

      <section className="method-section"><div className="method-title"><p className="eyebrow">THE CORRECTION LOOP</p><h2>自动起稿，<br />由学习者校准。</h2></div><div className="method-cards"><article><span>01</span><h3>全曲自动注音</h3><p>导入任意日语歌词后，由 Sudachi 词典逐词生成读音初稿。</p></article><article><span>02</span><h3>AI 复核与人工确认</h3><p>AI 只标出可能不合理的读法；采用、修改或忽略建议始终由你决定。</p></article><article><span>03</span><h3>按语境理解词汇</h3><p>选中词或短语再请求讲解，结合相邻歌词学习词义和变形。</p></article></div></section>

      </>}

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
        {!IS_ANDROID_APP && <>
        <div className="library-top"><div><p className="eyebrow">YOUR IMPORTED SONGS</p><h2 id="library-title">歌曲库</h2><p>从已导入的歌词中选一首，继续练习发音与词汇。</p></div><div className="library-top-actions"><label className="library-search"><Search size={14} /><input id="library-search" type="search" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="搜索歌名或歌手" aria-label="搜索歌名或歌手" />{librarySearch && <button type="button" onClick={() => setLibrarySearch('')} aria-label="清除搜索"><X size={13} /></button>}</label><span className="library-count">{librarySearch ? `找到 ${visibleLibrarySongs.length} / ${allSongs.length} 首` : `已导入 ${allSongs.length} 首`}</span><button className="library-import-trigger" type="button" onClick={openImportDialog}><Download size={14} /> 导入歌曲</button>{!IS_ANDROID_APP && <button className="library-import-trigger" type="button" onClick={shareComputerSongs}><Upload size={14} /> 共享到手机</button>}</div></div>
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
      {/* 原独立界面实现保留供对照：
    {IS_ANDROID_APP && <AndroidBottomNav activeTab={mobileTab} onSelect={showMobileTab} />}
      */}
    {IS_ANDROID_APP && !unifiedStudy && <AndroidBottomNav activeTab={mobileTab} onSelect={showMobileTab} />}

    {/* 旧调用未传入当前封面：
    {editingDetailsSong && <SongDetailsEditor key={editingDetailsSong.id} song={editingDetailsSong} onClose={() => { if (!editingDetailsBusy) setEditingDetailsSong(null) }} onSave={saveSongDetails} busy={editingDetailsBusy} />}
    */}
    {editingDetailsSong && <SongDetailsEditor key={editingDetailsSong.id} song={editingDetailsSong} artwork={Object.hasOwn(artworkOverrides, editingDetailsSong.id) ? artworkOverrides[editingDetailsSong.id] : editingDetailsSong.artworkUrl || editingDetailsSong.artworkChoice === 'default' ? editingDetailsSong : songArtworkBySource[editingDetailsSong.sourceFile]} onClose={() => { if (!editingDetailsBusy) setEditingDetailsSong(null) }} onSave={saveSongDetails} busy={editingDetailsBusy} />}

    {editingArtworkSong && <div className="settings-backdrop" onClick={() => { if (!artworkEditSaving) setEditingArtworkSong(null) }}><section className="artwork-edit-dialog" role="dialog" aria-modal="true" aria-label={`更换《${editingArtworkSong.title}》的封面`} onClick={(event) => event.stopPropagation()}>
      <button className="song-import-close" type="button" disabled={artworkEditSaving} onClick={() => setEditingArtworkSong(null)} aria-label="关闭封面选择"><X size={18} /></button>
      <h2>更换《{editingArtworkSong.title}》的封面</h2><p>可从音乐平台候选中选择、上传图片，或使用默认封面。</p>
      <ArtworkPicker title={editingArtworkSong.title} artist={editingArtworkSong.artist} selected={editingArtworkChoice} onSelect={setEditingArtworkChoice} onBusy={setArtworkEditBusy} />
      {editingArtworkChoice?.artworkUrl && <div className="artwork-edit-preview"><img src={editingArtworkChoice.artworkUrl} alt="选中的封面" referrerPolicy="no-referrer" /><span>将展示：{editingArtworkChoice.artworkProvider}</span></div>}
      {artworkEditError && <p className="artwork-picker-error" role="alert">{artworkEditError}</p>}
      <div className="artwork-edit-actions"><button type="button" disabled={artworkEditSaving} onClick={() => setEditingArtworkSong(null)}>取消</button><button type="button" disabled={artworkEditSaving || artworkEditBusy} onClick={saveArtworkEditor}>{artworkEditSaving ? '正在保存到本机…' : '保存封面'}</button></div>
    </section></div>}

    {/* 旧网页页脚保留；安卓让底部主导航固定在屏幕下沿。 */}
    {!IS_ANDROID_APP && <footer><span>UTA. Learn Japanese, one lyric at a time.</span><span>自动注音在本机生成 · 词义数据：<a href="https://github.com/tomoshi-app/tomoshi-dict-data" target="_blank" rel="noreferrer">Tomoshi / EDRDG</a> · AI 请求仅在你主动点击后发起</span></footer>}

    {settingsOpen && <SettingsDialog updates={appUpdates} onCloudExport={createCloudData} readingStyle={readingStyle} onReadingStyleChange={setReadingStyle} onClose={() => setSettingsOpen(false)} onExport={exportLearningData} onRestore={async (file) => { const ready = await prepareBackupRestore(file); if (ready) setSettingsOpen(false) }} backupBusy={backupBusy} backupError={backupError} />}
    {backupPreview && <div className="backup-backdrop" role="presentation" onClick={() => { if (backupBusy !== 'restore') { setBackupPreview(null); setBackupError('') } }}><section className="backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-dialog-title" onClick={(event) => event.stopPropagation()}>
      <button className="backup-close" type="button" disabled={backupBusy === 'restore'} onClick={() => { setBackupPreview(null); setBackupError('') }} aria-label="关闭备份预览"><X size={18} /></button>
      <p className="eyebrow">RESTORE LOCAL DATA</p><h2 id="backup-dialog-title">确认恢复备份</h2>
      <p className="backup-file-name">{backupPreview.file.name || 'UTA 备份文件'}</p>
      {backupPreview.extras && <p className="backup-cloud-note">包含个人资料、头像和历史对话。{backupPreview.extras.ai?.api_key ? <strong role="alert">此备份包含 API Key，请妥善保管。</strong> : '不含 API Key；恢复后需重新填写 AI 密钥。'}</p>}
      {/* 原预览统一标记“含音频”；云目录明确说明音频与歌词按首下载。 */}
      <dl className="backup-summary"><div><dt>备份时间</dt><dd>{new Date(backupPreview.manifest.createdAt).toLocaleString('zh-CN')}</dd></div><div><dt>导入歌曲</dt><dd>{backupPreview.manifest.songs.length} 首（{backupPreview.cloudCatalog?'音频与歌词按首下载':'含音频'}）</dd></div><div><dt>读音修正</dt><dd>{Object.keys(backupPreview.manifest.progress.corrections).length} 处</dd></div><div><dt>待复习句</dt><dd>{backupPreview.manifest.progress.reviewItems.length} 句</dd></div><div><dt>文件大小</dt><dd>{(backupPreview.cloudFile?.size??backupPreview.file.size)/1048576 < .1 ? '< 0.1' : ((backupPreview.cloudFile?.size??backupPreview.file.size)/1048576).toFixed(1)} MB</dd></div></dl>
      <p className="backup-warning"><CircleAlert size={16} /> 恢复会替换当前浏览器中的网页导入歌曲和学习数据，包括已掌握句子、读音修正与复习清单。建议先导出当前数据。</p>
      {backupError && <p className="library-backup-error" role="alert">{backupError}</p>}
      <div className="backup-dialog-actions"><button type="button" disabled={backupBusy === 'restore'} onClick={() => { setBackupPreview(null); setBackupError('') }}>取消</button><button type="button" disabled={backupBusy === 'restore'} onClick={restoreLearningData}>{backupBusy === 'restore' ? <LoaderCircle className="spin" size={14} /> : <Upload size={14} />}{backupBusy === 'restore' ? '正在恢复…' : '覆盖当前数据并恢复'}</button></div>
    </section></div>}

    {importOpen && <div className="song-import-backdrop" role="presentation" onClick={closeImportDialog}>
      {/* 手机先选来源；原有的手机文件导入表单仍可直接使用。 */}
      {importSource === null ? <section className="song-import-dialog import-source-dialog" role="dialog" aria-modal="true" aria-labelledby="import-source-title" onClick={(event) => event.stopPropagation()}>
        <button className="song-import-close" type="button" onClick={closeImportDialog} aria-label="关闭导入窗口"><X size={18} /></button>
        <p className="eyebrow">CHOOSE A SOURCE</p><h2 id="import-source-title">从哪里导入歌曲？</h2>
        <p className="song-import-intro">你可以选手机上的歌词和音频文件，也可以连接电脑网页，选择它已经保存的歌曲。</p>
        <div className="import-source-options"><button type="button" onClick={() => setImportSource('phone')}><strong>从手机文件导入</strong><span>可只导入歌词，音频以后补充。</span></button><button type="button" onClick={() => setImportSource('computer')}><strong>从电脑网页导入</strong><span>连接电脑后查看已有歌曲，可全部或部分导入。</span></button></div>
      </section> : importSource === 'computer' ? <ComputerImportDialog onClose={closeImportDialog} onImport={importSelectedComputerSongs} existingSongIds={localSongs.map((song) => song.id)} /> : <form className="song-import-dialog" onSubmit={(event) => { event.preventDefault(); importLocalSong() }} onClick={(event) => event.stopPropagation()}>
      <button className="song-import-close" type="button" onClick={closeImportDialog} aria-label="关闭导入窗口"><X size={18} /></button>
      <p className="eyebrow">ADD A LOCAL SONG</p><h2>导入歌曲开始学习</h2><p className="song-import-intro">导入歌词文件或搜索选用歌词即可保存；音频可选，无时间戳的歌词也能阅读。</p>
      {/* 旧版先选 LRC 再选音频；现在让音频在前，选中后即可自动搜索歌词。 */}
      <label className={`song-file-field ${importAudioFile ? 'selected' : ''}`}><span>01 · 原声音频（可选）</span><strong>{importAudioFile?.name || '选择 MP3、M4A、WAV、OGG 等音频'}</strong><small>{importAudioGuess?.title ? `识别：${importAudioGuess.title}${importAudioGuess.artist ? ` · ${importAudioGuess.artist}` : ''}，正在自动查找歌词` : '选择后会按音频标签或文件名自动查找歌词'}</small><input key={importAudioFile?.name || 'empty-audio'} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" onChange={(event) => chooseImportAudioFile(event.target.files?.[0] || null)} /></label>
      <label className={`song-file-field ${importLrcFile ? 'selected' : ''}`}><span>02 · 歌词文件</span><strong>{importLrcFile?.name || '选择歌词文本文件，或从搜索结果选用'}</strong><small>支持 LRC、TXT、UTA 注音 JSON 等文本，不要求时间戳</small><input key={importLrcFile?.name || 'empty-lrc'} type="file" onChange={(event) => prepareLrcPreview(event.target.files?.[0] || null)} /></label>
      {/* 音频可先选；在线命中同步歌词后直接生成同等的 LRC 文件进入原预览流程。 */}
      <OnlineSongSearch onChooseLyrics={prepareLrcPreview} autoQuery={importAutoQuery} />
      {importPreparing && <p className="import-preview-loading"><LoaderCircle className="spin" size={14} /> 正在解析歌词与译文…</p>}
      {importDraft && <section className="import-preview" aria-labelledby="import-preview-title">
        <div className="import-preview-heading"><div><p className="eyebrow">REVIEW BEFORE SAVING</p><h3 id="import-preview-title">导入预览</h3></div><span>{importDraft.lines.length} 句 · 歌名与歌手资料行已排除</span></div>
        <div className="import-meta-fields"><label>歌曲名<input value={importDraft.title} onChange={(event) => updateImportMetadata('title', event.target.value)} maxLength={160} /></label><label>歌手<input value={importDraft.artist} onChange={(event) => updateImportMetadata('artist', event.target.value)} maxLength={160} /></label></div>
        {/* 旧单来源封面预览保留作对照，实际使用下方多来源选择器。 */}{false && <div className="import-cover-preview"><div className="import-cover-thumb"><span>{importDraft.title.slice(0, 2) || 'UTA'}</span>{/^https?:\/\//i.test(importArtworkUrl) && <img key={importArtworkUrl} src={importArtworkUrl} alt="候选歌曲封面" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true }} />}</div><div className="import-cover-controls"><b>封面预览</b><p>{importArtworkStatus === 'loading' ? '正在按歌名与歌手查找封面…' : importArtworkStatus === 'found' ? '已找到候选封面，请核对是否正确。' : importArtworkStatus === 'none' ? '未找到可靠封面，可填写链接或使用默认封面。' : importArtworkStatus === 'manual' ? '使用你填写的封面链接。' : importArtworkStatus === 'default' ? '将使用默认封面。' : '请查找封面，或选择默认封面。'}</p><div><button type="button" disabled={importArtworkStatus === 'loading'} onClick={() => searchImportArtwork(importDraft.title, importDraft.artist)}>重新查找</button><button type="button" onClick={useDefaultImportArtwork}>使用默认封面</button></div><label>也可以填写封面图片链接<input type="url" value={importArtworkUrl} onChange={(event) => changeImportArtworkUrl(event.target.value)} placeholder="https://example.com/cover.jpg" /></label>{importArtworkStatus === 'found' && importArtwork?.artworkSourceUrl && <a href={importArtwork.artworkSourceUrl} target="_blank" rel="noreferrer">查看封面来源 · {importArtwork.artworkProvider || 'Apple Music'}</a>}</div></div>}
        <SongLanguageSelect language={importDraft.language} lines={importDraft.lines} automatic={!importDraft.language} onChange={language=>updateImportMetadata('language',language)}/><ArtworkPicker title={importDraft.title} artist={importDraft.artist} selected={importArtwork} onSelect={selectImportArtwork} />
        {/* 原入口只在末尾添加：<button type="button" onClick={addImportLine}><Plus size={13} /> 添加一句</button> */}
        <div className="import-lines-heading"><div><b>歌词与时间轴</b><span>时间可留空；全部填写后按时间排序，未填完整时保留原顺序。</span></div></div>
        {/* 导入与编辑页一致，通过添加位置选择句首、句中或句尾。 */}
        <div className="song-editor-insert import-line-insert"><label>添加位置<select value={Math.min(importInsertAt, importDraft.lines.length)} onChange={(event) => setImportInsertAt(Number(event.target.value))}><option value={0}>第1句之前</option>{importDraft.lines.map((line,index) => <option key={line.draftId} value={index+1}>第{index+1}句之后{index === importDraft.lines.length-1 ? '（最后）' : ''}</option>)}</select></label><button type="button" onClick={addImportLine}><Plus size={15} />添加一句</button></div>
        <ol className="import-preview-lines">{importDraft.lines.map((line, index) => <li key={line.draftId}><span>{String(index + 1).padStart(2, '0')}</span><div><label>时间戳<input value={line.timeText} onChange={(event) => updateImportLine(line.draftId, 'timeText', event.target.value)} placeholder="00:12.345" aria-label={`第 ${index + 1} 句时间戳`} /></label><label>原文歌词<input value={line.text} onChange={(event) => updateImportLine(line.draftId, 'text', event.target.value)} maxLength={500} lang={songLanguage(importDraft)==='ja'?'ja':undefined} aria-label={`第 ${index + 1} 句原文歌词`} /></label><label>中文译文<input value={line.translation} onChange={(event) => updateImportLine(line.draftId, 'translation', event.target.value)} maxLength={500} aria-label={`第 ${index + 1} 句中文译文`} placeholder="没有译文可留空" /></label>{/* 导入自动填入 LRC 罗马音，也允许逐句人工输入。 */}{songLanguage(importDraft)!=='zh'&&<label>{songLanguage(importDraft)==='ja'?'罗马音':'来源发音标注'}<input value={line.romaji || ''} onChange={(event) => updateImportLine(line.draftId, 'romaji', event.target.value)} maxLength={1000} lang={songLanguage(importDraft)==='ja'?'ja-Latn':undefined} aria-label={`第 ${index + 1} 句来源发音标注`} placeholder={songLanguage(importDraft)==='ja'?'可留空，留空使用自动注音':'可留空；来源标注按原样保留'} /></label>}</div><button className="import-remove-line" type="button" onClick={() => removeImportLine(line.draftId)} aria-label={`删除第 ${index + 1} 句`} title="删除这一句"><Trash2 size={14} /></button></li>)}</ol>
      </section>}
      {/* 原来强制导入时等待全曲解析；现在让用户明确选择，保存成功即关闭导入窗口。 */}
      <fieldset className="import-ai-choice"><legend>AI 解析</legend><label><input type="radio" name="import-ai-mode" checked={importAiMode === 'later'} onChange={() => setImportAiMode('later')} /><span><strong>直接导入</strong><small>立即开始学习，需要时在学习页生成整句解析。</small></span></label><label><input type="radio" name="import-ai-mode" checked={importAiMode === 'background'} onChange={() => setImportAiMode('background')} /><span><strong>导入并在后台生成</strong><small>保存后即可继续使用；解析会逐句完成，可能产生 AI 调用费用。</small></span></label></fieldset>
      {importAiMode === 'background' && <p className="import-ai-disclosure"><Sparkles size={14} /> AI 生成期间可以继续在应用内学习。若应用被系统关闭，未完成的句子会在下次打开时续做；需要先在设置中配置 AI 服务。</p>}
      {/* 旧导入等待提示保留供对照：{importAiProgress && <p className="import-ai-progress">正在生成整句解析</p>} */}
      {importError && <p className="song-import-error"><CircleAlert size={14} /> {importError}</p>}
      <div className="song-import-actions"><button type="button" onClick={closeImportDialog} disabled={importBusy}>取消</button><button className="song-import-submit" type="submit" disabled={importBusy || importPreparing || importArtworkStatus === 'loading'}>{importBusy ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}{importBusy ? '正在保存…' : importAiMode === 'background' ? '导入并后台生成' : '直接导入歌曲'}</button></div>
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
  </>
}

// 多语言适配前的相关实现保留对照（新逻辑在原位置）。
// import AndroidStudyPlayer, { AndroidStudyHeader }
// const [readingStyle, setReadingStyle] = useState
// const [showStudyTranslation, setShowStudyTranslation] = useState
// useEffect(() => { localStorage.setItem('uta-study-translation-v1', String(showStudyTranslation)) }, [showStudyTranslation])
//   const readingLabel = readingStyle === 'both' ? '假名＋罗马音' : readingStyle === 'romaji' ? '罗马音' : '平假名'
//   const readingLang = readingStyle === 'romaji' ? 'ja-Latn' : 'ja'
// applyLyricEdits(withoutSongHeadingLines(song), learningState.progress.lyricEditsBySong)).filter
// [localSongs, importedSongs, learningState.progress.lyricEditsBySong])
// const { learnedBySong, reviewItems, favoriteSongIds, corrections, lyricSnapshots, lyricEditsBySong }
//   function artworkForSong(song) {
// activeSong.lines.some((line) => annotationMatchesLine(annotation, line))), [annotationsBySong, activeSong])
// readingStyle, lyricEditsBySong }
// readingStyle, lyricEditsBySong])
//     annotateSongLines(missing)
// [activeSong.id, activeSong.lines, annotationsBySong[activeSong.id]])
// const missing = activeSong.lines.filter((line) => !cached.some((annotation) => annotationMatchesLine(annotation, line)))
// ...cached, ...annotation.map
// const result = await explainSentenceBatchWithAi(contextLines)
// title, artist, album: importDraft.album || '', sourceFile: importLrcFile.name,
// 缺少日文歌词。
// <ArtworkPicker title={importDraft.title}
// <AndroidStudyPlayer transport={study.transport}
// <AnnotatedLine text={line.text}
// <label>日文歌词<input value={line.text}
// maxLength={500} lang="ja" aria-label={`第 ${index + 1} 句日文歌词`}
// <label>罗马音<input value={line.romaji
// placeholder="可留空，留空使用自动注音"

// 多语言适配前的相关实现保留对照（新逻辑在原位置）。
// lyricSnapshots,readingStyle,lyricEditsBySong}
// <LyricLineEditor key=

// 多语言适配前的相关实现保留对照（新逻辑在原位置）。
// function hasCachedSentenceExplanation(cache, line)
// return entry?.text === line.text && typeof entry.explanation?.meaning
// hasCachedSentenceExplanation(currentSentenceCache, line)
// hasCachedSentenceExplanation(cache, line)
// hasCachedSentenceExplanation(sentenceExplanationsBySong[activeSong.id], line)
// hasCachedSentenceExplanation(result.cache, line)
// cache[line.id] = { text: line.text, explanation }
// function changeSongLanguage(language) { stopLinePlayback(); updateSongSettings({language}) }
// const activeLineReading = getLineReading(
// const lineReading = getLineReading(
//         selection: target.text,

// 多语言适配前的相关实现保留对照（新逻辑在原位置）。
// <label>{songLanguage(importDraft)==='ja'?'罗马音':'来源发音标注'}
// '可留空；来源标注按原样保留'} /></label>
// maxLength={1000} lang="ja-Latn" aria-label={`第 ${index + 1} 句罗马音`}
// setToast('已切换歌词，正在准备自动读音。')
