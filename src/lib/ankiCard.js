import {toHiragana} from 'wanakana'
import {reviewPlaybackBounds} from './reviewBook.js'
import {visibleSentenceEntry} from './sentenceAnalysis.js'

export const ANKI_AUDIO_SLOT = 'UTA_PENDING_SOUND_6B81B89E'
export const ANKI_COVER_SLOT = 'UTA_PENDING_COVER_6B81B89E'
const soundTag = /^\[sound:[A-Za-z0-9_.-]+\]$/
const coverFile = /^[A-Za-z0-9_.-]+\.(?:jpg|jpeg)$/i
const coverData = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/i
const escape = value => String(value ?? '').replace(/[&<>"'[\]]/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','[':'&#91;',']':'&#93;',
})[char])
const text = value => typeof value === 'string' ? value.trim() : ''

// 只收录绑定到当前原文且确实有释义的 AI 词条。
export function isAnkiVocabulary(line,word) {
  const surface=text(word?.surface)
  return Boolean(surface&&text(word?.meaning)&&typeof line?.text==='string'&&line.text.includes(surface))
}

export function collectAnkiEntries(lines,cache) {
  const candidates=new Map()
  for(const line of lines){
    const entry=cache[line.id]
    if(!visibleSentenceEntry(entry,line))continue
    const {vocabulary,grammar}=entry.explanation
    for(const word of Array.isArray(vocabulary)?vocabulary:[]){
      if(isAnkiVocabulary(line,word))candidates.set(`word:${word.surface}`,{key:`word:${word.surface}`,label:word.surface,word:ankiWord(word)})
    }
    for(const point of Array.isArray(grammar)?grammar:[]){
      if(!text(point))continue
      const word=ankiGrammar(point,line.id)
      candidates.set(word.grammarId,{key:word.grammarId,label:word.meaning,word})
    }
  }
  return [...candidates.values()]
}

// 同一句的各条语法分别制卡，编辑说明不会改变该条语法的身份。
export function ankiGrammar(point,lineId) {
  const meaning=text(point)
  const surface=meaning.match(/^「([^」]{1,40})」/)?.[1]||'语法'
  return {surface,lemma:surface,meaning,grammarId:JSON.stringify(['grammar',lineId,meaning])}
}

// 用辞书原形和原形读音配对。无法确认活用词原形读音时，宁可保留独立的候选。
export function ankiWord(word) {
  const surface=text(word.surface), lemma=text(word.dictionary_form)||surface
  const normalizeKana=value=>{
    const kana=toHiragana(text(value).normalize('NFKC'),{passRomaji:true})
    return /^[\p{Script=Hiragana}ー]+$/u.test(kana)?kana:''
  }
  const reading=normalizeKana(word.dictionary_reading)||normalizeKana(lemma)||(surface===lemma?normalizeKana(word.reading):'')
  // 旧解析常在用法开头明确标注词性。仅复用这种明确标签，避免从自由说明猜测词性。
  const legacyPos=text(word.usage).match(/^(?:词性\s*[：:]\s*)?(名[词詞]|副[词詞]|助[词詞]|助[动動][词詞]|[动動][词詞]|[いな]形容[词詞])(?=$|[\s，,。；;、：:])/u)?.[1]
  const pos=text(word.part_of_speech)||legacyPos||''
  const type=word.kind==='phrase'?'词组':/な形容詞|な形容词|形容動詞|形容动词/.test(pos)?'な形容词'
    :/い形容詞|い形容词|形容詞|形容词/.test(pos)?'い形容词'
    :['助動詞','助动词','助詞','助词','動詞','动词','副詞','副词','名詞','名词'].find(value=>pos.includes(value))?.replace('詞','词').replace('動','动')||pos
  return {
    surface, lemma, reading, type, pos,
    keyReady:Boolean(reading&&type&&(text(word.dictionary_form)||['名词','副词','助词'].includes(type))),
    verbClass:text(word.verb_class), transitivity:text(word.transitivity),
    meaning:text(word.meaning), form:text(word.form), usage:text(word.usage),
  }
}

async function ankiKey(identity) {
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identity)))
  return 'uta_'+Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')
}

export function ankiWordKey(word) {
  return ankiKey([word.lemma.normalize('NFKC'),word.reading,word.type,word.reading?'':word.surface])
}

// 缺少可靠词条信息时以原语境保留临时卡，补齐讲解后可升级回正规词条键。
export const ankiContextKey = example => ankiKey(['context',example.id])

export function ankiExample(song,lines,word) {
  // 时间戳独立于例句身份，因此调整时间后仍可定位原来的例句。
  return {
    id:JSON.stringify([song.id,lines.map(line=>line.id),word.grammarId||word.surface]),
    surface:word.surface, song:song.title, lyric:lines.map(line=>line.text).join('\n'),
    form:word.form, usage:word.usage, meaning:word.meaning, audio:'',
  }
}

export function mergeAnkiExample(card,word,example) {
  const examples=card?.examples??[]
  const index=examples.findIndex(item=>item.id===example.id)
  if(index===-1)return {word:card?.word??word,examples:[...examples,example]}
  // 更新文字时保留原音频和已有讲解，除非本次提供了替换内容。
  const previous=examples[index]
  const updated={...example}
  for(const key of ['audio','form','usage','meaning'])updated[key] ||= previous[key]
  if(example.cover===undefined)updated.cover=previous.cover
  return {
    word:{...card.word,meaning:(index===0&&word.meaning)||card.word.meaning||word.meaning},
    examples:examples.map((item,position)=>position===index?updated:item),
  }
}

export function ankiCardFields(key,card,{preview=false,previewCover=''}={}) {
  // 旧卡必须按原 HTML 验证是否被手动修改，升级排版只在保存时进行。
  if(card.layout===2){
    const [front,back]=arrangeAnkiCard(card,preview,previewCover)
    return [key,front,back,encodeURIComponent(JSON.stringify(card))]
  }
  const front=card.examples.map(example=>{
    const audio=example.audio===ANKI_AUDIO_SLOT||soundTag.test(example.audio)?example.audio:''
    return `<section class="uta-example"><strong>${escape(example.surface)}</strong><div class="uta-lyric">${escape(example.lyric)}</div>${preview&&audio?'<small>附原唱片段</small>':audio}<div class="uta-meta">出自《${escape(example.song)}》</div></section>`
  }).join('')
  const {word}=card
  const type=[word.pos||word.type,word.verbClass,word.transitivity].filter(Boolean).join(' · ')
  const heading=`<h2 class="uta-head">${escape(word.lemma)}</h2>${[type,word.reading,word.meaning].filter(Boolean).map(value=>`<div>${escape(value)}</div>`).join('')}`
  const byForm=groupExamples(card.examples)
  const back=heading+[...byForm].map(([surface,examples])=>`<section class="uta-example">${word.grammarId?'':`<strong>${escape(surface)}</strong>`}${
    examples.map(example=>`<div>${escape([example.form,example.usage,example.meaning!==word.meaning?example.meaning:''].filter(Boolean).join(' · '))}</div><div class="uta-lyric">${escape(example.lyric)}</div>`).join('')
  }</section>`).join('')
  return [key,front,back,encodeURIComponent(JSON.stringify(card))]
}

// 样式随字段保存，让已有的 Anki 笔记类型也能显示新版排版。
const layoutStyle=`<style>
.uta-layout{--uta-gap:.8em;--uta-card-line:rgba(130,138,152,.28);--uta-card-panel:rgba(130,138,152,.10);max-width:34em;margin-inline:auto;text-align:start;line-height:1.55;overflow-wrap:anywhere}
.uta-layout .uta-block{padding:var(--uta-gap);margin-block:0 var(--uta-gap);border:1px solid var(--uta-card-line);border-radius:.65em}
.uta-layout .uta-term{display:block;font-size:1.65em;line-height:1.2;margin:0 0 .35em;font-weight:650}
.uta-layout .uta-text{white-space:pre-wrap;margin:.4em 0}
.uta-layout .uta-origin{display:flex;align-items:center;gap:.6em;font-size:.86em;margin-block-start:.75em}
.uta-layout .uta-cover{width:3.35em;height:3.35em;object-fit:cover;border-radius:.4em;flex:none}
.uta-layout .uta-origin-copy{min-width:0}
.uta-layout .uta-audio{margin-block-start:.25em}
.uta-layout .uta-detail{font-size:.9em}
.uta-layout .uta-meaning{font-size:1.12em;font-weight:600;margin:.4em 0}
.uta-layout .uta-quote{padding:.45em .6em;border-radius:.35em;background:var(--uta-card-panel)}
</style>`

function arrangeAnkiCard(card,preview,previewCover){
  const renderSide=content=>layoutStyle+`<div class="uta-layout">${content}</div>`
  const front=card.examples.map(example=>{
    const audio=example.audio===ANKI_AUDIO_SLOT||soundTag.test(example.audio)?example.audio:''
    const clip=audio?`<div class="uta-audio">${preview?'附原唱片段':audio}</div>`:''
    const validCover=example.cover===ANKI_COVER_SLOT||coverFile.test(example.cover)
    const image=preview?(example.cover===ANKI_COVER_SLOT&&coverData.test(previewCover)?previewCover:''):(validCover?example.cover:'')
    const thumbnail=image?`<img class="uta-cover" src="${image}" alt="" />`:''
    return `<section class="uta-block"><strong class="uta-term" lang="ja">${escape(example.surface)}</strong><div class="uta-text" lang="ja">${escape(example.lyric)}</div><div class="uta-origin">${thumbnail}<div class="uta-origin-copy">出自《${escape(example.song)}》${clip}</div></div></section>`
  }).join('')
  const {word}=card
  const details=[word.reading,word.pos||word.type,word.verbClass,word.transitivity].filter(Boolean).map(escape).join(' · ')
  const heading=`<div class="uta-block"><h2 class="uta-term" lang="ja">${escape(word.lemma)}</h2>${details?`<div class="uta-detail">${details}</div>`:''}<div class="uta-meaning">${escape(word.meaning)}</div></div>`
  const back=heading+[...groupExamples(card.examples)].map(([surface,examples])=>`<section class="uta-block">${word.grammarId?'':`<strong lang="ja">${escape(surface)}</strong>`}${
    examples.map(example=>{
      const usage=[example.form,example.usage,example.meaning!==word.meaning?example.meaning:''].filter(Boolean).join(' · ')
      return `${usage?`<div class="uta-text">${escape(usage)}</div>`:''}<div class="uta-text uta-quote" lang="ja">${escape(example.lyric)}</div>`
    }).join('')
  }</section>`).join('')
  return [renderSide(front),renderSide(back)]
}

// 复用歌曲封面处理，把外链或本地图片统一为可写入 Anki 的 JPEG。
export async function prepareAnkiCover(source){
  if(coverData.test(source)&&source.length<=500_000)return source
  const {cacheArtworkSelection,prepareUploadedArtwork}=await import('./artworkSearch.js')
  if(/^https:\/\//i.test(source)){
    const cached=await cacheArtworkSelection({artworkUrl:source})
    return cached.artworkUrl
  }
  const response=await fetch(source)
  if(!response.ok)throw new Error('无法读取歌曲封面。')
  const blob=await response.blob()
  const artwork=await prepareUploadedArtwork(new File([blob],'song-cover',{type:blob.type}))
  return artwork.artworkUrl
}

function groupExamples(examples) {
  const groups=new Map()
  for(const example of examples){
    if(!groups.has(example.surface))groups.set(example.surface,[])
    groups.get(example.surface).push(example)
  }
  return groups
}

export function readAnkiCard(note,key) {
  try{
    const fields=note.fields
    if(fields?.length!==4||fields[0]!==key)return null
    const card=JSON.parse(decodeURIComponent(fields[3]))
    if(typeof card.word?.lemma!=='string'||!Array.isArray(card.examples)||!card.examples.length)return null
    const original=ankiCardFields(key,card)
    // 外部手动修改的可见卡面不能用生成内容覆盖。
    return {...note,card,editable:original[1]===fields[1]&&original[2]===fields[2]}
  }catch{return null}
}

export function ankiAudioBounds(song,lines,duration,trim) {
  const bounds=reviewPlaybackBounds(song,lines,duration)
  // 语境卡只导出短片段。没有下一句时，播放控件使用的歌曲时长仍需通过上限检查。
  // return bounds&&bounds.end-bounds.start<=60?bounds:null
  if(!bounds||bounds.end-bounds.start>60)return null
  if(!trim)return bounds
  // 裁剪只从原范围内保留一段连续音频，试听和导出共用这份边界。
  if(!Number.isFinite(trim.start)||!Number.isFinite(trim.end)||trim.start<bounds.start||trim.end>bounds.end||trim.start>=trim.end)return null
  return trim
}

export function encodeAnkiWav(buffer,{start,end}) {
  const rate=buffer.sampleRate,first=Math.floor(start*rate),last=Math.min(buffer.length,Math.ceil(end*rate))
  const count=last-first
  if(count<=0)throw new Error('音频时间范围无效。')
  const wav=new DataView(new ArrayBuffer(44+count*2))
  const label=(offset,value)=>Array.from(value).forEach((char,index)=>wav.setUint8(offset+index,char.charCodeAt(0)))
  label(0,'RIFF');wav.setUint32(4,36+count*2,true);label(8,'WAVE');label(12,'fmt ')
  wav.setUint32(16,16,true);wav.setUint16(20,1,true);wav.setUint16(22,1,true)
  wav.setUint32(24,rate,true);wav.setUint32(28,rate*2,true);wav.setUint16(32,2,true);wav.setUint16(34,16,true)
  label(36,'data');wav.setUint32(40,count*2,true)
  const channels=Array.from({length:buffer.numberOfChannels},(_,index)=>buffer.getChannelData(index))
  for(let index=0;index<count;index++){
    const sample=channels.reduce((sum,channel)=>sum+channel[first+index],0)/channels.length
    wav.setInt16(44+index*2,Math.round(Math.max(-1,Math.min(1,sample))*32767),true)
  }
  return wav.buffer
}

export async function ankiClipBase64(source,song,lines,duration,trim) {
  // const bounds=ankiAudioBounds(song,lines,duration)
  const bounds=ankiAudioBounds(song,lines,duration,trim)
  if(!source||!bounds)throw new Error('没有可用的歌词音频范围。')
  const response=await fetch(source)
  if(!response.ok)throw new Error('无法读取歌曲音频。')
  const file=await response.blob()
  // WebView 需要解码原音频。过长音轨留给文字模式，避免整轨解码占用过多内存。
  if(file.size>40*1024*1024||duration>15*60)throw new Error('歌曲音频过大，可先保存文字。')
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext
  if(!Offline)throw new Error('当前设备无法截取音频。')
  const context=new Offline(1,1,22050)
  const decoded=await context.decodeAudioData(await file.arrayBuffer())
  const wav=new Blob([encodeAnkiWav(decoded,bounds)],{type:'audio/wav'})
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onerror=()=>reject(new Error('无法读取音频片段。'))
    reader.onload=()=>resolve(String(reader.result).split(',')[1])
    reader.readAsDataURL(wav)
  })
}
