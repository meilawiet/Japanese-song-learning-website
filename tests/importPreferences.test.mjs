import test from 'node:test'
import assert from 'node:assert/strict'
import {splitKanjiOkuriganaTokens} from '../src/lib/defaultSegmentation.js'
import {shouldPromptUpdate,ignoreUpdateVersion} from '../src/lib/updatePreference.js'
import {splitUtatenPhrases} from '../src/lib/utatenLyrics.js'
import {prepareLyricReadings,tokenReading} from '../src/lib/lyricReadings.js'
import {parseLyricDocument} from '../src/lib/lyricDocument.js'

test('忽略的是待更新版本，重启保留；手动检查和更高版本仍提示',()=>{
 const saved=new Map(),storage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)}
 assert.equal(shouldPromptUpdate('1.4.0',false,storage),true)
 ignoreUpdateVersion('v1.4.0',storage)
 assert.equal(shouldPromptUpdate('1.4.0',false,storage),false)
 assert.equal(shouldPromptUpdate('1.4.0',true,storage),true)
 assert.equal(shouldPromptUpdate('1.4.1',false,storage),true)
})
test('新分词将汉字和送假名分开，连续汉字、人工词界与原对象不变',()=>{
 const input=[{index:0,surface:'抱きしめ',reading:'だきしめ'},{index:1,surface:'静寂',reading:'せいじゃく'},{index:2,surface:'帰り道',reading:'かえりみち'},{index:3,surface:'歩く',reading:'あるく',segmentation_locked:true}]
 const result=splitKanjiOkuriganaTokens(input)
 assert.deepEqual(result.map(t=>t.surface),['抱','きしめ','静寂','帰','り','道','歩く'])
 assert.deepEqual(result.map(t=>t.index),[0,1,2,3,4,5,6])
 assert.equal(result.map(t=>t.reading).join(''),input.map(t=>t.reading).join(''))
 assert.equal(input[0].surface,'抱きしめ')
 const prepared=prepareLyricReadings(result.slice(0,2),'dakishime',{},'test',0)
 assert.equal(prepared.aligned,true);assert.equal(tokenReading(prepared.tokens[0],{},'test',0),'だ')
 assert.equal(splitKanjiOkuriganaTokens([{surface:'読め',reading:''}]).length,1)
})
test('仅 UtaTen 日文短语空格拆句，注音按片段保留；不拆英文空格、ruby 或网易云时间轴',()=>{
 const row={text:'庭で歌う 空を見る',segments:[{surface:'庭',kana:'にわ'},{surface:'で歌う '},{surface:'空',kana:'そら'},{surface:'を見る'}]}
 const parts=splitUtatenPhrases(row)
 assert.deepEqual(parts.map(p=>p.text),['庭で歌う','空を見る'])
 assert.equal(parts[0].segments[0].kana,'にわ');assert.equal(parts[1].segments[0].kana,'そら')
 assert.equal(splitUtatenPhrases({segments:[{surface:'Stay with me'}]}).length,1)
 assert.equal(splitUtatenPhrases({segments:[{surface:'庭 空',kana:'にわそら'}]}).length,1)
 const timed=parseLyricDocument('[00:01.20]庭で歌う 空を見る')
 assert.equal(timed.lines.length,1);assert.equal(timed.lines[0].start,1.2)
})
