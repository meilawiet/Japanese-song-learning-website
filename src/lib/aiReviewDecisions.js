import { correctionKey } from './ruby.js'
import { isManuallySegmentedToken } from './lyricSegmentation.js'

const identity = suggestion => suggestion.suggested_segments
  ? JSON.stringify(['segmentation', suggestion.line_id, suggestion.start_token_index, suggestion.end_token_index,
    suggestion.original_segments, suggestion.suggested_segments])
  : JSON.stringify(['reading', suggestion.line_id, suggestion.token_index,
    suggestion.surface, suggestion.original_reading, suggestion.suggested_reading])

export function pendingSegmentationSuggestions(review, song, annotations = {}) {
  const lines = annotations[song.id] || []
  return (review?.segmentation_suggestions || []).filter(item => {
    if (item.skipped === true || !song.lines.some(line => line.id === item.line_id)) return false
    const tokens = lines.find(line => line.id === item.line_id)?.tokens || []
    const first = tokens.findIndex(token => token.index === item.start_token_index)
    const last = tokens.findIndex(token => token.index === item.end_token_index)
    return first >= 0 && last >= first && Array.isArray(item.original_segments)
      && Array.isArray(item.suggested_segments)
      && JSON.stringify(tokens.slice(first, last + 1).map(token => token.surface)) === JSON.stringify(item.original_segments)
      && item.suggested_segments.join('') === item.original_segments.join('')
      && JSON.stringify(item.suggested_segments) !== JSON.stringify(item.original_segments)
      && !tokens.slice(first, last + 1).some(token => isManuallySegmentedToken(token) || token.is_symbol)
  })
}

export function pendingReviewSuggestions(review, song, corrections = {}) {
  return (review?.suggestions || []).filter(suggestion => suggestion.skipped !== true
    && song.lines.some(line => line.id === suggestion.line_id)
    && !corrections[correctionKey(song.id, suggestion.line_id, suggestion.token_index)])
}

export function skipReviewSuggestion(review, target) {
  if (!review) return review
  const key = identity(target)
  const field = target.suggested_segments ? 'segmentation_suggestions' : 'suggestions'
  return { ...review, [field]: (review[field] || []).map(suggestion =>
    identity(suggestion) === key ? { ...suggestion, skipped: true } : suggestion) }
}

export function restoreSkippedSuggestions(review) {
  if (!review) return review
  return Object.fromEntries(Object.entries(review).map(([field, value]) =>
    ['suggestions', 'segmentation_suggestions'].includes(field) && Array.isArray(value)
      ? [field, value.map(suggestion => suggestion.skipped === true ? { ...suggestion, skipped: false } : suggestion)]
      : [field, value]))
}

// Repeat reviews keep an explicit decision only for the exact same word and
// readings. A different reading proposal remains visible for a new decision.
export function mergeReviewDecisions(next, previous) {
  const skipped = new Set((previous?.suggestions || []).filter(suggestion => suggestion.skipped === true).map(identity))
  const skippedSegments = new Set((previous?.segmentation_suggestions || []).filter(suggestion => suggestion.skipped === true).map(identity))
  return { ...next, suggestions: (next.suggestions || []).map(suggestion =>
    skipped.has(identity(suggestion)) ? { ...suggestion, skipped: true } : suggestion),
  segmentation_suggestions: (next.segmentation_suggestions || []).map(suggestion =>
    skippedSegments.has(identity(suggestion)) ? { ...suggestion, skipped: true } : suggestion) }
}
