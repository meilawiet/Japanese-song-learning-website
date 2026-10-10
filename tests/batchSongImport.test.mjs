import assert from 'node:assert/strict'
import { test } from 'node:test'
import { batchRowProblem, buildBatchImportRows, prepareBatchImport } from '../src/lib/batchSongImport.js'

const audio = (id, name, title = '', artist = '') => ({ id, file: { name }, metadata: { title, artist } })
const lyric = (id, name, title = name.replace(/\.lrc$/i,''), artist = '本地导入') => ({
  id, file: { name }, parsed: { title, artist, sourceFile: name, lines: [{ id: 0, start: 1, text: 'あめが降る', translation: '' }] },
})

test('batch pairs filenames independent of order, case, width and extension', () => {
  const audios = [audio('a','ＡＭＥ.MP3'),audio('b','春.wav')]
  const lyrics = [lyric('l2','春.lrc'),lyric('l1','ame.LRC')]
  const rows = buildBatchImportRows(audios,lyrics)
  assert.deepEqual(rows.map(row=>[row.audioId,row.lyricId]),[['a','l1'],['b','l2']])
  assert.ok(rows.every(row=>row.selected))
})

test('unique title and artist can match different filenames; filenames take priority', () => {
  const audios=[audio('a','01 track.mp3','雨','歌手'),audio('b','春.wav','wrong')]
  const lyrics=[lyric('l1','unrelated.lrc','雨','歌手'),lyric('l2','春.lrc','春の歌')]
  assert.deepEqual(buildBatchImportRows(audios,lyrics).map(row=>row.lyricId),['l1','l2'])
  assert.equal(buildBatchImportRows([audio('a','one.wav','雨','歌手A')],[lyric('l','two.lrc','雨','歌手B')])[0].lyricId,'')
})

test('ambiguous titles and duplicate filename candidates remain unpaired', () => {
  const audios=[audio('a','version-a.wav','雨'),audio('b','version-b.wav','雨')]
  const lyrics=[lyric('l1','one.lrc','雨'),lyric('l2','two.lrc','雨')]
  assert.ok(buildBatchImportRows(audios,lyrics).every(row=>!row.lyricId && !row.selected))
  assert.equal(buildBatchImportRows([audio('a','雨.wav')],[lyric('l1','雨.lrc'),lyric('l2','雨.LRC')])[0].lyricId,'')
})

test('adding files preserves edited metadata, deselection and manual pairing decisions', () => {
  const audios=[audio('a','雨.wav'),audio('b','春.wav')]
  const lyrics=[lyric('l1','雨.lrc'),lyric('l2','春.lrc')]
  const previous=[{audioId:'a',lyricId:'l2',title:'改名',artist:'自定义',selected:false,manualPair:true},
    {audioId:'b',lyricId:'',title:'春',artist:'',selected:false,manualPair:true}]
  assert.deepEqual(buildBatchImportRows(audios,lyrics,previous),previous)
})

test('invalid and unselected rows are not imported; original parsed lyrics stay unchanged', () => {
  const audios=[audio('a','雨.wav'),audio('b','坏.wav')]
  const lyrics=[lyric('l1','雨.lrc'),{id:'l2',file:{name:'坏.lrc'},error:'损坏的歌词'}]
  const rows=buildBatchImportRows(audios,lyrics)
  assert.equal(rows[1].selected,false)
  assert.equal(batchRowProblem(rows[1],rows,lyrics),'损坏的歌词')
  rows[0].title=' 修改后的歌名 '; rows[0].artist='新歌手'
  const [item]=prepareBatchImport(rows,audios,lyrics)
  assert.equal(item.parsed.title,'修改后的歌名');assert.equal(item.parsed.artist,'新歌手')
  assert.equal(item.audioFile.name,'雨.wav');assert.equal(item.parsed.sourceFile,'雨.lrc')
  assert.equal(lyrics[0].parsed.title,'雨')
  assert.throws(()=>prepareBatchImport(rows.map(row=>({...row,selected:false})),audios,lyrics),/至少一首/)
})

test('manual reuse of lyrics and a missing title cannot silently import the wrong song', () => {
  const audios=[audio('a','雨.wav'),audio('b','春.wav')], lyrics=[lyric('l1','雨.lrc')]
  const rows=buildBatchImportRows(audios,lyrics)
  rows[1]={...rows[1],lyricId:'l1',selected:true}
  assert.throws(()=>prepareBatchImport(rows,audios,lyrics),/另一首/)
  rows.pop();rows[0].title=' '
  assert.throws(()=>prepareBatchImport(rows,audios,lyrics),/填写歌曲名/)
})
