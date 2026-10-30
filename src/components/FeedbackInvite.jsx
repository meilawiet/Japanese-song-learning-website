import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {Browser} from '@capacitor/browser'
import {Capacitor,registerPlugin} from '@capacitor/core'
import useModalScrollLock from '../lib/useModalScrollLock'
import {FEEDBACK_FORM_URL,feedbackSession} from '../lib/feedbackInvite.js'

// 原生计数同步落盘，避免短时间内强制结束进程时WebView尚未写入偏好。
const nativeInvite=registerPlugin('UtaFeedbackInvite')
const session=()=>feedbackSession(localStorage,Capacitor.isNativePlatform()?()=>nativeInvite.claim():undefined)

// 真实超链接保留短文案，用户点击后用系统浏览器页打开，不在主WebView嵌入表单。
export function FeedbackFormLink({onOpened}){
  const [opening,setOpening]=useState(false),[error,setError]=useState('')
  async function open(event){event.preventDefault();if(opening)return;setOpening(true);setError('');try{await Browser.open({url:FEEDBACK_FORM_URL});onOpened?.()}catch{setError('未能打开反馈表，请检查网络或可用浏览器后重试。')}finally{setOpening(false)}}
  return <span className="feedback-form-action"><a href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer" aria-disabled={opening} onClick={open}>{opening?'正在打开反馈表…':'填写使用体验反馈'}</a>{error&&<span role="alert">{error}</span>}</span>
}

// 只有首页具备展示条件时才占用次数，启动图、新手或更新弹窗不提前消耗机会。
export default function FeedbackInvite({enabled,onVisibleChange}){
  const [invitation,setInvitation]=useState(null)
  // 旧本地同步计数：useEffect(()=>{if(enabled)setInvitation(feedbackSession(localStorage).claim())},[enabled])
  useEffect(()=>{let active=true;if(enabled)Promise.resolve(session().claim()).then(value=>{if(active)setInvitation(value)});return()=>{active=false}},[enabled])
  const visible=Boolean(enabled&&invitation)
  useEffect(()=>{onVisibleChange?.(visible);return()=>onVisibleChange?.(false)},[visible,onVisibleChange])
  function close(){session().dismiss();setInvitation(null)}
  if(!visible)return null
  // 旧版把section直接放在首页内容顶部；用户要求改成屏幕居中弹窗。
  return createPortal(<FeedbackInviteDialog onClose={close}/>,document.body)
}

// 挂到body避免页面容器影响固定定位；共享滚动锁、返回键及焦点管理。
function FeedbackInviteDialog({onClose}){
  const root=useRef(null)
  useModalScrollLock()
  useEffect(()=>{
    const previous=document.activeElement;root.current?.querySelector('a')?.focus()
    const back=event=>{event.preventDefault();event.stopImmediatePropagation();onClose()}
    const key=event=>{if(event.key==='Escape'){back(event);return}if(event.key!=='Tab')return;const controls=[...root.current.querySelectorAll('a,button')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
    window.addEventListener('uta:navigate-back',back,true);window.addEventListener('keydown',key,true)
    return()=>{window.removeEventListener('uta:navigate-back',back,true);window.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus()}
  },[onClose])
  return <div className="feedback-invite-backdrop" onClick={onClose}><section ref={root} className="feedback-invite-card" role="dialog" aria-modal="true" aria-labelledby="feedback-invite-title" aria-describedby="feedback-invite-description" onClick={event=>event.stopPropagation()}><h2 id="feedback-invite-title">聊聊你的 UTA 使用体验</h2><p id="feedback-invite-description">欢迎填写安卓端反馈表，帮助我们改进界面、流畅度和学习功能。</p><div className="feedback-invite-actions"><FeedbackFormLink onOpened={onClose}/><button type="button" onClick={onClose}>本次不填写</button></div><p className="feedback-invite-hint">你可以随时在“设置 → 关于 → 反馈”中填写反馈表。</p></section></div>
}
