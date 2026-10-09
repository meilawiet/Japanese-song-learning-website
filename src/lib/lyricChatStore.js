// 对话与歌词上下文仅存当前设备，IndexedDB 避免长对话超出 localStorage 容量。
async function operate(mode, action) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('uta-lyric-chats', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('sessions', { keyPath:'id' })
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('sessions', mode)
      const query = action(tx.objectStore('sessions'))
      tx.oncomplete = () => { db.close(); resolve(query.result) }
      tx.onabort = () => { db.close(); reject(tx.error || new Error('无法保存对话。')) }
    }
  })
}
export const listLyricChats = async () => (await operate('readonly', store => store.getAll())).sort((a,b) => b.updatedAt-a.updatedAt)
// 对话变动通知自动备份，旧写法：直接返回 operate(...)。
export const saveLyricChat = async session => {await operate('readwrite', store => store.put(session));window.dispatchEvent(new Event('uta:chats-changed'))}
export const deleteLyricChat = async id => {await operate('readwrite', store => store.delete(id));window.dispatchEvent(new Event('uta:chats-changed'))}
// 云恢复整批替换，清空与写入在同一事务中完成。
export function replaceLyricChats(sessions) {
  return new Promise((resolve,reject)=>{const r=indexedDB.open('uta-lyric-chats',1);r.onupgradeneeded=()=>r.result.createObjectStore('sessions',{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('sessions','readwrite'),store=tx.objectStore('sessions');store.clear();sessions.forEach(session=>store.put(session));tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>{db.close();reject(tx.error)}}})
}
