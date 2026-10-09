import { useEffect, useRef, useState } from 'react'
import { Camera, Pencil, UserRound, X } from 'lucide-react'
// 新资料组件区分展示与设置；旧编辑组件保留对照，不再作为默认入口。
export { default } from './ProfilePanel'

const KEY = 'uta-local-profile-v1'
function readProfile() { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }

// 头像裁成居中正方形并压缩，昵称与图片仅保存在当前设备。
async function avatarFromFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const context = canvas.getContext('2d')
    context.fillStyle = '#fffdf8'
    context.fillRect(0, 0, 256, 256)
    const edge = Math.min(image.naturalWidth, image.naturalHeight)
    context.drawImage(image, (image.naturalWidth - edge) / 2, (image.naturalHeight - edge) / 2, edge, edge, 0, 0, 256, 256)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally { URL.revokeObjectURL(url) }
}

function LegacyLocalProfile() {
  const [profile, setProfile] = useState(readProfile)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  useEffect(() => () => { request.current += 1 }, [])
  const close = () => { request.current += 1; setDraft(null); setBusy(false) }
  useEffect(() => {
    if (!draft) return undefined
    const back = (event) => { event.preventDefault(); close() }
    window.addEventListener('uta:navigate-back', back)
    return () => window.removeEventListener('uta:navigate-back', back)
  }, [draft])
  async function upload(file) {
    if (!file) return
    const current = ++request.current
    setBusy(true)
    setError('')
    try { const avatar = await avatarFromFile(file); if (current === request.current) setDraft((old) => old ? { ...old, avatar } : null) }
    catch (reason) { if (current === request.current) setError(reason.message || '无法读取图片。') }
    finally { if (current === request.current) setBusy(false) }
  }
  function save(event) {
    event.preventDefault()
    if (!draft.nickname?.trim()) { setError('请填写昵称。'); return }
    const value = { nickname: draft.nickname.trim(), avatar: draft.avatar || '' }
    try { localStorage.setItem(KEY, JSON.stringify(value)); setProfile(value); close() }
    catch { setError('本机存储空间不足，请清理后重试。') }
  }
  const avatar = (value) => value ? <img src={value} alt="个人头像" /> : <UserRound size={36} />
  return <><button type="button" className="local-profile-card" aria-label="编辑个人头像和昵称" onClick={() => { setError(''); setDraft({ nickname: profile.nickname || 'UTA 学习者', avatar: profile.avatar || '' }) }}><span className="local-profile-avatar">{avatar(profile.avatar)}</span><span className="local-profile-copy"><strong>{profile.nickname || 'UTA 学习者'}</strong><small>编辑头像与昵称</small></span><Pencil size={18} /></button>
    {draft && <div className="profile-editor-backdrop" onClick={close}><form className="profile-editor" role="dialog" aria-modal="true" aria-label="编辑个人资料" onClick={(event) => event.stopPropagation()} onSubmit={save}><header><h2>个人资料</h2><button type="button" onClick={close} aria-label="关闭个人资料"><X size={20} /></button></header><label className="profile-upload"><span className="local-profile-avatar">{avatar(draft.avatar)}</span><span><Camera size={16} />{busy ? '处理图片…' : '上传头像'}</span><input type="file" accept="image/*" disabled={busy} onChange={(event) => upload(event.target.files?.[0])} /></label><label className="profile-nickname">昵称<input value={draft.nickname} maxLength={24} onChange={(event) => setDraft({ ...draft, nickname: event.target.value })} /></label><p>保存在当前设备</p>{error && <p role="alert" className="profile-error">{error}</p>}<button className="profile-save" type="submit" disabled={busy}>保存</button></form></div>}
  </>
}
