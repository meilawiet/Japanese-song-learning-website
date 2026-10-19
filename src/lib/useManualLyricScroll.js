import { useEffect, useRef } from 'react'
import { createLyricScrollGuard } from './manualLyricScroll'

// 只监听歌词滚动区域；点击按钮不算滑动，弹窗滚动也不干扰当前歌曲。
export default function useManualLyricScroll(enabled, songId, selector) {
  const guardRef = useRef(null)
  useEffect(() => {
    if (!enabled) return undefined
    const element = document.querySelector(selector)
    if (!element) return undefined
    const guard = createLyricScrollGuard({ resume: () => window.dispatchEvent(new Event('uta:study-follow')) })
    guardRef.current = guard
    let start = null, dragging = false
    const down = event => { start = { x:event.clientX, y:event.clientY }; dragging = false }
    const move = event => {
      if (!start || Math.hypot(event.clientX-start.x,event.clientY-start.y)<8 && !dragging) return
      if (!dragging) {
        dragging = true
        // 停止已经发出的平滑居中，让手指立即接管滚动。
        element.scrollTo({top:element.scrollTop,behavior:'instant'})
        guard.begin()
      } else guard.interact()
    }
    const end = () => { start = null; dragging = false; guard.end() }
    const wheel = () => guard.interact()
    const scroll = event => { if (event.target === element) guard.scroll() }
    const key = event => { if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key) && !event.target.closest('input,textarea,select,button')) guard.interact() }
    element.addEventListener('pointerdown',down,{passive:true})
    element.addEventListener('pointermove',move,{passive:true})
    window.addEventListener('pointerup',end,{passive:true})
    window.addEventListener('pointercancel',end,{passive:true})
    element.addEventListener('wheel',wheel,{passive:true})
    element.addEventListener('scroll',scroll,{passive:true})
    element.addEventListener('keydown',key)
    return () => {
      guard.dispose(); if (guardRef.current===guard) guardRef.current=null
      element.removeEventListener('pointerdown',down); element.removeEventListener('pointermove',move)
      window.removeEventListener('pointerup',end); window.removeEventListener('pointercancel',end)
      element.removeEventListener('wheel',wheel); element.removeEventListener('scroll',scroll); element.removeEventListener('keydown',key)
    }
  }, [enabled,songId,selector])
  return guardRef
}
