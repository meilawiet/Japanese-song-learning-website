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

export function reconcileLearningState(songs, saved) {
  const progress = {
    ...saved.progress,
    learnedBySong: { ...saved.progress?.learnedBySong },
    reviewItems: [...(saved.progress?.reviewItems || [])],
    favoriteSongIds: [...(saved.progress?.favoriteSongIds || [])],
    corrections: { ...saved.progress?.corrections },
    hiddenReadings: { ...saved.progress?.hiddenReadings },
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
    for (const key of Object.keys(progress.hiddenReadings)) {
      if (key.startsWith(`${oldId}:`)) {
        progress.hiddenReadings[`${song.id}${key.slice(oldId.length)}`] = true
        delete progress.hiddenReadings[key]
      }
    }
    progress.reviewItems = progress.reviewItems.map((item) => item.songId === oldId ? { ...item, songId: song.id } : item)
    progress.favoriteSongIds = progress.favoriteSongIds.map((id) => id === oldId ? song.id : id)
  }

  for (const song of songs) {
    // A browser-imported song has an immutable, randomly generated ID and its
    // own persisted lyrics. Legacy mastery without annotation evidence is safe
    // to bootstrap there, unlike the old positional folder IDs.
    const previous = previousLines(song.id) || (song.isLocal ? song.lines : undefined)
    const validIds = new Set(song.lines.filter((line) => previous?.some((old) => old.id === line.id && old.text === line.text)).map((line) => line.id))
    const cached = (annotations[song.id] || []).filter((annotation) => song.lines.some((line) => annotationMatchesLine(annotation, line)))
    if (annotations[song.id] && annotations[song.id].length !== cached.length) annotations[song.id] = cached
    for (const key of Object.keys(progress.corrections)) {
      if (!key.startsWith(`${song.id}:`)) continue
      const [lineId, tokenIndex] = key.slice(song.id.length + 1).split(':').map(Number)
      if (!cached.some((line) => line.id === lineId && line.tokens.some((token) => token.index === tokenIndex))) delete progress.corrections[key]
    }
    for (const key of Object.keys(progress.hiddenReadings)) {
      if (!key.startsWith(`${song.id}:`)) continue
      const [lineId, tokenIndex] = key.slice(song.id.length + 1).split(':').map(Number)
      if (!cached.some((line) => line.id === lineId && line.tokens.some((token) => token.index === tokenIndex))) delete progress.hiddenReadings[key]
    }
    if (progress.learnedBySong[song.id]) progress.learnedBySong[song.id] = progress.learnedBySong[song.id].filter((id) => validIds.has(id))
    progress.reviewItems = progress.reviewItems.filter((item) => item.songId !== song.id
      || song.lines.some((line) => line.id === item.lineId && line.text === item.text))
    // Whole-song review and sentence explanations depend on adjacent context.
    if (!sameLines(previous, song.lines)) {
      delete aiReviews[song.id]
      delete sentenceExplanations[song.id]
    }
    progress.lyricSnapshots[song.id] = lyricSnapshot(song)
  }
  return { progress, annotations, aiReviews, sentenceExplanations }
}
