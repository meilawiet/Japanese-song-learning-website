import {normalizeJapaneseLevel} from './japaneseLevel.js'

// v2解析必须携带原文回显及请求标识；旧缓存保留供用户查看、删除，不默认为已核验。
export const SENTENCE_ANALYSIS_VERSION=2
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):''
export function prepareSentenceRequest(lines,language='ja',level='beginner') {
  const requestId=globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return {language,...(language==='ja'?{japanese_level:normalizeJapaneseLevel(level)}:{}),lines:lines.map((line,index)=>({...line,line_key:`${requestId}:${index}:${line.id}`}))}
}

// 绝不按返回顺序、压缩后的重复歌词位置或猜测句号进行配对。
export function validateSentenceResult(result,payload) {
  const lookup=new Map(payload.lines.map(line=>[line.id,line]))
  if(lookup.size!==payload.lines.length)throw new Error('请求中的歌词编号重复，无法可靠对应解析。')
  const items=Array.isArray(result?.explanations)?result.explanations:[]
  const frequencies=new Map()
  for(const item of items)frequencies.set(item?.line_id,(frequencies.get(item?.line_id)||0)+1)
  const explanations=[]
  for(const item of items){
    const line=lookup.get(item?.line_id)
    if(!line||!Number.isSafeInteger(item.line_id)||frequencies.get(item.line_id)!==1)continue
    if(item.line_key!==line.line_key||typeof item.source_text!=='string'||item.source_text!==line.text)continue
    // 即使模型回显了正确编号，关键表达若来自下一句也拒绝；原形/句型应写在说明或语法中。
    const vocabulary=Array.isArray(item.vocabulary)?item.vocabulary:[]
    if(vocabulary.some(part=>typeof part?.surface==='string'&&part.surface.trim()&&!line.text.includes(part.surface.trim())))continue
    const meaning=clean(item.meaning,600)
    if(!meaning)continue
    explanations.push({line_id:line.id,line_key:line.line_key,source_text:line.text,meaning,
      grammar:(Array.isArray(item.grammar)?item.grammar:[]).map(value=>clean(value,400)).filter(Boolean).slice(0,3),
      vocabulary:vocabulary.map(value=>({surface:clean(value?.surface,100),meaning:clean(value?.meaning,260)})).filter(value=>value.surface&&value.meaning).slice(0,4),
      pronunciation_tip:payload.language==='ja'?clean(item.pronunciation_tip,320):'',binding_version:SENTENCE_ANALYSIS_VERSION})
  }
  const rejected_count=payload.lines.length-explanations.length
  if(!explanations.length)throw new Error('AI解析与请求的歌词原文或编号不对应，结果未保存，请重新生成。')
  return {explanations,requested_count:payload.lines.length,rejected_count}
}
export function visibleSentenceEntry(entry,line,language='ja') {
  return entry?.text===line.text&&(entry.language||'ja')===language&&typeof entry.explanation?.meaning==='string'&&Boolean(entry.explanation.meaning.trim())
}
export function currentSentenceEntry(entry,line,language='ja',level='beginner',strict=true) {
  if(!visibleSentenceEntry(entry,line,language))return false
  if(!strict)return true
  return entry.schemaVersion===SENTENCE_ANALYSIS_VERSION&&entry.explanation.binding_version===SENTENCE_ANALYSIS_VERSION
    &&entry.explanation.line_id===line.id&&entry.explanation.source_text===line.text
    &&(language!=='ja'||entry.japaneseLevel===normalizeJapaneseLevel(level))
}
export function sentenceEntry(line,explanation,language,level) {
  return {text:line.text,language,schemaVersion:SENTENCE_ANALYSIS_VERSION,...(language==='ja'?{japaneseLevel:normalizeJapaneseLevel(level)}:{}),explanation}
}
// 删除只处理解析映射，不触碰歌曲、音频、掌握记录或其他歌曲的解析。
export function removeSentenceEntries(all,songId,lineId=null) {
  const next={...all}
  if(lineId==null){delete next[songId];return next}
  const entries={...(next[songId]||{})};delete entries[lineId]
  if(Object.keys(entries).length)next[songId]=entries;else delete next[songId]
  return next
}
export const sentenceSongFingerprint=song=>JSON.stringify([song.language,song.lines.map(line=>[line.id,line.text,line.translation||''])])

// 删除、重新生成或换等级使旧任务失效；旧网络响应及finally不能覆盖/清理新任务。
export class SentenceTaskGate {
  current=null
  begin(songId,level,fingerprint){this.cancel();return this.current={songId,level,fingerprint,controller:new AbortController()}}
  active(task){return this.current===task&&!task.controller.signal.aborted}
  cancel(songId){if(this.current&&(!songId||this.current.songId===songId)){this.current.controller.abort();this.current=null}}
  finish(task){if(this.current===task)this.current=null}
}
