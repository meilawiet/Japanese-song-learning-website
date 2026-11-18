import React,{useSyncExternalStore} from 'react'
import {ArrowLeft,MoreHorizontal,Music2} from 'lucide-react'

// 只改页头编排，模式订阅同一真实播放控制器，更多仍打开原有业务弹窗。
export default function StudyHeader({song,artwork,learned,onChoose,onBack,transport,error}){
 const state=useSyncExternalStore(transport.subscribe,transport.getSnapshot,transport.getSnapshot)
 return <header className="refined-study-header">
  {/* 原横屏把歌名和歌手留在工具栏，并另渲染唱片。现在两种方向共用一套封面和歌曲信息。 */}
  <div className="refined-study-identity">
   <button type="button" className="refined-icon" aria-label="返回上一页" onClick={onBack}><ArrowLeft size={23}/></button>
   <button type="button" className="refined-study-cover" aria-label={`选择歌曲，当前为${song.title}`} onClick={onChoose}>
    <Music2 size={20}/>
    {artwork?.artworkUrl&&<img key={artwork.artworkUrl} src={artwork.artworkUrl} alt="" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true}}/>}
   </button>
   <div className="refined-study-title"><h1>{song.title}</h1><p>{song.artist||'未知歌手'}</p></div>
   <button type="button" className="refined-icon" aria-label="更多学习选项" onClick={()=>window.dispatchEvent(new Event('uta:demo-study-options'))}><MoreHorizontal size={24}/></button>
  </div>
  <div className="refined-study-navigation"><div role="group" aria-label="练习模式">{[['sentence','逐句学习'],['continuous','跟唱练习']].map(([id,label])=><button type="button" key={id} aria-pressed={state.mode===id} onClick={()=>transport.setMode(id)}>{label}</button>)}</div><span>{learned}/{song.lines.length} 句已掌握</span></div>
  {/* 原横屏唱片保留作对照：
  <button type="button" className="tablet-record" aria-label="换一首歌" onClick={onChoose}>
   <span className="tablet-record-art">{artwork?.artworkUrl?<img src={artwork.artworkUrl} alt="" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true}}/>:null}<Music2 size={30}/></span>
  </button> */}
  {error&&<p className="refined-study-error" role="alert">{error}</p>}
 </header>
}
