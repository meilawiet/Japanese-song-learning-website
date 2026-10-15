import { plainLyric } from './lyricReadings.js'
import { hasKanji } from './ruby.js'

// 分词只改词边界，不改原文；按字符范围定位，避免历史建议因词索引变化而改错位置。
export function tokenRanges(tokens) {
  let offset=0
  return tokens.map(token=>{const start=offset;offset+=token.surface.length;return {token,start,end:offset}})
}

// 原签名没有 language；非日语括号属于原文，不按日语括号假名移除。
export function replaceLyricTokenRange(tokens,start,end,segments,language='ja') {
  const visibleText = language==='ja'?plainLyric:value=>value
  const ranges=tokenRanges(tokens),first=ranges.findIndex(item=>item.start===start),last=ranges.findIndex(item=>item.end===end)
  if(first<0||last<first)throw new Error('这一处的分词边界已经变化，请重新复核后再采用。')
  const raw=ranges.slice(first,last+1).map(item=>item.token.surface).join('')
  // 原比较：segments.map(item=>item.surface).join('')!==plainLyric(raw)
  if(!segments.length||segments.some(item=>!item.surface)||segments.map(item=>item.surface).join('')!==visibleText(raw))throw new Error('分词建议与原文不一致，未保存。')
  // 括号假名仍附着在原词，不丢失原歌词；可见词面与原始文本分开保存。
  let rawStart=0,prefix='',nextIndex=Math.max(-1,...tokens.map(token=>token.index))+1
  const replacements=segments.map((segment,position)=>{
    prefix+=segment.surface
    let rawEnd=position===segments.length-1?raw.length:-1
    // 原来固定 plainLyric；多语言仅按原始字符范围查找。
    if(rawEnd<0)for(let cursor=rawStart+1;cursor<=raw.length;cursor++)if(visibleText(raw.slice(0,cursor))===prefix)rawEnd=cursor
    if(rawEnd<=rawStart)throw new Error('无法对应原歌词的分词边界，未保存。')
    const surface=raw.slice(rawStart,rawEnd);rawStart=rawEnd
    return {index:position===0?ranges[first].token.index:nextIndex++,surface,reading:segment.reading ?? '',is_symbol:false,segmentation_locked:true}
  })
  return {tokens:[...tokens.slice(0,first),...replacements,...tokens.slice(last+1)],replacements,removed:ranges.slice(first,last+1).map(item=>item.token.index)}
}

// 点击词界后整句重排：保留未变化词的索引、读音及人工留空；只为新词分配索引。
// 原签名只有四项；日语分词读音分配保持不变，外语无法分配的人工内容另存待处理。
export function resegmentLyricTokens(tokens,surfaces,readings,manualIndices=new Set(),language='ja') {
  const visible=[];let offset=0
  // 原 surface=plainLyric(token.surface)，会误删非日语原文中的括号。
  for(const token of tokens){const surface=language==='ja'?plainLyric(token.surface):token.surface;visible.push({token,surface,start:offset,end:offset+surface.length});offset+=surface.length}
  if(!surfaces.length||surfaces.some(surface=>!surface)||surfaces.join('')!==visible.map(item=>item.surface).join(''))throw new Error('分词必须保留完整歌词。')
  let cursor=0
  const parts=surfaces.map(surface=>{const part={surface,start:cursor,end:cursor+surface.length,reading:'',manual:false};cursor=part.end;return part})
  for(const old of visible){
    const overlaps=parts.filter(part=>part.start<old.end&&part.end>old.start)
    const reading=readings[old.token.index] ?? old.token.reading ?? ''
    const manual=manualIndices.has(old.token.index)
    // 保留之前尚未分配的标注；拆开一个词时不猜测中文谐音、音标的分配位置。
    if(old.token.pending_readings?.length)overlaps[0].pending_readings=[...(overlaps[0].pending_readings||[]),...old.token.pending_readings]
    if(language!=='ja'&&overlaps.length>1){
      if(manual&&reading)overlaps[0].pending_readings=[...(overlaps[0].pending_readings||[]),reading]
      overlaps.forEach(part=>{part.manual ||= manual})
      continue
    }
    if(overlaps.length===1){overlaps[0].reading+=reading;overlaps[0].manual ||= manual;continue}
    // 假名前后缀能够可靠划分；多个汉字段的读音无法确定时留待校对，不猜测。
    const chunks=overlaps.map(part=>old.surface.slice(Math.max(part.start,old.start)-old.start,Math.min(part.end,old.end)-old.start))
    const values=Array(chunks.length).fill('');let remaining=reading,left=0,right=chunks.length-1
    while(left<=right&&!hasKanji(chunks[left])&&remaining.startsWith(chunks[left])){values[left]=chunks[left];remaining=remaining.slice(chunks[left].length);left++}
    while(right>=left&&!hasKanji(chunks[right])&&remaining.endsWith(chunks[right])){values[right]=chunks[right];remaining=remaining.slice(0,-chunks[right].length);right--}
    if(left===right)values[left]=remaining
    overlaps.forEach((part,index)=>{part.reading+=manual&&!reading?'':values[index];part.manual ||= manual})
  }
  // 原调用未带语种；将同一字符保留规则传入范围校验。
  const replaced=replaceLyricTokenRange(tokens,0,tokens.map(token=>token.surface).join('').length,parts,language)
  let nextIndex=Math.max(-1,...tokens.map(token=>token.index))+1
  const nextReadings={},nextManual=new Set()
  const nextTokens=replaced.replacements.map((token,index)=>{
    const part=parts[index],same=visible.find(old=>old.start===part.start&&old.end===part.end)
    const value=same?{...same.token,segmentation_locked:true}:{...token,index:nextIndex++,is_symbol:/^[\p{P}\p{S}\s]+$/u.test(part.surface)}
    value.reading=part.reading
    if(part.pending_readings?.length)value.pending_readings=part.pending_readings
    nextReadings[value.index]=part.reading;if(part.manual)nextManual.add(value.index)
    return value
  })
  return {tokens:nextTokens,readings:nextReadings,manualIndices:nextManual}
}
