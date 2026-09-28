/* Account entitlements: server grant/revoke through the Core admin handler, delivery to the
   client through /api/auth status, and the compiled client helpers. */
import { createRequire } from 'node:module';

process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY = 'entitlements-admin';
const require = createRequire(import.meta.url);

let bad = 0;
const ok = (name, cond) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name);
};

const authHandler = require('../template/api/auth');
const adminHandler = require('../template/api/admin');
const { configureProduct, productConfig } = require('../server/product-core');
const E = require('../server/entitlements');
const {createAuthClient, hasEntitlement} = await import('../dist/core/auth.js');

let ip = 0;
async function call(handler, body, headers = {}){
  const res = {statusCode:0, headers:{}, body:'', setHeader(k, v){ this.headers[k] = v; }, end(b){ this.body = b || ''; }};
  await handler({method:'POST', headers:{'x-forwarded-for':'10.2.0.' + (++ip % 250), ...headers}, body}, res);
  return {status:res.statusCode, body:res.body ? JSON.parse(res.body) : {}};
}
const admin = (action, body = {}) => call(adminHandler, {action, ...body}, {'x-admin-key':process.env.ADMIN_KEY});

// Client signs in through the real auth handler.
const memory = new Map();
const auth = createAuthClient({
  storage:{getItem:k => memory.get(k) ?? null, setItem:(k, v) => { memory.set(k, v); }, removeItem:k => { memory.delete(k); }},
  fetch:async (_url, init) => {
    const r = await call(authHandler, JSON.parse(String(init.body)));
    return {ok:r.status >= 200 && r.status < 300, status:r.status, json:async () => r.body};
  },
  createDeviceId:() => 'device-ent'
});
const sent = await auth.sendCode('buyer@example.com', 'en');
const session = await auth.verifyCode({email:'buyer@example.com', code:String(sent.devCode)});
ok('new account owns nothing and has no Premium', session.owned.length === 0 && session.premium === false);

// Admin grants a pack for good.
const granted = await admin('user_owned', {email:'buyer@example.com', sku:'Pack.Grammar'});
ok('admin grants a SKU (normalized to lower case)', granted.status === 200 && granted.body.owned.includes('pack.grammar'));
const again = await admin('user_owned', {email:'buyer@example.com', sku:'pack.grammar'});
ok('granting the same SKU again is idempotent', again.body.owned.length === 1);
ok('bad SKU is rejected', (await admin('user_owned', {email:'buyer@example.com', sku:'bad sku!'})).status === 400);
ok('unknown account is rejected', (await admin('user_owned', {email:'nobody@example.com', sku:'pack.grammar'})).status === 404);

await auth.status();
const refreshed = await auth.getSession();
ok('status delivers owned SKUs to the client session', hasEntitlement(refreshed, 'pack.grammar') && !hasEntitlement(refreshed, 'pack.other'));
ok('client helper tolerates a missing session', !hasEntitlement(null, 'pack.grammar'));

const users = await admin('users_list');
const row = users.body.users.find(u => u.email === 'buyer@example.com');
ok('admin users list shows owned SKUs', row && row.owned.includes('pack.grammar'));

// Premium and owned SKUs are independent.
await admin('user_premium', {email:'buyer@example.com', days:30});
await auth.status();
const both = await auth.getSession();
ok('Premium grant keeps owned SKUs', both.premium === true && hasEntitlement(both, 'pack.grammar'));
await admin('user_premium', {email:'buyer@example.com', revoke:true});
await auth.status();
ok('Premium revoke keeps owned SKUs', (await auth.getSession()).premium === false && hasEntitlement(await auth.getSession(), 'pack.grammar'));

const revoked = await admin('user_owned', {email:'buyer@example.com', sku:'pack.grammar', revoke:true});
await auth.status();
ok('admin revokes a SKU', revoked.body.owned.length === 0 && !hasEntitlement(await auth.getSession(), 'pack.grammar'));

// Product catalog restricts what may be granted.
configureProduct({...productConfig(), products:[{sku:'pack.speech', title:'Живая речь'}, {sku:'BAD SKU'}]});
const catalog = await admin('products_list');
ok('catalog lists valid product SKUs only', catalog.body.products.length === 1 && catalog.body.products[0].title === 'Живая речь');
ok('SKU outside the catalog is rejected', (await admin('user_owned', {email:'buyer@example.com', sku:'pack.grammar'})).body.error === 'unknown_sku');
ok('SKU from the catalog is granted', (await admin('user_owned', {email:'buyer@example.com', sku:'pack.speech'})).body.owned[0] === 'pack.speech');

// Server helpers for product endpoints.
const acc = {sub:{until:'2099-01-01'}, owned:{'pack.a':{since:'x', provider:'store', orderId:'secret'}, 'BAD KEY':{}}};
ok('server helpers read Premium and owned SKUs', E.hasPremium(acc) && E.hasOwned(acc, 'PACK.A') && !E.hasOwned(acc, 'bad key'));
ok('client payload never carries order ids', JSON.stringify(E.entitlementsOf(acc)).indexOf('secret') === -1
  && E.entitlementsOf(acc).owned.join() === 'pack.a');

console.log(bad ? `\nEntitlement failures: ${bad}` : '\nEntitlements behave correctly');
process.exit(bad ? 1 : 0);
