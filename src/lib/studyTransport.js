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
    // 原状态不含选段：{ time: 0, duration: 0, playing: false, busy: false, mode: 'sentence', ready: false, silent: true }
    this.state = { time: 0, duration: 0, playing: false, busy: false, mode: 'sentence', ready: false, silent: true, range: null, rangeAnchorId: null }
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
    // 原父层仅订阅 playing/busy/mode；增加低频的选段状态，不订阅每次时间刷新。
    // this.options.onStatus?.({ playing: this.state.playing, busy: this.state.busy, mode: this.state.mode })
    this.options.onStatus?.({ playing: this.state.playing, busy: this.state.busy, mode: this.state.mode, range: this.state.range, rangeAnchorId: this.state.rangeAnchorId })
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
    // 切歌、离页或时间轴修改都丢弃临时选段，不写入歌曲及学习数据。
    // this.publish({ time: 0, duration, ready: enabled && hasLyricTimeline(song), silent: !this.hasAudio })
    this.singleOverride = false
    this.publish({ time: 0, duration, ready: enabled && hasLyricTimeline(song), silent: !this.hasAudio, range: null, rangeAnchorId: null })
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
  // 按歌词数组位置判断范围，兼容不连续、非数字句子标识及反向选择。
  inRange(id) {
    const range = this.state.range
    if (!range) return false
    const index = this.song.lines.findIndex(line => line.id === id)
    return index >= range.startIndex && index <= range.endIndex
  }
  rangeBounds() {
    const range = this.state.range
    return range ? { start: this.song.lines[range.startIndex].start, end: studyLineEnd(this.song.lines, range.endId, this.state.duration) } : null
  }
  clearRange(pause = true) {
    if (!this.state.range && this.state.rangeAnchorId == null) return
    if (pause) this.pause()
    this.singleOverride = false
    this.finished = false
    this.segmentId = this.selected
    this.publish({ range: null, rangeAnchorId: null })
  }
  // 第一次双击仅选起点；第二次双击仅确定并高亮范围，按用户要求不自动播放。
  doubleTapLine = id => {
    // 原来无完整时间戳时不能选段：if (!this.state.ready) return
    // 阅读收藏只依赖歌词顺序；播放与音频定位仍需完整时间轴，离页禁用时不能新建选区。
    if (!this.enabled) return
    const index = this.song.lines.findIndex(line => line.id === id)
    if (index < 0) return
    if (this.inRange(id) || this.state.rangeAnchorId === id) { this.clearRange(); return }
    this.pause()
    const anchor = this.song.lines.findIndex(line => line.id === this.state.rangeAnchorId)
    if (anchor < 0 || this.state.range) {
      this.publish({ range: null, rangeAnchorId: id })
      this.select(id)
      return
    }
    const startIndex = Math.min(anchor, index), endIndex = Math.max(anchor, index)
    const range = { startIndex, endIndex, startId: this.song.lines[startIndex].id, endId: this.song.lines[endIndex].id }
    this.singleOverride = false
    this.finished = false
    this.segmentId = range.startId
    this.select(range.startId)
    // 原无条件定位：this.audioTime(this.song.lines[startIndex].start)
    // this.publish({ range, rangeAnchorId: null, time: this.song.lines[startIndex].start })
    if (this.state.ready) this.audioTime(this.song.lines[startIndex].start)
    this.publish({ range, rangeAnchorId: null, ...(this.state.ready ? { time: this.song.lines[startIndex].start } : {}) })
  }
  // 段内任一句都是同一热区：播放中单击暂停，否则从段首播放一次。
  playRange = () => {
    if (!this.state.range || !this.state.ready) return
    if (this.state.playing || this.state.busy) { this.pause(); return }
    this.singleOverride = false
    this.segmentId = this.state.range.startId
    this.select(this.segmentId)
    void this.start(this.rangeBounds().start)
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
        // 元信息就绪后再按真实时长校正选段位置，最后一句以真实媒体尾部为界。
        const bounds = this.rangeBounds()
        if (bounds && (time < bounds.start || time >= bounds.end)) time = bounds.start
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
    // 原完成后仅按练习模式重置：if (this.finished) time = this.state.mode === 'sentence' ? this.song.lines.find(line => line.id === this.segmentId)?.start || 0 : 0
    if (this.state.rangeAnchorId != null) return // 尚未选终点时等待用户完成或点其他句退出。
    if (this.finished) time = this.rangeBounds()?.start ?? (this.state.mode === 'sentence' ? this.song.lines.find(line => line.id === this.segmentId)?.start || 0 : 0)
    void this.start(time)
  }
  seek = value => {
    if (!this.state.ready || !Number.isFinite(Number(value))) return
    const time = Math.max(0, Math.min(this.state.duration, Number(value)))
    // 段内拖动仍受段尾约束，拖到段外或选点时拖动则恢复普通播放。
    const bounds = this.rangeBounds()
    if (this.state.rangeAnchorId != null || bounds && (time < bounds.start || time >= bounds.end)) this.clearRange(false)
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
    // 原规则：正常段内点击复用整段，段外点击先退出再播放单句。
    // 修正为段外单击只退出并暂停，不跳转或启动被点句；下一次单击再走普通播放。
    if (!once && this.inRange(id)) { this.playRange(); return }
    if (!once && (this.state.range || this.state.rangeAnchorId != null)) { this.clearRange(); return }
    // AI 复核的明确单句试听仍允许清除范围后按原逻辑启动。
    this.clearRange()
    if (this.state.playing && this.selected === id) { this.pause(); return }
    // AI 复核试听始终只播当前句，不受连续跟唱模式影响。
    this.singleOverride = once
    this.segmentId = id
    this.select(id)
    void this.start(Math.max(0, line.start))
  }
  setMode = mode => {
    if (!['sentence', 'continuous'].includes(mode) || mode === this.state.mode) return
    // 主动切换练习模式时结束临时选段，避免隐藏的段尾继续限制普通播放。
    this.clearRange()
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
    // 原边界仅分单句与整曲；选段优先，包含结束句且只播放一次，不自动无限循环。
    // const end = this.state.mode === 'sentence' || this.singleOverride ? studyLineEnd(this.song.lines, this.segmentId, this.state.duration) : this.state.duration
    const end = this.rangeBounds()?.end ?? (this.state.mode === 'sentence' || this.singleOverride ? studyLineEnd(this.song.lines, this.segmentId, this.state.duration) : this.state.duration)
    if (time >= end || this.hasAudio && this.audio()?.ended) {
      time = Math.min(time, end)
      // 原连续模式会选中边界外的下一句；选段停止时固定在结束句内。
      // if (this.state.mode === 'continuous') this.select(studyLineAt(this.song.lines, time)?.id)
      if (this.state.range) this.select(this.state.range.endId)
      else if (this.state.mode === 'continuous') this.select(studyLineAt(this.song.lines, time)?.id)
      this.pause()
      this.audioTime(time)
      this.finished = true
      this.publish({ time })
      return
    }
    // 选段时按真实播放位置跟随段内当前句，段外高亮不会被误选中。
    // if (this.state.mode === 'continuous') this.select(studyLineAt(this.song.lines, time)?.id)
    if (this.state.range || this.state.mode === 'continuous') this.select(studyLineAt(this.song.lines, time)?.id)
    this.publish({ time })
  }
}
