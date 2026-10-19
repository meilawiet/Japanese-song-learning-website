import { useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import appPackage from '../../package.json'
import DesktopUpdatePanel from './DesktopUpdatePanel'

export default function DesktopAboutSettings({ canUpdate, updateDrop, onUpdateDropHandled }) {
  const [copyMessage, setCopyMessage] = useState('')
  async function copyGroupNumber() {
    try {
      await navigator.clipboard.writeText('1125131374')
      setCopyMessage('群号已复制。')
    } catch { setCopyMessage('复制失败，请手动复制群号。') }
  }
  return <div className="settings-content desktop-about-settings">
    <h3>关于 UTA</h3><p className="settings-description">UTA Windows · 当前版本 {appPackage.version}</p>
    <section className="settings-data-card desktop-about-card" aria-label="项目地址">
      <div><h4>项目地址</h4><a href="https://github.com/meilawiet/Japanese-song-learning-website" target="_blank" rel="noopener noreferrer">GitHub · UTA 项目<ExternalLink size={14}/></a></div>
    </section>
    <section className="settings-data-card desktop-about-card" aria-label="加群交流">
      <div><h4>加群交流</h4><p>QQ群：<span className="desktop-about-group">1125131374</span></p></div>
      <button type="button" onClick={copyGroupNumber}><Copy size={14}/>复制群号</button>
    </section>
    {copyMessage && <p className="desktop-about-copy-status" role="status">{copyMessage}</p>}
    {canUpdate && <section className="desktop-settings-section" aria-label="检查更新"><DesktopUpdatePanel updateDrop={updateDrop} onUpdateDropHandled={onUpdateDropHandled}/></section>}
  </div>
}
