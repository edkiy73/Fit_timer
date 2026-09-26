/* Bundle the ES-module entry points (src/main.ts, mobile.js) together with AppBase Core
   (packages/core, resolved through the tsconfig "paths" aliases @appbase/core and
   @appbase/types). Shared Core modules go to a common chunk, so each Core module runs once.

   node scripts/build-esm.mjs [--outdir <dir>]   default: dist/esm (mobile bundle) */
import { build } from 'esbuild';
import path from 'node:path';

const outArg = process.argv.indexOf('--outdir');
const outdir = outArg >= 0 ? process.argv[outArg + 1] : 'dist/esm';

await build({
  entryPoints: {main: 'src/main.ts', mobile: 'mobile.js'},
  outdir,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  tsconfig: 'tsconfig.json',
  chunkNames: 'chunks/[name]-[hash]',
  legalComments: 'none',
  logLevel: 'warning'
});

console.log(`Built ES modules in ${path.relative(process.cwd(), path.resolve(outdir)) || outdir}`);
