import { Pause, Play, RotateCcw, X } from 'lucide-react'

function time(value) {
  if (!Number.isFinite(value)) return '音频结尾'
  const milliseconds = Math.round(value * 1000)
  return `${String(Math.floor(milliseconds / 60000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`
}

export default function DesktopLyricRangeControls({ range, available, playing, paused, rate, onRate, onToggle, onReplay, onClear }) {
  if (!range) return <div className="desktop-lyric-range-hint">先点首句，再按住 <kbd>Ctrl</kbd> 点末句，选择连续歌词并播放。</div>
  return <section className="desktop-lyric-range-controls" aria-label="选中歌词片段" data-start={range.start} data-end={range.end}>
    <div className="desktop-lyric-range-summary" role="status"><b>已选择第 {range.first.displayNumber}–{range.last.displayNumber} 句 · {range.count} 句</b><span>{range.error || `${time(range.start)} → ${time(range.end)}`}{!available && !range.error ? ' · 这首歌尚无音频' : ''}</span></div>
    <div className="desktop-lyric-range-actions"><label>慢放<select aria-label="选段播放速度" value={rate} onChange={event => onRate(Number(event.target.value))}>{[1, 0.75, 0.5, 0.25, 1.25, 1.5].map(value => <option key={value} value={value}>{value}×</option>)}</select></label><button className="desktop-lyric-range-play" type="button" disabled={!available || Boolean(range.error)} onClick={onToggle}>{playing ? <Pause size={13}/> : <Play size={13}/>} {playing ? '暂停选中片段' : paused ? '继续选中片段' : '播放选中片段'}</button><button type="button" aria-label="重播选中片段" title="从选段起点重播" disabled={!available || Boolean(range.error)} onClick={onReplay}><RotateCcw size={14}/></button><button type="button" aria-label="取消歌词多选" title="取消选择并停止片段" onClick={onClear}><X size={14}/></button></div>
  </section>
}
