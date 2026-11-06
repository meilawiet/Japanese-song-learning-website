import {useEffect,useRef,useState} from 'react'
import {frame,move,pinch} from './imageGestureMath.mjs'

// 单指移动、双指缩放只在图片窗口内接管触摸；窗口外仍正常滚动。
export default function ImageGestureEditor({src,imageWidth,imageHeight,value,onChange,kind='background',aspectRatio=1}){
 const surface=useRef(null),points=useRef(new Map()),session=useRef(null),latest=useRef(value),callback=useRef(onChange)
 const [draft,setDraft]=useState(value),[view,setView]=useState({width:1,height:1})
 callback.current=onChange
 const image={width:imageWidth,height:imageHeight}
 function update(next){latest.current=next;setDraft(next)}
 useEffect(()=>{if(!session.current)update({x:value.x,y:value.y,zoom:value.zoom||1})},[value.x,value.y,value.zoom])
 useEffect(()=>{const el=surface.current;const resize=()=>{const r=el.getBoundingClientRect();setView({width:r.width,height:r.height})};resize();const observer=new ResizeObserver(resize);observer.observe(el);return()=>observer.disconnect()},[])
 function rebase(){const p=[...points.current.values()];session.current={original:session.current?.original||latest.current,value:latest.current,points:p}}
 function down(event){if(event.pointerType==='mouse'&&event.button!==0)return;event.preventDefault();const r=surface.current.getBoundingClientRect();points.current.set(event.pointerId,{x:event.clientX-r.left,y:event.clientY-r.top});surface.current.setPointerCapture(event.pointerId);rebase()}
 function drag(event){if(!points.current.has(event.pointerId))return;event.preventDefault();const r=surface.current.getBoundingClientRect();points.current.set(event.pointerId,{x:event.clientX-r.left,y:event.clientY-r.top});const current=[...points.current.values()],s=session.current;if(!s)return
  if(current.length===1)update(move(image,view,s.value,current[0].x-s.points[0].x,current[0].y-s.points[0].y))
  else if(current.length>=2&&s.points.length>=2){const mid=p=>({x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2}),distance=p=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);update(pinch(image,view,s.value,mid(s.points),mid(current),distance(current)/Math.max(distance(s.points),1)))}
 }
 function up(event){if(!points.current.has(event.pointerId))return;points.current.delete(event.pointerId);if(points.current.size)rebase();else{session.current=null;callback.current(latest.current)}}
 function cancel(event){if(!points.current.has(event.pointerId))return;const original=session.current?.original;points.current.clear();session.current=null;if(original)update(original)}
 function change(next){update(next);callback.current(next)}
 function zoomBy(ratio){const mid={x:view.width/2,y:view.height/2};change(pinch(image,view,latest.current,mid,mid,ratio))}
 const f=frame(image,view,draft),title=kind==='avatar'?'头像':'背景'
 return <div className={'gesture-editor gesture-editor-'+kind}>
  <div className="gesture-image-shell" style={{paddingTop:`${100/aspectRatio}%`}}><div ref={surface} className="gesture-image-surface" tabIndex={0} role="group" aria-label={`${title}裁剪区域，单指拖动，双指缩放`} data-zoom={draft.zoom} data-x={draft.x} data-y={draft.y} onPointerDown={down} onPointerMove={drag} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={e=>{const deltas={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]};if(deltas[e.key]){e.preventDefault();change(move(image,view,latest.current,...deltas[e.key]))}else if(e.key==='+'||e.key==='='){e.preventDefault();zoomBy(1.1)}else if(e.key==='-'){e.preventDefault();zoomBy(1/1.1)}}}>
   <img src={src} alt="" draggable={false} style={{position:'absolute',maxWidth:'none',width:f.width,height:f.height,left:f.left,top:f.top}}/>
   {kind==='avatar'&&<div className="gesture-avatar-guide" aria-hidden="true"/>}
  </div></div>
  <p className="gesture-hint">单指拖动 · 双指缩放</p><div className="gesture-image-actions"><button type="button" aria-label={`缩小${title}`} disabled={draft.zoom<=1} onClick={()=>zoomBy(1/1.2)}>−</button><output aria-label="缩放比例">{Math.round(draft.zoom*100)}%</output><button type="button" aria-label={`放大${title}`} disabled={draft.zoom>=3} onClick={()=>zoomBy(1.2)}>＋</button><button type="button" onClick={()=>change({x:.5,y:.5,zoom:1})}>重置位置</button></div>
 </div>
}
