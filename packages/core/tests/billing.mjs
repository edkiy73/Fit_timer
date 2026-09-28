/* Core billing: provider events → account rights, through the real handlers on the memory store. */
import { createRequire } from 'node:module';

process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY = 'billing-admin';
const require = createRequire(import.meta.url);

let bad = 0;
const ok = (name, cond) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name);
};

const authHandler = require('../template/api/auth');
const adminHandler = require('../template/api/admin');
const { configureProduct, productConfig } = require('../server/product-core');
const { createBillingHandler, createTestBillingAdapter } = require('../server/billing');
const { store } = require('../server/store');
const crypto = require('crypto');
const {createAuthClient, hasEntitlement} = await import('../dist/core/auth.js');
const {createBillingClient} = await import('../dist/core/billing.js');

configureProduct({...productConfig(), products:[
  {sku:'pack.a', title:'Pack A'},
  {sku:'pack.b', title:'Pack B'},
  {sku:'plus.month', title:'Plus', kind:'subscription', days:30}
]});
const testAdapter = createTestBillingAdapter({secret:'s3cret'});
const billingHandler = createBillingHandler({adapters:[testAdapter]});

let ip = 0;
async function call(handler, body, {headers = {}, query} = {}){
  const res = {statusCode:0, headers:{}, body:'', setHeader(k, v){ this.headers[k] = v; }, end(b){ this.body = b || ''; }};
  const req = {method:'POST', headers:{'x-forwarded-for':'10.3.0.' + (++ip % 250), ...headers}, body};
  if(query) req.query = query;
  await handler(req, res);
  return {status:res.statusCode, body:res.body ? JSON.parse(res.body) : {}};
}
const viaFetch = handler => async (_url, init) => {
  const r = await call(handler, JSON.parse(String(init.body)));
  return {ok:r.status >= 200 && r.status < 300, status:r.status, json:async () => r.body};
};
const webhook = (events, signature) => {
  const body = {events};
  return call(billingHandler, body, {query:{provider:'test'}, headers:{'x-billing-signature':signature ?? testAdapter.sign(body)}});
};
const accountOf = async email =>
  JSON.parse(await store.get('a:' + crypto.createHash('sha256').update(email).digest('hex').slice(0, 32)));

const memory = new Map();
const auth = createAuthClient({
  storage:{getItem:k => memory.get(k) ?? null, setItem:(k, v) => { memory.set(k, v); }, removeItem:k => { memory.delete(k); }},
  fetch:viaFetch(authHandler),
  createDeviceId:() => 'device-bill'
});
const billing = createBillingClient({auth, fetch:viaFetch(billingHandler)});
const sent = await auth.sendCode('payer@example.com', 'en');
await auth.verifyCode({email:'payer@example.com', code:String(sent.devCode)});

ok('test provider is offered on the memory store', (await billing.providers()).join() === 'test');

// 1. Checkout through the provider: the right appears at once.
const bought = await billing.checkout('test', 'pack.a');
await auth.status();
ok('checkout grants the purchased SKU', bought.granted && bought.owned.includes('pack.a') && hasEntitlement(await auth.getSession(), 'pack.a'));
ok('checkout rejects a SKU outside the catalog',
  await billing.checkout('test', 'pack.zzz').then(() => false, e => e.code === 'unknown_sku'));
ok('checkout requires a signed-in device',
  (await call(billingHandler, {action:'checkout', provider:'test', sku:'pack.a', email:'payer@example.com', deviceId:'x', syncToken:'y'})).status === 403);

// 2. Webhook: signed, idempotent, refund takes the right back.
const paid = {orderId:'ord-1', email:'payer@example.com', sku:'pack.b', status:'paid'};
ok('signed webhook grants a SKU', (await webhook([paid])).body.applied === 1 && (await accountOf('payer@example.com')).owned['pack.b']);
ok('repeated webhook changes nothing', (await webhook([paid])).body.applied === 0);
ok('wrong signature is rejected', (await webhook([paid], 'bad')).status === 401);
ok('unknown provider is rejected',
  (await call(billingHandler, {events:[paid]}, {query:{provider:'nope'}})).status === 404);
ok('malformed event is answered 400', (await webhook([{...paid, orderId:'ord-x', status:'weird'}])).status === 400);
await webhook([{...paid, status:'refunded'}]);
ok('refund revokes the SKU', !(await accountOf('payer@example.com')).owned['pack.b']);
ok('refund keeps other purchases', !!(await accountOf('payer@example.com')).owned['pack.a']);

// 3. Subscription: paid → cancel renewal keeps paid time → refund ends it.
const sub = {orderId:'sub-1', email:'payer@example.com', sku:'plus.month', status:'paid', autoRenew:true};
await webhook([sub]);
await auth.status();
let session = await auth.getSession();
const days = Math.round((Date.parse(session.sub.until) - Date.now()) / 86400000);
ok('subscription payment turns Premium on for the product period', session.premium && days >= 29 && days <= 30 && session.sub.autoRenew);
await webhook([{...sub, status:'canceled'}]);
await auth.status();
session = await auth.getSession();
ok('cancel stops renewal but keeps paid time', session.premium && session.sub.autoRenew === false);
await webhook([{...sub, status:'refunded'}]);
await auth.status();
ok('refund ends the subscription', (await auth.getSession()).premium === false);

// 4. Purchase before the first sign-in (web checkout) creates the account.
await webhook([{orderId:'ord-new', email:'newbie@example.com', sku:'pack.a', status:'paid'}]);
const newbie = await accountOf('newbie@example.com');
ok('webhook for an unknown address creates the account with the purchase', newbie && newbie.owned['pack.a']);

// 5. Admin journal: events without emails or order ids.
const logRes = await call(adminHandler, {action:'billing_log'}, {headers:{'x-admin-key':process.env.ADMIN_KEY}});
const events = logRes.body.events || [];
ok('admin sees the payment journal, newest first', events.length >= 7 && events[0].at >= events[events.length - 1].at);
ok('journal carries no emails or order ids', !JSON.stringify(events).includes('@') && !JSON.stringify(events).includes('ord-'));

// 6. Production (no memory store): the test provider does not exist.
process.env.ALLOW_MEMORY_STORE = '';
const prodProviders = await call(billingHandler, {action:'providers'});
const prodWebhook = await webhook([{orderId:'ord-prod', email:'payer@example.com', sku:'pack.a', status:'paid'}]);
process.env.ALLOW_MEMORY_STORE = '1';
ok('without the memory store the test provider is not offered', prodProviders.body.providers.length === 0);
ok('without the memory store test webhooks are refused', prodWebhook.status >= 400 && !prodWebhook.body.applied);

console.log(bad ? `\nBilling failures: ${bad}` : '\nBilling behaves correctly');
process.exit(bad ? 1 : 0);
