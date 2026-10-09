import { useEffect,useRef } from 'react'
import { readWebDavSettings,loadWebDavSettings,webDavList,webDavUpload,withWebDavLock,backupName } from '../lib/webDav'
import { syncSeconds,syncDue } from '../lib/webDavSchedule'
// 自动同步仅在用户开启且应用可见时运行，不静默覆盖本机。
/* 保留原来固定每分钟检查的实现，供对照。
export default function WebDavAutoSync({onCreateBackup,onNotice}) {
  const create=useRef(onCreateBackup),notice=useRef(onNotice);create.current=onCreateBackup;notice.current=onNotice
  useEffect(()=>{
    let active=true,busy=false
    async function tick(){const settings=readWebDavSettings(),revision=localStorage.getItem('uta-cloud-revision-v1');if(!active||busy||document.visibilityState!=='visible'||!settings.auto||!settings.url||!revision||revision===localStorage.getItem('uta-webdav-last-upload-revision'))return;busy=true
      try{await withWebDavLock(async()=>{const config=await loadWebDavSettings();if(!config.auto||!active)return;await webDavList(config);const blob=await create.current(config.includeKey);await webDavUpload(config,blob,backupName());localStorage.setItem('uta-webdav-last-upload-revision',revision);notice.current('数据已自动备份到 WebDAV。')})}catch(failure){notice.current(`自动同步失败：${failure.message}`)}finally{busy=false}}
    const timer=setInterval(tick,60000);return()=>{active=false;clearInterval(timer)}
  },[]);return null
}
*/
// 按用户配置的秒数检查变更，记住上次检查时间；重新打开应用后补做已到期检查。
export default function WebDavAutoSync({onCreateBackup,onNotice}) {
  const create=useRef(onCreateBackup),notice=useRef(onNotice);create.current=onCreateBackup;notice.current=onNotice
  useEffect(()=>{
    let active=true,busy=false,timer
    const checkKey='uta-webdav-last-check'
    function schedule(){
      clearTimeout(timer);if(!active)return
      const config=readWebDavSettings(),seconds=syncSeconds(config)
      if(!config.auto||!seconds||!config.url)return
      let last=Number(localStorage.getItem(checkKey))
      if(!Number.isFinite(last)||last<=0){last=Date.now();localStorage.setItem(checkKey,String(last))}
      // 最长一分钟重新计算一次等待时间，避免系统定时器溢出；实际联网仍按用户的周期执行。
      const wait=document.visibilityState==='visible'?Math.max(100,Math.min(60000,last+seconds*1000-Date.now())):60000
      timer=setTimeout(tick,wait)
    }
    async function tick(){
      if(!active)return
      const settings=readWebDavSettings(),last=Number(localStorage.getItem(checkKey))
      if(busy||document.visibilityState!=='visible'||!syncDue(settings,last)){schedule();return}
      localStorage.setItem(checkKey,String(Date.now()))
      const revision=localStorage.getItem('uta-cloud-revision-v1')
      if(!revision||revision===localStorage.getItem('uta-webdav-last-upload-revision')){schedule();return}
      busy=true
      try{await withWebDavLock(async()=>{const config=await loadWebDavSettings();if(!config.auto||!syncSeconds(config)||!active)return;await webDavList(config);const blob=await create.current(config.includeKey);await webDavUpload(config,blob,backupName());localStorage.setItem('uta-webdav-last-upload-revision',revision);if(active)notice.current('数据已自动备份到 WebDAV。')})}
      catch(failure){if(active)notice.current(`自动同步失败：${failure.message}`)}finally{busy=false;schedule()}
    }
    schedule();window.addEventListener('uta:webdav-settings',schedule);document.addEventListener('visibilitychange',schedule)
    return()=>{active=false;clearTimeout(timer);window.removeEventListener('uta:webdav-settings',schedule);document.removeEventListener('visibilitychange',schedule)}
  },[])
  return null
}
