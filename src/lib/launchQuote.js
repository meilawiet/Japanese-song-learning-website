// 启动引句只使用真实歌曲的歌词正文；原创演示曲和空行不参与抽取。
export function chooseLaunchQuote(songs, random = Math.random) {
  const candidates = (Array.isArray(songs) ? songs : []).flatMap(song =>
    song && !song.isDemo && Array.isArray(song.lines) ? song.lines.flatMap(line =>
      typeof line?.text === 'string' && line.text.trim()
        ? [{ text: line.text.trim(), title: typeof song.title === 'string' ? song.title.trim() : '', ...(typeof song.id==='string'?{songId:song.id}:{}) }]
        : []) : [])
  if (!candidates.length) return null
  return candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))]
}

// 只使用本机已保存的封面，不让启动页为远程URL发起下载；缺失和显式默认均回退原图。
export function savedLaunchArtwork(artwork) {
  const url=artwork?.artworkUrl
  return typeof url==='string'&&/^(?:data:image\/|blob:)/i.test(url)?url:null
}
