// 只解析惰性 HTML，不执行页面脚本，也不把远端 HTML 注入应用界面。
const page = html => {if(typeof html!=='string'||html.length>2*1024*1024)throw new Error('UtaTen 页面无效或过大。');return new DOMParser().parseFromString(html,'text/html')}
const normalized=text=>String(text||'').normalize('NFKC').replace(/\s+/g,'')
export function parseUtatenSearch(html){
  const document=page(html),seen=new Set(),results=[]
  // 原来仅识别电脑 table；Android 会重定向到手机 article.list__item 布局。
  for(const row of document.querySelectorAll('.searchResult tr,.list__item')){
    const link=row.querySelector('td:first-child a[href],.list__title a[href]'),match=link?.getAttribute('href')?.match(/^\/lyric\/([a-z0-9]+)\/$/i)
    if(!match||seen.has(match[1]))continue
    seen.add(match[1]);const title=link.textContent.trim(),artist=row.querySelector('.searchResult__artist a,.list__name__artist a')?.textContent.trim()||'未知歌手'
    results.push({id:`utaten:${match[1]}`,platformId:match[1],provider:'utaten',title,artist,album:'',duration:0,annotationHint:true})
  }
  return results.slice(0,20)
}
function track(root,kind){
  const lines=[],segments=[]
  const finish=()=>{if(segments.some(s=>s.surface.trim()))lines.push({text:segments.map(s=>s.surface).join('').trim(),segments:[...segments]});segments.length=0}
  function walk(node){
    if(node.nodeType===3){const surface=node.textContent.replace(/[\r\n\t]+[ ]*/g,'');if(surface)segments.push({surface});return}
    if(node.nodeType!==1||node.matches('script,style,rt,rp,.rt'))return
    if(node.matches('br')){finish();return}
    if(node.matches('ruby,.ruby')){
      const base=node.querySelector('rb,.rb'),reading=node.querySelector('rt,.rt')?.textContent.trim()
      const surface=base?base.textContent.trim():[...node.childNodes].filter(n=>n.nodeType===3||n.nodeType===1&&!n.matches('rt,rp,.rt')).map(n=>n.textContent).join('').trim()
      if(surface)segments.push({surface,...(reading?{[kind]:reading}:{})});return
    }
    node.childNodes.forEach(walk)
  }
  walk(root);finish();return lines
}
// 仅 UtaTen 使用站点日文短语间的空格拆句；不切英文词间空格，不切 ruby 内部，也不推测时间戳。
export function splitUtatenPhrases(row){
  const full=row.segments.map(segment=>segment.surface).join(''),ranges=[];let offset=0
  for(const segment of row.segments){ranges.push({segment,start:offset,end:offset+segment.surface.length});offset+=segment.surface.length}
  const cuts=[...full.matchAll(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー])[ \u3000]+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー])/gu)]
    .filter(match=>!ranges.some(range=>(range.segment.kana||range.segment.romaji)&&range.start<match.index&&range.end>match.index))
  if(!cuts.length)return [row]
  const parts=[];let start=0
  for(const cut of [...cuts,{index:full.length,0:''}]){
    const end=cut.index,segments=ranges.filter(range=>range.end>start&&range.start<end).map(range=>({...range.segment,surface:full.slice(Math.max(start,range.start),Math.min(end,range.end))}))
    if(segments.length)parts.push({text:segments.map(segment=>segment.surface).join('').trim(),segments})
    start=end+cut[0].length
  }
  return parts.filter(part=>part.text)
}
export function parseUtatenLyrics(html,record){
  const document=page(html),body=document.querySelector('.lyricBody'),kana=body?.querySelector('.hiragana'),roman=body?.querySelector('.romaji')
  if(!kana)throw new Error('UtaTen 没有返回可读取的注音歌词，请检查所选版本。')
  // 原来一条网站行就是一句；两轨按相同的站点短语边界拆分，再以原文匹配注音。
  // const lines=track(kana,'kana'),romaji=roman?track(roman,'romaji'):[],byText=new Map()
  const lines=track(kana,'kana').flatMap(splitUtatenPhrases),romaji=roman?track(roman,'romaji').flatMap(splitUtatenPhrases):[],byText=new Map()
  for(const row of romaji){const key=normalized(row.text);if(!byText.has(key))byText.set(key,[]);byText.get(key).push(row)}
  let annotated=0,romanized=0,unmatched=0
  lines.forEach((row,id)=>{
    row.id=id;row.start=null;row.translation=''
    if(row.segments.some(s=>s.kana&&/[\p{Script=Han}]/u.test(s.surface)))annotated++
    const romanRow=byText.get(normalized(row.text))?.shift()
    row.romaji=romanRow?romanRow.segments.map(s=>s.romaji||s.surface).join('').trim():''
    if(row.romaji)romanized++;else if(romaji.length)unmatched++
  })
  if(!lines.length)throw new Error('UtaTen 歌词正文为空。')
  const structured={format:'uta-annotated-lyrics',version:1,source:'UtaTen',url:`https://utaten.com/lyric/${record.platformId}/`,title:record.title,artist:record.artist,timed:false,lines}
  return {...record,lyrics:JSON.stringify(structured),structured:true,hasAnnotation:annotated>0||romanized>0,trackSummary:{original:lines.length,kana:annotated,romaji:romanized,translation:0,unmatched},timed:false}
}
