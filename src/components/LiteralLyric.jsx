import { literalReadingRows } from '../lib/songLanguage.js'

// 其他语言保留原文空格和标点；只有用户实际填写的词才生成上方标注。
export default function LiteralLyric({text,tokens=[],corrections,songId,lineId,readingStyle,importedRomaji,language,showSourceReadings=true,showManualReadings=true}) {
  if (language === 'zh' || readingStyle === 'none') return <span className="literal-lyric" lang={language==='other'?undefined:language}>{text || tokens.map(token=>token.surface).join('')}</span>
  const rows=literalReadingRows(tokens,corrections,songId,lineId,importedRomaji,{showSourceReadings,showManualReadings})
  return <span className="literal-lyric" lang={language==='other'?undefined:language}>
    {rows.source && <span className="literal-source-reading">{rows.source}</span>}
    <span>{tokens.length?tokens.map((token,index)=>rows.readings[index]?<ruby className="literal-ruby" key={token.index}>{token.surface}<rt>{rows.readings[index]}</rt></ruby>:<span key={token.index}>{token.surface}</span>):text}</span>
  </span>
}
