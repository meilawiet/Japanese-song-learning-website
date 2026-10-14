import kuromoji from '@faanau/kuromoji'
import { toHiragana } from 'wanakana'
import { hasKanji, splitRuby } from './ruby'
import { splitKanjiOkuriganaTokens } from './defaultSegmentation.js'

let tokenizerPromise

// 首次需要从 APK 内解压日语词典；之后在同一应用进程中复用分析器。
function getTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      const path = `${import.meta.env.BASE_URL}uta-dict/`
      kuromoji.builder({ dicPath: path }).build((error, tokenizer) => {
        if (error || !tokenizer) reject(error || new Error('手机词典加载失败。'))
        else resolve(tokenizer)
      })
    }).catch((error) => { tokenizerPromise = null; throw error })
  }
  return tokenizerPromise
}

function tokenFor(surface, index, source = null) {
  const isSymbol = !/[\p{L}\p{N}]/u.test(surface)
  const rawReading = source?.reading && source.reading !== '*' ? source.reading : ''
  const reading = isSymbol ? '' : toHiragana(rawReading || surface)
  const { base, ruby, suffix } = splitRuby(surface, reading)
  const dictionaryForm = source?.basic_form && source.basic_form !== '*' ? source.basic_form : surface
  return {
    index, surface, reading, is_symbol: isSymbol, base, ruby, suffix,
    part_of_speech: [source?.pos, source?.pos_detail_1].filter((part) => part && part !== '*').join('・') || '未分类',
    dictionary_form: dictionaryForm, normalized_form: dictionaryForm,
    inflection_type: source?.conjugated_type && source.conjugated_type !== '*' ? source.conjugated_type : '无活用',
    inflection_form: source?.conjugated_form && source.conjugated_form !== '*' ? source.conjugated_form : '基本形',
    meaning: null, examples: [], needs_review: hasKanji(surface) && !rawReading,
  }
}

// 保留分词器略过的空格等字符，确保缓存里的词面拼接后仍与原歌词完全一致。
export async function annotateLinesOffline(lines) {
  const tokenizer = await getTokenizer()
  return lines.map(({ id, text }) => {
    const tokens = []
    let cursor = 0
    for (const source of tokenizer.tokenize(text)) {
      const surface = source.surface_form
      const position = text.indexOf(surface, cursor)
      if (position < 0) throw new Error(`离线注音与歌词不匹配：第 ${id} 句。`)
      if (position > cursor) tokens.push(tokenFor(text.slice(cursor, position), tokens.length))
      tokens.push(tokenFor(surface, tokens.length, source))
      cursor = position + surface.length
    }
    if (cursor < text.length) tokens.push(tokenFor(text.slice(cursor), tokens.length))
    if (tokens.map((token) => token.surface).join('') !== text) throw new Error(`离线注音与歌词不匹配：第 ${id} 句。`)
    // 原返回 { id, tokens }；新导入/重新注音优先采用“抱｜きしめ”等汉字与送假名词界。
    return { id, tokens: splitKanjiOkuriganaTokens(tokens) }
  })
}
