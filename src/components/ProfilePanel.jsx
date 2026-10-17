import { useEffect, useRef, useState } from 'react'
import { UserRound, X } from 'lucide-react'
import { avatarImageStyle, loadAvatarBlob, MAX_AVATAR_BYTES, readLocalProfile, saveLocalProfile } from '../lib/localProfile'
// 日语等级与昵称/头像一同保存在个人资料，供首次询问及解析请求复用。
import {JAPANESE_LEVELS,normalizeJapaneseLevel} from '../lib/japaneseLevel'

// 展示页只放大查看；设置页提供上传、裁剪和昵称编辑。GIF 保留原文件，使用裁剪窗口保留动画。
export default function ProfilePanel({ editable = false }) {
  const [profile, setProfile] = useState(readLocalProfile)
  const [url, setUrl] = useState(profile.avatar || '')
  const [view, setView] = useState(false)
  const [nickname, setNickname] = useState(profile.nickname || 'UTA 学习者')
  const [japaneseLevel,setJapaneseLevel]=useState(()=>normalizeJapaneseLevel(profile.japaneseLevel))
  const [image, setImage] = useState(null)
  const [crop, setCrop] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  // 安卓原生选图复制失败时，使用同一处红色错误提示，不把取消选图当成错误。
  useEffect(() => {
    const failed = event => { setError(event.detail || '无法读取头像，请重新选择。'); setNotice('') }
    window.addEventListener('uta:avatar-picker-error', failed)
    return () => window.removeEventListener('uta:avatar-picker-error', failed)
  }, [])
  useEffect(() => {
    let alive = true, currentUrl
    const refresh = async () => {
      const saved = readLocalProfile(); setProfile(saved)
      if (saved.avatarStored) { try { const blob = await loadAvatarBlob(); if (!alive || !blob) return; if (currentUrl) URL.revokeObjectURL(currentUrl); currentUrl = URL.createObjectURL(blob); setUrl(currentUrl) } catch { if (alive) setError('无法读取头像，请重新上传。') } }
      else setUrl(saved.avatar || '')
    }
    refresh(); window.addEventListener('uta:profile-changed', refresh)
    return () => { alive = false; generation.current++; if (currentUrl) URL.revokeObjectURL(currentUrl); window.removeEventListener('uta:profile-changed', refresh) }
  }, [])
  useEffect(() => () => { if (image?.url) URL.revokeObjectURL(image.url) }, [image])
  useEffect(() => {
    if (!view) return undefined
    const back = event => { event.preventDefault(); setView(false) }
    window.addEventListener('uta:navigate-back', back)
    return () => window.removeEventListener('uta:navigate-back', back)
  }, [view])
  async function upload(file) {
    if (!file) return
    const turn = ++generation.current
    setError(''); setNotice(''); setBusy(true)
    let preview
    try {
      if (file.size > MAX_AVATAR_BYTES) throw new Error('头像文件不能超过 10 MB。')
      // 原来只看 file.type；安卓文件提供者可能标错 MIME，改用 GIF 文件头识别，避免误转成 JPEG。
      // 将系统选择器的文件读入独立内存，避免输入控件重置后原文件句柄失效。
      const buffer = await file.arrayBuffer()
      if (!buffer.byteLength) throw new Error('图片文件为空，请重新选择原始图片。')
      if (buffer.byteLength > MAX_AVATAR_BYTES) throw new Error('头像文件不能超过 10 MB。')
      const bytes = new Uint8Array(buffer.slice(0,12))
      const header = new TextDecoder().decode(bytes.slice(0,6))
      const isGif = header === 'GIF89a' || header === 'GIF87a'
      // 静态图同样按真实文件头识别，兼容手机文件管理器返回空类型或通用类型的情况。
      const mime = isGif ? 'image/gif' : bytes[0]===255&&bytes[1]===216&&bytes[2]===255 ? 'image/jpeg' : bytes[0]===137&&new TextDecoder().decode(bytes.slice(1,4))==='PNG' ? 'image/png' : new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP' ? 'image/webp' : ''
      if (!mime) throw new Error('请选择 JPG、PNG、WebP 或 GIF 原始图片；暂不支持 HEIC 等格式。')
      const normalized = new Blob([buffer],{type:mime})
      preview = URL.createObjectURL(normalized)
      // 原来的 decode() 在部分安卓 WebView 的系统相册返回流程中会提前拒绝有效图片。
      // const decoded = new Image(); decoded.src = preview; await decoded.decode()
      // 等待图片实际加载；若 WebView 无法读取 blob URL，改用内存图片地址重试，GIF 帧保持不变。
      const decoded = new Image()
      const loadImage = source => new Promise((resolve,reject) => {decoded.onload=()=>resolve();decoded.onerror=()=>reject(new Error('无法读取图片，请重新选择本机的原始图片文件。'));decoded.src=source})
      try {await loadImage(preview)} catch {
        const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('无法读取图片文件，请重新选择。'));reader.readAsDataURL(normalized)})
        await loadImage(dataUrl)
        URL.revokeObjectURL(preview);preview=dataUrl
      }
      if (decoded.naturalWidth * decoded.naturalHeight > 40000000) throw new Error('图片尺寸过大，请缩小后上传。')
      if (turn !== generation.current) return
      // GIF 保存全部原始帧；仅修正 MIME，不进行 Canvas 转码。
      setImage({ file:normalized, url:preview, decoded, gif:isGif }); preview = null
      setCrop({ width:decoded.naturalWidth, height:decoded.naturalHeight, zoom:1, x:.5, y:.5 })
    } catch (failure) { if (turn === generation.current) setError(failure instanceof DOMException ? '无法读取或解码图片，请重新选择本机的原始图片文件。' : failure.message || '无法读取图片。') }
    finally { if (preview) URL.revokeObjectURL(preview); if (turn === generation.current) setBusy(false) }
  }
  async function save(event) {
    event.preventDefault()
    if (!nickname.trim()) { setError('请填写昵称。'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      // 原资料仅保存昵称：let blob, value = { ...profile, nickname:nickname.trim() }
      let blob, value = { ...profile, nickname:nickname.trim(),japaneseLevel,japaneseLevelPrompted:true }
      if (image) {
        if (image.gif) { blob = image.file; value.avatarCrop = crop }
        else {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
          const ctx = canvas.getContext('2d'), edge = Math.min(crop.width, crop.height) / crop.zoom
          ctx.fillStyle = '#fffdf8'; ctx.fillRect(0,0,512,512)
          ctx.drawImage(image.decoded, crop.x * (crop.width-edge), crop.y * (crop.height-edge), edge, edge, 0,0,512,512)
          blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88))
          if (!blob) throw new Error('无法保存裁剪图片。')
          delete value.avatarCrop
        }
        value.avatarStored = true; delete value.avatar
      }
      await saveLocalProfile(value, blob); setImage(null); setCrop(null); setNotice('个人资料已保存。')
    } catch (failure) { setError(failure.message || '存储空间不足，请清理后重试。') }
    finally { setBusy(false) }
  }
  const avatar = (source, region) => source ? <img src={source} alt="个人头像" style={avatarImageStyle(region)} /> : <UserRound size={58} />
  // 原个人资料表单保留对照：
//   if (editable) return <form className="profile-settings" onSubmit={save}>{/* 弹窗顶部已显示个人资料，按要求删除内容区重复标题。 */}<div className="profile-crop-window">{avatar(image?.url || url, crop || profile.avatarCrop)}</div><label className="profile-upload-control">上传头像<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={async event => { const input=event.target; const file=input.files?.[0]; await upload(file); input.value = '' }} /></label><small>JPG、PNG、WebP、GIF，每个文件不超过 10 MB</small>{image && <div className="profile-crop-controls"><p>调整头像显示范围{image.gif ? '（保留 GIF 动画）' : ''}</p>{[['zoom','缩放',1,3],['x','左右',0,1],['y','上下',0,1]].map(([key,label,min,max]) => <label key={key}>{label}<input type="range" aria-label={label} min={min} max={max} step="0.01" value={crop[key]} onChange={event => setCrop({ ...crop, [key]:Number(event.target.value) })} /></label>)}</div>}<label className="profile-nickname">昵称<input maxLength={24} value={nickname} onChange={event => setNickname(event.target.value)} /></label>{error && <p role="alert" className="profile-error">{error}</p>}{notice && <p role="status">{notice}</p>}<button className="profile-save" disabled={busy} type="submit">{busy ? '处理中…' : '保存个人资料'}</button><small>仅保存在当前设备</small></form>
  if (editable) return <form className="profile-settings" onSubmit={save}>{/* 弹窗顶部已显示个人资料，按要求删除内容区重复标题。 */}<div className="profile-crop-window">{avatar(image?.url || url, crop || profile.avatarCrop)}</div><label className="profile-upload-control">上传头像<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={async event => { const input=event.target; const file=input.files?.[0]; await upload(file); input.value = '' }} /></label><small>JPG、PNG、WebP、GIF，每个文件不超过 10 MB</small>{image && <div className="profile-crop-controls"><p>调整头像显示范围{image.gif ? '（保留 GIF 动画）' : ''}</p>{[['zoom','缩放',1,3],['x','左右',0,1],['y','上下',0,1]].map(([key,label,min,max]) => <label key={key}>{label}<input type="range" aria-label={label} min={min} max={max} step="0.01" value={crop[key]} onChange={event => setCrop({ ...crop, [key]:Number(event.target.value) })} /></label>)}</div>}<label className="profile-nickname">昵称<input maxLength={24} value={nickname} onChange={event => setNickname(event.target.value)} /></label><label className="profile-japanese-level">日语水平<select aria-label="日语水平" value={japaneseLevel} disabled={busy} onChange={event=>setJapaneseLevel(event.target.value)}>{JAPANESE_LEVELS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select><small>保存后用于新的日语AI解析；已有解析可手动重新生成。</small></label>{error && <p role="alert" className="profile-error">{error}</p>}{notice && <p role="status">{notice}</p>}<button className="profile-save" disabled={busy} type="submit">{busy ? '处理中…' : '保存个人资料'}</button><small>仅保存在当前设备</small></form>
  return <><div className="local-profile-centered"><button className="local-profile-view" type="button" aria-label="查看头像" onClick={() => setView(true)}>{avatar(url, profile.avatarCrop)}</button><strong>{profile.nickname || 'UTA 学习者'}</strong></div>{view && <div className="profile-view-backdrop" role="dialog" aria-modal="true" aria-label="查看头像" onClick={() => setView(false)}><button type="button" aria-label="关闭头像预览"><X size={26} /></button><div className="profile-large-avatar">{avatar(url, profile.avatarCrop)}</div></div>}</>
}
