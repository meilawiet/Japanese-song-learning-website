import {currentSentenceEntry,visibleSentenceEntry} from './sentenceAnalysis.js'
import {songLanguage} from './songLanguage.js'

// 新复习单元沿用reviewItems存储：lineId/text保留首行，lineIds/lineTexts描述完整选段。
export const REVIEW_UNIT_VERSION=1
export const REVIEW_FOCUS=['听力','词汇','语法','表达']
export const MAX_REVIEW_LINES=20
const text=value=>typeof value==='string'?value:''
export const reviewLineIds=item=>Array.isArray(item.lineIds)?item.lineIds:[item.lineId]
export const reviewKey=item=>JSON.stringify([item.songId,reviewLineIds(item)])
export function validReviewItem(item) {
  if(!item||typeof item!=='object'||typeof item.songId!=='string'||!Number.isSafeInteger(item.lineId))return false
  if(item.unitVersion==null)return true
  return item.unitVersion===REVIEW_UNIT_VERSION&&Array.isArray(item.lineIds)&&item.lineIds.length>0&&item.lineIds.length<=MAX_REVIEW_LINES
    &&item.lineIds[0]===item.lineId&&item.lineIds.every(Number.isSafeInteger)&&new Set(item.lineIds).size===item.lineIds.length
    &&Array.isArray(item.lineTexts)&&item.lineTexts.length===item.lineIds.length&&item.lineTexts.every(value=>typeof value==='string'&&value.length<=500)
    &&typeof item.text==='string'&&item.text===item.lineTexts[0]
    &&(item.note==null||typeof item.note==='string'&&item.note.length<=1000)
    &&(item.focus==null||Array.isArray(item.focus)&&item.focus.every(value=>REVIEW_FOCUS.includes(value)))
    &&['createdAt','dueAt','lastReviewedAt','intervalDays','reviewCount'].every(key=>item[key]==null||Number.isFinite(item[key])&&item[key]>=0)
    &&(item.analysis==null||typeof item.analysis==='object'&&!Array.isArray(item.analysis)&&typeof item.analysis?.explanation?.meaning==='string')
    &&(item.analysisKey==null||typeof item.analysisKey==='string'&&item.analysisKey.length<=30000)
}
export function createReviewUnit(song,startId,endId=startId,now=Date.now()) {
  const first=song.lines.findIndex(line=>line.id===startId),last=song.lines.findIndex(line=>line.id===endId)
  if(first<0||last<0)throw new Error('找不到要收藏的歌词。')
  const lines=song.lines.slice(Math.min(first,last),Math.max(first,last)+1)
  if(lines.length>MAX_REVIEW_LINES)throw new Error(`一个复习单元最多选择${MAX_REVIEW_LINES}行歌词。`)
  return {unitVersion:REVIEW_UNIT_VERSION,songId:song.id,lineId:lines[0].id,text:lines[0].text,lineIds:lines.map(line=>line.id),lineTexts:lines.map(line=>line.text),createdAt:now,dueAt:now,intervalDays:0,reviewCount:0,focus:[],note:''}
}
export function addReviewUnit(items,unit) {
  return items.some(item=>reviewKey(item)===reviewKey(unit))?items:[...items,unit]
}
// 不重新配对同文副歌；即使原文变化也保留新单元收藏，解析随后明确提示过期。
export function resolveReviewUnit(item,song) {
  const ids=reviewLineIds(item),positions=ids.map(id=>song.lines.findIndex(line=>line.id===id))
  const missing=positions.some(index=>index<0)||positions.some((value,index)=>index>0&&value!==positions[index-1]+1)
  const current=ids.map((id,index)=>song.lines.find(line=>line.id===id)||{id,text:item.lineTexts?.[index]||item.text||'原歌词已不存在',start:null})
  const savedTexts=item.unitVersion===1?item.lineTexts:[item.text]
  const changed=missing||current.some((line,index)=>typeof savedTexts[index]==='string'&&savedTexts[index]!==line.text)
  return {item,song,lines:current,key:reviewKey(item),missing,changed,position:positions[0],text:current.map(line=>line.text).join('\n')}
}
export function reviewGroups(songs,items) {
  return songs.filter(song=>!song.isDemo).flatMap(song=>{
    const seen=new Set(),units=items.filter(item=>item.songId===song.id&&validReviewItem(item)).flatMap(item=>{
      const key=reviewKey(item);if(seen.has(key))return[];seen.add(key);return[resolveReviewUnit(item,song)]
    })
    return units.length?[{song,units}]:[]
  })
}
export const reviewDue=(item,now=Date.now())=>!Number.isFinite(item.dueAt)||item.dueAt<=now
export function gradeReview(item,grade,now=Date.now()) {
  if(!['again','hard','good'].includes(grade))throw new Error('无效的复习评价。')
  // 首版采用可解释的简单间隔：没想起10分钟、有印象1天、熟悉按1/3/7/14/30天增长。
  const old=Number.isFinite(item.intervalDays)?item.intervalDays:0
  const intervalDays=grade==='again'?0:grade==='hard'?1:old<1?1:old<3?3:old<7?7:old<14?14:30
  return {...item,lastReviewedAt:now,dueAt:now+(grade==='again'?10*60*1000:intervalDays*86400000),intervalDays,reviewCount:(Number.isFinite(item.reviewCount)?item.reviewCount:0)+1}
}
export function reviewAnalysisKey(unit) {
  const first=unit.position,last=first+unit.lines.length-1
  return JSON.stringify([unit.song.id,songLanguage(unit.song),unit.lines.map(line=>[line.id,line.text,line.translation||'']),unit.song.lines[first-1]?.text||'',unit.song.lines[last+1]?.text||''])
}
export function reviewAnalysis(unit,sentenceCache,level) {
  const line={id:unit.lines[0].id,text:unit.text},language=songLanguage(unit.song)
  const own=unit.item.analysis
  const fallback=unit.lines.length===1?sentenceCache?.[unit.song.id]?.[line.id]:null
  // 原来只复用单句，多句没有整段解析时一律落到空白：
  // const entry=visibleSentenceEntry(own,line,language)?own:visibleSentenceEntry(fallback,line,language)?fallback:null
  // 单句优先使用新生成的适用记录；旧单元解析仍可查看，不覆盖学习页缓存。
  const entry=currentSentenceEntry(own,line,language,level)&&unit.item.analysisKey===reviewAnalysisKey(unit)?own
    :currentSentenceEntry(fallback,line,language,level)?fallback
    :visibleSentenceEntry(own,line,language)?own:visibleSentenceEntry(fallback,line,language)?fallback:null
  const current=Boolean(entry&&!unit.missing&&currentSentenceEntry(entry,line,language,level)&&(!own||entry!==own||unit.item.analysisKey===reviewAnalysisKey(unit)))
  // 原返回：return {entry,current}
  if(entry||unit.missing||unit.lines.length===1)return {entry,current,explanation:entry?.explanation,lineEntries:[]}
  // 必须逐一匹配歌曲、实际行ID及原文；副歌同文不串行，整段结果不能冒充某一行。
  const lineEntries=unit.lines.flatMap((source,index)=>{
    const cached=sentenceCache?.[unit.song.id]?.[source.id]
    if(!visibleSentenceEntry(cached,source,language))return []
    if(cached.schemaVersion===2&&(cached.explanation?.line_id!==source.id||cached.explanation?.source_text!==source.text))return []
    return [{line:source,number:unit.position+index+1,entry:cached,current:currentSentenceEntry(cached,source,language,level)}]
  })
  if(!lineEntries.length)return {entry:null,current:false,explanation:null,lineEntries}
  // 仅供界面分句展示，不保存为整段解析，不伪造跨行句法或重新调用AI。
  const list=(value)=>(Array.isArray(value)?value:[]).filter(part=>typeof part==='string'&&part.trim())
  const label=(number,value)=>`第${number}行：${value}`
  const explanation={
    meaning:lineEntries.map(({number,entry})=>label(number,entry.explanation.meaning)).join('\n'),
    vocabulary:lineEntries.flatMap(({entry})=>(Array.isArray(entry.explanation.vocabulary)?entry.explanation.vocabulary:[]).filter(word=>typeof word?.surface==='string'&&typeof word?.meaning==='string')),
    grammar:lineEntries.flatMap(({number,entry})=>list(entry.explanation.grammar).map(point=>label(number,point))),
    expression_notes:lineEntries.flatMap(({number,entry})=>list(entry.explanation.expression_notes).map(point=>label(number,point))),
    usage_note:lineEntries.filter(({entry})=>typeof entry.explanation.usage_note==='string'&&entry.explanation.usage_note.trim()).map(({number,entry})=>label(number,entry.explanation.usage_note)).join('\n'),
    learning_focus:lineEntries.flatMap(({number,entry})=>list(entry.explanation.learning_focus).map(point=>label(number,point))),
  }
  return {entry:null,current:lineEntries.length===unit.lines.length&&lineEntries.every(value=>value.current),explanation,lineEntries}
}
export function reviewRequestLine(unit) {
  if(unit.missing)throw new Error('收藏的部分歌词已不存在，请移出后重新收藏正确范围。')
  const index=unit.position
  return {id:unit.lines[0].id,text:unit.text,translation:unit.lines.map(line=>line.translation||'').filter(Boolean).join('\n'),previous_line:unit.song.lines[index-1]?.text||'',next_line:unit.song.lines[index+unit.lines.length]?.text||''}
}
export function reviewPlaybackBounds(song,lines,duration) {
  if(!lines.length||lines.some(line=>!Number.isFinite(line.start)||line.start<0))return null
  const index=song.lines.findIndex(line=>line.id===lines.at(-1).id)
  const end=song.lines.slice(index+1).find(line=>Number.isFinite(line.start)&&line.start>lines.at(-1).start)?.start??duration
  const limited=Math.min(end,Number.isFinite(duration)&&duration>0?duration:end)
  return Number.isFinite(limited)&&limited>lines[0].start?{start:lines[0].start,end:limited}:null
}
export function reviewDictionaryWords(unit,annotations,overrides={},corrections={}) {
  const seen=new Set()
  // 词典参考也尊重用户已保存的读音（含主动留空），词义修正键仍使用原始词典读音。
  return unit.lines.flatMap(line=>((annotations?.[unit.song.id]||[]).find(value=>value.id===line.id&&value.tokens?.map(token=>token.surface).join('')===line.text)?.tokens||[]).map(token=>({...token,originalReading:token.reading,reading:corrections[`${unit.song.id}:${line.id}:${token.index}`]??token.reading}))).filter(token=>!token.is_symbol&&!/助詞|助動詞/.test(token.part_of_speech||'')).flatMap(token=>{
    const key=`${token.dictionary_form||token.surface}:${token.reading}`;if(seen.has(key))return[];seen.add(key)
    return[{surface:text(token.surface),reading:text(token.reading),dictionary_form:text(token.dictionary_form),meaning:text(overrides[`${token.dictionary_form||token.surface}:${token.originalReading}`])||text(token.meaning)||'词义待解析',usage:''}]
  }).slice(0,20)
}
