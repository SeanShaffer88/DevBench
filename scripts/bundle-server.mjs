import { build } from 'esbuild';
import path from 'node:path';

const outfile = path.resolve(process.cwd(), 'dist-server', 'index.mjs');

await build({
  entryPoints: [path.resolve(process.cwd(), 'server', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile,
  sourcemap: false,
  banner: {
    js: "import { createRequire as __devbenchCreateRequire } from 'node:module'; const require = __devbenchCreateRequire(import.meta.url);",
  },
});

console.log(`[DevBench] Bundled standalone production host server -> ${outfile}`);
