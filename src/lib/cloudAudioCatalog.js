import { checkSong } from './learningBackup.js'

export const CLOUD_AUDIO_NAME = /^_uta-audio-[a-f0-9]{64}\.bin$/u
export const CLOUD_SNAPSHOT_NAME = /^UTA-[A-Za-z0-9_.-]+\.uta-backup$/u
export const MAX_CLOUD_FILE = 500 * 1024 * 1024
const songFields = ['id', 'title', 'artist', 'album', 'sourceFile', 'language', 'createdAt', 'duration', 'audioName', 'artworkUrl', 'artworkSourceUrl', 'artworkProvider', 'artworkChoice']

export function validateCloudAudio(audio) {
  if (!audio || !CLOUD_AUDIO_NAME.test(audio.name) || !/^[a-f0-9]{64}$/.test(audio.sha256)
    || audio.name !== `_uta-audio-${audio.sha256}.bin` || !Number.isSafeInteger(audio.size)
    || audio.size <= 0 || audio.size > MAX_CLOUD_FILE || typeof audio.type !== 'string' || audio.type.length > 100) {
    throw new Error('云音频引用无效。')
  }
  return { name: audio.name, sha256: audio.sha256, size: audio.size, type: audio.type }
}

export function cloudAudioSong(record, audio) {
  const descriptor = Object.fromEntries(songFields.filter(key => record[key] != null).map(key => [key, record[key]]))
  return { ...descriptor, lines: structuredClone(record.lines), lyricsOnly: audio === null, audio: audio === null ? null : validateCloudAudio(audio) }
}

export function songsFromCloudCatalog(catalog, origin = '') {
  if (!catalog || catalog.version !== 2 || !Array.isArray(catalog.songs) || catalog.songs.length > 1000) throw new Error('仅支持歌曲目录 v2，请先升级另一端。')
  const seen = new Set()
  return catalog.songs.map(song => {
    if (!song || seen.has(song.id) || !Object.hasOwn(song, 'audio') || song.lines?.some(line => !Object.hasOwn(line, 'start'))) throw new Error('云歌曲目录中存在重复或缺失资料。')
    seen.add(song.id)
    const audio = song.audio === null ? null : validateCloudAudio(song.audio)
    if (audio === null && song.lyricsOnly !== true || audio && song.lyricsOnly === true) throw new Error('纯歌词与音频标记不一致。')
    // Reuse shared lyric/artwork validation without confusing hash references with local offsets.
    checkSong({ ...song, audio: { name: song.audioName || '', type: audio?.type || '', size: audio?.size || 1, offset: 0 } })
    if (song.lines.some(line => line.timestampOriginalStart != null && (!Number.isFinite(line.timestampOriginalStart) || line.timestampOriginalStart < 0))) throw new Error('歌词时间原点无效。')
    if (song.language != null && !['zh', 'ja', 'ko', 'other'].includes(song.language)) throw new Error('歌曲语言无效。')
    const { audio: ignored, audioBlob, cloudPending, cloudAudio, isLocal, ...metadata } = structuredClone(song)
    return { ...metadata, isLocal: true, lyricsOnly: audio === null, audioBlob: null, cloudPending: Boolean(audio),
      ...(audio ? { cloudAudio: { ...audio, origin } } : {}) }
  })
}

// Reuse bytes only; never reuse old lyrics or infer that equal audio means equal song identity.
export async function reuseCloudAudio(records, localRecords, digest, signal) {
  const byId = new Map(localRecords.map(record => [record.id, record]))
  const result = []
  for (const record of records) {
    signal?.throwIfAborted()
    const local = byId.get(record.id), ref = record.cloudAudio
    if (ref && local?.audioBlob instanceof Blob && local.audioBlob.size === ref.size
      && await digest(local.audioBlob, signal) === ref.sha256) result.push({ ...record, cloudPending: false, audioBlob: local.audioBlob })
    else result.push(record)
  }
  return result
}

export function sharedProgress(progress) {
  const fields = ['learnedBySong', 'reviewItems', 'favoriteSongIds', 'corrections', 'meaningOverrides', 'playbackRate', 'readingStyle', 'lyricSnapshots', 'lyricEditsBySong', 'songSettings']
  return structuredClone(Object.fromEntries(fields.filter(key => progress[key] != null).map(key => [key, progress[key]])))
}

export function preserveDesktopPreferences(remote, local) {
  const fields = ['desktopTheme', 'desktopFont', 'lyricFontSize', 'readingFontSize', 'lineReadingFontSize', 'translationFontSize', 'rangePracticeSettings', 'singleLineRepeatCount']
  return { ...remote, ...Object.fromEntries(fields.filter(key => local[key] != null).map(key => [key, local[key]])) }
}

export function applySharedSongSettings(song, settings = {}) {
  if (!settings) return song
  return { ...song, language: settings.language || song.language, lines: song.lines.map(line => {
    const override = settings.timeOverrides?.[line.id]
    return override && override.text === line.text && override.baseStart === line.start
      ? { ...line, start: override.start, timestampOriginalStart: line.timestampOriginalStart ?? override.baseStart } : line
  }) }
}
