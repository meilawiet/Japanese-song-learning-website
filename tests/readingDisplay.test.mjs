import assert from 'node:assert/strict'
import test from 'node:test'
import { displayReading, lineReading, normalizeReadingStyle } from '../src/lib/readingDisplay.js'

// 三种注音样式都尊重逐词留空，其余词仍可自动注音。
test('人工留空不会恢复自动读音或罗马音', () => {
  const tokens = [{ index: 0, surface: 'LOVE', reading: 'らぶ' }, { index: 1, surface: '2000', reading: 'にせん' }]
  for (const style of ['hiragana', 'romaji', 'both']) {
    assert.equal(lineReading(tokens, { 's:0:0': '', 's:0:1': '' }, 's', 0, style), '')
    assert.ok(lineReading(tokens, { 's:0:0': '' }, 's', 0, style))
    assert.ok(!lineReading(tokens, { 's:0:0': '' }, 's', 0, style).includes('らぶ'))
    assert.ok(lineReading(tokens, {}, 's', 0, style))
  }
})

test('default and unknown settings preserve the existing reading', () => {
  for (const style of [undefined, null, 'broken', 'hiragana']) {
    assert.equal(normalizeReadingStyle(style), 'hiragana')
    assert.equal(displayReading('ゆめ', style), 'ゆめ')
  }
  assert.equal(normalizeReadingStyle('romaji'), 'romaji')
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

// 双注音必须复用人工校正及助词发音，不能修改原始数据。
test('双注音按整句分行且沿用人工读音', () => {
  assert.equal(normalizeReadingStyle('both'), 'both')
  const tokens = [{ index:0, surface:'明日', reading:'あした' }, { index:1, surface:'は', reading:'は', part_of_speech:'助詞・係助詞' }]
  const corrections = { 's:0:0':'あす' }
  const before = JSON.stringify({ tokens, corrections })
  assert.equal(lineReading(tokens, corrections, 's', 0, 'both'), 'あす は\nasu wa')
  assert.equal(displayReading('は', 'both', tokens[1]), 'は / wa')
  assert.equal(lineReading(undefined, {}, 's', 0, 'both'), '')
  assert.equal(displayReading('', 'both'), '')
  assert.equal(JSON.stringify({ tokens, corrections }), before)
})

// 导入的整句罗马音保持用户音节拼写，空值回退自动转换。
test('整句罗马音优先显示并兼容双注音和空值回退', () => {
  const tokens = [{index:0,surface:'夢',reading:'ゆめ'}]
  assert.equal(lineReading(tokens, {}, 's', 0, 'romaji', 'yu me'), 'yu me')
  assert.equal(lineReading(tokens, {}, 's', 0, 'both', 'yu me'), 'ゆめ\nyu me')
  assert.equal(lineReading(tokens, {}, 's', 0, 'hiragana', 'yu me'), 'ゆめ')
  assert.equal(lineReading(tokens, {}, 's', 0, 'romaji', ''), 'yume')
  assert.equal(lineReading(undefined, {}, 's', 0, 'romaji', 'yu me'), 'yu me')
})
