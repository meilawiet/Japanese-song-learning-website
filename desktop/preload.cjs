const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('utaDesktop', Object.freeze({
  platform: 'windows',
  openMenu: (name) => ipcRenderer.invoke('uta:menu', name),
  openDataFolder: () => ipcRenderer.invoke('uta:data-folder'),
  onCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('uta:command', listener);
    return () => ipcRenderer.removeListener('uta:command', listener);
  },
  loadCredential: () => ipcRenderer.invoke('uta:credential:load'),
  saveCredential: (value) => ipcRenderer.invoke('uta:credential:save', value),
  clearCredential: () => ipcRenderer.invoke('uta:credential:clear'),
}));
