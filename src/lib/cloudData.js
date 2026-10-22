// 旧整包封装入口：import { createCloudBackup } from './cloudBackup'
import { reuseCatalogAudio } from './cloudSongBackup.js'
import { digestCloudAudio } from './webDav'
import { loadAiSettingsFromDevice, saveAiSettings } from './aiSettings'
import { readLocalProfile, loadAvatarBlob, saveLocalProfile } from './localProfile'
import { listLyricChats, replaceLyricChats } from './lyricChatStore'
import { BACKUP_STORAGE_KEYS, songsFromLearningBackup } from './learningBackup'
import { loadLocalSongs, replaceLocalSongs } from './localSongStore'

export async function collectCloudExtras(includeKey=false) {
  const settings=await loadAiSettingsFromDevice(),{api_key,...ai}=settings
  // 用户主动选择包含密钥时才写入备份；绝不包含 WebDAV 账号密码。
  if(includeKey) ai.api_key=api_key
  const profile={nickname:'UTA 学习者',...readLocalProfile()},avatar=profile.avatarStored?await loadAvatarBlob():null
  return {extras:{profile,chats:await listLyricChats(),ai,recent:{learn:localStorage.getItem('uta-recent-learn-v1'),sing:localStorage.getItem('uta-recent-sing-v1')}},avatar}
}
// 旧整包封装不再使用：export async function wrapCloudBackup(core,includeKey) {const {extras,avatar}=await collectCloudExtras(includeKey);return createCloudBackup(core,extras,avatar)}
// 恢复前保留本机原数据；任何部分失败时尽力完整回滚，不留下半份学习库。
export async function restoreCloudData(inspection) {
  const previousSongs=await loadLocalSongs(),previous=await collectCloudExtras(true)
  const storage=Object.fromEntries([...Object.values(BACKUP_STORAGE_KEYS),'uta-local-profile-v1','uta-recent-learn-v1','uta-recent-sing-v1'].map(key=>[key,localStorage.getItem(key)]))
  async function applyExtras(extras,avatar) {
    const profile={...extras.profile,avatarStored:Boolean(avatar)}
    await saveLocalProfile(profile,avatar)
    await replaceLyricChats(extras.chats)
    // 原来只要有密钥就永久保存；恢复时保留用户原先的记住密钥选择。
    // if(extras.ai) await saveAiSettings({...extras.ai,api_key:extras.ai.api_key||'',rememberKey:Boolean(extras.ai.api_key)})
    if(extras.ai) await saveAiSettings({...extras.ai,api_key:extras.ai.api_key||'',rememberKey:Boolean(extras.ai.rememberKey)&&Boolean(extras.ai.api_key)})
    for(const [field,key] of [['learn','uta-recent-learn-v1'],['sing','uta-recent-sing-v1']]) {const value=extras.recent?.[field];if(typeof value==='string')localStorage.setItem(key,value);else localStorage.removeItem(key)}
  }
  try {
    // 仅复用匹配的原始音频，新目录里的歌词、时间戳、封面等资料始终覆盖旧资料。
    const catalogSongs=inspection.cloudCatalog?await reuseCatalogAudio(inspection.manifest.songs,previousSongs,digestCloudAudio):null
    // 旧逻辑：// 目录恢复先建立待下载歌曲，封面和进度即时可见；音频由用户逐首选择下载。
    // 旧逻辑：// 同一附件已经完整下载时保留本机音频，更新云端目录不会逼用户重复下载同一首。
    // 旧逻辑：const catalogSongs=inspection.cloudCatalog?inspection.manifest.songs.map(song=>{
    // 旧逻辑：// 已下载的纯歌词也可以复用，不能在每次恢复目录时重新变暗。
    // 旧逻辑：const local=previousSongs.find(item=>item.id===song.id&&!item.cloudPending&&(item.audioBlob instanceof Blob||item.lyricsOnly===true)&&item.cloudAsset?.sha256===song.cloudAsset.sha256)
    // 旧逻辑：return local?{...local,...song,lines:local.lines,audioBlob:local.audioBlob,cloudPending:false}:song
    // 旧逻辑：}):null
    await replaceLocalSongs(catalogSongs||songsFromLearningBackup(inspection))
    for(const [field,key] of Object.entries(BACKUP_STORAGE_KEYS)) localStorage.setItem(key,JSON.stringify(inspection.manifest[field]||{}))
    await applyExtras(inspection.extras,inspection.avatar)
  } catch(failure) {
    try {await replaceLocalSongs(previousSongs);await applyExtras(previous.extras,previous.avatar);for(const [key,value] of Object.entries(storage)){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}}
    catch {throw new Error('恢复与回滚未完成，请保留本机数据并重新恢复原备份。')}
    throw failure
  }
}
