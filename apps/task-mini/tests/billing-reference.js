'use strict';

process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY = 'task-mini-billing-reference';
process.env.BILLING_TEST_SECRET = 'task-mini-reference-secret';

const crypto = require('crypto');
require('../lib/product');

const { store } = require('../../../packages/core/server/store');
const { createBillingHandler, billingLog } = require('../../../packages/core/server/billing');
const authHandler = require('../api/auth');
const adminHandler = require('../api/admin');

let bad = 0;
const ok = (name, cond) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' FAIL ') + ' ' + name);
};

const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const email = 'billing-reference@example.com';
const mh = sha(email).slice(0,32);
const deviceA = 'billing-device-a';
const deviceB = 'billing-device-b';
const tokenA = 'billing-token-a';
const tokenB = 'billing-token-b';

let ip = 0;
async function call(handler, body, {headers = {}, query} = {}){
  const res = {
    statusCode:0, headers:{}, body:'',
    setHeader(key,value){ this.headers[key] = value; },
    end(value){ this.body = value || ''; }
  };
  const req = {
    method:'POST',
    headers:{'x-forwarded-for':'10.44.0.' + (++ip % 250), ...headers},
    body
  };
  if(query) req.query = query;
  await handler(req,res);
  return {status:res.statusCode, body:res.body ? JSON.parse(res.body) : {}};
}

const authFields = (deviceId, syncToken) => ({email, deviceId, syncToken});
const authStatus = (deviceId, syncToken) => call(authHandler, {
  action:'status', ...authFields(deviceId, syncToken)
});
const admin = (action, extra = {}) => call(adminHandler, {action, ...extra}, {
  headers:{'x-admin-key':process.env.ADMIN_KEY}
});

let checkoutMode = 'paid';
let checkoutSeq = 0;
const referenceWeb = {
  id:'reference_web',
  kind:'external',
  external:true,
  platforms:['web'],
  distributions:['web'],
  async available(){ return true; },
  async checkout({email:buyer, sku}){
    checkoutSeq++;
    if(checkoutMode === 'cancel') throw Object.assign(new Error('checkout_canceled'), {status:409});
    if(checkoutMode === 'fail') throw Object.assign(new Error('provider_failed'), {status:502});
    if(checkoutMode === 'external') return {url:'https://example.invalid/reference-checkout'};
    return {events:[{
      orderId:'reference-checkout-' + checkoutSeq,
      email:buyer,
      sku,
      status:'paid',
      autoRenew:sku === 'plus.month'
    }]};
  },
  async verifyPurchase({sku, proof}){
    if(proof && proof.fail) throw Object.assign(new Error('purchase_verification_failed'), {status:502});
    return {events:[{
      orderId:String(proof && proof.orderId || 'reference-restore-' + sku),
      sku,
      status:'paid',
      autoRenew:sku === 'plus.month'
    }]};
  },
  async verifyWebhook({headers, body}){
    if(String(headers['x-reference-signature'] || '') !== 'ok') return {ok:false};
    return {ok:true, events:Array.isArray(body && body.events) ? body.events : []};
  }
};

const referenceAndroid = {
  id:'reference_android',
  kind:'store',
  platforms:['android'],
  distributions:['google_play'],
  async available(){ return true; },
  async checkout({email:buyer, sku}){
    return {events:[{orderId:'android-' + sku, email:buyer, sku, status:'paid'}]};
  }
};

const referenceOff = {
  id:'reference_off',
  kind:'external',
  platforms:['web'],
  distributions:['web'],
  async available(){ return false; },
  async checkout(){ return {events:[]}; }
};

const billing = createBillingHandler({adapters:[referenceWeb,referenceAndroid,referenceOff]});

async function billingCall(body, extra = {}){
  return call(billing, body, extra);
}

(async()=>{
  const now = new Date().toISOString();
  await store.set('a:' + mh, JSON.stringify({
    email,
    since:now,
    seen:now,
    handle:'@reference',
    locale:'ru',
    sub:null,
    owned:{},
    syncDevices:{
      [deviceA]:{h:sha(tokenA)},
      [deviceB]:{h:sha(tokenB)}
    }
  }));

  const webMethods = await billingCall({
    action:'methods',
    context:{platform:'web', distribution:'web', country:'DE'}
  });
  ok('BillingRouter exposes only available web methods',
    webMethods.status === 200
    && webMethods.body.methods.length === 1
    && webMethods.body.methods[0].id === 'reference_web');

  const androidMethods = await billingCall({
    action:'methods',
    context:{platform:'android', distribution:'google_play', country:'DE'}
  });
  ok('BillingRouter filters by platform/distribution',
    androidMethods.status === 200
    && androidMethods.body.methods.length === 1
    && androidMethods.body.methods[0].id === 'reference_android');

  const paidExport = await billingCall({
    action:'checkout',
    provider:'reference_web',
    sku:'export',
    ...authFields(deviceA,tokenA),
    context:{platform:'web',distribution:'web'}
  });
  ok('successful one-time checkout grants owned entitlement',
    paidExport.status === 200 && paidExport.body.granted === true && paidExport.body.owned.includes('export'));

  const secondAfterExport = await authStatus(deviceB,tokenB);
  ok('second session sees the purchase through normal auth status',
    secondAfterExport.status === 200 && secondAfterExport.body.owned.includes('export'));

  checkoutMode = 'cancel';
  const canceled = await billingCall({
    action:'checkout', provider:'reference_web', sku:'plus.month',
    ...authFields(deviceA,tokenA), context:{platform:'web',distribution:'web'}
  });
  ok('cancelled checkout does not grant the subscription',
    canceled.status === 409 && (await authStatus(deviceA,tokenA)).body.premium === false);

  checkoutMode = 'fail';
  const failed = await billingCall({
    action:'checkout', provider:'reference_web', sku:'plus.month',
    ...authFields(deviceA,tokenA), context:{platform:'web',distribution:'web'}
  });
  ok('provider failure is surfaced without granting access',
    failed.status === 502 && (await authStatus(deviceA,tokenA)).body.premium === false);

  checkoutMode = 'external';
  const external = await billingCall({
    action:'checkout', provider:'reference_web', sku:'plus.month',
    ...authFields(deviceA,tokenA), context:{platform:'web',distribution:'web'}
  });
  ok('external checkout returns a URL and grants nothing before webhook',
    external.status === 200
    && external.body.url === 'https://example.invalid/reference-checkout'
    && (await authStatus(deviceA,tokenA)).body.premium === false);

  const externalOrder = 'reference-external-sub-1';
  const paidWebhookBody = {events:[{
    orderId:externalOrder,
    email,
    sku:'plus.month',
    status:'paid',
    autoRenew:true
  }]};
  const paidWebhook = await billingCall(paidWebhookBody, {
    query:{provider:'reference_web'},
    headers:{'x-reference-signature':'ok'}
  });
  ok('verified external webhook activates subscription',
    paidWebhook.status === 200 && paidWebhook.body.applied === 1);

  const secondPremium = await authStatus(deviceB,tokenB);
  ok('subscription becomes visible on another session/device',
    secondPremium.status === 200 && secondPremium.body.premium === true);

  const duplicateWebhook = await billingCall(paidWebhookBody, {
    query:{provider:'reference_web'},
    headers:{'x-reference-signature':'ok'}
  });
  ok('duplicate webhook is idempotent', duplicateWebhook.status === 200 && duplicateWebhook.body.applied === 0);

  const badSignature = await billingCall(paidWebhookBody, {
    query:{provider:'reference_web'},
    headers:{'x-reference-signature':'bad'}
  });
  ok('unverified webhook is rejected', badSignature.status === 401);

  const refundWebhook = await billingCall({events:[{
    orderId:externalOrder,
    email,
    sku:'plus.month',
    status:'refunded'
  }]}, {
    query:{provider:'reference_web'},
    headers:{'x-reference-signature':'ok'}
  });
  ok('refund revokes the active subscription',
    refundWebhook.status === 200 && (await authStatus(deviceA,tokenA)).body.premium === false);

  const manualRevoke = await admin('user_owned',{email,sku:'export',revoke:true});
  ok('manual Admin revoke removes owned entitlement before restore',
    manualRevoke.status === 200 && !manualRevoke.body.owned.includes('export'));

  const restored = await billingCall({
    action:'restore',
    provider:'reference_web',
    items:[{sku:'export',proof:{orderId:'reference-original-export'}}],
    ...authFields(deviceA,tokenA),
    context:{platform:'web',distribution:'web'}
  });
  ok('restore/reconcile re-grants a verified old purchase',
    restored.status === 200 && restored.body.granted === true
    && restored.body.restored === 1 && restored.body.owned.includes('export'));

  const unknown = await billingCall({
    action:'checkout',
    provider:'reference_web',
    sku:'unknown.reference.sku',
    ...authFields(deviceA,tokenA),
    context:{platform:'web',distribution:'web'}
  });
  ok('unknown product SKU is rejected by Core', unknown.status === 400 && unknown.body.error === 'unknown_sku');

  const expiredOrder = 'reference-expired-sub';
  const expired = await billingCall({events:[{
    orderId:expiredOrder,
    email,
    sku:'plus.month',
    status:'paid',
    until:'2000-01-01',
    autoRenew:false
  }]}, {
    query:{provider:'reference_web'},
    headers:{'x-reference-signature':'ok'}
  });
  const expiredStatus = await authStatus(deviceA,tokenA);
  ok('expired subscription does not produce active Premium',
    expired.status === 200 && expiredStatus.body.premium === false);

  const manualPremium = await admin('user_premium',{email,days:7});
  ok('manual Admin grant activates Premium', manualPremium.status === 200 && !!manualPremium.body.sub);
  const manualPremiumOff = await admin('user_premium',{email,revoke:true});
  ok('manual Admin revoke removes Premium', manualPremiumOff.status === 200 && manualPremiumOff.body.sub === null);

  const journal = await billingLog(500);
  const referenceRows = journal.filter(row => ['reference_web','admin'].includes(row.provider));
  ok('billing journal contains provider and Admin entitlement transitions',
    referenceRows.some(row => row.provider === 'reference_web' && row.status === 'paid')
    && referenceRows.some(row => row.provider === 'reference_web' && row.status === 'refunded')
    && referenceRows.some(row => row.provider === 'admin' && row.status === 'manual_grant')
    && referenceRows.some(row => row.provider === 'admin' && row.status === 'manual_revoke'));

  const journalText = JSON.stringify(referenceRows);
  ok('billing journal exposes no email or raw order id',
    !journalText.includes(email)
    && !journalText.includes(externalOrder)
    && !journalText.includes('reference-original-export'));

  console.log(bad ? '\nTask Mini billing reference failures: ' + bad : '\nTask Mini billing reference passed');
  process.exit(bad ? 1 : 0);
})().catch(error=>{
  console.error(error);
  process.exit(1);
});
