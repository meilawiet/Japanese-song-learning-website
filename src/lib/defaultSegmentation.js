// 仅用于新生成的自动分词；不重排已有缓存或用户手动设置的词界和校正索引。
export function splitKanjiOkuriganaTokens(tokens) {
  return tokens.flatMap(token => {
    // 最初只分“汉字+后接假名”；扩展到“思い出す”等交替结构，以原有读音中的假名作锚点。
    // const match=token.surface.match(/^([\p{Script=Han}々]+)([\p{Script=Hiragana}ー]+)$/u)
    const parts=token.surface.match(/[\p{Script=Han}々]+|[\p{Script=Hiragana}ー]+/gu)||[]
    if(token.segmentation_locked||parts.length<2||parts.join('')!==token.surface||!/[\p{Script=Han}々]/u.test(token.surface)||!token.reading||token.reading.length>100||!/^[\p{Script=Hiragana}ー]+$/u.test(token.reading))return [token]
    const memo=new Map(),reading=token.reading
    const walk=(index,start)=>{
      const key=`${index}:${start}`;if(memo.has(key))return memo.get(key)
      if(index===parts.length)return start===reading.length?[[]]:[]
      const part=parts[index],han=/^[\p{Script=Han}々]+$/u.test(part),results=[]
      const ends=han?Array.from({length:reading.length-start},(_,i)=>start+i+1):reading.startsWith(part,start)?[start+part.length]:[]
      for(const end of ends){for(const tail of walk(index+1,end)){results.push([reading.slice(start,end),...tail]);if(results.length>=2)break}if(results.length>=2)break}
      memo.set(key,results);return results
    }
    const matches=walk(0,0)
    // 仅在唯一对应时拆开，存在多种读音分配时保留整体，让用户或 AI 再决定。
    if(matches.length!==1)return [token]
    return parts.map((surface,index)=>{const han=/^[\p{Script=Han}々]+$/u.test(surface);return {...token,surface,reading:matches[0][index],base:surface,ruby:han?matches[0][index]:'',suffix:'',needs_review:han?token.needs_review:false}})
  }).map((token,index)=>({...token,index}))
}
