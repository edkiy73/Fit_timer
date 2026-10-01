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
  ok('UnMute owns settings and learner progress sync docs',
    registry.accepts('account','settings')
    && registry.accepts('account','progress:course:general-foundation')
    && registry.accepts('account','progress:stats:general-foundation')
    && registry.accepts('account','progress:words')
    && !registry.accepts('profile','task:1'));

  const analytics = require('../lib/app-analytics');
  const expectedFunnelEvents = [
    'onboarding_done',
    'lesson_completed',
    'day_completed',
    'paywall_shown.course',
    'paywall_shown.today',
    'paywall_shown.talk',
    'talk_started',
    'purchase_started.course.general-foundation',
    'purchase_completed.course.general-foundation'
  ];
  ok('launch funnel analytics are registered server-side',
    expectedFunnelEvents.every(event => analytics.EVENTS.includes(event)));

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
  // «instant» is on by default (Admin → «Способы оплаты» turns it off); «test» only on the memory store.
  ok('billing endpoint is mounted with the instant and test providers',
    JSON.parse(billingRes.body || '{}').providers.join() === 'instant,test');
  ok('settings and learner progress sync without Premium',
    registry.isFree('account','settings')
    && registry.isFree('account','progress:course:general-foundation')
    && registry.isFree('account','progress:stats:general-foundation')
    && registry.isFree('account','progress:words'));

  const health = require('../api/health');
  const healthRes = fakeRes();
  await health({method:'GET',headers:{},query:{}},healthRes);
  const report = JSON.parse(healthRes.body || '{}');
  ok('generic health endpoint is mounted', Array.isArray(report.probes));

  console.log(bad ? '\nStarter smoke failures: ' + bad : '\nStarter smoke passed');
  process.exit(bad ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
