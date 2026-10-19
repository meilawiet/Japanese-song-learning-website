// 两个独立开关使用与注音类型相近的选中卡片，保持按钮语义，不误用互斥单选。
function ToggleCard({ label, accessibleLabel=label, selected, disabled=false, onToggle }) {
  return <button type="button" className={`study-setting-card ${selected?'selected':''}`} aria-label={accessibleLabel} aria-pressed={Boolean(selected)} disabled={disabled} onClick={()=>onToggle(!selected)}><span className="study-setting-marker" aria-hidden="true"/><span>{label}</span></button>
}

export default function StudyMoreActions({ language, showTranslation, onTranslation, timestampEditing, onTimestampEditing, timestampBusy, onReview, generating, ready, total, generationProgress, onGenerate, onRegenerate, onDeleteAnalyses, hasAnalyses }) {
  return <>
    <div className={`study-display-options ${onTimestampEditing?'':'single'}`} role="group" aria-label="显示与时间戳">
      <ToggleCard label="显示翻译" selected={showTranslation} onToggle={onTranslation}/>
      {onTimestampEditing && <ToggleCard label="调整时间戳" accessibleLabel="调试时间戳模式" selected={timestampEditing} disabled={timestampBusy} onToggle={onTimestampEditing}/>}
    </div>
    {/* 复核与生成的标题及主按钮分两列对齐；任务状态和管理按钮放在下面整行。 */}
    <div className={`study-ai-grid ${language==='ja'?'':'single'}`}>
      {language==='ja' && <section className="study-ai"><strong>AI复核歌词</strong><button type="button" onClick={onReview}>复核歌词</button></section>}
      <section className="study-ai"><strong>整曲 AI 解析</strong><button type="button" disabled={generating || ready===total} onClick={onGenerate}>{generating?'正在后台生成…':ready===total?'解析已完整':'生成整曲解析'}</button></section>
    </div>
    <div className="study-ai study-ai-details">
      <p role="status">{generationProgress?`${generationProgress.regenerating?'正在重新生成':'正在生成'} ${generationProgress.ready} / ${generationProgress.total} 句`:`已生成 ${ready} / ${total} 句`}</p>
      {((onRegenerate&&hasAnalyses)||(onDeleteAnalyses&&(hasAnalyses||generating))) && <div className="study-analysis-actions">{onRegenerate&&hasAnalyses&&<button type="button" disabled={generating} onClick={onRegenerate}>重新生成整曲解析</button>}{onDeleteAnalyses&&(hasAnalyses||generating)&&<button className="sentence-delete-all" type="button" onClick={onDeleteAnalyses}>删除整曲解析</button>}</div>}
      <small>主动生成时会将歌词发送给设置中的 AI 服务，可能产生调用费用。</small>
    </div>
  </>
}
