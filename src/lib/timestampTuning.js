// 时间轴使用毫秒整数运算，连续点按0.2秒不会积累浮点误差；不重新排序或重编号。
export const TIMESTAMP_STEP_MS = 200
export const timestampSignature = lines => JSON.stringify(lines.map(({id,text,start})=>[id,text,start]))
// 第一次成功调整时记录原时间，之后重启/重新进入也使用同一原点；旧歌词缺字段时沿用当前时间。
export const originalTimestamp = line => Number.isFinite(line?.timestampOriginalStart) && line.timestampOriginalStart>=0 ? line.timestampOriginalStart : line?.start
// 选段以歌词顺序为准，不使用行ID大小；反向双击也得到同一连续范围。
export function timestampRange(lines,session){
  if(!session?.rangeIds)return null
  const positions=session.rangeIds.map(id=>lines.findIndex(line=>line.id===id))
  if(positions.some(index=>index<0))return null
  const startIndex=Math.min(...positions),endIndex=Math.max(...positions)
  return {startIndex,endIndex,startId:lines[startIndex].id,endId:lines[endIndex].id}
}
export function doubleTapTimestampLine(lines,session,id){
  if(!session||!lines.some(line=>line.id===id))return session
  const range=timestampRange(lines,session),index=lines.findIndex(line=>line.id===id)
  // 已选范围内再次双击取消该范围；范围外双击开始新的起点。
  if(range)return {...session,selectedId:id,anchorId:index>=range.startIndex&&index<=range.endIndex?null:id,rangeIds:null}
  if(session.anchorId==null)return {...session,selectedId:id,anchorId:id,rangeIds:null}
  if(session.anchorId===id)return {...session,selectedId:id,anchorId:null,rangeIds:null}
  const next={...session,rangeIds:[session.anchorId,id],anchorId:null},selected=timestampRange(lines,next)
  return selected?{...next,selectedId:selected.startId}:{...session,selectedId:id,anchorId:id,rangeIds:null}
}
// 整段先算出最终时间，再校验和原子保存，不能逐句修改导致内部相邻句误挡或部分成功。
export function shiftTimestampRange(lines,startId,endId,deltaMs,duration=Infinity){
  const range=timestampRange(lines,{rangeIds:[startId,endId]})
  if(!range)throw new Error('找不到所选歌词，请重新选择。')
  if(![TIMESTAMP_STEP_MS,-TIMESTAMP_STEP_MS].includes(deltaMs))throw new Error('每次仅支持调整0.2秒。')
  if(lines.slice(range.startIndex,range.endIndex+1).some(line=>!Number.isFinite(line.start)))throw new Error('选段中有歌词没有时间戳，请先补全后再调整。')
  const draft=lines.map((line,index)=>index>=range.startIndex&&index<=range.endIndex?{...line,start:(Math.round(line.start*1000)+deltaMs)/1000}:line)
  const first=draft[range.startIndex],last=draft[range.endIndex],before=lines.slice(0,range.startIndex).reverse().find(line=>Number.isFinite(line.start)),after=lines.slice(range.endIndex+1).find(line=>Number.isFinite(line.start))
  if(first.start<0)throw new Error('时间戳不能早于0秒。')
  if(before&&first.start<=before.start)throw new Error('不能早于或等于上一句的时间。')
  if(after&&last.start>=after.start)throw new Error('不能晚于或等于下一句的时间。')
  if(Number.isFinite(duration)&&draft.slice(range.startIndex,range.endIndex+1).some(line=>line.start>=duration))throw new Error('时间戳不能超出音频时长。')
  return mergeTimestampChanges(lines,lines,draft)
}
export function resetTimestampRange(lines,startId,endId,duration=Infinity){
  const range=timestampRange(lines,{rangeIds:[startId,endId]})
  if(!range)throw new Error('找不到所选歌词，请重新选择。')
  const draft=lines.map((line,index)=>{
    if(index<range.startIndex||index>range.endIndex)return line
    const start=originalTimestamp(line)
    if(!Number.isFinite(start))throw new Error('选段中有歌词没有可重置的时间戳。')
    if(Number.isFinite(duration)&&start>=duration)throw new Error('原始时间戳超出音频时长，无法重置。')
    return {...line,start}
  })
  return mergeTimestampChanges(lines,lines,draft)
}
export function shiftLineTimestamp(lines, id, deltaMs, duration = Infinity) {
  if (![TIMESTAMP_STEP_MS,-TIMESTAMP_STEP_MS].includes(deltaMs)) throw new Error('每次仅支持调整0.2秒。')
  const index=lines.findIndex(line=>line.id===id),line=lines[index]
  if (!line || !Number.isFinite(line.start)) throw new Error('这一句没有时间戳，请先在歌曲编辑中填写。')
  const start=(Math.round(line.start*1000)+deltaMs)/1000
  const before=lines.slice(0,index).reverse().find(item=>Number.isFinite(item.start))
  const after=lines.slice(index+1).find(item=>Number.isFinite(item.start))
  if (start<0) throw new Error('时间戳不能早于0秒。')
  if (before && start<=before.start) throw new Error('不能早于或等于上一句的时间。')
  if (after && start>=after.start) throw new Error('不能晚于或等于下一句的时间。')
  if (Number.isFinite(duration) && start>=duration) throw new Error('时间戳不能超出音频时长。')
  return lines.map((item,i)=>i===index?{...item,start}:item)
}

export function resetLineTimestamp(lines,id,duration=Infinity) {
  const line=lines.find(item=>item.id===id),start=originalTimestamp(line)
  if (!line || !Number.isFinite(start)) throw new Error('这一句没有可重置的时间戳。')
  if (Number.isFinite(duration) && start>=duration) throw new Error('原始时间戳超出音频时长，无法重置。')
  const draft=lines.map(item=>item.id===id?{...item,start}:item)
  // 重置仍不能越过其他已调整的句子，但允许还原原文件中原本相同的时间。
  return mergeTimestampChanges(lines,lines,draft)
}

// 保存时只替换时间，不带走录音、来源注音、译文、读音校正和学习记录。
// 核对原文与时间，阻止编辑期间同步/其他入口改歌后覆盖较新的数据。
export function mergeTimestampChanges(stored, before, draft) {
  if (before.length!==draft.length || before.some((line,i)=>line.id!==draft[i]?.id || line.text!==draft[i]?.text)) throw new Error('歌词内容已变化，请退出后重新调整。')
  // 保存入口再次检查变化值，不能仅依赖按钮点击时的检查；未修改的空时间仍保留。
  for (const [index,line] of draft.entries()) {
    if (line.start===before[index].start) continue
    if (!Number.isFinite(line.start) || line.start<0) throw new Error('修改后的时间戳无效。')
    const previous=draft.slice(0,index).reverse().find(item=>Number.isFinite(item.start))
    const next=draft.slice(index+1).find(item=>Number.isFinite(item.start))
    if (previous && line.start<previous.start || next && line.start>next.start) throw new Error('修改后的时间戳不能越过相邻句子。')
  }
  for (const line of before) {
    const current=stored.find(item=>item.id===line.id)
    if (!current || timestampSignature([current])!==timestampSignature([line])) throw new Error('歌词或时间轴已变化，请退出后重新调整。')
  }
  return stored.map(line=>{
    const next=draft.find(item=>item.id===line.id)
    // 原合并仅写start；第一次调整同时保存原点，后续加减和重置均不覆盖它。
    // return next && next.start!==line.start ? {...line,start:next.start} : line
    return next && next.start!==line.start ? {...line,start:next.start,timestampOriginalStart:originalTimestamp(line)} : line
  })
}

// 项目歌曲无法改写原始文件，时间覆盖按原文和原时间绑定，随歌曲设置备份。
export function validTimeOverrides(value) {
  return value && typeof value==='object' && !Array.isArray(value) && Object.entries(value).every(([id,item])=>
    /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && item && typeof item==='object' && !Array.isArray(item)
    && typeof item.text==='string' && item.text.length<=1000 && Number.isFinite(item.baseStart) && item.baseStart>=0 && Number.isFinite(item.start) && item.start>=0)
}
export function applySavedTimings(song, settings) {
  const overrides=settings?.timeOverrides
  if (!validTimeOverrides(overrides)) return song
  const lines=song.lines.map(line=>{
    const entry=overrides[line.id]
    // 原仅覆盖start；项目歌曲原点来自原始文件的baseStart。
    // return entry && entry.text===line.text && entry.baseStart===line.start ? {...line,start:entry.start} : line
    return entry && entry.text===line.text && entry.baseStart===line.start ? {...line,start:entry.start,timestampOriginalStart:entry.baseStart} : line
  })
  return {...song,lines}
}
export function makeTimeOverrides(original, draft) {
  const result={}
  for (const line of draft) {
    const base=original.find(item=>item.id===line.id && item.text===line.text)
    if (base && Number.isFinite(base.start) && base.start!==line.start) result[line.id]={text:line.text,baseStart:base.start,start:line.start}
  }
  return result
}
