import {toHiragana} from 'wanakana'

// 在来源读音/人工校正已经确定之后，仅生成显示片段；不修改原分词、读音或校正索引。
// 原签名：kanjiReadingParts(surface, reading='')；可选词界只作显示依据，不写回分词缓存。
export function kanjiReadingParts(surface, reading='', readingTokens=null) {
  // 只采用完整词面与当前读音都一致的证据；人工改音、主动留空或旧来源不能套用旧词界。
  if(reading&&Array.isArray(readingTokens)&&readingTokens.length>1
    &&readingTokens.every(token=>typeof token?.surface==='string'&&typeof token?.reading==='string')
    &&readingTokens.map(token=>token.surface).join('')===surface
    &&toHiragana(readingTokens.map(token=>token.reading).join(''),{passRomaji:true})===toHiragana(reading,{passRomaji:true})){
    return readingTokens.flatMap(token=>kanjiReadingParts(token.surface,token.reading))
  }
  const parts=String(surface).match(/[\p{Script=Han}々]+|[^\p{Script=Han}々]+/gu)||[]
  const han=part=>/^[\p{Script=Han}々]+$/u.test(part)
  const fallback=()=>parts.map(surface=>({surface,kana:han(surface)&&parts.length===1?reading:''}))
  if(!reading||parts.length===1||!parts.some(han)||/[a-zA-Z]/.test(surface))return fallback()
  const kana=toHiragana(reading,{passRomaji:true}),fixed=parts.map(part=>toHiragana(part,{passRomaji:true}).replace(/[^\p{Script=Hiragana}ー]/gu,'')),memo=new Map()
  if(kana.length>100||!/^[\p{Script=Hiragana}ー]+$/u.test(kana))return fallback()
  const walk=(index,start)=>{
    const key=`${index}:${start}`;if(memo.has(key))return memo.get(key)
    if(index===parts.length)return start===kana.length?[[]]:[]
    const ends=han(parts[index])?Array.from({length:kana.length-start},(_,i)=>start+i+1):kana.startsWith(fixed[index],start)?[start+fixed[index].length]:[],found=[]
    for(const end of ends){for(const tail of walk(index+1,end)){found.push([kana.slice(start,end),...tail]);if(found.length>=2)break}if(found.length>=2)break}
    memo.set(key,found);return found
  }
  const matches=walk(0,0)
  // 特殊唱法若无法唯一映射，保留完整读音供校对，不将整词读音错误压到某个汉字上。
  return matches.length===1?parts.map((surface,index)=>({surface,kana:han(surface)?matches[0][index]:''})):fallback()
}
