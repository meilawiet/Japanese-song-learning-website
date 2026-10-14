import {parseTimedLyrics} from './timedLyrics.js'

// 未填写的时间用 null 表示，不能用 0 冒充整首歌词的真实时间轴。
export const hasLyricTimeline = song => Boolean(song?.lines?.length) && song.lines.every(line=>Number.isFinite(line.start)&&line.start>=0)
export const lyricDuration = lines => Math.max(0,...lines.map(line=>Number.isFinite(line.start)?line.start:0))
export function orderLyricLines(lines){return lines.every(line=>Number.isFinite(line.start))?[...lines].sort((a,b)=>a.start-b.start):lines}
export function parseLyricDocument(content,title='',artist=''){
  const trimmed=content.trim()
  if(trimmed.startsWith('{')){
    let document
    try{document=JSON.parse(trimmed)}catch{throw new Error('歌词 JSON 格式无效。')}
    if(document.format!=='uta-annotated-lyrics'||!Array.isArray(document.lines))throw new Error('暂不识别这份 JSON 歌词结构，请使用纯文本或 UTA 注音 JSON。')
    const lines=document.lines.map((line,id)=>{
      // 保留网站直接提供的假名映射，已有括号解析器会将其显示为注音。
      const text=Array.isArray(line.segments)?line.segments.map(s=>String(s.surface||'')+(/[\p{Script=Han}]/u.test(s.surface||'')&&s.kana?`（${s.kana}）`:'')).join(''):String(line.text||'')
      return {id,start:Number.isFinite(line.start)&&line.start>=0?line.start:null,text:text.trim(),translation:String(line.translation||''),romaji:String(line.romaji||'')}
    }).filter(line=>line.text)
    return {title:document.title||title,artist:document.artist||artist,lines:orderLyricLines(lines)}
  }
  const timed=parseTimedLyrics(content,title,artist)
  if(timed.length)return {title,artist,lines:timed}
  // 不按扩展名、日文字符或是否有时间戳拒绝文本；纯英文/汉字同样保留。
  const lines=content.split(/\r?\n/).map(text=>text.trim()).filter(text=>text&&!/^\[(?:ti|ar|al|by|offset|re|ve):.*\]$/i.test(text)).map((text,id)=>({id,start:null,text,translation:''}))
  return {title,artist,lines}
}
