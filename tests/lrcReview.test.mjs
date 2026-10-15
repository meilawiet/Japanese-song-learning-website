import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compileLrcCues, confirmLrcTrackClassifications, insertLrcCue, parseLrcCues, parseLrcTime } from '../src/lib/lrcReview.js'
import { parseLrcFile } from '../src/lib/localSongStore.js'
import { batchRowProblem, prepareBatchImport } from '../src/lib/batchSongImport.js'

test('pure-kanji remains reviewable while English and romaji no longer require confirmation', async () => {
  const file = new File(['[ti:手作り]\n[00:01.00]東京\n[00:02.00]夜を歩く\n[00:03.00]I will follow\n[00:04.00]街の灯り\n'], 'review.lrc')
  const parsed = await parseLrcFile(file)
  assert.deepEqual(parsed.cues.map(cue => [cue.text, cue.track]), [
    ['東京', 'original'], ['夜を歩く', 'original'], ['I will follow', 'romaji'], ['街の灯り', 'original'],
  ])
  assert.equal(parsed.issues.length, 1)
  assert.equal(parsed.cues.find(cue => cue.text === 'I will follow').reviewReason, '')
  assert.equal(parsed.cues.some(cue => cue.text === 'I will follow'), true)
  const corrected = parsed.cues.map(cue => cue.text === 'I will follow' ? { ...cue, track: 'original', reviewed: true } : cue.text === '東京' ? { ...cue, reviewed: true } : cue)
  const compiled = compileLrcCues(corrected)
  assert.equal(compiled.issues.length, 0)
  assert.deepEqual(compiled.lines.map(line => line.text), ['東京', '夜を歩く', 'I will follow', '街の灯り'])
})

test('同时间戳的汉字译文可直接导入，整首歌词不必逐句确认', async () => {
  const pairs = Array.from({ length: 48 }, (_, index) => {
    const time = `00:${String(index + 1).padStart(2, '0')}.000`
    return `[${time}]君を見た\n[${time}]看见了你`
  }).join('\n')
  const parsed = await parseLrcFile(new File([pairs], 'paired.lrc'))
  assert.equal(parsed.cues.length, 96)
  assert.equal(parsed.issues.length, 0)
  assert.equal(parsed.lines.length, 48)
  assert.ok(parsed.cues.every((cue, index) => index % 2 === 0 ? cue.track === 'original' : cue.track === 'translation' && !cue.reviewReason))
})

test('英文和罗马音歌词直接进入单首和批量导入，不产生归类确认', async () => {
  const file = new File(['[00:01]I will follow\n[00:02]君を見た\n[00:02]kimi o mita'], 'song.lrc')
  const parsed = await parseLrcFile(file)
  assert.equal(parsed.issues.length, 0)
  assert.equal(parsed.lines[0].text, 'I will follow')
  assert.equal(parsed.lines[1].romaji, 'kimi o mita')
  const row = { audioId: 'audio', lyricId: 'lyrics', title: 'song', artist: 'UTA', selected: true }
  const lyrics = [{ id: 'lyrics', parsed, file }]
  assert.equal(batchRowProblem(row, [row], lyrics), '')
  assert.equal(prepareBatchImport([row], [{ id: 'audio', file: new File(['audio'], 'song.wav') }], lyrics).length, 1)
})

test('批量确认只接受轨道判断，时间戳异常仍需单独处理', () => {
  const cues = parseLrcCues('[00:01]東京\n[00:03]朝を待つ\n[00:02]夜を歩く\n', '歌', '人')
  const before = compileLrcCues(cues)
  assert.ok(before.issues.some(issue => issue.message.includes('纯汉字')))
  assert.ok(before.issues.some(issue => issue.message.includes('早于前一句')))
  const confirmed = confirmLrcTrackClassifications(cues)
  assert.equal(confirmed[0].trackReviewed, true)
  assert.equal(confirmed[0].reviewed, false)
  const after = compileLrcCues(confirmed)
  assert.equal(after.issues.some(issue => issue.message.includes('纯汉字')), false)
  assert.ok(after.issues.some(issue => issue.message.includes('早于前一句')))
})

test('review preserves and assigns translation and romaji; insertion works at any position', () => {
  const cues = parseLrcCues('[00:01]あしたへ行こう\n[00:02]走向明天\n[00:02]ashita e ikou\n[00:05]回家路\n', '歌', '人')
  assert.deepEqual(cues.map(cue => cue.track), ['original', 'translation', 'romaji', 'translation'])
  const reviewed = cues.map(cue => ({ ...cue, reviewed: true }))
  const withInserted = insertLrcCue(reviewed, 3)
  assert.equal(withInserted[3].track, 'original')
  withInserted[3] = { ...withInserted[3], text: '帰り道', timeText: '00:04.000' }
  const result = compileLrcCues(withInserted)
  assert.equal(result.issues.length, 0)
  assert.deepEqual(result.lines.map(line => [line.text, line.translation, line.romaji || '']), [
    ['あしたへ行こう', '走向明天', 'ashita e ikou'], ['帰り道', '回家路', ''],
  ])
})

test('invalid, reversed, duplicate and orphan timestamps stay actionable before batch import', async () => {
  assert.equal(parseLrcTime('00:60.000'), null)
  const parsed = await parseLrcFile(new File(['[00:03]明日へ行く\n[00:65]あしたへ行こう\n[00:02]青い空\n[00:03]きょうも歌う\n'], 'bad-time.lrc'))
  assert.ok(parsed.issues.some(issue => issue.message.includes('时间戳无效')))
  assert.ok(parsed.issues.some(issue => issue.message.includes('早于前一句')))
  assert.ok(parsed.issues.some(issue => issue.message.includes('相同时间戳')))
  const lyrics = [{ id: 'lrc', file: { name: 'bad-time.lrc' }, parsed }]
  const row = { audioId: 'audio', lyricId: 'lrc', title: '测试', artist: 'UTA', selected: true }
  assert.match(batchRowProblem(row, [row], lyrics), /待处理/)
  assert.throws(() => prepareBatchImport([row], [{ id: 'audio', file: new File(['audio'], 'song.wav') }], lyrics), /待处理/)
  const fixed = parsed.cues.map(cue => ({ ...cue, reviewed: true, timeText: cue.timeText === '00:65' ? '00:04' : cue.timeText }))
  assert.equal(compileLrcCues(fixed).issues.length, 0)
})
