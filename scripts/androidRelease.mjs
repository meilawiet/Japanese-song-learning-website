import {createHash} from 'node:crypto'
import {GITEE_UPDATE_REPOSITORY,UPDATE_REPOSITORY,parseAppVersion,selectAppRelease} from '../src/lib/appUpdate.js'

// 两个平台始终使用同一份字节；Gitee 的摘要藏在说明注释中，不增加独立校验附件。
export function prepareAndroidRelease(version,bytes,notes) {
  const parsed=parseAppVersion(version)
  if(!parsed||parsed.preview||version.startsWith('v'))throw new Error('请输入不带 v 的正式版本号。')
  if(!bytes.length||bytes.length>128*1024*1024)throw new Error('APK 大小无效。')
  const tag=`v${version}`,name=`UTA-Android-${version}.apk`,digest=`sha256:${createHash('sha256').update(bytes).digest('hex')}`
  const body=`${notes.trim()}\n\n<!-- uta-apk ${JSON.stringify({tag,name,size:bytes.length,digest})} -->`
  return {version,tag,name,digest,body,bytes}
}

// 只有显式执行发布命令才会调用此函数；不自动推送代码或改动已有标签。
export async function publishAndroidRelease({artifact,commit,giteeCommit,githubToken,giteeToken,request=fetch,log=()=>{}}) {
  if(!githubToken||!giteeToken)throw new Error('发布需要 GitHub 令牌及 GITEE_ACCESS_TOKEN；令牌仅保存在进程内存。')
  const roots={github:`https://api.github.com/repos/${UPDATE_REPOSITORY}`,gitee:`https://gitee.com/api/v5/repos/${GITEE_UPDATE_REPOSITORY}`}
  const headers=source=>({Authorization:`Bearer ${source==='github'?githubToken:giteeToken}`,Accept:source==='github'?'application/vnd.github+json':'application/json',...(source==='github'?{'X-GitHub-Api-Version':'2022-11-28'}:{})})
  async function api(source,path,{method='GET',json,body,optional=false}={}) {
    const response=await request(`${roots[source]}${path}`,{method,headers:{...headers(source),...(json?{'Content-Type':'application/json'}:{})},body:json?JSON.stringify(json):body,signal:AbortSignal.timeout(body?300000:30000)})
    if(optional&&response.status===404)return null
    // 不输出服务端正文或请求头，防止错误响应带出凭据。
    if(!response.ok)throw new Error(`${source} ${method} ${path}: HTTP ${response.status}`)
    return response.json()
  }
  // 两端权限与分支均在任何远端写入前检查。
  for(const source of ['github','gitee']) {
    const origin=source==='github'?'https://api.github.com':'https://gitee.com/api/v5'
    const response=await request(`${origin}/user`,{headers:headers(source),signal:AbortSignal.timeout(30000)})
    if(!response.ok)throw new Error(`${source} 发布凭据无效或缺少权限。`)
  }
  const branch=await api('github','/git/ref/heads/android-dev')
  if(branch.object.sha!==commit)throw new Error('请先核对 README 并将 android-dev 产品提交上传，再发布。')
  const oldTag=await api('github',`/git/ref/tags/${artifact.tag}`,{optional:true})
  if(oldTag&&oldTag.object.sha!==commit)throw new Error('GitHub 标签指向其他提交，需先人工核对，脚本不会移动标签。')
  const giteeBranch=await api('gitee','/branches/master')
  if(giteeBranch.commit.sha!==giteeCommit)throw new Error('Gitee master 已变化，请重新核对资源仓库提交。')

  const releases={}
  for(const source of ['github','gitee']) {
    let release=await api(source,`/releases/tags/${artifact.tag}`,{optional:true})
    if(release&&String(release.body).replace(/\r\n/g,'\n')!==artifact.body.replace(/\r\n/g,'\n'))throw new Error(`${source} 同版本发行说明或 APK 摘要不一致，停止覆盖。`)
    if(!release)release=await api(source,'/releases',{method:'POST',json:{tag_name:artifact.tag,target_commitish:source==='github'?commit:giteeCommit,name:`UTA Android ${artifact.version}`,body:artifact.body,...(source==='github'?{draft:true,prerelease:false}:{prerelease:true})}})
    log(`${source} 发行版已暂存：${release.id}`)
    // GitHub 草稿和 Gitee 预发布都不会被正式更新筛选器采用，便于失败后继续同一次发布。
    const apks=(release.assets||[]).filter(asset=>/\.apk$/i.test(asset.name||''))
    if(apks.length>1||apks.some(asset=>asset.name!==artifact.name))throw new Error(`${source} 发行版含其他 APK，停止上传。`)
    if(!apks.length) {
      if(source==='github') {
        const upload=new URL(release.upload_url.split('{')[0])
        if(upload.origin!=='https://uploads.github.com')throw new Error('GitHub 上传地址无效。')
        upload.searchParams.set('name',artifact.name)
        const response=await request(upload,{method:'POST',headers:{...headers(source),'Content-Type':'application/vnd.android.package-archive'},body:artifact.bytes,signal:AbortSignal.timeout(300000)})
        if(!response.ok)throw new Error(`GitHub APK 上传失败：HTTP ${response.status}`)
        const asset=await response.json()
        if(asset.digest!==artifact.digest||asset.size!==artifact.bytes.length)throw new Error('GitHub APK 摘要或大小不一致。')
      } else {
        const form=new FormData()
        form.set('file',new Blob([artifact.bytes],{type:'application/vnd.android.package-archive'}),artifact.name)
        await api(source,`/releases/${release.id}/attach_files`,{method:'POST',body:form})
      }
    }
    releases[source]=await api(source,`/releases/${release.id}`)
  }
  // Gitee 必须匿名下载完整文件并核对 SHA256；登录页、网关错误与截断文件均阻止正式发布。
  const gitee=selectAppRelease({...releases.gitee,prerelease:false},'0.0.0','gitee')
  if(!gitee.available||gitee.sha256!==artifact.digest.slice(7))throw new Error('Gitee 发行元数据与本地 APK 不一致。')
  const response=await request(gitee.url,{signal:AbortSignal.timeout(300000)})
  if(!response.ok||!response.body)throw new Error('Gitee APK 无法匿名下载。')
  const hash=createHash('sha256');let count=0
  for await(const chunk of response.body) { count+=chunk.length;if(count>artifact.bytes.length)throw new Error('Gitee APK 大小不一致。');hash.update(chunk) }
  if(count!==artifact.bytes.length||`sha256:${hash.digest('hex')}`!==artifact.digest)throw new Error('Gitee APK 完整下载校验失败。')
  const ghAsset=releases.github.assets.find(asset=>asset.name===artifact.name)
  if(!ghAsset||ghAsset.digest!==artifact.digest||ghAsset.size!==artifact.bytes.length)throw new Error('GitHub APK 校验失败。')

  // 两端完整验证后转为正式发行；无摘要附件，不自动清空累计清单。
  await api('github',`/releases/${releases.github.id}`,{method:'PATCH',json:{draft:false,make_latest:'true'}})
  // 旧请求仅传prerelease：Gitee要求正文、名称及标签必填，会返回HTTP400。
  // await api('gitee',`/releases/${releases.gitee.id}`,{method:'PATCH',json:{prerelease:false}})
  await api('gitee',`/releases/${releases.gitee.id}`,{method:'PATCH',json:{name:`UTA Android ${artifact.version}`,tag_name:artifact.tag,body:artifact.body,prerelease:false}})
  for(const source of ['github','gitee']) {
    const published=await api(source,`/releases/tags/${artifact.tag}`)
    const selected=selectAppRelease(published,'0.0.0',source)
    if(!selected.available||selected.sha256!==artifact.digest.slice(7)||published.target_commitish!==(source==='github'?commit:giteeCommit))throw new Error(`${source} 正式发行核验失败。`)
    releases[source]=selected.url
  }
  const publishedTag=await api('github',`/git/ref/tags/${artifact.tag}`)
  if(publishedTag.object.sha!==commit)throw new Error('GitHub 公开标签与产品提交不一致。')
  return {version:artifact.version,commit,giteeCommit,size:artifact.bytes.length,digest:artifact.digest,urls:releases}
}
