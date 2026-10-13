import {createLearningBackup,inspectLearningBackup,songsFromLearningBackup} from './learningBackup.js'

const emptyState={progress:{learnedBySong:{},reviewItems:[],favoriteSongIds:[],corrections:{},meaningOverrides:{}},annotations:{},aiReviews:{},sentenceExplanations:{},artworkOverrides:{}}
export const CLOUD_ASSET_NAME=/^_uta-song-[a-f0-9]{64}\.uta-backup$/u

// 歌曲附件不含不断变化的学习进度；内容哈希相同即可复用，音频和歌词不会重复上传。
export function createCloudSongAsset(record){
  const {cloudPending,cloudAsset,...song}=record
  return createLearningBackup([song],emptyState,{createdAt:'1970-01-01T00:00:00.000Z'})
}
export function cloudSongDescriptor(record,asset){
  const descriptor={}
  for(const field of ['id','title','artist','album','duration','sourceFile','createdAt','audioName','artworkUrl','artworkSourceUrl','artworkProvider','artworkChoice'])if(record[field]!=null)descriptor[field]=record[field]
  return {...descriptor,lines:record.lines.map(({id,start})=>({id,start})),asset}
}
// 云目录只含歌曲资料和句子编号，不含歌曲音频及原歌词；学习记录可提前恢复。
export function pendingCloudSongs(catalog,origin=''){
  if(catalog?.version!==1||!Array.isArray(catalog.songs)||catalog.songs.length>1000)throw new Error('云歌曲目录格式无效。')
  const seen=new Set()
  return catalog.songs.map(({asset,...song})=>{
    if(!asset||!CLOUD_ASSET_NAME.test(asset.name)||asset.name!==`_uta-song-${asset.sha256}.uta-backup`||!Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>500*1024*1024||seen.has(song.id))throw new Error('云歌曲附件资料无效。')
    seen.add(song.id)
    if(!Array.isArray(song.lines))throw new Error('云歌曲目录缺少句子编号。')
    const lines=song.lines.map(({id,start})=>({id,start,text:'歌曲数据尚未下载',translation:''}))
    // 复用完整备份的资料校验，拒绝非法歌曲ID、封面链接、时间戳和重复句子编号。
    createLearningBackup([{...song,lines,audioBlob:new Blob(['x'])}],emptyState)
    return {...song,lines,isLocal:true,cloudPending:true,cloudAsset:{...asset,origin},audioBlob:null}
  })
}
export async function readCloudSongAsset(blob,descriptor){
  if(blob.size!==descriptor.cloudAsset.size)throw new Error('歌曲下载大小与云目录不符，请重新下载目录。')
  const inspection=await inspectLearningBackup(blob),records=songsFromLearningBackup(inspection)
  if(records.length!==1||records[0].id!==descriptor.id||records[0].lines.length!==descriptor.lines.length||records[0].lines.some((line,index)=>line.id!==descriptor.lines[index].id))throw new Error('下载歌曲与所选目录不一致，未保存。')
  return {...records[0],cloudAsset:descriptor.cloudAsset,cloudPending:false}
}
