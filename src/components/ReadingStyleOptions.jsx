// 逐句和跟唱共用三种注音选项，选择后即时生效并由父层保存。
export default function ReadingStyleOptions({ readingStyle, onReadingStyle, name = 'study-reading' }) {
  return <fieldset><legend>注音类型</legend>{[['hiragana', '假名'], ['romaji', '罗马音'], ['both', '假名＋罗马音']].map(([value, label]) => <label key={value}><input type="radio" name={name} value={value} checked={readingStyle === value} onChange={() => onReadingStyle(value)} />{label}</label>)}</fieldset>
}
