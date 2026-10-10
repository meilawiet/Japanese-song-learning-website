import { toHiragana } from 'wanakana'

// 字母无法可靠区分英语与日语罗马音，因此提供明确的逐词输入方式。
export function defaultManualReadingMode(token, reading) {
  return /^[\p{Script=Latin}\d\s\p{P}]+$/u.test(token.surface || '')
    || /[a-z]/i.test(reading || '') ? 'literal' : 'romaji'
}

// 原保存逻辑统一调用 toHiragana；现在原样模式不转换任何语言，留空仍保留。
export function prepareManualReading(value, mode) {
  const text = String(value ?? '').trim()
  return mode === 'literal' ? text : toHiragana(text)
}
