import {useCallback,useEffect,useRef,useState} from 'react'
import {CapacitorHttp,registerPlugin} from '@capacitor/core'
import {App} from '@capacitor/app'
import {Browser} from '@capacitor/browser'
// 原关于图标：import {RefreshCw,ExternalLink,Users} from 'lucide-react'
// 原反馈图标导入：import {RefreshCw,ExternalLink,Users,MessageSquare} from 'lucide-react'
import {RefreshCw,ExternalLink,Users} from 'lucide-react'
// 增加发布说明分段，避免把 Markdown 符号直接显示给手机用户。
// import {UPDATE_API,selectAppRelease} from '../lib/appUpdate'
// 原来只检查全仓库 Latest：import {UPDATE_API,selectAppRelease,parseUpdateNotes} from '../lib/appUpdate'
// 原导入保留：import {UPDATE_API,selectLatestAppRelease,parseUpdateNotes} from '../lib/appUpdate'
import {parseUpdateNotes} from '../lib/appUpdate'
import {fetchPreferredAppRelease,downloadAppRelease} from '../lib/appUpdateTransport'
import {shouldPromptUpdate,ignoreUpdateVersion} from '../lib/updatePreference'
const installer=registerPlugin('UtaAppUpdate')
// 原独立 WebView：const feedback=registerPlugin('UtaFeedback')
// QQ 授权回到系统浏览器，改用系统 Custom Tab 共享正常登录态；不传递应用本地数据。
// const FEEDBACK_URL='https://support.qq.com/product/802246'
// 由原生页生成随机访客身份并以 HTTPS POST 接入，第三方页面不共享主应用插件桥。
// 停用兔小巢，不再注册反馈桥；应用更新插件保持正常使用。
// const feedback=registerPlugin('UtaFeedback')
const PROJECT_URL='https://github.com/meilawiet/Japanese-song-learning-website/releases'
const MANUAL_INSTALL='请尝试手动安装：到“关于 → 项目地址”下载 APK，再用手机文件管理器打开安装。'

// 保留启动检查；用户点击“更新”后下载并自动交给系统安装器确认。
export function useAppUpdates(enabled) {
  const [version,setVersion]=useState(''),[checking,setChecking]=useState(false),[error,setError]=useState(''),[release,setRelease]=useState(null),[prompt,setPrompt]=useState(false)
  const [downloadState,setDownloadState]=useState({busy:false,progress:0,ready:false})
  const [installNotice,setInstallNotice]=useState(''),[installing,setInstalling]=useState(false)
  const running=useRef(false),updating=useRef(false),cancelled=useRef(false)
  useEffect(()=>{
    if(!enabled)return undefined
    let alive=true,listener
    installer.status().then(value=>{if(alive)setDownloadState(value)}).catch(()=>{})
    installer.addListener('progress',value=>{if(alive)setDownloadState(old=>({...old,progress:value.progress}))}).then(value=>{if(alive)listener=value;else value.remove()})
    return()=>{alive=false;listener?.remove()}
  },[enabled])
  const check=useCallback(async(manual=false)=>{
    if(!enabled||running.current)return
    running.current=true;setChecking(true);setError('')
    try{
      const info=await App.getInfo();setVersion(info.version)
      // 原来只读取全仓库 Latest，遇到 Windows 标签便停止：
      // const response=await CapacitorHttp.get({url:UPDATE_API,headers:{Accept:'application/vnd.github+json'},connectTimeout:10000,readTimeout:10000})
      // if(response.status===404){setRelease({available:false,message:'暂未发布可用的更新。'});return}
      // if(response.status===403||response.status===429)throw new Error('更新检查过于频繁，请稍后重试。')
      // if(response.status!==200)throw new Error('检测更新失败，请检查网络后重试。')
      // const result=selectAppRelease(typeof response.data==='string'?JSON.parse(response.data):response.data,info.version)
      // 旧版只检查 GitHub，保留原分页处理供对照；新版按 Gitee→GitHub 的顺序检查。
      /* let result={available:false,message:'暂未发布可下载安装的更新。'}
      // 从最近发行版开始寻找有效 APK；若整页都是电脑版，再读下一页。
      for(let page=1;page<=10;page++){
        const url=page===1?UPDATE_API:`${UPDATE_API}&page=${page}`
        const response=await CapacitorHttp.get({url,headers:{Accept:'application/vnd.github+json'},connectTimeout:10000,readTimeout:10000})
        if(response.status===404){if(page===1)result={available:false,message:'暂未发布可用的更新。'};break}
        if(response.status===403||response.status===429)throw new Error('更新检查过于频繁，请稍后重试。')
        if(response.status!==200)throw new Error('检测更新失败，请检查网络后重试。')
        const releases=typeof response.data==='string'?JSON.parse(response.data):response.data
        result=selectLatestAppRelease(releases,info.version)
        if(result.available||releases.length<100)break
      } */
      const result=await fetchPreferredAppRelease(info.version,(url,options)=>CapacitorHttp.get({url,...options}))
      // 原来所有新版本每次启动均弹窗；仅自动检查尊重当前待更新版本的忽略设置。
      setRelease(result);if(result.newer&&shouldPromptUpdate(result.version,manual===true))setPrompt(true)
    }catch{setError('检测更新失败，请检查网络或稍后重试。')}
    finally{running.current=false;setChecking(false)}
  },[enabled])
  useEffect(()=>{if(enabled)check()},[enabled,check])
  const download=async()=>{
    if(updating.current||!release?.newer)return
    updating.current=true;cancelled.current=false;setError('');setInstallNotice('')
    try{
      // 只复用对应版本的已校验缓存，旧安装包不能误当成新版本。
      const cached=await installer.status()
      if(cancelled.current)return
      // 原缓存仅比版本名；双源发布还需匹配当前 APK 摘要，防止同版本修正包误复用旧文件。
      // if(!cached.ready||cached.version!==release.version.replace(/^v/,'')){
      if(!cached.ready||cached.version!==release.version.replace(/^v/,'')||cached.sha256!==release.sha256){
        setDownloadState(old=>({...old,busy:true,progress:0}))
        // 原下载仅使用 release.url；现在优先 Gitee，失败后自动下载同摘要的 GitHub 附件。
        // const result=await installer.download({url:release.url,sha256:release.sha256})
        const result=await downloadAppRelease(release,args=>installer.download(args),()=>cancelled.current)
        setDownloadState({...result,busy:false,progress:result.cancelled?0:100})
        if(result.cancelled||cancelled.current)return
      }else setDownloadState({...cached,busy:false,progress:100})
      setInstalling(true);setInstallNotice('请在系统安装器中确认安装；首次使用需允许 UTA 安装应用。')
      try{
        // 原生端处理授权返回与安装结果；页面不再提供多个安装入口。
        const result=await installer.install({mode:'system'})
        if(result.cancelled){setInstallNotice('已取消安装。');return}
        setInstallNotice('安装已完成。')
      }catch(failure){setInstallNotice('');setError(`${failure.message||'安装失败。'} ${MANUAL_INSTALL}`)}
    }catch(failure){setError(failure.message||'安装包下载失败，请检查网络后重试。')}
    finally{updating.current=false;setInstalling(false);setDownloadState(old=>({...old,busy:false}))}
  }
  // 取消或返回时中止下载，避免关闭提示后又自动弹出安装器。
  const dismiss=(ignore=false)=>{if(ignore===true&&release?.version)ignoreUpdateVersion(release.version);cancelled.current=true;setPrompt(false);if(updating.current&&!installing)void installer.cancel().catch(()=>{})}
  return {version,checking,error,release,prompt,check,download,downloadState,installNotice,installing,dismiss}
}

export function AboutPanel({updates}) {
  const [notice,setNotice]=useState(''),[linkError,setLinkError]=useState('')
  // const [openingFeedback,setOpeningFeedback]=useState(false)
  // 原打开方式：const openFeedback=async()=>{setLinkError('');setOpeningFeedback(true);try{await feedback.open()}catch{setLinkError('无法打开建议与反馈，请稍后重试。')}finally{setOpeningFeedback(false)}}
  // 原浏览器方案：const openFeedback=async()=>{setLinkError('');setOpeningFeedback(true);try{await Browser.open({url:FEEDBACK_URL,toolbarColor:'#ffffff'})}catch{setLinkError('无法打开建议与反馈，请确认已安装可用浏览器后重试。')}finally{setOpeningFeedback(false)}}
  // 停用原反馈打开逻辑，关于页只保留更新、项目和加群交流。
  // const openFeedback=async()=>{setLinkError('');setOpeningFeedback(true);try{await feedback.open()}catch{setLinkError('无法打开建议与反馈，请稍后重试。')}finally{setOpeningFeedback(false)}}
  const openProject=async()=>{setLinkError('');try{await Browser.open({url:PROJECT_URL})}catch{setLinkError('无法打开项目地址，请检查网络后重试。')}}
  const copyGroup=async()=>{setLinkError('');try{await navigator.clipboard.writeText('1125131374');setNotice('已复制群号，请在 QQ 中搜索加入。')}catch{setNotice('请在 QQ 中搜索群号：1125131374。')}}
  // 关于页新增建议与反馈，进入带访客身份的独立原生页面。
  return <section className="settings-content about-panel"><h3>UTA</h3><p>当前版本 {updates.version||'读取中…'}</p>
    <button className="about-check-update" type="button" disabled={updates.checking} onClick={()=>updates.check(true)}><span><RefreshCw size={19}/>检查更新</span><span>{updates.checking?'检测中…':'›'}</span></button>
    <button className="about-check-update" type="button" onClick={openProject}><span><ExternalLink size={19}/>项目地址</span><span>›</span></button>
    <button className="about-check-update" type="button" onClick={copyGroup}><span><Users size={19}/>加群交流</span><span>QQ群 1125131374</span></button>
    {/* 停用旧入口：<button className="about-check-update" type="button" disabled={openingFeedback} onClick={openFeedback}><span><MessageSquare size={19}/>建议与反馈</span><span>{openingFeedback?'正在打开…':'›'}</span></button> */}
    {(updates.error||linkError)&&<p role="alert">{linkError||updates.error}</p>}
    {!updates.error&&updates.release&&<p role="status">{updates.release.message}{updates.release.newer?` ${updates.release.version}`:''}</p>}{notice&&<p role="status">{notice}</p>}
  </section>
}
// 只输出 React 文本节点，不将远程发布说明作为 HTML 注入。
function ReleaseNotes({ notes }) {
  return <div className="app-update-notes">{parseUpdateNotes(notes).map((block,index)=>block.type==='heading'?<h4 key={index}>{block.text}</h4>:block.type==='list'?<ul key={index}>{block.items.map((text,item)=><li key={item}>{text}</li>)}</ul>:<p key={index}>{block.text}</p>)}</div>
}
export function AppUpdatePrompt({updates}) {
  // 勾选只是暂存选择，点击取消才记住；切换到另一个待更新版本时重置。
  const [ignore,setIgnore]=useState(false)
  useEffect(()=>{setIgnore(false)},[updates.release?.version,updates.prompt])
  // 返回、点遮罩和取消按钮统一处理这次勾选。
  useEffect(()=>{if(!updates.prompt)return;const back=event=>{event.preventDefault();event.stopImmediatePropagation();updates.dismiss(ignore)};window.addEventListener('uta:navigate-back',back,true);return()=>window.removeEventListener('uta:navigate-back',back,true)},[updates.prompt,updates.dismiss,ignore])
  if(!updates.prompt)return null
  // 弹窗只保留取消和更新；下载进度与失败说明使用文字显示。
  return <div className="app-update-backdrop" role="presentation" onClick={()=>updates.dismiss(ignore)}><section className="app-update-dialog" role="dialog" aria-modal="true" aria-label="发现新版本" onClick={event=>event.stopPropagation()}>
    <header><h3>发现新版本 {updates.release.version}</h3></header>{/* 旧展示：<p className="app-update-notes">{updates.release.notes}</p>；现隐藏井号并使用圆点列表。 */}{updates.release.notes&&<ReleaseNotes notes={updates.release.notes}/>}
    {updates.downloadState.busy&&<p role="status">正在下载安装包… {updates.downloadState.progress}%</p>}{updates.installNotice&&<p role="status">{updates.installNotice}</p>}{updates.error&&<p role="alert">{updates.error}</p>}
    <label className="app-update-ignore"><input type="checkbox" checked={ignore} onChange={event=>setIgnore(event.target.checked)} disabled={updates.downloadState.busy||updates.installing}/>此版本不再提示更新</label>
    <footer><button type="button" onClick={()=>updates.dismiss(ignore)}>取消</button><button type="button" disabled={updates.downloadState.busy||updates.installing} onClick={updates.download}>更新</button></footer>
  </section></div>
}

// 旧版多种安装方式保留作对照，现由上述系统安装流程替代。
// import {useCallback,useEffect,useRef,useState} from 'react'
// // 原生更新模块负责下载、校验与安装器调用，页面负责展示进度和用户选择。
// // import {CapacitorHttp} from '@capacitor/core'
// import {CapacitorHttp,registerPlugin} from '@capacitor/core'
// import {App} from '@capacitor/app'
// import {Browser} from '@capacitor/browser'
// import {Download,RefreshCw,X} from 'lucide-react'
// import {UPDATE_API,selectAppRelease} from '../lib/appUpdate'
// const installer=registerPlugin('UtaAppUpdate')
//
// // 启动时静默检测；新版本只提示，必须由用户主动点击后才打开下载页面。
// export function useAppUpdates(enabled) {
//   const [version,setVersion]=useState(''),[checking,setChecking]=useState(false),[error,setError]=useState(''),[release,setRelease]=useState(null),[prompt,setPrompt]=useState(false)
//   const running=useRef(false)
//   // 已下载的完整安装包可以在重新进入“关于”后继续安装，不必再次下载。
//   const [downloadState,setDownloadState]=useState({busy:false,progress:0,ready:false})
//   const [installNotice,setInstallNotice]=useState('')
//   useEffect(()=>{
//     if(!enabled)return undefined
//     let alive=true,listener
//     installer.status().then(value=>{if(alive)setDownloadState(value)}).catch(()=>{})
//     installer.addListener('progress',value=>{if(alive)setDownloadState(old=>({...old,progress:value.progress}))}).then(value=>{if(alive)listener=value;else value.remove()})
//     return()=>{alive=false;listener?.remove()}
//   },[enabled])
//   const check=useCallback(async()=>{
//     if(!enabled||running.current)return
//     running.current=true;setChecking(true);setError('')
//     try{
//       const info=await App.getInfo();setVersion(info.version)
//       const response=await CapacitorHttp.get({url:UPDATE_API,headers:{Accept:'application/vnd.github+json'},connectTimeout:10000,readTimeout:10000})
//       if(response.status===404){setRelease({available:false,message:'暂未发布可用的更新。'});return}
//       if(response.status===403||response.status===429)throw new Error('更新检查过于频繁，请稍后重试。')
//       if(response.status!==200)throw new Error('检测更新失败，请检查网络后重试。')
//       const result=selectAppRelease(typeof response.data==='string'?JSON.parse(response.data):response.data,info.version)
//       setRelease(result);if(result.newer)setPrompt(true)
//     }catch{setError('检测更新失败，请检查网络或稍后重试。')}
//     finally{running.current=false;setChecking(false)}
//   },[enabled])
//   useEffect(()=>{if(enabled)check()},[enabled,check])
//   // 旧流程依赖浏览器下载列表打开 APK，部分手机在 Edge 中点击后没有反应。
//   // const download=async()=>{try{await Browser.open({url:release.url});setPrompt(false)}catch{setError('无法打开下载页面，请稍后重试。')}}
//   const openDownloadPage=async()=>{try{await Browser.open({url:release.url})}catch{setError('无法打开下载页面，请稍后重试。')}}
//   const download=async()=>{
//     if(downloadState.busy)return
//     setError('');setInstallNotice('');setDownloadState(old=>({...old,busy:true,progress:0}))
//     try{const result=await installer.download({url:release.url,sha256:release.sha256});if(result.cancelled){setDownloadState(old=>({...old,busy:false}));setInstallNotice('已取消下载，可以选择已下载的 APK。');return}setDownloadState({...result,busy:false,progress:100});setInstallNotice('下载完成，请选择安装方式。')}
//     catch(failure){setError(failure.message||'下载失败，请重试或使用浏览器下载。');setDownloadState(old=>({...old,busy:false}))}
//   }
//   const install=async mode=>{setError('');setInstallNotice('');try{const result=await installer.install({mode});if(result.permissionRequired)setInstallNotice('请允许 UTA 安装应用，返回后再次点击安装。')}catch(failure){setError(failure.message||'无法启动安装器，请选择其他安装方式。')}}
//   const saveInstallerFile=async()=>{setError('');try{const result=await installer.saveFile();if(!result.cancelled)setInstallNotice('安装包已保存，可用 MT 或其他文件管理器打开安装。')}catch(failure){setError(failure.message||'安装包保存失败，请重试。')}}
//   // 浏览器下载完成但打不开时，可以选择现有文件，不必重新下载。
//   const chooseInstallerFile=async()=>{setError('');try{const result=await installer.chooseFile({sha256:release?.sha256||''});if(!result.cancelled){setDownloadState({...result,busy:false,progress:100});setInstallNotice('安装包校验通过，请选择安装方式。')}}catch(failure){setError(failure.message||'无法读取安装包，请重试。')}}
//   const cancelDownload=async()=>{try{await installer.cancel()}catch{setError('取消下载失败，请稍后重试。')}}
//   // return {version,checking,error,release,prompt,check,download,dismiss:()=>setPrompt(false)}
//   return {version,checking,error,release,prompt,check,download,downloadState,installNotice,install,saveInstallerFile,chooseInstallerFile,cancelDownload,openDownloadPage,dismiss:()=>setPrompt(false)}
// }
// // 两种安装入口共享同一个完整安装包；系统选择列表只展示手机已注册的 APK 处理程序。
// function UpdateInstallControls({updates}) {
//   const state=updates.downloadState||{}
//   return <div className="update-install-controls">{state.busy?<><p role="status">正在下载安装包… {state.progress}%</p><button type="button" onClick={updates.cancelDownload}>取消下载</button></>:state.ready?<><p>已下载 UTA {state.version}</p><button type="button" onClick={()=>updates.install('system')}>系统安装器</button><button type="button" onClick={()=>updates.install('chooser')}>选择其他安装方式</button><button type="button" onClick={updates.saveInstallerFile}>保存安装包到文件夹</button></>:null}{updates.installNotice&&<p role="status">{updates.installNotice}</p>}{!state.busy&&<button type="button" onClick={updates.chooseInstallerFile}>选择已下载的 APK</button>}{updates.release?.available&&!state.busy&&<button type="button" onClick={updates.openDownloadPage}>使用浏览器下载</button>}</div>
// }
// export function AboutPanel({updates}) {
//   // 旧布局只提供浏览器下载按钮；新增下载进度和安装方式选择。
//   // return <section className="settings-content about-panel"><h3>UTA</h3><p>当前版本 {updates.version||'读取中…'}</p><button className="about-check-update" type="button" disabled={updates.checking} onClick={updates.check}><span><RefreshCw size={19}/>检测更新</span><span>{updates.checking?'检测中…':'›'}</span></button>{updates.error?<p role="alert">{updates.error}</p>:updates.release&&<p role="status">{updates.release.message}{updates.release.newer?` ${updates.release.version}`:''}</p>}{updates.release?.newer&&<button className="about-download-update" type="button" onClick={updates.download}><Download size={17}/>下载更新</button>}<small>每次启动自动检测，是否更新由你决定。</small></section>
//   const ready=updates.downloadState?.ready&&updates.downloadState.version===updates.release?.version?.replace(/^v/,'')
//   return <section className="settings-content about-panel"><h3>UTA</h3><p>当前版本 {updates.version||'读取中…'}</p><button className="about-check-update" type="button" disabled={updates.checking} onClick={updates.check}><span><RefreshCw size={19}/>检测更新</span><span>{updates.checking?'检测中…':'›'}</span></button>{updates.error?<p role="alert">{updates.error}</p>:updates.release&&<p role="status">{updates.release.message}{updates.release.newer?` ${updates.release.version}`:''}</p>}{updates.release?.newer&&!ready&&<button className="about-download-update" type="button" disabled={updates.downloadState?.busy} onClick={updates.download}><Download size={17}/>下载更新包</button>}<UpdateInstallControls updates={updates}/><small>每次启动自动检测，是否更新由你决定。</small></section>
// }
// export function AppUpdatePrompt({updates}) {
//   // 更新提示在设置页之上，系统返回优先关闭提示，避免同时关闭下层窗口。
//   useEffect(()=>{if(!updates.prompt)return;const back=event=>{event.preventDefault();event.stopImmediatePropagation();updates.dismiss()};window.addEventListener('uta:navigate-back',back,true);return()=>window.removeEventListener('uta:navigate-back',back,true)},[updates.prompt])
//   if(!updates.prompt)return null
//   // 旧弹窗保留作对照：下载直接跳转浏览器。
//   // return <div className="app-update-backdrop" role="presentation" onClick={updates.dismiss}><section className="app-update-dialog" role="dialog" aria-modal="true" aria-label="发现新版本" onClick={event=>event.stopPropagation()}><header><h3>发现新版本 {updates.release.version}</h3><button type="button" aria-label="关闭更新提示" onClick={updates.dismiss}><X size={22}/></button></header>{updates.release.notes&&<p className="app-update-notes">{updates.release.notes}</p>}<p>下载后按手机提示安装，是否更新由你决定。</p>{updates.error&&<p role="alert">{updates.error}</p>}<footer><button type="button" onClick={updates.dismiss}>暂不更新</button><button type="button" onClick={updates.download}>下载更新</button></footer></section></div>
//   const ready=updates.downloadState?.ready&&updates.downloadState.version===updates.release.version.replace(/^v/,'')
//   return <div className="app-update-backdrop" role="presentation" onClick={updates.dismiss}><section className="app-update-dialog" role="dialog" aria-modal="true" aria-label="发现新版本" onClick={event=>event.stopPropagation()}><header><h3>发现新版本 {updates.release.version}</h3><button type="button" aria-label="关闭更新提示" onClick={updates.dismiss}><X size={22}/></button></header>{updates.release.notes&&<p className="app-update-notes">{updates.release.notes}</p>}<p>下载后选择安装方式，是否更新由你决定。</p>{updates.error&&<p role="alert">{updates.error}</p>}<UpdateInstallControls updates={updates}/><footer><button type="button" onClick={updates.dismiss}>稍后再说</button>{!ready&&<button type="button" disabled={updates.downloadState?.busy} onClick={updates.download}>下载更新</button>}</footer></section></div>
// }
