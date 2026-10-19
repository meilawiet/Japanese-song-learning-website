const { dialog } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { verifyVersion, unpackPatch, versionName } = require('./updateCore.cjs');
const { prepareLocalPatch } = require('./localUpdate.cjs');

const { compareVersions, pickRelease, validReleaseUrl, checkSources, downloadFromSources } = require('./updateSources.cjs');

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
    const checked = await checkSources(appVersion);
    releaseInfo = checked.release;
    const notice = checked.notices.join(' ');
    if (!releaseInfo) return { current: appVersion, available: false, notice };
    const preferred = releaseInfo.patch || releaseInfo.full;
    return { current: appVersion, available: true, version: releaseInfo.version, notes: releaseInfo.notes, notice,
      mode: releaseInfo.patch ? 'incremental' : releaseInfo.full.checksumUrl ? 'full' : 'full-manual',
      provider: preferred.provider === 'gitee' ? 'Gitee' : 'GitHub',
      downloadBytes: preferred.size };
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
      let deltaWorked = false, downloaded;
      if (releaseInfo.patch) {
        try {
          downloaded = await downloadFromSources(releaseInfo.patchCandidates, patchPath, state => progress({ ...state, phase: 'downloading',
            percent: Math.round(state.fraction * 90) }), {
            cleanup: async () => { if (fs.existsSync(stage)) await fsp.rm(stage, { recursive: true, force: true }); },
            prepare: async asset => {
              const provider = asset.provider === 'gitee' ? 'Gitee' : 'GitHub';
              progress({ phase: 'preparing', provider, percent: 91 });
              const result = await unpackPatch(versionRoot, patchPath, stage, (done, total) => progress({ phase: 'preparing', provider,
                percent: 91 + Math.round(done / total * 8) }));
              if (result.from !== appVersion || result.to !== version) throw new Error('增量包版本不匹配。');
              await verifyVersion(stage, version, runtimeVersion);
            },
          });
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
        downloaded = await downloadFromSources(releaseInfo.fullCandidates, fullPath, state => progress({ ...state, phase: 'downloading-full',
          percent: Math.round(state.fraction * 90) }), {
          cleanup: async () => { if (fs.existsSync(stage)) await fsp.rm(stage, { recursive: true, force: true }); },
          prepare: async asset => {
            progress({ phase: 'preparing', provider: asset.provider === 'gitee' ? 'Gitee' : 'GitHub', percent: 91 });
            await extractFullVersion(fullPath, stage, version, path.join(versionRoot, 'app', 'desktop', 'extractVersion.ps1'));
            await verifyVersion(stage, version, runtimeVersion);
          },
        });
      }
      await fsp.rename(stage, installed);
      prepared = version;
      preparedInfo = { ready: true, source: 'online', current: appVersion, version, provider: downloaded.provider === 'gitee' ? 'Gitee' : 'GitHub' };
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
