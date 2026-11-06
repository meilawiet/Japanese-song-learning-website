import {useLayoutEffect,useRef,useState} from 'react'
import {HOME_PAGES,swipeAxis,swipeDestination,swipeOffset} from '../lib/homeSwipe.js'

// 三页保持挂载与独立滚动位置；同一组transform同时移动两页，手指离开后吸附到目标页。
export default function AndroidHomePager({tab,onSelect,enabled=true,expanded=false,nested=false,children}){
  const root=useRef(null),gesture=useRef(null),latest=useRef({tab,onSelect,enabled}),suppressClick=useRef(0),timer=useRef(null)
  const [offset,setOffset]=useState(0),[dragging,setDragging]=useState(false),[settling,setSettling]=useState(false)
  const reviewScroll=useRef(0)
  latest.current={tab,onSelect,enabled}
  // 点击底栏与滑动共用路由；外部切页/弹窗/尺寸变化时不沿用上次拖动状态。
  useLayoutEffect(()=>{gesture.current=null;setOffset(0);setDragging(false);setSettling(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setSettling(false),260);return()=>clearTimeout(timer.current)},[tab,enabled])
  useLayoutEffect(()=>{const reset=()=>{gesture.current=null;setOffset(0);setDragging(false);setSettling(false)};window.addEventListener('resize',reset);return()=>window.removeEventListener('resize',reset)},[])
  // 复习内页从顶端展示；返回歌曲首页恢复原位置，避免长列表的scrollTop把详情推出屏幕。
  useLayoutEffect(()=>{const pane=root.current.querySelector('[data-home-page="review"]');if(nested){reviewScroll.current=pane.scrollTop;pane.scrollTop=0}else pane.scrollTop=reviewScroll.current},[nested])
  function start(event){
    if(!latest.current.enabled||settling||!event.isPrimary||event.button!==0||gesture.current)return
    // 编辑框/滑块/可编辑文本自行处理手势；模态窗口出现时不允许拖动后方主页。
    if(event.target.closest('input,textarea,select,[contenteditable="true"],[data-home-swipe-ignore]')||document.querySelector('[aria-modal="true"],[role="dialog"],[role="alertdialog"]'))return
    gesture.current={id:event.pointerId,tab:latest.current.tab,x:event.clientX,y:event.clientY,lastX:event.clientX,lastTime:event.timeStamp,velocity:0,dx:0,axis:null,width:root.current.clientWidth}
  }
  function move(event){
    const g=gesture.current;if(!g||g.id!==event.pointerId)return
    if(!latest.current.enabled){finish(event,true);return}
    const dx=event.clientX-g.x,dy=event.clientY-g.y
    if(!g.axis)g.axis=swipeAxis(dx,dy)
    if(g.axis==='vertical'){gesture.current=null;return}
    if(g.axis!=='horizontal')return
    if(!dragging){setDragging(true);root.current.setPointerCapture(event.pointerId)}
    if(event.cancelable)event.preventDefault()
    const elapsed=event.timeStamp-g.lastTime
    if(elapsed>0)g.velocity=(event.clientX-g.lastX)/elapsed
    g.lastX=event.clientX;g.lastTime=event.timeStamp;g.dx=dx
    setOffset(swipeOffset(g.tab,dx,g.width))
  }
  function finish(event,cancelled=false){
    const g=gesture.current;if(!g||event.pointerId!==g.id)return
    gesture.current=null
    if(g.axis!=='horizontal')return
    suppressClick.current=performance.now()+350
    const velocity=event.timeStamp-g.lastTime>100?0:g.velocity
    const target=swipeDestination(g.tab,g.dx,velocity,g.width,cancelled)
    setDragging(false);setOffset(0);setSettling(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setSettling(false),260)
    if(target!==latest.current.tab)latest.current.onSelect(target)
  }
  // 原onLostPointerCapture={event=>finish(event,true)}会收到子节点隐式捕获转移的冒泡事件，刚拖动就被取消，只表现为颤抖。
  // 仅容器自身真正丢失捕获才取消；触摸从子节点移交给容器是正常流程。
  return <div ref={root} className="android-home-pager" data-dragging={dragging?'true':'false'} data-moving={dragging||settling?'true':'false'} data-expanded={expanded?'true':'false'} onPointerDownCapture={start} onPointerMoveCapture={move} onPointerUpCapture={event=>finish(event)} onPointerCancelCapture={event=>finish(event,true)} onLostPointerCapture={event=>{if(event.target===event.currentTarget)finish(event,true)}} onClickCapture={event=>{if(performance.now()<suppressClick.current){event.preventDefault();event.stopPropagation()}}}>
    {HOME_PAGES.map((page,index)=><div key={page} className="android-home-pane" data-home-page={page} aria-hidden={page!==tab} inert={page!==tab?true:undefined} style={{transform:`translate3d(calc(${(index-HOME_PAGES.indexOf(tab))*100}% + ${offset}px),0,0)`}}>{children[page]}</div>)}
  </div>
}
