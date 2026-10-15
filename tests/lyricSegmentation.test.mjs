import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSegmentedTokens, fixedLyricBoundaries, lyricGraphemes, segmentSurfaces, suggestedTokenBoundaries, tokenBoundaries } from '../src/lib/lyricSegmentation.js'
import { displayReading } from '../src/lib/readingDisplay.js'

test('可点击字符之间的边界，保留标点并确保原文不变', () => {
  const text = '明日の朝、行く。'
  const tokens = [
    { index: 2, surface: '明日', reading: 'あした' },
    { index: 4, surface: 'の', reading: 'の' },
    { index: 6, surface: '朝', reading: 'あさ' },
    { index: 7, surface: '、', reading: '、', is_symbol: true },
    { index: 8, surface: '行く', reading: 'いく' },
    { index: 9, surface: '。', reading: '。', is_symbol: true },
  ]
  const boundaries = tokenBoundaries(text, tokens)
  assert.ok(boundaries.has(2))
  assert.ok(fixedLyricBoundaries(text).has(4))
  boundaries.delete(2)
  boundaries.add(1)
  const parts = segmentSurfaces(text, boundaries)
  assert.equal(parts.map(item => item.surface).join(''), text)
  assert.deepEqual(parts.map(item => item.surface).slice(0, 3), ['明', '日の', '朝'])
  assert.throws(() => segmentSurfaces(text, new Set([1])), /分词边界无效/)
  assert.deepEqual(lyricGraphemes('😀歌').map(item => item.end), [2, 3])
})

test('合并词组保留人工读音，罗马音随新分词计算', () => {
  const text = '恋から恋へ'
  const tokens = [
    { index: 3, surface: '恋', reading: 'こい', is_symbol: false },
    { index: 4, surface: 'から', reading: 'から', is_symbol: false },
    { index: 5, surface: '恋', reading: 'こい', is_symbol: false },
    { index: 6, surface: 'へ', reading: 'へ', is_symbol: false, part_of_speech: '助詞' },
  ]
  const boundaries = tokenBoundaries(text, tokens)
  boundaries.delete(1)
  const result = buildSegmentedTokens(tokens, { 3: 'こひ', 4: 'から', 5: 'こい', 6: 'へ' }, { 3: true }, segmentSurfaces(text, boundaries))
  assert.deepEqual(result.tokens.map(item => item.surface), ['恋から', '恋', 'へ'])
  assert.equal(result.readings[0], 'こひから')
  assert.equal(result.hidden[0], true)
  assert.equal(result.tokens[0].segmentation_locked, true)
  assert.equal(displayReading(result.readings[0], 'romaji'), 'kohikara')
  assert.deepEqual(result.needsGeneration, [])
})

test('拆开未知汉字读音时生成草稿，匹配原歌词的假名优先保留', () => {
  const text = '二人の夢'
  const tokens = [
    { index: 0, surface: '二人', reading: 'ふたり', is_symbol: false, reading_source: 'lyric' },
    { index: 1, surface: 'の', reading: 'の', is_symbol: false },
    { index: 2, surface: '夢', reading: 'ゆめ', is_symbol: false },
  ]
  const boundaries = tokenBoundaries(text, tokens)
  boundaries.add(1)
  const result = buildSegmentedTokens(tokens, { 0: 'ふたり', 1: 'の', 2: 'ゆめ' }, {}, segmentSurfaces(text, boundaries), [{ start: 0, end: 1, reading: 'に' }])
  assert.deepEqual(result.tokens.map(item => item.surface), ['二', '人', 'の', '夢'])
  assert.equal(result.readings[0], 'に')
  assert.equal(result.tokens[0].reading_source, 'lyric')
  assert.deepEqual(result.needsGeneration, [1])
  assert.equal(result.readings[3], 'ゆめ')
  assert.deepEqual(result.tokens.map(item => item.index), [0, 1, 2, 3])
})

test('AI 建议只预填目标词界，句子其他部分保持不变', () => {
  const text = '学校へ帰る。'
  const tokens = [{ index: 0, surface: '学校' }, { index: 1, surface: 'へ' },
    { index: 2, surface: '帰る' }, { index: 3, surface: '。', is_symbol: true }]
  const suggestion = { start_token_index: 0, end_token_index: 0,
    original_segments: ['学校'], suggested_segments: ['学', '校'] }
  const changed = suggestedTokenBoundaries(text, tokens, suggestion)
  assert.deepEqual(segmentSurfaces(text, changed).map(item => item.surface), ['学', '校', 'へ', '帰る', '。'])
  assert.deepEqual([...suggestedTokenBoundaries(text, tokens, { ...suggestion, original_segments: ['学園'] })], [...tokenBoundaries(text, tokens)])
})
