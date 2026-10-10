import { inferMetadataFromFilename } from './audioMetadata.js'
import { isSongHeadingLine } from './songMetadata.js'

export function batchFileId(file) {
  return [file.webkitRelativePath || file.name, file.size, file.lastModified].join('\u0000')
}

function matchKey(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[‐‑‒–—－]/gu, '-').replace(/[\s_]+/gu, ' ').trim()
}

function stemKey(file) {
  return matchKey(file.name.replace(/\.[^.]+$/, ''))
}

function titleKey(entry, isAudio) {
  const inferred = inferMetadataFromFilename(entry.file.name)
  return matchKey(isAudio ? entry.metadata?.title || inferred.title : entry.parsed?.title || inferred.title)
}

function artistKey(entry, isAudio) {
  const artist = isAudio ? entry.metadata?.artist : entry.parsed?.artist
  return artist && artist !== '本地导入' ? matchKey(artist) : ''
}

// Only one-to-one matches are automatic. Keep manual pairings and edited names
// when users add more files, including a manual decision to leave a row unpaired.
export function buildBatchImportRows(audios, lyrics, previousRows = []) {
  const previous = new Map(previousRows.map(row => [row.audioId, row]))
  const availableAudios = new Map(audios.map(entry => [entry.id, entry]))
  const availableLyrics = new Map(lyrics.map(entry => [entry.id, entry]))
  const assigned = new Map()
  const used = new Set()
  for (const audio of audios) {
    const row = previous.get(audio.id)
    if (row?.lyricId && availableLyrics.has(row.lyricId) && !used.has(row.lyricId)) {
      assigned.set(audio.id, row.lyricId)
      used.add(row.lyricId)
    }
  }
  const passes = [
    (entry) => stemKey(entry.file),
    (entry, isAudio) => artistKey(entry, isAudio) ? `${titleKey(entry, isAudio)}\u0000${artistKey(entry, isAudio)}` : '',
    (entry, isAudio) => titleKey(entry, isAudio),
  ]
  for (const [pass, keyFor] of passes.entries()) {
    const audioGroups = new Map(), lyricGroups = new Map()
    function add(groups, key, id) {
      if (key) groups.set(key, [...(groups.get(key) || []), id])
    }
    for (const entry of audios) {
      if (!assigned.has(entry.id) && !previous.get(entry.id)?.manualPair) add(audioGroups, keyFor(entry, true), entry.id)
    }
    for (const entry of lyrics) {
      if (!used.has(entry.id)) add(lyricGroups, keyFor(entry, false), entry.id)
    }
    for (const [key, audioIds] of audioGroups) {
      const lyricIds = lyricGroups.get(key) || []
      if (audioIds.length === 1 && lyricIds.length === 1) {
        if (pass === 2) {
          const audioArtist = artistKey(availableAudios.get(audioIds[0]), true)
          const lyricArtist = artistKey(availableLyrics.get(lyricIds[0]), false)
          if (audioArtist && lyricArtist && audioArtist !== lyricArtist) continue
        }
        assigned.set(audioIds[0], lyricIds[0]); used.add(lyricIds[0])
      }
    }
  }
  return audios.map(audio => {
    const old = previous.get(audio.id)
    const lyricId = assigned.get(audio.id) || ''
    if (old && old.lyricId === lyricId) return { ...old }
    const lyric = availableLyrics.get(lyricId)
    return {
      audioId: audio.id, lyricId, manualPair: false,
      title: lyric?.parsed?.title || audio.metadata?.title || inferMetadataFromFilename(audio.file.name).title,
      artist: lyric?.parsed?.artist !== '本地导入' && lyric?.parsed?.artist || audio.metadata?.artist || '本地导入',
      selected: Boolean(lyric?.parsed && !lyric.error),
    }
  })
}

export function batchRowProblem(row, rows, lyrics) {
  if (!row.lyricId) return '请选择对应的歌词文件'
  const lyric = lyrics.find(entry => entry.id === row.lyricId)
  if (!lyric) return '找不到所选歌词文件'
  if (lyric.error) return lyric.error
  if (!lyric.parsed?.lines?.length) return '歌词中没有可学习的句子'
  if (rows.some(other => other.audioId !== row.audioId && other.lyricId === row.lyricId)) return '这份歌词已与另一首音频配对'
  if (!row.title.trim()) return '请填写歌曲名'
  return ''
}

export function prepareBatchImport(rows, audios, lyrics) {
  const selected = rows.filter(row => row.selected)
  if (!selected.length) throw new Error('请勾选至少一首已配对的歌曲。')
  return selected.map(row => {
    const audio = audios.find(entry => entry.id === row.audioId)
    const error = batchRowProblem(row, rows, lyrics)
    if (!audio || error) throw new Error(`${row.title || '所选歌曲'}：${error || '缺少音频文件'}`)
    const lyric = lyrics.find(entry => entry.id === row.lyricId)
    const title = row.title.trim(), artist = row.artist.trim() || '本地导入'
    const lines = lyric.parsed.lines.filter(line => !isSongHeadingLine(line.text, title, artist))
      .map((line, id) => ({ ...line, id }))
    if (!lines.length) throw new Error(`${title}：没有可学习的歌词句子。`)
    return { parsed: { ...lyric.parsed, title, artist, lines, duration: lines.at(-1).start }, audioFile: audio.file }
  })
}
