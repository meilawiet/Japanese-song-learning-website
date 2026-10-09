import {useCallback,useEffect,useRef,useState} from 'react'
import {CapacitorHttp} from '@capacitor/core'
import {App} from '@capacitor/app'
import {Browser} from '@capacitor/browser'
import {Download,RefreshCw,X} from 'lucide-react'
import {UPDATE_API,selectAppRelease} from '../lib/appUpdate'

// 启动时静默检测；新版本只提示，必须由用户主动点击后才打开下载页面。
export function useAppUpdates(enabled) {
  const [version,setVersion]=useState(''),[checking,setChecking]=useState(false),[error,setError]=useState(''),[release,setRelease]=useState(null),[prompt,setPrompt]=useState(false)
  const running=useRef(false)
  const check=useCallback(async()=>{
    if(!enabled||running.current)return
    running.current=true;setChecking(true);setError('')
    try{
      const info=await App.getInfo();setVersion(info.version)
      const response=await CapacitorHttp.get({url:UPDATE_API,headers:{Accept:'application/vnd.github+json'},connectTimeout:10000,readTimeout:10000})
      if(response.status===404){setRelease({available:false,message:'暂未发布可用的更新。'});return}
      if(response.status===403||response.status===429)throw new Error('更新检查过于频繁，请稍后重试。')
      if(response.status!==200)throw new Error('检测更新失败，请检查网络后重试。')
      const result=selectAppRelease(typeof response.data==='string'?JSON.parse(response.data):response.data,info.version)
      setRelease(result);if(result.newer)setPrompt(true)
    }catch{setError('检测更新失败，请检查网络或稍后重试。')}
    finally{running.current=false;setChecking(false)}
  },[enabled])
  useEffect(()=>{if(enabled)check()},[enabled,check])
  const download=async()=>{try{await Browser.open({url:release.url});setPrompt(false)}catch{setError('无法打开下载页面，请稍后重试。')}}
  return {version,checking,error,release,prompt,check,download,dismiss:()=>setPrompt(false)}
}
export function AboutPanel({updates}) {
  return <section className="settings-content about-panel"><h3>UTA</h3><p>当前版本 {updates.version||'读取中…'}</p><button className="about-check-update" type="button" disabled={updates.checking} onClick={updates.check}><span><RefreshCw size={19}/>检测更新</span><span>{updates.checking?'检测中…':'›'}</span></button>{updates.error?<p role="alert">{updates.error}</p>:updates.release&&<p role="status">{updates.release.message}{updates.release.newer?` ${updates.release.version}`:''}</p>}{updates.release?.newer&&<button className="about-download-update" type="button" onClick={updates.download}><Download size={17}/>下载更新</button>}<small>每次启动自动检测，是否更新由你决定。</small></section>
}
export function AppUpdatePrompt({updates}) {
  // 更新提示在设置页之上，系统返回优先关闭提示，避免同时关闭下层窗口。
  useEffect(()=>{if(!updates.prompt)return;const back=event=>{event.preventDefault();event.stopImmediatePropagation();updates.dismiss()};window.addEventListener('uta:navigate-back',back,true);return()=>window.removeEventListener('uta:navigate-back',back,true)},[updates.prompt])
  if(!updates.prompt)return null
  return <div className="app-update-backdrop" role="presentation" onClick={updates.dismiss}><section className="app-update-dialog" role="dialog" aria-modal="true" aria-label="发现新版本" onClick={event=>event.stopPropagation()}><header><h3>发现新版本 {updates.release.version}</h3><button type="button" aria-label="关闭更新提示" onClick={updates.dismiss}><X size={22}/></button></header>{updates.release.notes&&<p className="app-update-notes">{updates.release.notes}</p>}<p>下载后按手机提示安装，是否更新由你决定。</p>{updates.error&&<p role="alert">{updates.error}</p>}<footer><button type="button" onClick={updates.dismiss}>暂不更新</button><button type="button" onClick={updates.download}>下载更新</button></footer></section></div>
}
