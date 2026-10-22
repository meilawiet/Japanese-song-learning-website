import {useEffect,useMemo,useRef,useState} from 'react'
import {ArrowLeft,ChevronDown,ChevronRight,Grid2X2,List,Play,Pause,History,Trash2,LoaderCircle,BookOpen,Undo2,NotebookPen,MoreHorizontal,Sparkles} from 'lucide-react'
// 笔记不再提供重点分类勾选；历史focus字段仍由原复习条目保留。
import {reviewGroups,reviewKey,reviewDue,gradeReview,createReviewUnit,reviewAnalysis,reviewAnalysisKey,reviewRequestLine,reviewDictionaryWords} from '../lib/reviewBook.js'
import {explainSentenceBatchWithAi} from '../lib/annotationApi'
import {sentenceEntry} from '../lib/sentenceAnalysis.js'
import {songLanguage} from '../lib/songLanguage.js'
import useReviewAudio from '../lib/useReviewAudio'
// 原左滑删除组件保留文件，复习页按新要求停用：import ReviewSwipeCard from './ReviewSwipeCard'
import ReadingLyric from './ReadingLyric'
import ReadingStyleOptions from './ReadingStyleOptions'
import {songReadingStyle} from '../lib/songLanguage.js'

const strings=value=>(Array.isArray(value)?value:[]).filter(item=>typeof item==='string'&&item.trim())
const wordList=value=>(Array.isArray(value)?value:[]).filter(item=>typeof item?.surface==='string'&&typeof item?.meaning==='string')
const stamp=seconds=>{const value=Math.max(0,Math.floor(seconds));return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`}

// 复习歌曲直接进入歌词详情，共用真实reviewItems，收藏、笔记、解析和复习进度随原备份保存。
export default function ReviewBook({songs,items,onItemsChange,artworkFor,audioFor,sentenceCache,annotations,meaningOverrides,corrections,level,songSettings={},defaultReadingStyle,onReadingSettings,onOpenSong,onDetailChange}) {
  const [songId,setSongId]=useState(null),[selected,setSelected]=useState(null),[session,setSession]=useState(null)
  // 原封面/列表偏好不再参与复习本展示，仅统一列表。
  // const [view,setView]=useState(()=>localStorage.getItem('uta-review-view-v1')==='list'?'list':'grid')
  const [editingSongId,setEditingSongId]=useState(null),[menuTarget,setMenuTarget]=useState(null),[removeSongId,setRemoveSongId]=useState(null)
  const [now,setNow]=useState(Date.now),/* 原query搜索状态已按要求移除 */[reveal,setReveal]=useState(false)
  // 新稿用同一内容区域切换单词、语法、笔记；隐藏面板保留未保存的输入。
  const [knowledgeTab,setKnowledgeTab]=useState('words'),[contextOpen,setContextOpen]=useState(false)
  const [rate,setRate]=useState(1),[notice,setNotice]=useState(''),[remove,setRemove]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const request=useRef(null),latest=useRef(null),tools=useRef(null),workspace=useRef(null),rating=useRef(null)
  const groups=useMemo(()=>reviewGroups(songs,items),[songs,items]),units=groups.flatMap(group=>group.units)
  const editGroup=groups.find(value=>value.song.id===editingSongId),removeSong=groups.find(value=>value.song.id===removeSongId)
  useEffect(()=>{if(editingSongId&&!editGroup)setEditingSongId(null)},[editingSongId,Boolean(editGroup)])
  const group=groups.find(value=>value.song.id===songId)
  const currentKey=session?session.keys[session.position]:selected
  const unit=units.find(value=>value.key===currentKey)
  const complete=Boolean(session&&session.position>=session.keys.length)
  const detail=Boolean(currentKey||complete),source=unit?audioFor(unit.song):''
  const audio=useReviewAudio(unit,source,rate)
  // 提示区和小播放键共用可播放条件与toggle，不触发双次播放。
  const canPlay=Boolean(source&&!unit?.missing&&unit?.lines.every(line=>Number.isFinite(line.start)))
  const analysis=unit?reviewAnalysis(unit,sentenceCache,level):{entry:null,current:false}
  // 原来只读取整段/单句entry：const explanation=analysis.entry?.explanation
  const explanation=analysis.explanation
  // 原组件未接收songSettings/defaultReadingStyle/onReadingSettings；新增参数用于同步歌词页注音。
  // 注音偏好跟随当前复习歌曲，不能误用学习页上一次打开的另一首歌。
  const readingOptions=songSettings[unit?.song.id]||{}
  const readingStyle=songReadingStyle(unit?songLanguage(unit.song):'ja',readingOptions.readingStyle??defaultReadingStyle)
  const removeUnit=units.find(value=>value.key===remove)
  const identity=unit?JSON.stringify([unit.key,reviewAnalysisKey(unit),level]):''
  latest.current={units,identity,onItemsChange}
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer)},[])
  useEffect(()=>{onDetailChange(detail);return()=>onDetailChange(false)},[detail])
  useEffect(()=>{request.current?.abort();request.current=null;setBusy(false);setError('');setReveal(false);setNotice('');setRemove(null);setKnowledgeTab('words');setContextOpen(false);if(tools.current)tools.current.open=false},[identity])
  useEffect(()=>()=>request.current?.abort(),[])
  useEffect(()=>{
    const back=event=>{if(menuTarget){event.preventDefault();setMenuTarget(null)}else if(removeSongId){event.preventDefault();setRemoveSongId(null)}else if(remove){event.preventDefault();setRemove(null)}else if(tools.current?.open){event.preventDefault();tools.current.open=false}else if(detail){event.preventDefault();closeDetail()}else if(editingSongId){event.preventDefault();setEditingSongId(null)}}
    window.addEventListener('uta:navigate-back',back);return()=>window.removeEventListener('uta:navigate-back',back)
  },[remove,detail,songId,menuTarget,removeSongId,editingSongId])
  // 详情占满当前视口，页面本身不滚动；离开时释放限定，歌曲列表恢复正常滚动。
  useEffect(()=>{if(!detail)return;document.body.classList.add('review-detail-open');window.scrollTo(0,0);return()=>document.body.classList.remove('review-detail-open')},[detail])
  // 点击歌曲即建立本歌复习队列；完成评价自动下一条，与今日复习使用同一套调度。
  // 原进入详情后评价只提示、需手动切句：setSelected(value.key);setSongId(value.song.id);setSession(null)
  function openUnit(value){if(!value)return;audio.stop();const list=groups.find(group=>group.song.id===value.song.id)?.units||[value];setSelected(null);setSongId(value.song.id);setSession({keys:list.map(unit=>unit.key),position:Math.max(0,list.findIndex(unit=>unit.key===value.key))});window.scrollTo({top:0,behavior:'instant'})}
  // 原返回仅清selected/session，再退到歌曲单元列表；现在一次直接回到复习本。
  function closeDetail(){audio.stop();setSelected(null);setSession(null);setSongId(null)}
  function back(){closeDetail();window.scrollTo({top:0,behavior:'instant'})}
  function upgrade(value){if(value.item.unitVersion===1)return value.item;const fresh=createReviewUnit(value.song,value.lines[0].id,value.lines.at(-1).id);return {...fresh,...value.item,unitVersion:1,lineId:fresh.lineId,text:fresh.text,lineIds:fresh.lineIds,lineTexts:fresh.lineTexts}}
  function update(value,patch){onItemsChange(previous=>previous.map(item=>reviewKey(item)===value.key?{...upgrade({...value,item}),...patch}:item))}
  async function generate(){
    if(!unit||unit.missing||busy)return
    const target=unit,snapshot=identity,controller=new AbortController();request.current?.abort();request.current=controller
    setBusy(true);setError('')
    try{
      const line=reviewRequestLine(target),language=songLanguage(target.song)
      const result=await explainSentenceBatchWithAi([line],language,{japaneseLevel:level,signal:controller.signal})
      if(controller.signal.aborted||latest.current.identity!==snapshot)return
      const explanation=result.explanations.find(value=>value.line_id===line.id&&value.source_text===line.text)
      if(!explanation)throw new Error('解析未与整个复习单元对应，结果未保存。')
      const entry=sentenceEntry(line,explanation,language,level),key=reviewAnalysisKey(target)
      latest.current.onItemsChange(previous=>previous.map(item=>reviewKey(item)===target.key?{...upgrade({...target,item}),analysis:entry,analysisKey:key}:item))
      setNotice('本单元解析已生成。')
    }catch(failure){if(!controller.signal.aborted)setError(failure.message||'生成失败，原有解析已保留。')}
    finally{if(request.current===controller){request.current=null;setBusy(false)}}
  }
  function grade(value){
    // 只能在当前单元的理解阶段评价，避免听力隐藏状态被快捷事件误提交。
    if(!reveal||!unit||unit.missing)return
    audio.stop();const target=unit,graded=gradeReview(upgrade(target),value)
    onItemsChange(previous=>previous.map(item=>reviewKey(item)===target.key?{...item,...graded}:item));setNow(Date.now())
    if(session){const keys=[...session.keys];if(value==='again'&&!keys.slice(session.position+1).includes(target.key))keys.push(target.key);setSession({keys,position:session.position+1});setReveal(false)}
    else setNotice(value==='again'?'已记录：10分钟后再复习，也可稍后再练。':`已记录：${graded.intervalDays}天后再复习。`)
  }
  function next(){audio.stop();if(session){setSession({...session,position:session.position+1});return}const list=group?.units||[];if(list.length)setSelected(list[(list.findIndex(value=>value.key===currentKey)+1)%list.length].key)}
  // 上一条只改变浏览位置，不撤销已经保存的评价；重新进入时仍先听。
  function previous(){audio.stop();setReveal(false);if(tools.current)tools.current.open=false;if(session&&session.position>0)setSession({...session,position:session.position-1});else if(group){const index=group.units.findIndex(value=>value.key===currentKey);if(index>0)setSelected(group.units[index-1].key)}}
  useEffect(()=>{const close=event=>{if(tools.current&&!tools.current.contains(event.target))tools.current.open=false};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[])
  function cover(song){const url=artworkFor(song)?.artworkUrl;return <span className="review-cover">{url?<img src={url} alt="" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none'}}/>:<span>{song.title.slice(0,2)}</span>}</span>}
  // 原仅能删当前详情：function removeCurrent(){const key=unit.key;audio.stop();request.current?.abort();onItemsChange(previous=>previous.filter(item=>reviewKey(item)!==key));setRemove(false);setSelected(null);setSession(null)}
  // 原来删除目标也可能来自中间列表；现在统一从详情移出，保留学习解析。
  // 删除后继续展示本歌下一单元（删末项则展示上一项），没有剩余才回歌曲列表。
  // 今日队列删除会同时去除该单元的待重练引用，其他单元的顺序与评价不变。
  function removeCurrent(){
    if(!removeUnit)return
    const key=removeUnit.key;audio.stop();request.current?.abort()
    onItemsChange(previous=>previous.filter(item=>reviewKey(item)!==key));setRemove(null)
    if(unit?.key!==key)return
    if(session){const before=session.keys.slice(0,session.position).filter(value=>value===key).length;const keys=session.keys.filter(value=>value!==key);if(!keys.length)closeDetail();else setSession({keys,position:session.position-before});return}
    const list=group?.units||[],position=list.findIndex(value=>value.key===key),remaining=list.filter(value=>value.key!==key)
    if(remaining.length)setSelected(remaining[Math.min(Math.max(position,0),remaining.length-1)].key)
    else closeDetail()
  }
  const due=units.filter(value=>reviewDue(value.item,now)&&!value.missing)
  const words=wordList(explanation?.vocabulary).length?wordList(explanation.vocabulary):unit?reviewDictionaryWords(unit,annotations,meaningOverrides,corrections):[]
  const grammar=strings(explanation?.grammar)
  const position=session?Math.min(session.position+1,session.keys.length):(group?.units.findIndex(value=>value.key===currentKey)??0)+1
  const total=session?session.keys.length:group?.units.length||0
  const canPrevious=session?session.position>0:Boolean(group&&group.units.findIndex(value=>value.key===currentKey)>0)
  return <section className={`android-review-book ${detail?'review-detail':''} ${unit&&!reveal?'review-listening':''}`} data-view={detail?'detail':editGroup?'edit':'songs'} aria-label="复习本">
    {!detail?<>
      {editGroup?<>
        {/* 编辑只管理复习收藏，原歌曲、歌词和学习解析不受删除影响。 */}
        <header className="review-page-header"><button type="button" aria-label="返回复习本" onClick={()=>setEditingSongId(null)}><ArrowLeft size={23}/></button><h1>编辑复习</h1></header>
        <div className="review-song-identity">{cover(editGroup.song)}<div><h2>{editGroup.song.title}</h2><p>{editGroup.song.artist} · {editGroup.units.length} 个复习单元</p></div></div>
        <div className="review-unit-list">{editGroup.units.map(value=><ReviewPressItem key={value.key} className="review-unit-card" label={'复习第'+(value.position+1)+'行起的歌词'} onOpen={()=>openUnit(value)} onHold={()=>setMenuTarget({kind:'unit',key:value.key})}><span className="review-unit-meta">第{value.position+1}行起 · {value.lines.length}行{value.lines.length>1?'一组':''}</span><span className="review-unit-text">{value.lines.map((line,index)=><span key={index}>{line.text}</span>)}</span><span className="review-unit-bottom">查看关键表达与语法<ChevronRight size={18}/></span></ReviewPressItem>)}</div>
      </>:<>
        <p className="android-home-eyebrow">REVIEW / 复习</p><div className="review-heading"><div><h1>复习本</h1><p>{groups.length}首歌曲待复习</p></div></div>
        {groups.length?<>
          {/* 今日队列放在所有歌曲之前；直接点歌曲仍从该歌收藏的第一单元开始。 */}
          <button type="button" className="review-today" disabled={!due.length} onClick={()=>{setSession({keys:due.map(value=>value.key),position:0});setSongId(due[0].song.id)}}><History size={21}/><span><strong>开始今日复习</strong><small>{due.length?due.length+' 个复习单元等待回顾':'今日到期内容已复习完成'}</small></span><ChevronRight size={21}/></button>
          <div className="review-albums list">{groups.map(({song,units})=><ReviewPressItem className="review-album" key={song.id} label={'复习 '+song.title+'，'+song.artist} onOpen={()=>{setEditingSongId(null);openUnit(units[0])}} onHold={()=>setMenuTarget({kind:'song',id:song.id})}>{cover(song)}<span className="review-album-info"><strong>{song.title}</strong><small>{song.artist}</small><span>{units.length} 个复习单元</span><em>{units.filter(value=>reviewDue(value.item,now)).length} 个待复习</em></span></ReviewPressItem>)}</div>
        </>:<div className="review-empty"><BookOpen size={36}/><h2>复习本还是空的</h2><p>学习时双击歌词可收藏本句，再双击另一句可收藏本段。</p></div>}
      </>}
    </>:<>
      {/* 顶部左侧返回和进度，右侧返回上一条；次要管理操作收纳到更多。 */}
      <header className="review-page-header review-compact-header">
        <div className="review-header-start"><button type="button" aria-label="返回复习本" onClick={back}><ArrowLeft size={23}/></button><span className="review-position" aria-label="当前复习进度">{position} / {total}</span></div>
        <button className="review-previous" type="button" aria-label="上一条歌词" title="返回上一条歌词" disabled={!canPrevious} onClick={previous}><Undo2 size={23}/></button>
        {unit&&<details className="review-options" ref={tools}><summary aria-label="复习更多操作"><MoreHorizontal size={23}/></summary><div>
          {/* 与歌词页共用四种注音控件，修改同一首歌曲的设置。 */}
          <ReadingStyleOptions includeNone name="review-reading" language={songLanguage(unit.song)} readingStyle={readingStyle} onReadingStyle={value=>onReadingSettings?.(unit.song.id,{readingStyle:value})}/>
          <button type="button" disabled={!reveal||busy||unit.missing} onClick={()=>{tools.current.open=false;generate()}}><Sparkles size={17}/>{busy?'正在生成…':analysis.entry?'重新生成本单元解析':'生成本单元解析'}</button>
          <button type="button" disabled={!reveal} onClick={()=>{tools.current.open=false;setContextOpen(!contextOpen)}}>查看前后文</button>
          <button type="button" onClick={()=>{tools.current.open=false;next()}}>下一条歌词</button>
          <button type="button" onClick={()=>{tools.current.open=false;audio.stop();onOpenSong(unit.song.id,unit.lines[0].id)}}>回到歌曲</button>
          <button type="button" className="review-option-delete" onClick={()=>{tools.current.open=false;setRemove(unit.key)}}><Trash2 size={17}/>移出复习本</button>
          <p className="review-hint">生成解析会使用当前AI服务，可能产生调用费用。</p>
        </div></details>}
      </header>
      {complete?<div className="review-empty"><History size={38}/><h2>本轮复习完成</h2><p>复习评价已保存在当前设备。</p><button type="button" className="review-primary" onClick={()=>{setSession(null);setSelected(null);setSongId(null)}}>返回复习本</button></div>:unit?<>
        <audio ref={audio.ref} src={source||undefined} preload="metadata" onEnded={audio.onEnded}/>
        {/* 原理解/听力两个页签已合并：每条先听，再由用户主动进入理解。 */}
        {/* 停用旧左滑删除包装；在歌曲编辑页长按歌词管理，详情保留更多中的移出操作。 */}
        <div className="review-reading-region"><section className="review-lyric-card" aria-label={reveal?'理解复习':'听力复习'}><div className="review-unit-meta"><span>{unit.song.title}</span><span>{unit.position>=0?`第${unit.position+1}${unit.lines.length>1?'–'+(unit.position+unit.lines.length):''}行`:''} · {unit.lines.length} 行</span></div>{!reveal?<div className="review-listen-hidden" role="button" tabIndex={canPlay?0:-1} aria-label={audio.playing||audio.busy?'暂停当前歌词':'播放当前歌词'} aria-disabled={!canPlay} onClick={()=>{if(canPlay)audio.toggle()}} onKeyDown={event=>{if(canPlay&&(event.key==='Enter'||event.key===' ')){event.preventDefault();audio.toggle()}}}>先听一遍，试着回忆句子的意思。</div>:<div className="review-unit-text" lang={songLanguage(unit.song)==='ja'?'ja':undefined}>{unit.lines.map((line,index)=><div className="review-source-line" key={index}><p>{line.text}</p>{/* 只用歌词文件译文，不回退AI句意；没有译文不占位。 */}{typeof line.translation==='string'&&line.translation.trim()&&<p className="review-file-translation">{line.translation}</p>}</div>)}</div>}
          <div className="review-lyric-tools"><button type="button" className="review-play" aria-label={audio.playing||audio.busy?'暂停复习单元':'播放复习单元'} disabled={!canPlay} onClick={audio.toggle}>{audio.busy?<LoaderCircle className="spin" size={19}/>:audio.playing?<Pause size={19}/>:<Play size={19}/>}<span>{unit.lines[0].start!=null?stamp(unit.lines[0].start):'暂无时间戳'}</span></button><select aria-label="复习播放速度" value={rate} onChange={event=>setRate(Number(event.target.value))}>{[.5,.75,1,1.25].map(value=><option key={value} value={value}>{value}×</option>)}</select></div>
          {!source&&<p className="review-hint">{unit.song.cloudPending?'音频尚未下载，可先阅读复习。':'当前歌曲没有可用音频，可先阅读复习。'}</p>}

        </section></div>
        {/* 歌词大意独立置于播放行下方，按标注图形成清晰的上下顺序。 */}
        {unit.changed&&<p className="review-warning" role="status">收藏后歌词内容或范围已有变化，请核对原文；旧解析不会自动重新生成。</p>}
        {audio.error&&<p className="review-error" role="alert">{audio.error}</p>}
        {/* 单词、语法、笔记共用面板，底部页签保持固定；听力阶段不挂载答案。 */}
        {reveal&&<section ref={workspace} className="review-knowledge-workspace" aria-label="歌词复习内容">
          <div className="review-knowledge-scroll">
            {knowledgeTab!=='notes'&&analysis.entry&&!analysis.current&&<p className="review-warning">解析可能尚未适配当前歌词或日语水平。</p>}
            <div className="review-tab-pane" role="tabpanel" id="review-panel-words" aria-labelledby="review-tab-words" hidden={knowledgeTab!=='words'}>
              {/* 页签按新要求显示关键表达/语法与语境；紧凑词条直接按“单词：释义；用法”阅读，注音共用歌词渲染器。 */}
              {words.length?words.map((word,index)=><article className="review-word review-vocab-row" key={index}><strong className="review-vocab-title"><ReviewWordReading word={word} unit={unit} annotations={annotations} corrections={corrections} readingStyle={readingStyle} romajiPosition={readingOptions.romajiPosition}/></strong><span className="review-vocab-definition">：{word.meaning}{typeof word.usage==='string'&&word.usage.trim()&&<>；{word.usage}</>}</span></article>):<p className="review-hint">暂无单词讲解，可在更多中生成本单元解析。</p>}
            </div>
            <div className="review-tab-pane" role="tabpanel" id="review-panel-grammar" aria-labelledby="review-tab-grammar" hidden={knowledgeTab!=='grammar'}>{grammar.length?grammar.map((point,index)=><p className="review-grammar" key={index}>{point}</p>):<p className="review-hint">暂无语法讲解，可在更多中生成本单元解析。</p>}</div>
            <div className="review-tab-pane" role="tabpanel" id="review-panel-notes" aria-labelledby="review-tab-notes" hidden={knowledgeTab!=='notes'}><ReviewNotes key={`review-notes-${unit.key}`} panel item={unit.item} onSave={patch=>{update(unit,patch);setNotice('笔记已保存。')}}/></div>
        {reveal&&contextOpen&&<div className="review-context"><h2>前后文</h2>{unit.song.lines[unit.position-1]&&<p>{unit.song.lines[unit.position-1].text}</p>}<p className="review-context-current">{unit.text}</p>{unit.song.lines[unit.position+unit.lines.length]&&<p>{unit.song.lines[unit.position+unit.lines.length].text}</p>}</div>}
          </div>
          <div className="review-knowledge-tabs" role="tablist" aria-label="复习内容分类" onKeyDown={event=>{const tabs=['words','grammar','notes'];let index=tabs.indexOf(knowledgeTab);if(event.key==='ArrowRight')index=(index+1)%3;else if(event.key==='ArrowLeft')index=(index+2)%3;else if(event.key==='Home')index=0;else if(event.key==='End')index=2;else return;event.preventDefault();setKnowledgeTab(tabs[index]);document.getElementById('review-tab-'+tabs[index])?.focus()}}>
            {[['words','关键表达'],['grammar','语法与语境'],['notes','笔记']].map(([value,label])=><button key={value} type="button" role="tab" id={'review-tab-'+value} aria-controls={'review-panel-'+value} aria-selected={knowledgeTab===value} tabIndex={knowledgeTab===value?0:-1} className={knowledgeTab===value?'selected':''} onClick={()=>setKnowledgeTab(value)}>{value==='notes'&&<NotebookPen size={18}/>}<span>{label}</span></button>)}
          </div>
        </section>}
        {error&&<p className="review-error" role="alert">{error}</p>}{notice&&<p className="review-notice" role="status">{notice}</p>}

        {/* 原三档没想起来/有点印象/比较熟悉映射不变，调整成更直观的熟悉/模糊/不认识。 */}
        {reveal?<footer ref={rating} className="review-grade-bar review-rating-bar">{[['good','熟悉'],['hard','模糊'],['again','不认识']].map(([value,label])=><button className={`review-rating-${value}`} style={{'--review-rating-color':{good:'#2f8d78',hard:'#e6ac30',again:'#d85460'}[value]}} key={value} type="button" disabled={unit.missing} onClick={()=>grade(value)}>{label}</button>)}</footer>:<footer className="review-grade-bar review-listen-step"><button type="button" onClick={()=>{audio.stop();setReveal(true)}}>进入复习</button></footer>}
      </>:<div className="review-empty"><p>这个复习单元已不存在。</p><button type="button" onClick={()=>{setSession(null);setSelected(null);setSongId(null)}}>返回复习本</button></div>}
    </>}
    {/* 长按操作菜单不触发单击进入；删除歌曲只批量移出该歌复习收藏。 */}
    {menuTarget&&<div className="review-modal-backdrop" onClick={()=>setMenuTarget(null)}><section className="review-confirm review-manage-menu" role="dialog" aria-modal="true" aria-label={menuTarget.kind==='song'?'歌曲复习操作':'复习歌词操作'} onClick={event=>event.stopPropagation()}><h2>{menuTarget.kind==='song'?'歌曲复习':'复习歌词'}</h2>{menuTarget.kind==='song'&&<button type="button" onClick={()=>{setEditingSongId(menuTarget.id);setMenuTarget(null);window.scrollTo(0,0)}}>编辑</button>}<button type="button" className="review-option-delete" onClick={()=>{if(menuTarget.kind==='song')setRemoveSongId(menuTarget.id);else setRemove(menuTarget.key);setMenuTarget(null)}}>删除</button><button type="button" onClick={()=>setMenuTarget(null)}>取消</button></section></div>}
    {removeSong&&<div className="review-modal-backdrop" onClick={()=>setRemoveSongId(null)}><section className="review-confirm" role="alertdialog" aria-modal="true" aria-label="移出歌曲复习" onClick={event=>event.stopPropagation()}><h2>移出这首歌的全部复习内容？</h2><p>将移出《{removeSong.song.title}》的{removeSong.units.length}个复习单元及复习记录，原歌曲、歌词和学习解析保留。</p><footer><button type="button" onClick={()=>setRemoveSongId(null)}>取消</button><button type="button" onClick={()=>{const id=removeSongId;onItemsChange(previous=>previous.filter(item=>item.songId!==id));setRemoveSongId(null);if(editingSongId===id)setEditingSongId(null)}}>移出复习本</button></footer></section></div>}
    {removeUnit&&<div className="review-modal-backdrop" onClick={()=>setRemove(null)}><section className="review-confirm" role="alertdialog" aria-modal="true" aria-label="移出复习本" onClick={event=>event.stopPropagation()}><h2>移出这个复习单元？</h2><p>仅移除复习收藏和该单元的复习记录，原歌曲、歌词及掌握状态保持不变。</p><footer><button type="button" onClick={()=>setRemove(null)}>取消</button><button type="button" onClick={removeCurrent}>移出复习本</button></footer></section></div>}
  </section>
}

function ReviewNotes({item,onSave,panel=false}) {
  // 原分类状态：const [focus,setFocus]=useState(strings(item.focus))
  // 只编辑笔记，保存时不覆盖旧收藏中已有的focus及其他同步字段。
  const [note,setNote]=useState(typeof item.note==='string'?item.note:'')
  // 面板模式直接展示编辑框，旧折叠写法保留在文末对照。
  const content=<div className="review-notes-content"><label>我的笔记<textarea aria-label="我的复习笔记" maxLength={1000} value={note} onChange={event=>setNote(event.target.value)} placeholder="记下这句话里没弄懂的地方"/></label><button type="button" onClick={()=>onSave({note})}>保存笔记</button></div>
  return panel?<section className="review-notes review-notes-panel" aria-label="复习笔记">{content}</section>:<details className="review-knowledge review-notes"><summary>复习重点与笔记<ChevronDown size={17}/></summary>{content}</details>
}

// 改版前的标题与独立折叠区保留对照，当前按用户标注图改用底部页签面板。
//       <header className="review-page-header"><button type="button" aria-label="返回复习本" onClick={back}><ArrowLeft size={23}/></button><h1>句子复习</h1>{unit&&<span className="review-position">{session?`${session.position+1} / ${session.keys.length}`:`${(group?.units.findIndex(value=>value.key===unit.key)??0)+1} / ${group?.units.length||1}`}<button type="button" aria-label="下一个复习单元" onClick={next}><ChevronRight size={20}/></button></span>}</header>
//         {/* 听力阶段不挂载答案、笔记或前后文，避免提前泄露歌词；理解阶段才按需展开知识。 */}
//         {reveal&&<>
//           {(analysis.entry||analysis.lineEntries?.length>0)&&!analysis.current&&<p className="review-warning">这份解析尚未按当前歌词、日语水平或教学规则生成，可手动重新生成。</p>}
//           {/* 逐句结果保持来源可辨识，不把拼接结果当作新生成的整段解析。 */}
//           {analysis.lineEntries?.length>0&&<p className="review-hint review-reused-analysis" role="status">已复用学习页 {analysis.lineEntries.length}/{unit.lines.length} 句解析，以下按原歌词行展示；整段解析可按需生成。</p>}
//           {/* 原单词栏带open自动展开；按单元设key，切换下一句时也重新默认收起。 */}
//           <details key={`review-words-${unit.key}`} className="review-knowledge"><summary>单词<span>{words.length} 个<ChevronDown size={17}/></span></summary><div>{words.length?words.map((word,index)=><article className="review-word" key={index}><div><strong>{word.surface}</strong>{typeof word.reading==='string'&&<small>{word.reading}</small>}</div>{typeof word.dictionary_form==='string'&&word.dictionary_form.trim()&&word.dictionary_form!==word.surface&&<p>原形：{word.dictionary_form}</p>}<p>{word.meaning}</p>{typeof word.usage==='string'&&word.usage&&<p>用法：{word.usage}</p>}</article>):<p className="review-hint">暂无单词讲解。可以生成解析，或先记录自己的理解。</p>}</div></details>
//           <details className="review-knowledge"><summary>语法<span>{grammar.length} 个<ChevronDown size={17}/></span></summary><div>{grammar.length?grammar.map((point,index)=><p className="review-grammar" key={index}>{point}</p>):<p className="review-hint">暂无语法讲解，生成解析后在这里查看。</p>}</div></details>
//           {/* 复习页按用户要求移除独立的表达与用法、学习重点展示，只保留单词和语法。 */}
//           <div className="review-analysis-actions"><button type="button" className="review-primary" disabled={busy||unit.missing} onClick={generate}>{busy?'正在生成…':analysis.entry?'重新生成本单元解析':'生成本单元解析'}</button><p className="review-hint">使用当前AI服务，可能产生调用费用；不会自动生成。</p></div>
//         </>}
//         {error&&<p className="review-error" role="alert">{error}</p>}{notice&&<p className="review-notice" role="status">{notice}</p>}
//         {reveal&&<>
//         <ReviewNotes key={`review-notes-${unit.key}`} item={unit.item} onSave={patch=>{update(unit,patch);setNotice('复习重点与笔记已保存。')}}/>
//         <div className="review-context"><h2>前后文</h2>{unit.song.lines[unit.position-1]&&<p>{unit.song.lines[unit.position-1].text}</p>}<p className="review-context-current">{unit.text}</p>{unit.song.lines[unit.position+unit.lines.length]&&<p>{unit.song.lines[unit.position+unit.lines.length].text}</p>}</div>
//         </>}
//         <div className="review-secondary-actions"><button type="button" onClick={()=>{audio.stop();onOpenSong(unit.song.id,unit.lines[0].id)}}>回到歌曲</button><button type="button" onClick={()=>setRemove(unit.key)}><Trash2 size={15}/>移出复习本</button></div>
//
//   return <details className="review-knowledge review-notes"><summary>复习重点与笔记<ChevronDown size={17}/></summary><div><div className="review-focus">{REVIEW_FOCUS.map(value=><label key={value}><input type="checkbox" checked={focus.includes(value)} onChange={event=>setFocus(event.target.checked?[...focus,value]:focus.filter(item=>item!==value))}/>{value}</label>)}</div><label>我的笔记<textarea aria-label="我的复习笔记" maxLength={1000} value={note} onChange={event=>setNote(event.target.value)} placeholder="记下这句话里没弄懂的地方"/></label><button type="button" onClick={()=>onSave({focus,note})}>保存笔记</button></div></details>

// 词条先复用原行同一词的来源/人工读音；其余用解析读音，纯假名可直接转罗马音，未知汉字不猜读音。
function ReviewWordReading({word,unit,annotations,corrections,readingStyle,romajiPosition}) {
  let token=null,lineId=null
  for(const line of unit.lines){const row=annotations?.[unit.song.id]?.find(row=>row.id===line.id&&row.tokens?.map(value=>value.surface).join('')===line.text);const match=row?.tokens?.find(value=>value.surface===word.surface);if(match){token=match;lineId=line.id;break}}
  const reading=typeof word.reading==='string'&&word.reading.trim()?word.reading:/^[\u3040-\u30ffー]+$/u.test(word.surface)?word.surface:''
  const tokens=[token?{...token,reading:token.reading||reading}:{index:0,surface:word.surface,reading,part_of_speech:word.part_of_speech||''}]
  // 非日语原文不套用日语转换；未知读音始终显示原词。
  if(songLanguage(unit.song)!=='ja')return word.surface
  return <ReadingLyric stacked text={word.surface} tokens={tokens} corrections={lineId==null?{}:corrections} songId={unit.song.id} lineId={lineId??'review-word'} readingStyle={readingStyle} romajiPosition={romajiPosition}/>
}

// 旧面板用整页坐标计算高度，现改为视口内flex布局；保留对照。
//   // 知识面板占据歌词/大意与固定评价栏之间的剩余高度；大字号不再把底部页签压到评价栏下面。
//   useEffect(()=>{
//     if(!reveal||!workspace.current)return
//     const panel=workspace.current
//     const fit=()=>{const top=panel.getBoundingClientRect().top+window.scrollY;const height=window.visualViewport?.height||window.innerHeight;const bar=rating.current?.getBoundingClientRect().height||90;panel.style.height=Math.min(430,Math.max(210,height-top-bar-16))+'px'}
//     const observer=new ResizeObserver(fit)
//     for(const element of [rating.current,document.querySelector('.review-file-translation'),document.querySelector('.review-lyric-card')])if(element)observer.observe(element)
//     window.addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);fit()
//     return()=>{observer.disconnect();window.removeEventListener('resize',fit);window.visualViewport?.removeEventListener('resize',fit)}
//   },[reveal,identity])
//
// 原听力提示为不可点击div；原按钮文案“进入理解复习”，现按用户要求简化为“进入复习”。

// 旧复习本搜索、视图切换与今日入口位置保留对照。
//     {!detail?<>
//       <p className="android-home-eyebrow">REVIEW / 复习</p><div className="review-heading"><div><h1>复习本</h1><p>{groups.length} 首歌曲 · {units.length} 个复习单元</p></div><div className="review-view-toggle" role="group" aria-label="复习歌曲展示样式">{[['grid',Grid2X2,'封面展示'],['list',List,'列表展示']].map(([value,Icon,label])=><button type="button" key={value} aria-label={label} aria-pressed={view===value} className={view===value?'selected':''} onClick={()=>{setView(value);localStorage.setItem('uta-review-view-v1',value)}}><Icon size={19}/></button>)}</div></div>
//       {groups.length>0&&<label className="review-search">搜索歌曲<input type="search" placeholder="歌曲或歌手" value={query} onChange={event=>setQuery(event.target.value)}/></label>}
//       {groups.length?<><div className={`review-albums ${view}`}>{groups.filter(value=>(value.song.title+value.song.artist).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(({song,units})=><button className="review-album" type="button" key={song.id} onClick={()=>openUnit(units[0])}>{cover(song)}<span className="review-album-info"><strong>{song.title}</strong><small>{song.artist}</small><span>{units.length} 个复习单元</span><em>{units.filter(value=>reviewDue(value.item,now)).length} 个待复习</em></span></button>)}</div><button type="button" className="review-today" disabled={!due.length} onClick={()=>{setSession({keys:due.map(value=>value.key),position:0});setSongId(due[0].song.id)}}><History size={21}/><span><strong>开始今日复习</strong><small>{due.length?`${due.length} 个复习单元等待回顾`:'今日到期内容已复习完成'}</small></span><ChevronRight size={21}/></button></>:<div className="review-empty"><BookOpen size={36}/><h2>复习本还是空的</h2><p>学习时双击歌词可收藏本句，再双击另一句可收藏本段。</p></div>}
//
// 歌曲与歌词共用长按：移动12px或取消手势就中止；长按后的兼容click不能打开详情。
function ReviewPressItem({className,label,children,onOpen,onHold}) {
  // 原只有blocked在卡片自身拦截click；弹出菜单后，手指抬起可能把click投到菜单删除项。
  const timer=useRef(null),origin=useRef(null),blocked=useRef(false),held=useRef(false),ghost=useRef(false)
  const cancel=()=>{clearTimeout(timer.current);timer.current=null;origin.current=null}
  useEffect(()=>()=>clearTimeout(timer.current),[])
  // 捕获本次长按抬起产生的兼容click；下一次主动按下立即释放，不用延时吞掉用户的正常菜单点击。
  useEffect(()=>{const reset=()=>{ghost.current=false},consume=event=>{if(ghost.current&&event.detail!==0){event.preventDefault();event.stopImmediatePropagation();ghost.current=false}};window.addEventListener('pointerdown',reset,true);window.addEventListener('click',consume,true);return()=>{window.removeEventListener('pointerdown',reset,true);window.removeEventListener('click',consume,true)}},[])
  function start(event){if(event.button!==0||!event.isPrimary)return;cancel();blocked.current=false;held.current=false;origin.current={x:event.clientX,y:event.clientY};timer.current=setTimeout(()=>{held.current=true;blocked.current=true;ghost.current=true;onHold()},550)}
  return <button type="button" className={className} aria-label={label} onPointerDown={start} onPointerMove={event=>{if(origin.current&&Math.hypot(event.clientX-origin.current.x,event.clientY-origin.current.y)>12){blocked.current=true;cancel()}}} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={()=>{blocked.current=true;cancel()}} onContextMenu={event=>{event.preventDefault();cancel();blocked.current=true;if(!held.current){held.current=true;onHold()}}} onClick={event=>{if(blocked.current&&event.detail!==0){event.preventDefault();return}onOpen()}}>{children}</button>
}
