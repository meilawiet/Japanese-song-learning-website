const { app, BrowserWindow, Menu, Tray, nativeImage, protocol, net, dialog, shell, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { APP_ORIGIN, resolveAssetPath, isExternalUrl } = require('./runtime.cjs');
const { RestoreSnapshotStore } = require('./restoreSnapshots.cjs');
const { lyricRequest, createLyricsClient } = require('./lyricNetwork.cjs');
const { LyricSourceStore } = require('./lyricSources.cjs');
const { registerUpdateHandlers } = require('./updateRuntime.cjs');
const { WindowCloseController } = require('./windowClose.cjs');

const appRoot = path.resolve(__dirname, '..');
const home = app.isPackaged ? path.dirname(process.execPath) : appRoot;
const versionRoot = app.isPackaged ? path.resolve(process.env.UTA_VERSION_ROOT || path.dirname(appRoot)) : appRoot;
const appVersion = require(path.join(appRoot, 'package.json')).version;
const dataDir = path.join(home, 'uta-data');
const logDir = path.join(dataDir, 'logs');
const tempDir = path.join(dataDir, 'tmp');
for (const folder of [dataDir, logDir, tempDir, path.join(dataDir, 'profile'), path.join(dataDir, 'backups'), path.join(dataDir, 'updates')]) fs.mkdirSync(folder, { recursive: true });
app.setName('UTA');
app.setPath('userData', path.join(dataDir, 'profile'));
app.setPath('sessionData', path.join(dataDir, 'profile'));
app.setPath('temp', tempDir);
app.setPath('crashDumps', path.join(logDir, 'crashes'));
app.setAppLogsPath(logDir);
process.env.TEMP = tempDir;
process.env.TMP = tempDir;
protocol.registerSchemesAsPrivileged([{ scheme: 'uta', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const token = randomBytes(32).toString('hex');
let backend, backendOrigin, mainWindow, stopping = false;
const unsavedDrafts = new Set();
const snapshots = new RestoreSnapshotStore(dataDir);
const lyricSources = new LyricSourceStore(dataDir);
const requestLyricContent = createLyricsClient(fetch);
const trustedSnapshotCaller = event => {
  if (event.sender !== mainWindow?.webContents || !event.senderFrame?.url.startsWith(APP_ORIGIN + '/')) throw new Error('Forbidden');
};
ipcMain.handle('uta:lyrics:request', async (event, payload) => {
  trustedSnapshotCaller(event);
  try {
    const source = lyricSources.load().find(source => source.id === payload?.source && source.enabled);
    if (!source) throw new Error('该歌词源不存在或未启用，请在设置中检查。');
    const request = lyricRequest(payload?.source, payload?.action, payload?.value, source);
    return { ok: true, body: await requestLyricContent(request) };
  } catch (error) { return { ok: false, message: error.message, code: error.code, retryAfter: error.retryAfter }; }
});
ipcMain.handle('uta:lyrics:sources:load', event => { trustedSnapshotCaller(event); return lyricSources.load(); });
ipcMain.handle('uta:lyrics:sources:save', (event, sources) => { trustedSnapshotCaller(event); return lyricSources.save(sources); });
ipcMain.handle('uta:theme:apply', (event, colors) => {
  if (event.sender !== mainWindow?.webContents || !event.senderFrame?.url.startsWith(APP_ORIGIN + '/')) throw new Error('Forbidden');
  if (!colors || [colors.chrome, colors.ink, colors.bg].some(color => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) throw new Error('Invalid theme colors');
  if (process.platform === 'win32') mainWindow.setTitleBarOverlay({ color: colors.chrome, symbolColor: colors.ink, height: 42 });
  mainWindow.setBackgroundColor(colors.bg);
  return true;
});
ipcMain.handle('uta:snapshot:begin', event => { trustedSnapshotCaller(event); return snapshots.begin(); });
ipcMain.handle('uta:snapshot:append', (event, id, bytes) => { trustedSnapshotCaller(event); return snapshots.append(id, bytes); });
ipcMain.handle('uta:snapshot:finish', (event, id) => { trustedSnapshotCaller(event); return snapshots.finish(id); });
ipcMain.handle('uta:snapshot:abort', (event, id) => { trustedSnapshotCaller(event); return snapshots.abort(id); });
ipcMain.handle('uta:snapshot:folder', async event => {
  trustedSnapshotCaller(event);
  await fs.promises.mkdir(snapshots.directory, { recursive: true });
  return shell.openPath(snapshots.directory);
});
const logPath = path.join(logDir, 'desktop.log');
if (fs.existsSync(logPath) && fs.statSync(logPath).size > 2 * 1024 * 1024) fs.renameSync(logPath, logPath + '.previous');
const log = (message) => fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
const windowClose = new WindowCloseController({ app, dialog, Tray, Menu, nativeImage, getWindow: () => mainWindow,
  unsavedDrafts, dataDir, iconPath: path.join(__dirname, 'icon.png'), onSettings: () => sendCommand('settings'), log });
ipcMain.handle('uta:close-behavior:load', event => { trustedSnapshotCaller(event); return windowClose.store.load(); });
ipcMain.handle('uta:close-behavior:save', (event, value) => { trustedSnapshotCaller(event); return windowClose.saveBehavior(value); });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startBackend() {
  const executable = app.isPackaged
    ? path.join(versionRoot, 'backend', 'uta-backend.exe')
    : path.join(appRoot, 'server', '.venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(executable)) throw new Error('缺少内置注音服务，请保留完整的 UTA 程序文件夹。');
  const args = app.isPackaged ? [] : ['-B', '-u', path.join(appRoot, 'server', 'desktop_api.py')];
  backend = spawn(executable, args, { cwd: home, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1',
      UTA_ENV_FILE: path.join(dataDir, 'config.env'),
      UTA_TOMOSHI_DB: app.isPackaged ? path.join(versionRoot, 'dictionary', 'tomoshi-dict-open.db') : path.join(appRoot, 'server', 'data', 'tomoshi-dict-open.db') } });
  backend.stdin.on('error', () => {});
  backend.stdin.write(JSON.stringify({ token }) + '\n');
  let output = '', failure, origin;
  backend.on('error', (error) => { failure = error; });
  backend.on('exit', (code) => {
    failure = new Error(`注音服务退出（${code}），请查看 uta-data/logs/desktop.log。`);
    log(`Backend exited: ${code}`);
    if (mainWindow && !stopping) { dialog.showErrorBox('UTA 注音服务已停止', failure.message); app.quit(); }
  });
  backend.stdout.on('data', (chunk) => {
    output += chunk.toString('utf8');
    let end;
    while ((end = output.indexOf('\n')) >= 0) {
      const line = output.slice(0, end).trim(); output = output.slice(end + 1);
      if (line.startsWith('UTA_BACKEND_READY ')) {
        const { port } = JSON.parse(line.slice('UTA_BACKEND_READY '.length));
        if (Number.isInteger(port) && port > 0 && port <= 65535) origin = `http://127.0.0.1:${port}`;
      } else log(line);
    }
  });
  backend.stderr.on('data', (chunk) => log(chunk.toString('utf8')));
  for (let attempt = 0; attempt < 240; attempt++) {
    if (failure) throw failure;
    if (origin) {
      try {
        const response = await fetch(origin + '/api/health', { headers: { 'X-UTA-Desktop-Token': token }, signal: AbortSignal.timeout(750) });
        if (response.ok) { log('Backend ready'); return origin; }
      } catch { /* Wait for Uvicorn to begin serving the reserved socket. */ }
    }
    await pause(250);
  }
  throw new Error('本地词典启动超时，请查看 uta-data/logs/desktop.log。');
}

function registerCredentials() {
  const filename = path.join(dataDir, 'ai-credential.bin');
  const trusted = (event) => { if (!event.senderFrame?.url.startsWith(APP_ORIGIN + '/')) throw new Error('Invalid caller'); };
  ipcMain.handle('uta:credential:load', (event) => {
    trusted(event);
    if (!fs.existsSync(filename)) return '';
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 加密存储暂不可用。');
    return safeStorage.decryptString(fs.readFileSync(filename));
  });
  ipcMain.handle('uta:credential:save', (event, value) => {
    trusted(event);
    if (typeof value !== 'string' || value.length > 4096) throw new Error('无效密钥。');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 加密存储暂不可用，请关闭记住密钥。');
    const temporary = filename + '.tmp';
    fs.writeFileSync(temporary, safeStorage.encryptString(value));
    fs.renameSync(temporary, filename);
  });
  ipcMain.handle('uta:credential:clear', (event) => { trusted(event); fs.rmSync(filename, { force: true }); });
}

function registerProtocol() {
  const assets = path.join(appRoot, 'dist-desktop');
  protocol.handle('uta', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'app' || url.username || url.password) return new Response('Forbidden', { status: 403 });
      if (request.initiatorOrigin && request.initiatorOrigin !== APP_ORIGIN) return new Response('Forbidden', { status: 403 });
      if (url.pathname.startsWith('/api/')) {
        const headers = new Headers(request.headers);
        headers.delete('host'); headers.delete('origin');
        headers.set('X-UTA-Desktop-Token', token);
        const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
        return await fetch(backendOrigin + url.pathname + url.search, { method: request.method, headers, body, signal: request.signal });
      }
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      const target = resolveAssetPath(assets, request.url);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return new Response('Not found', { status: 404 });
      return await net.fetch(pathToFileURL(target).href, { method: request.method, headers: request.headers });
    } catch { return new Response('本地服务暂不可用。', { status: 502 }); }
  });
}

function sendCommand(command) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('uta:command', command); }
ipcMain.handle('uta:menu', (event, name) => {
  if (event.sender !== mainWindow?.webContents || !event.senderFrame?.url.startsWith(APP_ORIGIN + '/')) throw new Error('Forbidden');
  const index = { file: 0, edit: 1, view: 2, help: 3 }[name];
  if (index === undefined) throw new Error('Unknown menu');
  Menu.getApplicationMenu().items[index].submenu.popup({ window: mainWindow });
});
ipcMain.handle('uta:data-folder', event => {
  if (event.sender !== mainWindow?.webContents || !event.senderFrame?.url.startsWith(APP_ORIGIN + '/')) throw new Error('Forbidden');
  return shell.openPath(dataDir);
});
ipcMain.handle('uta:unsaved-draft', (event, id, dirty) => {
  if (event.sender !== mainWindow?.webContents || !event.senderFrame?.url.startsWith(APP_ORIGIN + '/')) throw new Error('Forbidden');
  if (typeof id !== 'string' || !/^[a-z-]{1,48}$/.test(id) || typeof dirty !== 'boolean') throw new Error('Invalid draft state');
  if (dirty) unsavedDrafts.add(id); else unsavedDrafts.delete(id);
});

function openExternal(url) { if (isExternalUrl(url)) shell.openExternal(url).catch(() => {}); }

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1360, height: 900, minWidth: 1000, minHeight: 680, show: false,
    title: 'UTA · 日语歌学习', backgroundColor: '#f4f6f9', titleBarStyle: 'hidden', titleBarOverlay: { color: '#edf1f7', symbolColor: '#42516a', height: 42 }, autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  // Route desktop shortcuts before Chromium handles them, including hidden-menu windows.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return;
    const key = input.key.toLowerCase();
    const command = input.shift ? (key === 'e' ? 'backup' : null)
      : ({ o: 'import', f: 'search', ',': 'settings', '1': 'lesson', '2': 'library', '3': 'review' })[key];
    if (command) { event.preventDefault(); sendCommand(command); }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(APP_ORIGIN + '/')) { event.preventDefault(); openExternal(url); } });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.on('will-download', async (_event, item) => {
    const choice = await dialog.showSaveDialog(mainWindow, { title: '保存学习备份',
      defaultPath: path.join(dataDir, 'backups', path.basename(item.getFilename())) });
    if (choice.canceled || !choice.filePath) item.cancel(); else item.setSavePath(choice.filePath);
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    const nonce = process.env.UTA_UPDATE_HEALTH_NONCE;
    if (nonce && /^[a-f0-9]{32}$/.test(nonce)) {
      fs.writeFile(path.join(dataDir, 'updates', `healthy-${nonce}.json`),
        JSON.stringify({ version: appVersion, nonce }), () => {});
    }
  });
  mainWindow.webContents.on('did-start-loading', () => unsavedDrafts.clear());
  mainWindow.on('close', event => { void windowClose.handleClose(event); });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('render-process-gone', (_event, details) => log(`Renderer stopped: ${details.reason}`));
  mainWindow.loadURL(APP_ORIGIN + '/').catch((error) => { dialog.showErrorBox('UTA 页面加载失败', error.message); app.quit(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '文件', submenu: [
      { label: '导入歌曲…', accelerator: 'Ctrl+O', click: () => sendCommand('import') },
      { label: '搜索歌曲', accelerator: 'Ctrl+F', click: () => sendCommand('search') },
      { label: '导出学习备份…', accelerator: 'Ctrl+Shift+E', click: () => sendCommand('backup') },
      { label: '设置…', accelerator: 'Ctrl+,', click: () => sendCommand('settings') },
      { type: 'separator' }, { label: '打开数据文件夹', click: () => shell.openPath(dataDir) }, { type: 'separator' }, { role: 'quit', label: '退出' }] },
    { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { label: '视图', submenu: [{ label: '发音学习', accelerator: 'Ctrl+1', click: () => sendCommand('lesson') }, { label: '歌曲库', accelerator: 'Ctrl+2', click: () => sendCommand('library') }, { label: '复习', accelerator: 'Ctrl+3', click: () => sendCommand('review') }, { type: 'separator' }, { role: 'reload', label: '刷新' }, { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { role: 'togglefullscreen', label: '全屏' }] },
    { label: '帮助', submenu: [{ label: '使用说明', click: () => shell.openPath(path.join(versionRoot, '使用说明.md')) },
      { label: '查看 Windows 版更新', click: () => openExternal('https://github.com/meilawiet/Japanese-song-learning-website/releases') },
      { label: '关于 UTA', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: '关于 UTA', message: `UTA ${appVersion} · Windows x64`, detail: '用日语歌学习发音与词汇。\n内置 Sudachi 注音与 Tomoshi 日中词典。\n学习数据保存在程序旁的 uta-data 文件夹。' }) }] },
  ]));
  mainWindow.setMenuBarVisibility(false);
}

app.on('before-quit', event => windowClose.beforeQuit(event));
app.on('will-quit', () => { windowClose.destroy(); stopping = true; if (backend) { backend.stdin.end(); backend.kill(); } });
app.on('window-all-closed', () => app.quit());
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => windowClose.showWindow());
  app.whenReady().then(async () => {
    log('Starting UTA ' + appVersion);
    try { backendOrigin = await startBackend(); registerProtocol(); registerCredentials(); createWindow();
      if (app.isPackaged) registerUpdateHandlers({ app, ipcMain, mainWindow, home, dataDir, versionRoot, appVersion,
        unsavedDrafts, trusted: trustedSnapshotCaller, log }); }
    catch (error) { log(error.message); dialog.showErrorBox('UTA 无法启动', `${error.message}\n\n日志：${logPath}`); app.quit(); }
  });
}
