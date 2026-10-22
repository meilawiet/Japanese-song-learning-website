// 项目歌曲的单句时间覆盖参与备份校验；本地歌曲的时间直接保存在歌曲记录。
import { validTimeOverrides } from './timestampTuning.js'
// 新复习单元与旧单句均可备份；额外行编号、原文和复习进度须通过结构校验。
import {validReviewItem} from './reviewBook.js'
const SIGNATURE = 'UTA-LEARNING-BACKUP\n'
const VERSION = 1
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const signatureBytes = encoder.encode(SIGNATURE)

export const BACKUP_STORAGE_KEYS = {
  progress: 'uta-pronunciation-progress-v2',
  annotations: 'uta-auto-annotations-v5',
  aiReviews: 'uta-ai-reviews-v1',
  sentenceExplanations: 'uta-sentence-explanations-v1',
  artworkOverrides: 'uta-artwork-overrides-v1',
}

// 用户上传的封面已在本地压缩；备份只接收受控 JPEG data URL 或普通图片链接。
function validArtworkUrl(value) {
  return typeof value === 'string' && (value.length <= 500_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/u.test(value)
    || value.length <= 2048 && /^https?:\/\//iu.test(value))
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// 兼容旧快照；新增的人工词界保护及待核对记录必须是受控数据，不能把损坏记录当成自动缓存应用。
function validManualSnapshot(snapshot) {
  const annotations=snapshot.manualAnnotations,pending=snapshot.unresolvedCorrections
  if(annotations!=null&&(!isRecord(annotations)||Object.entries(annotations).some(([id,line])=>!isRecord(line)||String(line.id)!==id||!Number.isSafeInteger(line.id)||typeof line.text!=='string'||!Array.isArray(line.tokens)||line.tokens.some(token=>!isRecord(token)||!Number.isSafeInteger(token.index)||typeof token.surface!=='string'||typeof token.reading!=='string')||line.tokens.map(token=>token.surface).join('')!==line.text)))return false
  // 待核对记录可附带原词界证据，验证规则与活动人工快照相同。
  return pending==null||isRecord(pending)&&Object.values(pending).every(history=>Array.isArray(history)&&history.every(item=>isRecord(item)&&typeof item.reading==='string'&&(item.text===null||typeof item.text==='string')&&(item.annotation==null||isRecord(item.annotation)&&validManualSnapshot({manualAnnotations:{[item.annotation.id]:item.annotation}}))))
}

function checkState(manifest) {
  if (!isRecord(manifest.progress) || !isRecord(manifest.annotations)
    || !isRecord(manifest.aiReviews) || !isRecord(manifest.sentenceExplanations)) {
    throw new Error('备份中的学习数据格式不正确。')
  }
  const progress = manifest.progress
  // 按歌曲保存的语言与显示选项参与备份校验，兼容没有这些字段的旧备份。
  if (progress.songSettings != null && (!isRecord(progress.songSettings) || Object.values(progress.songSettings).some(value =>
    !isRecord(value) || value.language != null && !['zh','ja','ko','other'].includes(value.language)
    || value.readingStyle != null && !['none','hiragana','romaji','both'].includes(value.readingStyle)
    // 新位置偏好随备份/云同步保存，兼容没有此字段的旧数据。
    || value.romajiPosition != null && !['above','below'].includes(value.romajiPosition)
    || value.timeOverrides != null && !validTimeOverrides(value.timeOverrides)
    || ['showTranslation','showSourceReadings','showManualReadings'].some(key=>value[key]!=null&&typeof value[key]!=='boolean')))) throw new Error('备份中的歌曲语言或显示选项无效。')
  if (manifest.artworkOverrides != null && (!isRecord(manifest.artworkOverrides)
    || Object.values(manifest.artworkOverrides).some((item) => !isRecord(item)
      || (item.artworkUrl && !validArtworkUrl(item.artworkUrl))))) {
    throw new Error('备份中的封面选择格式不正确。')
  }
  if (!isRecord(progress.learnedBySong) || !Array.isArray(progress.reviewItems)
    || !Array.isArray(progress.favoriteSongIds) || !isRecord(progress.corrections)
    || !isRecord(progress.meaningOverrides)) {
    throw new Error('备份中的学习进度格式不正确。')
  }
  if (Object.values(progress.learnedBySong).some((ids) => !Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id)))
    // 原仅校验songId/lineId：|| progress.reviewItems.some((item) => !isRecord(item) || typeof item.songId !== 'string' || !Number.isSafeInteger(item.lineId))
    || progress.reviewItems.some(item=>!validReviewItem(item))
    || progress.favoriteSongIds.some((id) => typeof id !== 'string')
    || Object.values(progress.corrections).some((reading) => typeof reading !== 'string')
    || Object.values(progress.meaningOverrides).some((meaning) => typeof meaning !== 'string')
    // 项目歌曲的单句人工修改与其他学习记录一起备份。
    || (progress.lyricEditsBySong != null && (!isRecord(progress.lyricEditsBySong)
      || Object.values(progress.lyricEditsBySong).some((lines) => !isRecord(lines)
        // 原来只验证字符串歌词；新对象同时保存翻译，翻译可以留空。
        || Object.entries(lines).some(([id, edit]) => {
          const text = typeof edit === 'string' ? edit : edit?.text
          return !/^\d+$/.test(id) || typeof text !== 'string' || !text.trim() || text.length > 500
            || typeof edit !== 'string' && (!isRecord(edit) || typeof edit.translation !== 'string' || edit.translation.length > 5000)
        }))))
    || (progress.playbackRate != null && ![1, 0.75, 0.5, 0.25].includes(progress.playbackRate))
    // 原验证：|| (progress.readingStyle != null && !['hiragana', 'romaji'].includes(progress.readingStyle))
    // 双注音设置也可备份与恢复。
    // 原验证仅含三项；不注音显示偏好也应能随学习记录正常备份恢复。
    // || (progress.readingStyle != null && !['hiragana', 'romaji', 'both'].includes(progress.readingStyle))
    || (progress.readingStyle != null && !['hiragana', 'romaji', 'both', 'none'].includes(progress.readingStyle))
    || (progress.lyricSnapshots != null && (!isRecord(progress.lyricSnapshots)
      || Object.values(progress.lyricSnapshots).some((snapshot) => !isRecord(snapshot) || !Array.isArray(snapshot.lines)
        || snapshot.lines.some((line) => !isRecord(line) || !Number.isSafeInteger(line.id) || typeof line.text !== 'string')
        || !validManualSnapshot(snapshot))))
    || Object.values(manifest.annotations).some((lines) => !Array.isArray(lines)
      || lines.some((line) => !isRecord(line) || !Number.isSafeInteger(line.id) || !Array.isArray(line.tokens)
        || line.tokens.some((token) => !isRecord(token) || !Number.isSafeInteger(token.index)
          || typeof token.surface !== 'string' || typeof token.reading !== 'string')))
    || Object.values(manifest.sentenceExplanations).some((songEntries) => !isRecord(songEntries)
      || Object.values(songEntries).some((entry) => !isRecord(entry) || typeof entry.text !== 'string'
        || !isRecord(entry.explanation) || typeof entry.explanation.meaning !== 'string'
        || !Array.isArray(entry.explanation.grammar)
        || entry.explanation.grammar.some((point) => typeof point !== 'string')
        || !Array.isArray(entry.explanation.vocabulary)
        || entry.explanation.vocabulary.some((item) => !isRecord(item)
          || typeof item.surface !== 'string' || typeof item.meaning !== 'string')))
    || Object.values(manifest.aiReviews).some((review) => !isRecord(review) || !Array.isArray(review.suggestions)
      || review.suggestions.some((item) => !isRecord(item) || !Number.isSafeInteger(item.line_id)
        || !Number.isSafeInteger(item.token_index) || typeof item.surface !== 'string'
        || typeof item.original_reading !== 'string' || typeof item.suggested_reading !== 'string'
        || typeof item.confidence !== 'number' || typeof item.reason !== 'string'))) {
    throw new Error('备份中的学习记录格式不正确。')
  }
}

function checkSong(song) {
  // 纯歌词备份显式 audio:null/lyricsOnly:true；与损坏或遗失音频的旧记录区分。
  const noAudio=song?.lyricsOnly===true&&song.audio===null
  if (!isRecord(song) || typeof song.id !== 'string' || !song.id.startsWith('local-')
    || typeof song.title !== 'string' || !song.title.trim()
    || typeof song.artist !== 'string' || !Array.isArray(song.lines) || !song.lines.length
    // 原音频条件无条件执行；纯歌词允许无音频，其余继续严格校验。
    || !noAudio && (!isRecord(song.audio) || typeof song.audio.name !== 'string'
    || typeof song.audio.type !== 'string' || !Number.isSafeInteger(song.audio.size)
    || song.audio.size <= 0 || !Number.isSafeInteger(song.audio.offset) || song.audio.offset < 0)) {
    throw new Error('备份中有无效的歌曲或音频资料。')
  }
  if (song.lines.length > 2000 || song.lines.some((line) => !isRecord(line)
    || !Number.isSafeInteger(line.id) || typeof line.text !== 'string' || !line.text.trim() || line.text.length > 500
    // 可选罗马音随歌曲备份，兼容不含此字段的旧备份。
    || (line.romaji != null && (typeof line.romaji !== 'string' || line.romaji.length > 1000))
    // 调试原点随歌曲备份；兼容没有该字段的旧文件，不允许损坏原点进入重置操作。
    || line.timestampOriginalStart != null && (!Number.isFinite(line.timestampOriginalStart) || line.timestampOriginalStart<0)
    // 原来必须有限 start；null 明确表示未设置，其他非法时间仍拒绝。
    || line.start!==null&&(!Number.isFinite(line.start)||line.start<0) || typeof line.translation !== 'string' || line.translation.length > 1000)
    || new Set(song.lines.map((line) => line.id)).size !== song.lines.length) {
    throw new Error('备份中的歌词格式不正确。')
  }
  for (const field of ['artworkUrl', 'artworkSourceUrl']) {
    if (song[field] && (field === 'artworkUrl' ? !validArtworkUrl(song[field])
      : typeof song[field] !== 'string' || !/^https?:\/\//iu.test(song[field]))) {
      throw new Error('备份中的封面链接格式不正确。')
    }
  }
}

// 可选固定时间用于不可变歌曲附件，避免每次学习记录变化都重新生成不同附件。
export function createLearningBackup(songs, state, options = {}) {
  const audioParts = []
  let offset = 0
  const songEntries = songs.map(({ audioBlob, ...song }) => {
    // 云端占位歌曲不是完整纯歌词，禁止误备份占位文字；真正纯歌词可完整备份。
    if(song.cloudPending)throw new Error(`《${song.title}》尚未下载，无法导出完整本地备份。`)
    if(song.lyricsOnly===true&&audioBlob==null)return {...song,audio:null}
    if (!(audioBlob instanceof Blob) || !audioBlob.size) throw new Error(`《${song.title || '未命名歌曲'}》缺少音频，无法完整备份。`)
    const audio = { name: song.audioName || 'audio', type: audioBlob.type || '', size: audioBlob.size, offset }
    offset += audioBlob.size
    audioParts.push(audioBlob)
    return { ...song, audio }
  })
  const manifest = {
    // 旧 v1 仍用于传统歌曲；含无音频/无时间轴时使用 v2，旧版会明确拒绝。
    version: songEntries.some(song=>song.audio===null||song.lines.some(line=>line.start===null))?2:VERSION,
    // 原 createdAt: new Date().toISOString()；普通导出仍沿用当前时间。
    createdAt: options.createdAt || new Date().toISOString(),
    progress: state.progress,
    annotations: state.annotations,
    aiReviews: state.aiReviews,
    sentenceExplanations: state.sentenceExplanations || {},
    artworkOverrides: state.artworkOverrides || {},
    songs: songEntries,
  }
  checkState(manifest)
  songEntries.forEach(checkSong)
  const metadata = encoder.encode(JSON.stringify(manifest))
  if (metadata.byteLength > MAX_MANIFEST_BYTES) throw new Error('备份资料过大，无法生成文件。')
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, metadata.byteLength, true)
  return new Blob([signatureBytes, length, metadata, ...audioParts], { type: 'application/octet-stream' })
}

export async function inspectLearningBackup(file) {
  if (!(file instanceof Blob)) throw new Error('请选择 UTA 备份文件。')
  const prefixSize = signatureBytes.byteLength + 4
  if (file.size < prefixSize) throw new Error('文件不是有效的 UTA 备份。')
  const prefix = new Uint8Array(await file.slice(0, prefixSize).arrayBuffer())
  if (!signatureBytes.every((byte, index) => byte === prefix[index])) throw new Error('文件不是有效的 UTA 备份。')
  const metadataLength = new DataView(prefix.buffer).getUint32(signatureBytes.byteLength, true)
  if (!metadataLength || metadataLength > MAX_MANIFEST_BYTES || prefixSize + metadataLength > file.size) {
    throw new Error('备份资料长度不正确，文件可能已损坏。')
  }
  let manifest
  try {
    manifest = JSON.parse(decoder.decode(await file.slice(prefixSize, prefixSize + metadataLength).arrayBuffer()))
  } catch {
    throw new Error('无法读取备份资料，文件可能已损坏。')
  }
  // 原来仅接受 VERSION=1；兼容旧备份及明确的纯歌词 v2。
  if (!isRecord(manifest) || ![VERSION,2].includes(manifest.version) || !Array.isArray(manifest.songs)
    || typeof manifest.createdAt !== 'string' || Number.isNaN(Date.parse(manifest.createdAt))) {
    throw new Error('不支持此备份版本。')
  }
  // Backups created before whole-line explanations were added remain restorable.
  if (!Object.hasOwn(manifest, 'sentenceExplanations')) manifest.sentenceExplanations = {}
  if (!Object.hasOwn(manifest, 'artworkOverrides')) manifest.artworkOverrides = {}
  checkState(manifest)
  if (manifest.songs.length > 1000) throw new Error('备份中的歌曲数量超出限制。')
  const ids = new Set()
  let audioBytes = 0
  for (const song of manifest.songs) {
    checkSong(song)
    if(manifest.version===1&&(song.audio===null||song.lines.some(line=>line.start===null)))throw new Error('旧版备份不能包含纯歌词资料。')
    // 原来直接读取 audio.offset/size；无音频条目不占用附件字节。
    if (ids.has(song.id) || song.audio!==null&&song.audio.offset !== audioBytes) throw new Error('备份中的歌曲或音频顺序不正确。')
    ids.add(song.id)
    audioBytes += song.audio?.size||0
  }
  const audioStart = prefixSize + metadataLength
  if (audioStart + audioBytes !== file.size) throw new Error('备份音频不完整，文件可能已损坏。')
  return { file, manifest, audioStart, audioBytes }
}

export function songsFromLearningBackup(inspection) {
  const { file, manifest, audioStart } = inspection
  return manifest.songs.map(({ audio, ...song }) => ({
    ...song,
    isLocal: true,
    // 原 audio.name / file.slice(...) 对纯歌词不适用，保留 null 而非空音频 Blob。
    audioName: audio?.name||'',
    audioBlob: audio?file.slice(audioStart + audio.offset, audioStart + audio.offset + audio.size, audio.type):null,
  }))
}
