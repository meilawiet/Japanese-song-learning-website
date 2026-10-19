// 区分手动浏览与程序跟随；连续滑动及惯性滚动都会重新留出5秒。
export function createLyricScrollGuard({ resume, delay = 5000, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let until = 0, moving = false, timer = null, disposed = false
  const paused = () => moving || now() < until
  function interact() {
    if (disposed) return
    until = now() + delay
    if (timer != null) clearTimer(timer)
    timer = setTimer(() => { timer = null; if (!disposed && !moving) resume() }, delay)
  }
  return {
    paused, interact,
    begin() { moving = true; interact() },
    end() { if (moving) { moving = false; interact() } },
    // 自动居中的 scroll 事件不能重新延长暂停，否则会永远无法跟随。
    scroll() { if (paused()) interact() },
    dispose() { disposed = true; if (timer != null) clearTimer(timer) },
  }
}
