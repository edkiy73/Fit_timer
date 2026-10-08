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
const { createBillingHandler, createInstantBillingAdapter, createTestBillingAdapter } = require('../server/billing');
const { store } = require('../server/store');
const { setSecret } = require('../server/secrets');
const crypto = require('crypto');
const {createAuthClient, hasEntitlement} = await import('../dist/core/auth.js');
const {createBillingClient} = await import('../dist/core/billing.js');

configureProduct({...productConfig(), skuPatterns:['course.*','bundle.course.*'],
  bundles:[{pattern:'bundle.course.*', includes:['course.*','plus.year']}], products:[
  {sku:'pack.a', title:'Pack A', billing:{stripe:{priceId:'price_pack_a'}}},
  {sku:'pack.b', title:'Pack B'},
  {sku:'pack.restore.a', title:'Restore A'},
  {sku:'pack.restore.b', title:'Restore B'},
  {sku:'plus.month', title:'Plus', kind:'subscription', days:30},
  {sku:'plus.year', title:'Plus year', kind:'subscription', days:365}
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
const testMethods = await billing.methods({platform:'web', distribution:'web', country:'DE'});
ok('new billing API returns normalized methods', testMethods.length === 1 && testMethods[0].id === 'test' && testMethods[0].kind === 'test' && testMethods[0].external === false);

const routeAdapters = [
  {id:'google', kind:'store', platforms:['android'], distributions:['google_play'], verifyPurchase:async()=>({events:[]})},
  {id:'apple', kind:'store', platforms:['ios'], distributions:['app_store'], verifyPurchase:async()=>({events:[]})},
  {id:'stripe', kind:'external', external:true, platforms:['web'], distributions:['web','direct'], checkout:async()=>({url:'https://example.test'})},
  {id:'yookassa', kind:'external', external:true, countries:['RU'], checkout:async()=>({url:'https://example.test'})}
];
const routeHandler = createBillingHandler({adapters:routeAdapters});
const routeBilling = createBillingClient({auth, fetch:viaFetch(routeHandler)});
ok('BillingRouter keeps Google Play on Google Play Android',
  (await routeBilling.methods({platform:'android', distribution:'google_play', country:'DE'})).map(x=>x.id).join() === 'google');
ok('BillingRouter keeps App Store on App Store iOS',
  (await routeBilling.methods({platform:'ios', distribution:'app_store', country:'US'})).map(x=>x.id).join() === 'apple');
ok('BillingRouter offers external web checkout on web',
  (await routeBilling.methods({platform:'web', distribution:'web', country:'DE'})).map(x=>x.id).join() === 'stripe');
ok('BillingClient supplies safe web/web context by default',
  (await routeBilling.methods()).map(x=>x.id).join() === 'stripe');
{
  const previousCapacitor = globalThis.Capacitor;
  globalThis.Capacitor = {getPlatform:() => 'android'};
  ok('native runtime without a known distribution does not guess a store',
    (await routeBilling.methods()).length === 0);
  if(previousCapacitor === undefined) delete globalThis.Capacitor;
  else globalThis.Capacitor = previousCapacitor;
}
ok('BillingRouter applies country restrictions centrally',
  (await routeBilling.methods({platform:'android', distribution:'direct', country:'RU'})).map(x=>x.id).join() === 'yookassa');
const webhookOnlyHandler = createBillingHandler({adapters:[{
  id:'restricted',
  kind:'external',
  countries:['RU'],
  async available(){ return true; },
  async verifyWebhook(){ return {ok:true, events:[]}; }
}]});
ok('webhook intake does not depend on client country/platform context',
  (await call(webhookOnlyHandler, {events:[]}, {query:{provider:'restricted'}})).status === 200);

// Native-store flow: Core issues an opaque account link, then grants only after server verification.
let verifiedNativeProof = null;
const nativeStoreAdapter = {
  id:'google_native',
  kind:'store',
  platforms:['android'],
  distributions:['google_play'],
  async purchaseContext({identity}){
    return {productId:'pack_a_store', obfuscatedAccountId:identity.googleObfuscatedAccountId};
  },
  async verifyPurchase({proof, identity}){
    verifiedNativeProof = {proof, identity};
    const token = String(proof && proof.purchaseToken || '');
    if(!token) throw Object.assign(new Error('purchase_token_missing'), {status:400});
    return {events:[{orderId:'native-' + token, status:'paid', autoRenew:false}]};
  }
};
const nativeStoreHandler = createBillingHandler({adapters:[nativeStoreAdapter]});
const nativeBilling = createBillingClient({
  auth,
  fetch:viaFetch(nativeStoreHandler),
  context:{platform:'android', distribution:'google_play', country:'DE'}
});
const nativeContext = await nativeBilling.purchaseContext('google_native', 'pack.b');
ok('native purchase context returns provider SKU and opaque account link',
  nativeContext.productId === 'pack_a_store'
  && typeof nativeContext.obfuscatedAccountId === 'string'
  && nativeContext.obfuscatedAccountId.length >= 16);
const nativeBuy = await nativeBilling.verifyPurchase('google_native', 'pack.b', {purchaseToken:'device-token'});
ok('native proof reaches only the server verifier',
  verifiedNativeProof?.proof?.purchaseToken === 'device-token'
  && verifiedNativeProof?.identity?.googleObfuscatedAccountId === nativeContext.obfuscatedAccountId);
ok('verified native purchase grants through the canonical entitlement path',
  nativeBuy.granted && nativeBuy.owned.includes('pack.b'));
const nativeAccount = await accountOf('payer@example.com');
ok('native billing identity is persisted on the account',
  nativeAccount.billingIdentity?.googleObfuscatedAccountId === nativeContext.obfuscatedAccountId
  && /^[0-9a-f-]{36}$/i.test(nativeAccount.billingIdentity?.appleAppAccountToken || ''));
{
  const mh = crypto.createHash('sha256').update('payer@example.com').digest('hex').slice(0, 32);
  const appleIndex = await store.get('billid:apple:' + crypto.createHash('sha256')
    .update(nativeAccount.billingIdentity.appleAppAccountToken).digest('hex').slice(0, 40));
  const googleIndex = await store.get('billid:google:' + crypto.createHash('sha256')
    .update(nativeAccount.billingIdentity.googleObfuscatedAccountId).digest('hex').slice(0, 40));
  ok('native billing identities have reverse indexes for server notifications',
    appleIndex === mh && googleIndex === mh);
}
ok('native purchase verification still requires a signed-in device',
  (await call(nativeStoreHandler, {
    action:'verify_purchase', provider:'google_native', sku:'pack.b', proof:{purchaseToken:'x'},
    email:'payer@example.com', deviceId:'x', syncToken:'y',
    context:{platform:'android', distribution:'google_play'}
  })).status === 403);

const restoredNative = await nativeBilling.restorePurchases('google_native', [
  {sku:'pack.restore.a', proof:{purchaseToken:'restore-a'}},
  {sku:'pack.restore.b', proof:{purchaseToken:'restore-b'}},
  {sku:'pack.zzz', proof:{purchaseToken:'unknown'}}
]);
ok('restore re-verifies every valid native purchase on the server',
  restoredNative.checked === 2
  && restoredNative.restored === 2
  && restoredNative.granted === true);
ok('restore reports bad catalog items without discarding valid purchases',
  restoredNative.errors.length === 1
  && restoredNative.errors[0].sku === 'pack.zzz'
  && restoredNative.errors[0].error === 'unknown_sku');
ok('restore returns the fresh canonical entitlements',
  restoredNative.owned.includes('pack.restore.a')
  && restoredNative.owned.includes('pack.restore.b')
  && restoredNative.entitlements.some(x => x.key === 'pack.restore.a' && x.kind === 'owned' && x.active));
const repeatedRestore = await nativeBilling.restorePurchases('google_native', [
  {sku:'pack.restore.a', proof:{purchaseToken:'restore-a'}},
  {sku:'pack.restore.b', proof:{purchaseToken:'restore-b'}}
]);
ok('repeating the same restore is idempotent',
  repeatedRestore.checked === 2 && repeatedRestore.restored === 0 && repeatedRestore.granted === false);
ok('restore still requires a signed-in device',
  (await call(nativeStoreHandler, {
    action:'restore', provider:'google_native',
    items:[{sku:'pack.restore.a', proof:{purchaseToken:'restore-x'}}],
    email:'payer@example.com', deviceId:'x', syncToken:'y',
    context:{platform:'android', distribution:'google_play'}
  })).status === 403);

// 1. Checkout through the provider: the right appears at once.
const bought = await billing.checkout('test', 'pack.a');
await auth.status();
ok('checkout grants the purchased SKU', bought.granted && bought.owned.includes('pack.a') && hasEntitlement(await auth.getSession(), 'pack.a'));
ok('checkout returns canonical provider-neutral entitlement records',
  bought.entitlements.some(x => x.key === 'pack.a' && x.kind === 'owned' && x.active && x.provider === 'test'));
ok('checkout rejects a SKU outside the catalog',
  await billing.checkout('test', 'pack.zzz').then(() => false, e => e.code === 'unknown_sku'));
ok('a SKU matching skuPatterns (a course published from Admin) can be bought',
  (await billing.checkout('test', 'course.b1-b2')).owned.includes('course.b1-b2'));
ok('a pattern does not open other SKUs',
  await billing.checkout('test', 'coursex').then(() => false, e => e.code === 'unknown_sku'));
ok('checkout requires a signed-in device',
  (await call(billingHandler, {action:'checkout', provider:'test', sku:'pack.a', email:'payer@example.com', deviceId:'x', syncToken:'y'})).status === 403);

// 1b. A bundle: one purchase grants the course and a year of the subscription; refund takes both.
const bundleBuy = await billing.checkout('test', 'bundle.course.c1');
await auth.status();
const afterBundle = await accountOf('payer@example.com');
ok('a bundle grants every SKU it includes', bundleBuy.granted && afterBundle.owned['course.c1'] && afterBundle.sub && afterBundle.sub.plan === 'plus.year');
ok('a bundle never grants its own SKU as a purchase', !afterBundle.owned['bundle.course.c1']);
const bundleOrder = {orderId:'bundle-ord', email:'payer@example.com', sku:'bundle.course.c2', status:'paid'};
ok('a bundle by webhook applies once', (await webhook([bundleOrder])).body.applied === 1 && (await webhook([bundleOrder])).body.applied === 0);
await webhook([{...bundleOrder, status:'refunded'}]);
const refundedBundle = await accountOf('payer@example.com');
ok('refunding a bundle takes back each part', !refundedBundle.owned['course.c2'] && !(refundedBundle.sub && refundedBundle.sub.orderId === 'bundle-ord|plus.year'));

// 1c. Automatic renewal: on by default for a granted subscription, the learner can switch it.
const plusBuy = await billing.checkout('test', 'plus.month');
ok('a granted subscription renews automatically by default', plusBuy.granted && (await accountOf('payer@example.com')).sub.autoRenew === true);
ok('subscription checkout returns the same canonical entitlement shape',
  plusBuy.entitlements.some(x => x.key === 'plus.month' && x.kind === 'subscription' && x.active && x.autoRenew && x.provider === 'test'));
const off = await billing.setRenewal(false);
const afterOff = await accountOf('payer@example.com');
ok('the learner turns renewal off and the paid period stays', off.autoRenew === false && afterOff.sub.autoRenew === false && afterOff.sub.plan === 'plus.month' && !!afterOff.sub.until);
ok('and turns it back on', (await billing.setRenewal(true)).autoRenew === true && (await accountOf('payer@example.com')).sub.autoRenew === true);
ok('renewal needs a signed-in device',
  (await call(billingHandler, {action:'renewal', autoRenew:false, email:'payer@example.com', deviceId:'x', syncToken:'y'})).status === 403);
{ // the later subscription checks start without an active subscription
  const key = 'a:' + crypto.createHash('sha256').update('payer@example.com').digest('hex').slice(0, 32);
  const acc = JSON.parse(await store.get(key)); acc.sub = null; await store.set(key, JSON.stringify(acc));
}
ok('without an active subscription there is nothing to switch',
  await billing.setRenewal(false).then(() => false, e => e.code === 'no_active_subscription'));

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

// 5. Admin billing readiness + journal.
const billingBefore = await call(adminHandler, {action:'billing_status'}, {headers:{'x-admin-key':process.env.ADMIN_KEY}});
const stripeBefore = (billingBefore.body.providers || []).find(x => x.id === 'stripe');
ok('admin billing readiness sees mapped products but missing provider secrets',
  billingBefore.status === 200 && stripeBefore?.state === 'not_configured' && stripeBefore?.mappedProducts === 1);
await setSecret('STRIPE_SECRET_KEY', 'sk_test_admin_ready');
await setSecret('STRIPE_WEBHOOK_SECRET', 'whsec_admin_ready');
await setSecret('YOOKASSA_SHOP_ID', 'shop-admin-ready');
await setSecret('YOOKASSA_SECRET_KEY', 'yoo-admin-ready');
const billingReady = await call(adminHandler, {action:'billing_status'}, {headers:{'x-admin-key':process.env.ADMIN_KEY}});
const stripeReady = (billingReady.body.providers || []).find(x => x.id === 'stripe');
const yooNeedsMap = (billingReady.body.providers || []).find(x => x.id === 'yookassa');
ok('admin billing readiness requires both credentials and a product mapping',
  stripeReady?.state === 'ready' && yooNeedsMap?.state === 'mapping_missing');
ok('admin billing status exposes only safe SKU mapping metadata',
  billingReady.body.products?.some(x => x.sku === 'pack.a' && x.mappings?.stripe?.priceId === 'price_pack_a')
  && !JSON.stringify(billingReady.body).includes('sk_test_admin_ready')
  && !JSON.stringify(billingReady.body).includes('whsec_admin_ready'));

const mappedSave = await call(adminHandler, {
  action:'billing_mapping_set',
  sku:'course.admin-map',
  provider:'stripe',
  mapping:{priceId:'price_admin_live'}
}, {headers:{'x-admin-key':process.env.ADMIN_KEY}});
ok('admin can persist a provider mapping for a concrete SKU allowed by skuPatterns',
  mappedSave.status === 200
  && mappedSave.body.products?.some(x => x.sku === 'course.admin-map' && x.mappings?.stripe?.priceId === 'price_admin_live'));

let mappedCheckoutProduct = null;
const mappedAdapter = {
  id:'mapped',
  kind:'external',
  platforms:['web'],
  distributions:['web'],
  async checkout({email, sku, product}){
    mappedCheckoutProduct = product;
    return {events:[{orderId:'mapped-order-1', email, sku, status:'paid'}]};
  }
};
const mappedHandler = createBillingHandler({adapters:[mappedAdapter]});
const mappedBilling = createBillingClient({auth, fetch:viaFetch(mappedHandler), context:{platform:'web', distribution:'web'}});
const mappedBuy = await mappedBilling.checkout('mapped', 'course.admin-map');
ok('next checkout uses the Admin mapping overlay without restart',
  mappedBuy.granted
  && mappedCheckoutProduct?.billing?.stripe?.priceId === 'price_admin_live');

const badMapping = await call(adminHandler, {
  action:'billing_mapping_set',
  sku:'course.admin-map',
  provider:'stripe',
  mapping:{priceId:'not-a-stripe-price'}
}, {headers:{'x-admin-key':process.env.ADMIN_KEY}});
ok('malformed Admin mapping is rejected instead of silently clearing a valid one',
  badMapping.status === 400 && badMapping.body.error === 'bad_mapping');
const mappedAfterBad = await call(adminHandler, {action:'billing_status'}, {headers:{'x-admin-key':process.env.ADMIN_KEY}});
ok('rejected mapping leaves the previous valid mapping intact',
  mappedAfterBad.body.products?.some(x => x.sku === 'course.admin-map' && x.mappings?.stripe?.priceId === 'price_admin_live'));

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

// 7. «Выдать сразу»: works in production, only while its switch is on.
let instantOn = false;
const instantHandler = createBillingHandler({adapters:[testAdapter, createInstantBillingAdapter({isEnabled:async () => instantOn})]});
const instantBilling = createBillingClient({auth, fetch:viaFetch(instantHandler)});
process.env.ALLOW_MEMORY_STORE = '';
const offList = await instantBilling.providers();
process.env.ALLOW_MEMORY_STORE = '1';
ok('switched off, the instant provider is not offered', !offList.includes('instant'));
ok('switched off, an instant checkout is refused',
  (await call(instantHandler, {action:'checkout', provider:'instant', sku:'pack.b', ...(await auth.authFields())})).status === 404);
instantOn = true;
process.env.ALLOW_MEMORY_STORE = '';
const onList = await instantBilling.providers();
process.env.ALLOW_MEMORY_STORE = '1';
ok('switched on, the instant provider is offered even in production', onList.join() === 'instant');
const instant = await instantBilling.checkout('instant', 'pack.b');
ok('instant checkout grants the SKU at once', instant.granted && instant.owned.includes('pack.b'));

// 8. Buying Plus again while it is active adds the period to what is left.
await instantBilling.checkout('instant', 'plus.month');
await auth.status();
const firstUntil = Date.parse((await auth.getSession()).sub.until);
await instantBilling.checkout('instant', 'plus.month');
await auth.status();
const secondUntil = Date.parse((await auth.getSession()).sub.until);
const added = Math.round((secondUntil - firstUntil) / 86400000);
ok('a second month extends the active subscription by 30 days', added === 30);

console.log(bad ? `\nBilling failures: ${bad}` : '\nBilling behaves correctly');
process.exit(bad ? 1 : 0);
