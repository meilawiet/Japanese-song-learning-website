const DATABASE_NAME = 'uta-sing-along-appearance'
const STORE_NAME = 'preferences'
const RECORD_ID = 'desktop-player'

export const DEFAULT_SING_ALONG_APPEARANCE = Object.freeze({
  mode: 'default',
  color: '#214239',
  blur: 7,
  dim: 60,
  imageBlob: null,
})

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const MAX_SING_ALONG_IMAGE_BYTES = 15 * 1024 * 1024

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.round(number))) : fallback
}

export function normalizeSingAlongAppearance(value) {
  const imageBlob = value?.imageBlob instanceof Blob && allowedImageTypes.has(value.imageBlob.type)
    && value.imageBlob.size <= MAX_SING_ALONG_IMAGE_BYTES ? value.imageBlob : null
  const mode = value?.mode === 'color' ? 'color' : value?.mode === 'image' && imageBlob ? 'image' : 'default'
  return {
    mode,
    color: /^#[0-9a-f]{6}$/i.test(value?.color || '') ? value.color : DEFAULT_SING_ALONG_APPEARANCE.color,
    blur: clamp(value?.blur, 0, 18, DEFAULT_SING_ALONG_APPEARANCE.blur),
    dim: clamp(value?.dim, 25, 85, DEFAULT_SING_ALONG_APPEARANCE.dim),
    imageBlob,
  }
}

export function validateSingAlongImage(file) {
  if (!(file instanceof Blob) || !allowedImageTypes.has(file.type)) throw new Error('请选择 PNG、JPG 或 WebP 图片。')
  if (file.size === 0 || file.size > MAX_SING_ALONG_IMAGE_BYTES) throw new Error('背景图片需小于 15 MB。')
  return file
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开跟唱背景设置。'))
  })
}

export async function loadSingAlongAppearance() {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(RECORD_ID)
    request.onsuccess = () => resolve(normalizeSingAlongAppearance(request.result))
    request.onerror = () => reject(request.error || new Error('无法读取跟唱背景设置。'))
    transaction.oncomplete = () => database.close()
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('无法读取跟唱背景设置。')) }
  })
}

export async function saveSingAlongAppearance(value) {
  const appearance = normalizeSingAlongAppearance(value)
  const database = await openDatabase()
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put({ id: RECORD_ID, ...appearance, imageBlob: appearance.mode === 'image' ? appearance.imageBlob : null })
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('无法保存跟唱背景设置。')) }
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('无法保存跟唱背景设置。')) }
  })
  return appearance
}
