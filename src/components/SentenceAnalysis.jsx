import {Sparkles} from 'lucide-react'
import {japaneseLevelLabel} from '../lib/japaneseLevel'

// 解析与目标原文同卡展示，让用户能直接发现内容对应问题；操作由父层统一管理。
export default function SentenceAnalysis({explanation,id,line,entry,stale=false,currentLevel='beginner',busy=false,onDelete,onRegenerate}) {
  // 导入跨端备份时扩展字段可能来自旧客户端；只显示有效文字，不能让异常字段导致白屏。
  const points=value=>(Array.isArray(value)?value:[]).filter(item=>typeof item==='string'&&item.trim())
  const expressionNotes=points(explanation.expression_notes),learningFocus=points(explanation.learning_focus)
  const usageNote=typeof explanation.usage_note==='string'?explanation.usage_note:''
  const everydayExample=typeof explanation.everyday_example?.sentence==='string'&&typeof explanation.everyday_example?.meaning==='string'?explanation.everyday_example:null
  return <section className="sentence-inline-analysis" id={id} aria-label="整句解析" onClick={event=>event.stopPropagation()}>
    <h3><Sparkles size={14}/>整句解析</h3>
    {line&&<p className="sentence-analysis-source">对应歌词：{line.text}</p>}
    {entry?.language==='ja'&&<p className="sentence-analysis-level">解析水平：{entry.japaneseLevel?japaneseLevelLabel(entry.japaneseLevel):'旧版未记录'}；当前水平：{japaneseLevelLabel(currentLevel)}</p>}
    {/* 原提示仅包含原文/等级：此解析尚未按当前原文校验规则或日语水平生成，可保留查看，或重新生成。 */}
    {stale&&<p className="sentence-analysis-warning" role="status">此解析尚未按当前原文校验规则、日语水平或歌词讲解规则生成，可保留查看，或手动重新生成。</p>}
    <div className="sentence-analysis-section"><h4>整句意思</h4><p>{explanation.meaning}</p></div>
    {/* 原词汇只显示meaning；新增常规读音、原形与用法，旧记录仍可直接查看。 */}
    {/* {explanation.vocabulary?.length>0&&<div className="sentence-analysis-section"><h4>关键表达</h4><dl>{explanation.vocabulary.map((item,index)=><div key={`${item.surface}-${index}`}><dt>{item.surface}</dt><dd>{item.meaning}</dd></div>)}</dl></div>} */}
    {explanation.vocabulary?.length>0&&<div className="sentence-analysis-section"><h4>关键表达</h4><dl>{explanation.vocabulary.map((item,index)=><div key={`${item.surface}-${index}`}><dt>{item.surface}{typeof item.reading==='string'&&item.reading&&<span className="sentence-word-reading" lang="ja">{item.reading}</span>}</dt><dd>{item.meaning}{typeof item.dictionary_form==='string'&&item.dictionary_form&&item.dictionary_form!==item.surface&&<p>原形：<span lang="ja">{item.dictionary_form}</span></p>}{typeof item.usage==='string'&&item.usage&&<p>用法：{item.usage}</p>}</dd></div>)}</dl></div>}
    {explanation.grammar?.length>0&&<div className="sentence-analysis-section"><h4>语法与语境</h4><ul>{explanation.grammar.map((point,index)=><li key={index}>{point}</li>)}</ul></div>}
    {/* 仅新日语解析拥有这些字段；艺术表达与日常例句分区，避免把改写当原文。 */}
    {entry?.language==='ja'&&<>
      {expressionNotes.length>0&&<details className="sentence-analysis-section sentence-expression-notes"><summary>歌词表达特点</summary><ul>{expressionNotes.map((point,index)=><li key={index}>{point}</li>)}</ul></details>}
      {usageNote&&<div className="sentence-analysis-section"><h4>日常使用建议</h4><p>{usageNote}</p>{everydayExample?.sentence&&<div className="sentence-everyday-example"><h4>日常示例（非歌词原文）</h4><p lang="ja">{everydayExample.sentence}</p><p>{everydayExample.meaning}</p></div>}</div>}
      {learningFocus.length>0&&<div className="sentence-analysis-section"><h4>学习重点</h4><ul>{learningFocus.map((point,index)=><li key={index}>{point}</li>)}</ul></div>}
    </>}
    {explanation.pronunciation_tip&&<div className="sentence-analysis-section"><h4>发音提示</h4><p>{explanation.pronunciation_tip}</p></div>}
    {onDelete&&<div className="sentence-analysis-actions"><button type="button" onClick={onDelete}>删除本句解析</button><button type="button" disabled={busy} onClick={onRegenerate}>重新生成本句解析</button></div>}
    {/* 其他语言不套用日语等级规则，仍提示重新生成的调用费用。 */}
    <p className="sentence-analysis-footnote">AI解析仅供学习参考。重新生成{entry?.language==='ja'?'会使用当前日语水平，':''}可能产生AI调用费用。</p>
  </section>
}
