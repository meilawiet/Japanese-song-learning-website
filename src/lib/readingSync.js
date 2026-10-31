import {annotationMatchesLine,refreshManualReadingSnapshots} from './learningIdentity.js'
import {lyricSurface,prepareLyricReadings} from './lyricReadings.js'
import {annotationForLanguage,songLanguage} from './songLanguage.js'

// 只传播明确的人工字段，按完整词面匹配；不按汉字子串、词典形或近似拼写猜测。
export function readingSyncRules(annotation,readings,manualIndices=[]){
  const rules=new Map()
  for(const token of annotation.tokens||[]){
    if(token.is_symbol||!manualIndices.includes(token.index))continue
    const surface=lyricSurface(token),reading=readings[token.index],mode=token.manual_reading_mode||'romaji'
    if(!surface?.trim()||typeof reading!=='string')continue
    const old=rules.get(surface)
    if(old&&(old.reading!==reading||old.mode!==mode))throw new Error(`本句「${surface}」有不同的人工注音，无法统一同步；请先仅保存本句。`)
    rules.set(surface,{reading,mode})
  }
  if(!rules.size)throw new Error('请先修改词的注音，或打开已有人工注音的句子，再同步整首歌。')
  return rules
}

// 使用既有corrections和保护快照，重载/备份及缓存缺失后仍能恢复，不另建同步协议。
export function applySongReadingSync(state,song,rules){
  const language=songLanguage(song),corrections={...state.progress.corrections},changedLines=[]
  let syncedTokens=0
  const annotations=song.lines.map(line=>{
    const cached=state.annotations[song.id]?.find(item=>annotationMatchesLine(item,line))
    if(!cached)throw new Error('整首歌的注音尚未准备好，请稍后重试同步。')
    const prepared=language==='ja'?prepareLyricReadings(cached.tokens,line.romaji,corrections,song.id,line.id).tokens:annotationForLanguage(line,language,cached,corrections,song.id).tokens
    let changed=false
    const tokens=prepared.map(token=>{
      const rule=!token.is_symbol&&rules.get(lyricSurface(token));if(!rule)return token
      // 括号注音的旧索引属于同一词，统一后不让旧值在取消新校正时复活。
      for(const index of token.legacy_reading_indices||[])delete corrections[`${song.id}:${line.id}:${index}`]
      corrections[`${song.id}:${line.id}:${token.index}`]=rule.reading
      const copy={...token,manual_reading_mode:rule.mode};delete copy.manual_group_reading
      changed=true;syncedTokens++;return copy
    })
    if(!changed)return cached
    changedLines.push(line.id);return {...cached,tokens}
  })
  const next={...state,annotations:{...state.annotations,[song.id]:annotations},progress:{...state.progress,corrections}}
  return {state:refreshManualReadingSnapshots(next,song.id,changedLines),syncedTokens,changedLines}
}
