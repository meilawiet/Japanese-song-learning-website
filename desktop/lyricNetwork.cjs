const CLIENT = 'UTA Song Learning (https://github.com/meilawiet/Japanese-song-learning-website)';
const LIMIT = 2 * 1024 * 1024;
const { normalizeBaseUrl } = require('./lyricSources.cjs');
const { platformLyricRequest } = require('./platformLyricNetwork.cjs');

function lyricRequest(source, action, value, configuredSource) {
  if (action === 'platform' && configuredSource?.id === source && configuredSource.enabled) return platformLyricRequest(configuredSource.kind, value);
  if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new Error('歌词搜索词或歌曲编号无效。');
  if (configuredSource) {
    if (configuredSource.id !== source || !configuredSource.enabled) throw new Error('该歌词源未启用，请在设置中检查。');
    if (configuredSource.kind === 'lrclib' && action === 'search') {
      return { url: `${normalizeBaseUrl(configuredSource.baseUrl)}/api/search?${new URLSearchParams({ q: value.trim() })}`, headers: { 'Lrclib-Client': CLIENT } };
    }
    if (configuredSource.kind !== 'utaten') throw new Error('不支持的歌词来源或操作。');
    source = 'utaten';
  }
  if (source === 'lrclib' && action === 'search') {
    return { url: `https://lrclib.net/api/search?${new URLSearchParams({ q: value.trim() })}`, headers: { 'Lrclib-Client': CLIENT } };
  }
  if (source === 'utaten' && action === 'search') {
    const [title, artist = ''] = value.trim().split(/\s+\/\s+/, 2);
    return { url: `https://utaten.com/lyric/search?${new URLSearchParams({ title, artist_name: artist, sort: 'popular_sort_asc' })}`, headers: { Accept: 'text/html', Referer: 'https://utaten.com/' } };
  }
  if (source === 'utaten' && action === 'fetch' && /^[a-z0-9]{1,80}$/i.test(value)) {
    return { url: `https://utaten.com/lyric/${value}/`, headers: { Accept: 'text/html', Referer: 'https://utaten.com/' } };
  }
  throw new Error('不支持的歌词来源或操作。');
}

async function fetchLyrics(request, fetcher) {
  const original = new URL(request.url);
  let url = original.href;
  for (let redirect = 0; redirect < 4; redirect++) {
    let response;
    try { response = await fetcher(url, { headers: request.headers, redirect: 'manual', signal: AbortSignal.timeout(20000) }); }
    catch (error) { throw new Error(error.name === 'TimeoutError' || error.name === 'AbortError' ? '歌词源连接超时，请稍后重试。' : '无法连接歌词源，请检查网络或在设置中更换来源。'); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.get('location') || '', url);
      if (next.origin !== original.origin || next.username || next.password) throw new Error('歌词网站重定向到非预期地址。');
      url = next.href;
      continue;
    }
    if (response.status === 429) {
      const header = response.headers.get('retry-after');
      const delay = header && /^\d+$/.test(header) ? Number(header) : header ? Math.ceil((Date.parse(header) - Date.now()) / 1000) : 60;
      const error = new Error('请求过于频繁，稍后可重试或在设置中换用其他歌词源。');
      error.code = 'RATE_LIMITED';
      error.retryAfter = Math.max(1, Math.min(3600, Number.isFinite(delay) ? delay : 60));
      throw error;
    }
    if (!response.ok) throw new Error(`歌词网站暂不可用（HTTP ${response.status}）。`);
    if (Number(response.headers.get('content-length') || 0) > LIMIT) throw new Error('歌词网站返回内容过大。');
    const body = await response.arrayBuffer();
    if (body.byteLength > LIMIT) throw new Error('歌词网站返回内容过大。');
    return new TextDecoder('utf-8').decode(body);
  }
  throw new Error('歌词网站重定向次数过多。');
}

// Coalesce repeated searches across import panels, cache successes, and honor
// provider cooldowns. No automatic retry loop is sent to a rate-limited server.
function createLyricsClient(fetcher, now = Date.now) {
  const cache = new Map(), pending = new Map(), cooldowns = new Map();
  return async request => {
    const key = request.url;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.body;
    if (pending.has(key)) return pending.get(key);
    const origin = new URL(key).origin;
    const until = cooldowns.get(origin) || 0;
    if (until > now()) {
      const error = new Error('该歌词源正在限流等待中，可使用其他来源。');
      error.code = 'RATE_LIMITED'; error.retryAfter = Math.ceil((until - now()) / 1000);
      throw error;
    }
    const task = fetchLyrics(request, fetcher).then(body => {
      cache.delete(key); cache.set(key, { body, expires: now() + 5 * 60 * 1000 });
      while (cache.size > 40) cache.delete(cache.keys().next().value);
      return body;
    }).catch(error => {
      if (error.code === 'RATE_LIMITED') cooldowns.set(origin, now() + error.retryAfter * 1000);
      throw error;
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  };
}

module.exports = { lyricRequest, fetchLyrics, createLyricsClient };
