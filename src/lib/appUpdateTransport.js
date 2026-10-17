import {GITEE_UPDATE_API,UPDATE_API,isOfficialAppDownloadUrl,selectLatestAppRelease} from './appUpdate.js'

// 检查接口和下载器通过参数注入，确保回退、取消与错误场景可独立验证。
export async function fetchPreferredAppRelease(current,get) {
  let empty={available:false,message:'暂未发布可下载安装的更新。'}
  for(const source of ['gitee','github']) {
    try {
      const base=source==='gitee'?GITEE_UPDATE_API:UPDATE_API
      for(let page=1;page<=10;page++) {
        const response=await get(page===1?base:`${base}&page=${page}`,{
          headers:{Accept:source==='gitee'?'application/json':'application/vnd.github+json'},
          connectTimeout:10000,readTimeout:10000,
        })
        if(response.status===404)break
        if(response.status!==200)throw new Error('检测更新失败，请检查网络后重试。')
        const releases=typeof response.data==='string'?JSON.parse(response.data):response.data
        const result=selectLatestAppRelease(releases,current,source)
        if(result.available)return result
        empty=result
        if(releases.length<100)break
      }
      if(source==='github')return empty
    } catch(error) {
      // Gitee 网络异常、限流或数据不完整时，保留旧版 GitHub 检查通路。
      if(source==='github')throw error
    }
  }
  return empty
}

export async function downloadAppRelease(release,download,isCancelled=()=>false) {
  const urls=[release.url,...(release.fallbackUrl?[release.fallbackUrl]:[])]
  for(let index=0;index<urls.length;index++) {
    if(isCancelled())return {cancelled:true}
    const source=index===0?release.source||'github':'github'
    if(!isOfficialAppDownloadUrl(urls[index],source)||!/^[0-9a-f]{64}$/.test(release.sha256||''))throw new Error('更新下载地址或校验信息无效，请重新检测更新。')
    try {
      const result=await download({url:urls[index],sha256:release.sha256,version:release.version.replace(/^v/,'')})
      if(isCancelled()||result.cancelled)return {cancelled:true}
      return result
    } catch(error) {
      // 用户取消绝不触发第二次下载；镜像失败时重新下载同摘要的完整文件。
      if(isCancelled())return {cancelled:true}
      if(index===urls.length-1)throw error
    }
  }
}
