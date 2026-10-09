import { BookOpen, ChevronRight, History, LibraryBig, Mic2, Settings, UserRound } from 'lucide-react'
import LocalProfile from './LocalProfile'

// 安卓首页沿用三屏结构；学习页现提供逐句学习与连续跟唱两个入口。
export default function AndroidHome({ tab, onEnterLearn, onEnterSingAlong, onEnterReview, onOpenLibrary, onOpenSettings, recentLearn, recentSing }) {
  if (tab === 'mine') {
    return <section className="android-home" aria-label="我的">
      <p className="android-home-eyebrow">ME / 我的</p>
      {/* 旧页头保留对照：<h1 id="android-home-title">我的 UTA</h1><p className="android-home-intro">歌曲与应用选项集中放在这里。</p> */}
      {/* 按用户要求删除大号标题，ME / 我的继续保留。原标题：<h1 id="android-home-title" className="profile-page-title">我的</h1> */}
      <LocalProfile />
      <div className="android-home-links">
        <button className="android-home-link" type="button" onClick={onOpenLibrary}>
          <span className="android-home-link-icon library"><LibraryBig size={26} /></span>
          {/* 原说明：<small>进入原有歌曲库</small>，按用户要求移除。 */}
          <span><strong>歌曲库</strong></span>
          <ChevronRight size={22} aria-hidden="true" />
        </button>
        <button className="android-home-link" type="button" onClick={onOpenSettings}>
          <span className="android-home-link-icon settings"><Settings size={26} /></span>
          {/* 原说明：<small>进入原有设置功能</small>，按用户要求移除。 */}
          <span><strong>设置</strong></span>
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>
    </section>
  }

  const learning = tab === 'learn'
  const title = learning ? '今天开始学习' : '巩固已学内容'
  const intro = learning ? '选择一个入口，开始你的日语歌曲练习。' : '从这里进入复习，熟悉每一句歌词。'
  // 旧学习入口文案：const entry = learning ? '学习模式' : '复习模式'
  const entry = learning ? '逐句学习' : '复习模式'
  return <section className="android-home" aria-labelledby="android-home-title">
    <p className="android-home-eyebrow">{learning ? 'LEARN / 学习' : 'REVIEW / 复习'}</p>
    <h1 id="android-home-title">{title}</h1>
    <p className="android-home-intro">{intro}</p>
    <button className={`android-mode-card ${learning ? 'learning' : 'reviewing'}`} type="button" onClick={learning ? onEnterLearn : onEnterReview}>
      <span className="android-mode-icon">{learning ? <BookOpen size={26} /> : <History size={26} />}</span>
      <strong>{entry}</strong>
      <span className="android-mode-description">{learning ? '听一句，学一句，查看读音与解析。' : '回看待复习的歌词。'}</span>
      {learning && recentLearn && <RecentSong song={recentLearn.song} artwork={recentLearn.artwork} />}
      {/* 学习卡片不再重复显示进入文案；复习入口保留。 */}{!learning && <span className="android-mode-action">进入{learning ? '逐句学习' : '复习'} <ChevronRight size={20} aria-hidden="true" /></span>}
    </button>
    {learning && <button className="android-mode-card singing" type="button" onClick={onEnterSingAlong}>
      <span className="android-mode-icon"><Mic2 size={26} /></span>
      <strong>跟唱练习</strong>
      <span className="android-mode-description">从头播放，或点一句从这里连续跟唱。</span>
      {recentSing && <RecentSong song={recentSing.song} artwork={recentSing.artwork} label="最近跟唱" />}
      {/* 按用户要求移除：<span className="android-mode-action">进入跟唱 <ChevronRight size={20} aria-hidden="true" /></span> */}
    </button>}
  </section>
}

// 最近歌曲只占入口右侧的留白，封面失效时仍可用歌名占位。
function RecentSong({ song, artwork, label = '最近学习' }) {
  return <span className="android-mode-recent"><span className="android-mode-recent-cover">{artwork?.artworkUrl ? <img src={artwork.artworkUrl} alt="" referrerPolicy="no-referrer" /> : song.title.slice(0, 2)}</span><span className="android-mode-recent-label">{label}</span><span className="android-mode-recent-title">{song.title}</span><span className="android-mode-recent-artist">{song.artist}</span></span>
}

// 原网页端顶部导航继续由 App.jsx 负责，安卓首页不复用其布局。
export function AndroidBottomNav({ activeTab, onSelect }) {
  const tabs = [
    { id: 'learn', label: '学习', Icon: BookOpen },
    { id: 'review', label: '复习', Icon: History },
    { id: 'mine', label: '我的', Icon: UserRound },
  ]
  return <nav className="android-bottom-nav" aria-label="安卓主导航">
    {tabs.map(({ id, label, Icon }) => <button className={activeTab === id ? 'active' : ''} type="button" key={id} onClick={() => onSelect(id)} aria-current={activeTab === id ? 'page' : undefined}>
      <Icon size={23} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
    </button>)}
  </nav>
}
