import {Sparkles} from 'lucide-react'
import {japaneseLevelLabel} from '../lib/japaneseLevel'
import {sentenceLessonPoints,splitRepeatedSentenceExpressions} from '../lib/sentenceAnalysis'
import {isMasteredWord,wordWithReading} from '../lib/masteredWords.js'
import {MasteredWordButton} from './MasteredWords'
import {ankiGrammar,ankiWord,isAnkiVocabulary} from '../lib/ankiCard'

// 歌词原文已显示在解析上方，操作及对应关系由父层统一管理。
export default function SentenceAnalysis({explanation,id,line,entry,stale=false,currentLevel='beginner',teachingMode,earlierExpressions=[],masteredWords=[],wordTokens,onMasterWord,onAddAnki,busy=false,onDelete,onRegenerate}) {
  // 导入跨端备份时扩展字段可能来自旧客户端；只显示有效文字，不能让异常字段导致白屏。
  const points=value=>(Array.isArray(value)?value:[]).filter(item=>typeof item==='string'&&item.trim())
  const expressionNotes=points(explanation.expression_notes),learningFocus=points(explanation.learning_focus)
  const usageNote=typeof explanation.usage_note==='string'?explanation.usage_note:''
  const everydayExample=typeof explanation.everyday_example?.sentence==='string'&&typeof explanation.everyday_example?.meaning==='string'?explanation.everyday_example:null
  const original = sentenceLessonPoints(explanation)
  // 先分出完全重复的词，再应用简略模式的名额，让新表达优先显示。
  // 已掌握词只从展示中过滤，移出后可立即恢复仍在缓存里的讲解。
  const language=entry?.language||'ja'
  const availableWords=original.vocabulary.filter(word=>word?.surface&&!isMasteredWord(masteredWords,wordWithReading(word,wordTokens),language))
  const {fresh,repeated}=splitRepeatedSentenceExpressions(availableWords,earlierExpressions)
  const {vocabulary,grammar}=sentenceLessonPoints({vocabulary:fresh,grammar:original.grammar},teachingMode)
  const repeatedWords = teachingMode==='concise' ? repeated.slice(0,2-vocabulary.length) : repeated
  const renderWords = words => <dl>{words.map((item,index)=><div key={`${item.surface}-${index}`}>
    <dt><span className="mastered-word-label">{item.surface}{onMasterWord&&<MasteredWordButton word={item} onClick={()=>onMasterWord(wordWithReading(item,wordTokens),language)}/>}</span>
      {typeof item.reading==='string'&&item.reading&&<span className="sentence-word-reading" lang="ja">{item.reading}</span>}
    </dt><dd>
      {/* 词组整体展示，词性和句中用法随对应词条进入 Anki。 */}
      {item.kind==='phrase'||typeof item.part_of_speech==='string'&&item.part_of_speech?<small className="sentence-word-type">{[item.kind==='phrase'?'固定搭配':item.part_of_speech,item.verb_class,item.transitivity].filter(value=>typeof value==='string'&&value).join(' · ')}</small>:null}
      {item.meaning}{typeof item.dictionary_form==='string'&&item.dictionary_form&&item.dictionary_form!==item.surface&&<p>原形：<span lang="ja">{item.dictionary_form}</span></p>}{typeof item.usage==='string'&&item.usage&&<p>{typeof item.form==='string'&&item.form?`${item.form} · `:'用法：'}{item.usage}</p>}
      {onAddAnki&&isAnkiVocabulary(line,item)&&<button className="sentence-add-anki" type="button" onClick={()=>onAddAnki(ankiWord(item),line)}>加入 Anki</button>}
    </dd>
  </div>)}</dl>
  // 原独立栏仅保留给旧界面；详细模式把已有补充资料收进语法与语境。
  const supplement=entry?.language==='ja'&&(expressionNotes.length>0||usageNote||learningFocus.length>0||explanation.pronunciation_tip)
  const supplementalContent=supplement&&<>
    {expressionNotes.length>0&&<details className="sentence-analysis-section sentence-expression-notes"><summary>歌词表达特点</summary><ul>{expressionNotes.map((point,index)=><li key={index}>{point}</li>)}</ul></details>}
    {usageNote&&<div className="sentence-analysis-section"><h4>日常使用建议</h4><p>{usageNote}</p>{everydayExample?.sentence&&<div className="sentence-everyday-example"><h4>日常示例（非歌词原文）</h4><p lang="ja">{everydayExample.sentence}</p><p>{everydayExample.meaning}</p></div>}</div>}
    {learningFocus.length>0&&<div className="sentence-analysis-section"><h4>学习重点</h4><ul>{learningFocus.map((point,index)=><li key={index}>{point}</li>)}</ul></div>}
  </>
  return <section className={onMasterWord?'sentence-inline-analysis has-mastery':'sentence-inline-analysis'} id={id} aria-label="整句解析" onClick={event=>event.stopPropagation()}>
    <h3><Sparkles size={14}/>整句解析</h3>
    {/* {line&&<p className="sentence-analysis-source">对应歌词：{line.text}</p>} */}
    {entry?.language==='ja'&&<p className="sentence-analysis-level">解析水平：{entry.japaneseLevel?japaneseLevelLabel(entry.japaneseLevel):'旧版未记录'}；当前水平：{japaneseLevelLabel(currentLevel)}</p>}
    {/* 原提示仅包含原文/等级：此解析尚未按当前原文校验规则或日语水平生成，可保留查看，或重新生成。 */}
    {stale&&<p className="sentence-analysis-warning" role="status">此解析尚未按当前原文校验规则、日语水平或歌词讲解规则生成，可保留查看，或手动重新生成。</p>}
    <div className="sentence-analysis-section"><h4>整句意思</h4><p>{explanation.meaning}</p></div>
    {/* 原词汇只显示meaning；新增常规读音、原形与用法，旧记录仍可直接查看。 */}
    {/* {explanation.vocabulary?.length>0&&<div className="sentence-analysis-section"><h4>关键表达</h4><dl>{explanation.vocabulary.map((item,index)=><div key={`${item.surface}-${index}`}><dt>{item.surface}</dt><dd>{item.meaning}</dd></div>)}</dl></div>} */}
    {(vocabulary.length>0||repeatedWords.length>0)&&<div className="sentence-analysis-section"><h4>单词</h4>
      {vocabulary.length>0&&renderWords(vocabulary)}
      {repeatedWords.length>0&&<details className="sentence-expression-notes"><summary>本曲前面已讲过（{repeatedWords.length}）</summary>{renderWords(repeatedWords)}</details>}
    </div>}
    {(grammar.length>0||teachingMode==='detailed'&&supplement)&&<div className="sentence-analysis-section"><h4>语法</h4>
      {grammar.length>0&&<ul>{grammar.map((point,index)=><li key={index}>{point}
        {/* 每条语法独立打开预览，原句作为卡片语境。 */}
        {onAddAnki&&line&&typeof point==='string'&&point.trim()&&<button className="sentence-add-anki" type="button" onClick={()=>onAddAnki(ankiGrammar(point,line.id),line)}>加入 Anki</button>}
      </li>)}</ul>}
      {teachingMode==='detailed'&&supplement&&<details className="sentence-expression-notes"><summary>补充说明</summary>{supplementalContent}{explanation.pronunciation_tip&&<p>{explanation.pronunciation_tip}</p>}</details>}
    </div>}
    {!teachingMode&&supplementalContent}
    {!teachingMode&&explanation.pronunciation_tip&&<div className="sentence-analysis-section"><h4>发音提示</h4><p>{explanation.pronunciation_tip}</p></div>}
    {teachingMode==='detailed'&&explanation.teaching_mode==='concise'&&<p className="sentence-analysis-footnote">这份解析按简略模式生成，可手动重新生成详细讲解。</p>}
    {onDelete&&<div className="sentence-analysis-actions"><button type="button" onClick={onDelete}>删除本句解析</button><button type="button" disabled={busy} onClick={onRegenerate}>重新生成本句解析</button></div>}
    {/* 其他语言不套用日语等级规则，仍提示重新生成的调用费用。 */}
    <p className="sentence-analysis-footnote">AI解析仅供学习参考。重新生成{entry?.language==='ja'?'会使用当前日语水平，':''}可能产生AI调用费用。</p>
  </section>
}
