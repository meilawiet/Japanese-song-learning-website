import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'
import { buildLyricChatContext, buildLyricChatPayload } from '../lib/lyricChat'
import { postMobileAi } from '../lib/mobileAi'
// 新版支持历史选择与本地持久化；原单次会话实现保留供对照。
export { default } from './LyricChatHistory'

// 每首歌独立的会话仅存在本次页面中；关闭对话取消等待，返回键先关闭对话。
function LegacyLyricChat({ song, lineId, annotations, corrections }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(null)
  const bottom = useRef(null)
  const close = () => { request.current?.abort(); request.current = null; setBusy(false); setOpen(false) }
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (!open) return undefined
    // 弹层内滚动对话，阻止背后的歌词页面跟着滚动。
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const back = event => { event.preventDefault(); close() }
    window.addEventListener('uta:navigate-back', back)
    return () => { document.body.style.overflow = overflow; window.removeEventListener('uta:navigate-back', back) }
  }, [open])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [messages, busy, open])
  async function send(event) {
    event.preventDefault()
    if (busy || !question.trim()) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setError('')
    const content = question.trim()
    const payload = buildLyricChatPayload(buildLyricChatContext(song, lineId, annotations, corrections), messages, content)
    try {
      const answer = await postMobileAi('/api/ai/lyric-chat', payload, undefined, controller.signal)
      if (controller.signal.aborted) return
      setMessages(previous => [...previous, { role: 'user', content }, { role: 'assistant', content: answer.answer }])
      setQuestion('')
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message) }
    finally { if (request.current === controller) { request.current = null; setBusy(false) } }
  }
  return <><button className="study-floating-chat" type="button" onClick={() => setOpen(true)}><MessageCircle size={19} />问 AI</button>{open && <div className="lyric-chat-backdrop" onClick={close}><section className="lyric-chat" role="dialog" aria-modal="true" aria-label="问 AI" onClick={event => event.stopPropagation()}><header><div><h2>问 AI</h2><small>{song.title} · 已带入歌词上下文</small></div><button type="button" aria-label="关闭问 AI" onClick={close}><X size={22} /></button></header><div className="lyric-chat-messages" aria-live="polite">{messages.length ? messages.map((message, index) => <p key={index} className={message.role}>{message.content}</p>) : <p className="lyric-chat-hint">可以询问歌词中的词义、语法或读音，继续追问也会保留本次对话上下文。</p>}{busy && <p className="lyric-chat-hint">正在回答…</p>}<div ref={bottom} /></div>{error && <p className="lyric-chat-error" role="alert">{error}</p>}<form onSubmit={send}><textarea aria-label="向 AI 提问" placeholder="这个词在歌词里是什么意思？" maxLength={2000} value={question} onChange={event => setQuestion(event.target.value)} disabled={busy} /><button type="submit" aria-label="发送问题" disabled={busy || !question.trim()}><Send size={20} /></button></form><small className="lyric-chat-notice">使用设置中的 AI 服务，发送歌词上下文，可能产生调用费用。</small></section></div>}</>
}
