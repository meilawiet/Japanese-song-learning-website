const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SOURCES = [
  { id: 'lrclib', name: 'LRCLIB', kind: 'lrclib', baseUrl: 'https://lrclib.net', enabled: true, builtin: true },
  { id: 'utaten', name: 'UtaTen', kind: 'utaten', baseUrl: 'https://utaten.com', enabled: true, builtin: true },
];

function normalizeBaseUrl(value) {
  if (typeof value !== 'string' || value.length > 1024) throw new Error('歌词源地址无效。');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('请填写完整的歌词源地址。'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('歌词源地址须为 HTTP 或 HTTPS 地址，不能包含账号、查询参数或锚点。');
  }
  return url.href.replace(/\/+$/, '').replace(/\/api(?:\/search)?$/, '');
}

function sourceAdapter(value) {
  let host;
  try { host = new URL(value).hostname.toLowerCase(); } catch { return null; }
  if (['music.163.com', 'www.music.163.com'].includes(host)) return 'netease';
  if (['kugou.com', 'www.kugou.com'].includes(host)) return 'kugou';
  if (['kuwo.cn', 'www.kuwo.cn'].includes(host)) return 'kuwo';
  if (['y.qq.com', 'www.y.qq.com', 'i.y.qq.com', 'i2.y.qq.com', 'music.qq.com'].includes(host)) return 'qq';
  if (['utaten.com', 'www.utaten.com'].includes(host)) return 'utaten';
  if (['lrclib.net', 'www.lrclib.net'].includes(host)) return 'lrclib';
  return null;
}

function validateSources(sources) {
  if (!Array.isArray(sources) || sources.length < 2 || sources.length > 12) throw new Error('最多配置 12 个歌词源。');
  const ids = new Set();
  const result = sources.map(source => {
    if (!source || typeof source.id !== 'string' || !/^(lrclib|utaten|custom-[a-z0-9-]{1,60})$/.test(source.id) || ids.has(source.id)) throw new Error('歌词源编号无效或重复。');
    ids.add(source.id);
    const builtin = DEFAULT_SOURCES.find(item => item.id === source.id);
    const baseUrl = normalizeBaseUrl(source.baseUrl);
    const kind = builtin?.kind || sourceAdapter(baseUrl) || 'lrclib';
    // Old Windows configs called every custom URL "lrclib". Recognize known
    // platform hosts without changing source IDs, names or enabled choices.
    if (source.kind !== kind && source.kind !== 'lrclib' || typeof source.name !== 'string' || !source.name.trim() || source.name.trim().length > 40 || typeof source.enabled !== 'boolean') throw new Error('请检查歌词源名称和类型。');
    if (builtin?.kind === 'utaten' && baseUrl !== 'https://utaten.com') throw new Error('UtaTen 使用内置网站适配，地址固定。');
    return { id: source.id, name: source.name.trim(), kind, baseUrl, enabled: source.enabled, builtin: Boolean(builtin) };
  });
  if (DEFAULT_SOURCES.some(source => !ids.has(source.id))) throw new Error('内置歌词源可以停用，不能删除。');
  return result;
}

class LyricSourceStore {
  constructor(dataDir) { this.file = path.join(dataDir, 'lyrics-sources.json'); }
  load() {
    try { return validateSources(JSON.parse(fs.readFileSync(this.file, 'utf8'))); }
    catch (error) {
      if (error.code === 'ENOENT') return DEFAULT_SOURCES.map(source => ({ ...source }));
      throw new Error('无法读取歌词源配置，请在设置中恢复默认来源。');
    }
  }
  save(sources) {
    const validated = validateSources(sources);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(validated, null, 2), 'utf8');
    fs.renameSync(this.file + '.tmp', this.file);
    return validated;
  }
}

module.exports = { DEFAULT_SOURCES, normalizeBaseUrl, sourceAdapter, validateSources, LyricSourceStore };
