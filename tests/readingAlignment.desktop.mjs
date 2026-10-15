import assert from 'node:assert/strict'

export async function measureRomanAlignment(page) {
  return page.evaluate(() => [...document.querySelectorAll('.lyrics-list .word-aligned')].map(flow => {
    const rows = new Map()
    for (const group of flow.querySelectorAll('.lyric-token-group')) {
      const roman = group.querySelector('.token-reading-romaji')
      if (!roman?.textContent.trim()) continue
      const row = group.getBoundingClientRect().top.toFixed(1)
      const positions = rows.get(row) || []
      positions.push({ text: roman.textContent, top: roman.getBoundingClientRect().top })
      rows.set(row, positions)
    }
    return [...rows.values()].filter(words => words.length > 1).map(words => ({
      words, spread: Math.max(...words.map(word => word.top)) - Math.min(...words.map(word => word.top)),
    }))
  }).flat())
}

export async function assertRomanAlignment(page) {
  const rows = await measureRomanAlignment(page)
  assert.ok(rows.length, 'Alignment check requires at least two words on one visual line')
  for (const row of rows) assert.ok(row.spread <= 0.5, `Romanizations on one line differ by ${row.spread}px: ${JSON.stringify(row.words)}`)
  return rows
}
