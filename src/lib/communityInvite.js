// 提醒偏好仅存在本机；从安装本功能后的首次启动计时，不读取歌曲或账号资料。
export const COMMUNITY_INVITE_KEY = 'uta-community-invite-v1'
export const QQ_GROUP = '1125131374'
export const INVITE_FIRST_DELAY = 3 * 24 * 60 * 60 * 1000
export const INVITE_INTERVAL = 30 * 24 * 60 * 60 * 1000
export const INVITE_IDLE_DELAY = 10 * 1000

// 损坏数据重新给予三天宽限；系统时间回拨时从当前时间重新等待，避免突然连续提醒。
export function readInvitePreference(storage, now = Date.now()) {
  try {
    const raw = storage.getItem(COMMUNITY_INVITE_KEY)
    let saved
    try { saved = JSON.parse(raw) } catch { saved = null }
    const validFirst = Number.isSafeInteger(saved?.firstSeenAt) && saved.firstSeenAt > 0
    const firstSeenAt = validFirst ? Math.min(saved.firstSeenAt, now) : now
    const lastShownAt = Number.isSafeInteger(saved?.lastShownAt) && saved.lastShownAt >= firstSeenAt
      ? Math.min(saved.lastShownAt, now) : 0
    const value = { firstSeenAt, lastShownAt, optedOut: saved?.optedOut === true }
    if (raw !== JSON.stringify(value)) storage.setItem(COMMUNITY_INVITE_KEY, JSON.stringify(value))
    return value
  } catch { return null } // 无法可靠保存频率时跳过提醒，避免每次启动重复弹出。
}

export function inviteDueAt(value) {
  if (!value || value.optedOut) return Infinity
  return Math.max(value.firstSeenAt + INVITE_FIRST_DELAY, value.lastShownAt ? value.lastShownAt + INVITE_INTERVAL : 0)
}

// 只有确实要显示时才占用本次提醒；先持久化，再渲染，防止进程重启重复弹出。
export function claimInviteDisplay(storage, now = Date.now()) {
  const value = readInvitePreference(storage, now)
  if (now < inviteDueAt(value)) return null
  const next = { ...value, lastShownAt: now }
  try { storage.setItem(COMMUNITY_INVITE_KEY, JSON.stringify(next)); return next } catch { return null }
}

// 勾选立即保存；取消勾选只恢复未来提醒，不清除本次展示时间。
export function setInviteOptOut(storage, optedOut, now = Date.now()) {
  const value = readInvitePreference(storage, now)
  if (!value) return false
  try { storage.setItem(COMMUNITY_INVITE_KEY, JSON.stringify({ ...value, optedOut: optedOut === true })); return true } catch { return false }
}
