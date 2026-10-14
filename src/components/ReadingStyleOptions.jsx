// 逐句和跟唱共用三种注音选项，选择后即时生效并由父层保存。
// 原签名没有 includeNone；统一学习页增加不注音，其他旧入口仍沿用三项。
export default function ReadingStyleOptions({ readingStyle, onReadingStyle, name = 'study-reading', includeNone = false }) {
  const choices = includeNone ? [['none', '不注音'], ['hiragana', '平假名'], ['romaji', '罗马音'], ['both', '双注音']] : [['hiragana', '假名'], ['romaji', '罗马音'], ['both', '假名＋罗马音']]
  // 原列表固定三项：[['hiragana', '假名'], ['romaji', '罗马音'], ['both', '假名＋罗马音']]。
  return <fieldset><legend>注音类型</legend>{choices.map(([value, label]) => <label key={value}><input type="radio" name={name} value={value} checked={readingStyle === value} onChange={() => onReadingStyle(value)} />{label}</label>)}</fieldset>
}
