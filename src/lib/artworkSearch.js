import { Capacitor, CapacitorHttp } from '@capacitor/core'

const origin = import.meta.env.VITE_ANNOTATION_API_URL || 'http://127.0.0.1:8000'
const providers = ['Apple Music', '网易云音乐', 'QQ 音乐', '酷狗音乐']
const key = (value) => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

function score(name, singer, title, artist) {
  const song = key(name), expected = key(title), performer = key(singer), target = key(artist)
  if (!song || !expected) return 0
  let total = song === expected ? 8 : song.includes(expected) || expected.includes(song) ? 3 : 0
  if (target && performer) total += performer === target ? 5 : performer.includes(target) || target.includes(performer) ? 2 : 0
  return total
}

function candidate(provider, name, singer, cover, source, title, artist) {
  const url = String(cover || '').replace(/^http:\/\//u, 'https://')
  const matchScore = score(name, singer, title, artist)
  if (matchScore < 3 || !url.startsWith('https://')) return null
  return { artworkUrl: url, artworkSourceUrl: String(source || '').replace(/^http:\/\//u, 'https://'),
    artworkProvider: provider, trackTitle: name, artistName: singer, matchScore }
}

async function nativeJson(url, referer = '') {
  const response = await CapacitorHttp.get({ url, headers: { Accept: 'application/json', ...(referer ? { Referer: referer } : {}) },
    responseType: 'json', connectTimeout: 7000, readTimeout: 7000 })
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`)
  return typeof response.data === 'string' ? JSON.parse(response.data) : response.data
}

async function apple(title, artist) {
  const query = new URLSearchParams({ term: `${title} ${artist}`.trim(), country: 'JP', media: 'music', entity: 'song', limit: '12' })
  const rows = (await nativeJson(`https://itunes.apple.com/search?${query}`)).results || []
  return rows.map((row) => candidate('Apple Music', row.trackName, row.artistName,
    row.artworkUrl100?.replace('100x100bb', '600x600bb'), row.trackViewUrl, title, artist)).filter(Boolean)
}

async function netease(title, artist) {
  const query = new URLSearchParams({ s: `${title} ${artist}`.trim(), type: '1', offset: '0', limit: '12' })
  const rows = (await nativeJson(`https://music.163.com/api/search/get/web?${query}`, 'https://music.163.com/')).result?.songs || []
  const matched = rows.map((row) => ({ row, singer: (row.artists || []).map((part) => part.name).join(' / ') }))
    .filter(({ row, singer }) => score(row.name, singer, title, artist) >= 3 && Number.isSafeInteger(row.id)).slice(0, 4)
  if (!matched.length) return []
  const detailQuery = new URLSearchParams({ ids: JSON.stringify(matched.map(({ row }) => row.id)) })
  const details = (await nativeJson(`https://music.163.com/api/song/detail?${detailQuery}`, 'https://music.163.com/')).songs || []
  const covers = new Map(details.map((row) => [row.id, row.album?.picUrl]))
  return matched.map(({ row, singer }) => candidate('网易云音乐', row.name, singer, covers.get(row.id),
    `https://music.163.com/#/song?id=${row.id}`, title, artist)).filter(Boolean)
}

async function qq(title, artist) {
  const query = new URLSearchParams({ format: 'json', w: `${title} ${artist}`.trim(), p: '1', n: '12' })
  const rows = (await nativeJson(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?${query}`, 'https://y.qq.com/')).data?.song?.list || []
  return rows.filter((row) => /^[A-Za-z0-9]{8,32}$/u.test(row.albummid || ''))
    .map((row) => candidate('QQ 音乐', row.songname, (row.singer || []).map((part) => part.name).join(' / '),
      `https://y.gtimg.cn/music/photo_new/T002R500x500M000${row.albummid}.jpg`,
      `https://y.qq.com/n/ryqq/songDetail/${row.songmid || ''}`, title, artist)).filter(Boolean)
}

async function kugou(title, artist) {
  const query = new URLSearchParams({ format: 'json', keyword: `${title} ${artist}`.trim(), page: '1', pagesize: '12', showtype: '1' })
  const rows = (await nativeJson(`https://mobiles.kugou.com/api/v3/search/song?${query}`, 'https://www.kugou.com/')).data?.info || []
  return rows.map((row) => candidate('酷狗音乐', row.songname, row.singername,
    row.trans_param?.union_cover?.replace('{size}', '480'), 'https://www.kugou.com/', title, artist)).filter(Boolean)
}

// 电脑网页由本机 Python 服务跨域检索；Android 直接访问各目录，不依赖电脑在线。
export async function searchArtworkCandidates(title, artist = '') {
  if (!title.trim()) throw new Error('请先填写歌曲名。')
  if (!Capacitor.isNativePlatform()) {
    const params = new URLSearchParams({ title: title.trim(), artist: artist.trim() })
    const response = await fetch(`${origin}/api/artwork/candidates?${params}`)
    if (!response.ok) throw new Error('封面搜索服务不可用，请确认网站服务已启动。')
    return response.json()
  }
  const requests = [apple, netease, qq, kugou]
  const results = await Promise.allSettled(requests.map((run) => run(title.trim(), artist.trim())))
  const unavailable = results.flatMap((result, index) => result.status === 'rejected' ? [providers[index]] : [])
  const seen = new Set()
  const candidates = results.flatMap((result) => result.status === 'fulfilled'
    ? result.value.sort((left, right) => right.matchScore - left.matchScore).slice(0, 3) : [])
    .sort((left, right) => right.matchScore - left.matchScore).filter((item) => {
      if (seen.has(item.artworkUrl)) return false
      seen.add(item.artworkUrl)
      return true
    })
  return { candidates, unavailable }
}

// 上传图片压缩成小尺寸 JPEG，以便离线显示、备份和电脑传歌。
export async function prepareUploadedArtwork(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('请选择不超过 10 MB 的 JPG、PNG 或 WebP 图片。')
  }
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 480; canvas.height = 480
    const context = canvas.getContext('2d')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, 480, 480)
    const size = Math.min(bitmap.width, bitmap.height)
    context.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 480, 480)
    const artworkUrl = canvas.toDataURL('image/jpeg', 0.78)
    if (artworkUrl.length > 500_000) throw new Error('图片压缩后仍过大，请换一张图片。')
    return { artworkUrl, artworkSourceUrl: '', artworkProvider: '本地上传' }
  } finally { bitmap.close() }
}

// 选中的在线封面在保存前下载为本地 JPEG；Android 用原生 HTTP 绕过图片站跨域限制。
export async function cacheArtworkSelection(choice) {
  if (!choice?.artworkUrl || !/^https?:\/\//iu.test(choice.artworkUrl)) return choice
  const url = new URL(choice.artworkUrl)
  if (url.protocol !== 'https:') throw new Error('在线封面必须使用 HTTPS 链接。')
  let blob
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url: url.href, responseType: 'blob', connectTimeout: 8000, readTimeout: 12000 })
    if (response.status !== 200 || typeof response.data !== 'string') throw new Error('封面下载失败，请换一张候选图片。')
    const base64 = response.data.replace(/\s+/gu, '')
    if (base64.length > 8_000_000) throw new Error('封面文件过大，请换一张图片。')
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    blob = new Blob([bytes])
  } else {
    // 电脑网页优先直接下载，跨域站点交给本机 API 的受限图片代理。
    let response
    try { response = await fetch(url.href) } catch { /* 图片站常不允许浏览器跨域读取。 */ }
    if (!response?.ok) response = await fetch(`${origin}/api/artwork/image?${new URLSearchParams({ url: url.href })}`)
    if (!response.ok) throw new Error('封面下载失败，请换一张候选图片。')
    blob = await response.blob()
  }
  if (!blob.size || blob.size > 5 * 1024 * 1024) throw new Error('封面文件过大或为空，请换一张图片。')
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
  const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
  const isWebp = String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP'
  const type = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isWebp ? 'image/webp' : ''
  if (!type) throw new Error('封面链接没有返回受支持的图片，请换一张。')
  const compressed = await prepareUploadedArtwork(new File([blob], 'online-artwork', { type }))
  return { ...choice, artworkUrl: compressed.artworkUrl, artworkChoice: choice.artworkChoice || 'selected' }
}
