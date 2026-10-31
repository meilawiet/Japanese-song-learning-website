// 按用户要求每次调整立即写入，不显示保存、撤销或取消操作；关闭开关即可退出模式。
import {originalTimestamp} from '../lib/timestampTuning.js'
// 旧签名不含range和selectedLines；保留单句文案，多句显示范围并按整段启用按钮。
export default function TimestampTuner({ line, number, offset, busy, error, onShift, onReset,range,selectedLines=[] }) {
  const timed=range?selectedLines.length>0&&selectedLines.every(item=>Number.isFinite(item.start)):Number.isFinite(line?.start)
  const scope=range?'所选段':'当前句',offsets=range?selectedLines.map(item=>Math.round(((item.start??0)-(originalTimestamp(item)??0))*1000)):[offset]
  const changed=offsets.some(value=>value!==0),sameOffset=offsets.every(value=>value===offsets[0])
  const time=timed?`${String(Math.floor(line.start/60)).padStart(2,'0')}:${(line.start%60).toFixed(3).padStart(6,'0')}`:'无时间戳'
  return <>
    <aside className="timestamp-tuner" aria-label={`${scope}时间戳调节`} aria-busy={busy}>
      <button type="button" aria-label={`${scope}延后0.2秒`} disabled={busy || !timed} onClick={()=>onShift(200)}>+0.2s</button>
      {/* 中间按钮按用户要求重置当前句；累计偏移参照持久化原点，退出/重启也不改变。 */}
      {/* 原中部只显示单句与offset；整段不同原偏移不冒充统一偏移。 */}
      <div className="timestamp-tuner-info"><strong>{range?`第${range.startIndex+1}–${range.endIndex+1}句`:`第${number}句`}</strong><output aria-label={range?'所选段起始时间戳':'所选句时间戳'}>{time}</output><button type="button" aria-label={`重置${scope}时间戳`} disabled={busy || !timed || !changed} onClick={onReset}>重置</button><small aria-label={range?'所选段累计偏移':'所选句累计偏移'}>{sameOffset?`${offsets[0]>=0?'+':''}${(offsets[0]/1000).toFixed(1)}s`:'多个偏移'}</small></div>
      <button type="button" aria-label={`${scope}提前0.2秒`} disabled={busy || !timed} onClick={()=>onShift(-200)}>−0.2s</button>
    </aside>
    {error && <p className="timestamp-tuner-error" role="alert">{error}</p>}
  </>
}
