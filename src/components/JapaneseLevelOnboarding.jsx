import {useEffect,useRef,useState} from 'react'
import {JAPANESE_LEVELS} from '../lib/japaneseLevel'
import useModalScrollLock from '../lib/useModalScrollLock'

// 新版首次打开时在首页展示；等其他弹窗关闭后再引导设置。
export default function JapaneseLevelOnboarding({enabled,japaneseLevel,teachingMode,onComplete}) {
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
  return enabled&&visible?<LevelDialog japaneseLevel={japaneseLevel} teachingMode={teachingMode} onComplete={onComplete}/>:null
}
function LevelDialog({japaneseLevel,teachingMode,onComplete}){
  // 保留升级前的学习偏好，改动只有确认后才写入。
  const [level,setLevel]=useState(japaneseLevel),[mode,setMode]=useState(teachingMode)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const root=useRef(null)
  useModalScrollLock()
  async function save(skip=false){
    if(busy||!skip&&!level)return
    setBusy(true);setError('')
    // 原先只写入日语水平和个人资料内的询问标记。
    // try{await saveLocalProfile({...readLocalProfile(),japaneseLevelPrompted:true,...(!skip?{japaneseLevel:level}:{})})}
    try{await onComplete(skip?undefined:{level,mode})}
    catch{setBusy(false);setError('未能保存，请稍后重试。')}
  }
  useEffect(()=>{
    const old=document.activeElement
    if(!busy)root.current?.focus({preventScroll:true})
    const back=event=>{event.preventDefault();event.stopImmediatePropagation();void save(true)}
    const key=event=>{
      if(event.key==='Escape'){back(event);return}
      if(event.key!=='Tab')return
      const controls=[...root.current.querySelectorAll('input:checked:not(:disabled),button:not(:disabled)')]
      // 弹窗刚打开时焦点在容器上，反向 Tab 也应留在弹窗内。
      if(event.shiftKey&&(document.activeElement===root.current||document.activeElement===controls[0])){event.preventDefault();controls.at(-1)?.focus()}
      else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus()}
    }
    window.addEventListener('uta:navigate-back',back,true);window.addEventListener('keydown',key,true)
    return()=>{window.removeEventListener('uta:navigate-back',back,true);window.removeEventListener('keydown',key,true);if(old?.isConnected)old.focus({preventScroll:true})}
  },[busy])
  return <div className="japanese-level-backdrop"><section ref={root} className="japanese-level-dialog" role="dialog" aria-modal="true" aria-labelledby="japanese-level-title" tabIndex={-1}>
    {/* <h2 id="japanese-level-title">你的日语水平是？</h2> */}
    <h2 id="japanese-level-title">设置你的学习偏好</h2>
    <p>选择日语水平和 AI 讲解模式，之后可以在「我的 → 设置 → 学习复习」修改。</p>
    <fieldset><legend>选择日语水平</legend>{JAPANESE_LEVELS.map(item=><label key={item.id}><input type="radio" name="first-japanese-level" value={item.id} checked={level===item.id} onChange={()=>setLevel(item.id)} disabled={busy}/>{item.label}</label>)}</fieldset>
    <fieldset><legend>AI 讲解模式</legend>
      <label><input type="radio" name="first-teaching-mode" value="concise" checked={mode==='concise'} onChange={()=>setMode('concise')} disabled={busy}/><span>简略模式<small>单词和语法各最多 2 项</small></span></label>
      <label><input type="radio" name="first-teaching-mode" value="detailed" checked={mode==='detailed'} onChange={()=>setMode('detailed')} disabled={busy}/><span>详细模式<small>按需讲解更多细节</small></span></label>
    </fieldset>
    {error&&<p role="alert">{error}</p>}
    <div><button type="button" disabled={busy} onClick={()=>save(true)}>稍后设置</button><button className="japanese-level-save" type="button" disabled={!level||busy} onClick={()=>save(false)}>{busy?'保存中…':'保存并开始'}</button></div>
    {/* <small>暂不设置时，按没学过日语的方式讲解。</small> */}
  </section></div>
}
