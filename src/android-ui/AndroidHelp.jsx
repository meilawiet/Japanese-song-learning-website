import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Menu, X } from 'lucide-react'
import { FeedbackFormLink } from '../components/FeedbackInvite.jsx'
import './help.css'

// 帮助内容随应用提供。原目录分为「快速开始」和「使用指南」，现按三个使用阶段编排。
const groups = [
  { title: '快速启动', topics: [
    { id: 'import', title: '导入歌曲', intro: '把音频和歌词放进歌曲库，再从学习首页打开歌曲。', sections: [
      { title: '导入手机文件', text: '在「学习」或「我的」点击「导入歌曲」，选择「从手机文件导入」。可以选取音频和歌词文件，也可以粘贴歌词。' },
      { title: '在线查找歌词', text: '在导入页使用在线查找，按歌名和歌手搜索。选定结果后，先核对歌曲版本和歌词是否对应。' },
      { title: '稍后补充音频', text: '只有歌词时也可以先导入。之后到歌曲库长按歌曲，进入编辑补充音频。' },
    ] },
    // 原「逐句学习与跟唱」拆成两个条目，方便直接找到各自的播放操作。
    { id: 'sentence', title: '逐句学习', intro: '每次听一句，边听边看歌词和注音。', sections: [
      { title: '播放一句', text: '打开歌曲，选择「逐句学习」，点按任意一句开始播放。播到句尾会停下，再点播放键可重听当前句。' },
      { title: '选段播放', text: '先双击起始句，再双击结束句。选中范围高亮后，点底部播放键即可从段首播放，播到段尾会自动停下。' },
      { title: '查看注音与解析', text: '在歌曲页的「更多」里选择注音类型。配置 AI 服务后，可以点按歌词旁的解析图标查看单词和语法。' },
    ] },
    { id: 'sing', title: '跟唱练习', intro: '连续播放歌曲，歌词高亮会跟随播放进度。', sections: [
      { title: '开始跟唱', text: '在歌曲页选择「跟唱练习」，按下播放键即可。可以用倍速按钮放慢音频。' },
      { title: '跳到指定歌词', text: '拖动进度条或点按歌词来定位。双击起始句和结束句可选出一段，再按播放键练习这一段。' },
    ] },
  ] },
  { title: '使用指北', topics: [
    { id: 'about', title: 'UTA 是什么', intro: 'UTA 是一款用歌曲和歌词学习语言的应用。', sections: [
      { title: '从喜欢的歌开始', text: '导入歌曲后，可以查看歌词、注音和歌词文件提供的翻译，逐句听读或跟着原声练习。' },
      { title: '把歌词变成复习材料', text: '收藏难懂的句子或段落，之后到复习本重听、回看解析并做笔记。' },
      { title: '用 Anki 复习', text: '也可以把 AI 讲解中的单词、固定搭配和语法制成 Anki 卡片。' },
    ] },
    { id: 'timing', title: '调整歌词时间戳', intro: '歌词出现得太早或太晚时，可以微调对应的时间点。', sections: [
      { title: '调整一句', text: '在歌曲页打开「更多 → 调整时间戳」，选中歌词。+0.2s 让该句更晚出现，−0.2s 让它更早出现。' },
      { title: '调整一段', text: '在调整模式下，分别双击起始句和结束句，再使用右侧按钮统一微调这段歌词。' },
    ] },
    // 保留应用内的歌词收藏，同时补上安卓 AnkiDroid 的配置和制卡流程。
    { id: 'review', title: '收藏与复习', intro: '在 UTA 复习本回听歌词，也可以把单词、搭配和语法加入 Anki。', sections: [
      { title: '收藏本句或本段', text: '双击一句歌词后可收藏本句。再双击另一句确定范围，即可收藏本段。' },
      { title: '进入复习', text: '在「复习」点按歌曲，先听音频，再进入复习查看单词、语法和笔记。' },
      { title: '连接 AnkiDroid', text: '先安装并打开 AnkiDroid，再进入「我的 → 设置 → 学习复习 → 复习配置 · Anki」。点「测试连接」并允许访问。看到「连接成功」后，可以选择或创建默认牌组。' },
      { title: '预览并添加卡片', text: '打开歌词的整句解析，在想复习的单词、固定搭配或语法旁点「加入 Anki」。可以选择牌组、预览卡面和卡背，并修改讲解。歌曲有封面时会带上封面，有可用原唱片段时可选择带上音频。' },
      { title: '试听与裁剪原唱', text: '在制卡预览点「试听」可检查要附上的音频。遇到句尾间奏，展开「裁剪」并向前拖动终点，也可以调整起点或恢复原片段。裁剪只用于这次制卡。' },
      { title: '补充已有卡片', text: '再次遇到已保存的词形或同一原形的其他变形时，可按提示补充例句和讲解，也可独立保存一张卡片。保存后到 AnkiDroid 的对应牌组复习。' },
    ] },
    { id: 'readings', title: '手动注音', intro: '发现自动读音与实际唱法不一致时，可以手动修改。', sections: [
      { title: '只修改这一句', text: '在学习页长按歌词，进入「编辑这一句」，校正对应词的读音后点「保存修改」。' },
      { title: '同步到整首歌', text: '点「保存并同步整首歌」，可把本句的人工注音应用到这首歌里其他相同的完整词。如果相同写法在不同句里读法不同，可以逐句保存。' },
    ] },
    { id: 'appearance', title: '个性化', intro: '从「我的」调整个人资料和显示效果。', sections: [
      { title: '个人资料', text: '进入「个人资料」可修改昵称、上传并裁剪头像，也可以调整用于 AI 讲解的日语水平。' },
      { title: '主题配色与背景', text: '进入「外观」可选择浅色、深色或跟随系统，调整主题配色，或从相册选择背景图片。' },
      { title: '字体与字号', text: '展开「外观」里的「字体与字号」，选择字体，分别调整应用字号和歌词字号。' },
    ] },
  ] },
  { title: '进阶使用', topics: [
    { id: 'ai', title: '配置 AI 服务', intro: '配置自己的服务后，可使用歌词解析和「问 AI」。', sections: [
      { title: '填写并测试', text: '进入「我的 → 设置 → AI 服务」，选择服务或填写兼容服务的 API 地址、API Key 和模型名称。点「测试连接」，成功后点「保存设置」。' },
      { title: '开始解析', text: '返回歌曲页点按歌词旁的解析图标，也可以使用「问 AI」。测试和解析可能产生调用费用。' },
    ] },
    { id: 'ai-teaching', title: 'AI 讲解模式', intro: '根据日语水平和希望了解的细节，选择适合自己的歌词讲解。', sections: [
      { title: '选择日语水平', text: '首次打开新版时会弹出学习设置。已有的选择会预先选中，也可以点「稍后设置」。以后可以在「我的 → 设置 → 学习复习」调整日语水平和 AI 讲解模式。' },
      { title: '简略模式', text: '先解释整句意思，再挑重点讲解。每句的单词和语法各最多 2 项。' },
      { title: '详细模式', text: '同样分为整句意思、单词和语法。单词和语法没有固定条数，可以按这句歌词补充更多细节。' },
      { title: '何时生效', text: '设置用于之后生成的讲解。若要用新设置查看已解析的句子，可以手动重新生成。' },
    ] },
    // 原「备份与恢复」纳入「数据同步」，同步方式仍以实际的云备份与恢复为准。
    { id: 'backup', title: '数据同步', intro: '通过 WebDAV 在设备间备份和恢复 UTA 资料。', sections: [
      { title: '打开云备份', text: '从「我的 → 设置 → 数据管理 → WebDAV 云备份」进入，填写服务地址和账号信息。' },
      { title: '上传与恢复', text: '先在有最新资料的设备上传备份，再在目标设备连接同一目录，选中备份并查看预览。确认恢复会替换目标设备的本地数据。' },
    ] },
    { id: 'lyric-sources', title: '在线歌词源配置', intro: '可为在线查找添加来源，并在导入时选择使用哪个来源。', sections: [
      { title: '添加来源', text: '进入「我的 → 设置 → 数据管理 → 歌曲与歌词来源」，填写来源名称和网址，然后点「添加来源」。' },
      { title: '在导入页使用', text: '打开「导入歌曲」里的在线查找，选择已配置的来源，再按歌名和歌手搜索。标记为支持应用内歌词搜索的来源可直接搜索，其他网址会在浏览器中打开。' },
      { title: 'UtaTen 搜索', text: '当前网络无法直连 UtaTen 时，需要先开启网络代理（魔法），再返回 UTA 选择 UtaTen 搜索歌词。' },
    ] },
  ] },
]

export default function AndroidHelp({ onBack }) {
  const [topicId, setTopicId] = useState(groups[0].topics[0].id)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const body = useRef(null)
  const menuButton = useRef(null)
  const directory = useRef(null)
  const topic = groups.flatMap(group => group.topics).find(item => item.id === topicId)

  // 打开目录后，返回键和 Esc 先关闭侧栏，键盘焦点留在目录内。
  useEffect(() => {
    if (!directoryOpen) return
    directory.current?.querySelector('button')?.focus()
    const close = event => {
      event.preventDefault()
      event.stopImmediatePropagation()
      setDirectoryOpen(false)
    }
    const onKey = event => {
      if (event.key === 'Escape') close(event)
      if (event.key !== 'Tab') return
      const buttons = directory.current?.querySelectorAll('button')
      const first = buttons?.[0], last = buttons?.[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('uta:navigate-back', close, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('uta:navigate-back', close, true)
      window.removeEventListener('keydown', onKey, true)
      menuButton.current?.focus({ preventScroll: true })
    }
  }, [directoryOpen])

  function selectTopic(id) {
    setTopicId(id)
    setDirectoryOpen(false)
    if (body.current) body.current.scrollTop = 0
  }

  return <section className="uta-help" aria-labelledby="uta-help-title">
    <header className="uta-help-header">
      <button className="refined-icon" type="button" onClick={onBack} aria-label="返回我的"><ArrowLeft size={22} /></button>
      <h1 id="uta-help-title">帮助</h1>
      <FeedbackFormLink />
      <button ref={menuButton} className="refined-icon" type="button" aria-label="打开帮助目录" aria-haspopup="dialog" aria-expanded={directoryOpen} aria-controls={directoryOpen ? 'uta-help-directory' : undefined} onClick={() => setDirectoryOpen(true)}><Menu size={24} /></button>
    </header>
    <div className="uta-help-body" ref={body}>
      <div className="uta-help-layout">
        {/* 原窄屏下拉目录由右侧抽屉统一接管。
        <label className="uta-help-mobile-directory">
          主题目录
          <select value={topicId} onChange={event => selectTopic(event.target.value)}>
            {groups.map(group => <optgroup label={group.title} key={group.title}>
              {group.topics.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
            </optgroup>)}
          </select>
        </label> */}
        <article className="uta-help-article">
          <h2>{topic.title}</h2>
          <p>{topic.intro}</p>
          {topic.sections.map((section, index) => <section key={section.title} id={`uta-help-section-${index}`}>
            <h3>{section.title}</h3>
            <p>{section.text}</p>
          </section>)}
        </article>
        <nav className="uta-help-index" aria-label="本页内容">
          <h2>本页内容</h2>
          {topic.sections.map((section, index) => <button type="button" key={section.title} onClick={() => document.getElementById(`uta-help-section-${index}`)?.scrollIntoView({ block: 'start' })}>{section.title}</button>)}
        </nav>
      </div>
    </div>
    {directoryOpen && <div className="uta-help-drawer-backdrop" onClick={event => { if (event.target === event.currentTarget) setDirectoryOpen(false) }}>
      <aside id="uta-help-directory" className="uta-help-drawer" ref={directory} role="dialog" aria-modal="true" aria-labelledby="uta-help-directory-title">
        <div className="uta-help-drawer-header">
          <h2 id="uta-help-directory-title">帮助目录</h2>
          <button className="refined-icon" type="button" aria-label="关闭帮助目录" onClick={() => setDirectoryOpen(false)}><X size={22} /></button>
        </div>
        <nav className="uta-help-directory" aria-label="帮助章节">
          {groups.map(group => <div className="uta-help-group" key={group.title}>
            <h3>{group.title}</h3>
            {group.topics.map(item => <button type="button" key={item.id} aria-current={topicId === item.id ? 'page' : undefined} onClick={() => selectTopic(item.id)}>{item.title}</button>)}
          </div>)}
        </nav>
      </aside>
    </div>}
  </section>
}
