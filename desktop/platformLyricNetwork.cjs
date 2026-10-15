// Fixed, read-only lyric endpoints ported from android-dev platformLyrics.js.
// The renderer supplies the generated URL; reconstruct it from validated fields
// so a configured platform is never a general-purpose network proxy.
const ENDPOINTS = {
  netease: ['https://music.163.com/api/search/get/web', 'https://music.163.com/api/song/lyric'],
  kugou: ['https://mobiles.kugou.com/api/v3/search/song', 'https://lyrics.kugou.com/search', 'https://lyrics.kugou.com/download'],
  kuwo: ['https://search.kuwo.cn/r.s', 'https://m.kuwo.cn/newh5/singles/songinfoandlrc'],
  qq: ['https://u.y.qq.com/cgi-bin/musicu.fcg'],
};
const REFERERS = { netease: 'https://music.163.com/', kugou: 'https://www.kugou.com/', kuwo: 'https://www.kuwo.cn/', qq: 'https://y.qq.com/' };
const invalid = () => { throw new Error('歌词平台请求无效，请重新搜索并选择歌曲。'); };
const keyword = value => typeof value === 'string' && value.trim() && value.length <= 160 ? value : invalid();
const digits = value => typeof value === 'string' && /^\d{1,18}$/.test(value) ? value : invalid();
const mid = value => typeof value === 'string' && /^[a-z0-9]{8,32}$/i.test(value) ? value : invalid();
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const equal = (a, b) => {
  if (!plain(a) || !plain(b) || Object.keys(a).length !== Object.keys(b).length) return false;
  return Object.keys(a).every(key => Object.hasOwn(b, key) && (plain(a[key]) ? equal(a[key], b[key]) : a[key] === b[key]));
};

function platformLyricRequest(provider, value) {
  if (typeof value !== 'string' || value.length > 4096) return invalid();
  let url;
  try { url = new URL(value); } catch { return invalid(); }
  const endpoint = url.origin + url.pathname;
  if (!ENDPOINTS[provider]?.includes(endpoint) || url.username || url.password || url.hash) return invalid();
  const p = url.searchParams;
  let params;
  if (provider === 'netease') params = endpoint.endsWith('/search/get/web')
    ? { s: keyword(p.get('s')), type: 1, offset: 0, limit: 20 }
    : { id: digits(p.get('id')), lv: -1, tv: -1, rv: -1 };
  if (provider === 'kugou') {
    if (endpoint.endsWith('/search/song')) params = { format: 'json', keyword: keyword(p.get('keyword')), page: 1, pagesize: 20 };
    else if (endpoint.endsWith('/search')) {
      const hash = p.get('hash'); if (!/^[0-9a-f]{32}$/i.test(hash || '')) return invalid();
      params = { ver: 1, man: 'yes', client: 'pc', hash };
    } else {
      const accesskey = p.get('accesskey'); if (!/^[a-z0-9]{1,128}$/i.test(accesskey || '')) return invalid();
      params = { ver: 1, client: 'pc', id: digits(p.get('id')), accesskey, fmt: 'lrc', charset: 'utf8' };
    }
  }
  if (provider === 'kuwo') params = endpoint.endsWith('/r.s')
    ? { all: keyword(p.get('all')), ft: 'music', itemset: 'web_2013', client: 'kt', vipver: 1, pn: 0, rn: 20, rformat: 'json', encoding: 'utf8' }
    : { musicId: digits(p.get('musicId')) };
  if (provider === 'qq') {
    let data; try { data = JSON.parse(p.get('data')); } catch { return invalid(); }
    const module = 'music.search.SearchCgiService';
    let expected;
    if (data?.[module]) expected = { [module]: { module, method: 'DoSearchForQQMusicDesktop', param: { query: keyword(data[module].param?.query), num_per_page: 20, page_num: 1, search_type: 0 } } };
    else {
      const param = data?.lyric?.param;
      const songID = param?.songID;
      if (songID != null && (!Number.isSafeInteger(songID) || songID <= 0)) return invalid();
      expected = { comm: { ct: 24, cv: 0 }, lyric: { module: 'music.musichallSong.PlayLyricInfo', method: 'GetPlayLyricInfo', param: { songMID: mid(param?.songMID), ...(songID != null ? { songID } : {}), crypt: 0, trans: 1, roma: 1, qrc: 0, interval: 0, type: -1 } } };
    }
    if (!equal(data, expected)) return invalid();
    params = { data: p.get('data') };
  }
  if ([...p].length !== Object.keys(params).length || Object.entries(params).some(([key, value]) => p.get(key) !== String(value))) return invalid();
  return { url: endpoint + '?' + new URLSearchParams(params), headers: { Accept: 'application/json', Referer: REFERERS[provider], ...(provider === 'qq' ? { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity' } : {}) } };
}
module.exports = { platformLyricRequest };
