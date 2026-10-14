import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core'
import { createLearningBackup } from './learningBackup'

const DESKTOP_HELPER = 'http://127.0.0.1:8765'
const CHUNK_BYTES = 1024 * 1024
// 调用 Android 系统的局域网发现能力，取得正在运行的电脑传歌地址。
const transferDiscovery = registerPlugin('UtaTransferDiscovery')

export async function discoverComputerTransferOrigins() {
  if (!Capacitor.isNativePlatform()) throw new Error('请在 Android 手机应用中自动查找电脑。')
  const result = await transferDiscovery.discover()
  // 发现结果仍需经过已有的局域网地址检查；连接码验证由电脑服务完成。
  return [...new Set((result.addresses || []).map((address) => {
    try { return computerTransferOrigin('wifi', address) } catch { return null }
  }).filter(Boolean))]
}

// 电脑网页主动把自己的浏览器歌曲交给同一台电脑上的临时传歌服务。
export async function startComputerTransfer(records, state) {
  if (!records.length) throw new Error('电脑网页还没有导入歌曲。请先在电脑网页的歌曲库导入歌曲。')
  const backup = createLearningBackup(records, state)
  let response
  try {
    response = await fetch(`${DESKTOP_HELPER}/api/transfer/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: backup,
    })
  } catch {
    throw new Error('无法连接传歌服务。请先双击“启动 UTA 手机传歌.cmd”，并保持窗口打开。')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.detail || '电脑网页未能准备传歌。')
  return result
}

// 恢复 USB 调试传歌：ADB 把手机本机端口转到电脑；Wi-Fi 只接受局域网 IPv4 地址。
export function computerTransferOrigin(method, address = '') {
  if (method === 'usb') return DESKTOP_HELPER
  const value = address.trim()
  const parts = value.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    || !(parts[0] === 10 || parts[0] === 192 && parts[1] === 168
      || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)) {
    throw new Error('请填写电脑网页显示的局域网地址，例如 192.168.1.23。')
  }
  return `http://${value}:8765`
}

async function transferGet(url, responseType = 'json') {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url, responseType, connectTimeout: 8000, readTimeout: 30000 })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(response.data?.detail || `电脑传歌服务返回错误 ${response.status}。`)
    }
    return response.data
  }
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `电脑传歌服务返回错误 ${response.status}。`)
  }
  return responseType === 'blob' ? response.arrayBuffer() : response.json()
}

// 旧实现保留作对照：listComputerSongs(origin, code, method) 曾按连接方式检查不同长度的码。
export async function listComputerSongs(origin, code) {
  // 旧实现保留作对照：所有连接方式都要求 /^[A-Za-z0-9_-]{12}$/ 的长连接码。
  // USB 和 Wi-Fi 使用电脑网页显示的同一个四位数字码。
  const validCode = /^[0-9]{4}$/.test(code.trim())
  if (!validCode) throw new Error('请输入电脑网页显示的 4 位数字连接码。')
  return transferGet(`${origin}/api/transfer/session/${encodeURIComponent(code.trim())}`)
}

function decodeBase64(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

// 分片下载可避免一次把整首大音频通过 Android 原生桥传入网页内存。
export async function downloadComputerSong(origin, code, song, onProgress = () => {}) {
  // 纯歌词清单已含歌词正文，不访问不存在的音频分片接口。
  if(song.lyricsOnly===true&&song.audio===null){const {audio,...metadata}=song;return {...metadata,isLocal:true,audioName:'',audioBlob:null}}
  const size = song.audio?.size
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error(`《${song.title}》缺少有效音频。`)
  const parts = []
  for (let offset = 0; offset < size; offset += CHUNK_BYTES) {
    const length = Math.min(CHUNK_BYTES, size - offset)
    const url = `${origin}/api/transfer/session/${encodeURIComponent(code)}/song/${encodeURIComponent(song.id)}/audio?offset=${offset}&length=${length}`
    const result = await transferGet(url, 'blob')
    const bytes = typeof result === 'string' ? decodeBase64(result) : new Uint8Array(result)
    if (bytes.byteLength !== length) throw new Error(`《${song.title}》的音频传输不完整，请重试。`)
    parts.push(bytes)
    onProgress(Math.min(offset + length, size), size)
  }
  const { audio, ...metadata } = song
  return {
    ...metadata,
    isLocal: true,
    audioName: audio.name,
    audioBlob: new Blob(parts, { type: audio.type || 'application/octet-stream' }),
  }
}

// 只合并用户勾选歌曲的学习记录，避免覆盖手机里原有的其它歌曲。
export function mergeTransferredLearning(previous, incoming, selectedIds) {
  const selected = new Set(selectedIds)
  const chosenMap = (source) => Object.fromEntries(Object.entries(source || {}).filter(([id]) => selected.has(id)))
  const chosenCorrections = Object.fromEntries(Object.entries(incoming.progress?.corrections || {})
    .filter(([key]) => [...selected].some((id) => key.startsWith(`${id}:`))))
  return {
    ...previous,
    progress: {
      ...previous.progress,
      learnedBySong: { ...previous.progress.learnedBySong, ...chosenMap(incoming.progress?.learnedBySong) },
      reviewItems: [...previous.progress.reviewItems, ...(incoming.progress?.reviewItems || []).filter((item) => selected.has(item.songId))],
      favoriteSongIds: [...new Set([...previous.progress.favoriteSongIds, ...(incoming.progress?.favoriteSongIds || []).filter((id) => selected.has(id))])],
      corrections: { ...previous.progress.corrections, ...chosenCorrections },
      lyricSnapshots: { ...previous.progress.lyricSnapshots, ...chosenMap(incoming.progress?.lyricSnapshots) },
    },
    annotations: { ...previous.annotations, ...chosenMap(incoming.annotations) },
    aiReviews: { ...previous.aiReviews, ...chosenMap(incoming.aiReviews) },
    sentenceExplanations: { ...previous.sentenceExplanations, ...chosenMap(incoming.sentenceExplanations) },
  }
}
