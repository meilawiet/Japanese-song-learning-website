const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('utaDesktop', Object.freeze({
  platform: 'windows',
  packaged: !process.defaultApp,
  applyTheme: (colors) => ipcRenderer.invoke('uta:theme:apply', colors),
  openMenu: (name) => ipcRenderer.invoke('uta:menu', name),
  openDataFolder: () => ipcRenderer.invoke('uta:data-folder'),
  requestLyrics: async (source, action, value) => {
    const result = await ipcRenderer.invoke('uta:lyrics:request', { source, action, value });
    if (typeof result === 'string') return result;
    if (result?.ok) return result.body;
    const error = new Error((result?.message || '歌词请求失败，请稍后重试。') + (result?.retryAfter ? ` 约 ${result.retryAfter} 秒后可重试。` : ''));
    error.code = result?.code; error.retryAfter = result?.retryAfter;
    throw error;
  },
  loadLyricsSources: () => ipcRenderer.invoke('uta:lyrics:sources:load'),
  saveLyricsSources: sources => ipcRenderer.invoke('uta:lyrics:sources:save', sources),
  setUnsavedDraft: (id, dirty) => ipcRenderer.invoke('uta:unsaved-draft', id, dirty),
  loadCloseBehavior: () => ipcRenderer.invoke('uta:close-behavior:load'),
  saveCloseBehavior: value => ipcRenderer.invoke('uta:close-behavior:save', value),
  onCloseBehaviorChanged: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('uta:close-behavior:changed', listener);
    return () => ipcRenderer.removeListener('uta:close-behavior:changed', listener);
  },
  beginRestoreSnapshot: () => ipcRenderer.invoke('uta:snapshot:begin'),
  appendRestoreSnapshot: (id, bytes) => ipcRenderer.invoke('uta:snapshot:append', id, bytes),
  finishRestoreSnapshot: (id) => ipcRenderer.invoke('uta:snapshot:finish', id),
  abortRestoreSnapshot: (id) => ipcRenderer.invoke('uta:snapshot:abort', id),
  openRestoreSnapshots: () => ipcRenderer.invoke('uta:snapshot:folder'),
  onCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('uta:command', listener);
    return () => ipcRenderer.removeListener('uta:command', listener);
  },
  loadCredential: () => ipcRenderer.invoke('uta:credential:load'),
  saveCredential: (value) => ipcRenderer.invoke('uta:credential:save', value),
  clearCredential: () => ipcRenderer.invoke('uta:credential:clear'),
  checkUpdate: () => ipcRenderer.invoke('uta:update:check'),
  prepareUpdate: () => ipcRenderer.invoke('uta:update:prepare'),
  getUpdateStatus: () => ipcRenderer.invoke('uta:update:status'),
  prepareLocalUpdate: file => {
    const filename = webUtils.getPathForFile(file);
    if (!filename) throw new Error('无法读取本地文件路径，请从资源管理器拖入文件或使用选择文件按钮。');
    return ipcRenderer.invoke('uta:update:local', filename);
  },
  installUpdate: () => ipcRenderer.invoke('uta:update:install'),
  onUpdateProgress: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('uta:update:progress', listener);
    return () => ipcRenderer.removeListener('uta:update:progress', listener);
  },
}));
