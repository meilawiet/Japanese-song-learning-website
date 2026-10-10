import { displayReading } from '../lib/readingDisplay'

// 两种练习共用注音排版；同时显示时把假名和罗马音上下排列，保持原文字色。
export default function ReadingRuby({ base, reading, readingStyle }) {
  return <ruby>{base}<rt lang={readingStyle === 'romaji' ? 'ja-Latn' : 'ja'}>{readingStyle === 'both' ? <span className="reading-ruby-dual"><span lang="ja">{displayReading(reading, 'hiragana')}</span><span lang="ja-Latn">{displayReading(reading, 'romaji')}</span></span> : displayReading(reading, readingStyle)}</rt></ruby>
}
