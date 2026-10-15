// 语种仅根据歌词原文识别；翻译、歌手名和来源发音标注不参与统计。
export const SONG_LANGUAGES = [['zh', '中文'], ['ja', '日语'], ['ko', '韩语'], ['other', '其他语言']]
export const validSongLanguage = value => SONG_LANGUAGES.some(([id]) => id === value)
export function detectSongLanguage(lines = []) {
  const text = lines.map(line => typeof line === 'string' ? line : line.text || '').join('\n')
  const count = pattern => (text.match(pattern) || []).length
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)
  const hangul = count(/\p{Script=Hangul}/gu)
  const han = count(/\p{Script=Han}/gu)
  const letters = count(/\p{L}/gu)
  // 片段语言不能仅凭一次出现决定；韩文和日文按各自字符数量比较。
  if (hangul && hangul > kana && hangul >= letters * .15) return {language:'ko', uncertain:false}
  if (kana && kana >= letters * .05) return {language:'ja', uncertain:false}
  // 纯汉字可能是中文，也可能是日语标题或短句，默认中文并明确允许确认。
  if (han && han >= letters * .35) return {language:'zh', uncertain:true}
  return {language:'other', uncertain:letters === 0}
}
export const songLanguage = song => validSongLanguage(song?.language) ? song.language : detectSongLanguage(song?.lines).language
export const languageName = language => SONG_LANGUAGES.find(([id]) => id === language)?.[1] || '其他语言'
export function songReadingStyle(language, preferred = 'hiragana') {
  if (language === 'zh') return 'none'
  if (language !== 'ja') return preferred === 'romaji' ? 'romaji' : 'none'
  return ['none','hiragana','romaji','both'].includes(preferred) ? preferred : 'hiragana'
}

// 非日语仅按自然词界排版，不调用日语词典；中文默认整句，词界由用户自行指定。
export function literalAnnotation(line, language) {
  const parts = language === 'zh' ? [line.text] : line.text.match(/[\p{L}\p{M}\p{N}]+(?:['’ʼ\-‐‑][\p{L}\p{M}\p{N}]+)*|[^\p{L}\p{M}\p{N}]+/gu) || []
  return {id:line.id, text:line.text, language, tokens:parts.filter(Boolean).map((surface,index) => ({index,surface,reading:'',is_symbol:!/[\p{L}\p{N}]/u.test(surface),part_of_speech:'',dictionary_form:surface,needs_review:false}))}
}
export function annotationForLanguage(line, language, cached, corrections = {}, songId = '') {
  if (language === 'ja') return cached
  // 已有人工读音或自定义边界保持原索引，不能因切换语种丢失人工内容。
  const hasManual = cached?.tokens?.some(token => token.segmentation_locked || Object.hasOwn(corrections,`${songId}:${line.id}:${token.index}`))
  // 原返回 {...cached,language}；旧日语派生词面不能替代非日语的真实原文。
  return hasManual ? {...cached, language, tokens:cached.tokens.map(token=>({...token,display_surface:token.surface}))} : literalAnnotation(line,language)
}
export function literalReading(token, corrections, songId, lineId) {
  return corrections?.[`${songId}:${lineId}:${token.index}`] ?? token.manual_group_reading ?? ''
}

// 来源无法可靠按词对应时保持完整一行，不猜测韩语音节与原词的对应关系。
export function literalReadingRows(tokens, corrections, songId, lineId, source, options = {}) {
  return {
    readings: options.showManualReadings === false ? [] : tokens.map(token => literalReading(token,corrections,songId,lineId)),
    source: options.showSourceReadings === false ? '' : String(source || '').trim(),
  }
}
