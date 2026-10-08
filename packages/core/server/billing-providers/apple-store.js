'use strict';

const crypto = require('crypto');
const { loadSecrets, secret } = require('../secrets');
const { productConfig } = require('../product-core');
const { billingProductByProviderId } = require('../billing-catalog');

const PROD_API = 'https://api.storekit.apple.com';
const SANDBOX_API = 'https://api.storekit-sandbox.apple.com';
const clean = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const b64url = value => Buffer.from(value).toString('base64url');

function problem(message, status = 502){
  return Object.assign(new Error(message), {status});
}

function appleProduct(product){
  const cfg = product && product.billing && product.billing.apple;
  const root = productConfig();
  const productId = clean(cfg && cfg.productId, 200);
  const bundleId = clean((cfg && cfg.bundleId) || root.iosBundleId || root.id, 220);
  if(!/^[A-Za-z0-9._-]{2,220}$/.test(productId)) throw problem('provider_sku_unconfigured', 409);
  if(!/^[A-Za-z0-9._-]{3,220}$/.test(bundleId)) throw problem('apple_bundle_unconfigured', 409);
  return {productId, bundleId};
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

const APPLE_ROOT_SHA256 = new Set([
  'C2B9B042DD57830E7D117DAC55AC8AE19407D38E41D88F3215BC3A890444A050',
  '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179',
  'B0B1730ECBC7FF4505142C49F1295E6EDA6BCAED7E2C68C5BE91B5A11001F024',
  '0D83B611B648A1A75EB8558400795375CAD92E264ED8E9D7A757C1F5EE2BB22D'
]);
const APPLE_LEAF_OID = Buffer.from('060a2a864886f76364060b01', 'hex');
const APPLE_INTERMEDIATE_OID = Buffer.from('060a2a864886f76364060201', 'hex');

function validAt(cert, at){
  const from = Date.parse(cert.validFrom) || 0;
  const to = Date.parse(cert.validTo) || 0;
  return from <= at && at <= to;
}

function hasOid(cert, oid){
  return Buffer.from(cert.raw).includes(oid);
}

function verifyAndDecodeAppleJws(jws, {nowMs = Date.now()} = {}){
  const parts = String(jws || '').split('.');
  if(parts.length !== 3) throw problem('apple_bad_jws', 502);

  let header, payload;
  try{
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  }catch(_){
    throw problem('apple_bad_jws', 502);
  }
  if(!header || header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3){
    throw problem('apple_bad_certificate_chain', 502);
  }

  let leaf, intermediate, root;
  try{
    leaf = new crypto.X509Certificate(Buffer.from(String(header.x5c[0]), 'base64'));
    intermediate = new crypto.X509Certificate(Buffer.from(String(header.x5c[1]), 'base64'));
    root = new crypto.X509Certificate(Buffer.from(String(header.x5c[2]), 'base64'));
  }catch(_){
    throw problem('apple_bad_certificate_chain', 502);
  }

  const rootFingerprint = String(root.fingerprint256 || '').replace(/:/g, '').toUpperCase();
  const chainOk = APPLE_ROOT_SHA256.has(rootFingerprint)
    && intermediate.ca
    && leaf.issuer === intermediate.subject
    && intermediate.issuer === root.subject
    && leaf.verify(intermediate.publicKey)
    && intermediate.verify(root.publicKey)
    && hasOid(leaf, APPLE_LEAF_OID)
    && hasOid(intermediate, APPLE_INTERMEDIATE_OID)
    && validAt(leaf, nowMs)
    && validAt(intermediate, nowMs)
    && validAt(root, nowMs);
  if(!chainOk) throw problem('apple_bad_certificate_chain', 502);

  const signature = Buffer.from(parts[2], 'base64url');
  const valid = crypto.verify(
    'sha256',
    Buffer.from(parts[0] + '.' + parts[1]),
    {key:leaf.publicKey, dsaEncoding:'ieee-p1363'},
    signature
  );
  if(!valid) throw problem('apple_bad_signature', 502);
  if(!payload || typeof payload !== 'object') throw problem('apple_bad_jws', 502);
  return payload;
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
  getApiToken,
  verifySignedData = verifyAndDecodeAppleJws,
  resolveAppAccountToken
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

  const decodeVerified = async jws => await verifySignedData(jws, {nowMs:now()});
  const decodeIncoming = async jws => {
    try{
      return await decodeVerified(jws);
    }catch(e){
      const code = String((e && e.message) || '');
      if(code.startsWith('apple_bad_')){
        throw Object.assign(new Error(code), {status:401});
      }
      throw e;
    }
  };

  async function productByAppleId(productId){
    return billingProductByProviderId('apple', productId);
  }

  async function requestTransaction(transactionId, bundleId){
    if(typeof fetchImpl !== 'function') throw problem('fetch_unavailable', 503);
    const auth = await token(bundleId);
    const path = '/inApps/v1/transactions/' + encodeURIComponent(transactionId);
    for(const [index, base] of [PROD_API, SANDBOX_API].entries()){
      const response = await fetchImpl(base + path, {
        method:'GET',
        headers:{Authorization:'Bearer ' + auth}
      });
      let payload = {};
      try{ payload = await response.json(); }catch(_){}
      if(response.ok && payload.signedTransactionInfo) return {payload, base};
      if(response.status === 404 && index === 0) continue;
      if(response.status === 404) throw problem('purchase_not_found', 409);
      if(response.status === 401) throw problem('apple_auth_failed', 502);
      throw problem('apple_store_error', 502);
    }
    throw problem('purchase_not_found', 409);
  }

  async function requestSubscriptionStatus(transactionId, bundleId, preferredBase){
    if(typeof fetchImpl !== 'function') throw problem('fetch_unavailable', 503);
    const auth = await token(bundleId);
    const path = '/inApps/v1/subscriptions/' + encodeURIComponent(transactionId);
    const bases = preferredBase === SANDBOX_API ? [SANDBOX_API, PROD_API] : [PROD_API, SANDBOX_API];
    for(const [index, base] of bases.entries()){
      const response = await fetchImpl(base + path, {
        method:'GET',
        headers:{Authorization:'Bearer ' + auth}
      });
      let payload = {};
      try{ payload = await response.json(); }catch(_){}
      if(response.ok && Array.isArray(payload.data)) return payload;
      if(response.status === 404 && index === 0) continue;
      if(response.status === 404) throw problem('subscription_status_not_found', 409);
      if(response.status === 401) throw problem('apple_auth_failed', 502);
      throw problem('apple_store_error', 502);
    }
    throw problem('subscription_status_not_found', 409);
  }

  function normalize(transaction, {requestedId, productId, bundleId, identity, product}){
    const txId = clean(transaction.transactionId, 200);
    if(!txId || txId !== requestedId) throw problem('store_transaction_mismatch', 409);
    if(String(transaction.bundleId || '') !== bundleId) throw problem('store_bundle_mismatch', 409);
    if(String(transaction.productId || '') !== productId) throw problem('store_product_mismatch', 409);

    const expectedAccount = String(identity && identity.appleAppAccountToken || '');
    const actualAccount = String(transaction.appAccountToken || '');
    if(!expectedAccount || !actualAccount || actualAccount.toLowerCase() !== expectedAccount.toLowerCase()){
      throw problem('store_account_mismatch', 403);
    }

    const revoked = millis(transaction.revocationDate) > 0;
    if(product && product.kind === 'subscription'){
      const expiryMs = millis(transaction.expiresDate);
      return {
        orderId:txId,
        status:revoked ? 'refunded' : (expiryMs > now() ? 'paid' : 'canceled'),
        until:expiryMs ? new Date(expiryMs).toISOString() : '',
        autoRenew:false
      };
    }
    return {orderId:txId, status:revoked ? 'refunded' : 'paid', autoRenew:false};
  }

  async function subscriptionEvent(statusPayload, {productId, bundleId, identity}){
    if(statusPayload && statusPayload.bundleId && String(statusPayload.bundleId) !== bundleId){
      throw problem('store_bundle_mismatch', 409);
    }
    const expectedAccount = String(identity && identity.appleAppAccountToken || '').toLowerCase();
    let best = null;
    for(const group of Array.isArray(statusPayload && statusPayload.data) ? statusPayload.data : []){
      for(const item of Array.isArray(group && group.lastTransactions) ? group.lastTransactions : []){
        if(!item || !item.signedTransactionInfo) continue;
        const tx = await decodeVerified(item.signedTransactionInfo);
        if(String(tx.productId || '') !== productId) continue;
        if(String(tx.bundleId || '') !== bundleId) continue;
        if(String(tx.appAccountToken || '').toLowerCase() !== expectedAccount) continue;
        const expiryMs = millis(tx.expiresDate);
        if(!best || expiryMs > best.expiryMs){
          best = {item, tx, expiryMs};
        }
      }
    }
    if(!best) throw problem('subscription_status_not_found', 409);

    const renewal = best.item.signedRenewalInfo ? await decodeVerified(best.item.signedRenewalInfo) : {};
    if(renewal.productId && String(renewal.productId) !== productId){
      throw problem('store_product_mismatch', 409);
    }
    if(renewal.appAccountToken && String(renewal.appAccountToken).toLowerCase() !== expectedAccount){
      throw problem('store_account_mismatch', 403);
    }

    const statusCode = Number(best.item.status) || 0;
    const active = statusCode === 1 || statusCode === 4;
    const refunded = statusCode === 5 || millis(best.tx.revocationDate) > 0;
    return {
      orderId:clean(best.tx.transactionId, 200),
      status:refunded ? 'refunded' : (active ? 'paid' : 'canceled'),
      until:best.expiryMs ? new Date(best.expiryMs).toISOString() : '',
      autoRenew:Number(renewal.autoRenewStatus) === 1
    };
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
      // Never trust JWS sent by the phone. The payload decoded here came from the
      // authenticated App Store Server API response for this exact transaction id.
      const transaction = await decodeVerified(response.payload.signedTransactionInfo);
      const baseEvent = normalize(transaction, {
        requestedId:transactionId,
        productId:mapped.productId,
        bundleId:mapped.bundleId,
        identity,
        product
      });
      if(product && product.kind === 'subscription'){
        const status = await requestSubscriptionStatus(
          String(transaction.originalTransactionId || transactionId),
          mapped.bundleId,
          response.base
        );
        return {events:[await subscriptionEvent(status, {
          productId:mapped.productId,
          bundleId:mapped.bundleId,
          identity
        })]};
      }
      return {events:[baseEvent]};
    },

    async verifyWebhook({body}){
      const signedPayload = String(body && body.signedPayload || '');
      if(!signedPayload) return {ok:false};

      const notification = await decodeIncoming(signedPayload);
      const data = notification && notification.data && typeof notification.data === 'object'
        ? notification.data : {};
      if(!data.signedTransactionInfo) return {ok:true, events:[]};

      // The notification itself and its nested transaction are both Apple-signed.
      // We still re-fetch from the App Store Server API so entitlement state is based
      // on Apple's current server state, not on a possibly delayed notification.
      const hinted = await decodeIncoming(data.signedTransactionInfo);
      const transactionId = clean(hinted.transactionId, 200);
      const bundleId = clean(hinted.bundleId, 220);
      const product = await productByAppleId(hinted.productId);
      const appAccountToken = String(hinted.appAccountToken || '');
      if(!transactionId || !bundleId || !product || !appAccountToken){
        return {ok:true, events:[]};
      }

      const account = typeof resolveAppAccountToken === 'function'
        ? await resolveAppAccountToken(appAccountToken) : null;
      if(!account || !account.email) return {ok:true, events:[]};

      const mapped = appleProduct(product);
      if(mapped.bundleId !== bundleId) throw problem('store_bundle_mismatch', 409);
      const response = await requestTransaction(transactionId, mapped.bundleId);
      const transaction = await decodeVerified(response.payload.signedTransactionInfo);
      const identity = {appleAppAccountToken:appAccountToken};
      const baseEvent = normalize(transaction, {
        requestedId:transactionId,
        productId:mapped.productId,
        bundleId:mapped.bundleId,
        identity,
        product
      });

      let event = baseEvent;
      if(product.kind === 'subscription'){
        const status = await requestSubscriptionStatus(
          String(transaction.originalTransactionId || transactionId),
          mapped.bundleId,
          response.base
        );
        event = await subscriptionEvent(status, {
          productId:mapped.productId,
          bundleId:mapped.bundleId,
          identity
        });
      }
      return {ok:true, events:[{...event, email:String(account.email), sku:product.sku}]};
    }
  };
}

module.exports = {
  createAppleStoreBillingAdapter,
  createApiToken,
  verifyAndDecodeAppleJws
};
