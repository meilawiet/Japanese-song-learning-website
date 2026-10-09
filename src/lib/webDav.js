import { registerPlugin } from '@capacitor/core'
import { DEFAULT_SYNC_SECONDS,syncSeconds } from './webDavSchedule'
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
export async function webDavUpload(config,blob,name,progress=()=>{}) {
  if(blob.size>500*1024*1024)throw new Error('备份超过 500 MB，请减少歌曲后重试。')
  const value=validateWebDav(config),{id}=await native.begin()
  try {for(let offset=0;offset<blob.size;offset+=256*1024){const bytes=new Uint8Array(await blob.slice(offset,offset+256*1024).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));await native.append({id,data:btoa(binary)});progress(Math.min(90,Math.round((offset+bytes.length)/blob.size*90)))}await native.upload({config:value,id,name});progress(100)}finally{await native.release({id}).catch(()=>{})}
}
export async function webDavDownload(config,name,progress=()=>{}) {
  const value=validateWebDav(config),{id,size}=await native.download({config:value,name}),parts=[]
  // 旧流程只拼接数据，不核对每块长度，桥接偏移异常时仍显示下载完成。
  // try {for(let offset=0;offset<size;offset+=256*1024){const {data}=await native.read({id,offset});parts.push(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));progress(Math.round(Math.min(offset+256*1024,size)/size*100))}return new Blob(parts,{type:'application/octet-stream'})}finally{await native.release({id}).catch(()=>{})}
  try {
    if(!Number.isSafeInteger(size)||size<=0||size>500*1024*1024)throw new Error('云备份文件大小无效。')
    for(let offset=0;offset<size;offset+=256*1024){
      const {data}=await native.read({id,offset})
      const chunk=Uint8Array.from(atob(data),c=>c.charCodeAt(0))
      // 最后一块按剩余大小校验，不允许缺失或重复多余字节进入备份解析。
      if(chunk.length!==Math.min(256*1024,size-offset))throw new Error('云备份下载不完整，请重试。')
      parts.push(chunk)
      progress(Math.round((offset+chunk.length)/size*100))
    }
    return new Blob(parts,{type:'application/octet-stream'})
  }finally{await native.release({id}).catch(()=>{})}
}
// 所有入口共用锁，避免自动备份与手动下载同时操作本机数据。
let running=false
export async function withWebDavLock(task) {if(running)throw new Error('正在进行云端操作，请稍后。');running=true;try{return await task()}finally{running=false}}
export function markCloudDirty(){localStorage.setItem('uta-cloud-revision-v1',crypto.randomUUID())}
export function backupName(){return `UTA-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}.uta-backup`}
