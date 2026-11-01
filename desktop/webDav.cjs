const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');

const LIMIT = 500 * 1024 * 1024, CHUNK = 256 * 1024;
const NAME = /^(?:_uta-audio-[a-f0-9]{64}\.bin|UTA-[A-Za-z0-9_.-]+\.uta-backup)$/;
function config(value) {
  let url;
  try { url = new URL(value?.url); } catch { throw new Error('请填写有效的 WebDAV HTTPS 目录。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || typeof value.username !== 'string' || !value.username.trim() || value.username.length > 1024
    || typeof value.password !== 'string' || !value.password || value.password.length > 4096) throw new Error('请使用 HTTPS 目录、账号及应用密码，不要将凭据写在地址里。');
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return { url: url.href, username: value.username, password: value.password };
}
function filename(value) { if (typeof value !== 'string' || !NAME.test(value)) throw new Error('不允许的云文件名。'); return value; }

class DesktopWebDav {
  constructor({ dataDir, safeStorage, request = https.request, progress = () => {} }) {
    this.tempDirectory = path.join(dataDir, 'tmp', 'cross-platform');
    this.settingsFile = path.join(dataDir, 'webdav-settings.json');
    this.secretFile = path.join(dataDir, 'webdav-credential.bin');
    this.recoveryFile = path.join(dataDir, 'cross-platform-restore.json');
    this.snapshotDirectory = path.resolve(dataDir, 'backups', 'restore-snapshots');
    Object.assign(this, { safeStorage, request, progress });
    this.sessions = new Map(); this.requests = new Set(); this.busy = false; this.generation = 0;
  }
  async initialize() {
    await fs.mkdir(this.tempDirectory, { recursive: true });
    // Only our own random temp files; never touch user data or remote assets.
    for (const entry of await fs.readdir(this.tempDirectory, { withFileTypes: true })) {
      if (entry.isFile() && /^[a-f0-9-]{36}\.part$/.test(entry.name)) await fs.rm(path.join(this.tempDirectory, entry.name), { force: true });
    }
  }
  async load() {
    let settings = { url: '', username: '' };
    try { settings = JSON.parse(await fs.readFile(this.settingsFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('无法读取互通配置。'); }
    let password = '';
    try {
      const data = await fs.readFile(this.secretFile);
      if (!this.safeStorage.isEncryptionAvailable()) throw new Error('Windows 加密存储不可用。');
      password = this.safeStorage.decryptString(data);
    } catch (error) { if (error.code !== 'ENOENT') throw new Error('无法读取加密的 WebDAV 密码，请重新配置。'); }
    return { url: settings.url || '', username: settings.username || '', password };
  }
  async save(value) {
    const settings = config(value), { password, ...publicSettings } = settings;
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('Windows 加密存储不可用，未保存密码。');
    await fs.writeFile(this.secretFile + '.tmp', this.safeStorage.encryptString(password));
    await fs.rename(this.secretFile + '.tmp', this.secretFile);
    await fs.writeFile(this.settingsFile + '.tmp', JSON.stringify(publicSettings));
    await fs.rename(this.settingsFile + '.tmp', this.settingsFile);
    return publicSettings;
  }
  async clear() { await fs.rm(this.secretFile, { force: true }); await fs.rm(this.settingsFile, { force: true }); }
  async recoveryStatus() {
    try {
      const value = JSON.parse(await fs.readFile(this.recoveryFile, 'utf8'));
      if (!/^UTA-before-restore-[\dTZ-]+-[a-f0-9]{16}\.uta-backup$/.test(value.name)) throw new Error('invalid');
      return { name: value.name, path: path.join(this.snapshotDirectory, value.name) };
    } catch (error) { if (error.code === 'ENOENT') return null; throw new Error('恢复日志无法读取，请保留本机数据并检查恢复前快照。'); }
  }
  async restoreBegin({ name, ai }) {
    if (await this.recoveryStatus()) throw new Error('上次恢复未完成，请先通过数据管理恢复原快照。');
    if (!/^UTA-before-restore-[\dTZ-]+-[a-f0-9]{16}\.uta-backup$/.test(name)) throw new Error('恢复点名称无效。');
    const snapshot = path.resolve(this.snapshotDirectory, name);
    if (path.dirname(snapshot) !== this.snapshotDirectory || !(await fs.lstat(snapshot)).isFile()) throw new Error('恢复前快照不存在。');
    let encryptedAi = null;
    if (ai) {
      const value = JSON.stringify(ai);
      if (value.length > 16384 || typeof ai.api_key !== 'string' || ai.api_key.length > 4096) throw new Error('AI 恢复资料无效。');
      if (!this.safeStorage.isEncryptionAvailable()) throw new Error('无法加密保留当前 AI 配置，尚未恢复。');
      encryptedAi = this.safeStorage.encryptString(value).toString('base64');
    }
    const handle = await fs.open(this.recoveryFile, 'wx');
    try { await handle.writeFile(JSON.stringify({ name, startedAt: new Date().toISOString(), encryptedAi })); await handle.sync(); } finally { await handle.close(); }
  }
  async loadRecoveryAi() {
    if (!await this.recoveryStatus()) return null;
    try {
      const { encryptedAi } = JSON.parse(await fs.readFile(this.recoveryFile, 'utf8'));
      if (encryptedAi == null) return null;
      if (typeof encryptedAi !== 'string' || encryptedAi.length > 65536) throw new Error('invalid');
      if (!this.safeStorage.isEncryptionAvailable()) throw new Error('unavailable');
      return JSON.parse(this.safeStorage.decryptString(Buffer.from(encryptedAi, 'base64')));
    } catch (error) { if (error.code === 'ENOENT') return null; throw new Error('恢复前 AI 配置无法解密，请保留恢复点。'); }
  }
  async restoreFinish() { await fs.rm(this.recoveryFile, { force: true }); }
  async begin() {
    if (this.sessions.size >= 4) throw new Error('暂存文件过多，请完成或取消当前操作。');
    const id = randomUUID(), file = path.join(this.tempDirectory, id + '.part');
    const handle = await fs.open(file, 'wx');
    this.sessions.set(id, { file, handle, size: 0, sealed: false });
    return { id };
  }
  session(id) { const session = this.sessions.get(id); if (!session) throw new Error('传输会话已结束。'); return session; }
  async append({ id, bytes }) {
    const session = this.session(id);
    if (session.sealed || !(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) throw new Error('暂存数据无效。');
    const data = bytes instanceof ArrayBuffer ? Buffer.from(bytes) : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (!data.length || data.length > CHUNK || session.size + data.length > LIMIT) throw new Error('文件超过 500 MiB 或分块无效。');
    await session.handle.writeFile(data); session.size += data.length;
  }
  async seal(session) {
    if (!session.sealed) { await session.handle.sync(); await session.handle.close(); session.sealed = true; }
  }
  async digest({ id }) {
    const session = this.session(id); await this.seal(session);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(session.file)) hash.update(chunk);
    return { sha256: hash.digest('hex'), size: session.size };
  }
  async release({ id }) {
    const session = this.sessions.get(id); if (!session) return;
    this.sessions.delete(id);
    if (!session.sealed) await session.handle.close().catch(() => {});
    await fs.rm(session.file, { force: true });
  }
  async cancel() {
    this.generation++;
    for (const request of this.requests) request.destroy(new Error('操作已取消。'));
  }
  async read({ id, offset }) {
    const session = this.session(id);
    if (!session.sealed || !Number.isSafeInteger(offset) || offset < 0 || offset >= session.size) throw new Error('读取位置无效。');
    const handle = await fs.open(session.file, 'r');
    try {
      const buffer = Buffer.alloc(Math.min(CHUNK, session.size - offset));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      if (bytesRead !== buffer.length) throw new Error('暂存文件不完整。');
      return new Uint8Array(buffer);
    } finally { await handle.close(); }
  }
  async response(value, name, method, headers = {}, body) {
    const settings = config(value), url = new URL(name ? filename(name) : '', settings.url);
    return new Promise((resolve, reject) => {
      const request = this.request(url, { method, headers: { Authorization: `Basic ${Buffer.from(`${settings.username}:${settings.password}`).toString('base64')}`, ...headers } }, response => {
        response.once('close', () => this.requests.delete(request));
        // Node https does not follow redirects. Never forward credentials to another location.
        if (response.statusCode >= 300 && response.statusCode < 400) { response.resume(); reject(new Error('WebDAV 返回重定向，请填写最终目录地址。')); return; }
        resolve(response);
      });
      this.requests.add(request);
      request.once('error', () => { this.requests.delete(request); reject(new Error('WebDAV 连接失败或已取消，请检查地址、网络及证书。')); });
      request.setTimeout(120000, () => request.destroy(new Error('timeout')));
      if (body) {
        pipeline(body, request).catch(() => request.destroy());
      } else request.end();
    });
  }
  async text(response, limit) {
    const parts = []; let size = 0;
    for await (const chunk of response) { size += chunk.length; if (size > limit) { response.destroy(); throw new Error('WebDAV 目录响应过大。'); } parts.push(chunk); }
    return Buffer.concat(parts).toString('utf8');
  }
  status(response, allowed) {
    if (!allowed.includes(response.statusCode)) { response.resume(); throw new Error(`WebDAV 请求失败（HTTP ${response.statusCode}）${[401, 403].includes(response.statusCode) ? '，请检查账号和应用密码' : response.statusCode === 412 ? '，同名文件已存在，请重试检查' : ''}。`); }
  }
  async directory({ config: value, create = false }) {
    let response = await this.response(value, '', 'PROPFIND', { Depth: '1' });
    if (response.statusCode === 404 && create) {
      response.resume(); const made = await this.response(value, '', 'MKCOL'); this.status(made, [201, 405]); made.resume();
      response = await this.response(value, '', 'PROPFIND', { Depth: '1' });
    }
    this.status(response, [207]); return { xml: await this.text(response, 2 * 1024 * 1024) };
  }
  async stat({ config: value, name }) {
    const response = await this.response(value, name, 'PROPFIND', { Depth: '0' });
    if (response.statusCode === 404) { response.resume(); return { exists: false }; }
    this.status(response, [207]); return { exists: true, xml: await this.text(response, 64 * 1024) };
  }
  async upload({ config: value, id, name }) {
    const session = this.session(id); await this.seal(session); filename(name);
    if (!session.size || session.size > LIMIT) throw new Error('上传文件大小无效。');
    if (name.startsWith('_uta-audio-') && (await this.digest({ id })).sha256 !== name.slice(11, -4)) throw new Error('音频文件名与摘要不符。');
    let sent = 0;
    const meter = new Transform({ transform: (chunk, _encoding, callback) => {
      sent += chunk.length; this.progress({ id, phase: 'upload', done: sent, total: session.size }); callback(null, chunk);
    } });
    const stream = createReadStream(session.file); stream.on('error', error => meter.destroy(error)); stream.pipe(meter);
    try {
      const response = await this.response(value, name, 'PUT', { 'Content-Type': 'application/octet-stream', 'Content-Length': String(session.size), 'If-None-Match': '*' }, meter);
      this.status(response, [200, 201, 204]); await this.text(response, 64 * 1024);
      this.progress({ id, phase: 'confirmed', done: session.size, total: session.size });
      return { size: session.size };
    } finally { stream.destroy(); meter.destroy(); }
  }
  async download({ config: value, name, expected }) {
    filename(name);
    if (expected && (expected.name !== name || !/^[a-f0-9]{64}$/.test(expected.sha256) || !Number.isSafeInteger(expected.size) || expected.size <= 0 || expected.size > LIMIT)) throw new Error('下载引用无效。');
    const { id } = await this.begin(), session = this.session(id);
    try {
      await this.seal(session);
      const response = await this.response(value, name, 'GET'); this.status(response, [200]);
      const hash = createHash('sha256');
      const meter = new Transform({ transform: (chunk, _encoding, callback) => {
        session.size += chunk.length;
        if (session.size > (expected?.size || LIMIT)) return callback(new Error('下载超过声明大小或 500 MiB。'));
        hash.update(chunk); this.progress({ id, phase: 'download', done: session.size, total: expected?.size || 0 }); callback(null, chunk);
      } });
      await pipeline(response, meter, createWriteStream(session.file));
      const sha256 = hash.digest('hex');
      if (!session.size || expected && (session.size !== expected.size || sha256 !== expected.sha256)) throw new Error('云音频大小或 SHA256 校验失败，未写入歌曲。');
      return { id, size: session.size, sha256 };
    } catch (error) { await this.release({ id }); throw error; }
  }
  async invoke(action, payload) {
    if (action === 'cancel') return this.cancel();
    const methods = ['load', 'save', 'clear', 'begin', 'append', 'digest', 'release', 'read', 'directory', 'stat', 'upload', 'download', 'recoveryStatus', 'restoreBegin', 'restoreFinish', 'loadRecoveryAi'];
    if (!methods.includes(action)) throw new Error('不支持的互通操作。');
    if (this.busy) throw new Error('互通操作正在进行，请稍后。');
    this.busy = true;
    try { return await this[action](payload); } finally { this.busy = false; }
  }
}

module.exports = { DesktopWebDav, validateWebDav: config, cloudFilename: filename, CHUNK };
