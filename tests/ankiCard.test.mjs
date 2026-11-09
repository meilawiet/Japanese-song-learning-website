import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ANKI_COVER_SLOT,ankiAudioBounds,ankiCardFields,ankiClipBase64,ankiContextKey,ankiExample,ankiGrammar,ankiWord,ankiWordKey,collectAnkiEntries,encodeAnkiWav,mergeAnkiExample,prepareAnkiCover,readAnkiCard} from '../src/lib/ankiCard.js'
import {prepareSentenceRequest,validateSentenceResult} from '../src/lib/sentenceAnalysis.js'
import {sentenceTeachingPrompt} from '../src/lib/sentenceTeachingPrompt.js'
import {readAnkiDeck,retryAnkiDeckRead,saveAnkiDeck} from '../src/lib/ankiSettings.js'

// 原创例句和虚拟音频标签验证三次添加，测试不依赖私人歌词或真实牌组。
const fixture=[
  ['咲いた','庭の花が咲いた。','た形','开花已经发生'],
  ['咲いて','桜が咲いて、春が来た。','て形','接续后半句'],
  ['咲けば','桜が咲けば、また会える。','ば形','提出条件'],
]
const wordFor=([surface,,form,usage])=>ankiWord({surface,dictionary_form:'咲く',dictionary_reading:'さく',part_of_speech:'动词',verb_class:'カ行五段动词',transitivity:'自动词',meaning:'开花',form,usage})
const exampleFor=(word,index)=>({...ankiExample({id:`song-${index}`,title:`歌曲 ${index}`},[{id:1,text:fixture[index][1]}],word),audio:`[sound:clip-${index}.wav]`})

test('学习复习设置的默认牌组与制卡共用，旧版只存 ID 的记录仍有效',()=>{
  const state=new Map([['uta-anki-deck-v1','1740035925361']])
  const storage={getItem:key=>state.get(key),setItem:(key,value)=>state.set(key,value),removeItem:key=>state.delete(key)}
  assert.deepEqual(readAnkiDeck(storage),{id:'1740035925361',name:''})
  saveAnkiDeck({id:'1740035925362',name:'日语词汇'},storage)
  assert.deepEqual(readAnkiDeck(storage),{id:'1740035925362',name:'日语词汇'})
  saveAnkiDeck(null,storage)
  assert.equal(readAnkiDeck(storage),null)
})

test('制卡复用旧解析明确写在用法开头的词性，不从用法中的任意字词猜测',async()=>{
  const cached={surface:'雨上がり',reading:'あめあがり',meaning:'雨停之后',usage:'名词，常修饰后面的名词。'}
  const word=ankiWord(cached)
  assert.equal(word.pos,'名词')
  assert.equal(word.keyReady,true)
  assert.equal(await ankiWordKey(word),await ankiWordKey(ankiWord({...cached,part_of_speech:'名词'})))
  assert.equal(ankiWord({...cached,usage:'常修饰后面的名词。'}).keyReady,false)
})

test('Anki 牌组暂时不可读会有限重试，权限和写入失败原样返回',async()=>{
  const unavailable=Object.assign(new Error('牌组暂时不可读'),{code:'ANKI_DECKS_UNAVAILABLE'})
  const waits=[]
  const wait=async delay=>{waits.push(delay)}
  let attempts=0
  const read=async()=>{
    if(++attempts<3)throw unavailable
    return {decks:[]}
  }
  assert.deepEqual(await retryAnkiDeckRead(read,wait),{decks:[]})
  assert.equal(attempts,3)
  assert.deepEqual(waits.splice(0),[300,700])
  await assert.rejects(retryAnkiDeckRead(async()=>{throw unavailable},wait),error=>error===unavailable)
  assert.deepEqual(waits.splice(0),[300,700])
  const denied=new Error('未授权')
  await assert.rejects(retryAnkiDeckRead(async()=>{throw denied},wait),error=>error===denied)
  assert.deepEqual(waits,[])
})

test('三种活用查同一词条，补充后有三段音频和对应语境，独立保存只生成一组',async()=>{
  const [first,second,third]=fixture.map(wordFor)
  const key=await ankiWordKey(first)
  assert.equal(await ankiWordKey(second),key)
  assert.equal(await ankiWordKey(third),key)
  assert.notEqual(await ankiWordKey({...first,reading:'さけ'}),key)
  assert.notEqual(await ankiWordKey(ankiWord({surface:'咲いた',reading:'さいた'})),key)
  let note
  for(const [index,word] of [first,second,third].entries()){
    note=mergeAnkiExample(note,word,exampleFor(word,index))
  }
  const fields=ankiCardFields(key,note)
  assert.match(fields[1],/咲いた.*clip-0\.wav.*咲いて.*clip-1\.wav.*咲けば.*clip-2\.wav/)
  assert.match(fields[2],/咲く.*カ行五段动词.*自动词.*さく.*开花.*开花已经发生.*接续后半句.*提出条件/)
  assert.equal(readAnkiCard({id:'101',fields},key).editable,true)
  assert.equal(readAnkiCard({id:'101',fields:[key,fields[1]+'手动编辑',...fields.slice(2)]},key).editable,false)
  assert.equal(mergeAnkiExample(null,second,exampleFor(second,1)).examples.length,1)
})

test('同一歌词范围更新讲解时保留音频，不新增例句，歌词 HTML 与伪音频标签正确转义',async()=>{
  const word=wordFor(fixture[0])
  const example=exampleFor(word,0)
  const first=mergeAnkiExample(null,word,example)
  const updated=mergeAnkiExample(first,word,{...example,audio:'',usage:'更正说明',lyric:'<b>咲いた</b>[sound:fake.wav]'})
  assert.equal(updated.examples.length,1)
  const [key,front,back]=ankiCardFields(await ankiWordKey(word),updated)
  assert.match(key,/^uta_[0-9a-f]{64}$/)
  assert.match(front,/&lt;b&gt;咲いた&lt;\/b&gt;&#91;sound:fake.wav&#93;/)
  assert.match(front,/\[sound:clip-0\.wav\]/)
  assert.match(back,/更正说明/)
})

test('同一句从纯文字卡补齐讲解时，原语境键仍可定位',async()=>{
  const word=wordFor(fixture[0])
  const old=exampleFor(ankiWord({surface:word.surface}),0),next=exampleFor(word,0)
  assert.equal(word.keyReady,true)
  assert.equal(ankiWord({surface:word.surface,part_of_speech:'动词',reading:'さいた'}).keyReady,false)
  assert.equal(await ankiContextKey(old),await ankiContextKey(next))
  assert.notEqual(await ankiContextKey(next),await ankiWordKey(word))
})

test('选段 WAV 按当前时间范围截取，缺失时间或过长片段使用文字路径',()=>{
  const lines=[{id:3,start:1},{id:4,start:2},{id:5,start:3}]
  assert.deepEqual(ankiAudioBounds({lines},lines.slice(0,2),8),{start:1,end:3})
  assert.equal(ankiAudioBounds({lines},[{id:3,start:null}],8),null)
  assert.equal(ankiAudioBounds({lines},[lines[2]],100),null)
  const channel=Float32Array.of(0,.25,-.5,1)
  const wav=new DataView(encodeAnkiWav({sampleRate:2,length:4,numberOfChannels:1,getChannelData:()=>channel},{start:.5,end:1.5}))
  assert.equal(wav.byteLength,48)
  assert.equal(wav.getUint32(40,true),4)
  assert.equal(wav.getInt16(44,true),8192)
  assert.equal(wav.getInt16(46,true),-16383)
})

test('Anki 导出使用裁剪边界，拒绝越界且不改动歌曲时间戳',async t=>{
  const lines=[{id:1,start:1},{id:2,start:4}]
  const song={lines},trim={start:1.5,end:2.5}
  assert.deepEqual(ankiAudioBounds(song,[lines[0]],4,trim),trim)
  assert.equal(ankiAudioBounds(song,[lines[0]],4,{start:0,end:2.5}),null)
  assert.equal(ankiAudioBounds(song,[lines[0]],4,{start:1.5,end:4.1}),null)
  assert.equal(ankiAudioBounds(song,[lines[0]],4,{start:2,end:2}),null)

  const samples=Float32Array.of(0,0,0,.25,-.5,1,1,1)
  t.mock.method(globalThis,'fetch',async()=>new Response(new Blob(['audio'])))
  // 模拟浏览器解码和读取，校验实际传给 Anki 的 WAV 数据。
  t.after(()=>{delete globalThis.OfflineAudioContext;delete globalThis.FileReader})
  globalThis.OfflineAudioContext=class {
    async decodeAudioData(){return {sampleRate:2,length:samples.length,numberOfChannels:1,getChannelData:()=>samples}}
  }
  globalThis.FileReader=class {
    async readAsDataURL(blob){
      this.result='data:audio/wav;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64')
      this.onload()
    }
  }
  const bytes=Buffer.from(await ankiClipBase64('blob:fixture',song,[lines[0]],4,trim),'base64')
  assert.equal(bytes.readUInt32LE(40),4)
  assert.deepEqual([bytes.readInt16LE(44),bytes.readInt16LE(46)],[8192,-16383])
  assert.deepEqual(lines.map(line=>line.start),[1,4])
})

test('制卡候选只来自已生成的关键表达，保留固定搭配并跳过分词候选与过期解析',()=>{
  const text='花が咲いて、胸がいっぱいになる。'
  const request=prepareSentenceRequest([{id:4,text}],'ja','N4','concise')
  const [line]=request.lines
  const raw={explanations:[{
    line_id:line.id,line_key:line.line_key,source_text:text,meaning:'心里涌起复杂的情绪。',
    vocabulary:[
      {surface:'花',meaning:'花',part_of_speech:'名词'},
      {surface:'胸がいっぱいになる',kind:'phrase',meaning:'情绪涌上心头',part_of_speech:'惯用语',usage:'表示情感充满内心。'},
      {surface:'咲いて',meaning:'开花',dictionary_form:'咲く',dictionary_reading:'さく',form:'て形',part_of_speech:'动词'},
    ],
  }]}
  const [entry]=validateSentenceResult(raw,request).explanations
  assert.equal(entry.vocabulary.length,2)
  assert.equal(entry.vocabulary[1].kind,'phrase')
  assert.equal(entry.vocabulary[0].part_of_speech,'名词')
  const following={id:5,text:'風が吹く。'}
  const cache={
    4:{text,language:'ja',explanation:{...entry,vocabulary:[...entry.vocabulary,{surface:'咲いて',reading:'さいて'}]}},
    5:{text:'前の風',language:'ja',explanation:{meaning:'旧解析',vocabulary:[{surface:'風',meaning:'风'}]}},
  }
  assert.deepEqual(collectAnkiEntries([line,following],cache).map(item=>item.label),['花','胸がいっぱいになる'])
  assert.deepEqual(collectAnkiEntries([following],{}),[])
  const [detail]=validateSentenceResult(raw,{...request,teaching_mode:'detailed'}).explanations
  assert.equal(detail.vocabulary.length,3)
  assert.equal(detail.vocabulary[2].dictionary_reading,'さく')
  raw.explanations[0].vocabulary.push({surface:'上一句的词',meaning:'不在原文'})
  assert.throws(()=>validateSentenceResult(raw,request),/原文或编号不对应/)
  assert.match(sentenceTeachingPrompt('ja','N4','concise'),/固定搭配或惯用语整体/)
  assert.doesNotMatch(sentenceTeachingPrompt('ja','N4','concise'),/target_expression/)
})

test('每条 AI 语法可单独制卡，修改标题和讲解保持同一原语境键',async()=>{
  const lines=[{id:8,text:'花が咲けば、春が来る。'}]
  const points=['「ば」表示条件。','「が」标记主语。']
  const entries=collectAnkiEntries(lines,{8:{text:lines[0].text,explanation:{meaning:'花开了，春天就来了。',grammar:points}}})
  assert.deepEqual(entries.map(item=>item.word.surface),['ば','が'])
  const original=ankiGrammar(points[0],8)
  const edited={...original,surface:'条件形',lemma:'条件形',meaning:'先提出花开的条件。<示例>'}
  const song={id:'fixture',title:'原创语境'}
  const example=ankiExample(song,lines,edited)
  assert.equal(example.id,ankiExample(song,lines,original).id)
  assert.notEqual(example.id,ankiExample(song,lines,entries[1].word).id)
  const card={word:edited,examples:[{...example,audio:'[sound:fixture.wav]'}]}
  const key=await ankiContextKey(example)
  const fields=ankiCardFields(key,card)
  const [,front,back]=ankiCardFields(key,card,{preview:true})
  assert.match(front,/条件形.*附原唱片段.*原创语境/)
  assert.match(fields[1],/\[sound:fixture\.wav\]/)
  assert.equal(back,fields[2])
  assert.match(back,/先提出花开的条件。&lt;示例&gt;/)
  assert.equal(readAnkiCard({fields},key).editable,true)
})

test('新版排版仅在卡面显示本地封面，兼容原卡并保留各段音频',async()=>{
  const word=wordFor(fixture[0])
  const first={...exampleFor(word,0),cover:'uta-cover-example.jpg'}
  const second={...exampleFor(word,1),cover:ANKI_COVER_SLOT}
  const key=await ankiWordKey(word)
  const legacy={word,examples:[first]}
  assert.equal(readAnkiCard({fields:ankiCardFields(key,legacy)},key).editable,true)
  const card={layout:2,...mergeAnkiExample(legacy,word,second)}
  const [,front,back]=ankiCardFields(key,card)
  assert.match(front,/src="uta-cover-example.jpg"/)
  assert.match(front,new RegExp(ANKI_COVER_SLOT))
  assert.equal((front.match(/\[sound:/g)||[]).length,2)
  assert.doesNotMatch(back,/<img/)
  const previewCover='data:image/jpeg;base64,/9j/'
  assert.equal(await prepareAnkiCover(previewCover),previewCover)
  const [,preview]=ankiCardFields(key,card,{preview:true,previewCover})
  assert.match(preview,/src="data:image\/jpeg;base64,/)
  assert.doesNotMatch(preview,/\[sound:|UTA_PENDING_COVER/)
  const stored={...card,examples:[first,{...second,cover:'uta-cover-another.jpg'}]}
  assert.equal(readAnkiCard({fields:ankiCardFields(key,stored)},key).editable,true)
  assert.doesNotMatch(ankiCardFields(key,{...card,examples:[{...first,cover:'https://invalid.example/photo.jpg'}]})[1],/<img/)
})
