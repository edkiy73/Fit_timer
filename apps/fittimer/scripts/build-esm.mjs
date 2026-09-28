/* Bundle the ES-module entry points (src/main.ts, mobile.js) together with AppBase Core
   (packages/core, resolved through the tsconfig "paths" aliases @appbase/core and
   @appbase/types). Shared Core modules go to a common chunk, so each Core module runs once.

   node scripts/build-esm.mjs [--outdir <dir>]   default: dist/esm (mobile bundle) */
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { testBridge, TEST_BRIDGE_FILTER } from './test-bridge.mjs';

const outArg = process.argv.indexOf('--outdir');
const outdir = outArg >= 0 ? process.argv[outArg + 1] : 'dist/esm';
const stampArg = process.argv.indexOf('--stamp-index');
const stampIndex = stampArg >= 0 ? process.argv[stampArg + 1] : '';

function buildId(){
  const envId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
  if(envId) return envId.slice(0, 12);
  try{
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {encoding:'utf8'}).trim();
  }catch(_){
    return 'local-' + Date.now().toString(36);
  }
}
const BUILD_ID = buildId();

await build({
  entryPoints: {main: 'src/main.ts', mobile: 'mobile.js'},
  outdir,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  tsconfig: 'tsconfig.json',
  define: {'__FIT_BUILD_ID__': JSON.stringify(BUILD_ID)},
  chunkNames: 'chunks/[name]-[hash]',
  // Keep non-ASCII text as written: product code reads its own source at runtime
  // (parseKeys() in src/app/60-builder.js) and must see Cyrillic keys, not \\u escapes.
  charset: 'utf8',
  legalComments: 'none',
  plugins: [{
    name: 'fit-test-bridge',
    setup(builder){
      builder.onLoad({filter: TEST_BRIDGE_FILTER}, async args => {
        const source = await readFile(args.path, 'utf8');
        return {contents: source + testBridge(source, args.path), loader: 'js'};
      });
    }
  }],
  logLevel: 'warning'
});

if(stampIndex){
  let html = await readFile(stampIndex, 'utf8');
  const stamp = (asset) => {
    const escaped = asset.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\console.log(`Built ES modules in ${path.relative(process.cwd(), path.resolve(outdir)) || outdir}`);
');
    html = html.replace(new RegExp(escaped + '(?:\\?v=[^"\\s]+)?', 'g'), asset + '?v=' + BUILD_ID);
  };
  stamp('app.config.js');
  stamp('esm/main.js');
  stamp('style.css');
  await writeFile(stampIndex, html, 'utf8');
  console.log(`Stamped ${stampIndex} with build ${BUILD_ID}`);
}

console.log(`Built ES modules in ${path.relative(process.cwd(), path.resolve(outdir)) || outdir} (build ${BUILD_ID})`);
