import assert from 'node:assert/strict'
import test from 'node:test'
import { lyricSurface, plainLyric, prepareLyricReadings, sourceRomajiKana, tokenReading } from '../src/lib/lyricReadings.js'
import { lineReading } from '../src/lib/readingDisplay.js'
import { annotationMatchesLine } from '../src/lib/learningIdentity.js'
import { commitEditedLine } from '../src/lib/lyricEditing.js'

const tokens=parts=>parts.map(([surface,reading,is_symbol=false],index)=>({index,surface,reading,is_symbol}))
// 回归：を后的思い出す以お开头，不能把其音节误当成助词变体而隐藏全句注音。
test('优先原文助词匹配，貴方日々思い出す均恢复来源注音',()=>{
  const input=tokens([['貴方','あなた'],['と','と'],['い','い'],['た','た'],['この','この'],['日々','ひび'],['を','を'],[' ','',true],['思い出す','おもいだす'],['でしょ','でしょ'],['う','う']])
  input[6].part_of_speech='助詞'
  for(const source of ['a nata to i ta ko no hi bi wo o mo i da su de sho u']){
    const result=prepareLyricReadings(input,source)
    assert.equal(result.aligned,true)
    for(const [surface,reading] of [['貴方','あなた'],['日々','ひび'],['思い出す','おもいだす']])assert.equal(result.tokens.find(t=>lyricSurface(t)===surface).source_reading,reading)
  }
  // 原文不出现 wo 时仍接受 o；确实有多个等价词界的句子继续保守处理。
  const variant=tokens([['君','きみ'],['を','を'],['見た','みた']]);variant[1].part_of_speech='助詞'
  assert.equal(prepareLyricReadings(variant,'ki mi o mi ta').aligned,true)
})
test('半角全角括号假名合并为汉字读音，原文缓存与后续索引保持',()=>{
  const input=tokens([['囚','しゅう'],['(', '',true],['とら','とら'],[')','',true],['われた','われた'],['淵','えん'],['（','',true],['ふち','ふち'],['）','',true]])
  const result=prepareLyricReadings(input,'',{},'s',0).tokens
  assert.deepEqual(result.map(lyricSurface),['囚','われた','淵'])
  assert.deepEqual(result.map(token=>token.index),[0,4,5])
  assert.equal(tokenReading(result[0],{},'s',0),'とら')
  assert.equal(tokenReading(result[0],{'s:0:0':'しゅう'},'s',0),'しゅう')
  assert.equal(tokenReading(prepareLyricReadings(input,'',{'s:0:2':'とらー'},'s',0).tokens[0],{'s:0:2':'とらー'},'s',0),'とらー')
  assert.ok(annotationMatchesLine({id:0,tokens:result},{id:0,text:input.map(t=>t.surface).join('')}))
  assert.equal(plainLyric('永遠(とわ)に歌う（もう一度）'),'永遠に歌う（もう一度）')
  const other=tokens([['永遠','えいえん'],['(','',true],['えいえん','えいえん'],[')','',true]])
  assert.equal(prepareLyricReadings(other,'to wa').tokens[0].source_reading,'とわ')
})
test('来源罗马音覆盖词典读音，假名罗马音双注音均使用同一数据',()=>{
  const input=tokens([['愛','あい'],['よ','よ'],['目覚め','めざめ'],['よ','よ'],['永遠','えいえん'],['に','に']]),source='a i yo me za me yo to wa ni'
  const result=prepareLyricReadings(input,source,{},'s',0)
  assert.ok(result.aligned)
  assert.equal(result.tokens[4].source_reading,'とわ')
  assert.equal(lineReading(input,{},'s',0,'hiragana',source),'あい よ めざめ よ とわ に')
  assert.equal(lineReading(input,{},'s',0,'both',source),'あい よ めざめ よ とわ に\n'+source)
  assert.equal(lineReading(input,{'s:0:4':'えいえん'},'s',0,'romaji',source),'ai yo mezame yo eien ni')
  assert.equal(tokenReading(prepareLyricReadings(input,source,{'s:0:4':''},'s',0).tokens[4],{'s:0:4':''},'s',0),'')
})

test('近づく的zu同音匹配不清空天空注音，假名保留づ而罗马音保留zu',()=>{
  const input=tokens([['近づく','ちかづく'],['あの','あの'],['はじまり','はじまり'],['の','の'],['天空','てんくう'],['(','',true],['そら','そら'],[')','',true],['へ','へ'],['…','',true]])
  input[8].part_of_speech='助詞'
  const source='chi ka zu ku a no ha ji ma ri no te n ku u e'
  const result=prepareLyricReadings(input,source)
  assert.equal(result.aligned,true)
  assert.equal(result.tokens[0].source_reading,'ちかづく')
  assert.equal(result.tokens.find(token=>lyricSurface(token)==='天空').source_reading,'てんくう')
  assert.equal(lineReading(input,{},'s',0,'hiragana',source),'ちかづく あの はじまり の てんくう へ')
  assert.equal(lineReading(input,{'s:0:4':'そら'},'s',0,'romaji',source),'chikazuku ano hajimari no sora e')
})
test('连续汉字合组使用自带注音，不用错误词典读法分割来源音节',()=>{
  const input=tokens([['明日','あした'],['晴天','せいてん']])
  const result=prepareLyricReadings(input,'a su se i te n',{},'s',0)
  assert.ok(result.aligned)
  assert.equal(result.tokens.length,1)
  assert.equal(lyricSurface(result.tokens[0]),'明日晴天')
  assert.equal(result.tokens[0].source_reading,'あすせいてん')
  assert.equal(lineReading(input,{'s:0:1':'せいせい'},'s',0,'hiragana','a su se i te n'),'あすせいせい')
  assert.equal(lineReading(input,{'s:0:0':'あした'},'s',0,'hiragana','a su se i te n'),'あしたせいてん')
})
test('英语原样保留，音节 n 边界及片假名长音正常匹配',()=>{
  assert.equal(sourceRomajiKana('news wo mi ru','newsを見る'),'newsをみる')
  assert.equal(sourceRomajiKana('shi n yo u'),'しんよう')
  const input=tokens([['コーヒー','こーひー'],['を','を'],['飲む','のむ']])
  assert.ok(prepareLyricReadings(input,'ko o hi i wo no mu').aligned)
})
// 回归用户反馈：已有错误假名缓存也必须默认原样显示，人工修改继续有效。
test('纯英文及混合日语中的英文默认原样，人工指定或清空优先',()=>{
  const input=tokens([['Never','ねヴぇr'],[' ','',true],["leave",'れあヴぇ'],[' ','',true],['me','め'],['!','',true]])
  for (const style of ['hiragana','romaji','both']) {
    assert.equal(lineReading(input,{},'s',0,style), 'Never leave me!')
    assert.equal(lineReading(input,{},'s',0,style,'ne ver le a ve me'), 'Never leave me!')
  }
  const mixed=tokens([['悲しい','かなしい'],['news','ねws'],['と','と']])
  assert.equal(lineReading(mixed,{},'s',0,'hiragana'),'かなしい news と')
  assert.equal(lineReading(mixed,{'s:0:1':'にゅーす'},'s',0,'hiragana'),'かなしい にゅーす と')
  assert.equal(lineReading(mixed,{'s:0:1':''},'s',0,'hiragana'),'かなしい と')
  const english=prepareLyricReadings(mixed).tokens[1]
  assert.equal(tokenReading(english,{},'s',0),'news')
  assert.equal(tokenReading(english,{'s:0:1':'にゅーす'},'s',0),'にゅーす')
})
test('无法确定对应时不错误分词，整句仍显示歌词自带读音且不修改原始数据',()=>{
  const input=tokens([['君','きみ'],['は','は'],['夢','ゆめ']]),before=JSON.stringify(input)
  const result=prepareLyricReadings(input,'to ra wa re ta',{},'s',0)
  assert.equal(result.aligned,false)
  assert.equal(result.tokens[0].source_reading,'')
  assert.equal(lineReading(input,{},'s',0,'hiragana','to ra wa re ta'),'とらわれた')
  assert.equal(JSON.stringify(input),before)
})
test('只修改翻译不把预填的来源注音变成人工校正，明确留空仍保存',()=>{
  const song={id:'s',isLocal:true,lines:[{id:0,start:0,text:'永遠',romaji:'to wa',translation:'永远'}]}
  const state={progress:{corrections:{},lyricSnapshots:{s:{lines:[{id:0,text:'永遠'}]}},learnedBySong:{s:[0]},reviewItems:[],favoriteSongIds:[]},annotations:{},aiReviews:{},sentenceExplanations:{}}
  const annotation={id:0,text:'永遠',tokens:prepareLyricReadings(tokens([['永遠','えいえん']]),'to wa').tokens}
  assert.deepEqual(commitEditedLine([song],state,'s',0,annotation,{0:'とわ'},'修改译文',[]).state.progress.corrections,{})
  assert.equal(commitEditedLine([song],state,'s',0,annotation,{0:''},'修改译文',[0]).state.progress.corrections['s:0:0'],'')
})
