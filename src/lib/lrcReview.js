import { isCreditLine, isSongHeadingLine } from './songMetadata.js'
import { extractSourceKana } from './sourceKana.js'

const TRACKS = new Set(['original', 'translation', 'romaji', 'ignore'])
const TIMESTAMP = /^(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?$/u

export function parseLrcTime(value) {
  const match = String(value ?? '').trim().match(TIMESTAMP)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2]) + Number((match[3] || '').padEnd(3, '0')) / 1000
}

export function formatLrcTime(seconds) {
  const milliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000))
  return `${String(Math.floor(milliseconds / 60000)).padStart(2, '0')}:${String(Math.floor(milliseconds % 60000 / 1000)).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`
}

function initialTrack(text, hasOriginal, pairedWithKanaOriginal = false) {
  if (/[\u3040-\u30ff]/u.test(text)) return { track: 'original', reason: '' }
  if (/[\u3400-\u9fff]/u.test(text)) return { track: hasOriginal ? 'translation' : 'original', reason: pairedWithKanaOriginal ? '' : '纯汉字也可能是日文原文，请确认归类。' }
  if (/[A-Za-z]/u.test(text)) return { track: hasOriginal ? 'romaji' : 'original', reason: '' }
  return { track: 'original', reason: '无法判断文字轨道，请确认归类。' }
}

// Keep every timestamped line in source order. The proposed track is only a draft.
export function parseLrcCues(content, title, artist) {
  const cues = []
  let hasOriginal = false
  let lastOriginal = null
  const seenOriginals = new Set()
  for (const [sourceIndex, sourceLine] of String(content).split(/\r?\n/u).entries()) {
    const tags = [...sourceLine.matchAll(/\[([^\]]*)\]/gu)]
    const stamps = tags.filter(([, value]) => /^\d{1,3}:/u.test(value))
    if (!stamps.length) continue
    const last = stamps.at(-1)
    const text = sourceLine.slice(last.index + last[0].length).replace(/\s+/gu, ' ').trim()
    if (!text || isCreditLine(text) || isSongHeadingLine(text, title, artist)) continue
    for (const [, timeText] of stamps) {
      const time = parseLrcTime(timeText)
      // An adjacent Chinese line aligned to a kana lyric is a paired translation,
      // not a fresh ambiguity requiring one click per sentence.
      const pairedWithKanaOriginal = lastOriginal && time != null && lastOriginal.time != null
        && Math.abs(time - lastOriginal.time) <= 0.05 && /[\u3040-\u30ff]/u.test(lastOriginal.text)
      const { track, reason } = initialTrack(text, hasOriginal, pairedWithKanaOriginal)
      const duplicateKey = `${parseLrcTime(timeText)}\u0000${text}`
      if (track === 'original' && seenOriginals.has(duplicateKey)) continue
      if (track === 'original') seenOriginals.add(duplicateKey)
      cues.push({ id: `source-${sourceIndex}-${cues.length}`, timeText, text, track, reviewReason: reason, reviewed: false })
      if (track === 'original') { hasOriginal = true; lastOriginal = { time, text } }
    }
  }
  return cues
}

// Bulk acceptance covers only the proposed track. Timestamp anomalies and
// malformed rows must remain visible for separate correction.
export function confirmLrcTrackClassifications(cues) {
  return cues.map(cue => cue.track !== 'ignore' && cue.reviewReason && !cue.reviewed
    ? { ...cue, trackReviewed: true } : cue)
}

export function insertLrcCue(cues, index) {
  const previous = [...cues.slice(0, index)].reverse().find(cue => cue.track === 'original' && parseLrcTime(cue.timeText) != null)
  const next = cues.slice(index).find(cue => cue.track === 'original' && parseLrcTime(cue.timeText) != null)
  const before = previous && parseLrcTime(previous.timeText)
  const after = next && parseLrcTime(next.timeText)
  const start = before != null && after != null && after > before ? (before + after) / 2 : before != null ? before + 5 : after != null ? Math.max(0, after - 5) : 0
  const cue = { id: `insert-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`, timeText: formatLrcTime(start), text: '', track: 'original', reviewReason: '', reviewed: true }
  return [...cues.slice(0, index), cue, ...cues.slice(index)]
}

export function compileLrcCues(cues) {
  const lines = [], issues = []
  let current = null, previousStart = null
  const originalStarts = new Set()
  for (const [index, cue] of (cues || []).entries()) {
    if (!TRACKS.has(cue.track)) { issues.push({ cueId: cue.id, kind: 'error', message: '请选择文字轨道。' }); continue }
    if (cue.track === 'ignore') continue
    const text = String(cue.text || '').trim().replace(/\s+/gu, ' ')
    const start = parseLrcTime(cue.timeText)
    if (start == null) issues.push({ cueId: cue.id, kind: 'error', message: `第 ${index + 1} 行时间戳无效，请使用 00:12.345。` })
    if (!text) issues.push({ cueId: cue.id, kind: 'error', message: `第 ${index + 1} 行没有文字。` })
    if (text.length > 500) issues.push({ cueId: cue.id, kind: 'error', message: `第 ${index + 1} 行超过 500 字。` })
    if (cue.reviewReason && !cue.reviewed && !cue.trackReviewed) issues.push({ cueId: cue.id, kind: 'review', message: cue.reviewReason })
    if (cue.track === 'original') {
      if (start != null && previousStart != null && start < previousStart && !cue.reviewed) issues.push({ cueId: cue.id, kind: 'review', message: '原文时间戳早于前一句，请检查顺序。' })
      if (start != null && originalStarts.has(start) && !cue.reviewed) issues.push({ cueId: cue.id, kind: 'review', message: '两句原文使用相同时间戳，请确认。' })
      if (start != null) { previousStart = start; originalStarts.add(start) }
      const source = extractSourceKana(text)
      current = { start, text: source.text, translation: '', romaji: cue.romaji || '', sourceId: cue.id,
        ...(source.readings.length ? { sourceReadings: source.readings } : {}) }
      lines.push(current)
    } else if (!current) {
      issues.push({ cueId: cue.id, kind: 'error', message: '这行前面没有原文，请改为原文、移动位置或忽略。' })
    } else if (current[cue.track]) {
      issues.push({ cueId: cue.id, kind: 'error', message: `同一句已有${cue.track === 'romaji' ? '罗马音' : '译文'}，请调整轨道或插入新原文。` })
    } else current[cue.track] = text
  }
  lines.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))
  return {
    lines: lines.map(({ sourceId, romaji, ...line }, id) => ({ id, ...line, ...(romaji ? { romaji } : {}) })),
    issues: lines.length ? issues : [{ cueId: cues?.[0]?.id, kind: 'error', message: '没有可学习的原文句子。' }, ...issues],
  }
}
