import { useEffect } from 'react'

export function useDesktopUnsavedDraft(id, dirty) {
  useEffect(() => {
    if (!window.utaDesktop?.setUnsavedDraft) return undefined
    void window.utaDesktop.setUnsavedDraft(id, Boolean(dirty))
    return () => { void window.utaDesktop.setUnsavedDraft(id, false) }
  }, [id, dirty])
}
