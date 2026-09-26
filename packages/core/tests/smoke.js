/* AppBase Core smoke test on the neutral template composition (template/). */
process.env.ALLOW_MEMORY_STORE = '1';
let bad = 0;
const ok = (name, cond) => { if(!cond) bad++; console.log((cond ? '  ok  ' : ' FAIL ') + ' ' + name); };

function fakeRes(){
  return {statusCode:0, headers:{}, body:'', setHeader(k, v){ this.headers[k] = v; }, end(b){ this.body = b || ''; }};
}

(async () => {
  const auth = require('../template/api/auth');
  const sync = require('../template/api/sync');
  const admin = require('../template/api/admin');
  const health = require('../template/api/health');
  ok('neutral API composition loads', [auth, sync, admin, health].every(fn => typeof fn === 'function'));

  const { capabilities } = require('../server/capabilities-core');
  ok('capabilities come from the registered product config', capabilities().enabled('ai'));
  const { productIdentity } = require('../server/product-core');
  ok('product identity comes from the registered product config', productIdentity().name === 'AppBase');

  const { registry } = require('../template/lib/app-sync-schema');
  ok('sync registry accepts free account preferences', registry.accepts('account', 'notificationPrefs'));

  const res = fakeRes();
  await sync({method:'POST', headers:{}, body:{}}, res);
  ok('sync rejects unauthenticated requests', res.statusCode === 401);

  const authRes = fakeRes();
  await auth({method:'POST', headers:{}, body:{action:'unknown'}}, authRes);
  ok('auth rejects unknown actions without an email', authRes.statusCode >= 400);

  const healthRes = fakeRes();
  await health({method:'GET', headers:{}, query:{}}, healthRes);
  const report = JSON.parse(healthRes.body || '{}');
  ok('health runs on the memory store without product probes',
    Array.isArray(report.probes) && report.probes.some(p => p.name === 'storage'));

  console.log(bad ? '\nAppBase smoke failures: ' + bad : '\nAppBase smoke test passed');
  process.exit(bad ? 1 : 0);
})();
