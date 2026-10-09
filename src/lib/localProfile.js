// 头像用 IndexedDB 保存 Blob，避免 10 MB 动图超出 localStorage 容量；旧资料可继续读取。
export const PROFILE_KEY = 'uta-local-profile-v1'
export const MAX_AVATAR_BYTES = 10 * 1024 * 1024
export function readLocalProfile() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {} } catch { return {} } }
async function avatarStore(action) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('uta-profile-assets', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('avatars')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('avatars', action ? 'readwrite' : 'readonly')
      const query = action ? tx.objectStore('avatars').put(action, 'current') : tx.objectStore('avatars').get('current')
      tx.oncomplete = () => { db.close(); resolve(query.result) }
      tx.onabort = () => { db.close(); reject(tx.error) }
    }
  })
}
export const loadAvatarBlob = () => avatarStore()
export async function saveLocalProfile(profile, blob) {
  if (blob) await avatarStore(blob)
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  window.dispatchEvent(new Event('uta:profile-changed'))
}
export function avatarImageStyle(crop) {
  if (!crop) return {}
  const edge = Math.min(crop.width, crop.height) / crop.zoom
  const width = crop.width / edge * 100, height = crop.height / edge * 100
  return { width:`${width}%`, height:`${height}%`, maxWidth:'none', position:'absolute', left:`${-crop.x * (width - 100)}%`, top:`${-crop.y * (height - 100)}%` }
}
