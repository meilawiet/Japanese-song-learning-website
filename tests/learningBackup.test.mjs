import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLearningBackup, inspectLearningBackup, songsFromLearningBackup } from '../src/lib/learningBackup.js'

const state = {
  progress: {
    learnedBySong: { 'local-test': [0] },
    reviewItems: [],
    favoriteSongIds: ['local-test'],
    corrections: { 'local-test:0:0': 'ゆめ' },
    meaningOverrides: {},
    playbackRate: 0.75,
    readingStyle: 'romaji',
    lyricSnapshots: { 'local-test': { sourceFile: 'test.lrc', lines: [{ id: 0, text: '夢ならば' }] } },
  },
  annotations: {},
  aiReviews: {},
  sentenceExplanations: {
    'local-test': {
      0: { text: '夢ならば', explanation: { meaning: '如果是梦', grammar: [], vocabulary: [], pronunciation_tip: '' } },
    },
  },
}

const song = {
  id: 'local-test', isLocal: true, title: 'テスト', artist: '歌手',
  sourceFile: 'test.lrc', audioName: 'test.mp3',
  lines: [{ id: 0, start: 1.5, text: '夢ならば', translation: '如果是梦' }],
  audioBlob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' }),
}

// 新显示偏好必须随歌曲学习设置恢复，同时拒绝无法识别的位置值。
test('罗马音位置按歌曲备份往返并校验，兼容没有位置设置的旧备份', async () => {
  for (const romajiPosition of ['above','below']) {
    const next = {...state,progress:{...state.progress,songSettings:{'local-test':{romajiPosition,readingStyle:'both'}}}}
    const result = await inspectLearningBackup(createLearningBackup([song],next))
    assert.equal(result.manifest.progress.songSettings['local-test'].romajiPosition,romajiPosition)
  }
  const bad = {...state,progress:{...state.progress,songSettings:{'local-test':{romajiPosition:'side'}}}}
  assert.throws(()=>createLearningBackup([song],bad), /显示选项无效/)
})

// 项目歌曲的时间覆盖随备份恢复，损坏的覆盖记录不能进入学习数据。
test('单句时间覆盖备份往返，拒绝负数与错误结构',async()=>{
  const timeOverrides={0:{text:'夢ならば',baseStart:1.5,start:1.7}}
  const next={...state,progress:{...state.progress,songSettings:{'folder-test':{timeOverrides}}}}
  const result=await inspectLearningBackup(createLearningBackup([song],next))
  assert.deepEqual(result.manifest.progress.songSettings['folder-test'].timeOverrides,timeOverrides)
  for(const bad of [{0:{text:'夢',baseStart:0,start:-1}},[],{invalid:{text:'夢',baseStart:0,start:1}}]){
    assert.throws(()=>createLearningBackup([song],{...state,progress:{...state.progress,songSettings:{s:{timeOverrides:bad}}}}),/显示选项无效/)
  }
})

test('歌曲时间戳重置原点可备份恢复，拒绝损坏原点',async()=>{
  const edited={...song,lines:song.lines.map(line=>({...line,start:1.7,timestampOriginalStart:1.5}))}
  const inspection=await inspectLearningBackup(createLearningBackup([edited],state))
  const [restored]=songsFromLearningBackup(inspection)
  assert.equal(restored.lines[0].timestampOriginalStart,1.5)
  assert.throws(()=>createLearningBackup([{...edited,lines:edited.lines.map(line=>({...line,timestampOriginalStart:-1}))}],state),/歌词格式/)
})

// 云备份和恢复既支持旧的纯歌词覆盖，也支持新翻译和空翻译。
test('单句翻译覆盖记录备份往返且兼容旧字符串', async () => {
  const next = { ...state, progress: { ...state.progress, lyricEditsBySong: { demo: { 0: { text: '夢', translation: '梦' }, 1: { text: '歌', translation: '' }, 2: '明日' } } } }
  const backup = createLearningBackup([song], next)
  const inspection = await inspectLearningBackup(backup)
  assert.deepEqual(inspection.manifest.progress.lyricEditsBySong, next.progress.lyricEditsBySong)
})

test('backed-up songs, audio and learning state round-trip', async () => {
  const backup = createLearningBackup([song], state)
  const inspection = await inspectLearningBackup(backup)
  const [restored] = songsFromLearningBackup(inspection)
  assert.equal(inspection.manifest.progress.corrections['local-test:0:0'], 'ゆめ')
  assert.deepEqual(inspection.manifest.progress.lyricSnapshots, state.progress.lyricSnapshots)
  assert.equal(inspection.manifest.progress.readingStyle, 'romaji')
  assert.equal(inspection.manifest.sentenceExplanations['local-test'][0].explanation.meaning, '如果是梦')
  assert.equal(restored.lines[0].translation, '如果是梦')
  assert.equal(restored.audioName, 'test.mp3')
  assert.equal(restored.audioBlob.type, 'audio/mpeg')
  assert.deepEqual([...new Uint8Array(await restored.audioBlob.arrayBuffer())], [1, 2, 3, 4])
})

test('empty song library still backs up learning data', async () => {
  const inspection = await inspectLearningBackup(createLearningBackup([], state))
  assert.deepEqual(inspection.manifest.songs, [])
  assert.deepEqual(songsFromLearningBackup(inspection), [])
})

test('uploaded covers and built-in song choices survive backup and restore', async () => {
  // 上传图片压缩后作为 data URL 保存；备份和电脑传歌都应保留用户选择。
  const artworkUrl = 'data:image/jpeg;base64,/9j/2Q=='
  const withArtwork = { ...song, artworkUrl, artworkProvider: '本地上传', artworkChoice: 'selected' }
  const withOverrides = { ...state, artworkOverrides: { 'demo-song': { artworkUrl, artworkProvider: '本地上传' } } }
  const inspected = await inspectLearningBackup(createLearningBackup([withArtwork], withOverrides))
  assert.equal(songsFromLearningBackup(inspected)[0].artworkUrl, artworkUrl)
  assert.equal(inspected.manifest.artworkOverrides['demo-song'].artworkUrl, artworkUrl)
})

test('damaged or unrelated files are rejected before restore', async () => {
  const backup = createLearningBackup([song], state)
  await assert.rejects(inspectLearningBackup(new Blob(['not a backup'])), /UTA 备份/)
  await assert.rejects(inspectLearningBackup(backup.slice(0, backup.size - 1)), /不完整/)
})

test('backups created before whole-line analysis remain restorable', async () => {
  const backup = createLearningBackup([song], state)
  const signatureLength = new TextEncoder().encode('UTA-LEARNING-BACKUP\n').byteLength
  const headerSize = signatureLength + 4
  const lengthBytes = await backup.slice(signatureLength, headerSize).arrayBuffer()
  const metadataLength = new DataView(lengthBytes).getUint32(0, true)
  const manifest = JSON.parse(await backup.slice(headerSize, headerSize + metadataLength).text())
  delete manifest.sentenceExplanations
  delete manifest.progress.lyricSnapshots
  delete manifest.progress.readingStyle
  const metadata = new TextEncoder().encode(JSON.stringify(manifest))
  const nextLength = new Uint8Array(4)
  new DataView(nextLength.buffer).setUint32(0, metadata.byteLength, true)
  const legacy = new Blob([
    backup.slice(0, signatureLength), nextLength, metadata,
    backup.slice(headerSize + metadataLength),
  ])
  const inspected = await inspectLearningBackup(legacy)
  assert.deepEqual(inspected.manifest.sentenceExplanations, {})
  assert.equal(inspected.manifest.progress.lyricSnapshots, undefined)
  assert.equal(inspected.manifest.progress.readingStyle, undefined)
})

test('invalid lyric snapshots cannot be saved in backups', () => {
  const invalid = { ...state, progress: { ...state.progress, lyricSnapshots: { broken: { lines: 'not an array' } } } }
  assert.throws(() => createLearningBackup([], invalid), /学习记录格式不正确/)
})

test('unsupported reading styles are rejected by backup validation', () => {
  assert.throws(() => createLearningBackup([], { ...state, progress: { ...state.progress, readingStyle: 'invalid' } }), /学习记录格式不正确/)
})

// 双注音设置也必须通过 WebDAV 使用的备份验证并完整恢复。
test('双注音设置可备份与恢复', async () => {
  const inspection = await inspectLearningBackup(createLearningBackup([], { ...state, progress:{ ...state.progress, readingStyle:'both' } }))
  assert.equal(inspection.manifest.progress.readingStyle, 'both')
})

// 文件自带的罗马音应随歌词进入备份并恢复，旧备份仍可缺省。
test('导入的罗马音可完整备份恢复', async () => {
  const withRomaji = {...song, lines:song.lines.map(line=>({...line,romaji:'yu me na ra ba'}))}
  const inspection = await inspectLearningBackup(createLearningBackup([withRomaji],state))
  assert.equal(songsFromLearningBackup(inspection)[0].lines[0].romaji,'yu me na ra ba')
  assert.throws(()=>createLearningBackup([{...withRomaji,lines:[{...withRomaji.lines[0],romaji:42}]}],state),/歌词格式/)
})

// 新菜单的不注音设置也必须通过备份校验。
test('不注音设置可备份恢复且不丢人工校正',async()=>{
  const inspection=await inspectLearningBackup(createLearningBackup([],{...state,progress:{...state.progress,readingStyle:'none'}}))
  assert.equal(inspection.manifest.progress.readingStyle,'none')
  assert.deepEqual(inspection.manifest.progress.corrections,state.progress.corrections)
})
