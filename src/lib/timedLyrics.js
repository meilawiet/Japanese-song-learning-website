import { isCreditLine, isSongHeadingLine } from './songMetadata.js'

// 时间戳下第一条原文、后续译文/罗马音分别保存；保留纯汉字和纯英文原文。
// 自动识别无法证明汉字属于哪种语言，用户仍可在导入预览中调整。
export function parseTimedLyrics(content, title, artist) {
  const entries = []
  const groups = new Map()
  for (const source of content.split(/\r?\n/)) {
    const stamps = [...source.matchAll(/\[(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)\]/g)]
    if (!stamps.length) continue
    const last = stamps.at(-1)
    // 原来只有纯文本；平台分轨合并使用显式标记，不猜测辅助轨语言。
    const raw = source.slice(last.index + last[0].length).replace(/\s+/g, ' ').trim()
    const role = raw.startsWith('[uta-translation]') ? 'translation' : raw.startsWith('[uta-romaji]') ? 'romaji' : null
    const text = role ? raw.replace(/^\[uta-(?:translation|romaji)\]/, '') : raw
    if (!text) continue
    for (const [, minutes, seconds] of stamps) {
      const entry = { start:Number(minutes)*60+Number(seconds), text, role, excluded:!role && (isCreditLine(text)||isSongHeadingLine(text,title,artist)) }
      entries.push(entry)
      if (!groups.has(entry.start)) groups.set(entry.start, [])
      groups.get(entry.start).push(entry)
    }
  }
  const kana = (text) => /[\u3040-\u30ff]/u.test(text)
  const han = (text) => /[\u3400-\u9fff]/u.test(text)
  // 有显式轨道时不启用旧文件的译文偏移猜测，避免辅助轨的语言影响原文。
  const explicitTracks = entries.some(entry => entry.role)
  // 兼容旧文件将译文标为下一句时间戳的布局：译文在同时间戳原文之前出现。
  let offsetTranslations = !explicitTracks && [...groups.values()].some((group) => {
    const firstKana = group.findIndex((entry) => !entry.excluded && !entry.role && kana(entry.text))
    return firstKana > 0 && group.slice(0, firstKana).some((entry) => !entry.excluded && han(entry.text))
  })
  // 多时间戳原文后跟译文时，译文也可能使用先前某句的时间；保留旧格式兼容性。
  let previousKanaTime = null
  for (const entry of entries) {
    if (explicitTracks) break
    // 显式辅助轨不参与旧版偏移翻译探测。
    if (entry.role) continue
    if (kana(entry.text) && !entry.excluded) previousKanaTime = entry.start
    else if (han(entry.text) && !entry.excluded && previousKanaTime != null && previousKanaTime !== entry.start
      && groups.get(entry.start).some((item) => kana(item.text) && !item.excluded)) offsetTranslations = true
  }
  const originals = new Map()
  for (const [start, group] of groups) {
    // 原条件仅排除署名；辅助轨不作为原文候选。
    const candidates = group.filter((entry) => !entry.excluded && !entry.role)
    // 作词作曲行的独立罗马音不作为歌词导入。
    if (group.some((entry) => entry.excluded) && !candidates.some((entry) => kana(entry.text)||han(entry.text))) continue
    // 没有假名时使用第一行作原文，也保留英文原文＋中文译文的布局。
    const original = candidates.find((entry) => kana(entry.text)) || candidates[0]
    if (!original) continue
    const isOffsetTranslation = offsetTranslations && !kana(original.text) && candidates.length === 1 && han(original.text)
    if (!isOffsetTranslation) originals.set(start, original)
  }
  const lines = []
  const byTime = new Map()
  let previous = null
  for (const entry of entries) {
    if (entry.excluded) continue
    if (entry.role) {
      const target = byTime.get(entry.start)
      if (target) target[entry.role] = entry.text
      continue
    }
    const original = originals.get(entry.start)
    if (entry === original) {
      const line = { start:entry.start, text:entry.text, translation:'' }
      lines.push(line); byTime.set(entry.start, line); previous = line
    } else if (original && entry.text === original.text) {
      // 重复时间戳原文去重，不改写前面的译文。
      continue
    } else if (kana(entry.text)) {
      // 同时刻的多句日文仍是独立原文，不误归入翻译；相同原文已在前面去重。
      const line = { start:entry.start, text:entry.text, translation:'' }
      if (!lines.some((item) => item.start === line.start && item.text === line.text)) {
        lines.push(line); byTime.set(entry.start, line); previous = line
      }
    } else if (han(entry.text)) {
      const target = offsetTranslations ? previous : byTime.get(entry.start) || previous
      if (target && !target.translation) target.translation = entry.text
    } else if (/[a-z]/iu.test(entry.text)) {
      // 罗马音只关联同时间戳原文，不跨句误配；英文独立歌词已作为原文保留。
      const target = byTime.get(entry.start)
      if (target && !target.romaji) target.romaji = entry.text
    }
  }
  return lines.sort((a,b) => a.start-b.start).map((line,id) => ({ id,...line }))
}
