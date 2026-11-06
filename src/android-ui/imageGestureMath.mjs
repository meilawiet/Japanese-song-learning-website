// 图片以cover方式铺满；位置使用可移动余量的比例，与旧头像裁剪协议一致。
export const clamp=(n,min,max)=>Math.max(min,Math.min(max,n))
export function frame(image,view,value){
 const zoom=clamp(value.zoom||1,1,3),base=Math.max(view.width/image.width,view.height/image.height)
 const width=image.width*base*zoom,height=image.height*base*zoom
 return {width,height,left:(view.width-width)*value.x,top:(view.height-height)*value.y,zoom}
}
export function position(image,view,zoom,left,top){
 const f=frame(image,view,{zoom,x:.5,y:.5})
 return {zoom:f.zoom,x:f.width>view.width?clamp(left/(view.width-f.width),0,1):.5,y:f.height>view.height?clamp(top/(view.height-f.height),0,1):.5}
}
export function move(image,view,value,dx,dy){const f=frame(image,view,value);return position(image,view,f.zoom,f.left+dx,f.top+dy)}
export function pinch(image,view,value,startMid,endMid,ratio){
 const f=frame(image,view,value),zoom=clamp(f.zoom*ratio,1,3),next=frame(image,view,{...value,zoom})
 return position(image,view,zoom,endMid.x-(startMid.x-f.left)/f.width*next.width,endMid.y-(startMid.y-f.top)/f.height*next.height)
}
// 先判方向，再按相对位移调值，避免按下轨道就从0%跳到90%。
export function sliderDirection(dx,dy){
 if(Math.abs(dy)>=8&&Math.abs(dy)>=Math.abs(dx)*.85)return 'vertical'
 if(Math.abs(dx)>=10&&Math.abs(dx)>=Math.abs(dy)*1.8)return 'horizontal'
 return null
}
export const sliderValue=(value,dx,width,min,max)=>clamp(Math.round(value+dx/width*(max-min)),min,max)
