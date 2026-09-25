import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Save, Trash2, X } from 'lucide-react'
import { readAiSettings, saveAiSettings } from '../lib/aiSettings'
import './AiSettingsDialog.css'

export default function AiSettingsDialog({ onClose, onSaved }) {
  const [initialSettings] = useState(readAiSettings)
  const [apiKey, setApiKey] = useState(initialSettings.apiKey)
  const [remember, setRemember] = useState(initialSettings.remember)
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  function closeDialog() {
    // Close while mounted so the browser restores focus to the settings button.
    dialogRef.current.close()
    onClose()
  }

  function saveSettings(settings) {
    try {
      saveAiSettings(settings)
      dialogRef.current.close()
      onSaved(settings.apiKey.trim()
        ? 'AI 设置已保存，将在下次 AI 请求时使用。'
        : '浏览器 API Key 已清除，将使用服务端配置（如有）。')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '设置保存失败，请重试。')
    }
  }

  return <dialog ref={dialogRef} className="ai-settings-dialog" aria-labelledby="ai-settings-title" aria-describedby="ai-settings-intro" onCancel={(event) => { event.preventDefault(); closeDialog() }}>
    <button className="ai-settings-close" type="button" onClick={closeDialog} aria-label="关闭设置"><X size={20} /></button>
    <p className="eyebrow">AI SETTINGS</p>
    <h2 id="ai-settings-title">AI 设置</h2>
    <p id="ai-settings-intro" className="ai-settings-copy">填写你自己的 DeepSeek API Key，用于歌词解析、片段讲解和全曲复核。</p>
    <p className="ai-settings-status">{initialSettings.apiKey
      ? `已配置浏览器 Key · ${initialSettings.remember ? '在此浏览器记住' : '仅当前标签页'}`
      : '未设置浏览器 Key；将使用服务端配置（如有）。'}</p>
    <form onSubmit={(event) => { event.preventDefault(); saveSettings({ apiKey, remember }) }}>
      <label className="ai-settings-label" htmlFor="deepseek-api-key">DeepSeek API Key</label>
      <div className="ai-settings-input-row">
        <input id="deepseek-api-key" type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setError('') }} placeholder="输入 API Key" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="ai-settings-key-help" aria-invalid={Boolean(error)} />
        <button type="button" onClick={() => setShowKey((visible) => !visible)} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} aria-pressed={showKey}>{showKey ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </div>
      <p id="ai-settings-key-help" className="ai-settings-help">留空并保存可恢复使用服务端配置。保存设置不会发起 AI 请求，也不会验证 Key 是否有效。</p>
      <label className="ai-settings-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />在此浏览器记住 API Key</label>
      <p className="ai-settings-help">默认仅保存在当前标签页，刷新后保留。勾选后将以明文保存在浏览器本地存储中，请仅在自己的设备上使用。</p>
      <div className="ai-settings-privacy">Key 仅随 AI 请求发送给当前配置的标注 API，再由该服务转发至 DeepSeek；不会写入服务端配置或歌曲备份。默认 API 位于本机；远程使用时请连接可信的 HTTPS 服务。</div>
      {error && <p className="ai-settings-error" role="alert">{error}</p>}
      <div className="ai-settings-actions">
        <button className="ai-settings-clear" type="button" onClick={() => saveSettings({ apiKey: '', remember: false })}><Trash2 size={14} />清除 Key</button>
        <button type="button" onClick={closeDialog}>取消</button>
        <button className="ai-settings-save" type="submit"><Save size={14} />保存设置</button>
      </div>
    </form>
  </dialog>
}
