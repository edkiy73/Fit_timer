'use strict';

const crypto = require('crypto');
const { loadSecrets, secret } = require('../secrets');
const { productConfig } = require('../product-core');

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const clean = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const b64url = value => Buffer.from(value).toString('base64url');

function problem(message, status = 502){
  return Object.assign(new Error(message), {status});
}

function parseServiceAccount(raw){
  if(!raw) return null;
  let text = String(raw).trim();
  if(!text.startsWith('{')){
    try{ text = Buffer.from(text, 'base64').toString('utf8'); }catch(_){}
  }
  try{
    const value = JSON.parse(text);
    if(!value || typeof value !== 'object') return null;
    if(!value.client_email || !value.private_key) return null;
    return {
      clientEmail:String(value.client_email),
      privateKey:String(value.private_key).replace(/\\n/g, '\n'),
      tokenUri:clean(value.token_uri || DEFAULT_TOKEN_URI, 500) || DEFAULT_TOKEN_URI
    };
  }catch(_){
    return null;
  }
}

function rootPackageName(){
  const root = productConfig();
  return clean(root.androidPackageName || root.id, 220);
}

function googleProduct(product){
  const cfg = product && product.billing && product.billing.google;
  const productId = clean(cfg && cfg.productId, 200);
  const packageName = clean((cfg && cfg.packageName) || rootPackageName(), 220);
  if(!/^[A-Za-z0-9._-]{2,220}$/.test(productId)) throw problem('provider_sku_unconfigured', 409);
  if(!/^[A-Za-z0-9._-]{3,220}$/.test(packageName)) throw problem('google_package_unconfigured', 409);
  return {productId, packageName};
}

function catalogProductByGoogleId(productId){
  const root = productConfig();
  const list = Array.isArray(root.products) ? root.products : [];
  const raw = list.find(item => String(item?.billing?.google?.productId || '') === String(productId || ''));
  if(!raw) return null;
  return {
    sku:String(raw.sku || ''),
    title:String(raw.title || raw.sku || ''),
    kind:raw.kind === 'subscription' ? 'subscription' : 'owned',
    days:raw.kind === 'subscription' ? Math.max(1, Math.round(+raw.days || 30)) : 0,
    billing:raw.billing || {}
  };
}

function createAssertion(account, nowSec){
  const header = b64url(JSON.stringify({alg:'RS256', typ:'JWT'}));
  const payload = b64url(JSON.stringify({
    iss:account.clientEmail,
    scope:SCOPE,
    aud:account.tokenUri,
    iat:nowSec,
    exp:nowSec + 3600
  }));
  const signingInput = header + '.' + payload;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), account.privateKey).toString('base64url');
  return signingInput + '.' + signature;
}

function ackPending(value){
  const state = value && value.acknowledgementState;
  return state === 0 || state === 'ACKNOWLEDGEMENT_STATE_PENDING';
}

function accountId(value){
  return String(
    (value && value.obfuscatedExternalAccountId)
    || (value && value.externalAccountIdentifiers && value.externalAccountIdentifiers.obfuscatedExternalAccountId)
    || ''
  );
}

function linkedAccount(value, identity){
  const expected = String(identity && identity.googleObfuscatedAccountId || '');
  const actual = accountId(value);
  if(!expected || !actual || actual !== expected) throw problem('store_account_mismatch', 403);
}

function createGooglePlayBillingAdapter({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  getServiceAccount,
  getAccessToken
} = {}){
  let cachedToken = '';
  let cachedUntil = 0;

  const credentials = typeof getServiceAccount === 'function' ? getServiceAccount : async () => {
    await loadSecrets();
    return parseServiceAccount(
      secret('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')
      || process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64
      || ''
    );
  };

  async function accessToken(){
    if(typeof getAccessToken === 'function') return String(await getAccessToken());
    const current = now();
    if(cachedToken && cachedUntil > current + 60000) return cachedToken;
    const account = await credentials();
    if(!account) throw problem('provider_unconfigured', 503);
    if(typeof fetchImpl !== 'function') throw problem('fetch_unavailable', 503);
    const assertion = createAssertion(account, Math.floor(current / 1000));
    const response = await fetchImpl(account.tokenUri || DEFAULT_TOKEN_URI, {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({
        grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }).toString()
    });
    let payload = {};
    try{ payload = await response.json(); }catch(_){}
    if(!response.ok || !payload.access_token) throw problem('google_auth_failed', 502);
    cachedToken = String(payload.access_token);
    cachedUntil = current + Math.max(300, Number(payload.expires_in) || 3600) * 1000;
    return cachedToken;
  }

  async function request(path, init = {}){
    if(typeof fetchImpl !== 'function') throw problem('fetch_unavailable', 503);
    const token = await accessToken();
    const response = await fetchImpl(API + path, {
      ...init,
      headers:{
        Authorization:'Bearer ' + token,
        ...(init.headers || {})
      }
    });
    let payload = {};
    try{ payload = await response.json(); }catch(_){}
    if(!response.ok){
      const status = response.status === 404 ? 409 : 502;
      throw problem(response.status === 404 ? 'purchase_not_found' : 'google_play_error', status);
    }
    return payload;
  }

  async function acknowledgeOwned(packageName, productId, purchaseToken){
    await request(
      '/applications/' + encodeURIComponent(packageName)
      + '/purchases/products/' + encodeURIComponent(productId)
      + '/tokens/' + encodeURIComponent(purchaseToken) + ':acknowledge',
      {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}
    );
  }

  async function acknowledgeSubscription(packageName, productId, purchaseToken){
    await request(
      '/applications/' + encodeURIComponent(packageName)
      + '/purchases/subscriptions/' + encodeURIComponent(productId)
      + '/tokens/' + encodeURIComponent(purchaseToken) + ':acknowledge',
      {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}
    );
  }

  function subscriptionEvent(purchase, purchaseToken, line, {withAccountRef = false} = {}){
    const state = String(purchase.subscriptionState || '');
    if(state.includes('PENDING')) throw problem('purchase_pending', 409);
    const expiryTime = String(line.expiryTime || '');
    const expiryMs = Date.parse(expiryTime) || 0;
    const activeStates = new Set([
      'SUBSCRIPTION_STATE_ACTIVE',
      'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
      'SUBSCRIPTION_STATE_CANCELED'
    ]);
    const revoked = state === 'SUBSCRIPTION_STATE_EXPIRED'
      || state === 'SUBSCRIPTION_STATE_ON_HOLD'
      || state === 'SUBSCRIPTION_STATE_PAUSED';
    const paid = expiryMs > now() && activeStates.has(state);
    const status = paid ? 'paid' : (revoked ? 'refunded' : 'canceled');
    const autoRenew = !!(line.autoRenewingPlan && line.autoRenewingPlan.autoRenewEnabled);
    const orderId = clean(line.latestSuccessfulOrderId, 160)
      || 'gp-sub-' + crypto.createHash('sha256').update(purchaseToken + '|' + expiryTime).digest('hex').slice(0, 32);
    const event = {orderId, status, until:expiryTime, autoRenew};
    if(withAccountRef){
      const actual = accountId(purchase);
      if(!actual) throw problem('store_account_missing', 409);
      event.accountRef = {kind:'google', value:actual};
    }
    return event;
  }

  function ownedEvent(purchase, purchaseToken, {withAccountRef = false} = {}){
    const state = String(purchase.purchaseStateContext && purchase.purchaseStateContext.purchaseState || '');
    if(state === 'PURCHASE_STATE_PENDING') throw problem('purchase_pending', 409);
    const paid = state === 'PURCHASE_STATE_PURCHASED';
    const event = {
      orderId:clean(purchase.orderId, 160)
        || 'gp-item-' + crypto.createHash('sha256').update(purchaseToken).digest('hex').slice(0, 32),
      status:paid ? 'paid' : 'refunded',
      autoRenew:false
    };
    if(withAccountRef){
      const actual = accountId(purchase);
      if(!actual) throw problem('store_account_missing', 409);
      event.accountRef = {kind:'google', value:actual};
    }
    return event;
  }

  async function subscriptionPurchase(packageName, purchaseToken){
    return request(
      '/applications/' + encodeURIComponent(packageName)
      + '/purchases/subscriptionsv2/tokens/' + encodeURIComponent(purchaseToken),
      {method:'GET'}
    );
  }

  async function ownedPurchase(packageName, purchaseToken){
    return request(
      '/applications/' + encodeURIComponent(packageName)
      + '/purchases/productsv2/tokens/' + encodeURIComponent(purchaseToken),
      {method:'GET'}
    );
  }

  return {
    id:'google_play',
    kind:'store',
    external:false,
    platforms:['android'],
    distributions:['google_play'],

    async available(){
      return !!(await credentials());
    },

    async purchaseContext({product, identity}){
      const {productId} = googleProduct(product);
      const obfuscatedAccountId = String(identity && identity.googleObfuscatedAccountId || '');
      if(!obfuscatedAccountId) throw problem('billing_identity_failed', 409);
      return {productId, obfuscatedAccountId};
    },

    async verifyPurchase({product, proof, identity}){
      const purchaseToken = clean(proof && proof.purchaseToken, 4096);
      if(!purchaseToken) throw problem('purchase_token_missing', 400);
      const {productId, packageName} = googleProduct(product);

      if(product && product.kind === 'subscription'){
        const purchase = await subscriptionPurchase(packageName, purchaseToken);
        linkedAccount(purchase, identity);
        const lineItems = Array.isArray(purchase.lineItems) ? purchase.lineItems : [];
        const line = lineItems.find(item => String(item && item.productId || '') === productId);
        if(!line) throw problem('store_product_mismatch', 409);
        const event = subscriptionEvent(purchase, purchaseToken, line);
        if(event.status === 'paid' && ackPending(purchase)) await acknowledgeSubscription(packageName, productId, purchaseToken);
        return {events:[event]};
      }

      const purchase = await ownedPurchase(packageName, purchaseToken);
      linkedAccount(purchase, identity);
      const items = Array.isArray(purchase.productLineItem) ? purchase.productLineItem : [];
      if(!items.some(item => String(item && item.productId || '') === productId)){
        throw problem('store_product_mismatch', 409);
      }
      const event = ownedEvent(purchase, purchaseToken);
      if(event.status === 'paid' && ackPending(purchase)) await acknowledgeOwned(packageName, productId, purchaseToken);
      return {events:[event]};
    },

    async verifyWebhook({body}){
      const encoded = body && body.message && body.message.data;
      if(!encoded) return {ok:false};
      let notification;
      try{ notification = JSON.parse(Buffer.from(String(encoded), 'base64').toString('utf8')); }
      catch(_){ return {ok:false}; }

      const packageName = rootPackageName();
      if(!packageName) return {ok:false};
      if(notification.packageName && String(notification.packageName) !== packageName) return {ok:false};

      const sub = notification.subscriptionNotification;
      if(sub && sub.purchaseToken){
        const purchaseToken = clean(sub.purchaseToken, 4096);
        const purchase = await subscriptionPurchase(packageName, purchaseToken);
        const lines = Array.isArray(purchase.lineItems) ? purchase.lineItems : [];
        const candidates = lines
          .map(line => ({line, product:catalogProductByGoogleId(line && line.productId)}))
          .filter(item => item.product)
          .sort((a,b) => (Date.parse(String(b.line.expiryTime || '')) || 0) - (Date.parse(String(a.line.expiryTime || '')) || 0));
        const selected = candidates[0];
        if(!selected) return {ok:true, events:[]};
        const mapped = googleProduct(selected.product);
        const event = subscriptionEvent(purchase, purchaseToken, selected.line, {withAccountRef:true});
        if(event.status === 'paid' && ackPending(purchase)) await acknowledgeSubscription(packageName, mapped.productId, purchaseToken);
        return {ok:true, events:[{sku:selected.product.sku, ...event}]};
      }

      const one = notification.oneTimeProductNotification;
      if(one && one.purchaseToken){
        const purchaseToken = clean(one.purchaseToken, 4096);
        const purchase = await ownedPurchase(packageName, purchaseToken);
        const lines = Array.isArray(purchase.productLineItem) ? purchase.productLineItem : [];
        const selected = lines
          .map(line => ({line, product:catalogProductByGoogleId(line && line.productId)}))
          .find(item => item.product);
        if(!selected) return {ok:true, events:[]};
        const mapped = googleProduct(selected.product);
        const event = ownedEvent(purchase, purchaseToken, {withAccountRef:true});
        if(event.status === 'paid' && ackPending(purchase)) await acknowledgeOwned(packageName, mapped.productId, purchaseToken);
        return {ok:true, events:[{sku:selected.product.sku, ...event}]};
      }

      // Voided purchases and test notifications don't carry a purchase token here.
      return {ok:true, events:[]};
    }
  };
}

module.exports = {
  createGooglePlayBillingAdapter,
  parseServiceAccount,
  createAssertion
};
