import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  const electronBinary = require('electron');
  const child = spawn(electronBinary, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, DEVBENCH_DEV_URL: process.env.DEVBENCH_DEV_URL || 'http://127.0.0.1:5173' },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} catch {
  console.log(
    '[DevBench] Electron binary is optional in web workbench mode.\n' +
      'To launch as a standalone Windows Desktop app, run:\n' +
      '  npm install --save-dev electron electron-builder\n' +
      '  npm run desktop\n' +
      'Or open http://localhost:5173 in Edge / WebView2 after running `npm run dev`.'
  );
}
