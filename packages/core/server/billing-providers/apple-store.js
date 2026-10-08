'use strict';

const crypto = require('crypto');
const { loadSecrets, secret } = require('../secrets');
const { productConfig } = require('../product-core');

const PROD_API = 'https://api.storekit.apple.com';
const SANDBOX_API = 'https://api.storekit-sandbox.apple.com';
const clean = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const b64url = value => Buffer.from(value).toString('base64url');

function problem(message, status = 502){
  return Object.assign(new Error(message), {status});
}

function rootBundleId(){
  const root = productConfig();
  return clean(root.iosBundleId || root.id, 220);
}

function appleProduct(product){
  const cfg = product && product.billing && product.billing.apple;
  const productId = clean(cfg && cfg.productId, 200);
  const bundleId = clean((cfg && cfg.bundleId) || rootBundleId(), 220);
  if(!/^[A-Za-z0-9._-]{2,220}$/.test(productId)) throw problem('provider_sku_unconfigured', 409);
  if(!/^[A-Za-z0-9._-]{3,220}$/.test(bundleId)) throw problem('apple_bundle_unconfigured', 409);
  return {productId, bundleId};
}

function catalogProductByAppleId(productId){
  const root = productConfig();
  const list = Array.isArray(root.products) ? root.products : [];
  const raw = list.find(item => String(item?.billing?.apple?.productId || '') === String(productId || ''));
  if(!raw) return null;
  return {
    sku:String(raw.sku || ''),
    title:String(raw.title || raw.sku || ''),
    kind:raw.kind === 'subscription' ? 'subscription' : 'owned',
    days:raw.kind === 'subscription' ? Math.max(1, Math.round(+raw.days || 30)) : 0,
    billing:raw.billing || {}
  };
}

function createApiToken({issuerId, keyId, privateKey, bundleId}, nowSec){
  if(!issuerId || !keyId || !privateKey || !bundleId) throw problem('provider_unconfigured', 503);
  const header = b64url(JSON.stringify({alg:'ES256', kid:keyId, typ:'JWT'}));
  const payload = b64url(JSON.stringify({
    iss:issuerId,
    iat:nowSec,
    exp:nowSec + 300,
    aud:'appstoreconnect-v1',
    bid:bundleId
  }));
  const input = header + '.' + payload;
  const signature = crypto.sign('sha256', Buffer.from(input), {
    key:privateKey,
    dsaEncoding:'ieee-p1363'
  }).toString('base64url');
  return input + '.' + signature;
}

function decodeJwsPayload(jws){
  const parts = String(jws || '').split('.');
  if(parts.length !== 3) throw problem('apple_bad_jws', 502);
  try{
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if(!payload || typeof payload !== 'object') throw new Error('bad');
    return payload;
  }catch(_){
    throw problem('apple_bad_jws', 502);
  }
}

function millis(value){
  const number = Number(value);
  if(Number.isFinite(number) && number > 0) return number;
  return Date.parse(String(value || '')) || 0;
}

function createAppleStoreBillingAdapter({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  getCredentials,
  getApiToken
} = {}){
  const credentials = typeof getCredentials === 'function' ? getCredentials : async () => {
    await loadSecrets();
    return {
      issuerId:secret('APPSTORE_ISSUER_ID'),
      keyId:secret('APPSTORE_KEY_ID'),
      privateKey:String(secret('APPSTORE_PRIVATE_KEY') || '').replace(/\\n/g, '\n')
    };
  };

  async function token(bundleId){
    if(typeof getApiToken === 'function') return String(await getApiToken(bundleId));
    const value = await credentials();
    return createApiToken({...value, bundleId}, Math.floor(now() / 1000));
  }

  async function requestPath(path, bundleId, preferredBase = ''){
    if(typeof fetchImpl !== 'function') throw problem('fetch_unavailable', 503);
    const auth = await token(bundleId);
    const bases = preferredBase ? [preferredBase] : [PROD_API, SANDBOX_API];
    for(const [index, base] of bases.entries()){
      const response = await fetchImpl(base + path, {
        method:'GET',
        headers:{Authorization:'Bearer ' + auth}
      });
      let payload = {};
      try{ payload = await response.json(); }catch(_){}
      if(response.ok) return {payload, base};
      if(response.status === 404 && !preferredBase && index === 0) continue;
      if(response.status === 404) throw problem('purchase_not_found', 409);
      if(response.status === 401) throw problem('apple_auth_failed', 502);
      throw problem('apple_store_error', 502);
    }
    throw problem('purchase_not_found', 409);
  }

  async function requestTransaction(transactionId, bundleId){
    const result = await requestPath(
      '/inApps/v1/transactions/' + encodeURIComponent(transactionId),
      bundleId
    );
    if(!result.payload.signedTransactionInfo) throw problem('apple_bad_response', 502);
    return result;
  }

  async function requestSubscriptionStatus(transactionId, bundleId, base){
    return requestPath(
      '/inApps/v1/subscriptions/' + encodeURIComponent(transactionId),
      bundleId,
      base
    );
  }

  function normalize(transaction, {requestedId, productId, bundleId, identity, product, autoRenew}){
    const txId = clean(transaction.transactionId, 200);
    if(!txId || txId !== requestedId) throw problem('store_transaction_mismatch', 409);
    if(String(transaction.bundleId || '') !== bundleId) throw problem('store_bundle_mismatch', 409);
    if(String(transaction.productId || '') !== productId) throw problem('store_product_mismatch', 409);

    const actualAccount = String(transaction.appAccountToken || '');
    if(!actualAccount) throw problem('store_account_missing', 409);
    if(identity){
      const expectedAccount = String(identity.appleAppAccountToken || '');
      if(!expectedAccount || actualAccount.toLowerCase() !== expectedAccount.toLowerCase()){
        throw problem('store_account_mismatch', 403);
      }
    }

    const revoked = millis(transaction.revocationDate) > 0;
    let event;
    if(product && product.kind === 'subscription'){
      const expiryMs = millis(transaction.expiresDate);
      const active = !revoked && expiryMs > now();
      event = {
        orderId:txId,
        status:active ? 'paid' : (revoked ? 'refunded' : 'canceled'),
        until:expiryMs ? new Date(expiryMs).toISOString() : '',
        autoRenew:autoRenew == null ? active : !!autoRenew
      };
    }else{
      event = {orderId:txId, status:revoked ? 'refunded' : 'paid', autoRenew:false};
    }
    if(!identity) event.accountRef = {kind:'apple', value:actualAccount};
    return event;
  }

  function latestSubscriptionItem(statusResponse, originalTransactionId, productId){
    const groups = Array.isArray(statusResponse && statusResponse.data) ? statusResponse.data : [];
    const candidates = [];
    for(const group of groups){
      for(const item of Array.isArray(group && group.lastTransactions) ? group.lastTransactions : []){
        let tx = null;
        try{ tx = decodeJwsPayload(item && item.signedTransactionInfo); }catch(_){}
        if(!tx) continue;
        if(originalTransactionId && String(tx.originalTransactionId || '') !== String(originalTransactionId)) continue;
        if(productId && String(tx.productId || '') !== String(productId)) continue;
        candidates.push({item, tx});
      }
    }
    candidates.sort((a,b) => (millis(b.tx.expiresDate) || millis(b.tx.purchaseDate)) - (millis(a.tx.expiresDate) || millis(a.tx.purchaseDate)));
    return candidates[0] || null;
  }

  async function eventFromServerTransaction(transactionId){
    const bundleId = rootBundleId();
    if(!bundleId) throw problem('apple_bundle_unconfigured', 409);
    const txResponse = await requestTransaction(transactionId, bundleId);
    let transaction = decodeJwsPayload(txResponse.payload.signedTransactionInfo);
    let product = catalogProductByAppleId(transaction.productId);
    if(!product) return null;

    const mapped = appleProduct(product);
    if(product.kind !== 'subscription'){
      return {
        sku:product.sku,
        ...normalize(transaction, {
          requestedId:String(transaction.transactionId),
          productId:mapped.productId,
          bundleId:mapped.bundleId,
          product
        })
      };
    }

    let statusNumber = 0;
    let renewal = null;
    try{
      const statusResponse = await requestSubscriptionStatus(String(transaction.transactionId), mapped.bundleId, txResponse.base);
      const latest = latestSubscriptionItem(
        statusResponse.payload,
        transaction.originalTransactionId,
        transaction.productId
      );
      if(latest){
        transaction = latest.tx;
        statusNumber = Number(latest.item && latest.item.status) || 0;
        if(latest.item && latest.item.signedRenewalInfo){
          try{ renewal = decodeJwsPayload(latest.item.signedRenewalInfo); }catch(_){}
        }
        const latestProduct = catalogProductByAppleId(transaction.productId);
        if(latestProduct) product = latestProduct;
      }
    }catch(_){
      // A transaction lookup is still authoritative; status reconciliation can retry
      // on the next notification/restore if this secondary endpoint is unavailable.
    }

    const latestMapped = appleProduct(product);
    const event = normalize(transaction, {
      requestedId:String(transaction.transactionId),
      productId:latestMapped.productId,
      bundleId:latestMapped.bundleId,
      product,
      autoRenew:renewal ? Number(renewal.autoRenewStatus) === 1 : undefined
    });
    if(statusNumber === 5) event.status = 'refunded';
    else if(statusNumber === 1 || statusNumber === 4) event.status = 'paid';
    else if(statusNumber === 2 || statusNumber === 3) event.status = 'canceled';
    return {sku:product.sku, ...event};
  }

  return {
    id:'apple',
    kind:'store',
    external:false,
    platforms:['ios'],
    distributions:['app_store'],

    async available(){
      const value = await credentials();
      return !!(value && value.issuerId && value.keyId && value.privateKey);
    },

    async purchaseContext({product, identity}){
      const {productId} = appleProduct(product);
      const appAccountToken = String(identity && identity.appleAppAccountToken || '');
      if(!appAccountToken) throw problem('billing_identity_failed', 409);
      return {productId, appAccountToken};
    },

    async verifyPurchase({product, proof, identity}){
      const transactionId = clean(proof && proof.transactionId, 200);
      if(!/^[A-Za-z0-9.-]{1,200}$/.test(transactionId)) throw problem('transaction_id_missing', 400);
      const mapped = appleProduct(product);
      const response = await requestTransaction(transactionId, mapped.bundleId);
      const transaction = decodeJwsPayload(response.payload.signedTransactionInfo);
      return {events:[normalize(transaction, {
        requestedId:transactionId,
        productId:mapped.productId,
        bundleId:mapped.bundleId,
        identity,
        product
      })]};
    },

    async verifyWebhook({body}){
      const signedPayload = body && body.signedPayload;
      if(!signedPayload) return {ok:false};
      let notification;
      try{ notification = decodeJwsPayload(signedPayload); }catch(_){ return {ok:false}; }
      const signedTransaction = notification && notification.data && notification.data.signedTransactionInfo;
      if(!signedTransaction) return {ok:true, events:[]};

      // The webhook JWS is only a lookup hint here. Entitlement data comes from a fresh,
      // authenticated App Store Server API request, so a forged webhook cannot grant access.
      let hint;
      try{ hint = decodeJwsPayload(signedTransaction); }catch(_){ return {ok:false}; }
      const transactionId = clean(hint && hint.transactionId, 200);
      if(!transactionId) return {ok:false};

      const event = await eventFromServerTransaction(transactionId);
      return {ok:true, events:event ? [event] : []};
    }
  };
}

module.exports = {
  createAppleStoreBillingAdapter,
  createApiToken,
  decodeJwsPayload
};
