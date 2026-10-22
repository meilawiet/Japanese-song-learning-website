import {createLearningBackup} from './learningBackup.js'

const emptyState={progress:{learnedBySong:{},reviewItems:[],favoriteSongIds:[],corrections:{},meaningOverrides:{}},annotations:{},aiReviews:{},sentenceExplanations:{},artworkOverrides:{}}
export const CLOUD_CATALOG_VERSION=2
export const CLOUD_AUDIO_NAME=/^_uta-audio-[a-f0-9]{64}\.bin$/u
const fields=['id','title','artist','album','duration','sourceFile','language','createdAt','audioName','lyricsOnly','artworkUrl','artworkSourceUrl','artworkProvider','artworkChoice']

// 音频附件就是原始字节，不混入文件名、歌词、封面、时间戳或歌曲编号。
export function createCloudAudioAsset(record){
  if(record.cloudPending)throw new Error('这首歌的音频尚未下载。')
  if(!(record.audioBlob instanceof Blob)||!record.audioBlob.size||record.audioBlob.size>500*1024*1024)throw new Error('音频文件缺失或超过500 MB。')
  return record.audioBlob
}
export function validCloudAudio(audio){
  return audio && typeof audio==='object' && !Array.isArray(audio) && /^[a-f0-9]{64}$/.test(audio.sha256||'')
    && CLOUD_AUDIO_NAME.test(audio.name) && audio.name==='_uta-audio-'+audio.sha256+'.bin'
    && Number.isSafeInteger(audio.size) && audio.size>0 && audio.size<=500*1024*1024
    && typeof audio.type==='string' && audio.type.length<=100
}
// 新目录保存完整非音频资料，音频引用独立；旧的整曲cloudAsset不进入新目录。
export function cloudSongDescriptor(record,audio){
  const song={}
  for(const field of fields)if(record[field]!=null)song[field]=record[field]
  song.lines=record.lines?.map(line=>({...line}))
  if(audio!==null&&!validCloudAudio(audio))throw new Error('云音频引用格式无效。')
  if(audio===null&&song.lyricsOnly!==true||audio!==null&&song.lyricsOnly===true)throw new Error('歌曲音频与纯歌词标记不一致。')
  // 复用歌词校验，不复制真实音频；云目录包含原文、翻译、注音、时间戳及重置原点。
  createLearningBackup([{...song,audioBlob:audio===null?null:new Blob(['x'])}],emptyState)
  return {...song,audio:audio===null?null:{name:audio.name,size:audio.size,sha256:audio.sha256,type:audio.type}}
}
export function pendingCloudSongs(catalog,origin=''){
  if(catalog?.version!==CLOUD_CATALOG_VERSION||!Array.isArray(catalog.songs)||catalog.songs.length>1000)throw new Error('不支持此云备份格式，请从当前版本重新上传。')
  const seen=new Set()
  return catalog.songs.map(descriptor=>{
    const {audio,...song}=cloudSongDescriptor(descriptor,descriptor.audio)
    if(seen.has(song.id))throw new Error('云目录存在重复歌曲。')
    seen.add(song.id)
    return {...song,isLocal:true,lyricsOnly:audio===null,cloudPending:audio!==null,cloudAudio:audio?{...audio,origin}:null,audioBlob:null}
  })
}
// 原生下载入口已校验完整SHA256，此处只装配音频，绝不使用音频覆盖目录里的新歌词。
export async function readCloudAudioAsset(blob,descriptor){
  if(!validCloudAudio(descriptor.cloudAudio)||!(blob instanceof Blob)||blob.size!==descriptor.cloudAudio.size)throw new Error('下载音频大小或引用与云目录不符。')
  return {...descriptor,audioBlob:blob.slice(0,blob.size,descriptor.cloudAudio.type),lyricsOnly:false,cloudPending:false}
}
// 恢复只复用真实音频字节，歌词等资料始终取本次快照；摘要在原生侧流式计算。
export async function reuseCatalogAudio(incoming,previous,digestAudio){
  const songs=[]
  for(const song of incoming){
    const local=previous.find(item=>item.id===song.id && item.audioBlob instanceof Blob && item.audioBlob.size===song.cloudAudio?.size)
    if(song.cloudPending && local && await digestAudio(local.audioBlob)===song.cloudAudio.sha256)songs.push(await readCloudAudioAsset(local.audioBlob,song))
    else songs.push(song)
  }
  return songs
}

// 旧整曲附件实现保留对照；不再作为可调用的兼容路径。
// import {createLearningBackup,inspectLearningBackup,songsFromLearningBackup} from './learningBackup.js'
//
// const emptyState={progress:{learnedBySong:{},reviewItems:[],favoriteSongIds:[],corrections:{},meaningOverrides:{}},annotations:{},aiReviews:{},sentenceExplanations:{},artworkOverrides:{}}
// export const CLOUD_ASSET_NAME=/^_uta-song-[a-f0-9]{64}\.uta-backup$/u
//
// // 歌曲附件不含不断变化的学习进度；内容哈希相同即可复用，音频和歌词不会重复上传。
// export function createCloudSongAsset(record){
//   const {cloudPending,cloudAsset,...song}=record
//   return createLearningBackup([song],emptyState,{createdAt:'1970-01-01T00:00:00.000Z'})
// }
// export function cloudSongDescriptor(record,asset){
//   const descriptor={}
//   // 目录保留纯歌词标记，下载后仍不要求本来就没有的音频。
//   for(const field of ['id','title','artist','album','duration','sourceFile','language','createdAt','audioName','lyricsOnly','artworkUrl','artworkSourceUrl','artworkProvider','artworkChoice'])if(record[field]!=null)descriptor[field]=record[field]
//   return {...descriptor,lines:record.lines.map(({id,start})=>({id,start})),asset}
// }
// // 云目录只含歌曲资料和句子编号，不含歌曲音频及原歌词；学习记录可提前恢复。
// export function pendingCloudSongs(catalog,origin=''){
//   if(catalog?.version!==1||!Array.isArray(catalog.songs)||catalog.songs.length>1000)throw new Error('云歌曲目录格式无效。')
//   const seen=new Set()
//   return catalog.songs.map(({asset,...song})=>{
//     if(!asset||!CLOUD_ASSET_NAME.test(asset.name)||asset.name!==`_uta-song-${asset.sha256}.uta-backup`||!Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>500*1024*1024||seen.has(song.id))throw new Error('云歌曲附件资料无效。')
//     seen.add(song.id)
//     if(!Array.isArray(song.lines))throw new Error('云歌曲目录缺少句子编号。')
//     const lines=song.lines.map(({id,start})=>({id,start,text:'歌曲数据尚未下载',translation:''}))
//     // 复用完整备份的资料校验，拒绝非法歌曲ID、封面链接、时间戳和重复句子编号。
//     createLearningBackup([{...song,lines,audioBlob:new Blob(['x'])}],emptyState)
//     return {...song,lines,isLocal:true,cloudPending:true,cloudAsset:{...asset,origin},audioBlob:null}
//   })
// }
// export async function readCloudSongAsset(blob,descriptor){
//   if(blob.size!==descriptor.cloudAsset.size)throw new Error('歌曲下载大小与云目录不符，请重新下载目录。')
//   const inspection=await inspectLearningBackup(blob),records=songsFromLearningBackup(inspection)
//   if(records.length!==1||records[0].id!==descriptor.id||records[0].lines.length!==descriptor.lines.length||records[0].lines.some((line,index)=>line.id!==descriptor.lines[index].id))throw new Error('下载歌曲与所选目录不一致，未保存。')
//   return {...records[0],cloudAsset:descriptor.cloudAsset,cloudPending:false}
// }
//
// // 多语言适配前的相关实现保留对照（新逻辑在原位置）。
// // 'sourceFile','createdAt'
//
