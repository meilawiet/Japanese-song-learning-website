// 旧版只从 GitHub 读取；新版优先使用同一 APK 的 Gitee 发行版，检测不上传本机资料。
export const UPDATE_REPOSITORY='meilawiet/Japanese-song-learning-website'
export const GITEE_UPDATE_REPOSITORY='git277992790/UTA'
// 原接口只返回全仓库的 Latest，Windows 发行版成为 Latest 时会遮住较早的 Android APK。
// export const UPDATE_API=`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`
export const UPDATE_API=`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases?per_page=100`
export const GITEE_UPDATE_API=`https://gitee.com/api/v5/repos/${GITEE_UPDATE_REPOSITORY}/releases?per_page=100`

// 两个平台的初始下载地址都限定到已知仓库的 Release 附件；不接受任意镜像或登录凭据。
export function isOfficialAppDownloadUrl(value,source='github') {
  try {
    const url=new URL(value),repository=source==='gitee'?GITEE_UPDATE_REPOSITORY:UPDATE_REPOSITORY
    return ['github','gitee'].includes(source)&&url.protocol==='https:'&&url.hostname===`${source}.com`&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith(`/${repository}/releases/download/`)&&url.pathname.endsWith('.apk')
  } catch { return false }
}

// Gitee 附件 API 没有摘要字段；发布流程把同一 APK 的 SHA256 放在不可见的说明注释中。
export function releaseIntegrity(notes) {
  const matches=[...String(notes||'').matchAll(/<!-- uta-apk (\{[^\r\n]*\}) -->/gu)]
  if(matches.length!==1||matches[0][1].length>2000)return null
  try {
    const value=JSON.parse(matches[0][1])
    return typeof value.name==='string'&&/^sha256:[0-9a-f]{64}$/.test(value.digest||'')&&Number.isSafeInteger(value.size)&&value.size>0&&value.size<=128*1024*1024?value:null
  } catch { return null }
}
export function visibleReleaseNotes(notes) { return String(notes||'').replace(/<!-- uta-apk [\s\S]*?-->/gu,'').trim() }
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
// source 默认保持 GitHub，便于沿用旧版筛选逻辑与电脑端混合发行版回归。
export function selectAppRelease(release,current,source='github') {
  if(!release||release.draft||release.prerelease)return {available:false,message:'暂未发布可用的更新。'}
  if(!parseAppVersion(release.tag_name))throw new Error('发布版本号无法识别，请稍后重试。')
  const assets=(release.assets||[]).filter(asset=>{
    if(typeof asset.name!=='string'||!/\.apk$/i.test(asset.name)||/debug|\bdev\b/i.test(asset.name))return false
    // 原仅允许 github.com；现在按当前发行源核对官方仓库。
    // try{const url=new URL(asset.browser_download_url);return url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith(`/${UPDATE_REPOSITORY}/releases/download/`)}catch{return false}
    return isOfficialAppDownloadUrl(asset.browser_download_url,source)
  })
  if(!assets.length)return {available:false,message:'暂未发布可下载安装的更新。'}
  const asset=assets.find(a=>/universal/i.test(a.name))||assets[0]
  const integrity=source==='gitee'?releaseIntegrity(release.body):null
  const digest=source==='gitee'
    ? integrity?.tag===release.tag_name&&integrity.name===asset.name?integrity.digest:''
    : asset.digest
  // 保留 GitHub 附件的校验值，原生下载器校验完整性后才开放安装入口。
  // return {available:true,newer:newerAppVersion(release.tag_name,current),version:release.tag_name,url:asset.browser_download_url,notes:typeof release.body==='string'?release.body.slice(0,4000):'',message:newerAppVersion(release.tag_name,current)?'发现新版本。':'当前已是最新版本。'}
  // 原返回值仅包含 GitHub 地址；Gitee 失败时只回退到同版本、同文件、同摘要的 GitHub APK。
  // return {available:true,newer:newerAppVersion(release.tag_name,current),version:release.tag_name,url:asset.browser_download_url,sha256:/^sha256:[0-9a-f]{64}$/.test(asset.digest||'')?asset.digest.slice(7):'',notes:typeof release.body==='string'?release.body.slice(0,4000):'',message:newerAppVersion(release.tag_name,current)?'发现新版本。':'当前已是最新版本。'}
  return {available:true,newer:newerAppVersion(release.tag_name,current),version:release.tag_name,source,url:asset.browser_download_url,fallbackUrl:source==='gitee'?`https://github.com/${UPDATE_REPOSITORY}/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(asset.name)}`:'',sha256:/^sha256:[0-9a-f]{64}$/.test(digest||'')?digest.slice(7):'',notes:visibleReleaseNotes(release.body).slice(0,4000),message:newerAppVersion(release.tag_name,current)?'发现新版本。':'当前已是最新版本。'}
}

// 同一仓库由电脑端和安卓端分别发布；从正式发行版中选最高的有效 APK 版本。
export function selectLatestAppRelease(releases,current,source='github') {
  if(!Array.isArray(releases))throw new Error('发行版列表格式错误。')
  let latest=null
  for(const release of releases){
    // Windows 标签与纯电脑安装包不属于安卓更新，不能让它们中断整次检查。
    if(!release||release.draft||release.prerelease||!parseAppVersion(release.tag_name))continue
    const candidate=selectAppRelease(release,current,source)
    // 两个发行源都要求完整 SHA256；没有摘要的 APK 不能作为可安装更新。
    if(!candidate.available||!candidate.sha256)continue
    if(!latest||newerAppVersion(candidate.version,latest.version))latest=candidate
  }
  return latest||{available:false,message:'暂未发布可下载安装的更新。'}
}

// Release 说明采用安全的纯文本分段：标题不显示 Markdown 井号，列表用界面圆点。
export function parseUpdateNotes(notes) {
  const blocks = []
  // 原直接 split 原始 notes；新版先去掉发行校验注释，避免其出现在手机界面。
  // for (const source of String(notes || '').split(/\r?\n/u)) {
  for (const source of visibleReleaseNotes(notes).split(/\r?\n/u)) {
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
