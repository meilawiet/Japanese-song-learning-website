import { useEffect, useRef, useState } from 'react'
import useModalScrollLock from '../lib/useModalScrollLock'
// 原来只有关闭图标，新增与逐句播放一致的试听/暂停入口。
import { Pause, Play, X } from 'lucide-react'
// 原导入仅复核；二次调整让待核对问题同样可以选择并交给AI处理。
import { adjustSelectedLyricIssues, reviewImportedLyrics } from '../lib/annotationApi'
import { adjustmentFeedback, groupReviewEntries } from '../lib/lyricAiReview'
import { plainLyric, prepareLyricReadings, tokenReading } from '../lib/lyricReadings'
import { tokenRanges } from '../lib/lyricSegmentation'
import { createReviewRecord, deleteReviewRecord, listReviewRecords, recordDecisions, saveReviewRecord, suggestionKey } from '../lib/lyricReviewHistory'

// AI 不直接改数据：复核、逐条预览、用户确认后采用，系统返回可取消请求。
// 旧会话缓存界面保留对照；新界面在下方增加本机历史与决策状态。
function PreviousLyricAiReview({song,annotations,corrections,onApply,onClose,initialResult=null,onResult,onPlay,playingLineId,audioReady=false,audioError=''}) {
  // 原结果初始化为 null；关闭重开时复用有效快照，不自动重复扣费请求。
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[result,setResult]=useState(initialResult)
  const [selected,setSelected]=useState(new Set()),[error,setError]=useState('')
  const [selectedIssues,setSelectedIssues]=useState(new Set()),[adjusting,setAdjusting]=useState(false)
  const [feedback,setFeedback]=useState(null)
  const controller=useRef(null)
  const dialogRef=useRef(null)
  useEffect(()=>()=>controller.current?.abort(),[])
  useEffect(()=>{
    const back=event=>{event.preventDefault();onClose()}
    window.addEventListener('uta:navigate-back',back)
    return ()=>window.removeEventListener('uta:navigate-back',back)
  },[onClose])
  async function run(){
    controller.current=new AbortController();const signal=controller.current.signal
    setBusy(true);setError('');setFeedback(null);setResult(null);setProgress(0);setSelected(new Set());setSelectedIssues(new Set())
    try{
      const next=await reviewImportedLyrics(song,annotations,corrections,value=>{if(!signal.aborted)setProgress(value)},signal)
      if(!signal.aborted){setResult(next);onResult?.(next)}
    }catch(reason){if(!signal.aborted)setError(reason.message || 'AI复核失败，请重试。')}
    finally{if(!signal.aborted)setBusy(false)}
  }
  async function adjust(){
    controller.current=new AbortController();const signal=controller.current.signal
    setBusy(true);setAdjusting(true);setError('');setFeedback(null);setProgress(0)
    try{
      const next=await adjustSelectedLyricIssues(song,result,corrections,[...selectedIssues],value=>{if(!signal.aborted)setProgress(value)},signal)
      if(!signal.aborted){
        setResult(next.result);onResult?.(next.result);setSelectedIssues(new Set())
        // 用户明确选中的问题生成具体建议后默认勾选，仍需点“采用”确认保存。
        // 较明确建议可以预选；缺乏原唱依据的候选必须试听后由用户主动勾选。
        // 原来所有新建议均自动勾选。
        setSelected(previous=>new Set([...previous,...next.newSuggestions.filter(item=>!item.needs_confirmation).map(item=>`${item.line_id}:${item.token_index}`)]))
        // 原来只有零条建议才提示，部分失败没有红字；现在始终给出本次结果。
        // if(!next.newSuggestions.length)setError('AI暂未给出可采用的具体读音，请查看问题说明；歌词数据未改变。')
        setFeedback(adjustmentFeedback(next.newSuggestions.length,next.unresolvedCount))
        dialogRef.current?.scrollTo({top:0,behavior:'smooth'})
      }
    }catch(reason){if(!signal.aborted){setError(reason.message || 'AI调整失败，请重试。');dialogRef.current?.scrollTo({top:0,behavior:'smooth'})}}
    finally{if(!signal.aborted){setBusy(false);setAdjusting(false)}}
  }
  function apply(){
    try{onApply(result,[...selected]);onClose()}catch(reason){setError(reason.message || '保存失败。')}
  }
  const number=id=>song.lines.findIndex(line=>line.id===id)+1
  // 使用已有逐句播放器，到下一句时间点停下；不改变对话结果，不调用AI。
  const listen=id=><button className="lyric-ai-listen" type="button" disabled={!audioReady} onClick={()=>onPlay?.(id)} aria-label={`${playingLineId===id?'暂停':'试听'}第 ${number(id)} 句`}>
    {playingLineId===id?<Pause size={16}/>:<Play size={16}/>} {playingLineId===id?'暂停试听':'试听这一句'}
  </button>
  return <div className="line-editor-backdrop" onClick={onClose}><section ref={dialogRef} className="line-editor lyric-ai-review" role="dialog" aria-modal="true" aria-labelledby="lyric-ai-review-title" onClick={event=>event.stopPropagation()}>
    <header><h2 id="lyric-ai-review-title">AI复核歌词</h2><button type="button" aria-label="关闭AI复核" onClick={onClose}><X size={20}/></button></header>
    <p>结合整曲上下文检查遗漏和异常读音。优先依据歌词自带罗马音，保留人工修改及主动留空；英语默认按原文保留。</p>
    <small>将歌词、翻译和读音发送给设置中的AI服务，可能产生调用费用。AI无法保证还原原唱，结果需要你确认。</small>
    {/* 反馈放在结果上方，调整完成滚动到这里；异常无需用户翻到长列表末尾寻找。 */}
    {error&&<p className="line-editor-error" role="alert">{error}</p>}
    {feedback&&<p className={feedback.warning?'line-editor-error':'lyric-ai-feedback'} role={feedback.warning?'alert':'status'}>{feedback.message}</p>}
    {Boolean(result?.rejected_count)&&<p className="line-editor-error" role="alert">AI有 {result.rejected_count} 条结果缺少可靠的修改依据，已略过，未写入歌词数据。</p>}
    {Boolean(result?.rejected_items?.length)&&<details><summary>查看略过原因</summary>{result.rejected_items.map((item,index)=><p key={index}>{Number.isInteger(item.line_id)?`第 ${number(item.line_id)} 句：`:''}{item.reason}</p>)}</details>}
    {audioError&&<p className="line-editor-error" role="alert">{audioError}</p>}
    {busy&&<p role="status">{adjusting?'正在调整选中问题':'正在复核'}，已处理 {progress} 句…</p>}
    {result&&<><p role="status">复核完成：{result.suggestions.length} 条读音建议，{result.issues.length} 条待核对问题。</p>
      {/* 原布局把建议、问题分开列出，每条重复句号和试听按钮；改为按原句聚合。 */}
      {groupReviewEntries(song,result).map(group=><section className="lyric-ai-line-group" key={group.line.id} aria-label={`第 ${group.number} 句复核结果`}>
        <div className="lyric-ai-line-head"><strong>第 {group.number} 句</strong>{listen(group.line.id)}</div>
        <p className="lyric-ai-original" lang="ja">{plainLyric(group.line.text)}</p>
        <ul>{group.suggestions.map(item=>{const key=`${item.line_id}:${item.token_index}`;return <li key={key}>
          <label><input type="checkbox" disabled={busy} checked={selected.has(key)} onChange={event=>setSelected(previous=>{const next=new Set(previous);event.target.checked?next.add(key):next.delete(key);return next})}/><strong>{item.surface}</strong></label>
          <p>{item.original_reading||'未标注'} → {item.suggested_reading}</p><small>{item.reason}</small>
          {item.needs_confirmation&&<small className="lyric-ai-candidate">特殊读音候选 · 请试听确认后勾选</small>}
        </li>})}{group.issues.map(item=><li key={`issue:${item.issueIndex}`}>
          <label><input type="checkbox" disabled={busy} checked={selectedIssues.has(item.issueIndex)} onChange={event=>setSelectedIssues(previous=>{const next=new Set(previous);event.target.checked?next.add(item.issueIndex):next.delete(item.issueIndex);return next})}/><strong>待调整问题</strong></label><p>{item.reason}</p>
        </li>)}</ul>
      </section>)}
      {result.issues.length>0&&<button className="lyric-ai-adjust" type="button" disabled={busy||!selectedIssues.size} onClick={adjust}>AI调整选中问题（{selectedIssues.size}）</button>}
      {!result.suggestions.length&&!result.issues.length&&!result.rejected_count&&<p>本次未发现明确需要补充或修改的内容。</p>}
    </>}
    {/* 原错误放在长列表最末尾：error&&<p className="line-editor-error" role="alert">{error}</p> */}
    {/* 原采用按钮未限制二次请求；调整完成后才允许保存，避免使用处理中旧建议。 */}
    <footer>{result&&<button type="button" disabled={busy} onClick={run}>重新复核</button>}<button type="button" onClick={onClose}>{busy?'取消复核':'关闭'}</button>{result?<button type="button" disabled={busy||!selected.size} onClick={apply}>采用选中建议（{selected.size}）</button>:<button type="button" disabled={busy} onClick={run}>{busy?'复核中…':'开始复核'}</button>}</footer>
  </section></div>
}

// 持久化历史和用户决定；AI只生成建议，首次和历史采纳都需要用户勾选确认。
export default function LyricAiReview({song,annotations=[],corrections={},onApply,onClose,initialResult=null,onResult,onPlay,playingLineId,audioReady=false,audioError=''}) {
  // 查看结果、历史和试听时只滚动复核内容，不带动背景歌词。
  useModalScrollLock()
  const [result,setResult]=useState(initialResult),[record,setRecord]=useState(null),[history,setHistory]=useState([])
  const [historyOpen,setHistoryOpen]=useState(false),[deleteId,setDeleteId]=useState(null),[historical,setHistorical]=useState(false)
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[adjusting,setAdjusting]=useState(false)
  const [selected,setSelected]=useState(new Set()),[selectedIssues,setSelectedIssues]=useState(new Set())
  const [error,setError]=useState(''),[feedback,setFeedback]=useState(null)
  const controller=useRef(null),dialog=useRef(null)
  useEffect(()=>{let active=true;listReviewRecords(song.id).then(records=>{if(active)setHistory(records)}).catch(()=>{if(active)setError('复核历史读取失败，请重开后重试。')});return()=>{active=false;controller.current?.abort()}},[song.id])
  useEffect(()=>{const back=event=>{event.preventDefault();if(historyOpen)setHistoryOpen(false);else onClose()};window.addEventListener('uta:navigate-back',back);return()=>window.removeEventListener('uta:navigate-back',back)},[onClose,historyOpen])
  const updateRecord=async next=>{
    // 保存失败明确提示，不能把未落盘的决定假装成已永久保存。
    await saveReviewRecord(next);setRecord(next);setHistory(previous=>[next,...previous.filter(item=>item.id!==next.id)].sort((a,b)=>b.createdAt-a.createdAt))
  }
  const remember=async next=>{setResult(next);onResult?.(next);await updateRecord(createReviewRecord(song,next));setHistorical(false)}
  const toggle=(setter,key,checked)=>setter(previous=>{const next=new Set(previous);checked?next.add(key):next.delete(key);return next})
  async function run(){
    controller.current=new AbortController();const signal=controller.current.signal
    setBusy(true);setAdjusting(false);setError('');setFeedback(null);setResult(null);setRecord(null);setProgress(0);setSelected(new Set());setSelectedIssues(new Set());setHistoryOpen(false)
    try{const next=await reviewImportedLyrics(song,annotations,corrections,value=>{if(!signal.aborted)setProgress(value)},signal);if(!signal.aborted)await remember(next)}
    catch(reason){if(!signal.aborted)setError(reason.message||'AI复核失败，请重试。')}
    finally{if(!signal.aborted)setBusy(false)}
  }
  async function adjust(){
    controller.current=new AbortController();const signal=controller.current.signal
    setBusy(true);setAdjusting(true);setError('');setFeedback(null);setProgress(0)
    try{
      const next=await adjustSelectedLyricIssues(song,result,corrections,[...selectedIssues],value=>{if(!signal.aborted)setProgress(value)},signal)
      if(!signal.aborted){await remember(next.result);setSelected(new Set());setSelectedIssues(new Set());setFeedback(adjustmentFeedback(next.newSuggestions.length,next.unresolvedCount));dialog.current?.scrollTo({top:0,behavior:'smooth'})}
    }catch(reason){if(!signal.aborted)setError(reason.message||'AI调整失败，请重试。')}
    finally{if(!signal.aborted){setBusy(false);setAdjusting(false)}}
  }
  async function apply(){
    setBusy(true);setError('')
    try{
      // 采用后保留弹窗，立即展示状态，用户可以继续处理同一记录的其他建议。
      await onApply(result,[...selected],historical||Boolean(Object.values(record?.decisions||{}).some(value=>value.status==='adopted')))
      await updateRecord(recordDecisions(record||createReviewRecord(song,result),[...selected],'adopted'))
      setFeedback({warning:false,message:`已采用 ${selected.size} 条建议，决定已保存到复核历史。`});setSelected(new Set());setHistorical(true)
    }catch(reason){setError(reason.message||'采用失败，请重试。')}
    finally{setBusy(false)}
  }
  async function skip(){
    setBusy(true);setError('')
    try{
      const next=recordDecisions(record||createReviewRecord(song,result),[...selected],'skipped')
      next.issueDecisions={...next.issueDecisions}
      for(const index of selectedIssues)next.issueDecisions[index]={status:'skipped',skippedAt:Date.now()}
      await updateRecord(next);setSelected(new Set());setSelectedIssues(new Set());setFeedback({warning:false,message:'选中项已跳过，仍可在历史中重新选择采用。'})
    }catch(reason){setError(reason.message||'保存跳过状态失败。')}
    finally{setBusy(false)}
  }
  async function remove(id){
    try{await deleteReviewRecord(id);setHistory(previous=>previous.filter(item=>item.id!==id));setDeleteId(null);if(record?.id===id){setRecord(null);setResult(null);setSelected(new Set());setSelectedIssues(new Set());onResult?.(null)}}catch(reason){setError(reason.message||'删除失败。')}
  }
  function openRecord(item){setRecord(item);setResult(item.result);setHistorical(true);setHistoryOpen(false);setSelected(new Set());setSelectedIssues(new Set());setError('');setFeedback(null);dialog.current?.scrollTo({top:0})}
  const number=id=>song.lines.findIndex(line=>line.id===id)+1
  const listen=id=><button className="lyric-ai-listen" type="button" disabled={!audioReady} onClick={()=>onPlay?.(id)} aria-label={`${playingLineId===id?'暂停':'试听'}第 ${number(id)} 句`}>{playingLineId===id?<Pause size={16}/>:<Play size={16}/>} {playingLineId===id?'暂停试听':'试听这一句'}</button>
  // 历史展示当时原文，即使当前歌词已变化仍可查看；采用时再校验当前版本。
  const displaySong=historical&&record?{...song,lines:record.songLines}:song
  const available=result?.suggestions.filter(item=>record?.decisions?.[suggestionKey(item)]?.status!=='adopted')||[]
  const currentReading=item=>{
    const line=song.lines.find(line=>line.id===item.line_id),annotation=annotations.find(value=>value.id===item.line_id)
    if(!line||!annotation||!item.anchor)return null
    const prepared=prepareLyricReadings(annotation.tokens,line.romaji,corrections,song.id,line.id)
    return tokenRanges(prepared.tokens).filter(value=>value.start>=item.anchor.start&&value.end<=item.anchor.end).map(({token})=>tokenReading(token,corrections,song.id,line.id)).join('')
  }
  return <div className="line-editor-backdrop" onClick={()=>{if(!busy)onClose()}}><section ref={dialog} className="line-editor lyric-ai-review" role="dialog" aria-modal="true" aria-labelledby="lyric-ai-review-title" onClick={event=>event.stopPropagation()}>
    <header><h2 id="lyric-ai-review-title">AI复核歌词</h2><button type="button" aria-label="关闭AI复核" onClick={onClose}><X size={20}/></button></header>
    <p>先核对词组划分，再检查读音。AI也可质疑人工编辑；你可以采用或跳过，每次决定保存在本机历史中。</p>
    <small>歌词、翻译与读音会发给设置中的AI服务，可能产生调用费用。AI未听取录音，特殊唱法请试听确认。</small>
    <button className="lyric-ai-history-toggle" type="button" disabled={busy} onClick={()=>setHistoryOpen(value=>!value)}>{historyOpen?'返回复核结果':`复核历史（${history.length}）`}</button>
    {error&&<p className="line-editor-error" role="alert">{error}</p>}
    {feedback&&<p className={feedback.warning?'line-editor-error':'lyric-ai-feedback'} role={feedback.warning?'alert':'status'}>{feedback.message}</p>}
    {historyOpen?<section aria-label="复核历史列表"><h3>复核历史</h3>{!history.length&&<p>还没有复核记录。完成一次复核后会自动保存。</p>}{history.map(item=><article className="lyric-ai-history-item" key={item.id}>
      <button className="lyric-ai-history-open" type="button" onClick={()=>openRecord(item)}><strong>{new Date(item.createdAt).toLocaleString('zh-CN')}</strong><span>{item.result.suggestions.length} 条建议 · {item.result.issues.length} 个问题 · 已采用 {Object.values(item.decisions).filter(value=>value.status==='adopted').length} · 已跳过 {[...Object.values(item.decisions),...Object.values(item.issueDecisions||{})].filter(value=>value.status==='skipped').length}</span></button>
      <button type="button" onClick={()=>deleteId===item.id?remove(item.id):setDeleteId(item.id)}>{deleteId===item.id?'确认删除':'删除记录'}</button>{deleteId===item.id&&<button type="button" onClick={()=>setDeleteId(null)}>取消</button>}
    </article>)}</section>:<>
      {historical&&record&&<p className="lyric-ai-history-note">查看历史：{new Date(record.createdAt).toLocaleString('zh-CN')}。当时建议保留；再次采用会核对当前歌词。</p>}
      {Boolean(result?.rejected_count)&&<p className="line-editor-error">AI有 {result.rejected_count} 条结果缺少可靠依据，已略过。</p>}
      {Boolean(result?.rejected_items?.length)&&<details><summary>查看略过原因</summary>{result.rejected_items.map((item,index)=><p key={index}>{item.reason}</p>)}</details>}
      {audioError&&<p className="line-editor-error" role="alert">{audioError}</p>}
      {busy&&<p role="status">{adjusting?'正在调整':'正在处理'}，已复核 {progress} 句…</p>}
      {result&&<><p role="status">复核完成：{result.suggestions.length} 条建议，{result.issues.length} 条待核对问题。</p>
        <div className="lyric-ai-bulk"><button type="button" disabled={busy} onClick={()=>{setSelected(new Set(available.map(suggestionKey)));setSelectedIssues(new Set(result.issues.map((_,index)=>index)))}}>全选</button><button type="button" disabled={busy} onClick={()=>{setSelected(new Set());setSelectedIssues(new Set())}}>取消全选</button></div>
        {groupReviewEntries(displaySong,result).map(group=><section className="lyric-ai-line-group" key={group.line.id} aria-label={`第 ${group.number} 句复核结果`}>
          <div className="lyric-ai-line-head"><strong>第 {group.number} 句</strong>{listen(group.line.id)}</div><p className="lyric-ai-original" lang="ja">{plainLyric(group.line.text)}</p>
          <ul>{group.suggestions.map(item=>{
            const key=suggestionKey(item),decision=record?.decisions?.[key],current=currentReading(item)
            return <li key={key}><label><input type="checkbox" disabled={busy||decision?.status==='adopted'} checked={selected.has(key)} onChange={event=>toggle(setSelected,key,event.target.checked)}/><strong>{item.kind==='segmentation'?'分词建议：':''}{item.surface}</strong></label>
              {item.kind==='segmentation'?<p>{item.original_segments.map(segment=>segment.surface).join('｜')} → {item.segments.map(segment=>`${segment.surface}（${segment.reading||'留空'}）`).join('｜')}</p>:<p>{historical?'当时读音：':''}{item.original_reading||'留空 / 未标注'} → {item.suggested_reading}</p>}
              <small>{item.reason}</small>{item.manual_challenge&&<small className="lyric-ai-candidate">涉及人工编辑 · 只有你采纳后才会修改</small>}
              {item.needs_confirmation&&!item.manual_challenge&&<small className="lyric-ai-candidate">请确认词组或试听后选择</small>}
              {historical&&current!=null&&current!==item.original_reading&&<small>当前读音：{current||'留空'}</small>}
              <span className="lyric-ai-decision">{decision?.status==='adopted'?'已采纳':decision?.status==='skipped'?'已跳过，可重新选择':'未处理'}</span>
            </li>
          })}{group.issues.map(item=><li key={`issue:${item.issueIndex}`}><label><input type="checkbox" disabled={busy} checked={selectedIssues.has(item.issueIndex)} onChange={event=>toggle(setSelectedIssues,item.issueIndex,event.target.checked)}/><strong>待核对问题</strong></label><p>{item.reason}</p><span className="lyric-ai-decision">{record?.issueDecisions?.[item.issueIndex]?.status==='skipped'?'已跳过，可重新选择':'未处理'}</span></li>)}</ul>
        </section>)}
        {result.issues.length>0&&<button className="lyric-ai-adjust" type="button" disabled={busy||!selectedIssues.size} onClick={adjust}>AI调整选中问题（{selectedIssues.size}）</button>}
        {!result.suggestions.length&&!result.issues.length&&!result.rejected_count&&<p>本次未发现明确需要调整的内容。</p>}
      </>}
    </>}
    <footer>{!historyOpen&&result&&<button type="button" disabled={busy} onClick={run}>重新复核</button>}<button type="button" onClick={onClose}>{busy?'取消并关闭':'关闭'}</button>{!historyOpen&&(result?<><button type="button" disabled={busy||!selected.size&&!selectedIssues.size} onClick={skip}>跳过选中项</button><button type="button" disabled={busy||!selected.size} onClick={apply}>采用选中建议（{selected.size}）</button></>:<button type="button" disabled={busy} onClick={run}>开始复核</button>)}</footer>
  </section></div>
}
