const CLIENT = 'UTA Song Learning (https://github.com/meilawiet/Japanese-song-learning-website)';
const LIMIT = 2 * 1024 * 1024;

function lyricRequest(source, action, value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new Error('歌词搜索词或歌曲编号无效。');
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
    const response = await fetcher(url, { headers: request.headers, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.get('location') || '', url);
      if (next.protocol !== 'https:' || next.hostname !== original.hostname) throw new Error('歌词网站重定向到非预期地址。');
      url = next.href;
      continue;
    }
    if (response.status === 429) throw new Error('歌词网站请求过多，请稍后重试。');
    if (!response.ok) throw new Error(`歌词网站暂不可用（HTTP ${response.status}）。`);
    if (Number(response.headers.get('content-length') || 0) > LIMIT) throw new Error('歌词网站返回内容过大。');
    const body = await response.arrayBuffer();
    if (body.byteLength > LIMIT) throw new Error('歌词网站返回内容过大。');
    return new TextDecoder('utf-8').decode(body);
  }
  throw new Error('歌词网站重定向次数过多。');
}

module.exports = { lyricRequest, fetchLyrics };
