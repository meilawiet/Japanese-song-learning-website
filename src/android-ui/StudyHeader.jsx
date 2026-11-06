import React,{useSyncExternalStore} from 'react'
import {ArrowLeft,MoreHorizontal,Music2} from 'lucide-react'

// 只改页头编排，模式订阅同一真实播放控制器，更多仍打开原有业务弹窗。
export default function StudyHeader({song,artwork,learned,onChoose,onBack,transport,error}){
 const state=useSyncExternalStore(transport.subscribe,transport.getSnapshot,transport.getSnapshot)
 return <header className="refined-study-header">
  <div className="refined-study-identity"><button type="button" className="refined-icon" aria-label="返回上一页" onClick={onBack}><ArrowLeft size={23}/></button><button type="button" className="refined-study-cover" aria-label={`选择歌曲，当前为${song.title}`} onClick={onChoose}>{artwork?.artworkUrl?<img src={artwork.artworkUrl} alt="" referrerPolicy="no-referrer"/>:<Music2 size={20}/>}</button><div><h1>{song.title}</h1><p>{song.artist||'未知歌手'}</p></div><button type="button" className="refined-icon" aria-label="更多学习选项" onClick={()=>window.dispatchEvent(new Event('uta:demo-study-options'))}><MoreHorizontal size={24}/></button></div>
  <div className="refined-study-navigation"><div role="group" aria-label="练习模式">{[['sentence','逐句学习'],['continuous','跟唱练习']].map(([id,label])=><button type="button" key={id} aria-pressed={state.mode===id} onClick={()=>transport.setMode(id)}>{label}</button>)}</div><span>{learned}/{song.lines.length} 句已掌握</span></div>
  {error&&<p className="refined-study-error" role="alert">{error}</p>}
 </header>
}
