import { Capacitor } from '@capacitor/core'
import { aiRequestHeaders } from './aiSettings'
import { prepareLyricReadings } from './lyricReadings'
// 原导入仅有整曲复核；新增问题调整结果合并，保留未选择的建议。
import { mergeIssueAdjustment, reviewFingerprint, reviewLines } from './lyricAiReview'
import { annotationMatchesLine } from './learningIdentity'
import { literalAnnotation, songLanguage } from './songLanguage.js'

const apiOrigin = import.meta.env.VITE_ANNOTATION_API_URL || 'http://127.0.0.1:8000'

// 原签名：annotateSongLines(lines)；非日语不加载日语词典或请求日语注音服务。
export async function annotateSongLines(lines, language = 'ja') {
  if (language !== 'ja') return lines.map(line => literalAnnotation(line,language))
  // 手机端直接使用随 APK 安装的日语词典；电脑网页仍沿用现有 Python 服务。
  if (Capacitor.isNativePlatform()) {
    const { annotateLinesOffline } = await import('./offlineAnnotation')
    return annotateLinesOffline(lines)
  }
  const response = await fetch(`${apiOrigin}/api/annotate/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines: lines.map(({ id, text }) => ({ id, text })) }),
  })
  if (!response.ok) throw new Error('自动注音服务暂不可用')
  return response.json()
}

export async function searchSongArtwork(title, artist = '') {
  // 封面属于可选联网信息；手机无电脑后端时不阻碍歌曲导入。
  if (Capacitor.isNativePlatform()) return null
  const params = new URLSearchParams({ title, artist })
  const response = await fetch(`${apiOrigin}/api/artwork/search?${params.toString()}`)
  if (!response.ok) throw new Error('封面查询服务暂不可用')
  const result = await response.json().catch(() => ({}))
  if (!result.artwork_url) return null
  return {
    artworkUrl: result.artwork_url,
    artworkSourceUrl: result.source_url || '',
    artworkProvider: result.provider || 'Apple Music',
  }
}

async function postAi(path, payload, settings, signal) {
  // Android 通过原生 HTTP 直接连接用户配置的 AI 服务，绕开电脑本机地址。
  if (Capacitor.isNativePlatform()) {
    const mobileAi = await import('./mobileAi')
    return mobileAi.postMobileAi(path, payload, settings, signal)
  }
  const response = await fetch(`${apiOrigin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...aiRequestHeaders(settings) },
    signal,
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'AI 服务暂不可用，请检查配置')
  return body
}

export function reviewSongWithAi(song) {
  // 旧入口同样限制语种，防止绕过学习页的日语复核开关。
  if (songLanguage(song) !== 'ja') throw new Error('此歌曲不使用日语注音复核。')
  return postAi('/api/ai/review-song', {
    song_id: song.id,
    title: song.title,
    artist: song.artist,
    lines: song.lines.map(({ id, text }) => ({ id, text })),
  })
}

// 分批复核，整曲上下文保留；所有批次成功后才允许应用，取消不会改动歌曲。
// 原签名五个参数；可选 selectedIssues 仅复核用户点选的问题所在句。
export async function reviewImportedLyrics(song, cached, corrections, onProgress, signal, selectedIssues = null) {
  // 日语复核规则仅服务日语，其他语种不发送到日语提示词和读音校验器。
  if (songLanguage(song) !== 'ja') throw new Error('此歌曲不使用日语注音复核，可通过“问 AI”了解歌词。')
  const missing=song.lines.filter(line=>!cached.some(item=>annotationMatchesLine(item,line)))
  const generated=missing.length?await annotateSongLines(missing):[]
  const rawAnnotations=song.lines.map(line=>{
    const raw=[...generated,...cached].find(item=>annotationMatchesLine(item,line))
    if(!raw)throw new Error('自动注音尚未准备好，请稍后重试。')
    return raw
  })
  // 复核可使用合并词，但未采用的词保留原缓存和旧人工校正索引。
  const annotations=rawAnnotations.map(raw=>({...raw,tokens:prepareLyricReadings(raw.tokens,song.lines.find(line=>line.id===raw.id)?.romaji,corrections,song.id,raw.id).tokens}))
  const contextLines=reviewLines(song,annotations,corrections)
  const lines=selectedIssues?contextLines.filter(line=>selectedIssues.some(issue=>issue.line_id===line.id)):contextLines
  const suggestions=[],issues=[],clearedLineIds=[]
  const rejectedItems=[]
  let rejectedCount=0
  for(let offset=0;offset<lines.length;offset+=5){
    if(signal?.aborted)throw new DOMException('请求已取消','AbortError')
    const batch=lines.slice(offset,offset+5)
    const result=await postAi('/api/ai/review-imported-lyrics',{
      title:song.title,artist:song.artist,target_line_ids:batch.map(line=>line.id),lines:batch,
      context:contextLines.map(({id,raw_text,translation,imported_romaji})=>({id,raw_text,translation,imported_romaji})),
      ...(selectedIssues?{selected_issues:selectedIssues.filter(issue=>batch.some(line=>line.id===issue.line_id))}:{}),
    },undefined,signal)
    suggestions.push(...result.suggestions);issues.push(...result.issues)
    clearedLineIds.push(...(result.cleared_line_ids || []))
    rejectedCount+=result.rejected_count || 0
    rejectedItems.push(...(result.rejected_items || []))
    onProgress?.(Math.min(offset+5,lines.length))
  }
  return {annotations:rawAnnotations,reviewAnnotations:annotations,suggestions,issues,cleared_line_ids:clearedLineIds,rejected_count:rejectedCount,rejected_items:rejectedItems,fingerprint:reviewFingerprint(song,corrections)}
}

// 选中问题后再次请求AI给出具体读音，应用前仍须预览确认并校验快照。
export async function adjustSelectedLyricIssues(song,snapshot,corrections,indices,onProgress,signal) {
  if(reviewFingerprint(song,corrections)!==snapshot.fingerprint)throw new Error('歌词或人工读音已变化，请重新复核。')
  const selected=[...new Set(indices)].filter(index=>Number.isSafeInteger(index)&&snapshot.issues[index])
  if(!selected.length)throw new Error('请先选择需要AI调整的问题。')
  const next=await reviewImportedLyrics(song,snapshot.annotations,corrections,onProgress,signal,selected.map(index=>snapshot.issues[index]))
  // 统计二次请求尚未解决的所选问题，用于红字反馈，不能只判断是否有新建议。
  const result=mergeIssueAdjustment(snapshot,selected,next)
  const targetLines=new Set(selected.map(index=>snapshot.issues[index].line_id))
  return {result,newSuggestions:next.suggestions,unresolvedCount:result.issues.filter(issue=>targetLines.has(issue.line_id)).length}
}

export function explainSelectionWithAi(payload) {
  return postAi('/api/ai/explain-selection', payload)
}

// 原请求只有 {lines}；增加语种上下文，避免把外语解释成日语。
export function explainSentenceBatchWithAi(lines, language = 'ja') {
  return postAi('/api/ai/explain-sentences', { lines, language })
}

export async function getAiStatus(signal) {
  // 手机没有默认电脑服务；设置页显示本机的 AI 配置状态。
  if (Capacitor.isNativePlatform()) {
    const { mobileAiStatus } = await import('./mobileAi')
    return mobileAiStatus()
  }
  const response = await fetch(`${apiOrigin}/api/ai/status`, { signal })
  if (!response.ok) throw new Error('无法读取 AI 服务状态')
  return response.json()
}

export async function testAiConnection(settings, signal) {
  try {
    return await postAi('/api/ai/test', {}, settings, signal)
  } catch (error) {
    if (error instanceof TypeError) throw new Error('无法连接网站后端，请确认服务已启动。')
    throw error
  }
}
