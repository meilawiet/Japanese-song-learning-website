import { isCreditLine, isSongHeadingLine } from './songMetadata.js'
import { decodeLrcBytes } from './lrcEncoding.js'
import { parseTimedLyrics } from './timedLyrics.js'
// 原来仅允许时间轴歌词；改为统一读取有/无时间轴的文本及来源注音 JSON。
import {parseLyricDocument,lyricDuration} from './lyricDocument.js'
// 时间戳独立保存，原子核对编辑基线，避免覆盖同时同步的新歌词。
import { mergeTimestampChanges } from './timestampTuning.js'

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

async function decodeLrcFile(file) {
  return decodeLrcBytes(await file.arrayBuffer(), file.name)
}

export async function parseLrcFile(file) {
  const content = await decodeLrcFile(file)
  const metadata = {}
  for (const match of content.matchAll(/^\[(ti|ar):(.+)]$/gim)) metadata[match[1].toLowerCase()] = match[2].trim()
  const title = cleanMetadata(metadata.ti) || fileBaseName(file.name)
  const artist = cleanMetadata(metadata.ar) || '本地导入'

  // 旧版仅凭假名判断原文，纯汉字会被当作翻译，罗马音也会丢失；保留旧逻辑供对照。
  //   const seen = new Set()
  //   const lyricEntries = []
  //   for (const sourceLine of content.split(/\r?\n/)) {
  //     const timestamps = [...sourceLine.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)]
  //     if (!timestamps.length) continue
  //     const lastTimestamp = timestamps.at(-1)
  //     const text = sourceLine.slice(lastTimestamp.index + lastTimestamp[0].length).replace(/\s+/g, ' ').trim()
  //     const isJapanese = /[\u3040-\u30ff]/u.test(text)
  //     const isChinese = /[\u3400-\u9fff]/u.test(text)
  //     if (!text || isCreditLine(text) || isSongHeadingLine(text, title, artist)) continue
  //     for (const [, minutes, seconds] of timestamps) {
  //       const start = Number(minutes) * 60 + Number(seconds)
  //       if (isJapanese) {
  //         const key = `${start}-${text}`
  //         if (!seen.has(key)) { seen.add(key); lyricEntries.push({ text, start }) }
  //       } else if (isChinese) {
  //         // The commonly used dual-language LRC layout places the translation
  //         // after its Japanese line, even when its timestamp is the next cue.
  //         const previousLyric = lyricEntries.at(-1)
  //         if (previousLyric && !previousLyric.translation) previousLyric.translation = text
  //       }
  //     }
  //   }
  //   lyricEntries.sort((left, right) => left.start - right.start)
  //   const lines = lyricEntries.map((line, id) => ({ id, ...line, translation: line.translation || '' }))
  // 按时间戳与行顺序识别三轨歌词，不能单凭汉字推断语言。
  // const lines = parseTimedLyrics(content, title, artist)
  // if (!lines.length) throw new Error('未在 LRC 中找到带时间轴的日语歌词。请确认文件是 .lrc 格式。')
  const document=parseLyricDocument(content,title,artist),lines=document.lines
  if (!lines.length) throw new Error('这份文件没有可读取的歌词正文。')
  return {
    title:document.title,
    artist:document.artist,
    album: '',
    sourceFile: file.name,
    // 原来取最后一句 start；无时间轴时不假造时长。
    duration: lyricDuration(lines),
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
    // 原 audioFile.name/audioFile 强制要求音频；纯歌词记录明确标记，后续可补充。
    audioName: audioFile?.name || '',
    audioBlob: audioFile || null,
    lyricsOnly: !audioFile,
    createdAt: Date.now(),
  }
  await runTransaction('readwrite', (store) => store.put(record))
  return record
}

// 电脑网页传来的歌曲已经有固定 ID；逐首保存，保持电脑与手机的学习记录对应。
export async function storeTransferredSong(record) {
  // 原判断必须 audioBlob instanceof Blob；只允许明确标记的纯歌词缺少音频。
  if (!record?.id?.startsWith('local-') || !(record.audioBlob instanceof Blob) && !(record.lyricsOnly===true&&record.audioBlob==null)) {
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
      // 补入真实音频后解除纯歌词标记，不误判成云端尚未下载。
      if(metadata.audioBlob instanceof Blob)updatedRecord.lyricsOnly=false
      // 替换音频或歌词后旧云附件哈希失效，不能在下一次目录恢复时误复用旧内容。
      // 旧整曲摘要失效逻辑：if(metadata.audioBlob||metadata.lines)delete updatedRecord.cloudAsset
      if(metadata.audioBlob||metadata.lines)delete updatedRecord.cloudAsset
      // 新音频引用仅在音频字段被替换时失效，编辑歌词/时间轴不会使音频失效。
      if(Object.hasOwn(metadata,'audioBlob')){delete updatedRecord.cloudAudio;updatedRecord.cloudPending=false}
      store.put(updatedRecord)
    }
    return request
  })
  return updatedRecord
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

export async function updateLocalSongTimings(songId, before, draft) {
  let updated=null, failure=null
  try {
    await runTransaction('readwrite',store=>{
      const request=store.get(songId)
      request.onsuccess=()=>{
        try {
          if (!request.result) throw new Error('找不到当前歌曲，请重新打开歌曲库。')
          const lines=mergeTimestampChanges(request.result.lines,before,draft)
          updated={...request.result,lines,duration:lyricDuration(lines)}
          // 清除旧整曲摘要；新cloudAudio只代表音频字节，调整时间戳时继续保留。
          delete updated.cloudAsset
          store.put(updated)
        } catch (reason) { failure=reason; store.transaction.abort() }
      }
      return request
    })
  } catch (reason) { throw failure || reason }
  return updated
}

export async function replaceLocalSongs(records) {
  await runTransaction('readwrite', (store) => {
    store.clear()
    records.forEach((record) => store.put(record))
  })
}
