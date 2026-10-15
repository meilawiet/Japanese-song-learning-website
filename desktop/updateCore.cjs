// Shared by the release builder and the packaged Windows updater.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const MAGIC = Buffer.from('UTADELTA1');
const CHUNK_SIZE = 64 * 1024;
const MAX_HEADER = 16 * 1024 * 1024;

function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || value.includes('\0') ||
      value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('更新包包含非法文件路径。');
  }
  return value;
}

function versionName(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error('更新版本号无效。');
  return value;
}

function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
async function hashFile(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function listFiles(root) {
  const files = [];
  async function walk(folder, prefix = '') {
    for (const entry of await fsp.readdir(folder, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      safeRelative(relative);
      if (relative === 'manifest.json') continue;
      if (entry.isSymbolicLink()) throw new Error('更新目录不能包含符号链接。');
      if (entry.isDirectory()) await walk(path.join(folder, entry.name), relative);
      else if (entry.isFile()) {
        const absolute = path.join(folder, entry.name);
        const stat = await fsp.stat(absolute);
        files.push({ path: relative, size: stat.size, sha256: await hashFile(absolute) });
      } else throw new Error('更新目录包含不支持的文件类型。');
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

function validateManifest(manifest) {
  if (!manifest || manifest.format !== 1 || !Array.isArray(manifest.files)) throw new Error('更新清单无效。');
  if (manifest.launcherProtocol !== 1) throw new Error('新版需要更新启动器，请下载完整 ZIP 手动升级。');
  if (typeof manifest.runtimeVersion !== 'string' || !/^[A-Za-z0-9.-]{1,40}$/.test(manifest.runtimeVersion)) throw new Error('运行环境版本无效。');
  versionName(manifest.version);
  const seen = new Set();
  for (const file of manifest.files) {
    safeRelative(file.path);
    if (file.path === 'manifest.json' || seen.has(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 ||
        typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('更新清单文件信息无效。');
    seen.add(file.path);
  }
  return manifest;
}

async function writeManifest(versionDir, version, runtimeVersion = 'test') {
  const manifest = validateManifest({ format: 1, launcherProtocol: 1, runtimeVersion,
    version: versionName(version), files: await listFiles(versionDir) });
  await fsp.writeFile(path.join(versionDir, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

async function readManifest(versionDir) {
  return validateManifest(JSON.parse(await fsp.readFile(path.join(versionDir, 'manifest.json'), 'utf8')));
}

async function verifyVersion(versionDir, expected, runtimeVersion) {
  const manifest = await readManifest(versionDir);
  if (manifest.version !== expected) throw new Error('更新版本号不匹配。');
  if (manifest.runtimeVersion !== runtimeVersion) throw new Error('新版需要不同的 Electron 运行环境，请手动安装完整 ZIP。');
  const files = await listFiles(versionDir);
  if (files.length !== manifest.files.length || files.some((file, index) =>
    file.path !== manifest.files[index].path || file.size !== manifest.files[index].size || file.sha256 !== manifest.files[index].sha256)) {
    throw new Error('更新文件与发布清单不一致。');
  }
  return manifest;
}

function checkedTarget(root, relative) {
  const target = path.resolve(root, ...safeRelative(relative).split('/'));
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('更新路径越界。');
  return target;
}

async function assertNoLinks(root, target) {
  const base = path.resolve(root);
  const full = path.resolve(target);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('更新路径越界。');
  let cursor = base;
  for (const part of path.relative(base, full).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { if ((await fsp.lstat(cursor)).isSymbolicLink()) throw new Error('更新路径不能经过符号链接。'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function encodePatch(header, blobs) {
  const json = Buffer.from(JSON.stringify(header));
  if (json.length > MAX_HEADER) throw new Error('增量清单过大。');
  const preamble = Buffer.alloc(MAGIC.length + 4);
  MAGIC.copy(preamble);
  preamble.writeUInt32LE(json.length, MAGIC.length);
  return Buffer.concat([preamble, json, ...blobs]);
}

async function buildPatch(baseDir, targetDir, output) {
  const old = await readManifest(baseDir);
  const next = await readManifest(targetDir);
  const prior = new Map(old.files.map(file => [file.path, file]));
  const operations = [], blobs = [];
  let offset = 0;
  const addBlob = bytes => { const result = { offset, length: bytes.length }; blobs.push(bytes); offset += bytes.length; return result; };
  for (const file of next.files) {
    const base = prior.get(file.path);
    if (base?.sha256 === file.sha256 && base.size === file.size) continue;
    const content = await fsp.readFile(checkedTarget(targetDir, file.path));
    const compressed = zlib.gzipSync(content, { level: 6 });
    let candidate = null;
    if (base && file.size >= CHUNK_SIZE && base.size === file.size) {
      const oldBytes = await fsp.readFile(checkedTarget(baseDir, file.path));
      const chunks = [], chunkBlobs = [];
      let chunkLength = 0;
      for (let start = 0; start < content.length; start += CHUNK_SIZE) {
        const end = Math.min(content.length, start + CHUNK_SIZE);
        const targetChunk = content.subarray(start, end);
        if (targetChunk.equals(oldBytes.subarray(start, end))) chunks.push(null);
        else {
          const bytes = zlib.gzipSync(targetChunk, { level: 6 });
          chunks.push({ length: bytes.length, size: targetChunk.length });
          chunkBlobs.push(bytes); chunkLength += bytes.length;
        }
      }
      if (chunkLength < compressed.length * 0.8) candidate = { chunks, chunkBlobs };
    }
    if (candidate) {
      for (const chunk of candidate.chunks) if (chunk) Object.assign(chunk, addBlob(candidate.chunkBlobs.shift()));
      operations.push({ path: file.path, kind: 'chunks', baseSha256: base.sha256, chunkSize: CHUNK_SIZE, chunks: candidate.chunks });
    } else operations.push({ path: file.path, kind: 'replace', ...addBlob(compressed) });
  }
  const header = { format: 1, from: old.version, to: next.version, target: next, operations };
  await fsp.writeFile(output, encodePatch(header, blobs));
  return { from: old.version, to: next.version, bytes: (await fsp.stat(output)).size, changedFiles: operations.length };
}

async function readPatch(filename) {
  const handle = await fsp.open(filename, 'r');
  try {
    const preamble = Buffer.alloc(MAGIC.length + 4);
    if ((await handle.read(preamble, 0, preamble.length, 0)).bytesRead !== preamble.length ||
        !preamble.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('增量包格式无效。');
    const length = preamble.readUInt32LE(MAGIC.length);
    if (!length || length > MAX_HEADER) throw new Error('增量包清单大小无效。');
    const json = Buffer.alloc(length);
    if ((await handle.read(json, 0, length, preamble.length)).bytesRead !== length) throw new Error('增量包不完整。');
    const header = JSON.parse(json.toString('utf8'));
    if (header.format !== 1 || !Array.isArray(header.operations)) throw new Error('增量包清单无效。');
    versionName(header.from); versionName(header.to); validateManifest(header.target);
    if (header.target.version !== header.to) throw new Error('增量包版本不一致。');
    return { header, bodyStart: preamble.length + length, size: (await handle.stat()).size };
  } finally { await handle.close(); }
}

async function unpackPatch(baseDir, patchFile, stageDir, progress = () => {}) {
  const { header, bodyStart, size } = await readPatch(patchFile);
  const old = await readManifest(baseDir);
  if (old.version !== header.from) throw new Error('本机版本与增量包不匹配。');
  const oldFiles = new Map(old.files.map(file => [file.path, file]));
  const targetFiles = new Map(header.target.files.map(file => [file.path, file]));
  const operations = new Map();
  for (const op of header.operations) {
    safeRelative(op.path);
    if (operations.has(op.path) || !targetFiles.has(op.path)) throw new Error('增量包操作无效。');
    operations.set(op.path, op);
  }
  for (const file of header.target.files) {
    const base = oldFiles.get(file.path);
    if (!operations.has(file.path) && (!base || base.sha256 !== file.sha256 || base.size !== file.size)) throw new Error('增量包缺少变更文件。');
  }
  async function payload(op, expectedSize) {
    if (!Number.isSafeInteger(op.offset) || !Number.isSafeInteger(op.length) || op.offset < 0 || op.length < 0 ||
        bodyStart + op.offset + op.length > size) throw new Error('增量包数据越界。');
    const compressed = Buffer.alloc(op.length);
    const handle = await fsp.open(patchFile, 'r');
    try { if ((await handle.read(compressed, 0, op.length, bodyStart + op.offset)).bytesRead !== op.length) throw new Error('增量包数据不完整。'); }
    finally { await handle.close(); }
    return zlib.gunzipSync(compressed, { maxOutputLength: Math.max(1, expectedSize) });
  }
  await fsp.mkdir(stageDir, { recursive: false });
  let done = 0;
  for (const file of header.target.files) {
    const target = checkedTarget(stageDir, file.path);
    await assertNoLinks(stageDir, target);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const op = operations.get(file.path);
    if (!op) {
      const source = checkedTarget(baseDir, file.path);
      await assertNoLinks(baseDir, source);
      if (await hashFile(source) !== file.sha256) throw new Error(`本机文件已改变：${file.path}`);
      try { await fsp.link(source, target); } catch { await fsp.copyFile(source, target); }
    } else if (op.kind === 'replace') {
      const bytes = await payload(op, file.size);
      if (bytes.length !== file.size || sha256(bytes) !== file.sha256) throw new Error(`更新文件校验失败：${file.path}`);
      await fsp.writeFile(target, bytes);
    } else if (op.kind === 'chunks') {
      const source = checkedTarget(baseDir, file.path);
      await assertNoLinks(baseDir, source);
      if (!oldFiles.has(file.path) || oldFiles.get(file.path).sha256 !== op.baseSha256 ||
          await hashFile(source) !== op.baseSha256 || op.chunkSize !== CHUNK_SIZE || !Array.isArray(op.chunks) ||
          op.chunks.length !== Math.ceil(file.size / CHUNK_SIZE)) throw new Error(`本机文件不适用于补丁：${file.path}`);
      const baseBytes = await fsp.readFile(source), parts = [];
      for (let i = 0; i < op.chunks.length; i++) {
        const expected = Math.min(CHUNK_SIZE, file.size - i * CHUNK_SIZE);
        const chunk = op.chunks[i] ? await payload(op.chunks[i], expected) : baseBytes.subarray(i * CHUNK_SIZE, i * CHUNK_SIZE + expected);
        if (chunk.length !== expected) throw new Error('增量包分块大小无效。');
        parts.push(chunk);
      }
      const bytes = Buffer.concat(parts);
      if (sha256(bytes) !== file.sha256) throw new Error(`补丁校验失败：${file.path}`);
      await fsp.writeFile(target, bytes);
    } else throw new Error('增量包操作类型无效。');
    progress(++done, header.target.files.length);
  }
  await fsp.writeFile(path.join(stageDir, 'manifest.json'), JSON.stringify(header.target));
  return header;
}

module.exports = { safeRelative, versionName, sha256, hashFile, listFiles, validateManifest, writeManifest, readManifest,
  verifyVersion, buildPatch, readPatch, unpackPatch };
