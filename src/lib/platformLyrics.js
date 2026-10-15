import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { parseTimedLyrics } from './timedLyrics.js'
import {parseUtatenSearch,parseUtatenLyrics} from './utatenLyrics.js'
// QQ 专用解码保持在独立模块，其他平台仍使用原有歌词处理规则。
import {decodeQQTrack,cleanQQTranslation} from './qqLyrics.js'

// 原状态：QQ 当前实际探测未返回有效搜索结果，保留适配器供后续排查，不开放伪可用入口。
// 已实测新的搜索封装和三轨接口，QQ 仍需用户手动配置后才启用。
export const LYRIC_SOURCES = [
  { id: 'lrclib', name: 'LRCLIB' },
  { id: 'utaten', name: 'UtaTen' },
  { id: 'netease', name: '网易云音乐' },
  { id: 'kugou', name: '酷狗音乐' },
  { id: 'kuwo', name: '酷我音乐' },
  // { id: 'qq', name: 'QQ 音乐（暂不可用）', disabled: true },
  { id: 'qq', name: 'QQ 音乐' },
]
const names = Object.fromEntries(LYRIC_SOURCES.map(source => [source.id, source.name]))
// 原 referers 仅含音乐平台；UtaTen 使用普通 HTML 页面。
const referers = { utaten:'https://utaten.com/', netease: 'https://music.163.com/', qq: 'https://y.qq.com/', kugou: 'https://www.kugou.com/', kuwo: 'https://www.kuwo.cn/' }
const abort = signal => { if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError') }
const endpoint = (url, params) => `${url}?${new URLSearchParams(params)}`

// 网络只访问固定平台地址。原生请求有超时，取消后即使底层请求结束也不更新界面。
async function platformRequest(url, provider, signal) {
  abort(signal)
  if (!Capacitor.isNativePlatform()) throw new Error('音乐平台歌词搜索目前仅接入安卓端。')
  // 原 Accept 固定 JSON；HTML 来源仍用固定平台地址和受限超时。
  // 原请求未指定 QQ 浏览器标识；QQ 使用固定 UA，并避免原生层对空压缩响应的兼容问题。
  // const response = await CapacitorHttp.get({ url, headers: { Accept: provider==='utaten'?'text/html':'application/json', Referer: referers[provider] }, responseType: 'text', connectTimeout: 12000, readTimeout: 20000 })
  const response = await CapacitorHttp.get({ url, headers: { Accept: provider==='utaten'?'text/html':'application/json', Referer: referers[provider], ...(provider==='qq'?{'User-Agent':'Mozilla/5.0','Accept-Encoding':'identity'}:{}) }, responseType: 'text', connectTimeout: 12000, readTimeout: 20000 })
  abort(signal)
  if (response.status !== 200) throw new Error(`${names[provider]}暂时无法访问，请换一个来源。`)
  return typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
}

// 酷我旧搜索返回单引号字符串对象；只转换字符串字面量再 JSON.parse，不执行服务端脚本。
export function parsePlatformJson(raw) {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch {
    let output = ''
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] !== "'") { output += raw[i]; continue }
      let value = '', closed = false
      for (i++; i < raw.length; i++) {
        if (raw[i] === "'") { closed = true; break }
        if (raw[i] === '\\') {
          const next = raw[++i]
          if (next === 'u') {
            const code = raw.slice(i + 1, i + 5)
            if (!/^[0-9a-f]{4}$/i.test(code)) throw new Error('歌词平台返回无效字符。')
            value += String.fromCharCode(parseInt(code, 16)); i += 4
          } else value += ({ n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"' })[next] ?? `\\${next}`
        } else value += raw[i]
      }
      if (!closed) throw new Error('歌词平台返回不完整的数据。')
      output += JSON.stringify(value)
    }
    return JSON.parse(output)
  }
}
const json = async (url, provider, signal, request) => parsePlatformJson(await request(url, provider, signal))
const label = value => String(value || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()
const song = (provider, id, title, artist, album, duration) => ({ provider, id: `${provider}:${id}`, platformId: String(id), title: label(title) || '未命名', artist: label(artist) || '未知歌手', album: label(album), duration: Number(duration) || 0 })

// 搜索只返回版本候选；选用时才获取三轨，避免一次搜索下载整页歌词。
export async function searchPlatformSongs(provider, query, signal, request = platformRequest) {
  const keyword = String(query || '').trim().slice(0, 160)
  if (!keyword) throw new Error('请先输入歌曲名称。')
  abort(signal)
  if(provider==='utaten'){
    // 手动可用“歌名 / 歌手”精确组合，不把站点外链接当成歌词地址。
    const [title,artist='']=keyword.split(/\s+\/\s+/)
    return parseUtatenSearch(await request(endpoint('https://utaten.com/lyric/search',{title,artist_name:artist,sort:'popular_sort_asc'}),provider,signal))
  }
  let result
  if (provider === 'netease') {
    const data = await json(endpoint('https://music.163.com/api/search/get/web', { s: keyword, type: 1, offset: 0, limit: 20 }), provider, signal, request)
    if (data.code !== 200) throw new Error('网易云音乐搜索受限，请换一个来源。')
    result = (data.result?.songs || []).filter(row => Number.isSafeInteger(row.id)).map(row => song(provider, row.id, row.name, (row.artists || []).map(item => item.name).join(' / '), row.album?.name, row.duration / 1000))
  } else if (provider === 'kugou') {
    const data = await json(endpoint('https://mobiles.kugou.com/api/v3/search/song', { format: 'json', keyword, page: 1, pagesize: 20 }), provider, signal, request)
    if (data.status !== 1) throw new Error('酷狗音乐搜索暂不可用。')
    result = (data.data?.info || []).filter(row => /^[0-9a-f]{32}$/i.test(row.hash || '')).map(row => song(provider, row.hash, row.songname, row.singername, row.album_name, row.duration))
  } else if (provider === 'kuwo') {
    // 原请求未携带 vipver：{ all: keyword, ft: 'music', itemset: 'web_2013', client: 'kt', pn: 0, rn: 20, rformat: 'json', encoding: 'utf8' }
    // 与酷我当前网页搜索保持一致；缺少此参数会返回不完整候选，原唱也可能缺失。
    // 只补齐歌曲元信息检索参数，不改变音频获取、歌词选用或用户的来源配置。
    const data = await json(endpoint('https://search.kuwo.cn/r.s', { all: keyword, ft: 'music', itemset: 'web_2013', client: 'kt', vipver: 1, pn: 0, rn: 20, rformat: 'json', encoding: 'utf8' }), provider, signal, request)
    if (!Array.isArray(data.abslist)) throw new Error('酷我音乐搜索返回格式异常。')
    result = data.abslist.filter(row => /^MUSIC_\d+$/.test(row.MUSICRID || '')).map(row => song(provider, row.MUSICRID.replace('MUSIC_', ''), row.NAME, row.ARTIST, row.ALBUM, row.DURATION))
  } else if (provider === 'qq') {
    // 旧封装 code=0 但候选为空；请求键使用平台模块名，不再携带旧 comm/req 组合。
    // const data = await json(endpoint('https://u.y.qq.com/cgi-bin/musicu.fcg', { data: JSON.stringify({ comm: { ct: 24, cv: 0 }, req: { module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicDesktop', param: { query: keyword, num_per_page: 20, page_num: 1, search_type: 0 } } }) }), provider, signal, request)
    // if (data.code !== 0 || data.req?.code !== 0) throw new Error('QQ 音乐搜索受限，请换一个来源。')
    // result = (data.req?.data?.body?.song?.list || []).filter(row => /^[a-z0-9]{8,32}$/i.test(row.mid || '')).map(row => song(provider, row.mid, row.name, (row.singer || []).map(item => item.name).join(' / '), row.album?.name, row.interval))
    const module='music.search.SearchCgiService'
    const data = await json(endpoint('https://u.y.qq.com/cgi-bin/musicu.fcg', {data:JSON.stringify({[module]:{module,method:'DoSearchForQQMusicDesktop',param:{query:keyword,num_per_page:20,page_num:1,search_type:0}}})}),provider,signal,request)
    const block=data[module]
    if(data.code!==0||block?.code!==0)throw new Error('QQ 音乐搜索受限，请换一个来源。')
    const rows=block.data?.body?.song?.list
    if(!Array.isArray(rows))throw new Error('QQ 音乐搜索返回格式异常。')
    result=rows.filter(row=>/^[a-z0-9]{8,32}$/i.test(row.mid||'')).map(row=>({...song(provider,row.mid,row.title||row.name,(row.singer||[]).map(item=>item.name).join(' / '),row.album?.name,row.interval),...(Number.isSafeInteger(row.id)&&row.id>0?{songId:row.id}:{})}))
  } else throw new Error('不支持的歌词来源。')
  abort(signal)
  return result.slice(0, 20)
}

// 分轨先按毫秒时间戳对齐，不使用位置猜测或跨句补齐；不匹配的辅助轨不会误配。
export function timedTrack(text) {
  const rows = []
  const offset = Number(String(text || '').match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0)
  for (const line of String(text || '').split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)\]/g)]
    if (!stamps.length) continue
    const last = stamps.at(-1)
    const value = line.slice(last.index + last[0].length).replace(/<\d{1,3}:[0-5]\d(?:\.\d{1,3})?>/g, '').trim()
    if (!value) continue
    for (const [, minutes, seconds] of stamps) rows.push({ time: Math.max(0, Math.round((Number(minutes) * 60 + Number(seconds)) * 1000) + offset), text: value })
  }
  return rows
}
const timestamp = time => `[${String(Math.floor(time / 60000)).padStart(2, '0')}:${((time % 60000) / 1000).toFixed(3).padStart(6, '0')}]`
// 原签名：export function mergePlatformTracks(original, translation = '', romaji = '') {
// 默认仍严格匹配；仅 QQ 显式允许最多 10ms 的已确认精度差，不跨句或按行号补齐。
export function mergePlatformTracks(original, translation = '', romaji = '', {timeTolerance=0} = {}) {
  const originals = timedTrack(original)
  if (!originals.length) throw new Error('这份歌词没有可用的逐句时间轴，请选择其他版本或本地 LRC。')
  // 原严格匹配：const translations = new Map(timedTrack(translation).map(row => [row.time, row.text]))
  // const readings = new Map(timedTrack(romaji).map(row => [row.time, row.text]))
  const originalTimes=new Set(originals.map(row=>row.time))
  const align=track=>{
    const rows=timedTrack(track)
    if(!timeTolerance)return rows
    const mapped=rows.map(row=>{
      if(originalTimes.has(row.time))return row
      const candidates=[...originalTimes].filter(time=>Math.abs(time-row.time)<=timeTolerance)
      return candidates.length===1?{...row,time:candidates[0],sourceTime:row.time}:row
    })
    // 同一原文若有多个辅助行竞争，不覆盖已有精确匹配，也不猜测哪条属于该句。
    return mapped.map(row=>row.sourceTime!==undefined&&mapped.some(other=>other!==row&&other.time===row.time)?{...row,time:row.sourceTime}:row)
  }
  const translationRows=align(translation),readingRows=align(romaji)
  const translations = new Map(translationRows.map(row => [row.time, row.text]))
  const readings = new Map(readingRows.map(row => [row.time, row.text]))
  let translated = 0, romanized = 0
  const lyrics = originals.map(row => {
    const time = timestamp(row.time), lines = [`${time}${row.text}`]
    // 明确标记轨道，纯汉字原文、英语原文与含日语的翻译不会被启发式分类混淆。
    if (translations.has(row.time)) { lines.push(`${time}[uta-translation]${translations.get(row.time)}`); translated++ }
    if (readings.has(row.time)) { lines.push(`${time}[uta-romaji]${readings.get(row.time)}`); romanized++ }
    return lines.join('\n')
  }).join('\n')
  // 原 unmatched 直接重读原始轨道；现在使用已唯一匹配的结果统计，其他来源默认完全相同。
  // return { lyrics, trackSummary: { original: originals.length, translation: translated, romaji: romanized, unmatched: timedTrack(translation).filter(row => !originals.some(line => line.time === row.time)).length + timedTrack(romaji).filter(row => !originals.some(line => line.time === row.time)).length } }
  return { lyrics, trackSummary: { original: originals.length, translation: translated, romaji: romanized, unmatched: translationRows.filter(row=>!originalTimes.has(row.time)).length+readingRows.filter(row=>!originalTimes.has(row.time)).length } }
}
const decodeBase64 = value => new TextDecoder().decode(Uint8Array.from(atob(value || ''), char => char.charCodeAt(0)))

// 当前网易云有独立翻译/罗马音轨；酷狗普通 LRC 与酷我句级接口仅使用实际返回的数据。
export async function fetchPlatformLyrics(record, signal, request = platformRequest) {
  const provider = record.provider, id = record.platformId
  abort(signal)
  if(provider==='utaten'&&/^[a-z0-9]+$/i.test(id))return parseUtatenLyrics(await request(`https://utaten.com/lyric/${id}/`,provider,signal),record)
  let original = '', translation = '', romaji = ''
  // 辅助轨解析失败时仍允许导入原文，同时明确提示未导入的来源内容。
  const sourceWarnings=[]
  if (provider === 'netease' && /^\d+$/.test(id)) {
    const data = await json(endpoint('https://music.163.com/api/song/lyric', { id, lv: -1, tv: -1, rv: -1 }), provider, signal, request)
    if (data.code !== 200) throw new Error('网易云音乐歌词暂不可用。')
    original = data.lrc?.lyric || ''; translation = data.tlyric?.lyric || ''; romaji = data.romalrc?.lyric || ''
  } else if (provider === 'qq' && /^[a-z0-9]{8,32}$/i.test(id)) {
    const param={songMID:id,...(Number.isSafeInteger(record.songId)&&record.songId>0?{songID:record.songId}:{}),crypt:0,trans:1,roma:1,qrc:0,interval:0,type:-1}
    const data=await json(endpoint('https://u.y.qq.com/cgi-bin/musicu.fcg',{data:JSON.stringify({comm:{ct:24,cv:0},lyric:{module:'music.musichallSong.PlayLyricInfo',method:'GetPlayLyricInfo',param}})}),provider,signal,request)
    abort(signal)
    if(data.code!==0||data.lyric?.code!==0)throw new Error('QQ 音乐歌词暂不可用，请选择其他版本。')
    const tracks=data.lyric.data||{}
    original=decodeQQTrack(tracks.lyric)
    for(const [key,name]of [['trans','翻译'],['roma','来源注音']]){
      if(!tracks[key])continue
      try{const decoded=decodeQQTrack(tracks[key]);if(key==='trans')translation=cleanQQTranslation(decoded);else romaji=decoded}
      catch{sourceWarnings.push(`QQ 音乐${name}暂未能解析，已保留其他可用歌词轨道。`)}
    }
  } else if (provider === 'kugou' && /^[0-9a-f]{32}$/i.test(id)) {
    const found = await json(endpoint('https://lyrics.kugou.com/search', { ver: 1, man: 'yes', client: 'pc', hash: id }), provider, signal, request)
    const candidates = (found.candidates || []).filter(item => /^\d+$/.test(String(item.id)) && /^[a-z0-9]+$/i.test(item.accesskey || ''))
    // 优先时长最接近的候选；仍由导入预览确认是否是正确版本。
    const candidate = candidates.sort((a, b) => Math.abs(Number(a.duration) / 1000 - record.duration) - Math.abs(Number(b.duration) / 1000 - record.duration))[0]
    if (!candidate) throw new Error('酷狗音乐没有返回可用歌词。')
    const data = await json(endpoint('https://lyrics.kugou.com/download', { ver: 1, client: 'pc', id: candidate.id, accesskey: candidate.accesskey, fmt: 'lrc', charset: 'utf8' }), provider, signal, request)
    original = decodeBase64(data.content)
  } else if (provider === 'kuwo' && /^\d+$/.test(id)) {
    const data = await json(endpoint('https://m.kuwo.cn/newh5/singles/songinfoandlrc', { musicId: id }), provider, signal, request)
    if (!Array.isArray(data.data?.lrclist)) throw new Error('酷我音乐没有返回可用歌词。')
    original = data.data.lrclist.filter(row => Number.isFinite(Number(row.time)) && Number(row.time) >= 0).map(row => `${timestamp(Math.round(Number(row.time) * 1000))}${String(row.lineLyric || '').replace(/\r?\n/g, ' ')}`).join('\n')
  } else throw new Error('当前来源或歌曲标识不可用。')
  abort(signal)
  // 旧返回仅统计平台原始轨道行数；预览会过滤署名，并解析混排的翻译行。
  // return { ...record, ...mergePlatformTracks(original, translation, romaji) }
  // QQ 的 LRC 可能截断为百分之一秒，QRC 则精确到毫秒；其他平台保持严格匹配。
  // const merged = mergePlatformTracks(original, translation, romaji)
  const merged = mergePlatformTracks(original, translation, romaji,provider==='qq'?{timeTolerance:10}:{})
  const lines = parseTimedLyrics(merged.lyrics, record.title, record.artist)
  if (!lines.length) throw new Error('这份歌词没有可导入的正文，请选择其他版本。')
  // 按最终预览统计，酷我/酷狗混排 LRC 的译文也与实际导入数量保持一致。
  // 原返回没有辅助轨格式提示；只在确实发生解析失败时携带说明。
  // return { ...record, ...merged, trackSummary: { original: lines.length, translation: lines.filter(line => line.translation).length, romaji: lines.filter(line => line.romaji).length, unmatched: merged.trackSummary.unmatched } }
  return { ...record, ...merged, ...(sourceWarnings.length?{sourceWarnings}:{}), trackSummary: { original: lines.length, translation: lines.filter(line => line.translation).length, romaji: lines.filter(line => line.romaji).length, unmatched: merged.trackSummary.unmatched } }
}
