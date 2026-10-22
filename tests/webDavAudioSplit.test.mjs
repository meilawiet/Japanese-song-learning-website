import {before,after,test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createServer} from 'vite'
import {inspectCloudBackup} from '../src/lib/cloudBackup.js'
import {readCloudAudioAsset,reuseCatalogAudio} from '../src/lib/cloudSongBackup.js'

let server,upload,download,digest,previousStorage
const config={url:'https://example.com/dav/UTA/',username:'qa',password:'synthetic-test-only'}
const state={progress:{learnedBySong:{},reviewItems:[],favoriteSongIds:[],corrections:{},meaningOverrides:{}},annotations:{},aiReviews:{},sentenceExplanations:{},artworkOverrides:{}}
const extras={profile:{nickname:'原创测试'},chats:[],ai:{base_url:'https://example.com',model:'test'}}
const song=(id,value)=>({id:'local-'+id,title:id,artist:'UTA',audioName:id+'.wav',audioBlob:new Blob([new Uint8Array(300111).fill(value)],{type:'audio/wav'}),lines:[{id:0,start:1,text:'原创歌词'+id,translation:'测试',romaji:'test'}]})
const snapshot=songs=>({songs,state,extras})
before(async()=>{
  server=await createServer({server:{middlewareMode:true,watch:{ignored:['**/.tools/**','**/server/.venv/**']}},appType:'custom',logLevel:'silent'})
  const module=await server.ssrLoadModule('/src/lib/webDav.js');upload=module.webDavUpload;download=module.webDavDownload;digest=module.digestCloudAudio
  previousStorage=globalThis.localStorage;globalThis.localStorage={setItem(){}}
})
after(async()=>{await server?.close();if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage})

// 用真实分块、摘要和原始字节执行产品传输函数；替代原生桥，不触碰真实云盘或用户歌曲。
function transport(){
  let serial=0
  const remote=new Map(),temporary=new Map(),puts=[],listeners=new Set(),reads=[]
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
  const bridge={remote,temporary,puts,listeners,reads,failName:'',shortRead:false,
    async begin(){const id=String(++serial);temporary.set(id,Buffer.alloc(0));return {id}},
    async append({id,data}){temporary.set(id,Buffer.concat([temporary.get(id),Buffer.from(data,'base64')]))},
    async digest({id}){return {sha256:hash(temporary.get(id))}},
    async release({id}){temporary.delete(id)},
    async stat({name}){return {exists:remote.has(name),size:remote.get(name)?.length??-1}},
    async addListener(name,handler){listeners.add(handler);return {remove:async()=>listeners.delete(handler)}},
    async upload({id,name}){
      if(name===bridge.failName)throw new Error('模拟网络中断')
      assert.ok(!remote.has(name),'上传不应覆盖已有云文件')
      const bytes=temporary.get(id);remote.set(name,Buffer.from(bytes));puts.push({name,bytes:bytes.length})
      for(const listener of listeners)listener({id,phase:'upload',sent:bytes.length,total:bytes.length})
      return {size:bytes.length,elapsedMs:1,confirmMs:1,attempts:1}
    },
    async download({name}){if(!remote.has(name))throw Error('404');const {id}=await bridge.begin();temporary.set(id,Buffer.from(remote.get(name)));return {id,size:remote.get(name).length}},
    async read({id,offset}){reads.push(offset);const chunk=temporary.get(id).subarray(offset,offset+256*1024);return {data:(bridge.shortRead?chunk.subarray(1):chunk).toString('base64')}},
  }
  return bridge
}

test('abc到bcde只上传de音频，修改bc歌词/时间/封面/歌名不重传，a及历史快照保留',async()=>{
  const bridge=transport(),a=song('a',1),b=song('b',2),c=song('c',3),d=song('d',4),e=song('e',5)
  const first=await upload(config,snapshot([a,b,c]),'UTA-first.uta-backup',()=>{},bridge)
  assert.equal(first.uploadedSongs,3);assert.equal(first.reusedSongs,0)
  const firstFile=await inspectCloudBackup(new Blob([bridge.remote.get('UTA-first.uta-backup')])),aAudio=firstFile.manifest.songs[0].cloudAudio.name
  const changedB={...b,title:'b改名',artist:'新歌手',audioName:'重命名.wav',artworkUrl:'data:image/jpeg;base64,/9j/2Q==',lines:[{...b.lines[0],start:1.2,timestampOriginalStart:1,text:'更新歌词',translation:'更新译文',romaji:'new'}]}
  bridge.puts.length=0
  const second=await upload(config,snapshot([changedB,c,d,e]),'UTA-second.uta-backup',()=>{},bridge)
  assert.equal(second.uploadedSongs,2);assert.equal(second.reusedSongs,2)
  assert.equal(bridge.puts.filter(p=>p.name.endsWith('.bin')).length,2)
  assert.ok(bridge.remote.has(aAudio));assert.ok(bridge.remote.has('UTA-first.uta-backup'))
  const file=await download(config,'UTA-second.uta-backup',()=>{},{},bridge),inspection=await inspectCloudBackup(file)
  assert.deepEqual(inspection.manifest.songs.map(item=>item.id),['local-b','local-c','local-d','local-e'])
  assert.deepEqual(inspection.manifest.songs[0].lines,changedB.lines)
  const rawAudio=bridge.remote.get(inspection.manifest.songs[0].cloudAudio.name)
  assert.deepEqual(rawAudio,Buffer.from(await b.audioBlob.arrayBuffer()))
  bridge.puts.length=0
  await upload(config,{...snapshot([changedB,c,d,e]),state:{...state,progress:{...state.progress,learnedBySong:{'local-b':[0]}}}},'UTA-progress.uta-backup',()=>{},bridge)
  assert.equal(bridge.puts.length,1);assert.equal(bridge.puts[0].name,'UTA-progress.uta-backup')
  assert.equal(bridge.temporary.size,0);assert.equal(bridge.listeners.size,0)
})

test('只有音频字节变化或云端音频缺失才补传，重选同内容文件与不同歌曲共用同音频不重传',async()=>{
  const bridge=transport(),b=song('b',2)
  await upload(config,snapshot([b]),'UTA-initial.uta-backup',()=>{},bridge)
  const same={...b,id:'local-copy',title:'不同歌曲条目',audioName:'another.mp3',audioBlob:new Blob([await b.audioBlob.arrayBuffer()],{type:'audio/mpeg'})}
  bridge.puts.length=0
  const reused=await upload(config,snapshot([b,same]),'UTA-same.uta-backup',()=>{},bridge)
  assert.equal(reused.uploadedSongs,0);assert.equal(reused.reusedSongs,2);assert.equal(bridge.puts.length,1)
  const replaced={...b,audioBlob:song('replacement',7).audioBlob}
  const changed=await upload(config,snapshot([replaced]),'UTA-replaced.uta-backup',()=>{},bridge)
  assert.equal(changed.uploadedSongs,1)
  const info=await inspectCloudBackup(new Blob([bridge.remote.get('UTA-replaced.uta-backup')]))
  bridge.remote.delete(info.manifest.songs[0].cloudAudio.name)
  assert.equal((await upload(config,snapshot([replaced]),'UTA-repair.uta-backup',()=>{},bridge)).uploadedSongs,1)
})

test('分块下载原音频后SHA256校验，恢复复用音频但更新歌词；等长损坏和分块缺失均不保存',async()=>{
  const bridge=transport(),b=song('b',2)
  await upload(config,snapshot([b]),'UTA-download.uta-backup',()=>{},bridge)
  const file=await download(config,'UTA-download.uta-backup',()=>{},{},bridge),inspection=await inspectCloudBackup(file),pending=inspection.manifest.songs[0],ref=pending.cloudAudio
  const audio=await download(config,ref.name,()=>{},{sha256:ref.sha256},bridge),restored=await readCloudAudioAsset(audio,pending)
  assert.deepEqual(Buffer.from(await restored.audioBlob.arrayBuffer()),Buffer.from(await b.audioBlob.arrayBuffer()))
  assert.ok(bridge.reads.includes(256*1024));assert.equal(restored.cloudPending,false)
  const incoming={...pending,lines:[{...pending.lines[0],start:1.4,text:'新快照歌词'}]}
  const [reused]=await reuseCatalogAudio([incoming],[b],blob=>digest(blob,bridge))
  assert.equal(reused.cloudPending,false);assert.deepEqual(reused.lines,incoming.lines)
  const bad=Buffer.from(bridge.remote.get(ref.name));bad[0]^=1;bridge.remote.set(ref.name,bad)
  await assert.rejects(download(config,ref.name,()=>{},{sha256:ref.sha256},bridge),/校验失败/)
  bridge.shortRead=true
  await assert.rejects(download(config,'UTA-download.uta-backup',()=>{},{},bridge),/不完整/)
  assert.equal(bridge.temporary.size,0)
})

test('中断不提交新快照且释放临时文件，纯歌词/空库不上传音频，待下载音频可复用但不跨目录冒用',async()=>{
  const bridge=transport(),b=song('b',2),hash=await digest(b.audioBlob,bridge)
  bridge.failName='_uta-audio-'+hash+'.bin'
  await assert.rejects(upload(config,snapshot([b]),'UTA-failed.uta-backup',()=>{},bridge),/中断/)
  assert.ok(!bridge.remote.has('UTA-failed.uta-backup'));assert.equal(bridge.temporary.size,0);assert.equal(bridge.listeners.size,0)
  bridge.failName=''
  const pure={...b,lyricsOnly:true,audioBlob:null,audioName:'',lines:[{...b.lines[0],start:null}]}
  assert.equal((await upload(config,snapshot([pure]),'UTA-lyrics.uta-backup',()=>{},bridge)).uploadedSongs,0)
  assert.equal((await upload(config,snapshot([]),'UTA-empty.uta-backup',()=>{},bridge)).uploadedSongs,0)
  await upload(config,snapshot([b]),'UTA-source.uta-backup',()=>{},bridge)
  const inspection=await inspectCloudBackup(await download(config,'UTA-source.uta-backup',()=>{},{},bridge))
  assert.equal((await upload(config,snapshot(inspection.manifest.songs),'UTA-pending.uta-backup',()=>{},bridge)).reusedSongs,1)
  await assert.rejects(upload({...config,url:'https://other.example/dav/'},snapshot(inspection.manifest.songs),'UTA-wrong-origin.uta-backup',()=>{},bridge),/另一个云目录/)
  assert.ok(!bridge.remote.has('UTA-wrong-origin.uta-backup'))
})
