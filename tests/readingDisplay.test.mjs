import assert from 'node:assert/strict'
import test from 'node:test'
import { displayReading, lineReading, normalizeReadingStyle, normalizeTranslationFontSize, tokenReading, tokenHasManualReading, lyricSurface } from '../src/lib/readingDisplay.js'

test('default and unknown settings preserve the existing reading', () => {
  for (const style of [undefined, null, 'broken', 'hiragana']) {
    assert.equal(normalizeReadingStyle(style), 'hiragana')
    assert.equal(displayReading('ゆめ', style), 'ゆめ')
  }
  assert.equal(normalizeReadingStyle('romaji'), 'romaji')
})

test('missing legacy translation size keeps the old font and bounds device settings', () => {
  for (const value of [undefined, null, NaN, Infinity, '18']) assert.equal(normalizeTranslationFontSize(value), 12)
  assert.equal(normalizeTranslationFontSize(18), 18)
  assert.equal(normalizeTranslationFontSize(18.6), 19)
  assert.equal(normalizeTranslationFontSize(1), 10)
  assert.equal(normalizeTranslationFontSize(100), 24)
})

test('romaji handles combinations, gemination, long vowels and syllabic n', () => {
  for (const [kana, romaji] of Object.entries({ ゆめ: 'yume', がっこう: 'gakkou', きょう: 'kyou', まっちゃ: 'matcha', しんよう: "shin'you", コーヒー: 'koohii', こーひー: 'koohii', すーぱー: 'suupaa', がっ: "ga'" })) {
    assert.equal(displayReading(kana, 'romaji'), romaji)
  }
})

test('loanword kana, half-width kana and combining dakuten have readable spellings', () => {
  for (const [kana, romaji] of Object.entries({ ティー: 'tii', ファイル: 'fairu', ヴァイオリン: 'vaiorin', 'ﾊﾟｰﾃｨｰ': 'paatii', 'か\u3099': 'ga' })) {
    assert.equal(displayReading(kana, 'romaji'), romaji)
  }
})

test('mixed text, unknown kanji and punctuation are not treated as kana', () => {
  assert.equal(displayReading('AI で 歌う！', 'romaji'), 'AI de 歌u！')
  assert.equal(displayReading('', 'romaji'), '')
  assert.equal(displayReading(undefined, 'romaji'), '')
})

test('particle readings use pronunciation, but explicit user corrections win', () => {
  for (const [surface, expected] of Object.entries({ は: 'wa', へ: 'e', を: 'o' })) {
    const token = { surface, part_of_speech: '助詞・格助詞' }
    assert.equal(displayReading(surface, 'romaji', token), expected)
  }
  assert.equal(displayReading('は', 'romaji', { surface: 'は', part_of_speech: '名詞・普通名詞' }), 'ha')
  assert.equal(displayReading('は', 'romaji', { surface: 'は', part_of_speech: '助詞・係助詞' }, true), 'ha')
})

test('line display respects corrections, skips symbols, and never mutates saved data', () => {
  const tokens = [
    { index: 0, surface: '君', reading: 'くん' },
    { index: 1, surface: 'は', reading: 'は', part_of_speech: '助詞・係助詞' },
    { index: 2, surface: ' ', reading: 'きごう', is_symbol: true },
    { index: 3, surface: '歌う', reading: 'うたう' },
  ]
  const corrections = { 'song:0:0': 'きみ' }
  const before = JSON.stringify({ tokens, corrections })
  assert.equal(lineReading(tokens, corrections, 'song', 0, 'romaji'), 'kimi wa utau')
  assert.equal(lineReading(tokens, corrections, 'song', 0, 'hiragana'), 'きみ は うたう')
  assert.equal(lineReading(undefined, {}, 'song', 0, 'romaji'), '')
  assert.equal(JSON.stringify({ tokens, corrections }), before)
})

test('explicit empty and literal manual readings survive display without dictionary fallback or romanization', () => {
  const token = { index: 0, surface: '空', reading: 'そら' }
  const corrections = { 'local-song:10:0': '' }
  assert.equal(tokenHasManualReading(token, corrections, 'local-song:10:0'), true)
  assert.equal(tokenReading(token, corrections, 'local-song:10:0'), '')
  assert.equal(lineReading([token], corrections, 'local-song', 10, 'romaji'), '')
  assert.equal(tokenReading(token, {}, 'local-song:10:0'), 'そら')
  assert.equal(displayReading('あいう', 'romaji', { manual_reading_mode: 'literal' }), 'あいう')
  assert.equal(displayReading('あいう', 'hiragana', { manual_reading_mode: 'literal' }), 'あいう')
})

test('Android source pronunciation, whole-group readings, written particles and display surfaces keep their priorities', () => {
  const source = { index: 0, surface: '近づく', display_surface: '近づく', reading: 'ちかづく', source_reading: 'ちかづく', source_pronunciation: 'ちかずく' }
  assert.equal(lyricSurface(source), '近づく')
  assert.equal(tokenReading(source, {}, 's:0:0', 'romaji'), 'ちかずく')
  assert.equal(lineReading([source], {}, 's', 0, 'romaji'), 'chikazuku')
  assert.equal(lineReading([source], {}, 's', 0, 'hiragana'), 'ちかづく')
  const manual = { ...source, manual_group_reading: 'あす' }
  assert.equal(tokenReading(manual, { 's:0:0': 'あした' }, 's:0:0', 'romaji'), 'あす')
  assert.equal(tokenReading(manual, {}, 's:0:0', 'hiragana', { showManualReadings: false }), '')
  assert.equal(tokenReading(source, {}, 's:0:0', 'hiragana', { showSourceReadings: false }), '')
  assert.equal(tokenReading({ surface: 'へ', reading: 'へ', part_of_speech: '助詞', source_reading: 'え' }, {}, 's:0:0'), 'へ')
})
