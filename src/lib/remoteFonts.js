import { Capacitor, CapacitorHttp } from '@capacitor/core'
import manifest from './remoteFontManifest.json' with { type: 'json' }

// 原四档思源宋体仍随 APK 提供；恢复的四档从公开 Gitee 仓库按需下载。
const REMOTE_FACES = {
  sourcehan_extralight: { family: 'UTA SourceHan ExtraLight', weight: '200' },
  sourcehan_semibold: { family: 'UTA SourceHan SemiBold', weight: '600' },
  sourcehan_heavy: { family: 'UTA SourceHan Heavy', weight: '900' },
  sourcehan_sc_heavy: { family: 'UTA SourceHan SC Heavy', weight: '900' },
}
const FONT_SPECS = new Map(manifest.fonts.map(font => [font.id, font]))
// 原记录只用 Set 保存已加载标识；删除已下载字体时还需移除对应 FontFace。
// const loaded = new Set()
const loaded = new Map()
const pending = new Map()
const DB_NAME = 'uta-remote-fonts-v1'
const STORE_NAME = 'fonts'

export function isRemoteFont(id) { return Object.hasOwn(REMOTE_FACES, id) }

function openFontDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前设备不支持字体缓存。')); return }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('字体缓存打开失败。'))
  })
}

async function readCachedFont(id) {
  const db = await openFontDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(id)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('字体缓存读取失败。'))
    })
  } finally { db.close() }
}

async function writeCachedFont(id, bytes) {
  const db = await openFontDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(bytes.buffer, id)
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error || new Error('字体缓存写入失败。'))
      transaction.onabort = () => reject(transaction.error || new Error('字体缓存写入中断。'))
    })
  } finally { db.close() }
}

async function deleteCachedFont(id) {
  const db = await openFontDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(id)
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error || new Error('字体缓存清理失败。'))
    })
  } finally { db.close() }
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('当前设备无法校验字体文件。')
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
}

// 每片和完整文件都核对长度及 SHA-256，防止网关返回错误页面或下载中断后误当字体加载。
export async function verifyFontBytes(bytes, expected) {
  if (bytes.byteLength !== expected.bytes || await sha256(bytes) !== expected.sha256) throw new Error('下载的字体文件校验失败，请重试。')
  return bytes
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function registerFont(id, bytes) {
  if (loaded.has(id)) return
  const definition = REMOTE_FACES[id]
  const face = new FontFace(definition.family, bytes.buffer, { style: 'normal', weight: definition.weight })
  await face.load()
  document.fonts.add(face)
  loaded.set(id, face)
}

// 仅读取 IndexedDB 的键，不载入大字体文件；用于主题设置管理已下载字重。
export async function listDownloadedRemoteFonts() {
  const db = await openFontDatabase()
  try {
    const keys = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAllKeys()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('已下载字体列表读取失败。'))
    })
    return keys.filter(isRemoteFont)
  } finally { db.close() }
}

export async function deleteRemoteFont(id) {
  if (!isRemoteFont(id)) throw new Error('无效的仓库字体。')
  await deleteCachedFont(id)
  const face = loaded.get(id)
  if (face) { document.fonts.delete(face); loaded.delete(id) }
}

export async function restoreRemoteFont(id) {
  if (!isRemoteFont(id) || !Capacitor.isNativePlatform()) return false
  if (loaded.has(id)) return true
  const cached = await readCachedFont(id)
  if (!cached) return false
  const bytes = new Uint8Array(cached)
  await verifyFontBytes(bytes, FONT_SPECS.get(id))
  await registerFont(id, bytes)
  return true
}

export async function downloadRemoteFont(id, onProgress = () => {}) {
  if (!isRemoteFont(id) || !Capacitor.isNativePlatform()) throw new Error('此字体只能在安卓应用中下载。')
  if (pending.has(id)) return pending.get(id)
  const job = (async () => {
    // 旧缓存若损坏，清掉后从仓库重新下载，不让一次失败永久阻挡用户。
    try { if (await restoreRemoteFont(id)) return true } catch { await deleteCachedFont(id) }
    const spec = FONT_SPECS.get(id)
    if (!spec || manifest.schemaVersion !== 2 || !spec.parts?.length) throw new Error('字体下载清单无效。')
    const parts = []
    let completed = 0
    for (const part of spec.parts) {
      const response = await CapacitorHttp.get({ url: part.url, responseType: 'arraybuffer', connectTimeout: 15000, readTimeout: 30000 })
      if (response.status !== 200 || typeof response.data !== 'string') throw new Error('字体下载失败，请检查网络后重试。')
      const bytes = await verifyFontBytes(decodeBase64(response.data), part)
      parts.push(bytes)
      completed += bytes.byteLength
      onProgress(Math.min(100, Math.round(completed / spec.bytes * 100)))
    }
    const font = new Uint8Array(spec.bytes)
    let offset = 0
    for (const part of parts) { font.set(part, offset); offset += part.byteLength }
    await verifyFontBytes(font, spec)
    await registerFont(id, font)
    await writeCachedFont(id, font)
    return true
  })()
  pending.set(id, job)
  try { return await job } finally { pending.delete(id) }
}
