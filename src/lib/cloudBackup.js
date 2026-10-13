import { inspectLearningBackup } from './learningBackup.js'
import { pendingCloudSongs } from './cloudSongBackup.js'
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true})
const signature=encoder.encode('UTA-CLOUD-BACKUP\n')
const MAX_HEADER=16*1024*1024

// 云备份在旧学习备份外加资料、原始头像、对话和 AI 配置，保持旧备份可读。
export function createCloudBackup(core,extras,avatar=null) {
  // 目录格式标记v2，旧应用会明确拒绝，不能误把“无音频核心”恢复为空歌曲库。
  const metadata=encoder.encode(JSON.stringify({createdAt:new Date().toISOString(),coreSize:core.size,avatarSize:avatar?.size||0,avatarType:avatar?.type||'',...extras,version:extras.catalog?2:1}))
  if(metadata.length>MAX_HEADER) throw new Error('对话等资料过大，请先删除不需要的历史对话。')
  const length=new Uint8Array(4);new DataView(length.buffer).setUint32(0,metadata.length,true)
  return new Blob([signature,length,metadata,core,...(avatar?[avatar]:[])],{type:'application/octet-stream'})
}
export async function inspectCloudBackup(file) {
  const prefix=new Uint8Array(await file.slice(0,signature.length+4).arrayBuffer())
  if(!signature.every((byte,index)=>prefix[index]===byte)) return inspectLearningBackup(file)
  if(prefix.length!==signature.length+4) throw new Error('云备份已损坏。')
  const size=new DataView(prefix.buffer).getUint32(signature.length,true),start=signature.length+4+size
  if(!size||size>MAX_HEADER||start>file.size) throw new Error('云备份资料长度无效。')
  let extras
  try {extras=JSON.parse(decoder.decode(await file.slice(signature.length+4,start).arrayBuffer()))} catch {throw new Error('云备份资料无法读取。')}
  // 原只接受version1；version2必须含有经过校验的独立歌曲目录。
  if(![1,2].includes(extras.version)||extras.version===2&&!extras.catalog||!Number.isSafeInteger(extras.coreSize)||extras.coreSize<=0||!Number.isSafeInteger(extras.avatarSize)||extras.avatarSize<0||extras.avatarSize>10*1024*1024||start+extras.coreSize+extras.avatarSize!==file.size) throw new Error('云备份不完整或版本不受支持。')
  if(!extras.profile||typeof extras.profile!=='object'||Array.isArray(extras.profile)||typeof extras.profile.nickname!=='string'||extras.profile.nickname.length>24) throw new Error('个人资料格式无效。')
  if(extras.avatarSize&&!['image/jpeg','image/png','image/webp','image/gif'].includes(extras.avatarType)) throw new Error('备份头像格式无效。')
  // 云端文件可能被手工修改，裁剪参数与来源链接也需校验后再显示。
  if(extras.profile.avatarCrop){const crop=extras.profile.avatarCrop;if(![crop.width,crop.height,crop.zoom,crop.x,crop.y].every(Number.isFinite)||crop.width<=0||crop.height<=0||crop.width*crop.height>40000000||crop.zoom<1||crop.zoom>3||crop.x<0||crop.x>1||crop.y<0||crop.y>1)throw new Error('头像裁剪资料无效。')}
  if(!Array.isArray(extras.chats)||extras.chats.some(chat=>!chat||typeof chat.id!=='string'||typeof chat.title!=='string'||typeof chat.songId!=='string'||typeof chat.songTitle!=='string'||!Number.isFinite(chat.updatedAt)||!chat.context||typeof chat.context!=='object'||!Array.isArray(chat.messages)||chat.messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>20000))||new Set(extras.chats.map(c=>c.id)).size!==extras.chats.length) throw new Error('对话记录格式无效。')
  if(extras.ai&&(typeof extras.ai!=='object'||Array.isArray(extras.ai)||typeof extras.ai.base_url!=='string'||typeof extras.ai.model!=='string'||(extras.ai.api_key!=null&&typeof extras.ai.api_key!=='string'))) throw new Error('AI 配置格式无效。')
  if(extras.chats.some(chat=>chat.messages.some(message=>message.sources!=null&&(!Array.isArray(message.sources)||message.sources.some(source=>!source||typeof source.title!=='string'||typeof source.url!=='string'||!/^https?:\/\//i.test(source.url))))))throw new Error('对话来源链接格式无效。')
  const core=file.slice(start,start+extras.coreSize)
  const inspection=await inspectLearningBackup(core)
  // 新目录备份的核心不带音频；旧完整备份继续按原格式恢复。
  const catalogSongs=extras.catalog?pendingCloudSongs(extras.catalog,file.webDavOrigin||''):null
  if(catalogSongs&&inspection.manifest.songs.length)throw new Error('云目录备份不能同时包含完整歌曲。')
  return {...inspection,manifest:catalogSongs?{...inspection.manifest,songs:catalogSongs}:inspection.manifest,
    cloudCatalog:Boolean(catalogSongs),cloudFile:file,extras,avatar:extras.avatarSize?file.slice(start+extras.coreSize,file.size,extras.avatarType):null}
}
