import { useState } from 'react'
import { plainLyric } from '../lib/lyricReadings'

// 使用字素而非 UTF-16 单元，组合音标、emoji、其他语言字符不会被拆坏。
export default function LyricBoundaryEditor({tokens,disabled,onConfirm}) {
  const [editing,setEditing]=useState(false),[selected,setSelected]=useState(new Set())
  const text=plainLyric(tokens.map(token=>token.surface).join(''))
  const letters=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(item=>item.segment):Array.from(text)
  function confirm(){
    const parts=[];let word=''
    letters.forEach((letter,index)=>{word+=letter;if(selected.has(index)||index===letters.length-1){parts.push(word);word=''}})
    if(onConfirm(parts)!==false)setEditing(false)
  }
  return <section className="line-editor-segmentation" aria-label="自定义分词">
    <div className="lyric-boundary-heading"><strong>自定义分词</strong>{!editing&&<button type="button" disabled={disabled||!tokens.length} onClick={()=>{setSelected(new Set());setEditing(true)}}>编辑分词</button>}</div>
    {/* 默认先展示当前自动或人工分词，确认后只保留选中的词界。 */}
    {!editing?<p className="lyric-boundary-preview" lang="ja">{tokens.map((token,index)=><span key={token.index}>{index>0&&<b aria-hidden="true">|</b>}{plainLyric(token.surface)}</span>)}</p>:<>
      <p className="lyric-boundary-hint">点击竖线选择词界，再次点击取消。淡色处合并，亮色处分词。</p>
      <div className="lyric-boundary-characters" lang="ja">{letters.map((letter,index)=><span className="lyric-boundary-unit" key={index}><span>{letter}</span>{index<letters.length-1&&<button type="button" disabled={disabled} aria-pressed={selected.has(index)} aria-label={`在第${index+1}个字符“${letter}”后分词`} onClick={()=>setSelected(previous=>{const next=new Set(previous);if(next.has(index))next.delete(index);else next.add(index);return next})}>|</button>}</span>)}</div>
      <div className="lyric-boundary-actions"><button type="button" disabled={disabled} onClick={()=>setEditing(false)}>取消</button><button type="button" disabled={disabled} onClick={confirm}>确认分词</button></div>
    </>}
  </section>
}
