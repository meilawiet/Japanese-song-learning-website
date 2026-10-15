import { Pause, Play, RotateCcw, Square, X } from 'lucide-react'
import { PLAYBACK_RATES } from '../lib/playbackRate'
import { RANGE_REPEAT_COUNTS, RANGE_GAP_SECONDS, DEFAULT_RANGE_PRACTICE_SETTINGS } from '../lib/rangePractice'

function time(value) {
  if (!Number.isFinite(value)) return '音频结尾'
  const milliseconds = Math.round(value * 1000)
  return `${String(Math.floor(milliseconds / 60000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`
}

function practiceLabel(practice) {
  if (!practice || practice.phase === 'idle') return ''
  if (practice.phase === 'complete') return practice.mode === 'recall' ? '跟读练习完成 · 已听 2 遍' : `已完成 ${practice.completed} 遍`
  if (practice.phase === 'recall') return '第一遍已结束 · 轮到你读，读完后再听一次'
  const count = practice.total === 'infinite' ? `第 ${practice.completed + 1} 遍 · 无限循环` : `第 ${practice.completed + 1} / ${practice.total} 遍`
  if (practice.phase === 'gap') {
    const completed = practice.total === 'infinite' ? `已播放 ${practice.completed} 遍` : `已播放 ${practice.completed} / ${practice.total} 遍`
    return `${completed} · ${practice.paused ? `间隔已暂停，剩余 ${Math.ceil(practice.remainingMs / 1000)} 秒` : `留给你跟读，${Math.ceil(practice.remainingMs / 1000)} 秒后继续`}`
  }
  return `${count}${practice.paused ? ' · 已暂停' : ''}`
}

export default function DesktopLyricRangeControls({ range, available, playing, paused, rate, onRate, onToggle, onReplay, onClear, settings = DEFAULT_RANGE_PRACTICE_SETTINGS, practice, onSettings, onStop }) {
  if (!range) return <div className="desktop-lyric-range-hint">先点首句，再按住 <kbd>Ctrl</kbd> 点末句，选择连续歌词并播放。</div>
  const active = practice && !['idle', 'complete'].includes(practice.phase)
  const waiting = practice?.phase === 'gap' && !practice.paused
  const recall = practice?.phase === 'recall'
  const buttonLabel = recall ? '我读完了，再听一次' : playing || waiting ? '暂停选中片段' : paused ? '继续选中片段' : '播放选中片段'
  return <section className="desktop-lyric-range-controls" aria-label="选中歌词片段" data-start={range.start} data-end={range.end} data-practice-phase={practice?.phase || 'idle'} data-completed={practice?.completed || 0} data-practice-paused={Boolean(practice?.paused)}>
    <div className="desktop-lyric-range-summary" role="status"><b>已选择第 {range.first.displayNumber}–{range.last.displayNumber} 句 · {range.count} 句</b><span>{range.error || `${time(range.start)} → ${time(range.end)}`}{!available && !range.error ? ' · 这首歌尚无音频' : ''}</span></div>
    <div className="desktop-lyric-range-settings">
      <label>练法<select aria-label="选段练习方式" value={settings.mode} onChange={event => onSettings({ mode:event.target.value })}><option value="repeat">重复播放</option><option value="recall">听 → 自己读 → 再听</option></select></label>
      {settings.mode === 'repeat' ? <><label>次数<select aria-label="选段播放次数" value={settings.repeatCount} onChange={event => onSettings({ repeatCount:event.target.value === 'infinite' ? 'infinite' : Number(event.target.value) })}>{RANGE_REPEAT_COUNTS.map(value => <option key={value} value={value}>{value === 'infinite' ? '无限循环' : `${value} 遍`}</option>)}</select></label><label>跟读间隔<select aria-label="选段跟读间隔" disabled={settings.repeatCount === 1} value={settings.gapSeconds} onChange={event => onSettings({ gapSeconds:Number(event.target.value) })}>{RANGE_GAP_SECONDS.map(value => <option key={value} value={value}>{value} 秒</option>)}</select></label></> : <span className="desktop-range-recall-note">第一遍后暂停，读完手动开始第二遍。</span>}
    </div>
    <div className="desktop-lyric-range-actions"><label>慢放<select aria-label="选段播放速度" value={rate} onChange={event => onRate(Number(event.target.value))}>{[...PLAYBACK_RATES].reverse().map(value => <option key={value} value={value}>{value}×</option>)}</select></label><button className="desktop-lyric-range-play" type="button" disabled={!available || Boolean(range.error)} onClick={onToggle}>{playing || waiting ? <Pause size={13}/> : <Play size={13}/>} {buttonLabel}</button>{active && <button type="button" onClick={onStop}><Square size={12}/>停止练习</button>}<button type="button" aria-label="重播选中片段" title="从选段起点重播，重新计次" disabled={!available || Boolean(range.error)} onClick={onReplay}><RotateCcw size={14}/></button><button type="button" aria-label="取消歌词多选" title="取消选择并停止片段" onClick={onClear}><X size={14}/></button></div>
    {practiceLabel(practice) && <p className="desktop-range-practice-status" role="status">{practiceLabel(practice)}</p>}
  </section>
}
