import { isCreditLine, isSongHeadingLine } from './songMetadata.js'
import { extractSourceKana } from './sourceKana.js'
import { inferLyricTracks } from './lyricTrackInference.js'

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

// Keep every timestamped line in source order. The proposed track is only a draft.
export function parseLrcCues(content, title, artist) {
  const cues = []
  const seenCues = new Set()
  for (const [sourceIndex, sourceLine] of String(content).split(/\r?\n/u).entries()) {
    const tags = [...sourceLine.matchAll(/\[([^\]]*)\]/gu)]
    const stamps = tags.filter(([, value]) => /^\d{1,3}:/u.test(value))
    if (!stamps.length) continue
    const last = stamps.at(-1)
    const raw = sourceLine.slice(last.index + last[0].length).replace(/\s+/gu, ' ').trim()
    const marker = raw.match(/^\[uta-(original|translation|romaji)\]/u)
    const text = marker ? raw.slice(marker[0].length).trim() : raw
    if (!text || isCreditLine(text) || isSongHeadingLine(text, title, artist)) continue
    for (const [, timeText] of stamps) {
      const time = parseLrcTime(timeText)
      const duplicateKey = `${time ?? timeText}\u0000${marker?.[1] || ''}\u0000${text}`
      if (seenCues.has(duplicateKey)) continue
      seenCues.add(duplicateKey)
      cues.push({ id: `source-${sourceIndex}-${cues.length}`, timeText, text, start: time, ...(marker ? { explicitTrack: marker[1] } : {}), reviewReason: '', reviewed: false })
    }
  }
  return inferLyricTracks(cues).map(({ start, explicitTrack, ...cue }) => cue)
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

export function compileLrcCues(cues, { mode = 'import' } = {}) {
  const saved = mode === 'saved'
  const cueText = cue => saved ? String(cue.text || '').trim() : String(cue.text || '').trim().replace(/\s+/gu, ' ')
  const lines = [], issues = []
  let previousStart = null
  const byCue = new Map()
  const originalStarts = new Set()
  for (const [index, cue] of (cues || []).entries()) {
    if (!TRACKS.has(cue.track)) { issues.push({ cueId: cue.id, kind: 'error', message: '请选择文字轨道。' }); continue }
    if (cue.track === 'ignore') continue
    const text = cueText(cue)
    const start = parseLrcTime(cue.timeText)
    if (start == null && (!saved || String(cue.timeText || '').trim())) issues.push({ cueId: cue.id, kind: 'error', message: `第 ${index + 1} 行时间戳无效，请使用 00:12.345。` })
    if (!text) issues.push({ cueId: cue.id, kind: 'error', message: `第 ${index + 1} 行没有文字。` })
    const limit = saved && cue.track !== 'original' ? 1000 : 500
    if (text.length > limit) issues.push({ cueId: cue.id, kind: 'error', message: `第 ${index + 1} 行超过 ${limit} 字。` })
    if (cue.track === 'original') {
      if (start != null && previousStart != null && start < previousStart && !cue.reviewed) issues.push({ cueId: cue.id, kind: 'review', message: '原文时间戳早于前一句，请检查顺序。' })
      if (start != null && originalStarts.has(start) && !cue.reviewed) issues.push({ cueId: cue.id, kind: 'review', message: '两句原文使用相同时间戳，请确认。' })
      if (start != null) { previousStart = start; originalStarts.add(start) }
      const source = saved ? { text, readings: [] } : extractSourceKana(text)
      const current = { start, text: source.text, translation: '', romaji: cue.romaji || '', sourceId: cue.id,
        ...(source.readings.length ? { sourceReadings: source.readings } : {}) }
      lines.push(current)
      byCue.set(cue.id, current)
    }
  }
  // Resolve auxiliaries after collecting originals, including translations
  // placed before the corresponding original at the same timestamp.
  let current = null
  for (const cue of cues || []) {
    if (cue.track === 'original') { current = byCue.get(cue.id); continue }
    if (cue.track === 'translation' || cue.track === 'romaji') {
      const start = parseLrcTime(cue.timeText)
      const text = cueText(cue)
      const matches = start == null ? [] : lines.filter(line => line.start != null && Math.abs(line.start - start) <= 0.05)
      if (saved && cue.targetCueId && !byCue.has(cue.targetCueId)) {
        issues.push({ cueId: cue.id, kind: 'error', message: '对应原文已被删除或改为其他轨道，请重新选择对应原文。' }); continue
      }
      if (saved && !cue.targetCueId && !cue.attachToPrevious && matches.length > 1) {
        issues.push({ cueId: cue.id, kind: 'error', message: '同一时间有多句原文，请选择这一行对应的原文。' }); continue
      }
      const target = cue.attachToPrevious ? current : byCue.get(cue.targetCueId) || (matches.length === 1 ? matches[0] : current)
      if (!target) issues.push({ cueId: cue.id, kind: 'error', message: '这行没有对应原文，请改为原文、移动位置或忽略。' })
      else if (target[cue.track] && target[cue.track] !== text) issues.push({ cueId: cue.id, kind: 'error', message: `同一句已有${cue.track === 'romaji' ? '罗马音' : '译文'}，请调整轨道或插入新原文。` })
      else target[cue.track] = text
    }
  }
  if (!saved) lines.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))
  return {
    lines: lines.map(({ sourceId, romaji, ...line }, id) => ({ id, ...line, ...(saved ? { sourceId } : {}), ...(romaji ? { romaji } : {}) })),
    issues: lines.length ? issues : [{ cueId: cues?.[0]?.id, kind: 'error', message: '没有可学习的原文句子。' }, ...issues],
  }
}
