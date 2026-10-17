import {useEffect,useRef,useState} from 'react'
import {JAPANESE_LEVELS} from '../lib/japaneseLevel'
import {readLocalProfile,saveLocalProfile} from '../lib/localProfile'
import useModalScrollLock from '../lib/useModalScrollLock'

// 首次启用且未询问时只在首页展示；设置/更新等现有弹窗先完成，不中断学习。
export default function JapaneseLevelOnboarding({enabled}) {
  const [visible,setVisible]=useState(false)
  useEffect(()=>{
    if(!enabled){setVisible(false);return undefined}
    if(visible)return undefined
    const show=()=>{
      if(document.visibilityState==='visible'&&!document.querySelector('[role="dialog"],[role="alertdialog"],[aria-modal="true"]'))setVisible(true)
    }
    show()
    const observer=new MutationObserver(show)
    observer.observe(document.body,{childList:true,subtree:true})
    document.addEventListener('visibilitychange',show)
    return()=>{observer.disconnect();document.removeEventListener('visibilitychange',show)}
  },[enabled,visible])
  return enabled&&visible?<LevelDialog/>:null
}
function LevelDialog(){
  const [level,setLevel]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const root=useRef(null)
  useModalScrollLock()
  async function save(skip=false){
    if(busy||!skip&&!level)return
    setBusy(true);setError('')
    try{await saveLocalProfile({...readLocalProfile(),japaneseLevelPrompted:true,...(!skip?{japaneseLevel:level}:{})})}
    catch{setBusy(false);setError('未能保存，请稍后重试。')}
  }
  useEffect(()=>{
    const old=document.activeElement;root.current?.querySelector('input')?.focus()
    const back=event=>{event.preventDefault();event.stopImmediatePropagation();void save(true)}
    const key=event=>{
      if(event.key==='Escape'){back(event);return}
      if(event.key!=='Tab')return
      const controls=[...root.current.querySelectorAll('input,button:not(:disabled)')]
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus()}
      else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus()}
    }
    window.addEventListener('uta:navigate-back',back,true);window.addEventListener('keydown',key,true)
    return()=>{window.removeEventListener('uta:navigate-back',back,true);window.removeEventListener('keydown',key,true);if(old?.isConnected)old.focus({preventScroll:true})}
  },[busy])
  return <div className="japanese-level-backdrop"><section ref={root} className="japanese-level-dialog" role="dialog" aria-modal="true" aria-labelledby="japanese-level-title">
    <h2 id="japanese-level-title">你的日语水平是？</h2>
    <p>让日语AI解析更适合你。以后可在“设置 → 个人资料”修改，不影响其他语言的解析。</p>
    <fieldset><legend>选择日语水平</legend>{JAPANESE_LEVELS.map(item=><label key={item.id}><input type="radio" name="first-japanese-level" value={item.id} checked={level===item.id} onChange={()=>setLevel(item.id)} disabled={busy}/>{item.label}</label>)}</fieldset>
    {error&&<p role="alert">{error}</p>}
    <div><button type="button" disabled={busy} onClick={()=>save(true)}>稍后设置</button><button type="button" disabled={!level||busy} onClick={()=>save(false)}>{busy?'保存中…':'保存并开始'}</button></div>
    <small>暂不设置时，按没学过日语的方式讲解。</small>
  </section></div>
}
