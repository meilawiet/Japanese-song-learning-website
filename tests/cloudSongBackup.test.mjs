import test from 'node:test'
import assert from 'node:assert/strict'
import {createCloudSongAsset,cloudSongDescriptor,pendingCloudSongs,readCloudSongAsset} from '../src/lib/cloudSongBackup.js'
import {createLearningBackup} from '../src/lib/learningBackup.js'
import {createCloudBackup,inspectCloudBackup} from '../src/lib/cloudBackup.js'
import {reconcileLearningState,lyricSnapshot} from '../src/lib/learningIdentity.js'

const song={id:'local-cloud-test',title:'原创歌曲',artist:'UTA',sourceFile:'test.lrc',audioName:'test.wav',artworkUrl:'data:image/jpeg;base64,/9j/2Q==',lines:[{id:3,start:1,text:'明日も歌う',translation:''}],audioBlob:new Blob([new Uint8Array([1,2,3])],{type:'audio/wav'})}
const state={progress:{learnedBySong:{[song.id]:[3]},reviewItems:[],favoriteSongIds:[],corrections:{[song.id+':3:0']:'あす'},meaningOverrides:{},lyricSnapshots:{[song.id]:lyricSnapshot(song)}},annotations:{[song.id]:[{id:3,text:song.lines[0].text,tokens:[{index:0,surface:'明日も歌う',reading:'あすもうたう'}]}]},aiReviews:{},sentenceExplanations:{},artworkOverrides:{}}
const extras={profile:{nickname:'测试'},chats:[],ai:{base_url:'https://example.com',model:'test'}}
const reference=async blob=>{const sha256=Buffer.from(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex');return {name:`_uta-song-${sha256}.uta-backup`,size:blob.size,sha256}}

test('歌曲附件稳定，目录恢复不下载音频但保留封面及学习进度',async()=>{
  const asset=createCloudSongAsset(song),ref=await reference(asset)
  assert.equal((await reference(createCloudSongAsset({...song,cloudPending:false,cloudAsset:ref}))).sha256,ref.sha256)
  const catalog={version:1,songs:[cloudSongDescriptor(song,ref)]}
  const blob=createCloudBackup(createLearningBackup([],state),{...extras,catalog});blob.webDavOrigin='https://example.com/dav/'
  const inspection=await inspectCloudBackup(blob)
  assert.equal(inspection.extras.version,2);assert.equal(inspection.cloudCatalog,true);assert.equal(inspection.audioBytes,0)
  const pending=inspection.manifest.songs[0]
  assert.equal(pending.audioBlob,null);assert.equal(pending.cloudPending,true);assert.equal(pending.artworkUrl,song.artworkUrl)
  assert.deepEqual(reconcileLearningState([pending],state).progress.learnedBySong,state.progress.learnedBySong)
  assert.deepEqual(reconcileLearningState([pending],state).progress.corrections,state.progress.corrections)
  const restored=await readCloudSongAsset(asset,pending)
  assert.equal(restored.cloudPending,false);assert.equal(restored.lines[0].text,song.lines[0].text)
  assert.deepEqual([...new Uint8Array(await restored.audioBlob.arrayBuffer())],[1,2,3])
})
test('目录拒绝越界附件、重复歌曲、损坏及不匹配的单曲文件',async()=>{
  const asset=createCloudSongAsset(song),ref=await reference(asset),descriptor=cloudSongDescriptor(song,ref)
  assert.throws(()=>pendingCloudSongs({version:1,songs:[{...descriptor,asset:{...ref,name:'../song'}}]}))
  assert.throws(()=>pendingCloudSongs({version:1,songs:[descriptor,descriptor]}))
  const [pending]=pendingCloudSongs({version:1,songs:[descriptor]})
  await assert.rejects(readCloudSongAsset(asset.slice(0,-1),pending))
  await assert.rejects(readCloudSongAsset(asset,{...pending,id:'local-other'}))
  const invalid=createCloudBackup(createLearningBackup([song],state),{...extras,catalog:{version:1,songs:[descriptor]}})
  await assert.rejects(inspectCloudBackup(invalid))
})
