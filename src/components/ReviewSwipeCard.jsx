import {useEffect,useRef,useState} from 'react'
import {Trash2} from 'lucide-react'

// 左滑仅露出删除按钮，松手不会直接删；优先保留竖向滚动，阻止滑动后的兼容点击。
export default function ReviewSwipeCard({children,onRemove}) {
  const [offset,setOffset]=useState(0),[dragging,setDragging]=useState(false)
  const root=useRef(null),gesture=useRef(null),suppressedUntil=useRef(0),current=useRef(0)
  const width=76
  function moveTo(value){current.current=value;setOffset(value)}
  useEffect(()=>{
    const close=event=>{if(!root.current?.contains(event.target))moveTo(0)}
    const other=event=>{if(event.detail!==root.current)moveTo(0)}
    const escape=event=>{if(event.key==='Escape')moveTo(0)}
    document.addEventListener('pointerdown',close,true);window.addEventListener('uta:review-swipe-open',other);window.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',close,true);window.removeEventListener('uta:review-swipe-open',other);window.removeEventListener('keydown',escape)}
  },[])
  function start(event){
    if(event.button!==0||!event.isPrimary||event.target.closest('button,input,select,textarea,a,summary')&& !event.target.closest('.review-unit-card'))return
    gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,offset:current.current,locked:false,vertical:false}
  }
  function move(event){
    const active=gesture.current;if(!active||active.id!==event.pointerId||active.vertical)return
    const dx=event.clientX-active.x,dy=event.clientY-active.y
    if(!active.locked){
      if(Math.max(Math.abs(dx),Math.abs(dy))<10)return
      if(Math.abs(dy)>=Math.abs(dx)){active.vertical=true;return}
      active.locked=true;setDragging(true);root.current?.setPointerCapture(event.pointerId)
      window.dispatchEvent(new CustomEvent('uta:review-swipe-open',{detail:root.current}))
    }
    suppressedUntil.current=Date.now()+500
    moveTo(Math.max(-width,Math.min(0,active.offset+dx)))
  }
  function end(event){
    const active=gesture.current;if(!active||active.id!==event.pointerId)return
    if(active.locked){moveTo(event.type==='pointercancel'?active.offset:current.current<-width/2?-width:0);suppressedUntil.current=Date.now()+500}
    gesture.current=null;setDragging(false)
    if(root.current?.hasPointerCapture(event.pointerId))root.current.releasePointerCapture(event.pointerId)
  }
  return <div ref={root} className={`review-swipe ${offset<0?'is-open':''} ${dragging?'is-dragging':''}`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onClickCapture={event=>{
    if(event.target.closest('.review-swipe-delete'))return
    if(Date.now()<suppressedUntil.current||current.current<0){event.preventDefault();event.stopPropagation();if(Date.now()>=suppressedUntil.current)moveTo(0)}
  }}>
    <button className="review-swipe-delete" type="button" aria-label="删除这个复习单元" tabIndex={offset<0?0:-1} aria-hidden={offset===0} onClick={event=>{event.stopPropagation();onRemove()}}><Trash2 size={24}/><span>删除</span></button>
    <div className="review-swipe-content" style={{transform:`translateX(${offset}px)`}}>{children}</div>
  </div>
}
