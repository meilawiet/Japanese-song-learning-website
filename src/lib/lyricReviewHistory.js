// 复核历史仅存本机 IndexedDB，独立于短期缓存；不保存 API Key 或音频。
const DB='uta-lyric-review-history',STORE='reviews'
async function transaction(mode,action) {
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1)
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'})
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
  })
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);let request
    try{request=action(tx.objectStore(STORE))}catch(error){db.close();reject(error);return}
    tx.oncomplete=()=>{db.close();resolve(request?.result)}
    tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||new Error('复核历史保存失败。'))}
  })
}
export const suggestionKey=item=>`${item.line_id}:${item.token_index}`
export function createReviewRecord(song,result) {
  return {id:crypto.randomUUID(),songId:song.id,title:song.title,createdAt:Date.now(),songLines:song.lines.map(line=>({...line})),result,decisions:{},issueDecisions:{}}
}
// 状态只改变用户选中的项目；跳过的建议仍可再次选中采用，采纳时间与此前跳过时间保留。
export function recordDecisions(record,keys,status,now=Date.now()) {
  const allowed=new Set(record.result.suggestions.map(suggestionKey)),decisions={...record.decisions}
  for(const key of keys)if(allowed.has(key))decisions[key]={...decisions[key],status,[status==='adopted'?'adoptedAt':'skippedAt']:now}
  return {...record,decisions,updatedAt:now}
}
export const saveReviewRecord=record=>transaction('readwrite',store=>store.put(record))
export const deleteReviewRecord=id=>transaction('readwrite',store=>store.delete(id))
export async function listReviewRecords(songId) {
  return ((await transaction('readonly',store=>store.getAll()))||[]).filter(record=>record.songId===songId).sort((a,b)=>b.createdAt-a.createdAt)
}
