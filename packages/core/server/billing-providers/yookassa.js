'use strict';

const crypto = require('crypto');
const { loadSecrets, secret } = require('../secrets');
const { productConfig } = require('../product-core');

const API = 'https://api.yookassa.ru/v3';
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const clean = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);

function publicBase(){
  let value = '';
  try{ value = clean(productConfig().defaultPublicUrl, 500); }catch(_){}
  return /^https?:\/\//i.test(value) ? value.replace(/\/$/, '') : '';
}

function yookassaProduct(product){
  const cfg = product && product.billing && product.billing.yookassa;
  const value = Number(cfg && cfg.amount);
  const currency = clean(cfg && cfg.currency, 3).toUpperCase();
  if(!(value > 0) || !/^[A-Z]{3}$/.test(currency)){
    throw Object.assign(new Error('provider_sku_unconfigured'), {status:409});
  }
  return {value:value.toFixed(2), currency};
}

function createYooKassaBillingAdapter({
  fetchImpl = globalThis.fetch,
  returnUrl
} = {}){
  const credentials = async () => {
    await loadSecrets();
    return {
      shopId:secret('YOOKASSA_SHOP_ID'),
      key:secret('YOOKASSA_SECRET_KEY')
    };
  };

  async function request(path, init = {}){
    const {shopId, key} = await credentials();
    if(!shopId || !key) throw Object.assign(new Error('provider_unconfigured'), {status:503});
    if(typeof fetchImpl !== 'function') throw Object.assign(new Error('fetch_unavailable'), {status:503});
    const response = await fetchImpl(API + path, {
      ...init,
      headers:{
        Authorization:'Basic ' + Buffer.from(shopId + ':' + key).toString('base64'),
        ...(init.headers || {})
      }
    });
    let payload = {};
    try{ payload = await response.json(); }catch(_){}
    if(!response.ok) throw Object.assign(new Error('yookassa_error'), {status:502});
    return payload;
  }

  async function fetchPayment(id){
    if(!/^[A-Za-z0-9_-]{4,120}$/.test(String(id || ''))) return null;
    try{ return await request('/payments/' + encodeURIComponent(id), {method:'GET'}); }
    catch(_){ return null; }
  }

  async function fetchRefund(id){
    if(!/^[A-Za-z0-9_-]{4,120}$/.test(String(id || ''))) return null;
    try{ return await request('/refunds/' + encodeURIComponent(id), {method:'GET'}); }
    catch(_){ return null; }
  }

  function fromPayment(payment, status){
    const meta = payment && payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
    const email = clean(meta.appbase_email, 120).toLowerCase();
    const sku = clean(meta.appbase_sku, 80).toLowerCase();
    const orderId = clean(meta.appbase_order || payment.id, 120);
    if(!orderId || !EMAIL.test(email) || !sku) return null;
    return {orderId, email, sku, status, autoRenew:false};
  }

  return {
    id:'yookassa',
    kind:'external',
    external:true,
    platforms:['web','android','ios'],
    distributions:['web','direct'],
    countries:['RU'],

    async available(){
      const {shopId, key} = await credentials();
      return !!(shopId && key);
    },

    async checkout({email, sku, product}){
      const amount = yookassaProduct(product);
      const orderId = 'ab_' + crypto.randomUUID();
      const base = publicBase();
      const back = clean(returnUrl || (base ? base + '/#/account?billing=return' : ''), 1000);
      if(!/^https?:\/\//i.test(back)) throw Object.assign(new Error('billing_return_url_missing'), {status:409});
      const payload = await request('/payments', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Idempotence-Key':orderId
        },
        body:JSON.stringify({
          amount,
          capture:true,
          confirmation:{type:'redirect', return_url:back},
          description:clean((product && product.title) || sku, 128),
          metadata:{appbase_order:orderId, appbase_email:email, appbase_sku:sku}
        })
      });
      if(payload && payload.status === 'succeeded'){
        const event = fromPayment(payload, 'paid');
        return {events:event ? [event] : []};
      }
      const url = payload && payload.confirmation && payload.confirmation.confirmation_url;
      if(!url) throw Object.assign(new Error('yookassa_no_checkout_url'), {status:502});
      return {url:String(url)};
    },

    async verifyWebhook({body}){
      const type = String(body && body.event || '');
      const object = body && body.object && typeof body.object === 'object' ? body.object : null;
      if(!object) return {ok:false};

      if(type === 'payment.succeeded' || type === 'payment.canceled'){
        const payment = await fetchPayment(object.id);
        const expected = type === 'payment.succeeded' ? 'succeeded' : 'canceled';
        if(!payment || payment.status !== expected) return {ok:false};
        const event = fromPayment(payment, type === 'payment.succeeded' ? 'paid' : 'canceled');
        return {ok:!!event, events:event ? [event] : []};
      }

      if(type === 'refund.succeeded'){
        const refund = await fetchRefund(object.id);
        if(!refund || refund.status !== 'succeeded' || !refund.payment_id) return {ok:false};
        const payment = await fetchPayment(refund.payment_id);
        const event = payment ? fromPayment(payment, 'refunded') : null;
        return {ok:!!event, events:event ? [event] : []};
      }

      return {ok:true, events:[]};
    }
  };
}

module.exports = { createYooKassaBillingAdapter };
