// 只从项目官方 GitHub Release 读取版本；检测更新不上传本机资料，也不自动下载。
export const UPDATE_REPOSITORY='meilawiet/Japanese-song-learning-website'
// 原接口只返回全仓库的 Latest，Windows 发行版成为 Latest 时会遮住较早的 Android APK。
// export const UPDATE_API=`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`
export const UPDATE_API=`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases?per_page=100`
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
  // 保留 GitHub 附件的校验值，原生下载器校验完整性后才开放安装入口。
  // return {available:true,newer:newerAppVersion(release.tag_name,current),version:release.tag_name,url:asset.browser_download_url,notes:typeof release.body==='string'?release.body.slice(0,4000):'',message:newerAppVersion(release.tag_name,current)?'发现新版本。':'当前已是最新版本。'}
  return {available:true,newer:newerAppVersion(release.tag_name,current),version:release.tag_name,url:asset.browser_download_url,sha256:/^sha256:[0-9a-f]{64}$/.test(asset.digest||'')?asset.digest.slice(7):'',notes:typeof release.body==='string'?release.body.slice(0,4000):'',message:newerAppVersion(release.tag_name,current)?'发现新版本。':'当前已是最新版本。'}
}

// 同一仓库由电脑端和安卓端分别发布；从正式发行版中选最高的有效 APK 版本。
export function selectLatestAppRelease(releases,current) {
  if(!Array.isArray(releases))throw new Error('发行版列表格式错误。')
  let latest=null
  for(const release of releases){
    // Windows 标签与纯电脑安装包不属于安卓更新，不能让它们中断整次检查。
    if(!release||release.draft||release.prerelease||!parseAppVersion(release.tag_name))continue
    const candidate=selectAppRelease(release,current)
    // 原生下载器要求 GitHub 的完整 SHA256；没有摘要的 APK 不能作为可安装更新。
    if(!candidate.available||!candidate.sha256)continue
    if(!latest||newerAppVersion(candidate.version,latest.version))latest=candidate
  }
  return latest||{available:false,message:'暂未发布可下载安装的更新。'}
}

// Release 说明采用安全的纯文本分段：标题不显示 Markdown 井号，列表用界面圆点。
export function parseUpdateNotes(notes) {
  const blocks = []
  for (const source of String(notes || '').split(/\r?\n/u)) {
    const line = source.trim()
    if (!line) continue
    const heading = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/u)
    if (heading) { blocks.push({ type: 'heading', text: heading[1] }); continue }
    const item = line.match(/^[-*+]\s+(.+)$/u)
    if (item) {
      const previous = blocks.at(-1)
      if (previous?.type === 'list') previous.items.push(item[1])
      else blocks.push({ type: 'list', items: [item[1]] })
      continue
    }
    // Markdown 的分隔线不当作正文展示；歌词、网址中的普通符号保留。
    if (/^(?:-{3,}|\*{3,}|_{3,})$/u.test(line)) continue
    blocks.push({ type: 'text', text: line })
  }
  return blocks
}
