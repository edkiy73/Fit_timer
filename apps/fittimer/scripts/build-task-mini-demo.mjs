import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const fitRoot = process.cwd();
const repoRoot = path.resolve(fitRoot, '../..');
const appRoot = path.join(repoRoot, 'apps/task-mini');
const out = path.join(fitRoot, 'task-mini');

await rm(out, {recursive:true, force:true});
await mkdir(out, {recursive:true});
await Promise.all([
  cp(path.join(appRoot, 'public/index.html'), path.join(out, 'index.html')),
  cp(path.join(appRoot, 'public/style.css'), path.join(out, 'style.css'))
]);

await build({
  entryPoints: [path.join(appRoot, 'src/ui.ts')],
  outfile: path.join(out, 'app.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  tsconfig: path.join(appRoot, 'tsconfig.json'),
  minify: true,
  legalComments: 'none',
  logLevel: 'warning'
});

console.log('Built Task Mini demo at /task-mini/');
