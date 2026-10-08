'use strict';

const crypto = require('crypto');
const { loadSecrets, secret } = require('../secrets');
const { productConfig } = require('../product-core');
const { sameSecret } = require('../util');

const API = 'https://api.stripe.com/v1';
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

const clean = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const metadataOf = object => object && object.metadata && typeof object.metadata === 'object' ? object.metadata : {};

function publicBase(){
  let value = '';
  try{ value = clean(productConfig().defaultPublicUrl, 500); }catch(_){}
  return /^https?:\/\//i.test(value) ? value.replace(/\/$/, '') : '';
}

function stripeProduct(product){
  const cfg = product && product.billing && product.billing.stripe;
  const priceId = clean(cfg && cfg.priceId, 160);
  if(!/^price_[A-Za-z0-9_]+$/.test(priceId)){
    throw Object.assign(new Error('provider_sku_unconfigured'), {status:409});
  }
  return {priceId};
}

function encodeForm(entries){
  const form = new URLSearchParams();
  for(const [key, value] of entries){
    if(value != null && value !== '') form.append(key, String(value));
  }
  return form.toString();
}

function parseSignature(header){
  const out = {t:0, v1:[]};
  for(const part of String(header || '').split(',')){
    const i = part.indexOf('=');
    if(i < 1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if(key === 't') out.t = Number(value) || 0;
    if(key === 'v1' && /^[a-f0-9]{64}$/i.test(value)) out.v1.push(value.toLowerCase());
  }
  return out;
}

function verifySignature(rawBody, header, webhookSecret, nowMs, toleranceSec){
  if(!rawBody || !webhookSecret) return false;
  const parsed = parseSignature(header);
  if(!parsed.t || !parsed.v1.length) return false;
  if(Math.abs(Math.floor(nowMs / 1000) - parsed.t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', webhookSecret)
    .update(String(parsed.t) + '.' + rawBody)
    .digest('hex');
  return parsed.v1.some(value => sameSecret(value, expected));
}

function normalizedEvent(type, object){
  const meta = metadataOf(object);
  const email = clean(meta.appbase_email || object.customer_email || (object.customer_details && object.customer_details.email), 120).toLowerCase();
  const sku = clean(meta.appbase_sku, 80).toLowerCase();
  const orderId = clean(meta.appbase_order || object.client_reference_id || object.id, 120);
  if(!orderId || !EMAIL.test(email) || !sku) return null;

  if(type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded'){
    if(object.payment_status && object.payment_status !== 'paid' && object.mode !== 'subscription') return null;
    return {orderId, email, sku, status:'paid', autoRenew:object.mode === 'subscription'};
  }
  if(type === 'checkout.session.expired' || type === 'customer.subscription.deleted'){
    return {orderId, email, sku, status:'canceled', autoRenew:false};
  }
  if(type === 'charge.refunded'){
    return {orderId, email, sku, status:'refunded', autoRenew:false};
  }
  return null;
}

function createStripeBillingAdapter({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  toleranceSec = 300,
  successUrl,
  cancelUrl
} = {}){
  const credentials = async () => {
    await loadSecrets();
    return {
      key:secret('STRIPE_SECRET_KEY'),
      webhook:secret('STRIPE_WEBHOOK_SECRET')
    };
  };

  async function request(path, init = {}){
    const {key} = await credentials();
    if(!key) throw Object.assign(new Error('provider_unconfigured'), {status:503});
    if(typeof fetchImpl !== 'function') throw Object.assign(new Error('fetch_unavailable'), {status:503});
    const response = await fetchImpl(API + path, {
      ...init,
      headers:{
        Authorization:'Bearer ' + key,
        ...(init.headers || {})
      }
    });
    let payload = {};
    try{ payload = await response.json(); }catch(_){}
    if(!response.ok){
      const message = clean(payload && payload.error && payload.error.code, 120) || 'stripe_error';
      throw Object.assign(new Error(message), {status:502});
    }
    return payload;
  }

  return {
    id:'stripe',
    kind:'external',
    external:true,
    platforms:['web','android','ios'],
    distributions:['web','direct'],

    async available(){
      const {key, webhook} = await credentials();
      return !!(key && webhook);
    },

    async checkout({email, sku, product}){
      const {priceId} = stripeProduct(product);
      const orderId = 'ab_' + crypto.randomUUID();
      const base = publicBase();
      const okUrl = clean(successUrl || (base ? base + '/#/account?billing=success' : ''), 1000);
      const noUrl = clean(cancelUrl || (base ? base + '/#/account?billing=cancel' : ''), 1000);
      if(!/^https?:\/\//i.test(okUrl) || !/^https?:\/\//i.test(noUrl)){
        throw Object.assign(new Error('billing_return_url_missing'), {status:409});
      }
      const subscription = product && product.kind === 'subscription';
      const meta = [
        ['metadata[appbase_order]', orderId],
        ['metadata[appbase_email]', email],
        ['metadata[appbase_sku]', sku]
      ];
      const propagated = subscription ? 'subscription_data[metadata]' : 'payment_intent_data[metadata]';
      const body = encodeForm([
        ['mode', subscription ? 'subscription' : 'payment'],
        ['success_url', okUrl],
        ['cancel_url', noUrl],
        ['client_reference_id', orderId],
        ['customer_email', email],
        ['line_items[0][price]', priceId],
        ['line_items[0][quantity]', 1],
        ...meta,
        [propagated + '[appbase_order]', orderId],
        [propagated + '[appbase_email]', email],
        [propagated + '[appbase_sku]', sku]
      ]);
      const session = await request('/checkout/sessions', {
        method:'POST',
        headers:{
          'Content-Type':'application/x-www-form-urlencoded',
          'Idempotency-Key':orderId
        },
        body
      });
      if(!session || !session.url) throw Object.assign(new Error('stripe_no_checkout_url'), {status:502});
      return {url:String(session.url)};
    },

    async verifyWebhook({headers, rawBody}){
      const {webhook} = await credentials();
      const sig = headers && (headers['stripe-signature'] || headers['Stripe-Signature']);
      if(!verifySignature(rawBody, sig, webhook, now(), toleranceSec)) return {ok:false};
      let event;
      try{ event = JSON.parse(rawBody); }catch(_){ return {ok:false}; }
      const normalized = normalizedEvent(String(event && event.type || ''), event && event.data && event.data.object);
      return {ok:true, events:normalized ? [normalized] : []};
    }
  };
}

module.exports = { createStripeBillingAdapter, verifySignature, normalizedEvent };
