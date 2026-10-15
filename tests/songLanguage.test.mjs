import assert from 'node:assert/strict'
import {test,before,after} from 'node:test'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {detectSongLanguage,songLanguage,songReadingStyle,literalAnnotation,annotationForLanguage,literalReadingRows} from '../src/lib/songLanguage.js'
import {resegmentLyricTokens} from '../src/lib/lyricSegmentation.js'
import {defaultManualReadingMode,prepareManualReading} from '../src/lib/manualReading.js'
import {displayReading} from '../src/lib/readingDisplay.js'
import {createLearningBackup,inspectLearningBackup,songsFromLearningBackup} from '../src/lib/learningBackup.js'

// 语种只读取原文，覆盖六种实测语言、短句歧义和混合语言。
test('四类语言识别不受翻译、歌手或来源标注污染',()=>{
  for(const [text,language] of [['我喜欢这首歌','zh'],['帰り道は夕日を背に','ja'],['너 없이 잘 살 수 있다고','ko'],["I don't know",'other'],['étoile et toi','other'],['Über den Wolken','other'],['Расцветали яблони','other']]){
    assert.equal(detectSongLanguage([{text,translation:'日语かな 韩文한',romaji:'わたし'}]).language,language)
  }
  assert.equal(detectSongLanguage([{text:'明日'}]).uncertain,true)
  assert.equal(songLanguage({language:'ja',lines:[{text:'明日'}]}),'ja')
  assert.equal(detectSongLanguage([{text:'君と stay with me'}]).language,'ja')
})

test('非日语词界保留撇号、重音组合与原始空格，中文整句不自动分词',()=>{
  const text="I don't re-enter l’amour cafe\u0301.  Next!"
  const annotation=literalAnnotation({id:0,text},'other')
  assert.equal(annotation.tokens.map(token=>token.surface).join(''),text)
  for(const word of ["don't",'re-enter','l’amour','cafe\u0301'])assert.ok(annotation.tokens.some(token=>token.surface===word))
  assert.equal(literalAnnotation({id:0,text:'我喜欢这首歌'},'zh').tokens.length,1)
  assert.equal(songReadingStyle('zh','both'),'none')
  assert.equal(songReadingStyle('ko','both'),'none')
  assert.equal(songReadingStyle('other','romaji'),'romaji')
  assert.equal(songReadingStyle('ja','both'),'both')
})

test('非日语忽略旧词典读音，但保留人工索引、主动留空及来源整句标注',()=>{
  const line={id:2,text:"don't"},cached={...line,tokens:[{index:9,surface:"don't",reading:'どんと'}]}
  assert.equal(annotationForLanguage(line,'other',cached,{},'s').tokens[0].reading,'')
  const corrections={'s:2:9':''}
  const kept=annotationForLanguage(line,'other',cached,corrections,'s')
  assert.equal(kept.tokens[0].index,9)
  const source='neo eop xxi'
  assert.deepEqual(literalReadingRows(kept.tokens,corrections,'s',2,source),{readings:[''],source})
  assert.equal(literalReadingRows(kept.tokens,corrections,'s',2,source,{showSourceReadings:false}).source,'')
})

test('原样输入方式重新编辑和显示时不转换，无法分配的人工标注保留待处理',()=>{
  const token={index:0,surface:'bonjour',reading:'',manual_reading_mode:'literal'}
  assert.equal(defaultManualReadingMode(token,'你好 / かな'),'literal')
  assert.equal(displayReading('你好 / かな','romaji',token,true),'你好 / かな')
  assert.equal(prepareManualReading('你好 pīnyīn かな','literal'),'你好 pīnyīn かな')
  const result=resegmentLyricTokens([token],['bon','jour'],{0:'蹦 朱尔'},new Set([0]),'other')
  assert.deepEqual(result.tokens[0].pending_readings,['蹦 朱尔'])
  assert.equal(result.tokens.map(t=>t.surface).join(''),'bonjour')
  assert.ok(Object.values(result.readings).every(value=>value===''))
  const brackets=literalAnnotation({id:0,text:'花（はな）'},'zh')
  assert.equal(resegmentLyricTokens(brackets.tokens,['花','（はな）'],{},new Set(),'zh').tokens.map(t=>t.surface).join(''),'花（はな）')
})

test('语言、单曲显示偏好、人工输入类型和待分配内容完整往返备份',async()=>{
  const song={id:'local-languages',title:'原创测试',artist:'UTA',language:'other',lyricsOnly:true,audioBlob:null,lines:[{id:0,start:null,text:'bonjour',translation:'你好',romaji:'来源发音'}]}
  const state={progress:{learnedBySong:{},reviewItems:[],favoriteSongIds:[],corrections:{'local-languages:0:0':'蹦朱尔'},meaningOverrides:{},songSettings:{[song.id]:{language:'other',readingStyle:'romaji',showTranslation:false,showSourceReadings:false,showManualReadings:true}}},annotations:{[song.id]:[{id:0,text:'bonjour',language:'other',tokens:[{index:0,surface:'bonjour',reading:'',manual_reading_mode:'literal',segmentation_locked:true,pending_readings:['原标注']}]}]},aiReviews:{},sentenceExplanations:{}}
  const inspection=await inspectLearningBackup(createLearningBackup([song],state))
  assert.deepEqual(inspection.manifest.progress.songSettings,state.progress.songSettings)
  assert.deepEqual(inspection.manifest.annotations,state.annotations)
  assert.equal(songsFromLearningBackup(inspection)[0].language,'other')
  assert.equal(songsFromLearningBackup(inspection)[0].lines[0].romaji,'来源发音')
  const invalid={...state,progress:{...state.progress,songSettings:{s:{language:'invalid'}}}}
  assert.throws(()=>createLearningBackup([song],invalid),/语言|显示选项/)
})

let vite
before(async()=>{vite=await createServer({server:{middlewareMode:true,watch:{ignored:['**/.tools/**','**/server/.venv/**']}},appType:'custom',logLevel:'silent'})})
after(async()=>{await vite?.close()})

test('外语显示没有重复小字、日语对齐警告或额外词间距；手动标注与整句来源独立显示',async()=>{
  const Component=(await vite.ssrLoadModule('/src/components/AnnotatedLine.jsx')).default
  const line={id:0,text:"I don't know"},tokens=literalAnnotation(line,'other').tokens
  const props={...line,tokens,language:'other',corrections:{},songId:'s',lineId:0,readingStyle:'romaji'}
  const html=renderToStaticMarkup(createElement(Component,props))
  assert.ok(!html.includes('<ruby')&&!html.includes('<rt')&&!html.includes('word-aligned'))
  assert.equal((html.match(/don&#x27;t/g)||[]).length,1)
  const withReading=renderToStaticMarkup(createElement(Component,{...props,corrections:{'s:0:2':'任意标注'},importedRomaji:'整句来源'}))
  assert.ok(withReading.includes('<rt>任意标注</rt>')&&withReading.includes('整句来源'))
  assert.ok(!withReading.includes('尚未按词对齐'))
  const hidden=renderToStaticMarkup(createElement(Component,{...props,readingStyle:'none',importedRomaji:'不可见'}))
  assert.ok(!hidden.includes('不可见'))
})

test('中文编辑禁用自动分词和注音但保留自定义分词，韩语编辑不提供罗马音转换',async()=>{
  const Editor=(await vite.ssrLoadModule('/src/components/LyricLineEditor.jsx')).default
  const Options=(await vite.ssrLoadModule('/src/components/ReadingStyleOptions.jsx')).default
  for(const language of ['zh','ko','other']){
    const line={id:0,text:language==='zh'?'测试歌词':language==='ko'?'노래 가사':'sample words'}
    const html=renderToStaticMarkup(createElement(Editor,{song:{id:'s',language,lines:[line]},line,corrections:{}}))
    assert.ok(html.includes('自定义分词')&&!html.includes('日语罗马音转假名'))
    assert.ok(!html.includes('>重新注音<'))
    if(language==='zh')assert.ok(!html.includes('line-editor-readings'))
    const options=renderToStaticMarkup(createElement(Options,{language,readingStyle:'none'}))
    if(language==='zh')assert.equal(options,'')
    else assert.ok(options.includes('自定义注音')&&!options.includes('平假名'))
  }
})
