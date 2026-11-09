import {useEffect,useRef,useState} from 'react'
import useModalScrollLock from '../lib/useModalScrollLock'
import useReviewAudio from '../lib/useReviewAudio'
import {anki,readAnkiDeck,retryAnkiDeckRead,saveAnkiDeck} from '../lib/ankiSettings.js'
import {ANKI_AUDIO_SLOT,ANKI_COVER_SLOT,ankiAudioBounds,ankiCardFields,ankiClipBase64,ankiContextKey,ankiExample,ankiWordKey,mergeAnkiExample,prepareAnkiCover,readAnkiCard} from '../lib/ankiCard.js'

export default function AnkiCardDialog({song,lines,initialWord,candidates,artworkUrl,audioUrl,duration,onClose,onSaved}) {
  const [entry,setEntry]=useState(initialWord??null)
  const [saving,setSaving]=useState(false)
  useModalScrollLock(true)
  useEffect(()=>{
    const back=event=>{event.preventDefault();if(!saving)onClose()}
    window.addEventListener('uta:navigate-back',back)
    return()=>window.removeEventListener('uta:navigate-back',back)
  },[saving,onClose])

  return <div className="lyric-edit-menu-backdrop" onClick={()=>{if(!saving)onClose()}}>
    <section className="anki-card-dialog" role="dialog" aria-modal="true" aria-label="加入 Anki" onClick={event=>event.stopPropagation()}>
      <h2>加入 Anki</h2>
      {entry?<AnkiCardEditor song={song} lines={lines} entry={entry} artworkUrl={artworkUrl} audioUrl={audioUrl} duration={duration}
        saving={saving} setSaving={setSaving} onClose={onClose} onSaved={onSaved}
        onBack={initialWord?undefined:()=>setEntry(null)}/>:<>
        {/* 长按和选段先选已有解析，直接从某个解析条目进入时跳过这一步。 */}
        <p>选择一项已生成的解析</p>
        <div className="anki-word-choices" role="group" aria-label="已解析的词或语法">{candidates.map(candidate=>
          <button type="button" key={candidate.key} onClick={()=>setEntry(candidate.word)}>{candidate.label}</button>)}
        </div>
        <div className="anki-card-actions"><button type="button" onClick={onClose}>关闭</button></div>
      </>}
    </section>
  </div>
}

function AnkiCardEditor({song,lines,entry,artworkUrl,audioUrl,duration,saving,setSaving,onClose,onSaved,onBack}) {
  const [meaning,setMeaning]=useState(entry.meaning)
  const [usage,setUsage]=useState(entry.usage??'')
  const [title,setTitle]=useState(entry.surface)
  const [editing,setEditing]=useState(false)
  const [decks,setDecks]=useState(null)
  const [deck,setDeck]=useState(()=>readAnkiDeck()?.id||'')
  const [deckError,setDeckError]=useState('')
  const [attempt,setAttempt]=useState(0)
  const [error,setError]=useState('')
  const [choice,setChoice]=useState(null)
  const [target,setTarget]=useState(null)
  // 两个滑块共用原片段的时间刻度，默认完整保留。
  // const audioAvailable=Boolean(audioUrl&&ankiAudioBounds(song,lines,duration))
  const originalBounds=audioUrl?ankiAudioBounds(song,lines,duration):null
  const audioAvailable=Boolean(originalBounds)
  const [withAudio,setWithAudio]=useState(audioAvailable)
  const [trimOpen,setTrimOpen]=useState(false)
  const [trim,setTrim]=useState({start:0,end:1000})
  const span=originalBounds?originalBounds.end-originalBounds.start:0
  const clipBounds=originalBounds&&{
    start:originalBounds.start+span*trim.start/1000,
    end:trim.end===1000?originalBounds.end:originalBounds.start+span*trim.end/1000,
  }
  const preview=useReviewAudio(audioAvailable?{key:song.id,song,lines}:null,audioUrl,1,clipBounds)
  const [cover,setCover]=useState(artworkUrl?null:'')
  const [withCover,setWithCover]=useState(true)
  const connection=useRef(null)
  const coverRequest=useRef(null)

  // 保存和预览使用同一份压缩封面。图片无法读取时，仍可保存卡片。
  useEffect(()=>{
    if(!artworkUrl)return
    let active=true
    coverRequest.current??=prepareAnkiCover(artworkUrl).catch(()=>'')
    coverRequest.current.then(url=>{if(active)setCover(url)})
    return()=>{active=false}
  },[artworkUrl])

  // 打开卡片预览即读取牌组。复用同一次请求，避免重复触发系统授权。
  useEffect(()=>{
    if(connection.current?.attempt!==attempt){
      connection.current={attempt,promise:retryAnkiDeckRead(()=>anki.connect())}
    }
    let active=true
    connection.current.promise.then(({decks:available})=>{
      if(!active)return
      setDecks(available)
      setDeck(current=>available.some(item=>item.id===current)?current:'')
    }).catch(failure=>{
      if(active)setDeckError(failure.message||'无法连接 AnkiDroid。')
    })
    return()=>{active=false}
  },[attempt])

  const word={...entry,...(entry.grammarId?{surface:title.trim()||entry.surface,lemma:title.trim()||entry.lemma}:{}),meaning:meaning.trim(),usage:usage.trim()}
  const example=ankiExample(song,lines,word)
  const attachCover=withCover&&Boolean(cover)
  const card=(key,note,audio)=>{
    const previous=note&&(note.fields[0]!==key||word.grammarId)?{...note.card,word}:note?.card
    return {layout:2,...mergeAnkiExample(previous,word,{...example,audio:audio?ANKI_AUDIO_SLOT:'',cover:attachCover?ANKI_COVER_SLOT:cover&&!withCover?'':undefined})}
  }
  const [,front,back]=ankiCardFields('',card(choice?.key,target,withAudio),{preview:true,previewCover:cover??''})
  const destination=decks?.find(value=>value.id===deck)
  const duplicate=choice?.cards.some(note=>note.card.examples.some(item=>item.id===example.id))

  function moveTrim(edge,value){
    preview.stop()
    // 保留至少 0.1 秒，原本就更短的片段保持完整。
    const gap=Math.min(1000,Math.ceil(100/span))
    setTrim(current=>edge==='start'
      ? {...current,start:Math.min(value,current.end-gap)}
      : {...current,end:Math.max(value,current.start+gap)})
  }

  async function save(){
    if(saving||cover===null||!word.meaning||(!destination&&!target))return
    preview.stop()
    setSaving(true);setError('')
    try{
      const contextKey=await ankiContextKey(example)
      const key=choice?.key??(word.keyReady?await ankiWordKey(word):contextKey)
      if(!choice){
        const keys=key===contextKey?[key]:[key,contextKey]
        const matches=await Promise.all(keys.map(value=>anki.find({key:value})))
        const cards=matches.flatMap((value,index)=>value.notes.map(note=>readAnkiCard(note,keys[index]))).filter(Boolean)
        if(matches.some(value=>value.notes.length)){
          if(!cards.length)throw new Error('找到旧卡，但无法读取它的卡片内容。')
          setChoice({key,cards})
          return
        }
      }
      // const audio=withAudio?await ankiClipBase64(audioUrl,song,lines,duration):undefined
      const audio=withAudio?await ankiClipBase64(audioUrl,song,lines,duration,clipBounds):undefined
      const payload={deckId:destination?.id,noteId:target?.id,expected:target?.fields,exampleId:example.id,fields:ankiCardFields(key,card(key,target,audio)),audio,cover:attachCover?cover.split(',')[1]:undefined}
      await retryAnkiDeckRead(()=>anki.save(payload))
      if(destination&&!target){try{saveAnkiDeck(destination)}catch{/* 卡片已保存，牌组偏好下次可重选。 */}}
      onSaved(target?'已更新原 Anki 卡片':'已加入 Anki')
    }catch(failure){setError(failure.message||'无法保存 Anki 卡片。')}
    finally{setSaving(false)}
  }

  return <>
    <h3 className="anki-editor-title">{word.surface}</h3>
    {decks?.length>0?<label>牌组<select value={deck} disabled={saving||Boolean(target)} onChange={event=>setDeck(event.target.value)}>
      <option value="">请选择牌组</option>{decks.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>:decks?<p>请先在「设置 → 学习复习 → Anki 配置」创建牌组。</p>:deckError?<div>
      <p role="alert" className="review-error">{deckError}</p>
      <button type="button" onClick={()=>{setDeckError('');setAttempt(value=>value+1)}}>重新读取牌组</button>
    </div>:<p role="status">正在读取 Anki 牌组…</p>}
    {target&&<p>补充内容会保存到原卡所在的牌组。</p>}
    {/* 原来只可勾选是否附音频，现可先试听，需要时展开首尾裁剪。 */}
    {audioAvailable?<div className="anki-clip-options">
      <audio ref={preview.ref} src={audioUrl} preload="metadata" onEnded={preview.onEnded}/>
      <label className="anki-audio-option"><input type="checkbox" checked={withAudio} disabled={saving} onChange={event=>{preview.stop();setWithAudio(event.target.checked)}}/>带上这段原唱</label>
      {withAudio&&<>
        <div className="anki-clip-tools">
          <span>片段时长 {((clipBounds.end-clipBounds.start)).toFixed(2)} 秒</span>
          <button type="button" disabled={saving} onClick={preview.toggle}>{preview.playing||preview.busy?'停止试听':'试听'}</button>
          <button type="button" disabled={saving} aria-expanded={trimOpen} onClick={()=>setTrimOpen(!trimOpen)}>{trimOpen?'收起裁剪':'裁剪'}</button>
        </div>
        {trimOpen&&<div className="anki-trim-fields">
          <label>起点 {clipBounds.start.toFixed(2)} 秒<input type="range" aria-label="裁剪起点" aria-valuetext={`${clipBounds.start.toFixed(2)} 秒`} min="0" max="1000" value={trim.start} disabled={saving} onChange={event=>moveTrim('start',Number(event.target.value))}/></label>
          <label>终点 {clipBounds.end.toFixed(2)} 秒<input type="range" aria-label="裁剪终点" aria-valuetext={`${clipBounds.end.toFixed(2)} 秒`} min="0" max="1000" value={trim.end} disabled={saving} onChange={event=>moveTrim('end',Number(event.target.value))}/></label>
          <button type="button" disabled={saving||(trim.start===0&&trim.end===1000)} onClick={()=>{preview.stop();setTrim({start:0,end:1000})}}>恢复原片段</button>
        </div>}
        {preview.error&&<p role="alert" className="review-error">{preview.error}</p>}
      </>}
    </div>:<p>当前没有可导出的短音频片段，可以保存文字卡。</p>}
    {cover?<label className="anki-audio-option"><input type="checkbox" checked={withCover} disabled={saving} onChange={event=>setWithCover(event.target.checked)}/>附歌曲封面</label>:cover===null?<p role="status">正在准备歌曲封面…</p>:artworkUrl?<p>暂时无法读取封面，仍可保存卡片。</p>:null}
    {choice&&<div className="anki-existing">
      <p>已找到原卡。可选择补充到原卡，再预览合并后的内容。</p>
      {choice.cards.map(note=><button className="anki-existing" type="button" key={note.id} disabled={saving||!note.editable} aria-pressed={target?.id===note.id} onClick={()=>setTarget(target?.id===note.id?null:note)}>
        <span>{note.card.examples.map(item=>`${item.surface} · 《${item.song}》`).join('、')}</span>
        <strong>{!note.editable?'此卡已在 Anki 手动修改':note.card.examples.some(item=>item.id===example.id)?'预览更新这条':'预览补充到此卡'}</strong>
      </button>)}
    </div>}
    {/* 预览和写入使用同一套已转义的卡片模板。音频在写入时剪出，预览标明是否附原唱。 */}
    <div className="anki-preview"><h3>卡面预览</h3><div dangerouslySetInnerHTML={{__html:front}}/></div>
    <div className="anki-preview"><h3>卡背预览</h3><div dangerouslySetInnerHTML={{__html:back}}/></div>
    <button type="button" disabled={saving} aria-expanded={editing} onClick={()=>setEditing(!editing)}>{editing?'收起编辑':'编辑讲解'}</button>
    {editing&&<div className="anki-edit-fields">
      {entry.grammarId&&<label>卡面标题<input value={title} disabled={saving} onChange={event=>setTitle(event.target.value)}/></label>}
      <label>{entry.grammarId?'语法讲解':'释义'}<textarea value={meaning} disabled={saving} onChange={event=>setMeaning(event.target.value)} rows={3}/></label>
      {!entry.grammarId&&<label>用法<textarea value={usage} disabled={saving} onChange={event=>setUsage(event.target.value)} rows={3}/></label>}
    </div>}
    {error&&<p role="alert" className="review-error">{error}</p>}
    <div className="anki-card-actions">
      <button type="button" disabled={saving} onClick={onBack??onClose}>{onBack?'返回选择':'关闭'}</button>
      <button type="button" disabled={saving||cover===null||!word.meaning||(!destination&&!target)||Boolean(duplicate&&!target)} onClick={save}>
        {saving?'处理中…':target?'保存到原卡':choice?'独立保存':withAudio?'加入 Anki':'保存文字卡'}
      </button>
    </div>
  </>
}
