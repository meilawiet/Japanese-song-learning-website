import { normalizeRomajiPosition } from '../lib/readingDisplay'

// 位置仅改变日语罗马音的显示；假名始终位于汉字上方，偏好由父层按歌曲保存。
export default function RomajiPositionOptions({ position, onChange }) {
  return <label className="study-language-setting romaji-position-setting"><span>罗马音位置</span><select aria-label="罗马音位置" value={normalizeRomajiPosition(position)} onChange={event => onChange(event.target.value)}><option value="above">歌词上方</option><option value="below">歌词下方</option></select></label>
}
