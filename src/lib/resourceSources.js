// 默认仅提供原有公共歌词检索与网页入口，三个平台需用户主动添加。
export const RESOURCE_SOURCES_KEY = 'uta-resource-sources-v1'
const UTATEN_MIGRATION='uta-utaten-source-added-v1'
export const DEFAULT_RESOURCE_SOURCES = [
  { id: 'lrclib', name: 'LRCLIB', url: 'https://lrclib.net/' },
  // UtaTen 为新增默认注音来源；音乐平台仍需用户自己添加网址。
  { id: 'utaten', name: 'UtaTen', url: 'https://utaten.com/' },
  { id: 'musicenc', name: 'Toomic / MusicEnc', url: 'https://www.musicenc.com/' },
  { id: 'xiageba', name: '下歌吧', url: 'https://so.liumingye.cn/' },
  { id: 'gequbao', name: '歌曲宝', url: 'https://www.gequbao.com/s/{query}' },
  { id: '22lrc', name: '爱歌词网', url: 'https://www.22lrc.com/' },
  { id: '4c44', name: '世纪音乐网', url: 'https://www.4c44.com/' },
]
export function validateResourceSource(value) {
  const suppliedName = String(value.name || '').trim(), raw = String(value.url || '').trim()
  // 原来要求必须填写名称；现在只输入网址也可自动识别平台或使用域名。
  // if (!name || name.length > 60) throw new Error('请填写来源名称，最多60个字符。')
  if (suppliedName.length > 60) throw new Error('来源名称最多60个字符。')
  if (raw.length > 2000) throw new Error('网址太长，请检查后重试。')
  let url
  try { url = new URL(raw.replaceAll('{query}', 'uta')) } catch { throw new Error('请输入包含 https:// 或 http:// 的完整网址。') }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('仅支持不包含账号密码的 HTTP 或 HTTPS 网址。')
  const adapter = sourceAdapter({ url: raw })
  // 原名称映射没有 QQ 适配器：
  // const name = suppliedName || ({utaten:'UtaTen',netease:'网易云音乐',kugou:'酷狗音乐',kuwo:'酷我音乐',lrclib:'LRCLIB'})[adapter] || (['y.qq.com','music.qq.com'].includes(url.hostname)?'QQ音乐':url.hostname.slice(0,60))
  // 用户已有的 QQ 网页配置直接识别为歌词源，不自动新增配置。
  const name = suppliedName || ({utaten:'UtaTen',netease:'网易云音乐',kugou:'酷狗音乐',kuwo:'酷我音乐',qq:'QQ 音乐',lrclib:'LRCLIB'})[adapter] || url.hostname.slice(0,60)
  return { id: String(value.id || crypto.randomUUID()), name, url: raw }
}
export function sourceAdapter(source) {
  let host
  try { host = new URL(source.url.replaceAll('{query}', 'uta')).hostname.toLowerCase() } catch { return null }
  // 首页地址作为配置标识；匹配后仍调用软件中已经适配的固定接口。
  if (['music.163.com', 'www.music.163.com'].includes(host)) return 'netease'
  if (['kugou.com', 'www.kugou.com'].includes(host)) return 'kugou'
  if (['kuwo.cn', 'www.kuwo.cn'].includes(host)) return 'kuwo'
  // 仅精确匹配 QQ 音乐常用站点；接口地址始终由适配器生成，不采用用户网址作为请求目标。
  if (['y.qq.com','www.y.qq.com','i.y.qq.com','i2.y.qq.com','music.qq.com'].includes(host)) return 'qq'
  if (host === 'lrclib.net' || host === 'www.lrclib.net') return 'lrclib'
  if (host === 'utaten.com' || host === 'www.utaten.com') return 'utaten'
  return null
}
export function readResourceSources() {
  try {
    const raw = localStorage.getItem(RESOURCE_SOURCES_KEY)
    if (raw === null) return DEFAULT_RESOURCE_SOURCES.map(source => ({ ...source }))
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) throw new Error('Invalid sources')
    // 明确保存空列表时不自动恢复默认，删除来源后确实停止使用。
    // 只迁移一次新增来源；明确空列表不恢复，之后删除 UtaTen 也不会再次自动出现。
    if(!localStorage.getItem(UTATEN_MIGRATION)){
      if(list.length&&list.length<50&&!list.some(item=>sourceAdapter(item)==='utaten'))list.push({...DEFAULT_RESOURCE_SOURCES[1]})
      localStorage.setItem(UTATEN_MIGRATION,'1');localStorage.setItem(RESOURCE_SOURCES_KEY,JSON.stringify(list))
    }
    return list.slice(0, 50).map(validateResourceSource)
  } catch { return DEFAULT_RESOURCE_SOURCES.map(source => ({ ...source })) }
}
export function saveResourceSources(list) {
  if (!Array.isArray(list) || list.length > 50) throw new Error('最多保存50个来源。')
  const normalized = list.map(validateResourceSource)
  if (new Set(normalized.map(source => source.id)).size !== normalized.length) throw new Error('来源标识重复，请重新添加。')
  localStorage.setItem(RESOURCE_SOURCES_KEY, JSON.stringify(normalized))
  localStorage.setItem(UTATEN_MIGRATION,'1')
  window.dispatchEvent(new Event('uta:resource-sources-changed'))
  return normalized
}
export function resourceSearchUrl(source, keyword) {
  const query = String(keyword || '').trim()
  if (source.url.includes('{query}')) return source.url.replaceAll('{query}', encodeURIComponent(query))
  return source.url
}
