import {useEffect,useRef} from 'react'
import useModalScrollLock from '../lib/useModalScrollLock'

// 安卓使用应用内圆角确认框，文案明确本机数据范围；取消和返回均不执行删除。
export default function DeleteSongDialog({song,onCancel,onConfirm}) {
  const root=useRef(null)
  useModalScrollLock()
  useEffect(()=>{
    const previous=document.activeElement
    root.current?.querySelector('button')?.focus()
    const back=event=>{event.preventDefault();event.stopImmediatePropagation();onCancel()}
    const key=event=>{
      if(event.key==='Escape'){back(event);return}
      if(event.key!=='Tab')return
      const buttons=[...root.current.querySelectorAll('button')]
      if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus()}
      else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus()}
    }
    window.addEventListener('uta:navigate-back',back,true)
    window.addEventListener('keydown',key,true)
    return()=>{window.removeEventListener('uta:navigate-back',back,true);window.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus()}
  },[onCancel])
  return <div className="song-delete-backdrop" onClick={onCancel}>
    <section ref={root} className="song-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="song-delete-title" aria-describedby="song-delete-description" onClick={event=>event.stopPropagation()}>
      <h2 id="song-delete-title">删除歌曲</h2>
      <p id="song-delete-description">确定删除《{song.title}》吗？歌词、音频和这首歌的学习进度将从本机移除。</p>
      <div className="song-delete-actions"><button type="button" onClick={onCancel}>取消</button><button type="button" className="danger" onClick={onConfirm}>删除</button></div>
    </section>
  </div>
}
