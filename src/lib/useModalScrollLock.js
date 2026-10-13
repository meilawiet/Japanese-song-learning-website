import { useLayoutEffect } from 'react'

// 所有弹窗共享锁：嵌套窗口关闭一个时，不提前释放仍打开的窗口。
let users=0,snapshot=null
const bodyProperties=['position','top','left','right','width','overflow']
const rootProperties=['overflow','overscrollBehavior','scrollBehavior']
const save=(style,properties)=>Object.fromEntries(properties.map(property=>[property,style[property]]))
const restore=(style,values)=>Object.entries(values).forEach(([property,value])=>{style[property]=value})

export function lockModalScroll() {
  const body=document.body,root=document.documentElement
  if(users++===0){
    snapshot={x:window.scrollX,y:window.scrollY,body:save(body.style,bodyProperties),root:save(root.style,rootProperties)}
    // 仅 overflow:hidden 在移动 WebView 中不足以阻止滑动穿透，固定页面并保留原位置。
    Object.assign(body.style,{position:'fixed',top:`-${snapshot.y}px`,left:`-${snapshot.x}px`,right:'0',width:'100%',overflow:'hidden'})
    Object.assign(root.style,{overflow:'hidden',overscrollBehavior:'none',scrollBehavior:'auto'})
  }
  let released=false
  return ()=>{
    if(released)return;released=true
    if(--users!==0)return
    const saved=snapshot;snapshot=null
    restore(body.style,saved.body)
    // 禁止全局 smooth 导致关闭后慢慢漂回原位置；恢复后再还原页面滚动设置。
    restore(root.style,{...saved.root,scrollBehavior:'auto'})
    window.scrollTo({left:saved.x,top:saved.y,behavior:'instant'})
    root.style.scrollBehavior=saved.root.scrollBehavior
  }
}

export default function useModalScrollLock(open=true) {
  useLayoutEffect(()=>{if(open)return lockModalScroll()},[open])
}
