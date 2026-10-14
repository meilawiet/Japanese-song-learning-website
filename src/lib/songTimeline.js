// 按用户选择的位置插入；稳定的独立编号避免新增句子覆盖原有句子。
export function insertLyricLine(lines, position, parseTime, formatTime) {
  if (!Number.isInteger(position) || position < 0 || position > lines.length) throw new Error('请选择有效的添加位置。')
  // 无时间轴文档可以插入原文，新增句的时间继续留空，不伪造一秒间隔。
  if(lines.some(line=>!String(line.time||'').trim())){
    const result=[...lines],id=lines.reduce((largest,line)=>Math.max(largest,Number(line.id)||0),-1)+1
    result.splice(position,0,{id,time:'',text:'',translation:''});return result
  }
  const before = position > 0 ? parseTime(lines[position - 1].time) : null
  const after = position < lines.length ? parseTime(lines[position].time) : null
  if ((position > 0 && before == null) || (position < lines.length && after == null)) throw new Error('请先修正相邻句子的时间。')
  if (before != null && after != null && before > after) throw new Error('相邻歌词时间顺序有误，请先调整时间轴。')
  // 中间采用毫秒中点；同一时刻依靠稳定排序保持插入位置。
  const start = before == null ? Math.max(0, (after ?? 1) - 1) : after == null ? before + 1 : Math.floor((before + after) * 500) / 1000
  const id = lines.reduce((largest, line) => Math.max(largest, Number(line.id) || 0), -1) + 1
  const result = [...lines]
  result.splice(position, 0, { id, time: formatTime(start), text: '', translation: '' })
  return result
}
