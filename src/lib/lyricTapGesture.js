// 单击延后300毫秒确认，双击取消前一次单击，避免选起止点时短暂误播。
// 定时器和时钟可注入，便于验证手机上双击、滚动与长按之间的互斥。
export class LyricTapGesture {
  // 原默认直接保存 setTimeout/clearTimeout，再作为实例方法调用会被 Android WebView 拒绝（Illegal invocation）。
  // constructor({ onSingle, onDouble, now = () => Date.now(), schedule = setTimeout, unschedule = clearTimeout, delay = 300 }) {
  constructor({ onSingle, onDouble, now = () => Date.now(), schedule = (fn, delay) => setTimeout(fn, delay), unschedule = timer => clearTimeout(timer), delay = 300 }) {
    Object.assign(this, { onSingle, onDouble, now, schedule, unschedule, delay })
    this.pending = null
  }
  cancel = () => {
    if (this.pending) this.unschedule(this.pending.timer)
    this.pending = null
  }
  tap(id) {
    const old = this.pending
    if (old && old.id === id && this.now() - old.time <= this.delay) {
      this.cancel()
      this.onDouble(id)
      return
    }
    // 快速点到不同句仍是两次单击；只有同一句的连续两次才算双击。
    if (old) { this.cancel(); this.onSingle(old.id) }
    const pending = { id, time: this.now() }
    pending.timer = this.schedule(() => {
      if (this.pending !== pending) return
      this.pending = null
      this.onSingle(id)
    }, this.delay)
    this.pending = pending
  }
}
