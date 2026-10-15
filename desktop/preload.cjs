const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('utaDesktop', Object.freeze({
  platform: 'windows',
  applyTheme: (colors) => ipcRenderer.invoke('uta:theme:apply', colors),
  openMenu: (name) => ipcRenderer.invoke('uta:menu', name),
  openDataFolder: () => ipcRenderer.invoke('uta:data-folder'),
  requestLyrics: (source, action, value) => ipcRenderer.invoke('uta:lyrics:request', { source, action, value }),
  setUnsavedDraft: (id, dirty) => ipcRenderer.invoke('uta:unsaved-draft', id, dirty),
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
}));
