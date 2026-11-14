export function captureScrollPosition(container, row) {
  return {
    top: container.scrollTop,
    offset: row ? row.getBoundingClientRect().top - container.getBoundingClientRect().top : null,
  }
}

export function restoreScrollPosition(container, row, position) {
  container.scrollTop = position.top
  if (row && position.offset != null) {
    container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top - position.offset
  }
}

export function keepRowInView(container, row, inset = 0) {
  if (!row) return
  const viewport = container.getBoundingClientRect()
  const bounds = row.getBoundingClientRect()
  const top = viewport.top + inset
  const bottom = viewport.top + container.clientHeight
  if (bounds.top < top) container.scrollTop += bounds.top - top
  else if (bounds.bottom > bottom) container.scrollTop += Math.min(bounds.bottom - bottom, bounds.top - top)
}

export function restoredLyricLine(before, after, lineId, replaced = false) {
  const index = before.findIndex(line => line.id === lineId)
  if (!replaced) {
    const available = new Map(after.map(line => [line.id, line]))
    if (available.has(lineId)) return available.get(lineId)
    if (index >= 0) {
      for (let distance = 1; distance < before.length; distance++) {
        const neighbor = available.get(before[index + distance]?.id) || available.get(before[index - distance]?.id)
        if (neighbor) return neighbor
      }
    }
  } else if (Number.isFinite(before[index]?.start)) {
    const time = before[index].start
    let closest
    for (const line of after) {
      if (Number.isFinite(line.start) && (!closest || Math.abs(line.start - time) < Math.abs(closest.start - time))) closest = line
    }
    if (closest) return closest
  }
  return after[Math.max(0, Math.min(index, after.length - 1))]
}
