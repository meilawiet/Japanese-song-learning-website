export default function DesktopResizeHandle({ label, value, min, max, onChange, onReset, direction = 'left', limitDescription }) {
  function change(width) {
    const next = Math.round(Math.max(min, Math.min(max, width)))
    if (next !== value) onChange(next)
  }

  function move(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const rect = event.currentTarget.closest(direction === 'right' ? '.practice-layout' : '.desktop-shell')?.getBoundingClientRect()
    if (!rect) return
    change(direction === 'right' ? rect.right - event.clientX : event.clientX - rect.left)
  }

  function keyDown(event) {
    const step = direction === 'right' ? -20 : 20
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    change(event.key === 'Home' ? min : event.key === 'End' ? max : value + (event.key === 'ArrowRight' ? step : -step))
  }

  return <div className={'desktop-resize-handle resize-' + direction} role="separator" aria-label={label} aria-orientation="vertical"
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-describedby={limitDescription}
    aria-valuetext={value + ' 像素' + (limitDescription ? '，已到空间上限' : '')}
    data-space-limit={limitDescription ? 'true' : undefined} tabIndex={0} title="拖动或用方向键调整宽度，双击恢复默认"
    onPointerDown={event => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.focus({ preventScroll: true })
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerMove={move} onDoubleClick={onReset} onKeyDown={keyDown}/>
}
