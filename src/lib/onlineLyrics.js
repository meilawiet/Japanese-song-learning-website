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
  // 原来只接受 syncedLyrics；纯文本结果也可导入，保留来源与真实时间轴状态。
  return records.filter((item) => Number.isInteger(item.id) && (item.syncedLyrics?.trim()||item.plainLyrics?.trim())).slice(0, 20)
    .map((item) => ({ id: `lrclib:${item.id}`,provider:'lrclib', title: item.trackName || item.name || '未命名', artist: item.artistName || '未知歌手', album: item.albumName || '', duration: item.duration || 0, lyrics: item.syncedLyrics||item.plainLyrics,timed:Boolean(item.syncedLyrics?.trim()) }))
}

export function lyricsRecordToFile(record) {
  // UtaTen JSON 保留逐词假名，不能转成假时间戳 LRC 而丢失映射。
  if(record.structured)return new File([record.lyrics],`${record.title.replace(/[\\/:*?"<>|]/g,'_')}.uta-lyrics.json`,{type:'application/json'})
  const base = `${record.title}-${record.artist}`.replace(/[\\/:*?"<>|]/gu, '_').slice(0, 100)
  // 原来直接拼接标题和作者；平台文本不能插入新元数据行或伪时间戳。
  const metadata = value => String(value || '').replace(/[\r\n\[\]]/g, ' ')
  const content = `[ti:${metadata(record.title)}]\n[ar:${metadata(record.artist)}]\n${record.lyrics}`
  return new File([content], `${base}.lrc`, { type: 'text/plain;charset=utf-8' })
}
