import {useEffect,useRef} from 'react'
import {createPortal} from 'react-dom'
import ImageGestureEditor from './ImageGestureEditor.jsx'

// 图片调整单独全屏展示，主题设置的纵向滚动不会误触图片或参数。
export default function BackgroundGestureDialog({image,background,onChange,onClose}){
 const close=useRef(null),onCloseRef=useRef(onClose);onCloseRef.current=onClose
 useEffect(()=>{const prior=document.activeElement;close.current?.focus();const back=e=>{e.preventDefault();e.stopImmediatePropagation();onCloseRef.current()};window.addEventListener('uta:navigate-back',back,true);return()=>{window.removeEventListener('uta:navigate-back',back,true);prior?.focus?.()}},[])
 return createPortal(<div className="gesture-dialog-backdrop"><section className="gesture-dialog" role="dialog" aria-modal="true" aria-label="调整背景位置与缩放" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}if(e.key==='Tab'){const els=[...e.currentTarget.querySelectorAll('button:not(:disabled),[tabindex="0"]')];const index=els.indexOf(document.activeElement);if(e.shiftKey&&index===0){e.preventDefault();els.at(-1)?.focus()}else if(!e.shiftKey&&index===els.length-1){e.preventDefault();els[0]?.focus()}}}}>
  <header><div><h2>调整背景</h2><p>拖动图片，保留喜欢的区域</p></div><button ref={close} type="button" onClick={onClose}>完成</button></header>
  <div className="gesture-dialog-content"><ImageGestureEditor src={image.url} imageWidth={image.width} imageHeight={image.height} kind="background" aspectRatio={(window.innerWidth+28)/(window.innerHeight+28)} value={{x:background.x/100,y:background.y/100,zoom:background.zoom||1}} onChange={next=>onChange({x:next.x*100,y:next.y*100,zoom:next.zoom})}/></div>
 </section></div>,document.body)
}
