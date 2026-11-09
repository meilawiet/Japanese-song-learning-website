import React from 'react'
import {BookOpen,History,UserRound,LibraryBig,Plus,ChevronRight,Settings,Play,Music2,Palette,CircleHelp} from 'lucide-react'
import ProfilePanel from '/src/components/ProfilePanel.jsx'
import {recentLibrarySongs} from '../lib/recentSongs'

// 第二版展示层完整保留于baseline/AndroidHome.jsx；本版按用户要求回到首版的紧凑结构。
function Cover({song,artworkFor,className=''}){const url=song&&artworkFor?.(song)?.artworkUrl;return <span className={'refined-cover '+className}>{url?<img src={url} alt="" referrerPolicy="no-referrer"/>:<Music2 size={24}/>}</span>}
export default function AndroidHome({tab,songs=[],recentSongIds=[],artworkFor,learnedBySong={},reviewItems=[],onOpenSong,onImport,onEnterReview,onOpenLibrary,onOpenSettings,onOpenHelp,recentLearn}){
 const library=songs.filter(song=>!song.isDemo),recent=library.find(song=>song.id===recentLearn?.song?.id)||library[0],mine=tab==='mine',learned=Object.values(learnedBySong).reduce((total,ids)=>total+(ids?.length||0),0)
 // 原列表用 library.slice(0,3)；现在按学习历史的顺序显示。
 const recentSongs=recentLibrarySongs(songs,recentSongIds)
 // 原顺序：歌曲库、导入歌曲、外观、设置。帮助作为独立页面放在外观和设置之间。
 const shortcuts=[
  ['歌曲库','管理歌曲与歌词',LibraryBig,onOpenLibrary],
  ['导入歌曲','音频、文件与在线歌词',Plus,onImport],
  ['外观','主题、字体与背景',Palette,()=>onOpenSettings('theme')],
  ['帮助','使用指南与问题反馈',CircleHelp,onOpenHelp],
  ['设置','AI、来源、备份与关于',Settings,()=>onOpenSettings()],
 ]
 return <section className={'refined-home '+(mine?'refined-mine':'refined-learn')} aria-label={mine?'我的':'学习首页'}>
  <header className="refined-page-heading"><h1>{mine?'我的':'学习'}</h1>{!mine&&<button type="button" className="refined-icon" aria-label="打开歌曲库" onClick={onOpenLibrary}><LibraryBig size={22}/></button>}</header>
  {mine?<>
   {/* 复用真实头像预览及资料存储，只把原居中展示改为左侧横排。 */}
   <section className="refined-identity" aria-label="个人资料"><ProfilePanel/><button type="button" className="refined-profile-link" aria-label="编辑个人资料" onClick={()=>onOpenSettings('profile')}><span>个人资料</span><ChevronRight size={17}/></button></section>
   <div className="refined-statistics"><span><strong>{library.length}</strong><small>首歌曲</small></span><span><strong>{reviewItems.length}</strong><small>个复习单元</small></span><span><strong>{learned}</strong><small>句已掌握</small></span></div>
   <nav className="refined-shortcuts" aria-label="我的功能">{shortcuts.map(([label,description,Icon,onClick])=><button type="button" key={label} onClick={onClick}><Icon size={22}/><span><strong>{label}</strong><small>{description}</small></span><ChevronRight size={18}/></button>)}</nav>
  </>:<>
   {recent?<button type="button" className="refined-continue" aria-label={'继续学习 '+recent.title} onClick={()=>onOpenSong(recent.id)}><Cover song={recent} artworkFor={artworkFor}/><span className="refined-cover-shade"/><span className="refined-continue-copy"><small>继续学习</small><strong>{recent.title}</strong><span>{recent.artist||'未知歌手'}</span></span><span className="refined-continue-play"><Play size={21} fill="currentColor"/></span></button>:<div className="refined-empty"><Music2 size={32}/><h2>歌曲库还是空的</h2><p>导入音频或歌词，开始第一首歌。</p><button type="button" onClick={onImport}>导入歌曲</button></div>}
   <div className="refined-section-heading"><h2>我的歌曲 <small>{library.length}</small></h2><button type="button" onClick={onOpenLibrary}>全部<ChevronRight size={16}/></button></div>
   <div className="refined-song-list">{recentSongs.map(song=><button type="button" className="refined-song" key={song.id} onClick={()=>onOpenSong(song.id)} aria-label={'学习 '+song.title}><Cover song={song} artworkFor={artworkFor}/><span><strong>{song.title}</strong><small>{song.artist||'未知歌手'}{song.lyricsOnly?' · 仅歌词':''}</small></span><ChevronRight size={17}/></button>)}</div>
   {/* 首页只留一个明确导入入口，复习直接使用底部导航，不再重复提醒卡片。 */}
   <button className="refined-import" type="button" onClick={onImport}><Plus size={19}/>导入歌曲</button>
  </>}
 </section>
}
// 三主页导航的顺序与真实滑动逻辑不变，沿用首版轻量选中胶囊。
export function AndroidBottomNav({activeTab,onSelect}){return <nav className="android-bottom-nav refined-nav" aria-label="安卓主导航">{[['learn','学习',BookOpen],['review','复习',History],['mine','我的',UserRound]].map(([id,label,Icon])=><button key={id} type="button" className={activeTab===id?'active':''} aria-current={activeTab===id?'page':undefined} onClick={()=>onSelect(id)}><span><Icon size={23} strokeWidth={1.8}/></span><small>{label}</small></button>)}</nav>}
