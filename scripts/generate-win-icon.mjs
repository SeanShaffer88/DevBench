import fs from 'node:fs';
import path from 'node:path';
import { generateMultiSizeIco, generateWin32ResourceRc } from '../server/services/icoResourceService.ts';

const outDir = path.resolve(process.cwd(), 'windows');
fs.mkdirSync(outDir, { recursive: true });

const icoBuffer = generateMultiSizeIco('#0284c7', [16, 32, 48, 256]);
const icoPath = path.join(outDir, 'DevBench.ico');
fs.writeFileSync(icoPath, icoBuffer);

const rcText = generateWin32ResourceRc({
  productName: 'DevBench',
  companyName: 'DevBench Contributors',
  fileDescription: 'DevBench — Modular Windows Software Development Toolkit',
  version: '1.4.0.0',
  icoFilename: 'DevBench.ico',
});
fs.writeFileSync(path.join(outDir, 'DevBench.rc'), rcText, 'utf8');

console.log(`[DevBench] Generated ${icoPath} (${icoBuffer.length} bytes) and windows/DevBench.rc`);
