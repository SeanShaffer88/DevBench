const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('devbenchDesktop', {
  isDesktopShell: true,
  getHostInfo: () => ipcRenderer.invoke('devbench:host-info'),
});
