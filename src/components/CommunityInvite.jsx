import { useCallback, useEffect, useRef, useState } from 'react'
import { registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'
import useModalScrollLock from '../lib/useModalScrollLock'
import { QQ_GROUP, INVITE_IDLE_DELAY, readInvitePreference, inviteDueAt, claimInviteDisplay, setInviteOptOut } from '../lib/communityInvite'

// 复用关于页的原生内置反馈页，不跳转浏览器或 QQ，也不自动加入群聊。
const feedback = registerPlugin('UtaFeedback')
const otherDialog = () => Boolean(document.querySelector('[aria-modal="true"],[role="dialog"],[role="alertdialog"]'))
const mediaPlaying = () => [...document.querySelectorAll('audio,video')].some(media => !media.paused && !media.ended)

export function CommunityInviteDialog({ onClose }) {
  const root = useRef(null)
  const [optedOut, setOptedOut] = useState(false)
  const [notice, setNotice] = useState('')
  const [opening, setOpening] = useState(false)
  useModalScrollLock()
  useEffect(() => {
    const previous = document.activeElement
    root.current?.querySelector('button')?.focus()
    const back = event => { event.preventDefault(); event.stopImmediatePropagation(); onClose() }
    const key = event => {
      if (event.key === 'Escape') { back(event); return }
      if (event.key !== 'Tab') return
      const controls = [...root.current.querySelectorAll('button:not(:disabled),input')]
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus() }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus() }
    }
    window.addEventListener('uta:navigate-back', back, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('uta:navigate-back', back, true)
      window.removeEventListener('keydown', key, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [onClose])
  const copyGroup = async () => {
    try { await navigator.clipboard.writeText(QQ_GROUP); setNotice('已复制群号，请在 QQ 中搜索加入。') }
    catch { setNotice(`请在 QQ 中搜索群号：${QQ_GROUP}。`) }
  }
  const openFeedback = async () => {
    if (opening) return
    setOpening(true); setNotice('')
    try { await feedback.open(); onClose() }
    catch { setOpening(false); setNotice('无法打开建议与反馈，请稍后重试。') }
  }
  return <div className="community-invite-backdrop" onClick={onClose}>
    <section ref={root} className="community-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="community-invite-title" aria-describedby="community-invite-description" onClick={event => event.stopPropagation()}>
      <h2 id="community-invite-title">欢迎来聊聊</h2>
      <div id="community-invite-description">
        <p>欢迎加入 UTA 交流群，分享喜欢的歌曲和学习心得。</p>
        <p>遇到问题，或者有想要的功能，也欢迎通过「建议与反馈」告诉我们。</p>
        <p className="community-invite-group">QQ 群：{QQ_GROUP}</p>
      </div>
      <div className="community-invite-actions">
        <button type="button" onClick={copyGroup}>复制群号</button>
        <button type="button" onClick={openFeedback} disabled={opening}>{opening ? '正在打开…' : '建议与反馈'}</button>
      </div>
      <p className="community-invite-notice" role="status">{notice}</p>
      <div className="community-invite-bottom">
        <label><input type="checkbox" checked={optedOut} onChange={event => {
          const next = event.target.checked
          setOptedOut(next)
          // 本机写入失败时明确提示，不假称永久保存成功。
          if (!setInviteOptOut(localStorage, next)) setNotice('提醒设置未能保存，请稍后重试。')
        }} />不再提醒</label>
        <button type="button" onClick={onClose}>暂时不用</button>
      </div>
    </section>
  </div>
}

// 只在三个主页、应用前台且连续十秒无操作时提醒；其他对话框和播放始终优先。
export default function CommunityInvite({ eligible, routeKey }) {
  const [ready, setReady] = useState(false)
  const [foreground, setForeground] = useState(false)
  const [visible, setVisible] = useState(false)
  const shownThisSession = useRef(false)
  const close = useCallback(() => setVisible(false), [])
  useEffect(() => {
    setReady(Boolean(readInvitePreference(localStorage)))
    let alive = true, listener
    App.getState().then(state => { if (alive) setForeground(state.isActive) }).catch(() => {})
    App.addListener('appStateChange', state => { if (alive) setForeground(state.isActive) })
      .then(handle => { if (alive) listener = handle; else handle.remove() }).catch(() => {})
    return () => { alive = false; listener?.remove() }
  }, [])
  useEffect(() => {
    if (!eligible || !foreground) close()
    if (!ready || !eligible || !foreground || visible || shownThisSession.current) return undefined
    let timer
    const arm = () => {
      clearTimeout(timer)
      if (document.visibilityState !== 'visible' || otherDialog() || mediaPlaying()) return
      const due = inviteDueAt(readInvitePreference(localStorage))
      if (!Number.isFinite(due)) return
      // 浏览器定时器有 32 位上限，超长等待分段处理；回到前台会重新核对实际日期。
      timer = setTimeout(() => {
        if (document.visibilityState !== 'visible' || otherDialog() || mediaPlaying()) return
        if (claimInviteDisplay(localStorage)) { shownThisSession.current = true; setVisible(true) }
        else arm()
      }, Math.min(2147483647, Math.max(INVITE_IDLE_DELAY, due - Date.now())))
    }
    const visibility = () => { if (document.visibilityState !== 'visible') close(); arm() }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchmove', 'play', 'pause', 'ended']
    for (const name of events) window.addEventListener(name, arm, true)
    document.addEventListener('visibilitychange', visibility)
    // 子组件自己管理的弹窗也会阻止提醒；仅在弹窗状态改变时重置空闲时间。
    let blocked = otherDialog()
    const observer = new MutationObserver(() => { const next = otherDialog(); if (next !== blocked) { blocked = next; arm() } })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal'] })
    arm()
    return () => { clearTimeout(timer); observer.disconnect(); for (const name of events) window.removeEventListener(name, arm, true); document.removeEventListener('visibilitychange', visibility) }
  }, [ready, eligible, foreground, routeKey, visible, close])
  return visible ? <CommunityInviteDialog onClose={close} /> : null
}
