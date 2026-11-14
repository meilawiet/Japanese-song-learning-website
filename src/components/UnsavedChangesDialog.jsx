import { useEffect, useRef } from 'react'

export default function UnsavedChangesDialog({ title, busy = false, canSave = true, onContinue, onDiscard, onSave, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    ref.current.showModal()
    return () => { ref.current?.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  return <dialog ref={ref} className="workspace-unsaved-dialog" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onContinue() }} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <h3>{title}</h3><p>保存后离开，或放弃本次修改。</p>{children}
    <div className="workspace-unsaved-actions"><button type="button" autoFocus disabled={busy} onClick={onContinue}>继续编辑</button><button type="button" disabled={busy} onClick={onDiscard}>放弃修改</button><button type="button" disabled={busy || !canSave} onClick={onSave}>保存并离开</button></div>
  </dialog>
}
