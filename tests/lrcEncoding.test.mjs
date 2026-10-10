import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { decodeLrcBytes } from '../src/lib/lrcEncoding.js'
import { parseLrcFile } from '../src/lib/localSongStore.js'
import { parseLrcWithTranslations } from '../scripts/sync-lyrics.mjs'

// Original test lyrics, not copied from any song. Legacy bytes are fixtures
// encoded from this text (GB18030's variant includes a four-byte moon character).
const original = '[ti:小さな窓]\n[ar:テスト工房]\n[00:01.25]まどに青い光がゆれる\n[00:02.50]窗边蓝色的光轻轻摇晃\n[00:02.50]きょうも声を重ねよう\n[00:04.75]今天也让声音交织在一起\n'
const gbk = Buffer.from('W3RpOtChpLWkyreZXQpbYXI6pcaluaXIuaS3v10KWzAwOjAxLjI1XaTepMmky8fgpKS54qSspOak7KTrClswMDowMi41MF20sLHfwLbJq7XEueLH4cfh0qG7zgpbMDA6MDIuNTBdpK2k56SmpOLJ+aTy1tikzaTopKYKWzAwOjA0Ljc1Xb3xzOzSssjDyfnS9L271q/U2tK7xvAK', 'base64')
const gb18030 = Buffer.from('W3RpOtChpLWkyreZXQpbYXI6pcaluaXIuaS3v10KWzAwOjAxLjI1XaTepMmky5Q5sjPH4KSkueKkrKTmpOyk6wpbMDA6MDIuNTBdtLCx38C2yau1xLnix+HH4dKhu84KWzAwOjAyLjUwXaStpOekpqTiyfmk8tbYpM2k6KSmClswMDowNC43NV298czs0rLIw8n50vS9u9av1NrSu8bwCg==', 'base64')
const fixtures = [
  ['UTF-8', Buffer.from(original), original],
  ['UTF-8 BOM', Buffer.from('\ufeff' + original), original],
  ['GBK', gbk, original],
  ['GB18030', gb18030, original.replace('まどに', 'まどに🌙')],
]

for (const [encoding, bytes, expected] of fixtures) {
  test(`${encoding}: folder and browser imports agree, without mutating bytes`, async () => {
    const before = Buffer.from(bytes)
    assert.equal(decodeLrcBytes(bytes, 'original.lrc'), expected)
    const browser = await parseLrcFile(new File([bytes], 'original.lrc'))
    const folder = parseLrcWithTranslations(bytes, 'original.lrc')
    assert.deepEqual(folder.lines, browser.lines)
    assert.equal(folder.title, browser.title)
    assert.equal(folder.artist, browser.artist)
    assert.equal(folder.lines[0].text, expected.includes('🌙') ? 'まどに🌙青い光がゆれる' : 'まどに青い光がゆれる')
    assert.equal(folder.lines[0].translation, '窗边蓝色的光轻轻摇晃')
    assert.equal(folder.lines[1].translation, '今天也让声音交织在一起')
    assert.deepEqual(folder.lines.map((line) => line.start), [1.25, 2.5])
    assert.ok(!JSON.stringify(folder).includes('\ufffd'))
    assert.deepEqual(bytes, before)
    assert.equal(folder.id, 'folder-original.lrc')
    assert.notEqual(folder.id, parseLrcWithTranslations(bytes, 'another.lrc').id)
  })
}

test('invalid bytes, damaged BOM UTF-8, UTF-16 and replacement characters fail explicitly', async () => {
  for (const bytes of [Buffer.from([0x81]), Buffer.from([0xef, 0xbb, 0xbf, 0x81]), Buffer.from([0xff, 0xfe, 0x61, 0]), Buffer.from(original + '\ufffd')]) {
    assert.throws(() => parseLrcWithTranslations(bytes, 'bad-original.lrc'), /bad-original\.lrc.*UTF-8/)
    await assert.rejects(parseLrcFile(new File([bytes], 'bad-original.lrc')), /bad-original\.lrc.*UTF-8/)
  }
})

test('multiple timestamps, sort order, duplicate cues, credits and adjacent translations remain intact', async () => {
  const bytes = Buffer.from('[ti:窓]\n[ar:工房]\n[00:00]作詞：工房\n[00:05]あしたへ歩こう\n[00:08]走向明天\n[00:01][00:03]ひかりを集めよう\n[00:05]收集光芒\n[00:01]ひかりを集めよう\n')
  const folder = parseLrcWithTranslations(bytes, 'original.lrc')
  const browser = await parseLrcFile(new File([bytes], 'original.lrc'))
  assert.deepEqual(folder.lines, browser.lines)
  assert.deepEqual(folder.lines.map(({ start, translation }) => [start, translation]), [[1, ''], [3, '收集光芒'], [5, '走向明天']])
})

test('sync CLI succeeds on fixtures and leaves original files and last output intact on failure', () => {
  const directory = mkdtempSync(join(tmpdir(), 'uta-lrc-test-'))
  try {
    mkdirSync(join(directory, 'geci'))
    for (const [encoding, bytes] of fixtures) writeFileSync(join(directory, 'geci', `${encoding}.lrc`), bytes)
    const script = resolve('scripts/sync-lyrics.mjs')
    const run = () => spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' })
    const first = run()
    assert.equal(first.status, 0, first.stderr)
    const output = join(directory, 'src/data/songs.generated.js')
    const before = readFileSync(output)
    assert.match(before.toString(), /窗边蓝色的光轻轻摇晃/)
    writeFileSync(join(directory, 'geci', 'bad-original.lrc'), Buffer.from([0x81]))
    const second = run()
    assert.notEqual(second.status, 0)
    assert.match(second.stderr, /bad-original\.lrc.*UTF-8/)
    assert.deepEqual(readFileSync(output), before)
    for (const [encoding, bytes] of fixtures) assert.deepEqual(readFileSync(join(directory, 'geci', `${encoding}.lrc`)), bytes)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

// 自创三轨歌词覆盖纯汉字原文、混合译文、分音节罗马音和时间戳去重。
test('本地三轨LRC保留纯汉字原文并分离译文和罗马音', async () => {
  const text = '[ti:原创测试]\n[ar:UTA]\n[00:01]空を見よう\n[00:01]看天空\n[00:01]so ra wo mi yo u\n[00:02]星光 夜空\n[00:02]星光与夜空\n[00:02]sei ko u yo zo ra\n[00:03]夢を描く\n[00:03]Dream 描绘梦想\n[00:03]yu me wo e ga ku\n[00:02]星光 夜空'
  const song = await parseLrcFile(new File([text], '原创测试.lrc'))
  assert.deepEqual(song.lines.map(({ start,text,translation,romaji })=>({start,text,translation,romaji})), [
    {start:1,text:'空を見よう',translation:'看天空',romaji:'so ra wo mi yo u'},
    {start:2,text:'星光 夜空',translation:'星光与夜空',romaji:'sei ko u yo zo ra'},
    {start:3,text:'夢を描く',translation:'Dream 描绘梦想',romaji:'yu me wo e ga ku'},
  ])
})

test('不含翻译的纯汉字与英文原文不应消失', async () => {
  const song = await parseLrcFile(new File(['[00:01]空を見よう\n[00:02]星光 夜空\n[00:03]Sing with me'], '原创.lrc'))
  assert.deepEqual(song.lines.map(x=>x.text), ['空を見よう','星光 夜空','Sing with me'])
})

// 同一时刻确实可能有多句原文，也可能是英文原文搭配中文译文。
test('同时间戳多句日文与英文原文不误当作翻译', async () => {
  const song = await parseLrcFile(new File(['[00:01]夢を見よう\n[00:01]空を見よう\n[00:02]Sing with me\n[00:02]和我一起唱'], '原创.lrc'))
  assert.deepEqual(song.lines.map(x=>[x.text,x.translation]), [['夢を見よう',''],['空を見よう',''],['Sing with me','和我一起唱']])
})
