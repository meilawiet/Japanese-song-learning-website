const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const PREFIX = Buffer.from('UTA-LEARNING-BACKUP\n');
const CLOUD_PREFIX = Buffer.from('UTA-CLOUD-BACKUP\n');
const SNAPSHOT_NAME = /^UTA-before-restore-[\dTZ-]+-[a-f0-9]{16}\.uta-backup$/;

class RestoreSnapshotStore {
  constructor(dataDir, keep = 3) {
    this.directory = path.resolve(dataDir, 'backups', 'restore-snapshots');
    this.keep = keep;
    this.sessions = new Map();
    this.recoveryFile = path.join(dataDir, 'cross-platform-restore.json');
  }
  async begin() {
    await fs.mkdir(this.directory, { recursive: true });
    const id = randomBytes(8).toString('hex');
    const name = `UTA-before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}-${id}.uta-backup`;
    const target = path.resolve(this.directory, name);
    if (path.dirname(target) !== this.directory) throw new Error('Invalid snapshot path');
    const temporary = target + '.tmp';
    const handle = await fs.open(temporary, 'wx');
    this.sessions.set(id, { name, target, temporary, handle, size: 0 });
    return { id };
  }
  async append(id, data) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('自动快照会话已结束。');
    if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) throw new Error('无效快照数据。');
    const bytes = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (!bytes.length || bytes.length > 4 * 1024 * 1024) throw new Error('无效快照分块。');
    if (!session.size && !bytes.subarray(0, PREFIX.length).equals(PREFIX)
      && !bytes.subarray(0, CLOUD_PREFIX.length).equals(CLOUD_PREFIX)) throw new Error('无效学习快照。');
    await session.handle.writeFile(bytes);
    session.size += bytes.length;
  }
  async finish(id) {
    const session = this.sessions.get(id);
    if (!session || !session.size) throw new Error('自动快照尚未写入。');
    await session.handle.sync();
    await session.handle.close();
    await fs.rename(session.temporary, session.target);
    this.sessions.delete(id);
    // Prune only our published snapshot names, after the new one is durable.
    // Locked old files must not invalidate the durable new snapshot. Keep the
    // just-published file even if two snapshots share the same millisecond.
    try {
      const entries = await fs.readdir(this.directory, { withFileTypes: true });
      let protectedName;
      try { protectedName = JSON.parse(await fs.readFile(this.recoveryFile, 'utf8')).name; } catch { /* No interrupted restore. */ }
      const snapshots = entries.filter(entry => entry.isFile() && SNAPSHOT_NAME.test(entry.name) && entry.name !== session.name && entry.name !== protectedName)
        .map(entry => entry.name).sort().reverse();
      for (const name of snapshots.slice(this.keep - 1)) {
        const target = path.resolve(this.directory, name);
        if (path.dirname(target) !== this.directory) throw new Error('Invalid snapshot path');
        await fs.rm(target).catch(() => {});
      }
    } catch { /* The completed snapshot remains recoverable. */ }
    return { path: session.target, name: session.name, size: session.size };
  }
  async abort(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    await session.handle.close().catch(() => {});
    await fs.rm(session.temporary, { force: true });
  }
}

module.exports = { RestoreSnapshotStore };
