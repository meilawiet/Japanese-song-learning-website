import { lyricsRecordToFile } from './onlineLyrics.js'
import { parseUtatenLyrics, parseUtatenSearch } from './utatenLyrics.js'
import { loadDesktopLyricSources, lyricErrorMessage } from './desktopLyricSources.js'
import { searchPlatformSongs, fetchPlatformLyrics } from './platformLyrics.js'
import { platformLyricsRecordToFile } from './desktopPlatformLyrics.js'

const bridge = () => {
  if (!window.utaDesktop?.requestLyrics) throw new Error('Windows 歌词搜索服务不可用。')
  return window.utaDesktop
}

export async function searchDesktopLyrics(query, source = 'all') {
  const keyword = String(query || '').trim().slice(0, 160)
  if (!keyword) throw new Error('请先输入歌名或歌手。')
  const configured = (await loadDesktopLyricSources()).filter(item => item.enabled)
  const sources = source === 'all' ? configured : configured.filter(item => item.id === source)
  if (!sources.length) throw new Error('没有可用的歌词源，请到设置中的“歌词源”启用或添加来源。')
  const settled = await Promise.allSettled(sources.map(async (source) => {
    if (['qq', 'netease', 'kugou', 'kuwo'].includes(source.kind)) {
      const records = await searchPlatformSongs(source.kind, keyword.replace(/\s+\/\s+/g, ' '), undefined, url => bridge().requestLyrics(source.id, 'platform', url))
      return records.map(record => ({ ...record, id: `${source.id}:${record.platformId}`, sourceId: source.id, sourceName: source.name }))
    }
    const raw = await bridge().requestLyrics(source.id, 'search', keyword)
    if (source.kind === 'utaten') return parseUtatenSearch(raw).map(record => ({ ...record, id: `${source.id}:${record.platformId}`, sourceId: source.id, sourceName: source.name }))
    const records = JSON.parse(raw)
    if (!Array.isArray(records)) throw new Error('返回的数据格式有误，需要兼容 LRCLIB 的搜索接口。')
    return records.filter(item => Number.isSafeInteger(item.id) && typeof item.syncedLyrics === 'string' && /\[\d{1,3}:\d{2}/u.test(item.syncedLyrics))
      .slice(0, 20).map(item => ({ provider: 'lrclib', sourceId: source.id, sourceName: source.name, id: `${source.id}:${item.id}`, title: item.trackName || item.name || '未命名', artist: item.artistName || '未知歌手', album: item.albumName || '', duration: item.duration || 0, lyrics: item.syncedLyrics, timed: true, hasAnnotation: /[\p{Script=Han}々]+[ \t\u3000]*[（(][\p{Script=Hiragana}\p{Script=Katakana}ー\s]+[）)]/u.test(item.syncedLyrics) }))
  }))
  const results = settled.flatMap(item => item.status === 'fulfilled' ? item.value : [])
  const errors = settled.flatMap((item, index) => item.status === 'rejected' ? [`${sources[index].name}：${lyricErrorMessage(item.reason)}`] : [])
  if (!results.length && errors.length === sources.length) throw new Error(errors.join('；'))
  return { results: results.sort((a, b) => Number(b.hasAnnotation || b.annotationHint) - Number(a.hasAnnotation || a.annotationHint)), errors }
}

export async function desktopLyricsRecordToFile(record) {
  if (record.provider === 'lrclib') return lyricsRecordToFile(record)
  if (['qq', 'netease', 'kugou', 'kuwo'].includes(record.provider)) {
    const ready = await fetchPlatformLyrics(record, undefined, url => bridge().requestLyrics(record.sourceId, 'platform', url))
    return platformLyricsRecordToFile(ready)
  }
  if (record.provider !== 'utaten' || !/^[a-z0-9]{1,80}$/i.test(record.platformId || '')) throw new Error('歌词候选无效。')
  const html = await bridge().requestLyrics(record.sourceId || 'utaten', 'fetch', record.platformId)
  const parsed = parseUtatenLyrics(html, record)
  const base = `${record.title}-${record.artist}`.replace(/[\\/:*?"<>|]/gu, '_').slice(0, 100)
  return new File([parsed.lyrics], `${base}.uta-lyrics.json`, { type: 'application/json' })
}
