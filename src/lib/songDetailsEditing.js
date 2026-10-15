import { lyricSnapshot, reconcileLearningState } from './learningIdentity.js'

// A known before/after pair is stronger evidence than a missing legacy cache.
// Text changes invalidate that line's learning identity; timing and translation
// edits retain pronunciation, corrections, mastery and the review queue.
export function applySongDetailsEdit(before, after, state) {
  const previous = {
    ...state,
    progress: { ...state.progress, lyricSnapshots: {
      ...state.progress?.lyricSnapshots, [before.id]: lyricSnapshot(before),
    } },
  }
  const next = reconcileLearningState([after], previous)
  const oldLines = new Map(before.lines.map(line => [line.id, line]))
  const retained = new Set(after.lines.filter(line => {
    const old = oldLines.get(line.id)
    return old && old.text === line.text && (old.translation || '') === (line.translation || '')
  }).map(line => line.id))
  // Sentence AI uses both text and translation. Preserve unaffected entries;
  // invalidate the edited sentence only, without discarding personal progress.
  const cache = state.sentenceExplanations?.[before.id]
  if (cache) next.sentenceExplanations[before.id] = Object.fromEntries(
    Object.entries(cache).filter(([id]) => retained.has(Number(id))),
  )
  return next
}

// Undo only this song. Learning performed in other songs after the edit must
// survive. The edited song returns to its explicit before-edit checkpoint.
export function restoreSongEditLearning(current, before, songId) {
  const next = { ...current, progress: { ...current.progress } }
  const restoreMap = (target, saved) => {
    const result = { ...target }
    if (Object.hasOwn(saved || {}, songId)) result[songId] = saved[songId]
    else delete result[songId]
    return result
  }
  for (const field of ['annotations', 'aiReviews', 'sentenceExplanations']) {
    next[field] = restoreMap(current[field], before[field])
  }
  for (const field of ['learnedBySong', 'lyricSnapshots']) {
    next.progress[field] = restoreMap(current.progress?.[field], before.progress?.[field])
  }
  next.progress.hiddenReadings = {
    ...Object.fromEntries(Object.entries(current.progress?.hiddenReadings || {}).filter(([key]) => !key.startsWith(`${songId}:`))),
    ...Object.fromEntries(Object.entries(before.progress?.hiddenReadings || {}).filter(([key]) => key.startsWith(`${songId}:`))),
  }
  const prefix = `${songId}:`
  next.progress.corrections = {
    ...Object.fromEntries(Object.entries(current.progress?.corrections || {}).filter(([key]) => !key.startsWith(prefix))),
    ...Object.fromEntries(Object.entries(before.progress?.corrections || {}).filter(([key]) => key.startsWith(prefix))),
  }
  next.progress.reviewItems = [
    ...(current.progress?.reviewItems || []).filter(item => item.songId !== songId),
    ...(before.progress?.reviewItems || []).filter(item => item.songId === songId),
  ]
  return next
}
