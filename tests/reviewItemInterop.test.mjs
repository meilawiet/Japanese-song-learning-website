import assert from 'node:assert/strict'
import {test} from 'node:test'
import {reconcileLearningState,lyricSnapshot} from '../src/lib/learningIdentity.js'
import {createLearningBackup} from '../src/lib/learningBackup.js'
import {createCloudBackup,inspectCloudBackup} from '../src/lib/cloudBackup.js'
import {cloudSongDescriptor,pendingCloudSongs,readCloudAudioAsset} from '../src/lib/cloudSongBackup.js'
import {createHash} from 'node:crypto'

// 中文说明：跨端协议允许复习条目仅带歌曲ID和行ID，用原创数据覆盖真正的读取/重整/再次备份链路。
const song={id:'local-review-interop',isLocal:true,title:'原创复习测试',artist:'UTA',lyricsOnly:true,audioBlob:null,audioName:'',lines:[{id:10,start:null,text:'風と歌う',translation:''},{id:30,start:null,text:'風と歌う',translation:''}]}
const state=reviewItems=>({progress:{learnedBySong:{},reviewItems,favoriteSongIds:[],corrections:{},meaningOverrides:{}},annotations:{},aiReviews:{},sentenceExplanations:{},artworkOverrides:{}})
const minimal={songId:song.id,lineId:30}
const extras={profile:{nickname:'协议测试'},chats:[],ai:{base_url:'https://example.com',model:'test'}}
const restore=async state=>inspectCloudBackup(createCloudBackup(createLearningBackup([],state),{...extras,catalog:{version:2,songs:[cloudSongDescriptor(song,null)]}}))

test('合法最小复习条目在纯歌词云恢复与再次备份后仍保留，原文只按精确行ID补齐',async()=>{
  const original=state([{...minimal,customNote:'保留附加资料'}]),copy=structuredClone(original)
  const first=await restore(original),learning=reconcileLearningState(first.manifest.songs,first.manifest)
  assert.deepEqual(learning.progress.reviewItems,[{...minimal,customNote:'保留附加资料',text:song.lines[1].text}])
  const second=await restore(learning),again=reconcileLearningState(second.manifest.songs,second.manifest)
  assert.deepEqual(again.progress.reviewItems,learning.progress.reviewItems)
  assert.deepEqual(reconcileLearningState(second.manifest.songs,again),again)
  assert.deepEqual(original,copy,'不修改调用者传入的对象')
})

test('已确认的文件夹歌词快照可补原文，显式错误原文及已变化的行不能靠缺text绕过身份校验',()=>{
  const folder={...song,id:'folder-review.lrc',isLocal:false}
  const saved=state([{songId:folder.id,lineId:10},{songId:folder.id,lineId:30,text:'另一句'}])
  saved.progress.lyricSnapshots={[folder.id]:lyricSnapshot(folder)}
  assert.deepEqual(reconcileLearningState([folder],saved).progress.reviewItems,[{songId:folder.id,lineId:10,text:folder.lines[0].text}])
  const changed={...folder,lines:[{...folder.lines[0],text:'歌词已被替换'},folder.lines[1]]}
  assert.deepEqual(reconcileLearningState([changed],saved).progress.reviewItems,[])
})

test('待下载歌曲保持最小复习记录，音频补齐后精确关联原行且不丢复习',async()=>{
  const audio=new Blob([new Uint8Array([1,2,3])],{type:'audio/wav'}),sha256=createHash('sha256').update(Buffer.from(await audio.arrayBuffer())).digest('hex')
  const full={...song,lyricsOnly:false,lines:song.lines.map((line,index)=>({...line,start:index+1})),audioBlob:audio}
  const [pending]=pendingCloudSongs({version:2,songs:[cloudSongDescriptor(full,{name:'_uta-audio-'+sha256+'.bin',sha256,size:audio.size,type:audio.type})]})
  const saved=state([minimal]),before=reconcileLearningState([pending],saved)
  assert.deepEqual(before.progress.reviewItems,[minimal])
  const downloaded=await readCloudAudioAsset(audio,pending),after=reconcileLearningState([downloaded],before)
  assert.deepEqual(after.progress.reviewItems,[{...minimal,text:downloaded.lines[1].text}])
})

test('未知歌曲引用继续保留，不按同名原文猜测歌曲或把不存在的行套到重复歌词上',()=>{
  const unknown={songId:'local-other',lineId:10},badLine={songId:song.id,lineId:999}
  const saved=state([unknown,badLine,minimal])
  assert.deepEqual(reconcileLearningState([song],saved).progress.reviewItems,[unknown,{...minimal,text:song.lines[1].text}])
})
