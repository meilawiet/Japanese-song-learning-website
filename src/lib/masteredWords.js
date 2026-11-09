import { toHiragana } from 'wanakana'
import { validSongLanguage } from './songLanguage.js'

const STORAGE_KEY = 'uta-mastered-words-v1'
const KANA = /^[\p{Script=Hiragana}ー]+$/u
const clean = (value, limit = 100) => typeof value === 'string' ? value.trim().slice(0, limit) : ''
const written = value => value.normalize('NFKC').toLowerCase()
const kana = value => {
  const reading = toHiragana(written(clean(value)), { passRomaji: true })
  return KANA.test(reading) ? reading : ''
}

// 只在注音词界和原文一致时补齐旧词条读音。相同词面出现多个读音时保留未知。
export function wordWithReading(word, tokens = []) {
  if (kana(word?.reading) || !word?.surface) return word
  const candidates = new Set()
  for (let start = 0; start < tokens.length; start++) {
    let surface = '', reading = ''
    for (let end = start; end < tokens.length; end++) {
      const token = tokens[end]
      const part = kana(token.reading)
      if (!part || !token.surface) break
      surface += token.surface
      if (!word.surface.startsWith(surface)) break
      reading += part
      if (surface === word.surface) { candidates.add(reading); break }
    }
  }
  return candidates.size === 1 ? { ...word, reading: [...candidates][0] } : word
}

export function describeMasteredWord(word, language) {
  const surface = clean(word?.surface)
  if (!surface || !validSongLanguage(language)) return null
  const reading = language === 'ja' ? kana(word.reading) || kana(surface) : ''
  return { surface, reading, dictionary_form: clean(word.dictionary_form), meaning: clean(word.meaning, 260), language }
}

export const masteredWordKey = word => JSON.stringify([word.language, written(word.surface), word.reading, written(word.dictionary_form)])

// 词面相同但读音不同的词分别管理。有可信原形时，也识别同词的不同活用。
function sameWord(left, right) {
  const surface = written(left.surface), otherSurface = written(right.surface)
  const lemma = written(left.dictionary_form), otherLemma = written(right.dictionary_form)
  if (left.language !== right.language || (lemma && otherLemma && lemma !== otherLemma)) return false
  if (surface === otherSurface) return !left.reading || !right.reading || left.reading === right.reading
  if ((lemma || surface) !== (otherLemma || otherSurface)) return false
  if (!left.reading || !right.reading) return true
  // 活用时去掉写法中变动的假名尾缀，再比较读音；原形读音须匹配活用词干。
  const stem = (form, reading, base) => {
    let index = 0
    while (index < form.length && form[index] === base[index]) index++
    const suffix = kana(form.slice(index))
    return index && suffix && reading.endsWith(suffix) ? reading.slice(0, -suffix.length) : ''
  }
  const base = lemma || otherLemma
  const leftStem = stem(surface, left.reading, base), rightStem = stem(otherSurface, right.reading, base)
  if (leftStem && rightStem) return leftStem === rightStem
  return (surface === base && rightStem && left.reading.startsWith(rightStem))
    || (otherSurface === base && leftStem && right.reading.startsWith(leftStem))
    || left.reading === right.reading
}

export function isMasteredWord(words, word, language) {
  if (!words.length) return false
  const entry = describeMasteredWord(word, language)
  return Boolean(entry && words.some(saved => sameWord(saved, entry)))
}

export function readMasteredWords(storage) {
  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY))
    if (Array.isArray(data)) return data.map(word => describeMasteredWord(word, word?.language)).filter(Boolean)
  } catch { /* 损坏或缺失的本机数据按空列表显示。 */ }
  return []
}

export function saveMasteredWords(storage, words) {
  storage.setItem(STORAGE_KEY, JSON.stringify(words))
}

const japaneseOrder = new Intl.Collator('ja')
export function sortedMasteredWords(words) {
  return [...words].sort((left, right) =>
    Number(!left.reading) - Number(!right.reading)
    || japaneseOrder.compare(left.reading || left.surface, right.reading || right.surface)
    || japaneseOrder.compare(left.surface, right.surface))
}

// 每次只把目标句相关的已掌握词送给 AI。词面之外也参考本地分词的原形。
export function masteredWordsForLine(words, language, text, tokens = []) {
  if (!words.length) return []
  const source = written(text)
  const forms = new Set(tokens.flatMap(token => [clean(token.surface), clean(token.dictionary_form)].filter(Boolean).map(written)))
  return words.filter(word => word.language === language && [word.surface, word.dictionary_form].some(value => {
    const form = written(value)
    return form && (source.includes(form) || forms.has(form))
  })).slice(-24).map(({surface, reading, dictionary_form}) => ({surface, reading, dictionary_form}))
}
