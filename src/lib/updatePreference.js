// 只忽略指定的待更新版本；新版本仍提示，手动检查始终可打开更新。
const KEY='uta-update-ignored-version-v1'
const normalized=version=>String(version||'').replace(/^v/,'')
export function shouldPromptUpdate(version,manual=false,storage=localStorage){
  if(manual)return true
  try{return storage.getItem(KEY)!==normalized(version)}catch{return true}
}
export function ignoreUpdateVersion(version,storage=localStorage){
  if(!version)return
  storage.setItem(KEY,normalized(version))
}
