import {useEffect,useRef} from 'react'
import useModalScrollLock from '../lib/useModalScrollLock'

// 删除AI缓存需明确确认；取消和系统返回不改写记录。
export default function SentenceDeleteDialog({whole,onCancel,onConfirm}){
  const root=useRef(null)
  useModalScrollLock()
  useEffect(()=>{
    const previous=document.activeElement;root.current?.querySelector('button')?.focus()
    const back=event=>{event.preventDefault();event.stopImmediatePropagation();onCancel()}
    const key=event=>{
      if(event.key==='Escape'){back(event);return}
      if(event.key!=='Tab')return
      const controls=[...root.current.querySelectorAll('button')]
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus()}
      else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus()}
    }
    window.addEventListener('uta:navigate-back',back,true);window.addEventListener('keydown',key,true)
    return()=>{window.removeEventListener('uta:navigate-back',back,true);window.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus({preventScroll:true})}
  },[onCancel])
  return <div className="song-delete-backdrop sentence-delete-backdrop" onClick={onCancel}><section ref={root} className="song-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sentence-delete-title" onClick={event=>event.stopPropagation()}>
    <h2 id="sentence-delete-title">删除{whole?'整曲':'本句'}解析？</h2><p>仅删除{whole?'这首歌':'这一句'}已保存的AI解析，并停止这首歌正在生成的解析。歌词、音频和掌握记录保留，之后可以重新生成。</p>
    <div className="song-delete-actions"><button type="button" onClick={onCancel}>取消</button><button type="button" className="danger" onClick={onConfirm}>删除解析</button></div>
  </section></div>
}
