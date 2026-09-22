const apiOrigin = import.meta.env.VITE_ANNOTATION_API_URL || 'http://127.0.0.1:8000'

export async function annotateSongLines(lines) {
  const response = await fetch(`${apiOrigin}/api/annotate/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines: lines.map(({ id, text }) => ({ id, text })) }),
  })
  if (!response.ok) throw new Error('自动注音服务暂不可用')
  return response.json()
}

async function postAi(path, payload) {
  const response = await fetch(`${apiOrigin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.detail || 'AI 服务暂不可用')
  return body
}

export function reviewSongWithAi(song) {
  return postAi('/api/ai/review-song', {
    song_id: song.id,
    title: song.title,
    artist: song.artist,
    lines: song.lines.map(({ id, text }) => ({ id, text })),
  })
}

export function explainSelectionWithAi(payload) {
  return postAi('/api/ai/explain-selection', payload)
}
