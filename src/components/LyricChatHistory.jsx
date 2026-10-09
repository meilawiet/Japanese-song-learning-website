import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X, Send, Plus, Trash2, ChevronLeft } from 'lucide-react'
import { buildLyricChatContext, buildLyricChatPayload } from '../lib/lyricChat'
import { listLyricChats, saveLyricChat, deleteLyricChat } from '../lib/lyricChatStore'
import { loadAiSettings,setWebSearchEnabled } from '../lib/aiSettings'
import { webSearchAvailable } from '../lib/mobileWebSearch'
import { Browser } from '@capacitor/browser'
import { postMobileAi } from '../lib/mobileAi'

// 每次打开先选择对话；历史可跨歌曲查看，继续旧歌曲时使用其保存的歌词上下文。
export default function LyricChatHistory({ song, lineId, annotations, corrections }) {
  // 对话内联网开关与设置页共用偏好，不修改或清空 API Key。
  const [aiConfig,setAiConfig]=useState(loadAiSettings)
  useEffect(()=>{const refresh=()=>setAiConfig(loadAiSettings());window.addEventListener('uta:ai-settings',refresh);return()=>window.removeEventListener('uta:ai-settings',refresh)},[])
  const [open,setOpen] = useState(false)
  const [sessions,setSessions] = useState([])
  const [selected,setSelected] = useState(null)
  const [question,setQuestion] = useState('')
  const [busy,setBusy] = useState(false)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [confirmDelete,setConfirmDelete] = useState(null)
  const request = useRef(null), bottom = useRef(null)
  const session = sessions.find(item => item.id === selected)
  const close = () => { request.current?.abort(); request.current=null; setBusy(false); setOpen(false) }
  const goList = () => { request.current?.abort(); request.current=null; setBusy(false); setSelected(null); setQuestion(''); setError('') }
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (!open) return undefined
    let alive=true
    setLoading(true)
    listLyricChats().then(value => { if(alive) setSessions(value) }).catch(() => { if(alive) setError('无法读取本地对话，请重新打开。') }).finally(() => { if(alive) setLoading(false) })
    return () => { alive=false }
  },[open])
  useEffect(() => {
    if (!open) return undefined
    const overflow=document.body.style.overflow; document.body.style.overflow='hidden'
    const back = event => { event.preventDefault(); if(selected) goList(); else close() }
    window.addEventListener('uta:navigate-back',back)
    return () => { document.body.style.overflow=overflow;window.removeEventListener('uta:navigate-back',back) }
  },[open,selected])
  useEffect(() => { bottom.current?.scrollIntoView({block:'nearest'}) },[session?.messages.length,busy,selected])
  function update(value) { setSessions(previous => [value,...previous.filter(item => item.id!==value.id)].sort((a,b)=>b.updatedAt-a.updatedAt)) }
  async function create() {
    if(busy||loading) return
    setBusy(true);setError('')
    const value={id:crypto.randomUUID(),songId:song.id,songTitle:song.title,context:buildLyricChatContext(song,lineId,annotations,corrections),title:'新对话',messages:[],updatedAt:Date.now()}
    try { await saveLyricChat(value);update(value);setSelected(value.id);setQuestion('') }
    catch { setError('无法创建对话，请检查本地存储空间。') }
    finally {setBusy(false)}
  }
  async function remove(id) {
    if(busy) return
    setBusy(true);setError('')
    try { await deleteLyricChat(id);setSessions(previous=>previous.filter(item=>item.id!==id));setConfirmDelete(null) }
    catch {setError('无法删除对话，请重试。')}
    finally {setBusy(false)}
  }
  async function send(event) {
    event.preventDefault()
    if(busy||!question.trim()||!session) return
    const controller=new AbortController();request.current=controller;setBusy(true);setError('')
    const content=question.trim()
    const context=session.songId===song.id ? buildLyricChatContext(song,lineId,annotations,corrections) : session.context
    try {
      const result=await postMobileAi('/api/ai/lyric-chat',buildLyricChatPayload(context,session.messages,content),undefined,controller.signal)
      if(controller.signal.aborted) return
      const value={...session,context,title:session.messages.length?session.title:content.slice(0,32),messages:[...session.messages,{role:'user',content},{role:'assistant',content:result.answer,sources:result.sources||[],searchUsed:Boolean(result.searchUsed)}],updatedAt:Date.now()}
      await saveLyricChat(value)
      if(controller.signal.aborted) return
      update(value);setQuestion('')
    } catch(failure) {if(!controller.signal.aborted) setError(failure.message||'对话保存失败，请重试。')}
    finally {if(request.current===controller){request.current=null;setBusy(false)}}
  }
  return <><button className="study-floating-chat" type="button" onClick={()=>{setSelected(null);setQuestion('');setError('');setConfirmDelete(null);setOpen(true)}}><MessageCircle size={19}/>问 AI</button>{open&&<div className="lyric-chat-backdrop" onClick={close}><section className="lyric-chat" role="dialog" aria-modal="true" aria-label="问 AI" onClick={event=>event.stopPropagation()}><header>{selected&&<button type="button" aria-label="返回对话列表" onClick={goList}><ChevronLeft size={22}/></button>}<div><h2>{selected?'问 AI':'我的对话'}</h2><small>{selected?`${session?.songTitle||''} · 已带入歌词上下文`:'记录仅保存在当前设备'}</small></div><button type="button" aria-label="关闭问 AI" onClick={close}><X size={22}/></button></header>{!selected?<div className="lyric-chat-list"><button className="lyric-chat-new" type="button" disabled={busy||loading} onClick={create}><Plus size={18}/>新对话 · {song.title}</button>{loading?<p>读取对话…</p>:!sessions.length?<p className="lyric-chat-hint">还没有对话，开始提问吧。</p>:sessions.map(item=><article key={item.id}><button className="lyric-chat-select" type="button" disabled={busy} onClick={()=>{setSelected(item.id);setQuestion('');setError('');setConfirmDelete(null)}}><strong>{item.title}</strong><small>{item.songTitle} · {new Date(item.updatedAt).toLocaleDateString('zh-CN')}</small></button><button className="lyric-chat-delete" type="button" aria-label={`删除对话：${item.title}`} disabled={busy} onClick={()=>confirmDelete===item.id?remove(item.id):setConfirmDelete(item.id)}>{confirmDelete===item.id?'确认删除':<Trash2 size={18}/>}</button></article>)}</div>:<><div className="lyric-chat-messages" aria-live="polite">{session?.messages.length?session.messages.map((message,index)=><div key={index}><p className={message.role}>{message.content}</p>{message.role==='assistant' && message.searchUsed && <small className="lyric-chat-search-used">已联网查询</small>}{message.sources?.length>0 && <div className="lyric-chat-sources">{message.sources.map(source=><button type="button" key={source.url} onClick={()=>Browser.open({url:source.url})}>{source.title}</button>)}</div>}</div>):<p className="lyric-chat-hint">可以询问词义、语法和读音，继续追问会保留对话上下文。</p>}{busy&&<p className="lyric-chat-hint">正在回答…</p>}<div ref={bottom}/></div><form onSubmit={send}><textarea aria-label="向 AI 提问" placeholder="这个词在歌词里是什么意思？" maxLength={2000} value={question} onChange={event=>setQuestion(event.target.value)} disabled={busy}/><button type="submit" aria-label="发送问题" disabled={busy||!question.trim()||!session}><Send size={20}/></button></form><label className="lyric-chat-online"><input type="checkbox" checked={Boolean(aiConfig.web_search_enabled)} disabled={busy||!webSearchAvailable(aiConfig.base_url)} onChange={event=>{try{setWebSearchEnabled(event.target.checked)}catch{setError('无法保存联网设置。')}}}/>启用联网查询</label><small className="lyric-chat-notice">联网查询可能产生更多费用，目前支持 DeepSeek 官方接口。</small><small className="lyric-chat-notice">使用设置中的 AI 服务，发送歌词上下文，可能产生调用费用。</small></>}{error&&<p className="lyric-chat-error" role="alert">{error}</p>}</section></div>}</>
}
