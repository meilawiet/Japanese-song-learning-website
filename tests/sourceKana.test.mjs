import test from 'node:test'
import assert from 'node:assert/strict'
import { extractSourceKana, applySourceKana } from '../src/lib/sourceKana.js'
import { compileLrcCues } from '../src/lib/lrcReview.js'
import { parseLrcFile } from '../src/lib/localSongStore.js'

test('inline source kana becomes plain lyric plus exact reading spans', () => {
  const result = extractSourceKana('二人（ふたり）の思い出(おもいで)')
  assert.equal(result.text, '二人の思い出')
  assert.deepEqual(result.readings, [
    { start: 0, end: 2, reading: 'ふたり' },
    { start: 3, end: 6, reading: 'おもいで' },
  ])
  const compiled = compileLrcCues([{ id: 'a', track: 'original', text: '二人（ふたり）の思い出(おもいで)', timeText: '00:01.000', reviewed: true }])
  assert.equal(compiled.issues.length, 0)
  assert.deepEqual(compiled.lines[0].sourceReadings, result.readings)
})

test('source kana wins over generated reading even if the tokenizer splits a word', () => {
  const line = { id: 0, ...extractSourceKana('二人（ふたり）の思い出(おもいで)') }
  line.sourceReadings = line.readings
  const annotation = { id: 0, tokens: [
    { index: 0, surface: '二', reading: 'に' },
    { index: 1, surface: '人', reading: 'ひと' },
    { index: 2, surface: 'の', reading: 'の' },
    { index: 3, surface: '思い出', reading: 'おもいだし' },
  ] }
  const applied = applySourceKana(annotation, line)
  assert.equal(applied.tokens.map(token => token.surface).join(''), line.text)
  assert.equal(applied.tokens[0].reading, 'ふたり')
  assert.equal(applied.tokens.at(-1).reading, 'おもいで')
  assert.equal(applied.tokens[0].reading_source, 'lyric')
})

test('UtaTen structured lyrics preserve kana and require real timestamps', async () => {
  const structured = { format: 'uta-annotated-lyrics', version: 1, title: '歌', artist: '歌手', timed: false,
    lines: [{ start: null, romaji: 'futari', segments: [{ surface: '二人', kana: 'ふたり' }, { surface: 'の' }] }] }
  const file = new File([JSON.stringify(structured)], 'song.uta-lyrics.json', { type: 'application/json' })
  const parsed = await parseLrcFile(file)
  assert.equal(parsed.untimed, true)
  assert.equal(parsed.cues[0].timeText, '')
  assert.equal(parsed.lines[0].text, '二人の')
  assert.equal(parsed.lines[0].romaji, 'futari')
  assert.equal(parsed.lines[0].sourceReadings[0].reading, 'ふたり')
  assert.ok(parsed.issues.some(issue => issue.kind === 'error'))
})
