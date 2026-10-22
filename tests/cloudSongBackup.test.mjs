import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createCloudAudioAsset,cloudSongDescriptor,pendingCloudSongs,readCloudAudioAsset,reuseCatalogAudio} from '../src/lib/cloudSongBackup.js'
import {createLearningBackup} from '../src/lib/learningBackup.js'
import {createCloudBackup,inspectCloudBackup} from '../src/lib/cloudBackup.js'
import {reconcileLearningState,lyricSnapshot} from '../src/lib/learningIdentity.js'

const song={id:'local-cloud-test',title:'原创歌曲',artist:'UTA',sourceFile:'test.lrc',audioName:'test.wav',artworkUrl:'data:image/jpeg;base64,/9j/2Q==',lines:[{id:3,start:1,text:'明日も歌う',translation:'明天也唱歌',romaji:'ashita mo utau',timestampOriginalStart:0.8}],audioBlob:new Blob([new Uint8Array([1,2,3])],{type:'audio/wav'})}
const state={progress:{learnedBySong:{[song.id]:[3]},reviewItems:[],favoriteSongIds:[],corrections:{[song.id+':3:0']:'あす'},meaningOverrides:{},lyricSnapshots:{[song.id]:lyricSnapshot(song)}},annotations:{[song.id]:[{id:3,text:song.lines[0].text,tokens:[{index:0,surface:'明日も歌う',reading:'あすもうたう'}]}]},aiReviews:{},sentenceExplanations:{},artworkOverrides:{}}
const extras={profile:{nickname:'测试'},chats:[],ai:{base_url:'https://example.com',model:'test'}}
const digest=async blob=>createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex')
const reference=async blob=>{const sha256=await digest(blob);return {name:'_uta-audio-'+sha256+'.bin',size:blob.size,sha256,type:blob.type}}

test('独立音频只含原始字节，歌词/时间/封面/名称与编号变化不改变音频摘要',async()=>{
  const audio=createCloudAudioAsset(song),ref=await reference(audio)
  assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())],[1,2,3])
  const changed={...song,id:'local-another',title:'改名',artist:'新歌手',audioName:'重命名.flac',artworkChoice:'default',lines:[{...song.lines[0],start:1.2,text:'新歌词',translation:'新翻译',romaji:'new'}]}
  assert.equal(await digest(createCloudAudioAsset(changed)),ref.sha256)
  assert.notEqual(await digest(createCloudAudioAsset({...song,audioBlob:new Blob([new Uint8Array([1,2,4])])})),ref.sha256)
})
test('云目录立即恢复完整歌词/时间/注音/原点与学习记录，独立下载只装配音频',async()=>{
  const audio=createCloudAudioAsset(song),ref=await reference(audio)
  const blob=createCloudBackup(createLearningBackup([],state),{...extras,catalog:{version:2,songs:[cloudSongDescriptor(song,ref)]}});blob.webDavOrigin='https://example.com/dav/'
  const inspection=await inspectCloudBackup(blob),pending=inspection.manifest.songs[0]
  assert.equal(inspection.extras.version,3);assert.equal(inspection.cloudCatalog,true);assert.equal(inspection.audioBytes,0)
  assert.deepEqual(pending.lines,song.lines);assert.equal(pending.cloudPending,true);assert.equal(pending.audioBlob,null)
  assert.equal(pending.cloudAudio.origin,blob.webDavOrigin);assert.equal(pending.artworkUrl,song.artworkUrl)
  assert.deepEqual(reconcileLearningState([pending],state).progress.corrections,state.progress.corrections)
  const restored=await readCloudAudioAsset(audio,pending)
  assert.equal(restored.cloudPending,false);assert.equal(restored.audioBlob.type,'audio/wav');assert.deepEqual(restored.lines,song.lines)
})
test('恢复复用本地音频但必须应用新歌词/时间/原点，等长不同音频不误复用',async()=>{
  const ref=await reference(song.audioBlob),changed={...song,title:'新标题',lines:[{...song.lines[0],start:2.2,text:'風と歌う',translation:'更新译文',timestampOriginalStart:2}]}
  const incoming=pendingCloudSongs({version:2,songs:[cloudSongDescriptor(changed,ref)]})
  const [restored]=await reuseCatalogAudio(incoming,[song],digest)
  assert.equal(restored.cloudPending,false);assert.deepEqual(restored.lines,changed.lines);assert.equal(restored.title,changed.title)
  const [mismatch]=await reuseCatalogAudio(incoming,[{...song,audioBlob:new Blob([new Uint8Array([1,2,4])])}],digest)
  assert.equal(mismatch.cloudPending,true);assert.equal(mismatch.audioBlob,null)
})
test('新目录拒绝路径越界、重复/非法歌词、损坏引用及旧云格式',async()=>{
  const ref=await reference(song.audioBlob),descriptor=cloudSongDescriptor(song,ref)
  assert.throws(()=>pendingCloudSongs({version:2,songs:[{...descriptor,audio:{...ref,name:'../song'}}]}))
  assert.throws(()=>pendingCloudSongs({version:2,songs:[descriptor,descriptor]}))
  assert.throws(()=>pendingCloudSongs({version:2,songs:[{...descriptor,lines:[{...song.lines[0],start:-1}]}]}))
  assert.throws(()=>pendingCloudSongs({version:1,songs:[descriptor]}),/重新上传/)
  const [pending]=pendingCloudSongs({version:2,songs:[descriptor]})
  await assert.rejects(readCloudAudioAsset(song.audioBlob.slice(0,-1),pending))
  const invalid=createCloudBackup(createLearningBackup([song],state),{...extras,catalog:{version:2,songs:[descriptor]}})
  await assert.rejects(inspectCloudBackup(invalid))
})

// 旧整曲备份测试保留对照；产品已按用户要求采用独立音频格式。
// import test from 'node:test'
// import assert from 'node:assert/strict'
// import {createCloudSongAsset,cloudSongDescriptor,pendingCloudSongs,readCloudSongAsset} from '../src/lib/cloudSongBackup.js'
// import {createLearningBackup} from '../src/lib/learningBackup.js'
// import {createCloudBackup,inspectCloudBackup} from '../src/lib/cloudBackup.js'
// import {reconcileLearningState,lyricSnapshot} from '../src/lib/learningIdentity.js'
//
// const song={id:'local-cloud-test',title:'原创歌曲',artist:'UTA',sourceFile:'test.lrc',audioName:'test.wav',artworkUrl:'data:image/jpeg;base64,/9j/2Q==',lines:[{id:3,start:1,text:'明日も歌う',translation:''}],audioBlob:new Blob([new Uint8Array([1,2,3])],{type:'audio/wav'})}
// const state={progress:{learnedBySong:{[song.id]:[3]},reviewItems:[],favoriteSongIds:[],corrections:{[song.id+':3:0']:'あす'},meaningOverrides:{},lyricSnapshots:{[song.id]:lyricSnapshot(song)}},annotations:{[song.id]:[{id:3,text:song.lines[0].text,tokens:[{index:0,surface:'明日も歌う',reading:'あすもうたう'}]}]},aiReviews:{},sentenceExplanations:{},artworkOverrides:{}}
// const extras={profile:{nickname:'测试'},chats:[],ai:{base_url:'https://example.com',model:'test'}}
// const reference=async blob=>{const sha256=Buffer.from(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex');return {name:`_uta-song-${sha256}.uta-backup`,size:blob.size,sha256}}
//
// test('歌曲附件稳定，目录恢复不下载音频但保留封面及学习进度',async()=>{
//   const asset=createCloudSongAsset(song),ref=await reference(asset)
//   assert.equal((await reference(createCloudSongAsset({...song,cloudPending:false,cloudAsset:ref}))).sha256,ref.sha256)
//   const catalog={version:1,songs:[cloudSongDescriptor(song,ref)]}
//   const blob=createCloudBackup(createLearningBackup([],state),{...extras,catalog});blob.webDavOrigin='https://example.com/dav/'
//   const inspection=await inspectCloudBackup(blob)
//   assert.equal(inspection.extras.version,2);assert.equal(inspection.cloudCatalog,true);assert.equal(inspection.audioBytes,0)
//   const pending=inspection.manifest.songs[0]
//   assert.equal(pending.audioBlob,null);assert.equal(pending.cloudPending,true);assert.equal(pending.artworkUrl,song.artworkUrl)
//   assert.deepEqual(reconcileLearningState([pending],state).progress.learnedBySong,state.progress.learnedBySong)
//   assert.deepEqual(reconcileLearningState([pending],state).progress.corrections,state.progress.corrections)
//   const restored=await readCloudSongAsset(asset,pending)
//   assert.equal(restored.cloudPending,false);assert.equal(restored.lines[0].text,song.lines[0].text)
//   assert.deepEqual([...new Uint8Array(await restored.audioBlob.arrayBuffer())],[1,2,3])
// })
// test('目录拒绝越界附件、重复歌曲、损坏及不匹配的单曲文件',async()=>{
//   const asset=createCloudSongAsset(song),ref=await reference(asset),descriptor=cloudSongDescriptor(song,ref)
//   assert.throws(()=>pendingCloudSongs({version:1,songs:[{...descriptor,asset:{...ref,name:'../song'}}]}))
//   assert.throws(()=>pendingCloudSongs({version:1,songs:[descriptor,descriptor]}))
//   const [pending]=pendingCloudSongs({version:1,songs:[descriptor]})
//   await assert.rejects(readCloudSongAsset(asset.slice(0,-1),pending))
//   await assert.rejects(readCloudSongAsset(asset,{...pending,id:'local-other'}))
//   const invalid=createCloudBackup(createLearningBackup([song],state),{...extras,catalog:{version:1,songs:[descriptor]}})
//   await assert.rejects(inspectCloudBackup(invalid))
// })
//
