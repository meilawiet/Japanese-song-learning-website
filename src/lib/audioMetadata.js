// 优先读取 MP3 的 ID3 歌名与歌手；其他格式或无标签文件用文件名推断。
function textFromFrame(bytes) {
  if (!bytes.length) return ''
  const encoding = bytes[0]
  const body = bytes.slice(1)
  try {
    if (encoding === 1 || encoding === 2) {
      const littleEndian = encoding === 1 && body[0] === 0xff && body[1] === 0xfe
      const offset = encoding === 1 && (body[0] === 0xff || body[0] === 0xfe) ? 2 : 0
      return new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be').decode(body.slice(offset)).replace(/\0/g, '').trim()
    }
    return new TextDecoder(encoding === 3 ? 'utf-8' : 'iso-8859-1').decode(body).replace(/\0/g, '').trim()
  } catch { return '' }
}

function readId3(bytes) {
  if (String.fromCharCode(...bytes.slice(0, 3)) !== 'ID3' || ![3, 4].includes(bytes[3])) return {}
  const version = bytes[3]
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
  const result = {}
  for (let offset = 10; offset + 10 <= Math.min(bytes.length, size + 10);) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4))
    if (!/^[A-Z0-9]{4}$/.test(id)) break
    const length = version === 4 ? ((bytes[offset + 4] & 0x7f) << 21) | ((bytes[offset + 5] & 0x7f) << 14) | ((bytes[offset + 6] & 0x7f) << 7) | (bytes[offset + 7] & 0x7f)
      : (bytes[offset + 4] * 0x1000000 + bytes[offset + 5] * 0x10000 + bytes[offset + 6] * 0x100 + bytes[offset + 7])
    if (!length || offset + 10 + length > bytes.length) break
    if (id === 'TIT2') result.title = textFromFrame(bytes.slice(offset + 10, offset + 10 + length))
    if (id === 'TPE1') result.artist = textFromFrame(bytes.slice(offset + 10, offset + 10 + length))
    offset += 10 + length
    if (result.title && result.artist) break
  }
  return result
}

export function inferMetadataFromFilename(filename) {
  const base = String(filename || '').replace(/\.[^.]+$/, '').replace(/^\s*\d{1,3}[. _-]+/, '').replace(/[_]+/g, ' ').trim()
  const parts = base.split(/\s+[-–—]\s+/)
  // 常见命名为“歌手 - 歌名”；未分隔时把完整文件名视为歌名。
  return parts.length >= 2 ? { title: parts.slice(1).join(' - ').trim(), artist: parts[0].trim() }
    : { title: base, artist: '' }
}

export async function inferAudioMetadata(file) {
  const fallback = inferMetadataFromFilename(file?.name)
  if (!file || !/\.mp3$/i.test(file.name)) return fallback
  try {
    // 部分 MP3 把较大的封面帧放在歌名之前，最多读取前 4 MB 标签数据。
    const bytes = new Uint8Array(await file.slice(0, 4 * 1024 * 1024).arrayBuffer())
    const tag = readId3(bytes)
    return { title: tag.title || fallback.title, artist: tag.artist || fallback.artist }
  } catch { return fallback }
}
