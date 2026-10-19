import { annotationMatchesLine } from './learningIdentity.js'
import { isManuallySegmentedToken } from './lyricSegmentation.js'

export function lyricContextKey(song) {
  return JSON.stringify(song.lines.map(line => [line.id, line.text, line.translation || '']))
}

// Stable storage IDs must never masquerade as the current displayed sentence
// numbers. Only the request uses 1-based positions; responses map back to IDs.
export function createAiReviewRequest(song, annotations = [], corrections = {}) {
  const byLine = new Map(annotations.map(line => [line.id, line]))
  const lineIds = new Map()
  const payload = { song_id: song.id, title: song.title, artist: song.artist,
    lines: song.lines.map((line, index) => {
      const id = index + 1
      lineIds.set(id, line.id)
      const annotation = byLine.get(line.id)
      if (!annotationMatchesLine(annotation, line)) return { id, text: line.text }
      return { id, text: line.text, tokens: annotation.tokens.map(token => ({ index: token.index, surface: token.surface,
        reading: corrections[`${song.id}:${line.id}:${token.index}`] ?? token.reading,
        is_symbol: Boolean(token.is_symbol), segmentation_locked: isManuallySegmentedToken(token),
        dictionary_form: token.dictionary_form || '', part_of_speech: token.part_of_speech || '' })) }
    }) }
  return { payload, lineIds, sourceContext: lyricContextKey(song), inputKey: JSON.stringify([payload, [...lineIds]]) }
}

export function resolveAiReviewResult(result, request) {
  const map = suggestions => (Array.isArray(suggestions) ? suggestions : []).flatMap(item =>
    request.lineIds.has(item.line_id) ? [{ ...item, line_id: request.lineIds.get(item.line_id) }] : [])
  return { ...result, suggestions: map(result.suggestions), segmentation_suggestions: map(result.segmentation_suggestions),
    sourceContext: request.sourceContext, inputKey: request.inputKey }
}

export function createSentenceRequest(song, selectedLines) {
  const selected = new Set(selectedLines.map(line => line.id)), lineIds = new Map()
  const lines = song.lines.flatMap((line, index) => {
    if (!selected.has(line.id)) return []
    const id = index + 1
    lineIds.set(id, line.id)
    return [{ id, text: line.text, translation: line.translation || '',
      previous_line: song.lines[index - 1]?.text || '', next_line: song.lines[index + 1]?.text || '' }]
  })
  return { lines, lineIds, sourceContext: lyricContextKey(song) }
}
