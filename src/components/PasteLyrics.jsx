import { useState } from 'react'
import { pastedLyricsFile } from '../lib/pastedLyrics'

// 不主动读取剪贴板；用户在文本框内使用系统粘贴，点击确认后才替换预览。
// 草稿由父层持有，折叠后保留；解析错误不清空用户输入。
export default function PasteLyrics({ value, onChange, onChooseLyrics, disabled = false }) {
  const [error, setError] = useState('')
  function apply() {
    try { const file = pastedLyricsFile(value); setError(''); void onChooseLyrics(file) }
    catch (reason) { setError(reason.message || '无法读取粘贴的歌词。') }
  }
  return <div className="paste-lyrics"><label>歌词内容<textarea aria-label="粘贴歌词内容" value={value} onChange={event => { onChange(event.target.value); setError('') }} placeholder="在这里粘贴 LRC 或普通歌词文本" rows={7} disabled={disabled} /></label>{error && <p role="alert">{error}</p>}<button type="button" onClick={apply} disabled={disabled}>使用粘贴歌词</button></div>
}
