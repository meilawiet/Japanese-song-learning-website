// LRCLIB 提供公开、允许跨域的搜索接口；只采用带时间轴的 LRC 结果。
const API = 'https://lrclib.net/api/search'
const CLIENT = 'UTA Song Learning 1.5 (https://github.com/meilawiet/Japanese-song-learning-website)'

export async function searchSyncedLyrics(query, signal) {
  const keyword = String(query || '').trim().slice(0, 160)
  if (!keyword) throw new Error('请先输入歌曲名称。')
  const response = await fetch(`${API}?${new URLSearchParams({ q: keyword })}`, {
    headers: { 'Lrclib-Client': CLIENT }, signal,
  })
  if (response.status === 429) throw new Error(`歌词网站请求过多，请稍后重试。`)
  if (!response.ok) throw new Error('歌词搜索暂时不可用，请稍后重试。')
  const records = await response.json()
  if (!Array.isArray(records)) throw new Error('歌词网站返回的数据格式有误。')
  return records.filter((item) => Number.isInteger(item.id) && typeof item.syncedLyrics === 'string' && /\[\d{1,3}:\d{2}/u.test(item.syncedLyrics)).slice(0, 20)
    .map((item) => ({ id: item.id, title: item.trackName || item.name || '未命名', artist: item.artistName || '未知歌手', album: item.albumName || '', duration: item.duration || 0, lyrics: item.syncedLyrics }))
}

export function lyricsRecordToFile(record) {
  const base = `${record.title}-${record.artist}`.replace(/[\\/:*?"<>|]/gu, '_').slice(0, 100)
  const content = `[ti:${record.title}]\n[ar:${record.artist}]\n${record.lyrics}`
  return new File([content], `${base}.lrc`, { type: 'text/plain;charset=utf-8' })
}
