import { useState } from 'react'
import { DEFAULT_APPEARANCE, THEMES, readAppearance, saveAppearance } from '../lib/appearance'

// 即时预览并保存；失败时保留当前选择，明确提示用户。
export default function ThemePanel() {
  const [appearance, setAppearance] = useState(readAppearance)
  const [error, setError] = useState('')
  function update(next) {
    try { setAppearance(saveAppearance(next)); setError('') } catch { setError('外观设置保存失败，请检查设备存储空间。') }
  }
  return <div className="settings-content theme-panel"><h3>主题设置</h3><p className="settings-description">调整后立即生效，保存在当前设备。</p>
    <label>歌词大小 <output>{appearance.lyricSize}%</output><input aria-label="歌词大小" type="range" min="80" max="160" step="5" value={appearance.lyricSize} onChange={event => update({ ...appearance, lyricSize: Number(event.target.value) })} /></label>
    <label>应用文字大小 <output>{appearance.textSize}%</output><input aria-label="应用文字大小" type="range" min="80" max="130" step="5" value={appearance.textSize} onChange={event => update({ ...appearance, textSize: Number(event.target.value) })} /></label>
    <p className="theme-preview" lang="ja">好きな歌で、日本語を学ぶ<small>用喜欢的歌，练习日语。</small></p>
    {/* 主题卡片只显示配色与名称，保留由用户自行发现的设计彩蛋。 */}
    <h3>应用主题色</h3><div className="theme-options">{THEMES.map(theme => <button key={theme.id} type="button" aria-pressed={appearance.theme === theme.id} onClick={() => update({ ...appearance, theme: theme.id })}><span className="theme-swatches" aria-hidden="true">{theme.colors.map(color => <i key={color} style={{ background: color }} />)}</span>{theme.name}</button>)}</div>
    {error && <p role="alert">{error}</p>}<button className="theme-reset" type="button" onClick={() => update(DEFAULT_APPEARANCE)}>恢复默认外观</button>
  </div>
}
