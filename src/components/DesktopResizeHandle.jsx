export default function DesktopResizeHandle({ label, value, min, max, onChange, onReset, direction = 'left' }) {
  function move(event) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const rect = event.currentTarget.closest(direction === 'right' ? '.practice-layout' : '.desktop-shell')?.getBoundingClientRect()
    if (!rect) return
    const width = direction === 'right' ? rect.right - event.clientX : event.clientX - rect.left
    onChange(Math.round(Math.max(min, Math.min(max, width))))
  }
  return <div className={`desktop-resize-handle resize-${direction}`} role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} tabIndex={0}
    title="拖动调整宽度，双击恢复默认"
    onPointerDown={event => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId) } }}
    onPointerMove={move}
    onDoubleClick={onReset}
    onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onChange(Math.max(min, Math.min(max, value + (event.key === 'ArrowRight' ? 20 : -20) * (direction === 'right' ? -1 : 1)))) } }}/>
}
