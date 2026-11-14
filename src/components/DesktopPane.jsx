import { useLayoutEffect, useRef } from 'react'

export default function DesktopPane({ modal, side, label, onDismiss, children }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    const focused = document.activeElement
    const keepFocus = dialog.contains(focused)
    if (modal && !dialog.open) dialog.showModal()
    else if (!modal && dialog.open) dialog.close()
    if (keepFocus && focused.getClientRects().length) focused.focus({ preventScroll: true })
  }, [modal])

  return <dialog ref={ref} className={'desktop-pane desktop-pane-' + side}
    role={modal ? undefined : 'presentation'} aria-label={modal ? label : undefined}
    onCancel={event => { event.preventDefault(); onDismiss() }}
    onClick={event => {
      if (event.target !== event.currentTarget || !modal) return
      const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect()
      if (event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom) onDismiss()
    }}>
    {children}
  </dialog>
}
