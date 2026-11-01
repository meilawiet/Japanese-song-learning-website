// Keep legacy desktop caches, but verify transported v2 source bindings.
export function sentenceCacheMatches(entry, line, japaneseLevel = 'N3') {
  if (entry?.text !== line.text || typeof entry.explanation?.meaning !== 'string' || !entry.explanation.meaning.trim()) return false
  if (entry.schemaVersion == null) return true
  const explanation = entry.explanation
  return entry.schemaVersion === 2 && explanation.binding_version === 2
    && explanation.line_id === line.id && explanation.source_text === line.text
    && (entry.language && entry.language !== 'ja' || entry.japaneseLevel === japaneseLevel)
}
