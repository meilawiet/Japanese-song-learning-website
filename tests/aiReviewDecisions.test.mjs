import test from 'node:test'
import assert from 'node:assert/strict'
import { pendingReviewSuggestions, pendingSegmentationSuggestions, skipReviewSuggestion, restoreSkippedSuggestions, mergeReviewDecisions } from '../src/lib/aiReviewDecisions.js'
import { createLearningBackup, inspectLearningBackup } from '../src/lib/learningBackup.js'

const song = { id: 'local-review-test', title: '原创测试', artist: 'UTA', isLocal: true,
  lines: [{ id: 0, text: '日', translation: '', start: 0 }, { id: 1, text: '中', translation: '', start: 1 }],
  audioBlob: new Blob(['test-audio']), audioName: 'test.wav' }
const first = { line_id: 0, token_index: 0, surface: '日', original_reading: 'にち', suggested_reading: 'じゅう', confidence: 0.8, reason: '模拟复核建议' }
const second = { ...first, line_id: 1, surface: '中', original_reading: 'ちゅう', suggested_reading: 'じゅう' }
const review = () => ({ reviewed_token_count: 2, suggestions: [{ ...first }, { ...second }] })
test('skipping removes just the chosen proposal without changing dictionary readings or corrections', () => {
  const original = review(), untouched = structuredClone(original), corrections = {}
  const skipped = skipReviewSuggestion(original, first)
  assert.deepEqual(pendingReviewSuggestions(skipped, song, corrections), [second])
  assert.equal(skipped.suggestions[0].original_reading, 'にち')
  assert.deepEqual(corrections, {})
  assert.deepEqual(original, untouched)
})
test('restoring skipped proposals is reversible and still respects adopted corrections', () => {
  const skipped = skipReviewSuggestion(skipReviewSuggestion(review(), first), second)
  assert.deepEqual(pendingReviewSuggestions(skipped, song), [])
  const restored = restoreSkippedSuggestions(skipped)
  assert.deepEqual(pendingReviewSuggestions(restored, song, { 'local-review-test:1:0': 'じゅう' }).map(item => item.surface), ['日'])
  assert.equal(skipped.suggestions[0].skipped, true)
})
test('repeat review remembers an exact decision while new readings and other words remain pending', () => {
  const skipped = skipReviewSuggestion(review(), first)
  const repeated = mergeReviewDecisions(review(), skipped)
  assert.deepEqual(pendingReviewSuggestions(repeated, song), [second])
  for (const changed of [{ suggested_reading: 'ひ' }, { original_reading: 'ひ' }, { surface: '月' }, { line_id: 1 }]) {
    const result = mergeReviewDecisions({ suggestions: [{ ...first, ...changed }] }, skipped)
    assert.equal(pendingReviewSuggestions(result, song).length, 1)
  }
})
test('skip decisions survive backup round-trip; old review objects stay compatible', async () => {
  const state = { progress: { learnedBySong: {}, reviewItems: [], favoriteSongIds: [], corrections: {}, meaningOverrides: {} },
    annotations: {}, aiReviews: { [song.id]: skipReviewSuggestion(review(), first) }, sentenceExplanations: {} }
  const restored = await inspectLearningBackup(createLearningBackup([song], state))
  assert.deepEqual(pendingReviewSuggestions(restored.manifest.aiReviews[song.id], song), [second])
  state.aiReviews[song.id] = review()
  const old = await inspectLearningBackup(createLearningBackup([song], state))
  assert.equal(pendingReviewSuggestions(old.manifest.aiReviews[song.id], song).length, 2)
})

test('segmentation proposals can be skipped, restored and backed up without changing the lyric', async () => {
  const splitSong = { ...song, lines: [{ id: 0, text: '明日', translation: '', start: 0 }, song.lines[1]] }
  const splitAnnotations = { [song.id]: [{ id: 0, text: '明日', tokens: [{ index: 0, surface: '明日', reading: 'あした', is_symbol: false }] }] }
  const split = { line_id: 0, start_token_index: 0, end_token_index: 0, original_segments: ['明日'],
    suggested_segments: ['明', '日'], confidence: 0.8, reason: '模拟词界建议' }
  const current = { reviewed_token_count: 1, suggestions: [], segmentation_suggestions: [split] }
  assert.deepEqual(pendingSegmentationSuggestions(current, splitSong, splitAnnotations), [split])
  const skipped = skipReviewSuggestion(current, split)
  assert.deepEqual(pendingSegmentationSuggestions(skipped, splitSong, splitAnnotations), [])
  assert.deepEqual(pendingSegmentationSuggestions(mergeReviewDecisions(current, skipped), splitSong, splitAnnotations), [])
  const state = { progress: { learnedBySong: {}, reviewItems: [], favoriteSongIds: [], corrections: {}, meaningOverrides: {} },
    annotations: splitAnnotations, aiReviews: { [song.id]: skipped }, sentenceExplanations: {} }
  const restored = await inspectLearningBackup(createLearningBackup([splitSong], state))
  assert.equal(restored.manifest.aiReviews[song.id].segmentation_suggestions[0].skipped, true)
  assert.deepEqual(pendingSegmentationSuggestions(restoreSkippedSuggestions(restored.manifest.aiReviews[song.id]), splitSong, splitAnnotations).map(({ skipped, ...item }) => item), [split])
  splitAnnotations[song.id][0].tokens[0].segmentation_user_changed = true
  assert.deepEqual(pendingSegmentationSuggestions(current, splitSong, splitAnnotations), [])
})
