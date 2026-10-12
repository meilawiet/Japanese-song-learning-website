import { useEffect, useRef, useState } from 'react'
// 原来只有关闭图标，新增与逐句播放一致的试听/暂停入口。
import { Pause, Play, X } from 'lucide-react'
// 原导入仅复核；二次调整让待核对问题同样可以选择并交给AI处理。
import { adjustSelectedLyricIssues, reviewImportedLyrics } from '../lib/annotationApi'
import { adjustmentFeedback, groupReviewEntries } from '../lib/lyricAiReview'
import { plainLyric } from '../lib/lyricReadings'

// AI 不直接改数据：复核、逐条预览、用户确认后采用，系统返回可取消请求。
export default function LyricAiReview({song,annotations,corrections,onApply,onClose,initialResult=null,onResult,onPlay,playingLineId,audioReady=false,audioError=''}) {
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
