import {useState} from 'react'
import {X} from 'lucide-react'
import {createReviewUnit,MAX_REVIEW_LINES} from '../lib/reviewBook.js'

// 独立范围选择也适用于没有时间戳的纯歌词，不改变原有双击选段播放手势。
export default function ReviewCollector({song,lineId,endId=lineId,onAdd,onClose}) {
  const [start,setStart]=useState(lineId),[end,setEnd]=useState(endId),[error,setError]=useState('')
  const a=song.lines.findIndex(line=>line.id===start),b=song.lines.findIndex(line=>line.id===end)
  const selected=a<0||b<0?[]:song.lines.slice(Math.min(a,b),Math.max(a,b)+1)
  return <div className="review-modal-backdrop" onClick={onClose}><section className="review-collector" role="dialog" aria-modal="true" aria-label="收藏歌词到复习本" onClick={event=>event.stopPropagation()}>
    <header><h2>收藏到复习本</h2><button type="button" aria-label="关闭收藏窗口" onClick={onClose}><X size={22}/></button></header>
    <div className="review-range-fields">{[['起始句',start,setStart],['结束句',end,setEnd]].map(([label,value,change])=><label key={label}>{label}<select aria-label={label} value={value} onChange={event=>{change(Number(event.target.value));setError('')}}>{song.lines.map((line,index)=><option key={line.id} value={line.id}>{index+1}. {line.text}</option>)}</select></label>)}</div>
    <p className="review-collector-count">{selected.length} 行歌词作为一个复习单元</p><div className="review-collector-preview" lang={song.language==='ja'?'ja':undefined}>{selected.map(line=><p key={line.id}>{line.text}</p>)}</div>
    {error&&<p className="review-error" role="alert">{error}</p>}
    <footer><button type="button" onClick={onClose}>取消</button><button type="button" disabled={!selected.length||selected.length>MAX_REVIEW_LINES} onClick={()=>{try{onAdd(createReviewUnit(song,start,end));onClose()}catch(failure){setError(failure.message)}}}>加入复习本</button></footer>
    {selected.length>MAX_REVIEW_LINES&&<p className="review-error">一个复习单元最多选择{MAX_REVIEW_LINES}行。</p>}
  </section></div>
}
