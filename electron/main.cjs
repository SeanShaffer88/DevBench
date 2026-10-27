/**
 * DevBench Windows Desktop Shell (Electron Main Process)
 * Starts the local adapter server on loopback and opens a Per-Monitor DPI-aware window.
 */
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');

let mainWindow = null;
let apiProcess = null;

function startBackendServer() {
  const serverScript = path.join(__dirname, '..', 'server', 'index.ts');
  apiProcess = spawn(process.execPath, ['--import', 'tsx', serverScript], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DEVBENCH_PORT: '4780',
      DEVBENCH_DESKTOP: '1',
    },
    stdio: 'inherit',
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0b1120',
    title: 'DevBench — Windows Software Development Toolkit',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const targetUrl = process.env.DEVBENCH_DEV_URL || 'http://127.0.0.1:4780';
  mainWindow.loadURL(targetUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

ipcMain.handle('devbench:host-info', () => ({
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
}));

app.whenReady().then(() => {
  if (!process.env.DEVBENCH_DEV_URL) {
    startBackendServer();
  }
  setTimeout(createWindow, 600);
});

app.on('window-all-closed', () => {
  if (apiProcess) {
    apiProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
