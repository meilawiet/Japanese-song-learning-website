import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createLearningBackup,songsFromLearningBackup} from '../src/lib/learningBackup.js'
import {createCloudBackup,inspectCloudBackup} from '../src/lib/cloudBackup.js'
const state={progress:{learnedBySong:{'local-test':[0]},reviewItems:[],favoriteSongIds:[],corrections:{'local-test:0:0':'あす'},meaningOverrides:{}},annotations:{},aiReviews:{},sentenceExplanations:{},artworkOverrides:{}}
const song={id:'local-test',title:'原创测试',artist:'UTA',sourceFile:'test.lrc',audioName:'test.wav',lines:[{id:0,start:0,text:'明日も歌う',translation:''}],audioBlob:new Blob([new Uint8Array([1,2,3])],{type:'audio/wav'}),artworkUrl:'data:image/jpeg;base64,/9j/2Q==',artworkChoice:'selected'}
const extras={profile:{nickname:'测试昵称',avatarStored:true},chats:[{id:'c',title:'词义',songId:'local-test',songTitle:'原创测试',updatedAt:1,context:{lyrics:'明日も歌う'},messages:[{role:'user',content:'这里什么意思？'},{role:'assistant',content:'明天也唱歌。'}]}],ai:{base_url:'https://api.deepseek.com',model:'deepseek-flash'},recent:{learn:'local-test',sing:'local-test'}}
test('云备份往返保留音频封面歌词学习资料头像与对话，默认样例不含Key',async()=>{
  const avatar=new Blob([Uint8Array.from([71,73,70,56,57,97])],{type:'image/gif'})
  const file=createCloudBackup(createLearningBackup([song],state),extras,avatar)
  const restored=await inspectCloudBackup(file)
  assert.deepEqual(restored.extras, {...extras,version:1,createdAt:restored.extras.createdAt,coreSize:restored.file.size,avatarSize:6,avatarType:'image/gif'})
  assert.equal(restored.avatar.type,'image/gif')
  assert.deepEqual([...new Uint8Array(await restored.avatar.arrayBuffer())],[71,73,70,56,57,97])
  assert.equal(songsFromLearningBackup(restored)[0].artworkUrl,song.artworkUrl)
  assert.equal(restored.manifest.progress.corrections['local-test:0:0'],'あす')
  assert.ok(!Object.hasOwn(restored.extras.ai,'api_key'))
})
test('明确包含Key的备份可以恢复，截断和无效资料拒绝',async()=>{
  const core=createLearningBackup([song],state),file=createCloudBackup(core,{...extras,ai:{...extras.ai,api_key:'synthetic-not-a-real-key'}})
  assert.equal((await inspectCloudBackup(file)).extras.ai.api_key,'synthetic-not-a-real-key')
  await assert.rejects(inspectCloudBackup(file.slice(0,file.size-1)))
  await assert.rejects(inspectCloudBackup(createCloudBackup(core,{...extras,profile:{nickname:3}})))
  assert.equal((await inspectCloudBackup(core)).manifest.songs.length,1)
})
