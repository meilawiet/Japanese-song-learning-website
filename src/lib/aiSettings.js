const storageKey = 'uta-deepseek-api-key'
const storageError = '无法保存 API Key，请允许浏览器使用网站存储后重试。'

function normalizeApiKey(apiKey) {
  if (typeof apiKey !== 'string') throw new Error('请输入有效的 API Key。')
  const normalized = apiKey.trim()
  if (normalized.length > 512 || (normalized && !/^[\x21-\x7e]+$/.test(normalized))) {
    throw new Error('API Key 只能包含英文可见字符，不能包含空格或换行，且不能超过 512 个字符。')
  }
  return normalized
}

function readStorage(name) {
  try {
    return normalizeApiKey(window[name].getItem(storageKey) || '')
  } catch {
    return ''
  }
}

export function readAiSettings() {
  const sessionKey = readStorage('sessionStorage')
  if (sessionKey) return { apiKey: sessionKey, remember: false }
  const savedKey = readStorage('localStorage')
  return { apiKey: savedKey, remember: Boolean(savedKey) }
}

export function saveAiSettings({ apiKey, remember = false }) {
  const normalized = normalizeApiKey(apiKey)
  if (!normalized) {
    let failed = false
    // Try both stores even if one is unavailable so clearing removes every key it can.
    for (const name of ['sessionStorage', 'localStorage']) {
      try {
        window[name].removeItem(storageKey)
      } catch {
        failed = true
      }
    }
    if (failed) throw new Error(storageError)
    return { apiKey: '', remember: false }
  }

  const target = remember ? 'localStorage' : 'sessionStorage'
  const other = remember ? 'sessionStorage' : 'localStorage'
  try {
    const targetStorage = window[target]
    const otherStorage = window[other]
    const previousTargetKey = targetStorage.getItem(storageKey)
    // A quota failure must leave the existing working key in the other store intact.
    targetStorage.setItem(storageKey, normalized)
    try {
      otherStorage.removeItem(storageKey)
    } catch {
      // Keep the previous settings if the old copy cannot be removed.
      if (previousTargetKey === null) targetStorage.removeItem(storageKey)
      else targetStorage.setItem(storageKey, previousTargetKey)
      throw new Error(storageError)
    }
  } catch {
    throw new Error(storageError)
  }
  return { apiKey: normalized, remember: Boolean(remember) }
}

export function getAiRequestHeaders() {
  const { apiKey } = readAiSettings()
  return apiKey ? { 'X-DeepSeek-API-Key': apiKey } : {}
}
