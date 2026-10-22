import test from 'node:test'
import assert from 'node:assert/strict'
import {parseLyricDocument,hasLyricTimeline,orderLyricLines} from '../src/lib/lyricDocument.js'
import {createLearningBackup,inspectLearningBackup,songsFromLearningBackup} from '../src/lib/learningBackup.js'
// 原整曲云附件导入保留对照。
import {cloudSongDescriptor,pendingCloudSongs} from '../src/lib/cloudSongBackup.js'
import {rankLyricResults,searchLyricsSources} from '../src/lib/lyricSearch.js'
import {parseLrcFile} from '../src/lib/localSongStore.js'

const state={progress:{learnedBySong:{},reviewItems:[],favoriteSongIds:[],corrections:{},meaningOverrides:{}},annotations:{},aiReviews:{},sentenceExplanations:{}}
const lyricSong=()=>({id:'local-lyrics-test',title:'原创测试',artist:'UTA',sourceFile:'test.txt',lyricsOnly:true,audioBlob:null,audioName:'',lines:parseLyricDocument('庭で歌う\nRead this line').lines})
test('无时间轴、任意扩展名、英文原文不被丢弃；零秒与未填写时间不同',async()=>{
  const file=new File(['庭で歌う\nRead this line'],'测试.custom',{type:'text/plain'})
  const parsed=await parseLrcFile(file)
  assert.deepEqual(parsed.lines.map(line=>line.start),[null,null])
  assert.equal(parsed.lines[1].text,'Read this line')
  assert.equal(hasLyricTimeline(parsed),false)
  const timed=parseLyricDocument('[00:00.000]庭で歌う\n[00:02.000]次の行')
  assert.equal(hasLyricTimeline(timed),true)
  const partial=[{start:5},{start:null},{start:1}]
  assert.deepEqual(orderLyricLines(partial),partial)
})
test('UtaTen结构化假名与罗马音被保留，不把注音并入显示原文',()=>{
  const parsed=parseLyricDocument(JSON.stringify({format:'uta-annotated-lyrics',title:'原创',lines:[{text:'庭で',segments:[{surface:'庭',kana:'にわ'},{surface:'で'}],romaji:'niwa de'}]}))
  assert.equal(parsed.lines[0].text,'庭（にわ）で')
  assert.equal(parsed.lines[0].romaji,'niwa de')
  assert.equal(parsed.lines[0].start,null)
})
test('纯歌词本地备份与云歌曲附件往返，不混淆尚未下载和没有音频',async()=>{
  const song=lyricSong(),blob=createLearningBackup([song],state),inspection=await inspectLearningBackup(blob)
  assert.equal(inspection.manifest.version,2);assert.equal(inspection.audioBytes,0)
  const [restored]=songsFromLearningBackup(inspection)
  assert.equal(restored.audioBlob,null);assert.equal(restored.lyricsOnly,true);assert.equal(restored.lines[0].start,null)
  // 新目录直接包含纯歌词，无需生成或下载任何音频附件。
  const [downloaded]=pendingCloudSongs({version:2,songs:[cloudSongDescriptor(song,null)]})
  assert.equal(downloaded.cloudPending,false);assert.equal(downloaded.audioBlob,null);assert.equal(downloaded.lines[0].text,song.lines[0].text)
  // 旧整曲方式：const asset=createCloudSongAsset(song),sha256=Buffer.from(await crypto.subtle.digest('SHA-256',await asset.arrayBuffer())).toString('hex')
  // 旧整曲方式：const [pending]=pendingCloudSongs({version:1,songs:[cloudSongDescriptor(song,{name:`_uta-song-${sha256}.uta-backup`,size:asset.size,sha256})]})
  // 旧整曲方式：assert.equal(pending.cloudPending,true)
  // 旧整曲方式：const downloaded=await readCloudSongAsset(asset,pending)
  // 旧整曲方式：assert.equal(downloaded.cloudPending,false);assert.equal(downloaded.audioBlob,null);assert.equal(downloaded.lines[0].text,song.lines[0].text)
  assert.throws(()=>createLearningBackup([{...song,lyricsOnly:false}],state),/缺少音频/)
  assert.throws(()=>createLearningBackup([{...song,cloudPending:true}],state),/尚未下载/)
})
test('混合搜索限定已配置来源，某源失败不影响其他结果，注音优先且预取有限',async()=>{
  const calls=[]
  const result=await searchLyricsSources([{name:'自选A',adapter:'utaten'},{name:'自选B',adapter:'lrclib'},{name:'重复B',adapter:'lrclib'},{name:'失败源',adapter:'kuwo'}],'原创',null,{
    search:async provider=>{calls.push(provider);if(provider==='kuwo')throw new Error('不可用');return [{id:provider+':1',provider,title:'原创',lyrics:provider==='lrclib'?'纯文本':undefined}]},
    read:async record=>({...record,lyrics:'注音文件',trackSummary:{kana:1,romaji:1}}),
  })
  assert.deepEqual(calls,['utaten','lrclib','kuwo'])
  assert.equal(result.records[0].provider,'utaten');assert.equal(result.errors.length,1)
  assert.deepEqual(rankLyricResults([{id:'plain',lyrics:'普通'},{id:'yes',trackSummary:{romaji:3}}]).map(row=>row.id),['yes','plain'])
})

// 音频拆分前的代码行保留对照（不执行）。
// import {createCloudSongAsset,cloudSongDescriptor,pendingCloudSongs,readCloudSongAsset} from '../src/lib/cloudSongBackup.js'
//   const asset=createCloudSongAsset(song),sha256=Buffer.from(await crypto.subtle.digest('SHA-256',await asset.arrayBuffer())).toString('hex')
//   const [pending]=pendingCloudSongs({version:1,songs:[cloudSongDescriptor(song,{name:`_uta-song-${sha256}.uta-backup`,size:asset.size,sha256})]})
//   assert.equal(pending.cloudPending,true)
//   const downloaded=await readCloudSongAsset(asset,pending)
