import { Capacitor, registerPlugin } from '@capacitor/core'

const CONFIG_KEY = 'uta-ai-provider-v1'
const SECRET_KEY = 'uta-ai-key-v1'
// Android 持久密钥由系统 Keystore 加密；会话内只保留在内存或 sessionStorage。
const credentialStore = registerPlugin('UtaAiCredential')
let mobileKey = ''

export const DEFAULT_AI_SETTINGS = {
  // Android 没有电脑本机后端，默认要求用户填写自己的 AI 服务。
  useServerDefault: !Capacitor.isNativePlatform(), name: 'DeepSeek', protocol: 'deepseek',
  base_url: 'https://api.deepseek.com', model: 'deepseek-flash',
  api_key: '', json_mode: true, rememberKey: false,
  // 默认关闭联网查询，开启后可能增加模型和搜索调用费用。
  web_search_enabled: false,
}

export function loadAiSettings() {
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null') || {}
    // 旧实现保留作对照：网页端记住的 API Key 存在 localStorage，手机端改用系统加密存储。
    const api_key = Capacitor.isNativePlatform()
      ? (config.rememberKey ? mobileKey : sessionStorage.getItem(SECRET_KEY))
      : (config.rememberKey ? localStorage.getItem(SECRET_KEY) : sessionStorage.getItem(SECRET_KEY))
    return { ...DEFAULT_AI_SETTINGS, ...config,
      useServerDefault: Capacitor.isNativePlatform() ? false : (config.useServerDefault ?? true),
      api_key: api_key || '' }
  } catch { return { ...DEFAULT_AI_SETTINGS } }
}

export async function loadAiSettingsFromDevice() {
  if (!Capacitor.isNativePlatform()) return loadAiSettings()
  const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null') || {}
  if (config.rememberKey) {
    const saved = await credentialStore.load()
    mobileKey = saved.value || ''
    // 旧版手机若曾明文保存密钥，首次读取后迁移到系统加密存储。
    const legacy = localStorage.getItem(SECRET_KEY)
    if (!mobileKey && legacy) { await credentialStore.save({ value: legacy }); mobileKey = legacy }
    localStorage.removeItem(SECRET_KEY)
  }
  return loadAiSettings()
}

export async function saveAiSettings(settings) {
  const { api_key, ...config } = settings
  if (Capacitor.isNativePlatform()) {
    mobileKey = api_key.trim()
    if (settings.rememberKey) {
      await credentialStore.save({ value: mobileKey })
      sessionStorage.removeItem(SECRET_KEY)
    } else {
      sessionStorage.setItem(SECRET_KEY, mobileKey)
      await credentialStore.clear()
    }
    localStorage.removeItem(SECRET_KEY)
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...config, useServerDefault: false }))
    window.dispatchEvent(new Event('uta:ai-settings'))
    return
  }
  // 网页端保留现有的会话保存或显式记住密钥行为。
  const destination = settings.rememberKey ? localStorage : sessionStorage
  destination.setItem(SECRET_KEY, settings.useServerDefault ? '' : api_key.trim())
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  const other = settings.rememberKey ? sessionStorage : localStorage
  other.removeItem(SECRET_KEY)
}

export async function clearAiSettings() {
  if (Capacitor.isNativePlatform()) { mobileKey = ''; await credentialStore.clear() }
  localStorage.removeItem(CONFIG_KEY)
  localStorage.removeItem(SECRET_KEY)
  sessionStorage.removeItem(SECRET_KEY)
}

export function aiRequestHeaders(settings = loadAiSettings()) {
  if (settings.useServerDefault) return {}
  return { 'X-UTA-AI-Config': encodeURIComponent(JSON.stringify({
    name: settings.name.trim(), protocol: settings.protocol,
    base_url: settings.base_url.trim(), model: settings.model.trim(),
    api_key: settings.api_key.trim(), json_mode: settings.json_mode,
  })) }
}

// 对话内仅改联网偏好，保持现有密钥和系统加密存储不变。
export function setWebSearchEnabled(enabled) {
  const config=JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}')
  localStorage.setItem(CONFIG_KEY,JSON.stringify({...config,web_search_enabled:Boolean(enabled)}))
  window.dispatchEvent(new Event('uta:ai-settings'))
}
