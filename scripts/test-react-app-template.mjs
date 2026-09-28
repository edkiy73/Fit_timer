import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './create-app.mjs';

const required = [
  'package.json','package-lock.json','tsconfig.json','vite.config.mts','vercel.json','index.html',
  'config/product.json','api/auth.js','api/sync.js','api/health.js',
  'lib/product.js','lib/app-analytics.js','lib/app-sync-schema.js',
  'src/main.tsx','src/app.tsx','src/auth.ts','src/theme.ts','src/styles.css','src/app.test.tsx','src/test-setup.ts',
  'tests/smoke.js','tests/e2e.mjs'
];

const tmp = await mkdtemp(path.join(os.tmpdir(), 'appbase-starter-'));
const target = path.join(tmp, 'apps', 'demo-app');
try{
  await createApp({
    slug:'demo-app',
    name:'Demo App',
    appId:'com.example.demoapp',
    locale:'en',
    destination:target
  });

  for(const file of required) assert.equal(await readFile(path.join(target,file),'utf8').then(()=>true,()=>false), true, 'missing ' + file);

  const product = JSON.parse(await readFile(path.join(target,'config/product.json'),'utf8'));
  assert.equal(product.id, 'com.example.demoapp');
  assert.equal(product.name, 'Demo App');
  assert.equal(product.slug, 'demo-app');
  assert.equal(product.features.ai, false);
  assert.equal(product.features.premium, false);

  const pkg = JSON.parse(await readFile(path.join(target,'package.json'),'utf8'));
  const lock = JSON.parse(await readFile(path.join(target,'package-lock.json'),'utf8'));
  assert.equal(pkg.name, 'demo-app');
  assert.equal(lock.name, 'demo-app');
  assert.equal(lock.packages[''].name, 'demo-app');

  const app = await readFile(path.join(target,'src/app.tsx'),'utf8');
  assert.match(app, /AuthGate/);
  assert.match(app, /locale="en"/);
  assert.doesNotMatch(app, /__APP_|__READY_|__LOGOUT_/);

  const auth = await readFile(path.join(target,'src/auth.ts'),'utf8');
  assert.match(auth, /@appbase\/core\/auth\.js/);
  assert.match(auth, /demo-app\.auth\.session/);

  const vite = await readFile(path.join(target,'vite.config.mts'),'utf8');
  assert.match(vite, /@appbase\/ui-react/);
  assert.match(vite, /packages\/core/);

  console.log('ok  React app starter generates a clean AppBase app (' + required.length + ' files checked)');
} finally {
  await rm(tmp, {recursive:true, force:true});
}
