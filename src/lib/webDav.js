import { registerPlugin } from '@capacitor/core'
import { DEFAULT_SYNC_SECONDS,syncSeconds } from './webDavSchedule'
import {createLearningBackup} from './learningBackup.js'
import {createCloudBackup} from './cloudBackup.js'
import {createCloudSongAsset,cloudSongDescriptor} from './cloudSongBackup.js'
const native=registerPlugin('UtaWebDav'),credentials=registerPlugin('UtaAiCredential')
const KEY='uta-webdav-v1'
// 原配置没有周期字段，统一按 24 小时补齐。
// export function readWebDavSettings() {try{return {url:'',username:'',auto:false,includeKey:false,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {url:'',username:'',auto:false,includeKey:false}}}
export function readWebDavSettings() {try{return {url:'',username:'',auto:false,includeKey:false,syncSeconds:DEFAULT_SYNC_SECONDS,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {url:'',username:'',auto:false,includeKey:false,syncSeconds:DEFAULT_SYNC_SECONDS}}}
export async function loadWebDavSettings() {const config=readWebDavSettings(),secret=await credentials.load({slot:'webdav'});return {...config,password:secret.value||''}}
export function validateWebDav(config) {let url;try{url=new URL(config.url)}catch{throw new Error('请填写有效的 WebDAV 目录地址。')}if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('请使用不含账号密码参数的 HTTPS 目录地址。');if(!config.username.trim()||!config.password)throw new Error('请填写账号和 WebDAV 应用密码。');return {...config,url:url.href.replace(/\/+$/,'')+'/'}}
// 配置保存后标记待上传，让用户首次开启自动同步时也能备份现有数据。
// export async function saveWebDavSettings(value) {const config=validateWebDav(value),{password,...safe}=config;await credentials.save({slot:'webdav',value:password});localStorage.setItem(KEY,JSON.stringify(safe));window.dispatchEvent(new Event('uta:webdav-settings'))}
// 保存周期后重新开始计时，凭据仍只存入 Android 加密空间。
// export async function saveWebDavSettings(value) {const config=validateWebDav(value),{password,...safe}=config;await credentials.save({slot:'webdav',value:password});localStorage.setItem(KEY,JSON.stringify(safe));markCloudDirty();window.dispatchEvent(new Event('uta:webdav-settings'))}
export async function saveWebDavSettings(value) {const config=validateWebDav(value),{password,...safe}=config;safe.syncSeconds=syncSeconds(config);await credentials.save({slot:'webdav',value:password});localStorage.setItem(KEY,JSON.stringify(safe));localStorage.setItem('uta-webdav-last-check',String(Date.now()));markCloudDirty();window.dispatchEvent(new Event('uta:webdav-settings'))}
export function parseWebDavList(xml,base) {
  const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw new Error('云目录返回内容无效。')
  const root=new URL(base.endsWith('/')?base:base+'/')
  return [...doc.getElementsByTagNameNS('*','response')].flatMap(item=>{
    const href=item.getElementsByTagNameNS('*','href')[0]?.textContent;let url;try{url=new URL(href,root)}catch{return []}
    if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))return []
    const name=decodeURIComponent(url.pathname.slice(root.pathname.length));if(!/^UTA-[A-Za-z0-9_.-]+\.uta-backup$/.test(name))return []
    return [{name,size:Number(item.getElementsByTagNameNS('*','getcontentlength')[0]?.textContent)||0,modified:item.getElementsByTagNameNS('*','getlastmodified')[0]?.textContent||''}]
  }).sort((a,b)=>b.name.localeCompare(a.name))
}
export async function webDavList(config) {const value=validateWebDav(config),result=await native.directory({config:value,list:true,create:true});return parseWebDavList(result.xml,value.url)}
// 旧进度把手机文件准备视为90%，实际 PUT 没有进度；保留旧流程供对照。
async function previousWebDavUpload(config,blob,name,progress=()=>{}) {
  if(blob.size>500*1024*1024)throw new Error('备份超过 500 MB，请减少歌曲后重试。')
  const value=validateWebDav(config),{id}=await native.begin()
  try {for(let offset=0;offset<blob.size;offset+=256*1024){const bytes=new Uint8Array(await blob.slice(offset,offset+256*1024).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));await native.append({id,data:btoa(binary)});progress(Math.min(90,Math.round((offset+bytes.length)/blob.size*90)))}await native.upload({config:value,id,name});progress(100)}finally{await native.release({id}).catch(()=>{})}
}
// 准备、网络上传、等待服务器分别报告，百分比只在服务器成功后到100%。
async function stageBlob(blob,report){
  if(!(blob instanceof Blob)||!blob.size||blob.size>500*1024*1024)throw new Error('文件大小无效或超过500 MB。')
  const {id}=await native.begin()
  try{for(let offset=0;offset<blob.size;offset+=256*1024){const bytes=new Uint8Array(await blob.slice(offset,offset+256*1024).arrayBuffer());let binary='';for(let index=0;index<bytes.length;index+=8192)binary+=String.fromCharCode(...bytes.subarray(index,index+8192));await native.append({id,data:btoa(binary)});report?.((offset+bytes.length)/blob.size,{phase:'prepare',sent:offset+bytes.length,total:blob.size})}return id}
  catch(error){await native.release({id}).catch(()=>{});throw error}
}
async function uploadStaged(value,id,name,report){
  const listener=await native.addListener('transferProgress',event=>{if(event.id===id)report(event.phase==='server' ? .99 : event.sent/event.total*.98,event)})
  try{return await native.upload({config:value,id,name})}finally{await listener.remove()}
}
export async function webDavUpload(config,backup,name,progress=()=>{}){
  const value=validateWebDav(config),started=Date.now();let uploadedBytes=0,reusedSongs=0,uploadedSongs=0,networkMs=0,serverConfirmMs=0,attempts=0
  const accountTransfer=result=>{networkMs+=result.elapsedMs||0;serverConfirmMs+=result.confirmMs||0;attempts+=result.attempts||1;return result}
  // 保留原完整文件上传入口，兼容工具及旧备份测试；产品云端改用分离目录。
  if(backup instanceof Blob){const id=await stageBlob(backup,(ratio,event)=>progress(Math.round(ratio*10),event));try{accountTransfer(await uploadStaged(value,id,name,(ratio,event)=>progress(Math.round(10+ratio*89),event)));uploadedBytes=backup.size}finally{await native.release({id}).catch(()=>{})}}
  else{
    const descriptors=[],records=backup.songs
    if(!Array.isArray(records))throw new Error('云备份歌曲资料无效。')
    for(const [index,record] of records.entries()){
      const report=(ratio,event)=>progress(Math.round((index+ratio)/(records.length+1)*99),{...event,title:record.title})
      let asset
      if(record.cloudPending){
        if(record.cloudAsset?.origin&&record.cloudAsset.origin!==value.url)throw new Error(`《${record.title}》尚未下载，不能迁移到另一个云目录。请先下载该歌曲。`)
        asset=record.cloudAsset
        const info=await native.stat({config:value,name:asset.name});if(!info.exists)throw new Error(`《${record.title}》的云歌曲文件已不存在，请从原设备重新上传。`)
        if(info.size>=0&&info.size!==asset.size)throw new Error('云歌曲文件大小异常，未保存新备份。')
        reusedSongs++
      }else{
        const blob=createCloudSongAsset(record),id=await stageBlob(blob,(ratio,event)=>report(ratio*.1,event))
        try{
          const {sha256}=await native.digest({id});asset={name:`_uta-song-${sha256}.uta-backup`,size:blob.size,sha256}
          report(.1,{phase:'check',sent:0,total:blob.size})
          const info=await native.stat({config:value,name:asset.name})
          if(info.exists){if(info.size>=0&&info.size!==blob.size)throw new Error('已有云歌曲文件大小异常。');reusedSongs++}
          else{accountTransfer(await uploadStaged(value,id,asset.name,(ratio,event)=>report(.1+ratio*.9,event)));uploadedBytes+=blob.size;uploadedSongs++}
        }finally{await native.release({id}).catch(()=>{})}
      }
      // 目录不保存服务器账号密码，也不保存歌曲原歌词；只有音频附件包含完整歌曲。
      descriptors.push(cloudSongDescriptor(record,{name:asset.name,size:asset.size,sha256:asset.sha256}));report(1,{phase:'done'})
    }
    const core=createLearningBackup([],backup.state),catalog=createCloudBackup(core,{...backup.extras,catalog:{version:1,songs:descriptors}},backup.avatar)
    const id=await stageBlob(catalog,(ratio,event)=>progress(Math.round((records.length+ratio*.1)/(records.length+1)*99),event))
    try{accountTransfer(await uploadStaged(value,id,name,(ratio,event)=>progress(Math.round((records.length+.1+ratio*.9)/(records.length+1)*99),event)));uploadedBytes+=catalog.size}finally{await native.release({id}).catch(()=>{})}
  }
  const result={uploadedBytes,reusedSongs,uploadedSongs,elapsedMs:Date.now()-started,networkMs,serverConfirmMs,attempts}
  // 诊断只保存字节、时间和复用数量，不保存网址、账号、密钥或歌词。
  localStorage.setItem('uta-webdav-last-transfer',JSON.stringify(result));progress(100,{phase:'done',...result});return result
}
export async function webDavDownload(config,name,progress=()=>{},options={}) {
  const value=validateWebDav(config),{id,size}=await native.download({config:value,name}),parts=[]
  // 旧流程只拼接数据，不核对每块长度，桥接偏移异常时仍显示下载完成。
  // try {for(let offset=0;offset<size;offset+=256*1024){const {data}=await native.read({id,offset});parts.push(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));progress(Math.round(Math.min(offset+256*1024,size)/size*100))}return new Blob(parts,{type:'application/octet-stream'})}finally{await native.release({id}).catch(()=>{})}
  try {
    // 下载单曲前在原生文件上核对完整SHA-256，避免损坏或错误附件写入歌曲库。
    if(options.sha256&&(await native.digest({id})).sha256!==options.sha256)throw new Error('云歌曲校验失败，未保存，请重新上传该歌曲。')
    if(!Number.isSafeInteger(size)||size<=0||size>500*1024*1024)throw new Error('云备份文件大小无效。')
    for(let offset=0;offset<size;offset+=256*1024){
      const {data}=await native.read({id,offset})
      const chunk=Uint8Array.from(atob(data),c=>c.charCodeAt(0))
      // 最后一块按剩余大小校验，不允许缺失或重复多余字节进入备份解析。
      if(chunk.length!==Math.min(256*1024,size-offset))throw new Error('云备份下载不完整，请重试。')
      parts.push(chunk)
      progress(Math.round((offset+chunk.length)/size*100))
    }
    const blob=new Blob(parts,{type:'application/octet-stream'});blob.webDavOrigin=value.url;return blob
  }finally{await native.release({id}).catch(()=>{})}
}
// 所有入口共用锁，避免自动备份与手动下载同时操作本机数据。
let running=false
export async function withWebDavLock(task) {if(running)throw new Error('正在进行云端操作，请稍后。');running=true;try{return await task()}finally{running=false}}
export function markCloudDirty(){localStorage.setItem('uta-cloud-revision-v1',crypto.randomUUID())}
export function backupName(){return `UTA-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}.uta-backup`}
