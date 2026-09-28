process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY = 'task-mini-admin';
const fs = require('fs');

let bad = 0;
const ok = (name, condition) => {
  if(!condition) bad++;
  console.log((condition ? '  ok  ' : ' FAIL ') + ' ' + name);
};

function fakeRes(){
  return {
    statusCode:0,
    headers:{},
    body:'',
    setHeader(key, value){ this.headers[key] = value; },
    end(value){ this.body = value || ''; }
  };
}

(async () => {
  require('../lib/product');
  const { productIdentity } = require('../../../packages/core/server/product-core');
  const { capabilities } = require('../../../packages/core/server/capabilities-core');
  const { registry } = require('../lib/app-sync-schema');

  ok('second app registers its own identity', productIdentity().name === 'Task Mini');
  ok('second app capability config is independent', capabilities().enabled('profiles') && !capabilities().enabled('ai'));
  ok('second app owns task document semantics', registry.accepts('account', 'tasks'));
  ok('task sync is free: no subscription needed for personal data', registry.isFree('account', 'tasks'));
  const { productCatalog } = require('../../../packages/core/server/entitlements');
  ok('paid features are declared as product SKUs', productCatalog().some(item => item.sku === 'export'));
  const read = file => fs.readFileSync(require('path').join(__dirname, '..', file), 'utf8');
  const pkg = JSON.parse(read('package.json'));
  ok('UI is on the ADR default stack', ['react', 'react-router', '@tanstack/react-query', 'zod', 'react-aria-components']
    .every(name => pkg.dependencies && pkg.dependencies[name]) && !!pkg.devDependencies.vite);
  ok('UI persists through Core storage', read('src/tasks/repository.ts').includes("@appbase/core/storage.js"));
  ok('UI theme uses the shared Core token mapping', read('src/theme.ts').includes('themeCssVars'));
  ok('UI uses shared React auth (optional sign-in) and Core auth client',
    read('src/app.tsx').includes('@appbase/ui-react/auth.js')
    && read('src/app.tsx').includes('AuthProvider')
    && read('src/auth.ts').includes('@appbase/core/auth.js'));
  ok('tasks sync through Core local-first document sync',
    read('src/tasks/repository.ts').includes('@appbase/core/document-sync.js')
    && read('src/tasks/sync.ts').includes('startAutoSync'));
  ok('UI uses shared React admin panel and Core admin client',
    read('src/app.tsx').includes('@appbase/ui-react/admin.js')
    && read('src/admin.ts').includes('@appbase/core/admin.js'));
  ok('Core does not need a task-specific sync API', !registry.accepts('profile', 'project:1') && !registry.accepts('account', 'project'));

  const auth = require('../api/auth');
  const authRes = fakeRes();
  await auth({method:'POST', headers:{}, body:{action:'unknown'}}, authRes);
  ok('generic auth handler runs for second app', authRes.statusCode >= 400);

  const admin = require('../api/admin');
  const adminRes = fakeRes();
  await admin({method:'POST', headers:{'x-admin-key':'wrong'}, body:{action:'users_list'}}, adminRes);
  ok('shared admin endpoint is mounted and protected', adminRes.statusCode === 403);

  const billing = require('../api/billing');
  const billingRes = fakeRes();
  await billing({method:'POST', headers:{}, body:{action:'providers'}}, billingRes);
  ok('billing endpoint offers only the test provider on the memory store',
    JSON.parse(billingRes.body || '{}').providers.join() === 'test');

  const health = require('../api/health');
  const healthRes = fakeRes();
  await health({method:'GET', headers:{}, query:{}}, healthRes);
  const report = JSON.parse(healthRes.body || '{}');
  ok('generic health handler runs for second app', Array.isArray(report.probes));

  console.log(bad ? '\nTask Mini smoke failures: ' + bad : '\nTask Mini AppBase smoke passed');
  process.exit(bad ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
