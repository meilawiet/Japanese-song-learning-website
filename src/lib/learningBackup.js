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
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function checkState(manifest) {
  if (!isRecord(manifest.progress) || !isRecord(manifest.annotations)
    || !isRecord(manifest.aiReviews) || !isRecord(manifest.sentenceExplanations)) {
    throw new Error('备份中的学习数据格式不正确。')
  }
  const progress = manifest.progress
  if (!isRecord(progress.learnedBySong) || !Array.isArray(progress.reviewItems)
    || !Array.isArray(progress.favoriteSongIds) || !isRecord(progress.corrections)
    || !isRecord(progress.meaningOverrides)) {
    throw new Error('备份中的学习进度格式不正确。')
  }
  if (Object.values(progress.learnedBySong).some((ids) => !Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id)))
    || progress.reviewItems.some((item) => !isRecord(item) || typeof item.songId !== 'string' || !Number.isSafeInteger(item.lineId))
    || progress.favoriteSongIds.some((id) => typeof id !== 'string')
    || Object.values(progress.corrections).some((reading) => typeof reading !== 'string')
    || Object.values(progress.meaningOverrides).some((meaning) => typeof meaning !== 'string')
    || (progress.playbackRate != null && ![1, 0.75, 0.5, 0.25].includes(progress.playbackRate))
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
  if (!isRecord(song) || typeof song.id !== 'string' || !song.id.startsWith('local-')
    || typeof song.title !== 'string' || !song.title.trim()
    || typeof song.artist !== 'string' || !Array.isArray(song.lines) || !song.lines.length
    || !isRecord(song.audio) || typeof song.audio.name !== 'string'
    || typeof song.audio.type !== 'string' || !Number.isSafeInteger(song.audio.size)
    || song.audio.size <= 0 || !Number.isSafeInteger(song.audio.offset) || song.audio.offset < 0) {
    throw new Error('备份中有无效的歌曲或音频资料。')
  }
  if (song.lines.length > 2000 || song.lines.some((line) => !isRecord(line)
    || !Number.isSafeInteger(line.id) || typeof line.text !== 'string' || !line.text.trim() || line.text.length > 500
    || !Number.isFinite(line.start) || line.start < 0 || typeof line.translation !== 'string' || line.translation.length > 1000)
    || new Set(song.lines.map((line) => line.id)).size !== song.lines.length) {
    throw new Error('备份中的歌词格式不正确。')
  }
  for (const field of ['artworkUrl', 'artworkSourceUrl']) {
    if (song[field] && (typeof song[field] !== 'string' || !/^https?:\/\//i.test(song[field]))) {
      throw new Error('备份中的封面链接格式不正确。')
    }
  }
}

export function createLearningBackup(songs, state) {
  const audioParts = []
  let offset = 0
  const songEntries = songs.map(({ audioBlob, ...song }) => {
    if (!(audioBlob instanceof Blob) || !audioBlob.size) throw new Error(`《${song.title || '未命名歌曲'}》缺少音频，无法完整备份。`)
    const audio = { name: song.audioName || 'audio', type: audioBlob.type || '', size: audioBlob.size, offset }
    offset += audioBlob.size
    audioParts.push(audioBlob)
    return { ...song, audio }
  })
  const manifest = {
    version: VERSION,
    createdAt: new Date().toISOString(),
    progress: state.progress,
    annotations: state.annotations,
    aiReviews: state.aiReviews,
    sentenceExplanations: state.sentenceExplanations || {},
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
  if (!isRecord(manifest) || manifest.version !== VERSION || !Array.isArray(manifest.songs)
    || typeof manifest.createdAt !== 'string' || Number.isNaN(Date.parse(manifest.createdAt))) {
    throw new Error('不支持此备份版本。')
  }
  // Backups created before whole-line explanations were added remain restorable.
  if (!Object.hasOwn(manifest, 'sentenceExplanations')) manifest.sentenceExplanations = {}
  checkState(manifest)
  if (manifest.songs.length > 1000) throw new Error('备份中的歌曲数量超出限制。')
  const ids = new Set()
  let audioBytes = 0
  for (const song of manifest.songs) {
    checkSong(song)
    if (ids.has(song.id) || song.audio.offset !== audioBytes) throw new Error('备份中的歌曲或音频顺序不正确。')
    ids.add(song.id)
    audioBytes += song.audio.size
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
    audioName: audio.name,
    audioBlob: file.slice(audioStart + audio.offset, audioStart + audio.offset + audio.size, audio.type),
  }))
}
