// 按用户要求每次调整立即写入，不显示保存、撤销或取消操作；关闭开关即可退出模式。
export default function TimestampTuner({ line, number, offset, busy, error, onShift, onReset }) {
  const timed=Number.isFinite(line?.start)
  const time=timed?`${String(Math.floor(line.start/60)).padStart(2,'0')}:${(line.start%60).toFixed(3).padStart(6,'0')}`:'无时间戳'
  return <>
    <aside className="timestamp-tuner" aria-label="当前句时间戳调节" aria-busy={busy}>
      <button type="button" aria-label="当前句延后0.2秒" disabled={busy || !timed} onClick={()=>onShift(200)}>+0.2s</button>
      {/* 中间按钮按用户要求重置当前句；累计偏移参照持久化原点，退出/重启也不改变。 */}
      <div className="timestamp-tuner-info"><strong>第{number}句</strong><output aria-label="所选句时间戳">{time}</output><button type="button" aria-label="重置当前句时间戳" disabled={busy || !timed || offset===0} onClick={onReset}>重置</button><small aria-label="所选句累计偏移">{offset>=0?'+':''}{(offset/1000).toFixed(1)}s</small></div>
      <button type="button" aria-label="当前句提前0.2秒" disabled={busy || !timed} onClick={()=>onShift(-200)}>−0.2s</button>
    </aside>
    {error && <p className="timestamp-tuner-error" role="alert">{error}</p>}
  </>
}
