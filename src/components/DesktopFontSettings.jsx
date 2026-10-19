import { useEffect, useState } from 'react'
import { DEFAULT_DESKTOP_FONT, DESKTOP_FONT_GROUPS, desktopFont } from '../lib/desktopFonts'
import WordReading from './WordReading'

const sample = [
  { index: 0, surface: '夢', reading: 'ゆめ' },
  { index: 1, surface: 'を', reading: 'を', part_of_speech: '助詞' },
  { index: 2, surface: '見よう', reading: 'みよう' },
]
export default function DesktopFontSettings({ value = DEFAULT_DESKTOP_FONT, onChange }) {
  const selected = desktopFont(value)
  const group = DESKTOP_FONT_GROUPS.find(item => item.id === selected.groupId)
  const [status, setStatus] = useState('')
  useEffect(() => {
    let live = true
    if (!selected.family) { setStatus('已应用系统字体 · 自动保存'); return undefined }
    setStatus('正在加载字体…')
    document.fonts.load(`24px "${selected.family}"`, '梦想 夢を見よう').then(fonts => {
      if (live) setStatus(fonts.length ? '已应用 · 自动保存' : '此字体未能加载，暂时使用系统字体。')
    }).catch(() => { if (live) setStatus('此字体未能加载，暂时使用系统字体。') })
    return () => { live = false }
  }, [selected.id, selected.family])
  return <div className="settings-content desktop-font-settings">
    <h3>应用字体</h3><p className="settings-description">界面、歌词、注音和翻译即时切换，字号继续分别调节。</p>
    <div className="desktop-font-controls">
      <label>选择字体<select aria-label="应用字体" value={group.id} onChange={event => onChange(DESKTOP_FONT_GROUPS.find(item => item.id === event.target.value).fonts[0].id)}>{DESKTOP_FONT_GROUPS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {group.fonts.length > 1 && <label>字体字重<select aria-label="字体字重" value={selected.id} onChange={event => onChange(event.target.value)}>{group.fonts.map(font => <option key={font.id} value={font.id}>{font.name}</option>)}</select></label>}
      <button type="button" disabled={selected.id === DEFAULT_DESKTOP_FONT} onClick={() => onChange(DEFAULT_DESKTOP_FONT)}>恢复默认字体</button>
    </div>
    <div className="desktop-font-preview" aria-label="字体预览"><p>把喜欢的歌，一句一句唱清楚。</p><div className="auto-lyric word-aligned word-aligned-both">{sample.map(token => <WordReading key={token.index} token={token}/>)}</div><div className="reading-preview-translation">一起做梦吧。</div></div>
    <p className="desktop-font-status" role="status">{status}</p>
    <p className="settings-note">字体已包含在软件内，无需联网或安装到系统。缺少的字符会由系统字体补齐。关闭软件后会记住选择，学习备份也会保留字体设置。</p>
  </div>
}
