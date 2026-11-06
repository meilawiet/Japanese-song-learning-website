import {useLayoutEffect} from 'react'

// 跟随和手动浏览必须使用同一实际滚动容器；首尾留出空间才能真正居中。
export const studySelector='.unified-study-page .practice-layout'
export function centeredTop(scrollTop,listTop,listHeight,rowTop,rowHeight){return scrollTop+rowTop-listTop-(listHeight-rowHeight)/2}
export function centerDemoLyric(list,row){
 const top=centeredTop(list.scrollTop,list.getBoundingClientRect().top,list.clientHeight,row.getBoundingClientRect().top,row.offsetHeight)
 list.scrollTo({top,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})
}
export function useDemoStudyViewport(enabled,songId){
 useLayoutEffect(()=>{
  if(!enabled)return
  const viewport=document.querySelector(studySelector),list=viewport?.querySelector('.lyrics-list');if(!list)return
  let raf=0,disposed=false
  const measure=()=>{
   if(disposed)return
   const rows=list.querySelectorAll('.lyric-row'),first=rows[0],last=rows[rows.length-1]
   if(!first||!last)return
   // 取消首句居中填充，保留自然列表边界，旧实现保留baseline。
   // 末句同样不额外撑出半屏留白。
   cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>window.dispatchEvent(new Event('uta:study-follow')))
  }
  const observer=new ResizeObserver(measure);observer.observe(viewport);observer.observe(list)
  measure();document.fonts?.ready.then(()=>{if(!disposed)measure()});document.fonts?.addEventListener('loadingdone',measure)
  return()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();document.fonts?.removeEventListener('loadingdone',measure);list.style.removeProperty('--demo-leading-space');list.style.removeProperty('--demo-trailing-space')}
 },[enabled,songId])
}
