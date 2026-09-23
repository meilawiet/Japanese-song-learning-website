import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const sourceDirectory = join(process.cwd(), 'geci')
const audioDirectory = join(process.cwd(), 'song')
const outputDirectory = join(process.cwd(), 'src', 'data')
const outputFile = join(outputDirectory, 'songs.generated.js')
const playableAudioExtensions = new Set(['.mp3', '.m4a', '.ogg', '.wav', '.webm'])

function indexAudioFiles() {
  try {
    return new Map(readdirSync(audioDirectory)
      .filter((file) => playableAudioExtensions.has(extname(file).toLowerCase()))
      .map((file) => [basename(file, extname(file)), file]))
  } catch {
    return new Map()
  }
}

function parseTimestamp(minutes, seconds) { return Number(minutes) * 60 + Number(seconds) }
function cleanMetadata(value) { return value.replace(/\s*\(.+?\)\s*/g, '').trim() }
function timestampKey(seconds) { return Math.round(seconds * 1000) }
function isCreditLine(text) { return /^(?:词|曲|编曲|作词|作曲|中文翻译|翻译|译者|lyrics?|composer|arrangement)\s*[:：]/iu.test(text) }

function parseLrc(buffer, fileName, index, audioFiles) {
  const content = new TextDecoder('gbk').decode(buffer)
  const metadata = Object.fromEntries([...content.matchAll(/^\[(ti|ar|al):(.+)]$/gm)].map(([, key, value]) => [key, value.trim()]))
  const seen = new Set()
  const lines = []
  content.split(/\r?\n/).forEach((sourceLine) => {
    const stamps = [...sourceLine.matchAll(/\[(\d{1,2}):(\d{2}(?:\.\d+)?)\]/g)]
    if (!stamps.length) return
    const text = sourceLine.slice(stamps.at(-1).index + stamps.at(-1)[0].length).trim().replace(/\s+/g, ' ')
    const isJapanese = /[\u3040-\u30ff]/u.test(text)
    const isCredit = /^(?:词|曲|編曲|作詞|作曲|歌|翻译|中文翻译)[:：]/u.test(text)
    if (!text || !isJapanese || isCredit) return
    stamps.forEach(([, minutes, seconds]) => {
      const start = parseTimestamp(minutes, seconds)
      const key = `${start}-${text}`
      if (!seen.has(key)) { seen.add(key); lines.push({ id: lines.length, text, start }) }
    })
  })
  const titleFromFile = basename(fileName, '.lrc').split('-').at(-1)
  return { id: `song-${index + 1}`, sourceFile: fileName, audioFile: audioFiles.get(basename(fileName, '.lrc')) || null, title: cleanMetadata(metadata.ti || titleFromFile), artist: cleanMetadata(metadata.ar || basename(fileName, '.lrc').split('-')[0]), album: metadata.al || '', duration: lines.at(-1)?.start || 0, lines }
}

function parseLrcWithTranslations(buffer, fileName, index, audioFiles) {
  const content = new TextDecoder('gbk').decode(buffer)
  const metadata = Object.fromEntries([...content.matchAll(/^\[(ti|ar|al):(.+)]$/gm)].map(([, key, value]) => [key, value.trim()]))
  const seen = new Set()
  const lyricEntries = []

  content.split(/\r?\n/).forEach((sourceLine) => {
    const stamps = [...sourceLine.matchAll(/\[(\d{1,2}):(\d{2}(?:\.\d+)?)\]/g)]
    if (!stamps.length) return
    const text = sourceLine.slice(stamps.at(-1).index + stamps.at(-1)[0].length).trim().replace(/\s+/g, ' ')
    const isJapanese = /[\u3040-\u30ff]/u.test(text)
    const isChinese = /[\u3400-\u9fff]/u.test(text)
    if (!text || isCreditLine(text)) return
    stamps.forEach(([, minutes, seconds]) => {
      const start = parseTimestamp(minutes, seconds)
      if (isJapanese) {
        const key = `${start}-${text}`
        if (!seen.has(key)) { seen.add(key); lyricEntries.push({ text, start }) }
      } else if (isChinese) {
        // This LRC source puts a translation immediately after the Japanese
        // line it explains, but gives it the next line's timestamp.
        const previousLyric = lyricEntries.at(-1)
        if (previousLyric && !previousLyric.translation) previousLyric.translation = text
      }
    })
  })

  lyricEntries.sort((left, right) => left.start - right.start)
  const lines = lyricEntries.map((line, id) => ({ id, ...line, translation: line.translation || '' }))
  const titleFromFile = basename(fileName, '.lrc').split('-').at(-1)
  return { id: `song-${index + 1}`, sourceFile: fileName, audioFile: audioFiles.get(basename(fileName, '.lrc')) || null, title: cleanMetadata(metadata.ti || titleFromFile), artist: cleanMetadata(metadata.ar || basename(fileName, '.lrc').split('-')[0]), album: metadata.al || '', duration: lines.at(-1)?.start || 0, lines }
}

const lrcFiles = readdirSync(sourceDirectory).filter((file) => file.endsWith('.lrc')).sort((a, b) => a.localeCompare(b, 'zh-CN'))
const audioFiles = indexAudioFiles()
const songs = lrcFiles.map((file, index) => parseLrcWithTranslations(readFileSync(join(sourceDirectory, file)), file, index, audioFiles)).filter((song) => song.lines.length)
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(outputFile, `// This file is generated from /geci by scripts/sync-lyrics.mjs.\n// Do not edit it directly.\nexport const importedSongs = ${JSON.stringify(songs, null, 2)}\n`, 'utf8')
console.log(`已从 geci 同步 ${songs.length} 首歌曲，匹配 ${songs.filter((song) => song.audioFile).length} 个音频，生成 ${outputFile}`)
