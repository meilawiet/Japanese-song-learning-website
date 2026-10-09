const { app, BrowserWindow, Menu, protocol, net, dialog, shell, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { APP_ORIGIN, resolveAssetPath, isExternalUrl } = require('./runtime.cjs');

const appRoot = path.resolve(__dirname, '..');
const home = app.isPackaged ? path.dirname(process.execPath) : appRoot;
const dataDir = path.join(home, 'uta-data');
const logDir = path.join(dataDir, 'logs');
const tempDir = path.join(dataDir, 'tmp');
for (const folder of [dataDir, logDir, tempDir, path.join(dataDir, 'profile'), path.join(dataDir, 'backups')]) fs.mkdirSync(folder, { recursive: true });
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
const logPath = path.join(logDir, 'desktop.log');
if (fs.existsSync(logPath) && fs.statSync(logPath).size > 2 * 1024 * 1024) fs.renameSync(logPath, logPath + '.previous');
const log = (message) => fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startBackend() {
  const executable = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'uta-backend.exe')
    : path.join(appRoot, 'server', '.venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(executable)) throw new Error('缺少内置注音服务，请保留完整的 UTA 程序文件夹。');
  const args = app.isPackaged ? [] : ['-B', '-u', path.join(appRoot, 'server', 'desktop_api.py')];
  backend = spawn(executable, args, { cwd: home, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1',
      UTA_ENV_FILE: path.join(dataDir, 'config.env'),
      UTA_TOMOSHI_DB: app.isPackaged ? path.join(process.resourcesPath, 'dictionary', 'tomoshi-dict-open.db') : path.join(appRoot, 'server', 'data', 'tomoshi-dict-open.db') } });
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

function openExternal(url) { if (isExternalUrl(url)) shell.openExternal(url).catch(() => {}); }

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1360, height: 900, minWidth: 880, minHeight: 640, show: false,
    title: 'UTA · 日语歌学习', backgroundColor: '#f5f2eb', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(APP_ORIGIN + '/')) { event.preventDefault(); openExternal(url); } });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.on('will-download', async (_event, item) => {
    const choice = await dialog.showSaveDialog(mainWindow, { title: '保存学习备份',
      defaultPath: path.join(dataDir, 'backups', path.basename(item.getFilename())) });
    if (choice.canceled || !choice.filePath) item.cancel(); else item.setSavePath(choice.filePath);
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('render-process-gone', (_event, details) => log(`Renderer stopped: ${details.reason}`));
  mainWindow.loadURL(APP_ORIGIN + '/').catch((error) => { dialog.showErrorBox('UTA 页面加载失败', error.message); app.quit(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'UTA', submenu: [{ label: '打开数据文件夹', click: () => shell.openPath(dataDir) }, { type: 'separator' }, { role: 'quit', label: '退出' }] },
    { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { label: '显示', submenu: [{ role: 'reload', label: '刷新' }, { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { role: 'togglefullscreen', label: '全屏' }] },
    { label: '帮助', submenu: [{ label: '使用说明', click: () => shell.openPath(path.join(home, '使用说明.md')) },
      { label: '查看 Windows 版更新', click: () => openExternal('https://github.com/meilawiet/Japanese-song-learning-website/releases') },
      { label: '关于 UTA', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: '关于 UTA', message: `UTA ${app.getVersion()} · Windows x64`, detail: '用日语歌学习发音与词汇。\n内置 Sudachi 注音与 Tomoshi 日中词典。\n学习数据保存在程序旁的 uta-data 文件夹。' }) }] },
  ]));
}

app.on('before-quit', () => { stopping = true; if (backend) { backend.stdin.end(); backend.kill(); } });
app.on('window-all-closed', () => app.quit());
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    log('Starting UTA ' + app.getVersion());
    try { backendOrigin = await startBackend(); registerProtocol(); registerCredentials(); createWindow(); }
    catch (error) { log(error.message); dialog.showErrorBox('UTA 无法启动', `${error.message}\n\n日志：${logPath}`); app.quit(); }
  });
}
