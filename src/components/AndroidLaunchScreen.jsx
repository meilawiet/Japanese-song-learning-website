import {useEffect,useRef,useState} from 'react'
import {chooseLaunchQuote,savedLaunchArtwork} from '../lib/launchQuote.js'

// 图像立即呈现，文字在歌曲库及所选字体就绪后一次性显示，避免默认文案/字形闪动。
export default function AndroidLaunchScreen({image,songs,songsReady,fontReady,onComplete,artworkFor}) {
  const title=useRef(null),selection=useRef(undefined)
  const [copy,setCopy]=useState(null),[visible,setVisible]=useState(false)
  const [launchImage,setLaunchImage]=useState(image),[prepared,setPrepared]=useState(false)
  useEffect(()=>{
    // 存储或字体异常不能无限阻塞首页；超时时只结束启动图，不先显示错误的默认字形。
    const timer=setTimeout(()=>onComplete(false),6000)
    return()=>clearTimeout(timer)
  },[onComplete])
  useEffect(()=>{
    if(!songsReady)return
    // 只在这次启动第一次取得完整歌曲库时抽取，后续页面更新不重新抽签。
    if(selection.current!==undefined)return
    selection.current=chooseLaunchQuote(songs)
    setCopy(selection.current)
    // 与引句同一次选中歌曲，尊重已保存的封面覆盖及“默认封面”选择，不随机抽另一张图。
    const song=selection.current&&songs.find(song=>song.id===selection.current.songId)
    setLaunchImage(savedLaunchArtwork(song&&artworkFor?.(song))||image)
    setPrepared(true)
  },[songs,songsReady,artworkFor,image])
  useEffect(()=>{
    if(!prepared||!fontReady)return
    let disposed=false,timer
    const text=copy?`${copy.text}ー${copy.title}`:'私のうた聴いてください'
    // 不依赖font-display:swap的被动加载：为实际文案等待所选字族及缺字回退完成。
    const ready=document.fonts?.load?document.fonts.load(`400 28px ${getComputedStyle(title.current).fontFamily}`,text):Promise.resolve()
    ready.then(()=>{
      if(disposed)return
      setVisible(true)
      timer=setTimeout(()=>onComplete(false),1800)
    }).catch(()=>{ /* 字体损坏时由总超时结束，不闪现随后可能被替换的字形。 */ })
    return()=>{disposed=true;clearTimeout(timer)}
  },[copy,prepared,fontReady,onComplete])
  return <div className="android-launch-screen" aria-label="UTA 启动图">
    {/* 图库读取前不先闪现默认图；本机封面损坏时回退用户原来的启动图。 */}
    <img src={launchImage} alt="" style={{visibility:prepared?'visible':'hidden'}} onError={()=>setLaunchImage(image)}/>
    <div ref={title} className={`android-launch-title${copy?' has-quote':''}`} lang="ja" style={{visibility:visible?'visible':'hidden'}} aria-hidden={!visible}>
      {copy?<><span className="android-launch-quote">{copy.text}</span><span className="android-launch-song">ー{copy.title}</span></>:<><span>私のうた</span><span>聴いてください</span></>}
    </div>
  </div>
}
