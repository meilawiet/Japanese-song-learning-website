const { dialog } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const { randomBytes } = require('node:crypto');
const { hashFile, verifyVersion, unpackPatch, versionName } = require('./updateCore.cjs');
const { prepareLocalPatch } = require('./localUpdate.cjs');

const REPOSITORY = 'meilawiet/Japanese-song-learning-website';
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`;
const VERSION_TAG = /^windows-v(\d+\.\d+\.\d+)$/;

function compareVersions(a, b) {
  const left = versionName(a).split('.').map(Number), right = versionName(b).split('.').map(Number);
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}
function validReleaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password &&
      url.pathname.startsWith(`/${REPOSITORY}/releases/download/`);
  } catch { return false; }
}
function pickRelease(releases, current) {
  const candidates = releases.filter(release => !release.draft && !release.prerelease && VERSION_TAG.test(release.tag_name || ''))
    .map(release => ({ release, version: release.tag_name.match(VERSION_TAG)[1] }))
    .filter(item => compareVersions(item.version, current) > 0)
    .sort((a, b) => compareVersions(b.version, a.version));
  for (const { release, version } of candidates) {
    const assets = new Map((release.assets || []).filter(asset => validReleaseUrl(asset.browser_download_url))
      .map(asset => [asset.name, asset]));
    const fullName = `UTA-${version}-Windows-x64.zip`;
    const patchName = `UTA-${current}-to-${version}-Windows-x64.utapatch`;
    const full = assets.get(fullName);
    const fullChecksum = assets.get(`${fullName}.sha256`);
    const patch = assets.get(patchName);
    const checksum = assets.get(`${patchName}.sha256`);
    if (!full) continue;
    return { version, notes: typeof release.body === 'string' ? release.body.slice(0, 4000) : '',
      full: { url: full.browser_download_url, size: full.size,
        checksumUrl: fullChecksum?.browser_download_url || null },
      patch: patch && checksum ? { url: patch.browser_download_url, size: patch.size,
        checksumUrl: checksum.browser_download_url } : null };
  }
  return null;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'UTA-Windows-Updater' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`无法检查 GitHub 更新（HTTP ${response.status}）。`);
  return response.json();
}
async function download(assetUrl, filename, onProgress, expectedSize = 0) {
  if (!validReleaseUrl(assetUrl)) throw new Error('更新下载地址不是官方发布地址。');
  const response = await fetch(assetUrl, { headers: { 'User-Agent': 'UTA-Windows-Updater' }, signal: AbortSignal.timeout(20 * 60 * 1000) });
  const final = new URL(response.url);
  if (!response.ok || final.protocol !== 'https:' ||
      !(final.hostname === 'github.com' || final.hostname.endsWith('.githubusercontent.com'))) {
    throw new Error(`更新下载失败（HTTP ${response.status}）。`);
  }
  const total = Number(response.headers.get('content-length')) || 0;
  if (expectedSize && total && total !== expectedSize) throw new Error('更新文件大小与发布信息不一致。');
  let received = 0;
  const counter = new (require('node:stream').Transform)({ transform(chunk, _encoding, callback) {
    received += chunk.length;
    if (received > (expectedSize || 1024 * 1024 * 1024)) { callback(new Error('更新下载超出预期大小。')); return; }
    onProgress(received, total);
    callback(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body), counter, fs.createWriteStream(filename, { flags: 'wx' }));
  if (expectedSize && received !== expectedSize) throw new Error('更新文件下载不完整。');
}

async function verifyChecksum(asset, filename) {
  if (!asset.checksumUrl) throw new Error('发布包缺少 SHA-256 校验文件。');
  const checksumFile = filename + '.sha256';
  await fsp.rm(checksumFile, { force: true });
  await download(asset.checksumUrl, checksumFile, () => {});
  const line = (await fsp.readFile(checksumFile, 'utf8')).trim();
  const match = line.match(/^([a-f0-9]{64})\s+\*?([^\s]+)$/i);
  if (!match || match[2] !== path.basename(filename) || await hashFile(filename) !== match[1].toLowerCase()) {
    throw new Error('更新包 SHA-256 校验失败。');
  }
}

async function extractFullVersion(archive, stage, version, script) {
  await fsp.mkdir(stage);
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      script, '-Archive', archive, '-Destination', stage, '-Version', version], { windowsHide: true, stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('无法解压完整更新包。')));
  });
}

function registerUpdateHandlers({ app, ipcMain, mainWindow, home, dataDir, versionRoot, appVersion, unsavedDrafts, trusted, log }) {
  const updatesDir = path.join(dataDir, 'updates');
  const versionsDir = path.join(home, 'versions');
  const runtimeVersion = require(path.join(home, 'resources', 'app', 'package.json')).electronVersion;
  let releaseInfo = null, prepared = null, preparedInfo = null, busy = false, lastProgress = null;
  const progress = state => { lastProgress = state; if (!mainWindow.isDestroyed()) mainWindow.webContents.send('uta:update:progress', state); };

  ipcMain.handle('uta:update:status', event => { trusted(event); return { busy, prepared: preparedInfo, progress: lastProgress }; });

  ipcMain.handle('uta:update:local', async (event, filename) => {
    trusted(event);
    if (busy) throw new Error('更新任务正在进行，请等待当前校验完成。');
    busy = true; prepared = null; preparedInfo = null;
    try {
      const result = await prepareLocalPatch({ filename, home, dataDir, versionRoot, appVersion, runtimeVersion, progress });
      prepared = result.version; preparedInfo = result;
      return result;
    } catch (error) {
      log(`Local update preparation failed: ${error.message}`);
      progress({ phase: 'failed', source: 'local', error: error.message });
      throw error;
    } finally { busy = false; }
  });

  ipcMain.handle('uta:update:check', async event => {
    trusted(event);
    if (busy) throw new Error('更新任务正在进行。');
    const releases = await getJson(RELEASES_API);
    if (!Array.isArray(releases)) throw new Error('发布列表格式无效。');
    releaseInfo = pickRelease(releases, appVersion);
    if (!releaseInfo) return { current: appVersion, available: false };
    return { current: appVersion, available: true, version: releaseInfo.version, notes: releaseInfo.notes,
      mode: releaseInfo.patch ? 'incremental' : releaseInfo.full.checksumUrl ? 'full' : 'full-manual',
      downloadBytes: releaseInfo.patch?.size || releaseInfo.full.size };
  });

  ipcMain.handle('uta:update:prepare', async event => {
    trusted(event);
    if (busy) throw new Error('更新任务正在进行。');
    if (!releaseInfo) throw new Error('请先检查更新。');
    if (!releaseInfo.patch && !releaseInfo.full.checksumUrl) throw new Error('当前发布缺少自动更新校验文件，请手动下载完整 ZIP。');
    busy = true; prepared = null; preparedInfo = null;
    const version = versionName(releaseInfo.version);
    const patchName = `UTA-${appVersion}-to-${version}-Windows-x64.utapatch`;
    const patchPath = path.join(updatesDir, patchName);
    const stage = path.join(versionsDir, `.stage-${version}`);
    const installed = path.join(versionsDir, version);
    try {
      await fsp.mkdir(updatesDir, { recursive: true });
      await fsp.mkdir(versionsDir, { recursive: true });
      if (fs.existsSync(installed)) {
        await verifyVersion(installed, version, runtimeVersion);
        prepared = version;
        preparedInfo = { ready: true, source: 'online', current: appVersion, version };
        progress({ ...preparedInfo, phase: 'ready', percent: 100 });
        return { ready: true, version };
      }
      if (fs.existsSync(stage)) throw new Error('发现上次未完成的更新目录，请先处理后重试。');
      let deltaWorked = false;
      if (releaseInfo.patch) {
        try {
          await fsp.rm(patchPath, { force: true });
          progress({ phase: 'downloading', percent: 0 });
          await download(releaseInfo.patch.url, patchPath, (received, total) => progress({ phase: 'downloading',
            percent: total ? Math.min(90, Math.round(received / total * 90)) : 0, received, total }), releaseInfo.patch.size);
          await verifyChecksum(releaseInfo.patch, patchPath);
          progress({ phase: 'preparing', percent: 91 });
          const result = await unpackPatch(versionRoot, patchPath, stage, (done, total) => progress({ phase: 'preparing',
            percent: 91 + Math.round(done / total * 8) }));
          if (result.from !== appVersion || result.to !== version) throw new Error('增量包版本不匹配。');
          await verifyVersion(stage, version, runtimeVersion);
          deltaWorked = true;
        } catch (error) {
          log(`Incremental update unavailable: ${error.message}`);
          if (fs.existsSync(stage)) await fsp.rm(stage, { recursive: true, force: true });
          if (!releaseInfo.full.checksumUrl) throw error;
          progress({ phase: 'fallback', percent: 0, reason: error.message });
        }
      }
      if (!deltaWorked) {
        const fullPath = path.join(updatesDir, `UTA-${version}-Windows-x64.zip`);
        await fsp.rm(fullPath, { force: true });
        progress({ phase: 'downloading-full', percent: 0 });
        await download(releaseInfo.full.url, fullPath, (received, total) => progress({ phase: 'downloading-full',
          percent: total ? Math.min(90, Math.round(received / total * 90)) : 0, received, total }), releaseInfo.full.size);
        await verifyChecksum(releaseInfo.full, fullPath);
        progress({ phase: 'preparing', percent: 91 });
        await extractFullVersion(fullPath, stage, version, path.join(versionRoot, 'app', 'desktop', 'extractVersion.ps1'));
        await verifyVersion(stage, version, runtimeVersion);
      }
      await fsp.rename(stage, installed);
      prepared = version;
      preparedInfo = { ready: true, source: 'online', current: appVersion, version };
      progress({ ...preparedInfo, phase: 'ready', percent: 100 });
      return { ready: true, version };
    } catch (error) {
      if (fs.existsSync(stage)) await fsp.rm(stage, { recursive: true, force: true });
      log(`Update preparation failed: ${error.message}`);
      progress({ phase: 'failed', error: error.message });
      throw error;
    } finally { busy = false; }
  });

  ipcMain.handle('uta:update:install', async event => {
    trusted(event);
    if (busy) throw new Error('请等待当前更新校验完成。');
    if (!prepared) throw new Error('新版尚未下载并校验。');
    if (unsavedDrafts.size) {
      const choice = dialog.showMessageBoxSync(mainWindow, { type: 'warning', title: '还有未保存的修改',
        message: '请先保存歌词或歌曲修改，再安装更新。', buttons: ['继续编辑', '放弃修改并更新'], defaultId: 0, cancelId: 0 });
      if (choice !== 1) return { started: false };
      unsavedDrafts.clear();
    }
    const nonce = randomBytes(16).toString('hex');
    await fsp.writeFile(path.join(updatesDir, 'pending.json'), JSON.stringify({ from: appVersion, to: prepared,
      pid: process.pid, nonce }));
    const helper = spawn(process.execPath, ['--uta-apply-update'], { cwd: home, detached: true, windowsHide: true,
      stdio: 'ignore', env: { ...process.env, UTA_UPDATE_HEALTH_NONCE: '' } });
    helper.unref();
    app.quit();
    return { started: true };
  });
}

module.exports = { compareVersions, pickRelease, validReleaseUrl, registerUpdateHandlers };
