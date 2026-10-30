// 反馈活动只在本机计数，不进入学习备份；后续补丁不会重新开启同一活动。
export const FEEDBACK_FORM_URL='https://docs.qq.com/form/page/DQ01nRWRjSHJoUm9W'
export const FEEDBACK_INVITE_KEY='uta-feedback-invite-20261030-v1'
export const FEEDBACK_LAUNCH_LIMIT=3
const documentSessions=new WeakMap()
// 一次文档启动只占一次机会，重复效果和页面切换复用原会话。
export function createFeedbackLaunchSession(storage){
  let claimed=false,dismissed=false,invitation=null
  return {claim(){
    if(dismissed)return null
    if(claimed)return invitation
    claimed=true
    try{
      let saved;try{saved=JSON.parse(storage.getItem(FEEDBACK_INVITE_KEY)||'null')}catch{saved=null}
      const value=saved?.shownLaunches,count=Number.isSafeInteger(value)&&value>=0?Math.min(value,FEEDBACK_LAUNCH_LIMIT):0
      if(count>=FEEDBACK_LAUNCH_LIMIT)return null
      storage.setItem(FEEDBACK_INVITE_KEY,JSON.stringify({shownLaunches:count+1}))
      invitation={launch:count+1};return invitation
    }catch{return null} // 保存失败时不自动反复提示，关于页仍可使用。
  },dismiss(){dismissed=true;invitation=null}}
}
// 原feedbackSession只用createFeedbackLaunchSession(storage)；安卓现优先原生可靠计数。
export function createAsyncFeedbackLaunchSession(claimLaunch){
  let pending,dismissed=false
  return {claim(){if(dismissed)return Promise.resolve(null);if(!pending)pending=Promise.resolve().then(claimLaunch).then(result=>Number.isInteger(result?.launch)&&result.launch>0&&result.launch<=FEEDBACK_LAUNCH_LIMIT?{launch:result.launch}:null).catch(()=>null);return pending.then(value=>dismissed?null:value)},dismiss(){dismissed=true}}
}
export function feedbackSession(storage,claimLaunch){if(!documentSessions.has(storage))documentSessions.set(storage,claimLaunch?createAsyncFeedbackLaunchSession(claimLaunch):createFeedbackLaunchSession(storage));return documentSessions.get(storage)}
