export const DEFAULT_LYRIC_SOURCES = [
  { id: 'lrclib', name: 'LRCLIB', kind: 'lrclib', baseUrl: 'https://lrclib.net', enabled: true, builtin: true },
  { id: 'utaten', name: 'UtaTen', kind: 'utaten', baseUrl: 'https://utaten.com', enabled: true, builtin: true },
]
export const LYRIC_SOURCES_CHANGED = 'uta-lyrics-sources-changed'
export const PLATFORM_LYRIC_SOURCES = [
  { kind: 'qq', name: 'QQ 音乐', baseUrl: 'https://y.qq.com' },
  { kind: 'netease', name: '网易云音乐', baseUrl: 'https://music.163.com' },
  { kind: 'kugou', name: '酷狗音乐', baseUrl: 'https://www.kugou.com' },
  { kind: 'kuwo', name: '酷我音乐', baseUrl: 'https://www.kuwo.cn' },
]
export function lyricSourceAdapter(value) {
  let host
  try { host = new URL(value).hostname.toLowerCase() } catch { return null }
  if (['y.qq.com', 'www.y.qq.com', 'i.y.qq.com', 'i2.y.qq.com', 'music.qq.com'].includes(host)) return 'qq'
  if (['music.163.com', 'www.music.163.com'].includes(host)) return 'netease'
  if (['kugou.com', 'www.kugou.com'].includes(host)) return 'kugou'
  if (['kuwo.cn', 'www.kuwo.cn'].includes(host)) return 'kuwo'
  if (['utaten.com', 'www.utaten.com'].includes(host)) return 'utaten'
  return null
}
export const lyricSourceKindLabel = kind => kind === 'lrclib' ? 'LRCLIB 兼容接口' : kind === 'utaten' ? 'UtaTen 网站适配' : `${PLATFORM_LYRIC_SOURCES.find(item => item.kind === kind)?.name || kind}专用接口`

export function lyricErrorMessage(error) {
  return String(error?.message || '歌词源请求失败，请稍后重试。').replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/u, '')
}

export async function loadDesktopLyricSources() {
  if (!globalThis.window?.utaDesktop?.loadLyricsSources) return DEFAULT_LYRIC_SOURCES.map(source => ({ ...source }))
  try { return await window.utaDesktop.loadLyricsSources() }
  catch (error) { throw new Error(lyricErrorMessage(error)) }
}

export async function saveDesktopLyricSources(sources) {
  if (!window.utaDesktop?.saveLyricsSources) throw new Error('当前程序不支持歌词源设置。')
  try {
    const saved = await window.utaDesktop.saveLyricsSources(sources)
    window.dispatchEvent(new Event(LYRIC_SOURCES_CHANGED))
    return saved
  } catch (error) { throw new Error(lyricErrorMessage(error)) }
}
