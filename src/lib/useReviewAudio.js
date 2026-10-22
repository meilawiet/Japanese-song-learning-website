import {useEffect,useRef,useState} from 'react'
import {Capacitor,registerPlugin} from '@capacitor/core'
import {reviewPlaybackBounds} from './reviewBook.js'

// 复习独立播放器：按所选首尾句截取一次，离页/切句/断耳机/进后台立即取消。
export default function useReviewAudio(unit,source,rate) {
  const ref=useRef(null),version=useRef(0),cancelWait=useRef(null),end=useRef(null)
  const [playing,setPlaying]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  function stop(){version.current++;cancelWait.current?.();ref.current?.pause();end.current=null;setPlaying(false);setBusy(false)}
  const identity=JSON.stringify([unit?.key,unit?.lines.map(line=>[line.id,line.start]),source])
  useEffect(()=>{
    const audio=ref.current;setPlaying(false);setBusy(false);setError('')
    const tick=()=>{if(audio&&end.current!=null&&audio.currentTime>=end.current-.02){audio.pause();end.current=null;setPlaying(false)}}
    const timer=setInterval(tick,60)
    return()=>{clearInterval(timer);version.current++;cancelWait.current?.();audio?.pause();end.current=null}
  },[identity])
  useEffect(()=>{if(ref.current)ref.current.playbackRate=rate},[rate])
  useEffect(()=>{
    let active=true,listener
    const pause=()=>{if(active)stop()},hidden=()=>{if(document.hidden)pause()}
    document.addEventListener('visibilitychange',hidden)
    if(Capacitor.isNativePlatform())registerPlugin('UtaAudioRoute').addListener('audioBecomingNoisy',pause).then(handle=>{if(active)listener=handle;else handle.remove()}).catch(()=>{})
    return()=>{active=false;document.removeEventListener('visibilitychange',hidden);listener?.remove()}
  },[])
  async function toggle(){
    if(playing||busy){stop();return}
    const audio=ref.current;if(!audio||!unit||unit.missing||!source)return
    stop();setError('');setBusy(true);const own=version.current
    try{
      if(audio.readyState<1)await new Promise((resolve,reject)=>{
        const finish=error=>{clearTimeout(timer);audio.removeEventListener('loadedmetadata',loaded);audio.removeEventListener('error',failed);cancelWait.current=null;error?reject(error):resolve()}
        const loaded=()=>finish(),failed=()=>finish(new Error('音频加载失败，请稍后重试。'))
        const timer=setTimeout(failed,12000);cancelWait.current=()=>finish(new Error('播放已取消。'))
        audio.addEventListener('loadedmetadata',loaded,{once:true});audio.addEventListener('error',failed,{once:true});audio.load()
      })
      if(own!==version.current)return
      const bounds=reviewPlaybackBounds(unit.song,unit.lines,audio.duration)
      if(!bounds||bounds.end<=bounds.start)throw new Error('这段歌词缺少可播放的有效时间范围。')
      audio.currentTime=bounds.start;audio.playbackRate=rate;end.current=bounds.end
      await audio.play()
      if(own!==version.current){audio.pause();return}
      setPlaying(true)
    }catch(failure){if(own===version.current){audio.pause();end.current=null;setError(failure.message||'播放失败，请检查音频。')}}
    finally{if(own===version.current)setBusy(false)}
  }
  return {ref,playing,busy,error,toggle,stop,onEnded:()=>{end.current=null;setPlaying(false);setBusy(false)}}
}
