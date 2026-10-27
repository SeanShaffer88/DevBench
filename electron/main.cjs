/**
 * DevBench Windows Desktop Shell (Electron Main Process)
 * Starts the bundled local adapter server on loopback and opens a Per-Monitor DPI-aware window.
 */
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

let mainWindow = null;
let apiProcess = null;

function startBackendServer() {
  const appRoot = path.join(__dirname, '..');
  const bundledServer = path.join(appRoot, 'dist-server', 'index.mjs');
  const devServer = path.join(appRoot, 'server', 'index.ts');

  const useBundled = fs.existsSync(bundledServer);
  const args = useBundled ? [bundledServer] : ['--import', 'tsx', devServer];

  apiProcess = spawn(process.execPath, args, {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      DEVBENCH_PORT: '4780',
      DEVBENCH_DESKTOP: '1',
    },
    stdio: 'inherit',
  });
}

function waitForHealth(url, attemptsLeft = 25) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      if (res.statusCode === 200) resolve(true);
      else if (attemptsLeft > 0) setTimeout(() => resolve(waitForHealth(url, attemptsLeft - 1)), 200);
      else resolve(false);
    });
    req.on('error', () => {
      if (attemptsLeft > 0) setTimeout(() => resolve(waitForHealth(url, attemptsLeft - 1)), 200);
      else resolve(false);
    });
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

app.whenReady().then(async () => {
  if (!process.env.DEVBENCH_DEV_URL) {
    startBackendServer();
    await waitForHealth('http://127.0.0.1:4780/api/health');
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (apiProcess) {
    apiProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
