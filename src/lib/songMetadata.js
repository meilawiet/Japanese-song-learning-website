const HEADING_LABEL = /^(?:歌名|歌曲名|曲名|歌曲|歌手|歌唱|演唱|アーティスト|artist|singer|vocal|title|song)\s*[:：]/iu
const CREDIT_LABEL = /^(?:词|曲|编曲|作词|作曲|編曲|作詞|中文翻译|翻译|譯者|译者|lyrics?|composer|arrangement)\s*[:：]/iu

function compactHeading(value) {
  return String(value || '').normalize('NFKC')
    .replace(/\([^)]*\)|（[^）]*）|【[^】]*】|\[[^\]]*\]/gu, '')
    .replace(/\s+/gu, '')
    .replace(/[‐‑‒–—－]/gu, '-')
    .toLocaleLowerCase()
}

export function isCreditLine(text) {
  return CREDIT_LABEL.test(String(text || '').trim())
}

export function isSongHeadingLine(text, title, artist) {
  if (HEADING_LABEL.test(String(text || '').trim())) return true
  const heading = compactHeading(text)
  const titleKey = compactHeading(title)
  const artistKey = compactHeading(artist)
  if (!titleKey || !artistKey) return false
  return ['-', '·', '・', '/', '|', '｜'].some((separator) =>
    heading === `${titleKey}${separator}${artistKey}` || heading === `${artistKey}${separator}${titleKey}`)
}

export function withoutSongHeadingLines(song) {
  return {
    ...song,
    lines: song.lines
      .filter((line) => !isSongHeadingLine(line.text, song.title, song.artist))
      .map((line, index) => ({ ...line, displayNumber: index + 1 })),
  }
}
