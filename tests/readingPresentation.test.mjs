import test from 'node:test'
import assert from 'node:assert/strict'
import {kanjiReadingParts} from '../src/lib/readingPresentation.js'

test('完整读音的假名仅分配给汉字，送假名和纯假名不重复标注',()=>{
 assert.deepEqual(kanjiReadingParts('伝え','つたえ'),[{surface:'伝',kana:'つた'},{surface:'え',kana:''}])
 assert.deepEqual(kanjiReadingParts('抱きしめ','だきしめ'),[{surface:'抱',kana:'だ'},{surface:'きしめ',kana:''}])
 assert.deepEqual(kanjiReadingParts('帰り道','かえりみち'),[{surface:'帰',kana:'かえ'},{surface:'り',kana:''},{surface:'道',kana:'みち'}])
 assert.deepEqual(kanjiReadingParts('弱さ','よわさ'),[{surface:'弱',kana:'よわ'},{surface:'さ',kana:''}])
 assert.deepEqual(kanjiReadingParts('お祝い','おいわい'),[{surface:'お',kana:''},{surface:'祝',kana:'いわ'},{surface:'い',kana:''}])
 assert.deepEqual(kanjiReadingParts('見ル','みる'),[{surface:'見',kana:'み'},{surface:'ル',kana:''}])
 assert.deepEqual(kanjiReadingParts('きしめ','きしめ'),[{surface:'きしめ',kana:''}])
 assert.deepEqual(kanjiReadingParts('永久','とわ'),[{surface:'永久',kana:'とわ'}])
})
test('未知、主动留空和不能唯一定位的特殊唱法不猜读音，原读音保持原值',()=>{
 assert.ok(kanjiReadingParts('抱きしめ','').every(p=>p.kana===''))
 const reading='だっこ';assert.ok(kanjiReadingParts('抱きしめ',reading).every(p=>p.kana===''));assert.equal(reading,'だっこ')
 assert.ok(kanjiReadingParts('見え見','みえみえみ').every(p=>p.kana===''))
})

// 无声空格无法决定读音切点；仅在原词界完整匹配时显示两边假名，不用词典替换来源唱法。
test('跨空格汉字合并组使用完整吻合的原词界，人工改音和留空不会误套',()=>{
 const evidence=[{surface:'森',reading:'もり'},{surface:' ',reading:''},{surface:'君',reading:'きみ'}]
 assert.deepEqual(kanjiReadingParts('森 君','もりきみ',evidence),[{surface:'森',kana:'もり'},{surface:' ',kana:''},{surface:'君',kana:'きみ'}])
 for(const reading of ['','もりあなた'])assert.ok(kanjiReadingParts('森 君',reading,evidence).every(p=>!p.kana))
 assert.ok(kanjiReadingParts('海 君','もりきみ',evidence).every(p=>!p.kana))
 assert.ok(kanjiReadingParts('森 君','もりきみ',[{},null]).every(p=>!p.kana))
})
