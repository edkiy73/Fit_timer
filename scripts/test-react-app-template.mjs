import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './create-app.mjs';

const required = [
  'package.json','package-lock.json','tsconfig.json','vite.config.mts','vercel.json','index.html',
  'config/product.json','api/auth.js','api/sync.js','api/health.js','api/admin.js',
  'lib/product.js','lib/app-analytics.js','lib/app-sync-schema.js',
  'api/billing.js',
  'src/main.tsx','src/app.tsx','src/auth.ts','src/admin.ts','src/sync.ts','src/billing.ts','src/theme.ts','src/observability.ts','src/styles.css','src/app.test.tsx','src/test-setup.ts',
  'src/i18n/index.ts','src/i18n/ru.ts','src/i18n/en.ts',
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
  assert.deepEqual(product.i18n, {locales:['en'], default:'en'}, 'one locale by default: no language switch');
  assert.equal(product.auth.askHandle, true);
  assert.deepEqual(product.products, []);

  const pkg = JSON.parse(await readFile(path.join(target,'package.json'),'utf8'));
  const lock = JSON.parse(await readFile(path.join(target,'package-lock.json'),'utf8'));
  assert.equal(pkg.name, 'demo-app');
  assert.equal(lock.name, 'demo-app');
  assert.equal(lock.packages[''].name, 'demo-app');

  const app = await readFile(path.join(target,'src/app.tsx'),'utf8');
  assert.match(app, /AuthProvider/);
  assert.match(app, /SignInForm/);
  assert.match(app, /askHandle=\{ASK_HANDLE\}/);
  assert.match(app, /I18nProvider/);
  assert.match(app, /LanguagePicker/);
  assert.match(app, /AdminPanel/);
  assert.match(app, /path:'\/admin'/);
  assert.match(app, /appDocs\.detach\(\)/);
  for(const file of required){
    const text = await readFile(path.join(target, file), 'utf8');
    assert.doesNotMatch(text, /__APP_[A-Z]+__/, 'unreplaced token in ' + file);
  }

  const main = await readFile(path.join(target,'src/main.tsx'),'utf8');
  assert.match(main, /AppErrorBoundary/);

  const observability = await readFile(path.join(target,'src/observability.ts'),'utf8');
  assert.match(observability, /createClient/);
  assert.match(observability, /client_error|capture/);

  const sync = await readFile(path.join(target,'src/sync.ts'),'utf8');
  assert.match(sync, /createSyncClient/);
  assert.match(sync, /createDocumentSync/);
  assert.match(sync, /startAutoSync/);
  assert.match(sync, /demo-app\/kv/);

  const mainSource = await readFile(path.join(target,'src/main.tsx'),'utf8');
  assert.match(mainSource, /startAppSync\(\)/);

  const billing = await readFile(path.join(target,'api/billing.js'),'utf8');
  assert.match(billing, /createBillingHandler/);
  assert.match(billing, /createTestBillingAdapter/);

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
