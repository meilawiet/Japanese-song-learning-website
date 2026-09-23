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

function runTransaction(mode, action) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(SONG_STORE, mode)
    const store = transaction.objectStore(SONG_STORE)
    let result
    try { result = action(store) } catch (error) { database.close(); reject(error); return }
    transaction.oncomplete = () => { database.close(); resolve(result?.result) }
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('本地歌曲库写入失败。')) }
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('本地歌曲库操作已取消。')) }
  }))
}

function cleanMetadata(value) {
  return String(value || '').replace(/\s*\(.+?\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

function fileBaseName(fileName) {
  return fileName.replace(/\.[^.]+$/, '').trim()
}

function timestampKey(seconds) { return Math.round(seconds * 1000) }
function isCreditLine(text) { return /^(?:词|曲|编曲|作词|作曲|中文翻译|翻译|译者|lyrics?|composer|arrangement)\s*[:：]/iu.test(text) }

async function decodeLrcFile(file) {
  const buffer = await file.arrayBuffer()
  const encodings = ['utf-8', 'gb18030', 'gbk']
  for (const encoding of encodings) {
    try { return new TextDecoder(encoding, { fatal: true }).decode(buffer) } catch { /* Try the next encoding. */ }
  }
  return new TextDecoder('utf-8').decode(buffer)
}

async function parseLrcFileLegacy(file) {
  const content = await decodeLrcFile(file)
  const metadata = {}
  for (const match of content.matchAll(/^\[(ti|ar):(.+)]$/gim)) metadata[match[1].toLowerCase()] = match[2].trim()

  const seen = new Set()
  const lines = []
  for (const sourceLine of content.split(/\r?\n/)) {
    const timestamps = [...sourceLine.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)]
    if (!timestamps.length) continue
    const lastTimestamp = timestamps.at(-1)
    const text = sourceLine.slice(lastTimestamp.index + lastTimestamp[0].length).replace(/\s+/g, ' ').trim()
    // Kana is the most reliable signal for discarding translated and credit-only LRC lines.
    if (!text || !/[\u3040-\u30ff]/u.test(text)) continue
    for (const [, minutes, seconds] of timestamps) {
      const start = Number(minutes) * 60 + Number(seconds)
      const key = `${start}-${text}`
      if (!seen.has(key)) {
        seen.add(key)
        lines.push({ text, start })
      }
    }
  }
  lines.sort((left, right) => left.start - right.start)
  if (!lines.length) throw new Error('未在 LRC 中找到带时间轴的日语歌词。请确认文件是 .lrc 格式。')
  return {
    title: cleanMetadata(metadata.ti) || fileBaseName(file.name),
    artist: cleanMetadata(metadata.ar) || '本地导入',
    album: '',
    sourceFile: file.name,
    duration: lines.at(-1)?.start || 0,
    lines: lines.map((line, index) => ({ ...line, id: index })),
  }
}

export async function parseLrcFile(file) {
  const content = await decodeLrcFile(file)
  const metadata = {}
  for (const match of content.matchAll(/^\[(ti|ar):(.+)]$/gim)) metadata[match[1].toLowerCase()] = match[2].trim()

  const seen = new Set()
  const lyricEntries = []
  for (const sourceLine of content.split(/\r?\n/)) {
    const timestamps = [...sourceLine.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)]
    if (!timestamps.length) continue
    const lastTimestamp = timestamps.at(-1)
    const text = sourceLine.slice(lastTimestamp.index + lastTimestamp[0].length).replace(/\s+/g, ' ').trim()
    const isJapanese = /[\u3040-\u30ff]/u.test(text)
    const isChinese = /[\u3400-\u9fff]/u.test(text)
    if (!text || isCreditLine(text)) continue
    for (const [, minutes, seconds] of timestamps) {
      const start = Number(minutes) * 60 + Number(seconds)
      if (isJapanese) {
        const key = `${start}-${text}`
        if (!seen.has(key)) { seen.add(key); lyricEntries.push({ text, start }) }
      } else if (isChinese) {
        // The commonly used dual-language LRC layout places the translation
        // after its Japanese line, even when its timestamp is the next cue.
        const previousLyric = lyricEntries.at(-1)
        if (previousLyric && !previousLyric.translation) previousLyric.translation = text
      }
    }
  }
  lyricEntries.sort((left, right) => left.start - right.start)
  const lines = lyricEntries.map((line, id) => ({ id, ...line, translation: line.translation || '' }))
  if (!lines.length) throw new Error('未在 LRC 中找到带时间轴的日语歌词。请确认文件是 .lrc 格式。')
  return {
    title: cleanMetadata(metadata.ti) || fileBaseName(file.name),
    artist: cleanMetadata(metadata.ar) || '本地导入',
    album: '',
    sourceFile: file.name,
    duration: lines.at(-1)?.start || 0,
    lines,
  }
}

function createSongId() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `local-${suffix}`
}

export async function createAndStoreLocalSong(parsed, audioFile, metadata = {}) {
  const record = {
    ...parsed,
    ...metadata,
    id: createSongId(),
    isLocal: true,
    audioName: audioFile.name,
    audioBlob: audioFile,
    createdAt: Date.now(),
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

export async function deleteLocalSong(songId) {
  await runTransaction('readwrite', (store) => store.delete(songId))
}
