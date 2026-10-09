// 只从项目官方 GitHub Release 读取版本；检测更新不上传本机资料，也不自动下载。
export const UPDATE_REPOSITORY='meilawiet/Japanese-song-learning-website'
export const UPDATE_API=`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`
export function parseAppVersion(value) {
  const match=String(value).match(/^v?(\d+(?:\.\d+){1,3})(?:-([A-Za-z0-9.-]+))?$/)
  if(!match)return null
  const parts=match[1].split('.').map(Number)
  return parts.every(Number.isSafeInteger)?{parts,preview:Boolean(match[2])}:null
}
export function newerAppVersion(candidate,current) {
  const next=parseAppVersion(candidate),old=parseAppVersion(current)
  if(!next||!old)return false
  for(let i=0;i<Math.max(next.parts.length,old.parts.length);i++){const difference=(next.parts[i]||0)-(old.parts[i]||0);if(difference)return difference>0}
  return old.preview&&!next.preview
}
export function selectAppRelease(release,current) {
  if(!release||release.draft||release.prerelease)return {available:false,message:'暂未发布可用的更新。'}
  if(!parseAppVersion(release.tag_name))throw new Error('发布版本号无法识别，请稍后重试。')
  const assets=(release.assets||[]).filter(asset=>{
    if(typeof asset.name!=='string'||!/\.apk$/i.test(asset.name)||/debug|\bdev\b/i.test(asset.name))return false
    try{const url=new URL(asset.browser_download_url);return url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith(`/${UPDATE_REPOSITORY}/releases/download/`)}catch{return false}
  })
  if(!assets.length)return {available:false,message:'暂未发布可下载安装的更新。'}
  const asset=assets.find(a=>/universal/i.test(a.name))||assets[0]
  return {available:true,newer:newerAppVersion(release.tag_name,current),version:release.tag_name,url:asset.browser_download_url,notes:typeof release.body==='string'?release.body.slice(0,4000):'',message:newerAppVersion(release.tag_name,current)?'发现新版本。':'当前已是最新版本。'}
}
