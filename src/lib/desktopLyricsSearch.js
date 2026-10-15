import { lyricsRecordToFile } from './onlineLyrics.js'
import { parseUtatenLyrics, parseUtatenSearch } from './utatenLyrics.js'

const bridge = () => {
  if (!window.utaDesktop?.requestLyrics) throw new Error('Windows 歌词搜索服务不可用。')
  return window.utaDesktop
}

export async function searchDesktopLyrics(query, source = 'all') {
  const keyword = String(query || '').trim().slice(0, 160)
  if (!keyword) throw new Error('请先输入歌名或歌手。')
  const sources = source === 'all' ? ['lrclib', 'utaten'] : [source]
  const settled = await Promise.allSettled(sources.map(async (name) => {
    const raw = await bridge().requestLyrics(name, 'search', keyword)
    if (name === 'utaten') return parseUtatenSearch(raw)
    const records = JSON.parse(raw)
    if (!Array.isArray(records)) throw new Error('LRCLIB 返回的数据格式有误。')
    return records.filter(item => Number.isSafeInteger(item.id) && typeof item.syncedLyrics === 'string' && /\[\d{1,3}:\d{2}/u.test(item.syncedLyrics))
      .slice(0, 20).map(item => ({ provider: 'lrclib', id: `lrclib:${item.id}`, title: item.trackName || item.name || '未命名', artist: item.artistName || '未知歌手', album: item.albumName || '', duration: item.duration || 0, lyrics: item.syncedLyrics, timed: true, hasAnnotation: /[\p{Script=Han}々]+[ \t\u3000]*[（(][\p{Script=Hiragana}\p{Script=Katakana}ー\s]+[）)]/u.test(item.syncedLyrics) }))
  }))
  const results = settled.flatMap(item => item.status === 'fulfilled' ? item.value : [])
  const errors = settled.flatMap((item, index) => item.status === 'rejected' ? [`${sources[index] === 'utaten' ? 'UtaTen' : 'LRCLIB'}：${item.reason?.message || '搜索失败'}`] : [])
  if (!results.length && errors.length === sources.length) throw new Error(errors.join('；'))
  return { results: results.sort((a, b) => Number(b.hasAnnotation || b.annotationHint) - Number(a.hasAnnotation || a.annotationHint)), errors }
}

export async function desktopLyricsRecordToFile(record) {
  if (record.provider === 'lrclib') return lyricsRecordToFile(record)
  if (record.provider !== 'utaten' || !/^[a-z0-9]{1,80}$/i.test(record.platformId || '')) throw new Error('歌词候选无效。')
  const html = await bridge().requestLyrics('utaten', 'fetch', record.platformId)
  const parsed = parseUtatenLyrics(html, record)
  const base = `${record.title}-${record.artist}`.replace(/[\\/:*?"<>|]/gu, '_').slice(0, 100)
  return new File([parsed.lyrics], `${base}.uta-lyrics.json`, { type: 'application/json' })
}
