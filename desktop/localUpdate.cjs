const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { readPatch, hashFile, unpackPatch, verifyVersion } = require('./updateCore.cjs');

const MAX_PATCH_BYTES = 1024 * 1024 * 1024;
function compareVersions(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}
async function ensureDirectory(directory) {
  await fsp.mkdir(directory, { recursive: true });
  const stat = await fsp.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('更新目录不能是文件或链接。');
}

async function prepareLocalPatch({ filename, home, dataDir, versionRoot, appVersion, runtimeVersion, progress = () => {} }) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename) || !/\.utapatch$/i.test(filename)) {
    throw new Error('请选择一个 .utapatch 增量包；完整 ZIP 和 .sha256 文件不能作为增量包导入。');
  }
  const stat = await fsp.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_PATCH_BYTES) throw new Error('增量包不是有效文件，或大小超过 1 GiB。');
  const versionsDir = path.join(home, 'versions'), updatesDir = path.join(dataDir, 'updates');
  await ensureDirectory(versionsDir); await ensureDirectory(updatesDir);
  const id = randomBytes(12).toString('hex');
  const snapshot = path.join(updatesDir, `local-${id}.utapatch`);
  const stage = path.join(versionsDir, `.stage-local-${id}`);
  let ownsStage = false, ownsSnapshot = false;
  try {
    progress({ phase: 'importing', source: 'local', percent: 0, filename: path.basename(filename) });
    await fsp.copyFile(filename, snapshot, fs.constants.COPYFILE_EXCL);
    ownsSnapshot = true;
    // A companion checksum is optional for a one-file drag-and-drop workflow.
    // Always validate reconstructed files against the embedded manifest below.
    let checksumVerified = false;
    try {
      const checksumPath = filename + '.sha256';
      const checksumStat = await fsp.stat(checksumPath);
      if (checksumStat.size > 4096) throw new Error('增量包校验文件格式无效。');
      const checksum = (await fsp.readFile(checksumPath, 'utf8')).trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
      if (!checksum || checksum[2] !== path.basename(filename) || (await hashFile(snapshot)) !== checksum[1].toLowerCase()) throw new Error('增量包 SHA-256 校验失败，请重新下载。');
      checksumVerified = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const { header } = await readPatch(snapshot);
    if (header.from !== appVersion) throw new Error(`此增量包适用于 ${header.from}，当前版本是 ${appVersion}。请选择对应版本的增量包，或下载完整 ZIP。`);
    if (compareVersions(header.to, appVersion) <= 0) throw new Error(`目标版本 ${header.to} 不高于当前版本 ${appVersion}，不能重复更新或降级。`);
    if (header.target.runtimeVersion !== runtimeVersion) throw new Error('此版本需要更新 Electron 运行环境，请使用完整 ZIP。');
    if (header.target.files.length > 20000 || header.target.files.some(file => file.size > MAX_PATCH_BYTES) ||
        header.target.files.reduce((total, file) => total + file.size, 0) > 4 * MAX_PATCH_BYTES) throw new Error('增量包声明的程序文件过大或过多。');
    const info = { source: 'local', current: appVersion, version: header.to, filename: path.basename(filename),
      bytes: stat.size, checksumVerified };
    progress({ ...info, phase: 'preparing-local', percent: 5 });
    // This random stage is owned by this operation; never remove a pre-existing
    // directory or a directory supplied by an archive.
    try { await fsp.lstat(stage); throw new Error('更新暂存目录已存在，请重试。'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    ownsStage = true;
    await unpackPatch(versionRoot, snapshot, stage, (done, total) => progress({ ...info, phase: 'preparing-local', percent: 5 + Math.round(done / total * 90) }));
    await verifyVersion(stage, header.to, runtimeVersion);
    const installed = path.join(versionsDir, header.to);
    try {
      const installedStat = await fsp.lstat(installed);
      if (!installedStat.isDirectory() || installedStat.isSymbolicLink()) throw new Error('目标版本目录无效。');
      const existing = await verifyVersion(installed, header.to, runtimeVersion);
      if (JSON.stringify(existing) !== JSON.stringify(header.target)) throw new Error('已有同版本程序内容不同，不能覆盖。');
      await fsp.rm(stage, { recursive: true, force: true });
      ownsStage = false;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fsp.rename(stage, installed);
      ownsStage = false;
    }
    progress({ ...info, phase: 'ready', percent: 100 });
    return { ...info, ready: true };
  } finally {
    if (ownsStage) await fsp.rm(stage, { recursive: true, force: true });
    if (ownsSnapshot) await fsp.rm(snapshot, { force: true });
  }
}

module.exports = { prepareLocalPatch };
