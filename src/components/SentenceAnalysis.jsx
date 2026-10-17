import {Sparkles} from 'lucide-react'
import {japaneseLevelLabel} from '../lib/japaneseLevel'

// 解析与目标原文同卡展示，让用户能直接发现内容对应问题；操作由父层统一管理。
export default function SentenceAnalysis({explanation,id,line,entry,stale=false,currentLevel='beginner',busy=false,onDelete,onRegenerate}) {
  return <section className="sentence-inline-analysis" id={id} aria-label="整句解析" onClick={event=>event.stopPropagation()}>
    <h3><Sparkles size={14}/>整句解析</h3>
    {line&&<p className="sentence-analysis-source">对应歌词：{line.text}</p>}
    {entry?.language==='ja'&&<p className="sentence-analysis-level">解析水平：{entry.japaneseLevel?japaneseLevelLabel(entry.japaneseLevel):'旧版未记录'}；当前水平：{japaneseLevelLabel(currentLevel)}</p>}
    {stale&&<p className="sentence-analysis-warning" role="status">此解析尚未按当前原文校验规则或日语水平生成，可保留查看，或重新生成。</p>}
    <div className="sentence-analysis-section"><h4>整句意思</h4><p>{explanation.meaning}</p></div>
    {explanation.vocabulary?.length>0&&<div className="sentence-analysis-section"><h4>关键表达</h4><dl>{explanation.vocabulary.map((item,index)=><div key={`${item.surface}-${index}`}><dt>{item.surface}</dt><dd>{item.meaning}</dd></div>)}</dl></div>}
    {explanation.grammar?.length>0&&<div className="sentence-analysis-section"><h4>语法与语境</h4><ul>{explanation.grammar.map((point,index)=><li key={index}>{point}</li>)}</ul></div>}
    {explanation.pronunciation_tip&&<div className="sentence-analysis-section"><h4>发音提示</h4><p>{explanation.pronunciation_tip}</p></div>}
    {onDelete&&<div className="sentence-analysis-actions"><button type="button" onClick={onDelete}>删除本句解析</button><button type="button" disabled={busy} onClick={onRegenerate}>重新生成本句解析</button></div>}
    {/* 其他语言不套用日语等级规则，仍提示重新生成的调用费用。 */}
    <p className="sentence-analysis-footnote">AI解析仅供学习参考。重新生成{entry?.language==='ja'?'会使用当前日语水平，':''}可能产生AI调用费用。</p>
  </section>
}
