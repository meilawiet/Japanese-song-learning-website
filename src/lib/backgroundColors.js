import {mix} from './themePalette.js'
// 对缩略图做颜色分桶，避开透明、近白和近黑像素，防止留白覆盖插画主体色。
export function backgroundSeed(pixels){
  const bins=new Map();let total=[0,0,0],count=0
  for(let i=0;i+3<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(pixels[i+3]<128)continue
    total=total.map((v,n)=>v+[r,g,b][n]);count++
    const max=Math.max(r,g,b),min=Math.min(r,g,b)
    if(max<18||min>235)continue
    const key=[r>>4,g>>4,b>>4].join(','),bin=bins.get(key)||{sum:[0,0,0],count:0,score:0}
    bin.sum=bin.sum.map((v,n)=>v+[r,g,b][n]);bin.count++;bin.score+=.15+(max-min)/255;bins.set(key,bin)
  }
  const best=[...bins.values()].sort((a,b)=>b.score-a.score)[0]
  const rgb=best?best.sum.map(v=>v/best.count):count?total.map(v=>v/count):[104,125,151]
  return '#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')
}
// 同一图片生成浅深两套底色和强调色，最终文字对比度仍由现有语义调色器校验。
export function backgroundThemeColors(seed){
  return {light:{accent:mix(seed,'#111827',.48),page:mix('#ffffff',seed,.07),surface:mix('#ffffff',seed,.025)},dark:{accent:mix(seed,'#ffffff',.5),page:mix('#0e1219',seed,.09),surface:mix('#1d2430',seed,.12)}}
}
export function withBackgroundColors(value,seed){return {...value,customEnabled:true,customColors:backgroundThemeColors(seed),background:{...value.background,enabled:true,seed}}}
