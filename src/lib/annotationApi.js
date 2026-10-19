import { Capacitor } from '@capacitor/core'
import { aiRequestHeaders } from './aiSettings'
import { createAiReviewRequest, resolveAiReviewResult } from './aiLyricContext'

const apiOrigin = import.meta.env.VITE_ANNOTATION_API_URL || 'http://127.0.0.1:8000'

export async function annotateSongLines(lines, signal) {
  // 手机端直接使用随 APK 安装的日语词典；电脑网页仍沿用现有 Python 服务。
  if (Capacitor.isNativePlatform()) {
    const { annotateLinesOffline } = await import('./offlineAnnotation')
    return annotateLinesOffline(lines)
  }
  const response = await fetch(`${apiOrigin}/api/annotate/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
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

export async function reviewSongWithAi(song, annotations = [], corrections = {}) {
  const request = createAiReviewRequest(song, annotations, corrections)
  return resolveAiReviewResult(await postAi('/api/ai/review-song', request.payload), request)
}

export function explainSelectionWithAi(payload) {
  return postAi('/api/ai/explain-selection', payload)
}

export function explainSentenceBatchWithAi(lines, signal) {
  return postAi('/api/ai/explain-sentences', { lines }, undefined, signal)
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
