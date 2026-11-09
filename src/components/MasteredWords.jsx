import { ArrowLeft, BookCheck } from 'lucide-react'
import { masteredWordKey, sortedMasteredWords } from '../lib/masteredWords.js'

// 用主题强调色做印章式按钮，辅助标签说明点击后的操作。
export function MasteredWordButton({ word, onClick }) {
  return <button type="button" className="mastered-word-mark" aria-label={`标记 ${word.surface} 为完全掌握`} onClick={onClick}>熟</button>
}

export default function MasteredWords({ words, onRemove, onBack }) {
  return <section className="android-review-book mastered-words-page" aria-label="完全掌握的单词">
    <header className="review-page-header">
      <button type="button" aria-label="返回复习本" onClick={onBack}><ArrowLeft size={23}/></button>
      <h1>完全掌握的单词</h1>
    </header>
    <p className="mastered-words-hint">加入熟词本的单词会从 AI 的单词讲解中跳过。移出后可再次讲解。</p>
    {words.length ? <ul className="mastered-words-list">
      {sortedMasteredWords(words).map(word => {
        const key = masteredWordKey(word)
        return <li key={key}>
          <div><strong lang={word.language === 'ja' ? 'ja' : undefined}>{word.surface}</strong>
            {word.reading && <small lang="ja">{word.reading}</small>}
            {word.meaning && <p>{word.meaning}</p>}
          </div>
          <button type="button" aria-label={`移出 ${word.surface}${word.reading ? `（${word.reading}）` : ''}`} onClick={() => onRemove(key)}>移出</button>
        </li>
      })}
    </ul> : <div className="review-empty"><BookCheck size={34}/><h2>还没有完全掌握的单词</h2><p>在单词旁点击「熟」，就能把它加入这里。</p></div>}
  </section>
}
