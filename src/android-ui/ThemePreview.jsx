import React from 'react'

// 与真实背景使用相同的遮罩、模糊、位置和缩放公式；预览不模糊文字和控件。
export default function ThemePreview({palette,image,background}){
 const rgba=(color,alpha)=>'rgba('+[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).join(',')+','+alpha+')'
 const alpha=Math.round(background.veil/100*255).toString(16).padStart(2,'0'),enabled=background.enabled&&image?.url,zoom=background.zoom||1
 return <section className="demo-theme-preview" aria-label="背景效果实时预览" style={{background:palette.page,color:palette.text}}>
  {enabled&&<div className="demo-theme-preview-wallpaper" aria-hidden="true" style={{backgroundImage:`linear-gradient(${palette.page}${alpha},${palette.page}${alpha}),url("${image.url}")`,backgroundPosition:`${background.x}% ${background.y}%`,transform:`scale(${zoom})`,transformOrigin:`${background.x}% ${background.y}%`,filter:`blur(${background.blur/zoom}px)`}}/>}
  <div className="demo-theme-preview-content"><div className="demo-theme-preview-label"><span>实时预览</span><small>{background.veil}% 遮罩 · {background.blur}px 模糊</small></div><div className="demo-theme-preview-lyric" style={{background:enabled?rgba(palette.tint,background.cardOpacity/100):palette.tint,borderColor:palette.accent}}><strong lang="ja">好きな歌を、もう一度。</strong><small>当前播放的歌词</small></div></div>
 </section>
}
