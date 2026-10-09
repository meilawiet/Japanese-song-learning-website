import {useCallback,useEffect,useRef,useState} from 'react'
// 原生更新模块负责下载、校验与安装器调用，页面负责展示进度和用户选择。
// import {CapacitorHttp} from '@capacitor/core'
import {CapacitorHttp,registerPlugin} from '@capacitor/core'
import {App} from '@capacitor/app'
import {Browser} from '@capacitor/browser'
import {Download,RefreshCw,X} from 'lucide-react'
import {UPDATE_API,selectAppRelease} from '../lib/appUpdate'
const installer=registerPlugin('UtaAppUpdate')

// 启动时静默检测；新版本只提示，必须由用户主动点击后才打开下载页面。
export function useAppUpdates(enabled) {
  const [version,setVersion]=useState(''),[checking,setChecking]=useState(false),[error,setError]=useState(''),[release,setRelease]=useState(null),[prompt,setPrompt]=useState(false)
  const running=useRef(false)
  // 已下载的完整安装包可以在重新进入“关于”后继续安装，不必再次下载。
  const [downloadState,setDownloadState]=useState({busy:false,progress:0,ready:false})
  const [installNotice,setInstallNotice]=useState('')
  useEffect(()=>{
    if(!enabled)return undefined
    let alive=true,listener
    installer.status().then(value=>{if(alive)setDownloadState(value)}).catch(()=>{})
    installer.addListener('progress',value=>{if(alive)setDownloadState(old=>({...old,progress:value.progress}))}).then(value=>{if(alive)listener=value;else value.remove()})
    return()=>{alive=false;listener?.remove()}
  },[enabled])
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
  // 旧流程依赖浏览器下载列表打开 APK，部分手机在 Edge 中点击后没有反应。
  // const download=async()=>{try{await Browser.open({url:release.url});setPrompt(false)}catch{setError('无法打开下载页面，请稍后重试。')}}
  const openDownloadPage=async()=>{try{await Browser.open({url:release.url})}catch{setError('无法打开下载页面，请稍后重试。')}}
  const download=async()=>{
    if(downloadState.busy)return
    setError('');setInstallNotice('');setDownloadState(old=>({...old,busy:true,progress:0}))
    try{const result=await installer.download({url:release.url,sha256:release.sha256});if(result.cancelled){setDownloadState(old=>({...old,busy:false}));setInstallNotice('已取消下载，可以选择已下载的 APK。');return}setDownloadState({...result,busy:false,progress:100});setInstallNotice('下载完成，请选择安装方式。')}
    catch(failure){setError(failure.message||'下载失败，请重试或使用浏览器下载。');setDownloadState(old=>({...old,busy:false}))}
  }
  const install=async mode=>{setError('');setInstallNotice('');try{const result=await installer.install({mode});if(result.permissionRequired)setInstallNotice('请允许 UTA 安装应用，返回后再次点击安装。')}catch(failure){setError(failure.message||'无法启动安装器，请选择其他安装方式。')}}
  const saveInstallerFile=async()=>{setError('');try{const result=await installer.saveFile();if(!result.cancelled)setInstallNotice('安装包已保存，可用 MT 或其他文件管理器打开安装。')}catch(failure){setError(failure.message||'安装包保存失败，请重试。')}}
  // 浏览器下载完成但打不开时，可以选择现有文件，不必重新下载。
  const chooseInstallerFile=async()=>{setError('');try{const result=await installer.chooseFile({sha256:release?.sha256||''});if(!result.cancelled){setDownloadState({...result,busy:false,progress:100});setInstallNotice('安装包校验通过，请选择安装方式。')}}catch(failure){setError(failure.message||'无法读取安装包，请重试。')}}
  const cancelDownload=async()=>{try{await installer.cancel()}catch{setError('取消下载失败，请稍后重试。')}}
  // return {version,checking,error,release,prompt,check,download,dismiss:()=>setPrompt(false)}
  return {version,checking,error,release,prompt,check,download,downloadState,installNotice,install,saveInstallerFile,chooseInstallerFile,cancelDownload,openDownloadPage,dismiss:()=>setPrompt(false)}
}
// 两种安装入口共享同一个完整安装包；系统选择列表只展示手机已注册的 APK 处理程序。
function UpdateInstallControls({updates}) {
  const state=updates.downloadState||{}
  return <div className="update-install-controls">{state.busy?<><p role="status">正在下载安装包… {state.progress}%</p><button type="button" onClick={updates.cancelDownload}>取消下载</button></>:state.ready?<><p>已下载 UTA {state.version}</p><button type="button" onClick={()=>updates.install('system')}>系统安装器</button><button type="button" onClick={()=>updates.install('chooser')}>选择其他安装方式</button><button type="button" onClick={updates.saveInstallerFile}>保存安装包到文件夹</button></>:null}{updates.installNotice&&<p role="status">{updates.installNotice}</p>}{!state.busy&&<button type="button" onClick={updates.chooseInstallerFile}>选择已下载的 APK</button>}{updates.release?.available&&!state.busy&&<button type="button" onClick={updates.openDownloadPage}>使用浏览器下载</button>}</div>
}
export function AboutPanel({updates}) {
  // 旧布局只提供浏览器下载按钮；新增下载进度和安装方式选择。
  // return <section className="settings-content about-panel"><h3>UTA</h3><p>当前版本 {updates.version||'读取中…'}</p><button className="about-check-update" type="button" disabled={updates.checking} onClick={updates.check}><span><RefreshCw size={19}/>检测更新</span><span>{updates.checking?'检测中…':'›'}</span></button>{updates.error?<p role="alert">{updates.error}</p>:updates.release&&<p role="status">{updates.release.message}{updates.release.newer?` ${updates.release.version}`:''}</p>}{updates.release?.newer&&<button className="about-download-update" type="button" onClick={updates.download}><Download size={17}/>下载更新</button>}<small>每次启动自动检测，是否更新由你决定。</small></section>
  const ready=updates.downloadState?.ready&&updates.downloadState.version===updates.release?.version?.replace(/^v/,'')
  return <section className="settings-content about-panel"><h3>UTA</h3><p>当前版本 {updates.version||'读取中…'}</p><button className="about-check-update" type="button" disabled={updates.checking} onClick={updates.check}><span><RefreshCw size={19}/>检测更新</span><span>{updates.checking?'检测中…':'›'}</span></button>{updates.error?<p role="alert">{updates.error}</p>:updates.release&&<p role="status">{updates.release.message}{updates.release.newer?` ${updates.release.version}`:''}</p>}{updates.release?.newer&&!ready&&<button className="about-download-update" type="button" disabled={updates.downloadState?.busy} onClick={updates.download}><Download size={17}/>下载更新包</button>}<UpdateInstallControls updates={updates}/><small>每次启动自动检测，是否更新由你决定。</small></section>
}
export function AppUpdatePrompt({updates}) {
  // 更新提示在设置页之上，系统返回优先关闭提示，避免同时关闭下层窗口。
  useEffect(()=>{if(!updates.prompt)return;const back=event=>{event.preventDefault();event.stopImmediatePropagation();updates.dismiss()};window.addEventListener('uta:navigate-back',back,true);return()=>window.removeEventListener('uta:navigate-back',back,true)},[updates.prompt])
  if(!updates.prompt)return null
  // 旧弹窗保留作对照：下载直接跳转浏览器。
  // return <div className="app-update-backdrop" role="presentation" onClick={updates.dismiss}><section className="app-update-dialog" role="dialog" aria-modal="true" aria-label="发现新版本" onClick={event=>event.stopPropagation()}><header><h3>发现新版本 {updates.release.version}</h3><button type="button" aria-label="关闭更新提示" onClick={updates.dismiss}><X size={22}/></button></header>{updates.release.notes&&<p className="app-update-notes">{updates.release.notes}</p>}<p>下载后按手机提示安装，是否更新由你决定。</p>{updates.error&&<p role="alert">{updates.error}</p>}<footer><button type="button" onClick={updates.dismiss}>暂不更新</button><button type="button" onClick={updates.download}>下载更新</button></footer></section></div>
  const ready=updates.downloadState?.ready&&updates.downloadState.version===updates.release.version.replace(/^v/,'')
  return <div className="app-update-backdrop" role="presentation" onClick={updates.dismiss}><section className="app-update-dialog" role="dialog" aria-modal="true" aria-label="发现新版本" onClick={event=>event.stopPropagation()}><header><h3>发现新版本 {updates.release.version}</h3><button type="button" aria-label="关闭更新提示" onClick={updates.dismiss}><X size={22}/></button></header>{updates.release.notes&&<p className="app-update-notes">{updates.release.notes}</p>}<p>下载后选择安装方式，是否更新由你决定。</p>{updates.error&&<p role="alert">{updates.error}</p>}<UpdateInstallControls updates={updates}/><footer><button type="button" onClick={updates.dismiss}>稍后再说</button>{!ready&&<button type="button" disabled={updates.downloadState?.busy} onClick={updates.download}>下载更新</button>}</footer></section></div>
}
