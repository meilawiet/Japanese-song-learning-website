import {searchSyncedLyrics} from './onlineLyrics.js'
import {fetchPlatformLyrics,searchPlatformSongs} from './platformLyrics.js'

// 已确认的假名/罗马音优先；未知状态不假称含注音，选用获取后重新排序。
export function rankLyricResults(records){
  const score=row=>(row.hasAnnotation||row.trackSummary?.romaji>0||row.trackSummary?.kana>0||/\p{Script=Han}[（(][\p{Script=Hiragana}\p{Script=Katakana}]+[）)]/u.test(row.lyrics||''))?3:row.annotationHint?2:row.lyrics?0:1
  return records.map((row,index)=>({row,index})).sort((a,b)=>score(b.row)-score(a.row)||a.index-b.index).map(item=>item.row)
}
export async function searchLyricsSources(sources,query,signal,handlers={}){
  const search=handlers.search||((provider,keyword)=>provider==='lrclib'?searchSyncedLyrics(keyword,signal):searchPlatformSongs(provider,keyword,signal))
  const read=handlers.read||((record)=>fetchPlatformLyrics(record,signal))
  const providers=[...new Set(sources.map(source=>source.adapter).filter(Boolean))]
  if(!providers.length)throw new Error('请先添加一个可搜索的歌词来源。')
  const rows=await Promise.allSettled(providers.map(async provider=>{
    const keyword=provider==='utaten'?query:query.replace(/\s+\/\s+/g,' ')
    const found=await search(provider,keyword)
    return found.map(record=>({...record,provider:record.provider||provider}))
  }))
  if(signal?.aborted)throw new DOMException('请求已取消','AbortError')
  const errors=rows.flatMap((result,index)=>result.status==='rejected'?[`${sources.find(s=>s.adapter===providers[index])?.name||providers[index]}：${result.reason?.message||'搜索失败'}`]:[])
  const records=rows.flatMap(result=>result.status==='fulfilled'?result.value:[])
  if(!records.length&&errors.length)throw new Error(errors.join('；'))
  // 每源只预取前两项，最多三个并发；其余仍可选用，避免搜索下载全部歌词。
  const tasks=providers.flatMap(provider=>records.filter(row=>row.provider===provider&&!row.lyrics).slice(0,2)),ready=new Map()
  let cursor=0
  await Promise.all(Array.from({length:Math.min(3,tasks.length)},async()=>{
    while(cursor<tasks.length&&!signal?.aborted){const record=tasks[cursor++];try{ready.set(record.id,await read(record))}catch{/* 候选仍保留，选用时明确显示获取错误，不让单源故障取消全部结果。 */}}
  }))
  if(signal?.aborted)throw new DOMException('请求已取消','AbortError')
  return {records:rankLyricResults(records.map(row=>ready.get(row.id)||row)),errors}
}
