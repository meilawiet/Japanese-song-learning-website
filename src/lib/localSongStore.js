import { decodeLrcBytes } from './lrcEncoding.js'
import { compileLrcCues, formatLrcTime, parseLrcCues } from './lrcReview.js'

const DATABASE_NAME = 'uta-local-song-library'
const DATABASE_VERSION = 1
const SONG_STORE = 'songs'

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onerror = () => reject(request.error || new Error('无法打开本地歌曲库。'))
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SONG_STORE)) {
        request.result.createObjectStore(SONG_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function runTransaction(mode, action, signal) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    if (signal?.aborted) { database.close(); reject(new DOMException('导入已取消', 'AbortError')); return }
    const transaction = database.transaction(SONG_STORE, mode)
    const store = transaction.objectStore(SONG_STORE)
    const abort = () => transaction.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const finish = () => { signal?.removeEventListener('abort', abort); database.close() }
    let result
    try { result = action(store) } catch (error) { transaction.abort(); finish(); reject(error); return }
    transaction.oncomplete = () => { finish(); resolve(result?.result) }
    transaction.onerror = () => { finish(); reject(transaction.error || new Error('本地歌曲库写入失败。')) }
    transaction.onabort = () => { finish(); reject(signal?.aborted ? new DOMException('导入已取消', 'AbortError') : transaction.error || new Error('本地歌曲库操作已取消。')) }
  }))
}

function cleanMetadata(value) {
  return String(value || '').replace(/\s*\(.+?\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

function fileBaseName(fileName) {
  return fileName.replace(/\.[^.]+$/, '').trim()
}

async function decodeLrcFile(file) {
  return decodeLrcBytes(await file.arrayBuffer(), file.name)
}

export async function parseLrcFile(file) {
  if (/\.uta-lyrics\.json$/iu.test(file.name)) {
    const document = JSON.parse(await file.text())
    if (document?.format !== 'uta-annotated-lyrics' || document.version !== 1 || !Array.isArray(document.lines)
      || !document.lines.length || document.lines.length > 2000) throw new Error('注音歌词文件格式无效。')
    const cues = document.lines.map((line, index) => {
      if (!Array.isArray(line.segments) || line.segments.length > 500) throw new Error(`第 ${index + 1} 句注音格式无效。`)
      const text = line.segments.map(segment => {
        if (typeof segment.surface !== 'string' || segment.surface.length > 500 || segment.kana != null && (typeof segment.kana !== 'string' || segment.kana.length > 100)) throw new Error(`第 ${index + 1} 句注音格式无效。`)
        return segment.surface + (segment.kana && /[\u3400-\u9fff々]/u.test(segment.surface) ? `（${segment.kana}）` : '')
      }).join('')
      if (!text.trim() || text.length > 1000) throw new Error(`第 ${index + 1} 句歌词无效。`)
      return { id: `source-${index}`, timeText: Number.isFinite(line.start) && line.start >= 0 ? formatLrcTime(line.start) : '', text,
        romaji: typeof line.romaji === 'string' ? line.romaji.slice(0, 1000) : '', track: 'original', reviewReason: '', reviewed: true }
    })
    const { lines, issues } = compileLrcCues(cues)
    return { title: String(document.title || file.name).slice(0, 160), artist: String(document.artist || '本地导入').slice(0, 160), album: '', sourceFile: file.name, duration: lines.at(-1)?.start || 0, lines, cues, issues, untimed: document.timed === false }
  }
  const content = await decodeLrcFile(file)
  const metadata = {}
  for (const match of content.matchAll(/^\[(ti|ar):(.+)]$/gim)) metadata[match[1].toLowerCase()] = match[2].trim()
  const title = cleanMetadata(metadata.ti) || fileBaseName(file.name)
  const artist = cleanMetadata(metadata.ar) || '本地导入'

  const cues = parseLrcCues(content, title, artist)
  if (!cues.length) throw new Error('未在 LRC 中找到带时间轴的歌词。请确认文件是 .lrc 格式。')
  const { lines, issues } = compileLrcCues(cues)
  return {
    title,
    artist,
    album: '',
    sourceFile: file.name,
    duration: lines.at(-1)?.start || 0,
    lines,
    cues,
    issues,
  }
}

function createSongId() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `local-${suffix}`
}

export async function createAndStoreLocalSongs(items, signal) {
  if (!items.length) throw new Error('没有可导入的歌曲。')
  const records = items.map(({ parsed, audioFile, metadata = {} }) => {
    if (!parsed?.lines?.length || !(audioFile instanceof Blob)) throw new Error('歌曲的歌词或音频文件无效。')
    return {
      ...parsed, ...metadata, id: createSongId(), isLocal: true,
      audioName: audioFile.name, audioBlob: audioFile, createdAt: Date.now(),
    }
  })
  // One transaction keeps a failed batch from leaving partially imported songs.
  await runTransaction('readwrite', store => { records.forEach(record => store.add(record)) }, signal)
  return records
}

export async function createAndStoreLocalSong(parsed, audioFile, metadata = {}, signal) {
  const [record] = await createAndStoreLocalSongs([{ parsed, audioFile, metadata }], signal)
  return record
}

// 电脑网页传来的歌曲已经有固定 ID；逐首保存，保持电脑与手机的学习记录对应。
export async function storeTransferredSong(record) {
  if (!record?.id?.startsWith('local-') || !(record.audioBlob instanceof Blob)) {
    throw new Error('电脑歌曲资料无效，无法保存到手机。')
  }
  await runTransaction('readwrite', (store) => store.put(record))
  return record
}

export async function loadLocalSongs() {
  const records = await runTransaction('readonly', (store) => store.getAll())
  return Array.isArray(records) ? records.sort((left, right) => right.createdAt - left.createdAt) : []
}

export async function updateLocalSongMetadata(songId, metadata) {
  let updatedRecord = null
  await runTransaction('readwrite', (store) => {
    const request = store.get(songId)
    request.onsuccess = () => {
      if (!request.result) return
      updatedRecord = { ...request.result, ...metadata }
      store.put(updatedRecord)
    }
    return request
  })
  return updatedRecord
}

export async function loadLocalSong(songId) {
  return await runTransaction('readonly', store => store.get(songId)) || null
}

// 旧版在线封面迁移时只替换仍指向原网址的记录，避免覆盖用户刚手动选择的新封面。
export async function updateLocalSongArtworkIfUrl(songId, expectedUrl, metadata) {
  let changed = false
  await runTransaction('readwrite', (store) => {
    const request = store.get(songId)
    request.onsuccess = () => {
      if (!request.result || (request.result.artworkUrl || '') !== expectedUrl) return
      store.put({ ...request.result, ...metadata })
      changed = true
    }
    return request
  })
  return changed
}

export async function deleteLocalSong(songId) {
  await runTransaction('readwrite', (store) => store.delete(songId))
}

export async function replaceLocalSongs(records) {
  await runTransaction('readwrite', (store) => {
    store.clear()
    records.forEach((record) => store.put(record))
  })
}
