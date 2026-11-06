import {useEffect,useRef,useState} from 'react'
import {sliderDirection,sliderValue} from './imageGestureMath.mjs'

// 原生range保留键盘/读屏语义；触摸由方向锁定的轨道处理，松手才提交。
export default function SafeRange({label,value,min,max,unit,onChange,onPreview,id}){
 const [draft,setDraft]=useState(value),session=useRef(null),current=useRef(value),input=useRef(null)
 useEffect(()=>{if(!session.current){setDraft(value);current.current=value}},[value])
 function down(e){if(e.pointerType==='mouse'&&e.button!==0)return;session.current={id:e.pointerId,x:e.clientX,y:e.clientY,value,direction:null,width:e.currentTarget.getBoundingClientRect().width}}
 function drag(e){const s=session.current;if(!s||s.id!==e.pointerId)return;const dx=e.clientX-s.x,dy=e.clientY-s.y;s.direction ||= sliderDirection(dx,dy)
  if(s.direction==='horizontal'){e.preventDefault();if(!e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.setPointerCapture(e.pointerId);current.current=sliderValue(s.value,dx,s.width,min,max);setDraft(current.current);onPreview?.(current.current)}
 }
 function finish(e,cancelled=false){const s=session.current;if(!s||s.id!==e.pointerId)return;session.current=null;onPreview?.(null);if(!cancelled&&s.direction==='horizontal')onChange(current.current);else{current.current=value;setDraft(value)}}
 return <div className="safe-range" role="group" aria-label={label}>
  <div className="safe-range-caption"><label htmlFor={id}>{label}</label><output htmlFor={id}>{draft}{unit}</output></div>
  <div className="safe-range-surface" onPointerDown={down} onPointerMove={drag} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)} onClick={e=>{e.preventDefault();input.current?.focus({preventScroll:true})}}>
   <div className="safe-range-track" aria-hidden="true"><i style={{width:`${(draft-min)/(max-min)*100}%`}}/><b style={{left:`${(draft-min)/(max-min)*100}%`}}/></div>
   <input ref={input} id={id} type="range" aria-label={label} min={min} max={max} step="1" value={draft} onChange={e=>{current.current=Number(e.target.value);setDraft(current.current);onChange(current.current)}}/>
  </div>
 </div>
}
