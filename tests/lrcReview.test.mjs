import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compileLrcCues, insertLrcCue, parseLrcCues, parseLrcTime } from '../src/lib/lrcReview.js'
import { parseLrcFile } from '../src/lib/localSongStore.js'
import { batchRowProblem, prepareBatchImport } from '../src/lib/batchSongImport.js'

test('all-kanji and later English originals import without classification confirmation', async () => {
  const file = new File(['[ti:手作り]\n[00:01.00]東京\n[00:02.00]夜を歩く\n[00:03.00]I will follow\n[00:04.00]街の灯り\n'], 'review.lrc')
  const parsed = await parseLrcFile(file)
  assert.deepEqual(parsed.cues.map(cue => cue.track), ['original', 'original', 'original', 'original'])
  assert.equal(parsed.issues.length, 0)
  assert.deepEqual(parsed.lines.map(line => line.text), ['東京', '夜を歩く', 'I will follow', '街の灯り'])
  // Legacy automatic review flags must not recreate the removed confirmation.
  assert.equal(compileLrcCues(parsed.cues.map(cue => ({ ...cue, reviewReason: '旧版归类提示', reviewed: false }))).issues.length, 0)
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

test('removing track confirmation still retains real timestamp anomaly checks', () => {
  const cues = parseLrcCues('[00:01]東京\n[00:03]朝を待つ\n[00:02]夜を歩く\n', '歌', '人')
  const before = compileLrcCues(cues)
  assert.equal(before.issues.some(issue => issue.message.includes('归类') || issue.message.includes('纯汉字')), false)
  assert.ok(before.issues.some(issue => issue.message.includes('早于前一句')))
  assert.equal(compileLrcCues(cues.map(cue => ({ ...cue, reviewed: true }))).issues.length, 0)
})

test('review preserves and assigns translation and romaji; insertion works at any position', () => {
  const cues = parseLrcCues('[00:01]あしたへ行こう\n[00:01]走向明天\n[00:01]ashita e ikou\n[00:05]回家路\n', '歌', '人')
  assert.deepEqual(cues.map(cue => cue.track), ['original', 'translation', 'romaji', 'original'])
  const reviewed = cues.map((cue, index) => ({ ...cue, track: index === 3 ? 'translation' : cue.track, reviewed: true }))
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


test('mixed Japanese, English and romanized tracks remain separate by timestamp', async () => {
  const content = '[00:01]君を見た\n[00:01]看见你\n[00:01]kimi o mita\n[00:02]I will follow\n[00:03]English chorus\n[00:04]東京\n[00:04]东京\n[00:04]toukyou'
  const parsed = await parseLrcFile(new File([content], 'mixed.lrc'))
  assert.deepEqual(parsed.lines.map(line => [line.text, line.translation, line.romaji || '']), [
    ['君を見た', '看见你', 'kimi o mita'], ['I will follow', '', ''], ['English chorus', '', ''], ['東京', '东京', 'toukyou'],
  ])
  assert.equal(parsed.issues.length, 0)
})

test('grouped translation and romanized tracks attach to their own timestamps', async () => {
  const content = '[00:01]君を見た\n[00:02]明日へ行こう\n[00:01]看见你\n[00:02]走向明天\n[00:01]kimi o mita\n[00:02]ashita e ikou'
  const parsed = await parseLrcFile(new File([content], 'grouped.lrc'))
  assert.equal(parsed.issues.length, 0)
  assert.deepEqual(parsed.lines.map(line => [line.text, line.translation, line.romaji]), [['君を見た', '看见你', 'kimi o mita'], ['明日へ行こう', '走向明天', 'ashita e ikou']])
})

test('exact repeated cues do not create false duplicate-romaji errors', async () => {
  const parsed = await parseLrcFile(new File(['[00:01]君を見た\n[00:01.000]君を見た\n[00:01]kimi o mita\n[00:01.000]kimi o mita'], 'repeat.lrc'))
  assert.equal(parsed.issues.length, 0)
  assert.equal(parsed.lines.length, 1)
  assert.equal(parsed.lines[0].romaji, 'kimi o mita')
})


test('near-aligned translated lyrics remain auxiliary tracks', async () => {
  const parsed = await parseLrcFile(new File(['[00:01]君を見た\n[00:01.020]看见你\n[00:01.020]kimi o mita'], 'near.lrc'))
  assert.equal(parsed.issues.length, 0)
  assert.equal(parsed.lines.length, 1)
  assert.equal(parsed.lines[0].translation, '看见你')
  assert.equal(parsed.lines[0].romaji, 'kimi o mita')
})


test('repeated translations in grouped tracks still pair by timestamp', async () => {
  const parsed = await parseLrcFile(new File(['[00:01]君を見た\n[00:02]空を見た\n[00:03]夢を見た\n[00:01]看见了\n[00:02]看见了\n[00:03]看见了'], 'repeated-translation.lrc'))
  assert.equal(parsed.issues.length, 0)
  assert.deepEqual(parsed.lines.map(line => line.translation), ['看见了', '看见了', '看见了'])
})

test('English chorus after a previous-line translation stays original in offset bilingual files', async () => {
  const parsed = await parseLrcFile(new File(['[00:01]窓を開ける\n[00:04]打开窗户\n[00:04]I will sing with you\n[00:07]我会与你歌唱\n[00:07]星を見よう\n[00:10]一起看星星'], 'original-offset.lrc'))
  assert.equal(parsed.issues.length, 0)
  assert.deepEqual(parsed.lines.map(line => [line.text, line.translation, line.romaji || '']), [
    ['窓を開ける', '打开窗户', ''], ['I will sing with you', '我会与你歌唱', ''], ['星を見よう', '一起看星星', ''],
  ])
})

test('pure Han and pure English files preserve every original even when Latin looks like Japanese syllables', async () => {
  for (const content of ['[00:01]今天\n[00:02]明天\n[00:03]東京', '[00:01]No\n[00:02]I love you\n[00:03]Sing with me']) {
    const parsed = await parseLrcFile(new File([content], 'original-monolingual.lrc'))
    assert.equal(parsed.issues.length, 0)
    assert.equal(parsed.lines.length, 3)
    assert.ok(parsed.cues.every(cue => cue.track === 'original'))
  }
})

test('a standalone Japanese Han line survives legacy offset-translation context', async () => {
  const parsed = await parseLrcFile(new File(['[00:01]窓を開ける\n[00:04]打开窗户\n[00:04]星を見よう\n[00:07]東京\n[00:09]夜を歩く'], 'original-kanji.lrc'))
  assert.ok(parsed.lines.some(line => line.text === '東京'))
  assert.equal(parsed.cues.find(cue => cue.text === '東京').track, 'original')
})

test('English and Japanese at one timestamp remain originals; romanized Japanese stays auxiliary', async () => {
  const parsed = await parseLrcFile(new File(['[00:01]空を見よう\n[00:01]I love you\n[00:01]sora o miyou'], 'original-mixed.lrc'))
  assert.ok(parsed.issues.every(issue => issue.kind === 'review' && issue.message.includes('相同时间戳')))
  assert.deepEqual(parsed.lines.map(line => line.text), ['空を見よう', 'I love you'])
  assert.equal(parsed.lines[0].romaji, 'sora o miyou')
  assert.equal(parsed.cues.at(-1).track, 'romaji')
})

test('explicit platform tracks override English/Han heuristics and can precede originals', async () => {
  const parsed = await parseLrcFile(new File(['[00:01][uta-translation]看天空\n[00:01]空を見よう\n[00:01][uta-romaji]sora o miyou\n[00:02]Sing with me\n[00:02][uta-translation]和我一起唱'], 'original-explicit.lrc'))
  assert.equal(parsed.issues.length, 0)
  assert.deepEqual(parsed.lines.map(line => [line.text, line.translation, line.romaji || '']), [['空を見よう', '看天空', 'sora o miyou'], ['Sing with me', '和我一起唱', '']])
})
