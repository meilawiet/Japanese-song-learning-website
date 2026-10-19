import { useEffect, useState } from 'react'

export default function DesktopGeneralSettings() {
  const [behavior, setBehavior] = useState('ask')
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let live = true
    const load = () => window.utaDesktop.loadCloseBehavior().then(value => { if (live) setBehavior(value.behavior) })
      .catch(() => { if (live) setMessage('无法读取关闭方式，请重新选择。') })
      .finally(() => { if (live) setBusy(false) })
    void load()
    const unsubscribe = window.utaDesktop.onCloseBehaviorChanged(value => { if (live) setBehavior(value.behavior) })
    // The native close chooser can remember a choice while this panel remains
    // open in the tray. Read it again when the window is restored.
    window.addEventListener('focus', load)
    return () => { live = false; unsubscribe(); window.removeEventListener('focus', load) }
  }, [])
  async function change(value) {
    setBusy(true); setMessage('')
    try { const saved = await window.utaDesktop.saveCloseBehavior({ behavior: value }); setBehavior(saved.behavior); setMessage('已保存，下次关闭窗口时生效。') }
    catch { setMessage('保存失败，请重试。') }
    finally { setBusy(false) }
  }
  return <div className="settings-content desktop-general-settings">
    <h3>关闭窗口时</h3><p className="settings-description">选择点击右上角关闭按钮后的操作，也可在关闭时勾选记住选择。</p>
    <label className="desktop-close-setting">关闭方式<select aria-label="关闭窗口时的操作" value={behavior} disabled={busy} onChange={event => void change(event.target.value)}>
      <option value="ask">每次询问</option><option value="tray">最小化到系统托盘</option><option value="quit">直接退出应用</option>
    </select></label>
    <p className="settings-note">最小化到托盘会保留音乐播放和当前编辑。点击托盘图标可恢复窗口，右键菜单可打开设置或退出 UTA。真正退出时，未保存修改仍会提示。</p>
    <p className="desktop-close-status" role="status">{message}</p>
  </div>
}
