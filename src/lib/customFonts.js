// 用户导入的字体只存放在本机 IndexedDB；不上传，也不增加 APK 体积。
export const CUSTOM_FONT_PREFIX = 'custom_'
export const MAX_CUSTOM_FONT_BYTES = 50 * 1024 * 1024
const DB_NAME = 'uta-custom-fonts-v1'
const FILES = 'files'
const CATALOG = 'catalog'
const loaded = new Map()

export function isCustomFont(id) { return typeof id === 'string' && /^custom_[0-9a-f]{64}$/.test(id) }
export function customFontFamily(id) { return isCustomFont(id) ? `UTA Custom ${id.slice(CUSTOM_FONT_PREFIX.length)}` : '' }

// 只接受 WebView 能作为单一字体加载的四种文件；扩展名和文件头都必须一致。
export function customFontFormat(name, bytes) {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  const header = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  const tag = String.fromCharCode(...header)
  const signature = tag === 'OTTO' ? 'otf' : tag === 'wOFF' ? 'woff' : tag === 'wOF2' ? 'woff2' : header.length === 4 && header[0] === 0 && header[1] === 1 && header[2] === 0 && header[3] === 0 ? 'ttf' : null
  if (!signature || extension !== signature) throw new Error('请选择有效的 TTF、OTF、WOFF 或 WOFF2 字体文件。')
  return signature
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前设备不支持保存自定义字体。')); return }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(FILES)
      request.result.createObjectStore(CATALOG, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('自定义字体存储打开失败。'))
  })
}

async function getStored(storeName, key) {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('自定义字体读取失败。'))
    })
  } finally { db.close() }
}

export async function listCustomFonts() {
  const db = await openDatabase()
  try {
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction(CATALOG, 'readonly').objectStore(CATALOG).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('自定义字体列表读取失败。'))
    })
    return rows.filter(row => isCustomFont(row.id)).sort((left, right) => right.importedAt - left.importedAt)
  } finally { db.close() }
}

async function digest(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('当前设备无法校验字体文件。')
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
}

async function registerFont(id, bytes) {
  if (loaded.has(id)) return
  const face = new FontFace(customFontFamily(id), bytes)
  try { await face.load() } catch { throw new Error('字体无法加载，请检查文件是否完整或受支持。') }
  document.fonts.add(face)
  loaded.set(id, face)
}

export async function importCustomFont(file) {
  if (!file || !file.name) throw new Error('请选择字体文件。')
  if (!file.size || file.size > MAX_CUSTOM_FONT_BYTES) throw new Error('字体文件须大于 0 且不超过 50 MB。')
  const bytes = await file.arrayBuffer()
  if (bytes.byteLength !== file.size || bytes.byteLength > MAX_CUSTOM_FONT_BYTES) throw new Error('字体文件读取不完整或超过 50 MB。')
  const format = customFontFormat(file.name, bytes)
  const id = `${CUSTOM_FONT_PREFIX}${await digest(bytes)}`
  const previous = await getStored(CATALOG, id)
  // 重复导入同一文件会覆盖旧缓存，便于修复本机存储损坏，不产生重复选项。
  await registerFont(id, bytes)
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || '自定义字体'
  const metadata = previous || { id, name, format, bytes: bytes.byteLength, importedAt: Date.now() }
  const db = await openDatabase()
  try {
    await new Promise((resolve, reject) => {
      // 文件与列表同一事务提交，空间不足时不留下无法使用的半成品。
      const transaction = db.transaction([FILES, CATALOG], 'readwrite')
      transaction.objectStore(FILES).put(bytes, id)
      transaction.objectStore(CATALOG).put(metadata)
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error || new Error('字体保存失败，请检查设备存储空间。'))
      transaction.onabort = () => reject(transaction.error || new Error('字体保存失败，请检查设备存储空间。'))
    })
  } finally { db.close() }
  return metadata
}

export async function restoreCustomFont(id) {
  if (!isCustomFont(id)) return false
  if (loaded.has(id)) return true
  const bytes = await getStored(FILES, id)
  if (!bytes) return false
  if (`${CUSTOM_FONT_PREFIX}${await digest(bytes)}` !== id) throw new Error('本机字体文件已损坏，请删除后重新导入。')
  await registerFont(id, bytes)
  return true
}

export async function deleteCustomFont(id) {
  if (!isCustomFont(id)) throw new Error('无效的自定义字体。')
  const db = await openDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([FILES, CATALOG], 'readwrite')
      transaction.objectStore(FILES).delete(id)
      transaction.objectStore(CATALOG).delete(id)
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error || new Error('自定义字体删除失败。'))
    })
  } finally { db.close() }
  const face = loaded.get(id)
  if (face) { document.fonts.delete(face); loaded.delete(id) }
}
