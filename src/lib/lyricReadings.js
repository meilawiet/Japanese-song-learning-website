import { toHiragana, toRomaji } from 'wanakana'
import { correctionKey, hasKanji } from './ruby.js'

const inlinePattern = () => /([\u3400-\u9fff々]+)[（(]([\u3041-\u3096\u30a1-\u30faー\s]+)[）)]/gu
export const lyricSurface = token => token.display_surface ?? token.surface
export const plainLyric = text => String(text || '').replace(inlinePattern(), '$1')
// 拉丁文字歌词默认按原文显示，不能把英语当作日语罗马音输入转换。
// 允许重音字母、数字、标点与符号；混合日语句子仍按逐词规则处理。
export const isLatinLyric = text => /\p{Script=Latin}/u.test(String(text || ''))
  && /^[\p{Script=Latin}\p{M}\d\s\p{P}\p{S}]+$/u.test(String(text || ''))
const phonetic = value => {
  let result = ''
  for (const char of toHiragana(String(value || '').normalize('NFKC'), { passRomaji: true, convertLongVowelMark:false }).toLowerCase()) {
    if (char === 'ー') result += ({a:'あ',i:'い',u:'う',e:'え',o:'お'})[toRomaji(result.at(-1) || '').at(-1)] || char
    // 原来逐字比较づ/ず、ぢ/じ，罗马音zu/ji可能让整句匹配失败。
    // 匹配统一同音字，显示时恢复原文送假名写法。
    else if (/[\u3041-\u3096a-z0-9]/u.test(char)) result += ({づ:'ず',ぢ:'じ'})[char] || char
  }
  return result
}

// 拉丁文字原文作为锚点保留，避免 news 被转换成“ねws”。独立 n 保留音节边界。
export function sourceRomajiKana(romaji, text = '') {
  // 排版撇号与普通撇号同样表示拨音边界，不让 n’ai 被解释为残留英文字母。
  let source = String(romaji || '').trim().normalize('NFKC').toLowerCase().replace(/[’‘ʼ]/g,"'")
  const protectedWords = []
  for (const word of [...new Set(String(text).match(/[a-zA-Z]+/g) || [])].sort((a,b)=>b.length-a.length)) {
    source = source.replace(new RegExp(`\\b${word}\\b`, 'gi'), match => {const id=protectedWords.push(match)-1;return `\uE000${id}\uE001`})
  }
  // 原 /\bn\b/ 会为已有 n' 再加撇号；只补独立、尚未标记的 n。
  source = source.replace(/\bn\b(?!')/g, "n'").replace(/[āīūēō]/g, char=>({ā:'aa',ī:'ii',ū:'uu',ē:'ee',ō:'ou'})[char]).replace(/\s+/g,'')
  // 保护标记会影响转换器后续字符，按标记切段转换再还原英语。
  source = source.split(/(\uE000\d+\uE001)/g).map(part=>/^\uE000\d+\uE001$/u.test(part)?protectedWords[Number(part.slice(1,-1))]:toHiragana(part)).join('')
  return phonetic(source)
}

// 合并汉字及括号读音，surface 保留原文用于旧缓存、学习进度和备份匹配。
// 合并后沿用第一个旧索引，其余词索引不重排，旧人工校正仍可使用。
function inlineTokens(input) {
  const raw = input.map(token=>token.surface).join('')
  const matches = [...raw.matchAll(inlinePattern())]
  const offsets=[];let cursor=0
  for(const token of input){offsets.push({token,start:cursor,end:cursor+token.surface.length});cursor+=token.surface.length}
  const result=[];let i=0
  while(i<offsets.length){
    const item=offsets[i], match=matches.find(m=>m.index>=item.start&&m.index<item.end || m.index===item.start)
    if(!match){result.push({...item.token});i++;continue}
    let end=i
    while(end+1<offsets.length&&offsets[end].end<match.index+match[0].length)end++
    const surface=raw.slice(item.start,offsets[end].end),visible=plainLyric(surface)
    const prefix=raw.slice(item.start,match.index),suffix=raw.slice(match.index+match[0].length,offsets[end].end)
    // 只有假名括号视为注音，歌词中的其他括号说明继续保留。
    const reading=phonetic(prefix+match[2]+suffix)
    result.push({...item.token,surface,display_surface:visible,source_reading:reading,reading_source:'inline',is_symbol:false,legacy_reading_indices:item.token.legacy_reading_indices || offsets.slice(i,end+1).filter(part=>!part.token.is_symbol).map(part=>part.token.index)})
    i=end+1
  }
  return result
}

export function tokenReading(token, corrections = {}, songId, lineId) {
  const manual=corrections[correctionKey(songId,lineId,token.index)]
  // 整组包含旧版逐词校正时，先使用合成后的人工结果，不截掉组内其他词。
  // 原回退：return token.manual_group_reading ?? manual ?? token.source_reading ?? token.reading ?? ''
  // 包括旧缓存中的错误假名：未人工指定时，英语词使用原文而非词典或转换结果。
  // 原统一读音回退：来源 wa/e/o 直接变成 わ/え/お，未区分助词写法与唱法。
  // return token.manual_group_reading ?? manual ?? (isLatinLyric(lyricSurface(token)) ? lyricSurface(token) : token.source_reading ?? token.reading ?? '')
  if(token.manual_group_reading!=null || manual!=null)return token.manual_group_reading ?? manual
  const surface=lyricSurface(token),reading=isLatinLyric(surface)?surface:token.source_reading ?? token.reading ?? ''
  // 仅针对分词器明确识别的助词；わたし等普通词与人工校正不受影响。
  if(token.part_of_speech?.split('・')[0]==='助詞'
    && ({は:['は','わ'],へ:['へ','え'],を:['を','お']})[surface]?.includes(reading))return surface
  return reading
}

// 仅使用全句消费、假名锚点和送假名约束。存在多个可行位置时拒绝猜测。
function align(units, source) {
  const memo=new Map()
  function walk(index,start){
    const key=`${index}:${start}`
    if(memo.has(key))return memo.get(key)
    // 原终点返回：[[]]；现在携带助词变体次数，优先选择吻合原文字形的完整匹配。
    if(index===units.length)return start===source.length?[{spans:[],cost:0}]:[]
    const unit=units[index];let solutions=[],bestCost=Infinity
    const candidates=[]
    // 原来所有助词候选等价，を→お可能错误吞入下一词的开头，制造虚假的歧义。
    // 保留发音变体支持，但只有无法以更少变体完成全句时才使用。
    if(unit.fixed)for(const [cost,reading] of unit.fixed.entries()){if(source.startsWith(reading,start))candidates.push({end:start+reading.length,cost})}
    else for(let end=start+1;end<=source.length;end++){
      const reading=source.slice(start,end)
      if(!/^[\u3041-\u3096]+$/u.test(reading))break
      // 原候选仅保存 end；汉字来源音节不引入词典读音权重。
      if(reading.startsWith(unit.prefix)&&reading.endsWith(unit.suffix))candidates.push({end,cost:0})
    }
    // 原来发现两种切分立即拒绝；现在只拒绝同一最优优先级下的真实歧义。
    // for(const end of [...new Set(candidates)])for(const tail of walk(index+1,end)){
    //   solutions.push([{start,end},...tail]);if(solutions.length>1){memo.set(key,solutions);return solutions}
    for(const {end,cost} of candidates)for(const tail of walk(index+1,end)){
      const total=cost+tail.cost
      if(total<bestCost){bestCost=total;solutions=[]}
      if(total===bestCost&&solutions.length<2)solutions.push({spans:[{start,end},...tail.spans],cost:total})
    }
    memo.set(key,solutions);return solutions
  }
  const solutions=walk(0,0)
  // 原返回 solutions[0]；去除仅用于匹配排序的内部权重。
  return solutions.length===1?solutions[0].spans:null
}

function prepare(input, importedRomaji = '', corrections = {}, songId, lineId) {
  if(!input?.length)return {tokens:input,sourceKana:sourceRomajiKana(importedRomaji),aligned:false,hasSource:Boolean(String(importedRomaji||'').trim())}
  // 上次编辑保存的派生来源随当前歌词重新计算，不把旧罗马音绑定永久缓存。
  // 源发音与假名字形属于派生信息，每次同来源读音一并更新。
  const original=input.map(token=>{const copy={...token};delete copy.display_surface;delete copy.source_reading;delete copy.source_pronunciation;delete copy.reading_source;delete copy.manual_group_reading;return copy})
  const tokens=inlineTokens(original), raw=tokens.map(token=>token.surface).join('')
  // 兼容用户以前对括号内那个“词”做过的校正，合并后仍保留其人工读音。
  for(const token of tokens)if(token.legacy_reading_indices&&corrections[correctionKey(songId,lineId,token.index)]==null){
    const legacy=token.legacy_reading_indices.slice(1).map(index=>corrections[correctionKey(songId,lineId,index)]).find(value=>value!=null)
    if(legacy!=null)token.manual_group_reading=legacy
  }
  const sourceKana=sourceRomajiKana(importedRomaji,plainLyric(raw)),hasSource=Boolean(String(importedRomaji||'').trim())
  if(!hasSource)return {tokens,sourceKana:'',aligned:true,hasSource:false}
  const units=[]
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i],surface=lyricSurface(token)
    // 有整句罗马音时以其唱法为准，括号假名只负责移除附注，不锁定旧读法。
    if(token.source_reading!=null&&!hasKanji(surface)){units.push({members:[token],fixed:[phonetic(token.source_reading)]});continue}
    if(!hasKanji(surface)){
      const fixed=phonetic(surface),variants=[fixed]
      if(token.part_of_speech?.startsWith('助詞')&&({は:'わ',へ:'え',を:'お'})[fixed])variants.push(({は:'わ',へ:'え',を:'お'})[fixed])
      units.push({members:[token],fixed:variants});continue
    }
    const members=[token]
    // 连续汉字无法可靠按词拆分时整组注音，不用错误词典读音决定分配边界。
    while(i+1<tokens.length){
      let next=i+1;while(next<tokens.length&&tokens[next].is_symbol)next++
      if(next>=tokens.length||!hasKanji(lyricSurface(tokens[next]))||tokens[next].source_reading!=null)break
      if(/[\u3040-\u30ff]$/u.test(lyricSurface(members.at(-1))))break
      members.push(...tokens.slice(i+1,next+1));i=next
    }
    const visible=members.map(lyricSurface).join('')
    units.push({members,prefix:phonetic(visible.match(/^[\u3040-\u30ff]+/u)?.[0]||''),suffix:phonetic(visible.match(/[\u3040-\u30ff]+$/u)?.[0]||'')})
  }
  const spans=sourceKana?align(units,sourceKana):null
  if(!spans){
    // 无法确定词级对应时保留整句自带注音，未匹配汉字不显示可能错误的词典 ruby。
    return {tokens:tokens.map(token=>hasKanji(lyricSurface(token))?{...token,source_reading:'',reading_source:'unmatched'}:token),sourceKana,aligned:false,hasSource:true}
  }
  const resolved=units.map((unit,index)=>{
    const members=unit.members,first=members[0],surface=members.map(token=>token.surface).join(''),visible=members.map(lyricSurface).join('')
    let sourceReading=sourceKana.slice(spans[index].start,spans[index].end)
    const sourcePronunciation=sourceReading
    // 来源chikazuku匹配成功后仍显示ちかづく，不把原文送假名改成ずく。
    const writtenPrefix=visible.match(/^[\u3041-\u3096\u30a1-\u30faー]+/u)?.[0] || ''
    const writtenSuffix=visible.match(/[\u3041-\u3096\u30a1-\u30faー]+$/u)?.[0] || ''
    if(writtenPrefix&&sourceReading.startsWith(phonetic(writtenPrefix)))sourceReading=toHiragana(writtenPrefix,{passRomaji:true})+sourceReading.slice(phonetic(writtenPrefix).length)
    if(writtenSuffix&&sourceReading.endsWith(phonetic(writtenSuffix)))sourceReading=sourceReading.slice(0,-phonetic(writtenSuffix).length)+toHiragana(writtenSuffix,{passRomaji:true})
    const merged={...first,surface,display_surface:visible,source_reading:sourceReading,source_pronunciation:sourcePronunciation,reading_source:'romaji'}
    if(members.length>1){
      merged.reading=members.filter(token=>!token.is_symbol).map(token=>token.reading||'').join('')
      merged.is_symbol=false
      if(members.some(token=>corrections[correctionKey(songId,lineId,token.index)]!=null)){
        const words=members.filter(token=>!token.is_symbol)
        // 旧人工校正的词边界可由吻合来源的原读音确定；只作锚点，不代替来源唱法。
        const detail=words.map(token=>{const old=phonetic(token.reading);return old&&sourceReading.includes(old)?{fixed:[old]}:{prefix:'',suffix:''}})
        const detailSpans=align(detail,sourceReading)
        merged.manual_group_reading=words.map((token,position)=>corrections[correctionKey(songId,lineId,token.index)] ?? (detailSpans?sourceReading.slice(detailSpans[position].start,detailSpans[position].end):tokenReading(token,corrections,songId,lineId))).join('')
      }
    }
    return merged
  })
  return {tokens:resolved,sourceKana,aligned:true,hasSource:true}
}

// 播放时频繁刷新页面，同一句与相同校正复用对齐结果，减少手机计算量。
const cache = new WeakMap()
export function prepareLyricReadings(input, importedRomaji = '', corrections = {}, songId, lineId) {
  if(!input?.length)return prepare(input,importedRomaji,corrections,songId,lineId)
  const key=JSON.stringify([songId,lineId,importedRomaji,input.map(token=>corrections[correctionKey(songId,lineId,token.index)] ?? null)])
  let records=cache.get(input)
  if(!records){records=new Map();cache.set(input,records)}
  if(records.has(key))return records.get(key)
  const result=prepare(input,importedRomaji,corrections,songId,lineId)
  if(records.size>=4)records.clear()
  records.set(key,result)
  return result
}
