import { SONG_LANGUAGES, detectSongLanguage } from '../lib/songLanguage.js'

// 导入预览与学习页更多共用四类选择，用户选择始终优先于自动判断。
export default function SongLanguageSelect({language,lines,onChange,automatic=false}) {
  const detected=detectSongLanguage(lines)
  return <label className="study-language-setting"><span>歌词语言</span><select aria-label="歌词语言" value={language || detected.language} onChange={event=>onChange(event.target.value)}>{SONG_LANGUAGES.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>{automatic&&<small>{detected.uncertain?'语言判断可能不准确，请确认。':'已根据原文歌词自动识别，可手动调整。'}</small>}</label>
}
