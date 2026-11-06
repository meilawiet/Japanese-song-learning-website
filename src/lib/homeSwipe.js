// 用户现场反馈现有效果与其预期相反，整体对调原物理滑动排列，底栏按钮顺序不变。
// 原排列：export const HOME_PAGES=['mine','review','learn']
export const HOME_PAGES=['learn','review','mine']
export function swipeAxis(dx,dy){
  if(Math.max(Math.abs(dx),Math.abs(dy))<10)return null
  return Math.abs(dx)>Math.abs(dy)*1.25?'horizontal':'vertical'
}
export function swipeDestination(tab,dx,velocity,width,cancelled=false){
  const index=HOME_PAGES.indexOf(tab)
  if(cancelled||index<0||!(width>0)||Math.abs(dx)<12)return tab
  const far=Math.abs(dx)>=Math.min(96,width*.23)
  const fast=Math.abs(dx)>=24&&Math.abs(velocity)>.45&&Math.sign(velocity)===Math.sign(dx)
  if(!far&&!fast)return tab
  return HOME_PAGES[Math.max(0,Math.min(HOME_PAGES.length-1,index+(dx<0?1:-1)))]
}
export function swipeOffset(tab,dx,width){
  const index=HOME_PAGES.indexOf(tab)
  const edge=index===0&&dx>0||index===HOME_PAGES.length-1&&dx<0
  return Math.max(-width,Math.min(width,dx))*(edge?.18:1)
}
