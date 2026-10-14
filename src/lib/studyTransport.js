import { hasLyricTimeline, lyricDuration } from './lyricDocument.js'

// 有声与静音共用同一时间轴，时间戳缺失时只允许阅读，绝不把 null 当作零秒。
export function studyLineAt(lines, time) {
  let current = lines[0]
  for (const line of lines) { if (line.start > time + 0.001) break; current = line }
  return current
}
export function studyLineEnd(lines, id, duration) {
  const index = lines.findIndex(line => line.id === id), line = lines[index]
  return lines.slice(index + 1).find(next => next.start > line?.start)?.start ?? duration
}

// 时间状态独立于 React 歌词列表；仅播放器订阅每次计时，整页只在换句/播放状态变化时更新。
export class StudyTransport {
  constructor(options = {}) {
    this.options = options
    this.listeners = new Set()
    this.state = { time: 0, duration: 0, playing: false, busy: false, mode: 'sentence', ready: false, silent: true }
    this.version = 0
    this.lastTick = 0
    this.finished = false
    this.segmentId = null
    this.selected = null
  }
  getSnapshot = () => this.state
  subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  publish(patch = {}) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener())
    this.options.onStatus?.({ playing: this.state.playing, busy: this.state.busy, mode: this.state.mode })
  }
  now() { return (this.options.now || (() => performance.now()))() }
  audio() { return this.options.getAudio?.() }
  select(id) { if (id != null && id !== this.selected) { this.selected = id; this.options.onSelect?.(id) } }
  configure({ song, audioUrl, enabled }) {
    this.pause()
    this.song = song
    this.enabled = enabled
    this.hasAudio = Boolean(audioUrl)
    this.segmentId = song.lines[0]?.id
    this.selected = null
    this.finished = false
    this.audioTime(0)
    const duration = this.hasAudio && Number.isFinite(this.audio()?.duration) ? this.audio().duration : lyricDuration(song.lines)
    this.publish({ time: 0, duration, ready: enabled && hasLyricTimeline(song), silent: !this.hasAudio })
    if (enabled) this.select(song.lines[0]?.id)
  }
  refreshDuration() {
    const duration = this.hasAudio && Number.isFinite(this.audio()?.duration) ? this.audio().duration : lyricDuration(this.song?.lines || [])
    if (duration !== this.state.duration) this.publish({ duration })
  }
  audioTime(time) { if (this.hasAudio && this.audio()) { try { this.audio().currentTime = time } catch { /* 元数据载入后再定位。 */ } } }
  pause = () => {
    this.version++
    this.cancelWait?.()
    this.audio()?.pause()
    if (this.state.playing || this.state.busy) this.publish({ playing: false, busy: false })
  }
  // 等待真实媒体元信息，取消、离页或换歌后旧 Promise 不得重新启动播放。
  waitMetadata(audio) {
    if (audio.readyState >= 1) return Promise.resolve(true)
    return new Promise(resolve => {
      let timer
      const finish = success => { clearTimeout(timer); audio.removeEventListener('loadedmetadata', loaded); audio.removeEventListener('error', failed); this.cancelWait = null; resolve(success) }
      const loaded = () => finish(true), failed = () => finish(false)
      this.cancelWait = () => finish(false)
      audio.addEventListener('loadedmetadata', loaded, { once: true })
      audio.addEventListener('error', failed, { once: true })
      timer = setTimeout(failed, 12000)
      audio.load()
    })
  }
  async start(time = this.state.time) {
    if (!this.state.ready) return
    this.pause()
    const version = ++this.version
    this.finished = false
    this.publish({ busy: this.hasAudio })
    try {
      if (this.hasAudio) {
        const audio = this.audio()
        if (!audio || !await this.waitMetadata(audio)) { if (version === this.version) throw new Error('音频暂时无法载入，请重试或检查歌曲文件。'); return }
        if (version !== this.version) return
        this.refreshDuration()
        audio.currentTime = Math.min(time, this.state.duration)
        audio.playbackRate = this.options.rate || 1
        await audio.play()
        // 旧播放请求结束时不得暂停已经启动的新请求。
        if (version !== this.version) return
      }
      this.lastTick = this.now()
      this.publish({ time, playing: true, busy: false })
      this.options.onError?.('')
      this.tick()
    } catch (error) {
      if (version !== this.version) return
      this.publish({ playing: false, busy: false })
      this.options.onError?.(error.message || '未能开始播放，请重试。')
    }
  }
  toggle = () => {
    if (this.state.playing || this.state.busy) { this.pause(); return }
    let time = this.state.time
    this.singleOverride = false
    if (this.finished) time = this.state.mode === 'sentence' ? this.song.lines.find(line => line.id === this.segmentId)?.start || 0 : 0
    void this.start(time)
  }
  seek = value => {
    if (!this.state.ready || !Number.isFinite(Number(value))) return
    const time = Math.max(0, Math.min(this.state.duration, Number(value)))
    this.finished = false
    this.lastTick = this.now()
    this.audioTime(time)
    const line = studyLineAt(this.song.lines, time)
    this.segmentId = line?.id
    this.select(line?.id)
    this.publish({ time })
  }
  playLine = (id, once = false) => {
    const line = this.song?.lines.find(item => item.id === id)
    if (!line || !this.state.ready) return
    if (this.state.playing && this.selected === id) { this.pause(); return }
    // AI 复核试听始终只播当前句，不受连续跟唱模式影响。
    this.singleOverride = once
    this.segmentId = id
    this.select(id)
    void this.start(Math.max(0, line.start))
  }
  setMode = mode => {
    if (!['sentence', 'continuous'].includes(mode) || mode === this.state.mode) return
    this.segmentId = this.selected
    this.finished = false
    this.publish({ mode })
  }
  setRate(rate) { this.tick(); this.options.rate = rate; if (this.hasAudio && this.audio()) this.audio().playbackRate = rate }
  tick = () => {
    if (!this.state.playing || !this.enabled) return
    const now = this.now(), elapsed = Math.max(0, (now - this.lastTick) / 1000)
    this.lastTick = now
    let time = this.hasAudio ? this.audio()?.currentTime ?? this.state.time : this.state.time + elapsed * (this.options.rate || 1)
    const end = this.state.mode === 'sentence' || this.singleOverride ? studyLineEnd(this.song.lines, this.segmentId, this.state.duration) : this.state.duration
    if (time >= end || this.hasAudio && this.audio()?.ended) {
      time = Math.min(time, end)
      if (this.state.mode === 'continuous') this.select(studyLineAt(this.song.lines, time)?.id)
      this.pause()
      this.audioTime(time)
      this.finished = true
      this.publish({ time })
      return
    }
    if (this.state.mode === 'continuous') this.select(studyLineAt(this.song.lines, time)?.id)
    this.publish({ time })
  }
}
