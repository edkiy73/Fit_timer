process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY = 'starter-admin-key';
const fs = require('fs');
let bad = 0;
const ok = (name, value) => { if(!value) bad++; console.log((value ? '  ok  ' : ' FAIL ') + name); };

function fakeRes(){
  return {statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k]=v;},end(v){this.body=v||'';}};
}

(async () => {
  require('../lib/product');
  const { productIdentity } = require('../../../packages/core/server/product-core');
  const { registry } = require('../lib/app-sync-schema');
  const product = require('../config/product.json');
  ok('UnMute does not ask for a handle at sign-in (owner decision)', product.auth && product.auth.askHandle === false);
  ok('UnMute capabilities: premium, AI, notifications, voice; no profiles',
    product.features.premium && product.features.ai && product.features.notifications && product.features.voice && !product.features.profiles);
  ok('product identity is registered', productIdentity().name === 'UnMute: English for Expats');
  ok('starter owns only neutral account sync doc', registry.accepts('account','settings') && !registry.accepts('profile','task:1'));

  const app = fs.readFileSync(require('path').join(__dirname,'../src/app.tsx'),'utf8');
  ok('shared auth UI is wired (optional sign-in)', app.includes('@appbase/ui-react/auth.js') && app.includes('AuthProvider'));
  ok('interface language is wired', app.includes('@appbase/ui-react/i18n.js'));

  const auth = require('../api/auth');
  const res = fakeRes();
  await auth({method:'POST',headers:{},body:{action:'unknown'}},res);
  ok('generic auth endpoint is mounted', res.statusCode >= 400);

  const admin = require('../api/admin');
  const adminRes = fakeRes();
  await admin({method:'POST',headers:{'x-admin-key':'wrong'},body:{action:'users_list'}},adminRes);
  ok('generic admin endpoint is mounted and protected', adminRes.statusCode === 403);

  const billing = require('../api/billing');
  const billingRes = fakeRes();
  await billing({method:'POST',headers:{},body:{action:'providers'}},billingRes);
  ok('billing endpoint is mounted (test provider only on the memory store)',
    JSON.parse(billingRes.body || '{}').providers.join() === 'test');
  ok('synced settings are a free account document', registry.isFree('account','settings'));

  const health = require('../api/health');
  const healthRes = fakeRes();
  await health({method:'GET',headers:{},query:{}},healthRes);
  const report = JSON.parse(healthRes.body || '{}');
  ok('generic health endpoint is mounted', Array.isArray(report.probes));

  console.log(bad ? '\nStarter smoke failures: ' + bad : '\nStarter smoke passed');
  process.exit(bad ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
