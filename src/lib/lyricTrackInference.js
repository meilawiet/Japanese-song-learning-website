import { toHiragana } from 'wanakana'

const kana = text => /[\u3040-\u30ff]/u.test(text)
const han = text => /[\u3400-\u9fff]/u.test(text)
const latin = text => /[A-Za-z]/u.test(text)
const englishWords = new Set(['i', 'me', 'my', 'you', 'your', 'we', 'our', 'us', 'with', 'the', 'and', 'love', 'stay', 'come', 'sing', 'baby', 'forever', 'dream', 'night', 'heart'])

export function looksLikeRomaji(text) {
  const normalized = text.normalize('NFKC').toLowerCase().replace(/[āâ]/gu, 'aa').replace(/[īî]/gu, 'ii').replace(/[ūû]/gu, 'uu').replace(/[ēê]/gu, 'ee').replace(/[ōô]/gu, 'ou')
  const words = normalized.match(/[a-z]+(?:'[a-z]+)*/gu) || []
  // Latin letters alone are not evidence of Japanese romanization. Prefer
  // keeping an English lyric over silently hiding it in an auxiliary track.
  return words.length > 0 && !words.some(word => englishWords.has(word) || /[lq]/u.test(word)
    || /[a-z]/u.test(toHiragana(word)))
}

function likelyChineseTranslation(text) {
  return /[这们吗说让过还没]|今天|明天|昨天|看见|走向|收集|一起|不会|不能|我们|你们|他们/u.test(text)
}

// Infer across timestamp groups before assigning individual tracks. Explicit
// source tracks always win. Ambiguous standalone Han/Latin rows stay original.
export function inferLyricTracks(input) {
  const cues = input.map(cue => ({ ...cue, track: cue.explicitTrack || 'original' }))
  const groups = []
  for (const cue of cues) {
    if (cue.start == null) continue
    let group = groups.find(item => Math.abs(item.start - cue.start) <= 0.05)
    if (!group) { group = { start: cue.start, cues: [] }; groups.push(group) }
    group.cues.push(cue)
  }
  for (const group of groups) {
    const candidates = group.cues.filter(cue => !cue.explicitTrack || cue.explicitTrack === 'original')
    const certain = candidates.filter(cue => kana(cue.text) || latin(cue.text) && !looksLikeRomaji(cue.text))
    group.originals = certain.length ? certain : candidates.length ? [candidates.find(cue => han(cue.text)) || candidates[0]] : []
    for (const cue of group.cues) {
      if (cue.explicitTrack || group.originals.includes(cue)) continue
      cue.track = han(cue.text) ? 'translation' : latin(cue.text) && looksLikeRomaji(cue.text) ? 'romaji' : 'original'
      if (cue.track === 'romaji' && group.originals.length > 1) {
        const japanese = group.originals.filter(item => kana(item.text) || han(item.text))
        if (japanese.length === 1) cue.targetCueId = japanese[0].id
      }
    }
  }
  // Some legacy files stamp the previous line's translation at the following
  // original's timestamp. Only activate this mode with paired source evidence.
  let previous = null, offsetTranslations = false
  const explicit = cues.some(cue => cue.explicitTrack)
  for (const cue of cues) {
    if (cue.track === 'original') previous = cue
    else if (!explicit && cue.track === 'translation' && previous && cue.start > previous.start + 0.05
      && groups.some(group => Math.abs(group.start - cue.start) <= 0.05 && group.originals.length)) offsetTranslations = true
  }
  previous = null
  for (const cue of cues) {
    if (!cue.explicitTrack && offsetTranslations && previous && cue.track === 'original'
      && han(cue.text) && !kana(cue.text) && !latin(cue.text) && likelyChineseTranslation(cue.text)) {
      const group = groups.find(item => item.cues.includes(cue))
      if (group?.cues.length === 1) cue.track = 'translation'
    }
    if (cue.track === 'original') previous = cue
    else if (cue.track === 'translation' && !cue.explicitTrack && offsetTranslations && previous
      && Math.abs(previous.start - cue.start) > 0.05) cue.attachToPrevious = true
  }
  return cues
}
