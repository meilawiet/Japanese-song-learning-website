const { app, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { versionName, readManifest, listFiles } = require('./updateCore.cjs');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
async function switchVersion(home, version) {
  const target = path.join(home, 'current.json');
  const temporary = target + '.tmp';
  await fs.writeFile(temporary, JSON.stringify({ version }), { flag: 'w' });
  await fs.rename(temporary, target);
}
function launch(home, nonce) {
  const child = spawn(path.join(home, 'UTA.exe'), [], { cwd: home, detached: true, windowsHide: false, stdio: 'ignore',
    env: nonce ? { ...process.env, UTA_UPDATE_HEALTH_NONCE: nonce } : process.env });
  child.unref();
  child.on('error', () => {});
  return child;
}

async function applyPendingUpdate(home) {
  const updates = path.join(home, 'uta-data', 'updates');
  const pendingPath = path.join(updates, 'pending.json');
  let pending;
  try {
    pending = JSON.parse(await fs.readFile(pendingPath, 'utf8'));
    versionName(pending.from); versionName(pending.to);
    if (!/^[a-f0-9]{32}$/.test(pending.nonce) || !Number.isSafeInteger(pending.pid)) throw new Error('更新状态无效。');
    const current = JSON.parse(await fs.readFile(path.join(home, 'current.json'), 'utf8'));
    if (current.version !== pending.from) throw new Error('当前版本与待安装更新不匹配。');
    const nextDir = path.join(home, 'versions', pending.to);
    if ((await fs.lstat(nextDir)).isSymbolicLink()) throw new Error('新版目录不能是链接。');
    const next = await readManifest(nextDir);
    if (next.version !== pending.to) throw new Error('新版校验失败。');
    const actual = await listFiles(nextDir);
    if (actual.length !== next.files.length || actual.some((file, index) =>
      file.path !== next.files[index].path || file.size !== next.files[index].size || file.sha256 !== next.files[index].sha256))
      throw new Error('新版文件在安装前发生变化。');
    for (let attempt = 0; attempt < 120 && alive(pending.pid); attempt++) await delay(500);
    if (alive(pending.pid)) throw new Error('UTA 仍在运行，请关闭后重试。');
    const healthPath = path.join(updates, `healthy-${pending.nonce}.json`);
    await fs.rm(healthPath, { force: true });
    await switchVersion(home, pending.to);
    const child = launch(home, pending.nonce);
    let healthy = false;
    for (let attempt = 0; attempt < 240; attempt++) {
      await delay(500);
      try {
        const state = JSON.parse(await fs.readFile(healthPath, 'utf8'));
        if (state.version === pending.to && state.nonce === pending.nonce) { healthy = true; break; }
      } catch { /* New version is still starting. */ }
      if (attempt > 10 && !alive(child.pid)) break;
    }
    if (!healthy) {
      if (alive(child.pid)) throw new Error('新版已启动，但未能确认健康状态。请检查应用；更新文件和旧版均已保留。');
      await switchVersion(home, pending.from);
      launch(home);
      throw new Error('新版未能正常启动，已恢复旧版程序。学习资料未改动。');
    }
    await fs.rm(pendingPath, { force: true });
    await fs.rm(healthPath, { force: true });
    // Keep the previous working version for rollback, and discard only older verified program folders.
    try {
      const versions = path.join(home, 'versions');
      for (const name of await fs.readdir(versions)) {
        if (name === pending.from || name === pending.to || !/^\d+\.\d+\.\d+$/.test(name)) continue;
        const folder = path.join(versions, name);
        try {
          const stat = await fs.lstat(folder);
          if (stat.isDirectory() && !stat.isSymbolicLink() && (await readManifest(folder)).version === name)
            await fs.rm(folder, { recursive: true, force: true });
        } catch { /* Preserve unfamiliar files. */ }
      }
      for (const name of [`UTA-${pending.from}-to-${pending.to}-Windows-x64.utapatch`, `UTA-${pending.to}-Windows-x64.zip`]) {
        await fs.rm(path.join(updates, name), { force: true });
        await fs.rm(path.join(updates, name + '.sha256'), { force: true });
      }
    } catch { /* Cleanup is optional once the new version has started. */ }
  } catch (error) {
    // A failed update remains inspectable in uta-data/updates; never remove user data here.
    dialog.showErrorBox('UTA 更新失败', error.message);
  } finally { app.quit(); }
}

module.exports = { applyPendingUpdate };
