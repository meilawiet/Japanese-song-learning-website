// 日语等级只影响教学详略，不影响原文、注音校对或其他语言。
export const JAPANESE_LEVELS = [
  {id:'beginner',label:'没学过日语'},
  ...['N5','N4','N3','N2','N1'].map(id=>({id,label:id})),
]
export const validJapaneseLevel = value => JAPANESE_LEVELS.some(level=>level.id===value)
export const normalizeJapaneseLevel = value => validJapaneseLevel(value) ? value : 'beginner'
export const japaneseLevelLabel = value => JAPANESE_LEVELS.find(level=>level.id===normalizeJapaneseLevel(value)).label
const instructions = {
  beginner:'学习者没学过日语。用简明中文先讲整句意思，再拆解必要词语、助词和词序；语法术语第一次出现要解释含义。给关键日语表达可靠的假名读音，不假设认识五十音；不能确定的唱法明确保留不确定性。不要用生僻日语解释日语。',
  N5:'学习者达到N5。以基础词汇和基础句型为起点，说明本句超出基础的词汇、助词用途、动词原形与实际变形，循序说明省略；不要默认已经掌握N4以上内容。',
  N4:'学习者达到N4。简述基础内容，重点解释复杂变形、连接关系、口语缩略和超出N4的表达，说明原形到歌词形式的变化。',
  N3:'学习者达到N3。聚焦句子结构、从句关系、搭配、口语省略和语境含义；重点解释中高级或非常规表达，避免反复讲五十音及初级助词定义。',
  N2:'学习者达到N2。压缩基础释义，重点比较近义表达、语气强弱、隐含主语、省略、修辞及歌词语境；说明直译和意译的差别，不重复基础语法教程。',
  N1:'学习者达到N1。提供精炼而深入的语义与语用分析，着重歧义、修辞、文体、言外之意、特殊搭配及可能的多种解释；不给简单词汇堆砌基础定义，不凭空断言作者意图。',
}
export const japaneseTeachingInstruction = value => instructions[normalizeJapaneseLevel(value)]
