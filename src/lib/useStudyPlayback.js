import { useEffect, useRef, useState } from 'react'
import { StudyTransport } from './studyTransport.js'

// 父层只订阅播放/模式状态；高频进度刷新留给底部播放器，避免反复计算整曲注音。
export default function useStudyPlayback({ enabled, song, audioRef, audioUrl, rate, onSelect, onError }) {
  const latest = useRef({ onSelect, onError })
  latest.current = { onSelect, onError }
  const [status, setStatus] = useState({ playing: false, busy: false, mode: 'sentence' })
  const statusRef = useRef(status)
  const ref = useRef(null)
  if (!ref.current) ref.current = new StudyTransport({
    getAudio: () => audioRef.current,
    onSelect: id => latest.current.onSelect(id),
    onError: error => latest.current.onError(error),
    onStatus: next => {
      if (Object.keys(next).some(key => next[key] !== statusRef.current[key])) { statusRef.current = next; setStatus(next) }
    },
  })
  const transport = ref.current
  const timeline = JSON.stringify(song.lines.map(line => [line.id, line.start]))
  useEffect(() => {
    transport.configure({ enabled, song, audioUrl })
    if (!enabled) return undefined
    const audio = audioRef.current, tick = window.setInterval(transport.tick, 60)
    const metadata = () => transport.refreshDuration()
    // 浏览器可能延迟派发上一次 pause，先核对媒体当前是否真的暂停。
    const paused = () => { if (audio?.paused && transport.state.playing) transport.pause() }
    const failed = () => { transport.pause(); latest.current.onError('音频无法播放，请检查歌曲文件。') }
    audio?.addEventListener('loadedmetadata', metadata)
    audio?.addEventListener('pause', paused)
    audio?.addEventListener('ended', transport.tick)
    audio?.addEventListener('error', failed)
    return () => {
      clearInterval(tick); transport.pause()
      audio?.removeEventListener('loadedmetadata', metadata); audio?.removeEventListener('pause', paused); audio?.removeEventListener('ended', transport.tick)
      audio?.removeEventListener('error', failed)
    }
  }, [enabled, song.id, audioUrl, timeline])
  useEffect(() => { transport.setRate(rate) }, [rate])
  return { transport, ...status }
}
