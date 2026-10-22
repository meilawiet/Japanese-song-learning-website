import {validReviewItem} from './reviewBook.js'

// Persist exact text, not just line counts or positional song IDs. Never guess
// which new sentence an old token-index correction belongs to.
export function annotationMatchesLine(annotation, line) {
  return annotation?.id === line.id && Array.isArray(annotation.tokens)
    && (annotation.text == null || annotation.text === line.text)
    && annotation.tokens.map((token) => token.surface).join('') === line.text
}

export function lyricSnapshot(song) {
  return { sourceFile: song.sourceFile, lines: song.lines.map(({ id, text }) => ({ id, text })) }
}

function sameLines(left, right) {
  return Array.isArray(left) && left.length === right.length
    && right.every((line) => left.some((old) => old.id === line.id && old.text === line.text))
}

// 人工校正不是可随时重建的词典缓存：在已有歌词快照中保留其原行词界，防止升级/缓存缺失后丢失。
// 仍使用原corrections保存读音（包括空字符串），快照只提供绑定证据，不复活用户已删除的校正。
function protectManualReadings(song, raw, corrections, previousSnapshot = {}) {
  const active={...corrections},manualAnnotations={},unresolvedCorrections={...previousSnapshot.unresolvedCorrections}
  const restored=[],unbound=new Set()
  // 旧括号假名合并保留legacy索引，它同样是明确证据，不能误当作已不存在的人工读音。
  const owns=(token,index)=>token.index===index||Array.isArray(token.legacy_reading_indices)&&token.legacy_reading_indices.includes(index)
  const boundaries=annotation=>{let start=0;return annotation.tokens.map(token=>{const item={...token,start,end:start+token.surface.length};start=item.end;return item})}
  for(const line of song.lines){
    const prefix=`${song.id}:${line.id}:`,keys=Object.keys(active).filter(key=>key.startsWith(prefix))
    let cached=raw.find(annotation=>annotationMatchesLine(annotation,line))
    const backup=previousSnapshot.manualAnnotations?.[line.id]
    const priorLine=previousSnapshot.lines?.find(value=>value.id===line.id)
    // 换原文/语种后即使新缓存也恰有同号索引，仍不能把旧人工数据错绑到新词。
    if(priorLine&&priorLine.text!==line.text||backup?.language&&song.language&&backup.language!==song.language)keys.forEach(key=>unbound.add(key))
    if(keys.length&&!keys.some(key=>unbound.has(key))&&annotationMatchesLine(backup,line)){
      const old=boundaries(backup),current=cached?boundaries(cached):[]
      // 相同索引若已对应另一段字符，不把旧读音套到新词上；恢复有确切原文证据的原词界。
      if(!cached||keys.some(key=>{const index=Number(key.slice(prefix.length)),before=old.find(token=>owns(token,index)),after=current.find(token=>owns(token,index));return before&&(!after||before.start!==after.start||before.end!==after.end||before.surface!==after.surface)}))cached=backup
    }
    if(cached){restored.push(cached);if(keys.some(key=>!unbound.has(key)&&cached.tokens.some(token=>owns(token,Number(key.slice(prefix.length))))))manualAnnotations[line.id]={...cached,text:line.text,tokens:cached.tokens.map(token=>({...token}))}}
  }
  for(const key of Object.keys(active)){
    if(!key.startsWith(`${song.id}:`))continue
    const [lineId,tokenIndex]=key.slice(song.id.length+1).split(':').map(Number)
    if(!unbound.has(key)&&restored.some(annotation=>annotation.id===lineId&&annotation.tokens.some(token=>owns(token,tokenIndex))))continue
    // 缺少词界或原文已变时隔离保留，禁止原先的直接delete造成不可逆丢失，也禁止盲目重用新索引。
    const oldText=previousSnapshot.manualAnnotations?.[lineId]?.text??previousSnapshot.lines?.find(line=>line.id===lineId)?.text??null
    const evidence=previousSnapshot.manualAnnotations?.[lineId]
    const record={reading:active[key],text:oldText,...(evidence?{annotation:evidence}:{})},history=Array.isArray(unresolvedCorrections[key])?unresolvedCorrections[key]:[]
    if(!history.some(item=>item.reading===record.reading&&item.text===record.text))unresolvedCorrections[key]=[...history,record]
    delete active[key]
  }
  return {annotations:restored,corrections:active,manualAnnotations,unresolvedCorrections}
}

// 用户明确编辑或采用分词建议后，立即更新绑定快照，避免把新词界误认为自动缓存变化而还原。
export function refreshManualReadingSnapshots(state,songId,lineIds) {
  const previous=state.progress.lyricSnapshots?.[songId]
  if(!previous)return state
  const manualAnnotations={...previous.manualAnnotations}
  for(const lineId of lineIds){const prefix=`${songId}:${lineId}:`,annotation=state.annotations?.[songId]?.find(line=>line.id===lineId)
    if(annotation&&Object.keys(state.progress.corrections||{}).some(key=>key.startsWith(prefix)))manualAnnotations[lineId]={...annotation,text:annotation.text??annotation.tokens.map(token=>token.surface).join(''),tokens:annotation.tokens.map(token=>({...token}))}
    else delete manualAnnotations[lineId]
  }
  const snapshot={...previous};if(Object.keys(manualAnnotations).length)snapshot.manualAnnotations=manualAnnotations;else delete snapshot.manualAnnotations
  return {...state,progress:{...state.progress,lyricSnapshots:{...state.progress.lyricSnapshots,[songId]:snapshot}}}
}

export function reconcileLearningState(songs, saved) {
  const progress = {
    ...saved.progress,
    learnedBySong: { ...saved.progress?.learnedBySong },
    reviewItems: [...(saved.progress?.reviewItems || [])],
    favoriteSongIds: [...(saved.progress?.favoriteSongIds || [])],
    corrections: { ...saved.progress?.corrections },
    lyricSnapshots: { ...saved.progress?.lyricSnapshots },
  }
  const annotations = { ...saved.annotations }
  const aiReviews = { ...saved.aiReviews }
  const sentenceExplanations = { ...saved.sentenceExplanations }
  const previousLines = (id) => progress.lyricSnapshots[id]?.lines
    || annotations[id]?.map((line) => ({ id: line.id, text: line.text ?? line.tokens.map((token) => token.surface).join('') }))

  // Old folder IDs depended on sort order. Migrate only a unique, exact whole-
  // song match; unverifiable legacy records remain stored, but are not applied.
  const legacyIds = [...new Set([...Object.keys(annotations), ...Object.keys(progress.lyricSnapshots)])]
    .filter((id) => /^song-\d+$/.test(id))
  for (const song of songs.filter((item) => item.id.startsWith('folder-'))) {
    if (progress.lyricSnapshots[song.id] || annotations[song.id]
      || progress.learnedBySong[song.id] || sentenceExplanations[song.id]) continue
    const matches = legacyIds.filter((id) => sameLines(previousLines(id), song.lines))
    if (matches.length !== 1 || songs.filter((item) => sameLines(item.lines, song.lines)).length !== 1) continue
    const oldId = matches[0]
    for (const map of [annotations, aiReviews, sentenceExplanations, progress.learnedBySong, progress.lyricSnapshots]) {
      if (Object.hasOwn(map, oldId)) { map[song.id] = map[oldId]; delete map[oldId] }
    }
    for (const [key, reading] of Object.entries(progress.corrections)) {
      if (key.startsWith(`${oldId}:`)) {
        progress.corrections[`${song.id}${key.slice(oldId.length)}`] = reading
        delete progress.corrections[key]
      }
    }
    progress.reviewItems = progress.reviewItems.map((item) => item.songId === oldId ? { ...item, songId: song.id } : item)
    progress.favoriteSongIds = progress.favoriteSongIds.map((id) => id === oldId ? song.id : id)
  }

  for (const song of songs) {
    // 云目录的占位歌词不能参与原文一致性判断，否则会错误清除未下载歌曲的学习记录。
    if(song.cloudPending)continue
    // A browser-imported song has an immutable, randomly generated ID and its
    // own persisted lyrics. Legacy mastery without annotation evidence is safe
    // to bootstrap there, unlike the old positional folder IDs.
    const previous = previousLines(song.id) || (song.isLocal ? song.lines : undefined)
    const validIds = new Set(song.lines.filter((line) => previous?.some((old) => old.id === line.id && old.text === line.text)).map((line) => line.id))
    // 原来把缓存缺失等同于人工校正无效，并永久删除；保留旧实现对照。
    // const cached = (annotations[song.id] || []).filter((annotation) => song.lines.some((line) => annotationMatchesLine(annotation, line)))
    // if (annotations[song.id] && annotations[song.id].length !== cached.length) annotations[song.id] = cached
    // for (const key of Object.keys(progress.corrections)) {
    //   if (!key.startsWith(`${song.id}:`)) continue
    //   const [lineId, tokenIndex] = key.slice(song.id.length + 1).split(':').map(Number)
    //   if (!cached.some((line) => line.id === lineId && line.tokens.some((token) => token.index === tokenIndex))) delete progress.corrections[key]
    // }
    const manual=protectManualReadings(song,annotations[song.id]||[],progress.corrections,progress.lyricSnapshots[song.id])
    if(annotations[song.id]||manual.annotations.length)annotations[song.id]=manual.annotations
    progress.corrections=manual.corrections
    if (progress.learnedBySong[song.id]) progress.learnedBySong[song.id] = progress.learnedBySong[song.id].filter((id) => validIds.has(id))
    // 旧实现强制存在text，导致协议允许的{songId,lineId}在恢复或下载音频后被清空。
    // progress.reviewItems = progress.reviewItems.filter((item) => item.songId !== song.id
    //   || song.lines.some((line) => line.id === item.lineId && line.text === item.text))
    progress.reviewItems = progress.reviewItems.flatMap((item) => {
      if (item.songId !== song.id) return [item]
      // 新收藏单元保留准确行引用和收藏时原文；歌词变更时由复习页提示，不静默删收藏。
      if(item.unitVersion===1)return validReviewItem(item)?[item]:[]
      const line = song.lines.find((candidate) => candidate.id === item.lineId)
      if (!line) return []
      // 缺省原文只在稳定本机歌曲或已有原文证据确认该行时补齐；不按文字或数组下标猜测。
      if (!Object.hasOwn(item, 'text') && validIds.has(line.id)) return [{ ...item, text: line.text }]
      // 显式携带的原文仍须完全一致，歌词改变后的失配清理规则保持有效。
      return item.text === line.text ? [item] : []
    })
    // Whole-song review and sentence explanations depend on adjacent context.
    if (!sameLines(previous, song.lines)) {
      delete aiReviews[song.id]
      delete sentenceExplanations[song.id]
    }
    // 原仅写lyricSnapshot(song)；人工词界与隔离记录跟随同一个原子进度存储及学习备份。
    progress.lyricSnapshots[song.id] = {...lyricSnapshot(song),...(Object.keys(manual.manualAnnotations).length?{manualAnnotations:manual.manualAnnotations}:{}),...(Object.keys(manual.unresolvedCorrections).length?{unresolvedCorrections:manual.unresolvedCorrections}:{})}
  }
  return { progress, annotations, aiReviews, sentenceExplanations }
}
