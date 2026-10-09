const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('utaDesktop', Object.freeze({
  platform: 'windows',
  loadCredential: () => ipcRenderer.invoke('uta:credential:load'),
  saveCredential: (value) => ipcRenderer.invoke('uta:credential:save', value),
  clearCredential: () => ipcRenderer.invoke('uta:credential:clear'),
}));
