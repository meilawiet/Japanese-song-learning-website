import { createLearningBackup, BACKUP_STORAGE_KEYS } from './learningBackup.js'
import { createCloudBackup, inspectCloudBackup } from './cloudBackup.js'
import { cloudAudioSong, songsFromCloudCatalog, reuseCloudAudio, sharedProgress, preserveDesktopPreferences, validateCloudAudio, MAX_CLOUD_FILE, CLOUD_SNAPSHOT_NAME } from './cloudAudioCatalog.js'
import { collectCloudExtras } from './cloudData.js'
import { loadLocalSongs, loadLocalSong, replaceLocalSongs, updateLocalSongMetadata } from './localSongStore.js'
import { saveLocalProfile } from './localProfile.js'
import { replaceLyricChats } from './lyricChatStore.js'
import { saveAiSettings } from './aiSettings.js'
import { saveRestoreSnapshot } from './restoreSnapshot.js'

const bridge = () => window.utaDesktop
export function normalizedWebDav(value) {
  let url
  try { url = new URL(value?.url) } catch { throw new Error('请填写有效的 WebDAV HTTPS 目录。') }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || !value.username?.trim() || !value.password) throw new Error('请填写 HTTPS 目录、账号和应用密码。')
  return { url: url.href.replace(/\/+$/, '') + '/', username: value.username, password: value.password }
}

export function webDavEntries(xml, base, singleName = null) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror') || doc.doctype || doc.documentElement.namespaceURI !== 'DAV:' || doc.documentElement.localName !== 'multistatus') throw new Error('WebDAV 目录格式无效。')
  const root = new URL(base), result = []
  for (const item of doc.getElementsByTagNameNS('DAV:', 'response')) {
    const href = item.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent
    let url, name
    try { url = new URL(href, root); name = decodeURIComponent(url.pathname.slice(root.pathname.length)) } catch { continue }
    if (url.origin !== root.origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(root.pathname) || name.includes('/')) continue
    if (singleName ? name !== singleName : !CLOUD_SNAPSHOT_NAME.test(name)) continue
    const directStatus = [...item.children].find(child => child.localName === 'status')?.textContent || ''
    if (directStatus && !/HTTP\/\S+ 2\d\d\b/.test(directStatus)) continue
    const properties = [...item.getElementsByTagNameNS('DAV:', 'propstat')].filter(prop => /HTTP\/\S+ 200\b/.test(prop.getElementsByTagNameNS('DAV:', 'status')[0]?.textContent || ''))
    const lengths = properties.flatMap(prop => [...prop.getElementsByTagNameNS('DAV:', 'getcontentlength')])
    const raw = lengths[0]?.textContent?.trim(), size = raw && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : -1
    result.push({ name, size, modified: properties[0]?.getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent || '' })
  }
  return [...new Map(result.map(item => [item.name, item])).values()].sort((a, b) => b.name.localeCompare(a.name))
}

async function stage(blob, signal, report) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > MAX_CLOUD_FILE) throw new Error('单个云文件须在 500 MiB 以内。')
  const { id } = await bridge().webDav('begin')
  try {
    for (let offset = 0; offset < blob.size; offset += 256 * 1024) {
      signal?.throwIfAborted()
      await bridge().webDav('append', { id, bytes: await blob.slice(offset, offset + 256 * 1024).arrayBuffer() })
      report?.({ phase: '准备文件', done: Math.min(offset + 256 * 1024, blob.size), total: blob.size })
    }
    return id
  } catch (error) { await bridge().webDav('release', { id }); throw error }
}

export async function digestAudio(blob, signal) {
  const id = await stage(blob, signal)
  try { signal?.throwIfAborted(); return (await bridge().webDav('digest', { id })).sha256 }
  finally { await bridge().webDav('release', { id }) }
}
async function remoteAudio(config, ref, signal) {
  signal?.throwIfAborted()
  const result = await bridge().webDav('stat', { config, name: ref.name })
  signal?.throwIfAborted()
  if (!result.exists) return false
  const entry = webDavEntries(result.xml, config.url, ref.name)[0]
  if (!entry) return false
  if (entry.size !== -1 && entry.size !== ref.size) throw new Error('云端已有音频大小异常，未提交新快照。')
  return true
}

export async function listCrossPlatformSnapshots(settings, signal) {
  const config = normalizedWebDav(settings)
  signal?.throwIfAborted()
  const { xml } = await bridge().webDav('directory', { config, create: true })
  signal?.throwIfAborted()
  return webDavEntries(xml, config.url)
}

export async function uploadCrossPlatformSnapshot(settings, data, { signal, report = () => {} } = {}) {
  const config = normalizedWebDav(settings), descriptors = []
  let uploaded = 0, reused = 0, uploadedBytes = 0
  signal?.throwIfAborted()
  const { xml } = await bridge().webDav('directory', { config, create: true })
  signal?.throwIfAborted()
  webDavEntries(xml, config.url)
  for (const [index, record] of data.songs.entries()) {
    signal?.throwIfAborted()
    report({ phase: `处理音频 ${index + 1}/${data.songs.length}`, title: record.title })
    let audio = null
    if (record.lyricsOnly) {
      if (record.audioBlob?.size || record.cloudPending) throw new Error(`《${record.title}》的纯歌词标记与音频不一致。`)
    } else if (record.audioBlob instanceof Blob && record.audioBlob.size) {
      const id = await stage(record.audioBlob, signal, report)
      try {
        const { sha256, size } = await bridge().webDav('digest', { id })
        audio = { name: `_uta-audio-${sha256}.bin`, sha256, size, type: record.audioBlob.type || '' }
        if (await remoteAudio(config, audio, signal)) reused++
        else {
          signal?.throwIfAborted()
          await bridge().webDav('upload', { config, id, name: audio.name }); uploaded++; uploadedBytes += size
        }
      } finally { await bridge().webDav('release', { id }) }
    } else {
      audio = validateCloudAudio(record.cloudAudio)
      if (!record.cloudPending || record.cloudAudio.origin !== config.url) throw new Error(`《${record.title}》音频尚未下载，请先从原云目录下载，才能迁移目录。`)
      if (!await remoteAudio(config, audio, signal)) throw new Error(`《${record.title}》的云音频已不存在，请从原设备重新上传。`)
      reused++
    }
    descriptors.push(cloudAudioSong(record, audio))
  }
  signal?.throwIfAborted()
  const catalog = { version: 2, songs: descriptors }
  songsFromCloudCatalog(catalog, config.url)
  const core = createLearningBackup([], { ...data.state, progress: sharedProgress(data.state.progress) })
  const snapshot = createCloudBackup(core, { ...data.extras, catalog, version: 3 }, data.avatar)
  const inspection = await inspectCloudBackup(snapshot)
  if (!inspection.cloudCatalog) throw new Error('快照协议校验失败。')
  const name = `UTA-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}.uta-backup`
  const id = await stage(snapshot, signal, report)
  try { signal?.throwIfAborted(); report({ phase: '提交资料快照', title: name }); await bridge().webDav('upload', { config, id, name }) }
  finally { await bridge().webDav('release', { id }) }
  return { name, uploaded, reused, uploadedBytes, songs: descriptors.length }
}

export async function downloadCloudFile(settings, name, { signal, expected, report = () => {} } = {}) {
  const config = normalizedWebDav(settings)
  signal?.throwIfAborted()
  const { id, size } = await bridge().webDav('download', { config, name, expected })
  try {
    const parts = []
    for (let offset = 0; offset < size; offset += 256 * 1024) {
      signal?.throwIfAborted()
      const chunk = await bridge().webDav('read', { id, offset })
      if (chunk.byteLength !== Math.min(256 * 1024, size - offset)) throw new Error('下载分块不完整，未保存。')
      parts.push(chunk); report({ phase: '读取已校验文件', done: offset + chunk.byteLength, total: size })
    }
    const blob = new Blob(parts, { type: expected?.type || 'application/octet-stream' }); blob.webDavOrigin = config.url
    return blob
  } finally { await bridge().webDav('release', { id }) }
}
export async function previewCrossPlatformSnapshot(config, name, options) {
  const file = await downloadCloudFile(config, name, options), inspection = await inspectCloudBackup(file)
  if (!inspection.cloudCatalog) throw new Error('此文件不是跨端快照 v3，请先升级另一端后重新上传。')
  return { ...inspection, snapshotName: name, origin: normalizedWebDav(config).url }
}

export async function downloadPendingAudio(settings, songId, options = {}) {
  const record = await loadLocalSong(songId), config = normalizedWebDav(settings)
  if (!record?.cloudPending || !record.cloudAudio) throw new Error('这首歌没有待下载音频。')
  if (record.cloudAudio.origin !== config.url) throw new Error('当前目录与该音频的来源不同，请切回恢复快照时的云目录。')
  const ref = validateCloudAudio(record.cloudAudio)
  const audioBlob = await downloadCloudFile(config, ref.name, { ...options, expected: ref })
  options.signal?.throwIfAborted()
  const latest = await loadLocalSong(songId)
  if (!latest || latest.cloudAudio?.sha256 !== ref.sha256 || latest.cloudAudio?.origin !== config.url) throw new Error('歌曲已变化，未写入下载结果。')
  // Metadata is read at commit time; downloading must not restore old lyrics.
  await updateLocalSongMetadata(songId, { audioBlob, cloudPending: false })
  return { ...latest, audioBlob, cloudPending: false }
}

// Full restore spans IndexedDB, localStorage and the encrypted key store. The durable
// snapshot is written first; a recovery marker remains if the process is interrupted.
export async function restoreCrossPlatformSnapshot(inspection, localState, { aiPolicy = 'keep', signal, report = () => {} } = {}) {
  if (!inspection.cloudCatalog || !['keep', 'snapshot'].includes(aiPolicy)) throw new Error('恢复参数无效。')
  signal?.throwIfAborted()
  if (await bridge().webDav('recoveryStatus')) throw new Error('上次恢复尚未完成，请先在数据管理中恢复原恢复点。')
  const previousSongs = await loadLocalSongs(), previous = await collectCloudExtras(true)
  const keys = [...Object.values(BACKUP_STORAGE_KEYS), 'uta-local-profile-v1', 'uta-recent-learn-v1', 'uta-recent-sing-v1', 'uta-pending-ai-imports-v1', 'uta-cross-restore-pending-v1']
  const storage = Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]))
  const records = await reuseCloudAudio(inspection.catalogSongs, previousSongs, digestAudio, signal)
  const progress = preserveDesktopPreferences(inspection.manifest.progress, localState.progress)
  // Hidden annotations are a desktop preference, but token indices can change
  // across devices. Retain them only when the exact line and token still match.
  progress.hiddenReadings = Object.fromEntries(Object.entries(localState.progress.hiddenReadings || {}).filter(([key]) => {
    const match = key.match(/^(.*):(-?\d+):(-?\d+)$/)
    if (!match) return false
    const [, songId, lineId, index] = match
    const oldLine = localState.annotations[songId]?.find(line => line.id === Number(lineId))
    const newLine = inspection.manifest.annotations[songId]?.find(line => line.id === Number(lineId))
    const oldToken = oldLine?.tokens.find(token => token.index === Number(index))
    const newToken = newLine?.tokens.find(token => token.index === Number(index))
    return oldLine?.text === newLine?.text && oldToken && newToken && oldToken.surface === newToken.surface && oldToken.reading === newToken.reading
  }))
  const restoredState = { ...inspection.manifest, progress }
  const safeExtras = structuredClone(previous.extras)
  if (safeExtras.ai) delete safeExtras.ai.api_key
  safeExtras.desktopRecovery = { keepAi: true }
  const recovery = createCloudBackup(createLearningBackup(previousSongs, localState), safeExtras, previous.avatar)
  report({ phase: '保存恢复前快照' })
  const snapshot = await saveRestoreSnapshot(recovery, bridge(), percent => report({ phase: '保存恢复前快照', done: percent, total: 100 }))
  signal?.throwIfAborted()
  const applyExtras = async (extras, avatar, applyAi) => {
    await saveLocalProfile({ ...extras.profile, avatarStored: Boolean(avatar) }, avatar)
    await replaceLyricChats(extras.chats)
    if (applyAi && extras.ai) await saveAiSettings({ ...extras.ai, api_key: extras.ai.api_key || '', rememberKey: Boolean(extras.ai.rememberKey && extras.ai.api_key) })
    for (const [field, key] of [['learn', 'uta-recent-learn-v1'], ['sing', 'uta-recent-sing-v1']]) {
      if (typeof extras.recent?.[field] === 'string') localStorage.setItem(key, extras.recent[field]); else localStorage.removeItem(key)
    }
  }
  let restoreStarted = false
  try {
    await bridge().webDav('restoreBegin', { name: snapshot.name, ai: previous.extras.ai })
    restoreStarted = true
    localStorage.setItem('uta-cross-restore-pending-v1', 'true')
    report({ phase: '恢复学习资料，请勿关闭程序' })
    await replaceLocalSongs(records)
    for (const [field, key] of Object.entries(BACKUP_STORAGE_KEYS)) localStorage.setItem(key, JSON.stringify(restoredState[field] || {}))
    await applyExtras(inspection.extras, inspection.avatar, aiPolicy === 'snapshot')
    localStorage.removeItem('uta-pending-ai-imports-v1')
    await bridge().webDav('restoreFinish')
    localStorage.removeItem('uta-cross-restore-pending-v1')
    return { snapshot, records, pending: records.filter(song => song.cloudPending).length }
  } catch (failure) {
    if (!restoreStarted) throw failure
    try {
      await replaceLocalSongs(previousSongs)
      await applyExtras(previous.extras, previous.avatar, aiPolicy === 'snapshot')
      for (const [key, value] of Object.entries(storage)) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) }
      await bridge().webDav('restoreFinish')
    } catch { throw new Error(`恢复和自动回滚未完成。请保留数据，从恢复前快照恢复：${snapshot.path}`) }
    throw new Error(`恢复失败，已回滚原数据。恢复点：${snapshot.path}。${failure.message || ''}`)
  }
}
