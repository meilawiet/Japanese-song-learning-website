const RECENT_SONGS_KEY = 'uta-recent-songs-v1'

export function readRecentSongIds(storage, previousId) {
  try {
    const saved = JSON.parse(storage.getItem(RECENT_SONGS_KEY))
    if (Array.isArray(saved)) return [...new Set(saved.filter(id => typeof id === 'string' && id))]
  } catch {
    // 旧版本只有最后打开的一首，升级时从这首开始记录。
  }
  return previousId ? [previousId] : []
}

export function rememberRecentSong(ids, songId) {
  return ids[0] === songId ? ids : [songId, ...ids.filter(id => id !== songId)]
}

export function saveRecentSongIds(storage, ids) {
  try {
    storage.setItem(RECENT_SONGS_KEY, JSON.stringify(ids))
  } catch {
    // 本机存储暂不可用时，仍可在当前会话展示最近歌曲。
  }
}

// 先排除已不在库中的歌曲，再从历史中取前三首。
export function recentLibrarySongs(songs, ids) {
  const byId = new Map(songs.filter(song => !song.isDemo).map(song => [song.id, song]))
  return ids.map(id => byId.get(id)).filter(Boolean).slice(0, 3)
}
