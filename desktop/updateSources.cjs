const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const { hashFile, versionName } = require('./updateCore.cjs');

const PROVIDERS = [
  { id: 'gitee', name: 'Gitee', host: 'gitee.com', repository: 'mzh18392597195/uta-windows', api: 'https://gitee.com/api/v5/repos/mzh18392597195/uta-windows/releases?per_page=100' },
  { id: 'github', name: 'GitHub', host: 'github.com', repository: 'meilawiet/Japanese-song-learning-website', api: 'https://api.github.com/repos/meilawiet/Japanese-song-learning-website/releases?per_page=100' },
];
const VERSION_TAG = /^windows-v(\d+\.\d+\.\d+)$/;
const MAX_BYTES = 1024 * 1024 * 1024;
function compareVersions(a, b) {
  const left = versionName(a).split('.').map(Number), right = versionName(b).split('.').map(Number);
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}
function validReleaseUrl(value, providerId) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      PROVIDERS.some(provider => (!providerId || provider.id === providerId) && url.hostname === provider.host &&
        url.pathname.startsWith(`/${provider.repository}/releases/download/`));
  } catch { return false; }
}
function validRedirect(value, providerId) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (validReleaseUrl(value, providerId)) return true;
    return providerId === 'gitee' ? (url.hostname === 'gitee.com' && /^\/mzh18392597195\/uta-windows\/attach_files\/\d+\/download\/[^/]+$/.test(url.pathname)
      || url.hostname === 'foruda.gitee.com' && url.pathname.startsWith('/attach_file/'))
      : providerId === 'github' && url.hostname.endsWith('.githubusercontent.com');
  } catch { return false; }
}
const bytes = value => Number.isSafeInteger(value) && value > 0 ? value : 0;
function pickRelease(releases, current, providerId = 'github') {
  const candidates = releases.filter(release => release && !release.draft && !release.prerelease && VERSION_TAG.test(release.tag_name || ''))
    .map(release => ({ release, version: release.tag_name.match(VERSION_TAG)[1] }))
    .filter(item => compareVersions(item.version, current) > 0)
    .sort((a, b) => compareVersions(b.version, a.version));
  for (const { release, version } of candidates) {
    const assets = new Map((Array.isArray(release.assets) ? release.assets : []).filter(asset => asset && validReleaseUrl(asset.browser_download_url, providerId))
      .map(asset => [asset.name, asset]));
    const fullName = `UTA-${version}-Windows-x64.zip`, patchName = `UTA-${current}-to-${version}-Windows-x64.utapatch`;
    const descriptor = (name, asset) => ({ name, provider: providerId, url: asset.browser_download_url, size: bytes(asset.size), checksumUrl: assets.get(name + '.sha256')?.browser_download_url || null });
    let full = assets.has(fullName) ? descriptor(fullName, assets.get(fullName)) : null;
    if (!full && providerId === 'gitee') {
      const parts = [...assets.values()].filter(asset => asset.name.startsWith(fullName + '.') && /^\d{3}$/.test(asset.name.slice(fullName.length + 1)))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (parts.length && parts.length <= 100 && parts.every((part, index) => part.name === `${fullName}.${String(index + 1).padStart(3, '0')}`)) {
        const sizes = parts.map(part => bytes(part.size));
        full = { name: fullName, provider: providerId, parts: parts.map(part => ({ url: part.browser_download_url, size: bytes(part.size) })),
          size: sizes.every(Boolean) ? sizes.reduce((sum, size) => sum + size, 0) : 0, checksumUrl: assets.get(fullName + '.sha256')?.browser_download_url || null };
      }
    }
    if (!full) continue;
    const patch = assets.has(patchName) && assets.has(patchName + '.sha256') ? descriptor(patchName, assets.get(patchName)) : null;
    return { version, releaseId: release.id, notes: typeof release.body === 'string' ? release.body.slice(0, 4000) : '', full, patch };
  }
  return null;
}
async function getJson(url, fetchImpl, timeoutMs) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'UTA-Windows-Updater' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error('发布列表格式无效');
  return body;
}
async function checkSources(current, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const outcomes = await Promise.allSettled(PROVIDERS.map(async provider => {
    const releases = await getJson(provider.api, fetchImpl, timeoutMs);
    let selected = pickRelease(releases, current, provider.id);
    // The public Gitee release list omits sizes; its attachment endpoint supplies them.
    if (provider.id === 'gitee' && selected && Number.isSafeInteger(selected.releaseId)) {
      try {
        const assets = await getJson(`https://gitee.com/api/v5/repos/${provider.repository}/releases/${selected.releaseId}/attach_files?per_page=100`, fetchImpl, timeoutMs);
        const enriched = releases.map(release => release.id === selected.releaseId ? { ...release, assets } : release);
        selected = pickRelease(enriched, current, provider.id) || selected;
      } catch { /* Valid public release links still work when the size endpoint is unavailable. */ }
    }
    return selected;
  }));
  const notices = outcomes.flatMap((outcome, index) => outcome.status === 'rejected' ? [`${PROVIDERS[index].name} 检查失败，已尝试其他来源。`] : []);
  if (outcomes.every(outcome => outcome.status === 'rejected')) throw new Error('Gitee 和 GitHub 暂时都无法连接，请检查网络后重试。');
  const available = outcomes.flatMap(outcome => outcome.status === 'fulfilled' && outcome.value ? [outcome.value] : []);
  if (!available.length) return { release: null, notices };
  const latest = available.reduce((best, item) => compareVersions(item.version, best.version) > 0 ? item : best);
  // Compare both mirrors before preferring Gitee, so a delayed mirror cannot hide a newer release.
  const matching = available.filter(item => item.version === latest.version);
  const fullCandidates = matching.map(item => item.full).filter(item => item.checksumUrl);
  const patchCandidates = matching.map(item => item.patch).filter(Boolean);
  return { notices, release: { version: latest.version, notes: matching[0].notes || latest.notes,
    full: fullCandidates[0] || matching[0].full, patch: patchCandidates[0] || null, fullCandidates, patchCandidates } };
}

async function downloadFile(asset, filename, onProgress, { fetchImpl = fetch, maxBytes = MAX_BYTES, headerTimeoutMs = 10000, idleTimeoutMs = 20000 } = {}) {
  const parts = asset.parts || [{ url: asset.url, size: asset.size }];
  if (!parts.length || !parts.every(part => validReleaseUrl(part.url, asset.provider)) || asset.size > maxBytes) throw new Error('更新下载地址或文件大小无效。');
  let received = 0;
  async function* content() {
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index], controller = new AbortController();
      const overall = setTimeout(() => controller.abort(), 20 * 60 * 1000);
      let idle;
      try {
        let url = part.url, response;
        for (let redirect = 0; redirect <= 5; redirect++) {
          const deadline = setTimeout(() => controller.abort(), headerTimeoutMs);
          try { response = await fetchImpl(url, { redirect: 'manual', headers: { 'User-Agent': 'UTA-Windows-Updater', 'Accept-Encoding': 'identity' }, signal: controller.signal }); }
          finally { clearTimeout(deadline); }
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location) throw new Error('更新下载重定向无效。');
            const next = new URL(location, url).href;
            await response.body?.cancel();
            if (!validRedirect(next, asset.provider) || redirect === 5) throw new Error('更新下载重定向不是官方地址。');
            url = next; continue;
          }
          break;
        }
        if (!response.ok || !response.body) throw new Error(`更新下载失败（HTTP ${response.status}）。`);
        const length = bytes(Number(response.headers.get('content-length')));
        if (part.size && length && part.size !== length) throw new Error('更新文件大小与发布信息不一致。');
        let partBytes = 0;
        const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => controller.abort(), idleTimeoutMs); };
        resetIdle();
        for await (const chunk of response.body) {
          resetIdle(); partBytes += chunk.length; received += chunk.length;
          if (received > maxBytes || asset.size && received > asset.size || part.size && partBytes > part.size) throw new Error('更新下载超出预期大小。');
          const total = asset.size || (parts.length === 1 ? length : 0);
          const fraction = total ? received / total : (index + (length ? partBytes / length : 0)) / parts.length;
          onProgress(received, total, Math.min(1, fraction));
          yield chunk;
        }
        if (part.size && partBytes !== part.size || length && partBytes !== length) throw new Error('更新文件下载不完整。');
      } finally { clearTimeout(overall); clearTimeout(idle); controller.abort(); }
    }
  }
  await pipeline(Readable.from(content()), fs.createWriteStream(filename, { flags: 'wx' }));
  if (asset.size && received !== asset.size) throw new Error('更新文件下载不完整。');
}
async function downloadFromSources(candidates, filename, onProgress, { fetchImpl = fetch, prepare = async () => {}, cleanup = async () => {}, ...timeouts } = {}) {
  if (!candidates.length) throw new Error('发布包缺少自动更新校验文件。');
  const failures = [];
  for (const asset of candidates) {
    const providerName = PROVIDERS.find(provider => provider.id === asset.provider)?.name || asset.provider;
    try {
      await fsp.rm(filename, { force: true }); await fsp.rm(filename + '.sha256', { force: true });
      const fallback = { switching: failures.length > 0, ...(failures.length ? { reason: failures.at(-1) } : {}) };
      onProgress({ provider: providerName, received: 0, total: asset.size, fraction: 0, ...fallback });
      if (!asset.checksumUrl || !validReleaseUrl(asset.checksumUrl, asset.provider)) throw new Error('更新包缺少有效的校验文件。');
      await downloadFile({ provider: asset.provider, url: asset.checksumUrl }, filename + '.sha256', () => {}, { fetchImpl, ...timeouts, maxBytes: 4096 });
      const match = (await fsp.readFile(filename + '.sha256', 'utf8')).trim().match(/^([a-f0-9]{64})\s+\*?([^\s]+)$/i);
      if (!match || match[2] !== path.basename(filename)) throw new Error('更新包校验文件格式无效。');
      await downloadFile(asset, filename, (received, total, fraction) => onProgress({ provider: providerName, received, total, fraction, ...fallback }), { fetchImpl, ...timeouts });
      if (await hashFile(filename) !== match[1].toLowerCase()) throw new Error('更新包 SHA-256 校验失败。');
      await prepare(asset);
      return asset;
    } catch (error) {
      failures.push(`${providerName}：${error.message}`);
      await cleanup();
      await fsp.rm(filename, { force: true }); await fsp.rm(filename + '.sha256', { force: true });
    }
  }
  throw new Error(failures.join('；'));
}
module.exports = { PROVIDERS, compareVersions, validReleaseUrl, validRedirect, pickRelease, checkSources, downloadFile, downloadFromSources };
