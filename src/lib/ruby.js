export function hasKanji(value) {
  return [...value].some((char) => (char >= '\u3400' && char <= '\u9fff') || char === '々')
}

function isKana(char) {
  return (char >= 'ぁ' && char <= 'ゖ') || (char >= 'ァ' && char <= 'ヶ') || char === 'ー'
}

export function splitRuby(surface, reading) {
  if (!hasKanji(surface) || !reading) return { base: surface, ruby: '', suffix: '' }
  let suffixLength = 0
  for (let index = 1; index <= Math.min(surface.length, reading.length); index += 1) {
    if (surface.at(-index) === reading.at(-index) && isKana(surface.at(-index))) suffixLength = index
    else break
  }
  return {
    base: suffixLength ? surface.slice(0, -suffixLength) : surface,
    ruby: suffixLength ? reading.slice(0, -suffixLength) : reading,
    suffix: suffixLength ? surface.slice(-suffixLength) : '',
  }
}

export function correctionKey(songId, lineId, tokenIndex) {
  return `${songId}:${lineId}:${tokenIndex}`
}
