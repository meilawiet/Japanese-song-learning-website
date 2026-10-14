import { Capacitor, CapacitorHttp } from '@capacitor/core'

// 分享链接只获取歌曲信息，不下载音频，也不改变用户配置的歌词来源。
export const SHARE_PLATFORMS = { netease: '网易云音乐', qq: 'QQ 音乐', kugou: '酷狗音乐', kuwo: '酷我音乐' }
const hosts = {
  netease: ['music.163.com', 'y.music.163.com', 'm.music.163.com', '163cn.tv'],
  qq: ['y.qq.com', 'i.y.qq.com', 'i2.y.qq.com', 'c.y.qq.com', 'c6.y.qq.com', 'u.y.qq.com', 'x.y.qq.com'],
  kugou: ['kugou.com', 'www.kugou.com', 'm.kugou.com', 't1.kugou.com', 't2.kugou.com'],
  kuwo: ['kuwo.cn', 'www.kuwo.cn', 'm.kuwo.cn', 'h5app.kuwo.cn', 'oia.kuwo.cn'],
}
const abort = signal => { if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError') }
const clean = value => String(value || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ').replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => { const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '' }).replace(/[\u0000-\u001f]/g, ' ').trim()
const platformFor = host => Object.keys(hosts).find(key => hosts[key].includes(host.toLowerCase()))

// 不接受任意站点、内网、账号密码或非标准端口；HTTP 分享地址统一升级 HTTPS。
export function validateShareUrl(value, base) {
  let url
  try { url = new URL(clean(value), base) } catch { throw new Error('分享链接格式不正确。') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || !platformFor(url.hostname)) throw new Error('暂不支持这个链接。请粘贴网易云音乐、QQ 音乐、酷狗或酷我的歌曲分享链接。')
  url.protocol = 'https:'
  return url
}

// 支持整段分享文案；多个不同链接时要求用户明确选择，避免识别错歌。
export function extractShareUrl(text) {
  const values = [...new Set((String(text || '').match(/https?:\/\/[^\s<>"“”‘’《》]+/gi) || []).map(value => value.replace(/[，。；、！!）)\]}]+$/u, '')))]
  if (!values.length) throw new Error('没有找到链接。请粘贴完整的歌曲分享链接或分享文案。')
  const supported = values.filter(value => { try { validateShareUrl(value); return true } catch { return false } })
  if (supported.length > 1) throw new Error('发现多个歌曲链接，请每次只粘贴一首歌的分享内容。')
  return validateShareUrl(supported[0] || values[0]).href
}

export function identifyShareSong(value) {
  let url = validateShareUrl(value)
  const provider = platformFor(url.hostname)
  // 平台中转链接内嵌的目标仍需逐次校验，限制嵌套深度。
  for (let i = 0; i < 3; i++) {
    const nested = ['url', 'target', 'redirect', 'redirect_url'].map(key => url.searchParams.get(key)).find(v => /^https?:\/\//i.test(v || ''))
    if (!nested) break
    const next = validateShareUrl(nested)
    if (platformFor(next.hostname) !== provider) throw new Error('分享链接跳转到了其他平台，请复制歌曲详情页链接。')
    url = next
  }
  const hash = url.hash.replace(/^#\/?/, '')
  // #wechat_redirect 等只是页面锚点，不能覆盖真实歌曲路径；仅解析路由型 hash。
  const hashUrl = /^#\/|^#(?:song|playlist|album|artist|user)(?:[/?]|$)/i.test(url.hash) ? new URL('/' + hash, url.origin) : null
  const path = hashUrl?.pathname || url.pathname
  const params = new URLSearchParams(url.search)
  if (hashUrl) for (const [key, val] of hashUrl.searchParams) params.set(key, val)
  if (/\/(?:album|playlist|singer|artist|user|video|mv)(?:[\/_-]|$)|\/\w*albumDetail|\/\w*playlist/i.test(path) || /\/ryqq\/playlist/i.test(path)) throw new Error('这是歌单、专辑、歌手或视频链接，请复制单首歌曲的分享链接。')
  let id = '', kind = 'id'
  if (provider === 'netease' && /\/(?:m\/)?song(?:\/|$|\.html)/i.test(path)) id = params.get('id') || path.match(/\/song\/(\d+)/)?.[1] || ''
  if (provider === 'qq') {
    id = params.get('songmid') || params.get('mid') || path.match(/\/songDetail\/([a-z\d]+)/i)?.[1] || path.match(/\/song\/([a-z\d]+)(?:\.html)?$/i)?.[1] || ''
    kind = /^\d+$/.test(id) ? 'id' : 'mid'
    if (!id && /song|playsong|detail/i.test(path)) { id = params.get('songid') || params.get('id') || ''; kind = 'id' }
  }
  if (provider === 'kugou') {
    id = params.get('hash') || params.get('Hash') || hash.match(/(?:^|&)hash=([a-f\d]{32})/i)?.[1] || ''
    kind = 'hash'
  }
  // 同时兼容新版详情页与旧版 yinyue 数字路径。
  if (provider === 'kuwo' && /play_detail|yinyue|song|kplayer/i.test(path)) id = path.match(/\/(?:play_detail|yinyue)\/(\d+)/)?.[1] || params.get('musicId') || params.get('musicid') || params.get('songid') || params.get('rid') || params.get('id') || ''
  if (id && !(provider === 'kugou' ? /^[a-f\d]{32}$/i : provider === 'qq' && kind === 'mid' ? /^[a-z\d]{10,20}$/i : /^\d{1,20}$/).test(id)) throw new Error('分享链接中的歌曲标识不正确。')
  return { provider, id, kind, url: url.href }
}

// 原生请求关闭自动重定向，每一跳都重新校验平台域名；不运行远端脚本。
async function nativeRequest(url, signal) {
  abort(signal)
  if (!Capacitor.isNativePlatform()) throw new Error('分享链接识别目前支持安卓端；网页可直接输入歌名搜索。')
  try {
    // QQ 短链会给空响应附带压缩标记；Android 自动解压会抛 EOFException。
    // 明确请求不压缩，只读取 Location 后逐跳处理，不改变系统 HTTP 插件的全局行为。
    const response = await CapacitorHttp.get({ url, responseType: 'text', disableRedirects: true, connectTimeout: 10000, readTimeout: 12000, headers: { Accept: 'application/json,text/html', 'Accept-Encoding': 'identity', Referer: new URL(url).origin + '/' } })
    abort(signal)
    return response
  } catch (error) {
    abort(signal)
    // 原生插件有时只返回 code、空 message，仍需展示可操作的错误，不能静默失败。
    throw new Error(error?.message || `分享链接请求失败${error?.code ? `（${error.code}）` : ''}，请检查网络或改用歌曲详情页链接。`)
  }
}
const header = (response, key) => Object.entries(response.headers || {}).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1]
const body = response => { const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data); if (raw.length > 2 * 1024 * 1024) throw new Error('平台返回的信息过大，请改用歌曲详情页链接。'); return raw }

async function readPage(url, signal, request, stopAtSong = false) {
  let current = validateShareUrl(url).href
  for (let i = 0; i < 6; i++) {
    abort(signal)
    // 短链已跳到可识别的歌曲 ID 就停止加载，避免详情页内条件式 App 唤起脚本被误当跳转。
    if (stopAtSong && i > 0 && identifyShareSong(current).id) return { url: current, html: '' }
    const response = await request(current, signal)
    abort(signal)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = header(response, 'location')
      if (!location) throw new Error('平台跳转未包含目标地址，请复制完整歌曲链接。')
      current = validateShareUrl(location, current).href
      continue
    }
    if (response.status !== 200) throw new Error(`平台返回 ${response.status}，请稍后重试或直接输入歌名。`)
    const html = body(response)
    // 部分短链接使用静态跳转页面；只读取地址字面量，不执行 JavaScript。
    const attrs = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]))
    const refresh = attrs.find(row => row['http-equiv']?.toLowerCase() === 'refresh')?.content?.match(/url\s*=\s*['"]?([^'";]+)/i)?.[1]
    // 只在尚无歌曲 ID 的 HTML 中读取静态跳转，JSON 与详情页的按钮脚本不参与。
    const redirect = refresh || (/^\s*</.test(html) && !identifyShareSong(current).id ? html.match(/(?:window\.)?location(?:\.href)?\s*=\s*['"](https?:\/\/[^'"]+)['"]/)?.[1] || html.match(/(?:window\.)?location\.replace\(\s*['"](https?:\/\/[^'"]+)['"]\s*\)/)?.[1] : null)
    if (redirect) { current = validateShareUrl(redirect, current).href; continue }
    return { url: current, html }
  }
  throw new Error('分享链接跳转次数过多，请复制歌曲详情页链接。')
}

// HTML 只读取元信息与 JSON 数据；不使用 eval 或注入远端节点。
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(([, key, a, b, c]) => [key.toLowerCase(), clean(a ?? b ?? c)]))
}
export function parseSharePage(html) {
  const meta = Object.fromEntries([...String(html).matchAll(/<meta\b[^>]*>/gi)].map(match => { const a = attributes(match[0]); return [(a.property || a.name || '').toLowerCase(), a.content || ''] }))
  const title = meta['og:music:song'] || meta['music:song'] || meta['og:title'] || ''
  const artist = meta['og:music:artist'] || meta['music:musician'] || meta['music:artist'] || ''
  if (title && artist && !/^https?:/i.test(artist)) return { title: clean(title.replace(/\s*[-_]\s*(?:QQ音乐|网易云音乐|酷狗音乐|酷我音乐).*$/, '')), artist: clean(artist) }
  for (const match of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]), rows = Array.isArray(data) ? data : data['@graph'] || [data]
      const row = rows.find(item => [item['@type']].flat().includes('MusicRecording'))
      const by = row?.byArtist || row?.author
      const artists = (Array.isArray(by) ? by : [by]).map(item => typeof item === 'string' ? item : item?.name).filter(Boolean).join(' / ')
      if (row?.name && artists) return { title: clean(row.name), artist: clean(artists) }
    } catch { /* 非法结构化数据跳过，继续尝试平台接口。 */ }
  }
  return null
}

// 接口响应绑定明确的歌曲 ID，不用整页关键词搜索猜测歌曲身份。
async function metadata(record, signal, request) {
  const { provider, id, kind } = record
  let url
  if (provider === 'netease') url = 'https://music.163.com/api/song/detail?' + new URLSearchParams({ ids: JSON.stringify([Number(id)]) })
  if (provider === 'qq') url = 'https://u.y.qq.com/cgi-bin/musicu.fcg?' + new URLSearchParams({ data: JSON.stringify({ comm: { ct: 24, cv: 0 }, req: { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param: { [kind === 'mid' ? 'song_mid' : 'song_id']: kind === 'mid' ? id : Number(id), song_type: 0 } } }) })
  if (provider === 'kugou') url = 'https://m.kugou.com/app/i/getSongInfo.php?' + new URLSearchParams({ cmd: 'playInfo', hash: id })
  if (provider === 'kuwo') url = 'https://m.kuwo.cn/newh5/singles/songinfoandlrc?' + new URLSearchParams({ musicId: id })
  const response = await readPage(url, signal, request)
  let data
  try { data = JSON.parse(response.html) } catch { throw new Error('平台未返回有效歌曲信息，请尝试复制完整歌曲详情页链接。') }
  if (provider === 'netease') {
    const row = data.songs?.find(item => String(item.id) === id)
    if (row) return { title: clean(row.name), artist: clean((row.artists || row.ar || []).map(item => item.name).join(' / ')) }
  }
  if (provider === 'qq') {
    const row = data.req?.data?.track_info
    if (row && (kind === 'mid' ? row.mid === id : String(row.id) === id)) return { title: clean(row.title || row.name), artist: clean((row.singer || []).map(item => item.name).join(' / ')) }
  }
  if (provider === 'kuwo') {
    const row = data.data?.songinfo
    if (row && String(row.id) === id) return { title: clean(row.songName), artist: clean(row.artist) }
  }
  if (provider === 'kugou') {
    // 接口可能返回低码率等价 hash；优先使用明确的歌名和歌手，不从试听地址取元信息。
    const title = data.songName || data.songname, artist = data.singerName || data.singername
    if (title && artist) return { title: clean(title), artist: clean(artist) }
    const file = clean(data.fileName), split = file.indexOf(' - ')
    if (split > 0) return { title: file.slice(split + 3), artist: file.slice(0, split) }
  }
  throw new Error('歌曲不存在、已下架或平台未返回歌名和歌手，请直接输入关键词搜索。')
}

export async function resolveSongShare(text, signal, request = nativeRequest) {
  abort(signal)
  if (String(text || '').length > 4096) throw new Error('分享内容过长，请只粘贴一首歌的链接。')
  const initial = identifyShareSong(extractShareUrl(text))
  let record = initial, info = null, page = null, failure = null
  // 常规链接直接按 ID 请求，避免额外加载详情页；短链接才先展开。
  if (!record.id) {
    page = await readPage(record.url, signal, request, true)
    record = identifyShareSong(page.url)
    if (!record.id) {
      const canonical = [...page.html.matchAll(/<link\b[^>]*>/gi)].map(m => attributes(m[0])).find(row => row.rel?.toLowerCase() === 'canonical')?.href
      if (canonical) record = identifyShareSong(validateShareUrl(canonical, page.url).href)
      // 酷狗分享页经常把 hash 放在静态 JSON 属性中。
      if (!record.id && record.provider === 'kugou') {
        const hash = page.html.match(/["'](?:hash|Hash)["']\s*:\s*["']([a-f\d]{32})["']/i)?.[1]
        if (hash) record = { ...record, id: hash, kind: 'hash' }
      }
    }
  }
  if (record.id) { try { info = await metadata(record, signal, request) } catch (error) { abort(signal); failure = error } }
  if (!info) {
    try { if (!page?.html) page = await readPage(record.url, signal, request); info = parseSharePage(page.html) } catch (error) { abort(signal); failure ||= error }
  }
  abort(signal)
  if (!info?.title || !info?.artist || info.title.length > 300 || info.artist.length > 300) throw failure || new Error('没有识别出完整的歌名和歌手，链接可能已失效或需要登录。请复制歌曲详情页链接，或直接输入歌名。')
  return { ...info, provider: record.provider, platform: SHARE_PLATFORMS[record.provider], url: record.url, query: `${info.title} / ${info.artist}` }
}
