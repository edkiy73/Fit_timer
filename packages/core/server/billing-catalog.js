'use strict';

const { store } = require('./store');
const { productConfig } = require('./product-core');
const { checkSku, cleanSku } = require('./entitlements');

const KEY = 'settings:billing';
const PROVIDERS = new Set(['apple','google_play','stripe','yookassa']);
const providerKey = id => id === 'google_play' ? 'google' : id;
const line = (value, max) => String(value == null ? '' : value)
  .replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

function sanitizeMapping(provider, raw){
  raw = raw && typeof raw === 'object' ? raw : {};
  if(provider === 'stripe'){
    const priceId = line(raw.priceId, 160);
    return {priceId:/^price_[A-Za-z0-9_]+$/.test(priceId) ? priceId : ''};
  }
  if(provider === 'yookassa'){
    const amount = Number(raw.amount);
    const currency = line(raw.currency, 3).toUpperCase();
    return {
      amount:Number.isFinite(amount) && amount > 0 && amount <= 1e9 ? amount : 0,
      currency:/^[A-Z]{3}$/.test(currency) ? currency : ''
    };
  }
  if(provider === 'google_play'){
    const productId = line(raw.productId, 200);
    const packageName = line(raw.packageName, 220);
    return {
      productId:/^[A-Za-z0-9._-]{1,200}$/.test(productId) ? productId : '',
      packageName:/^[A-Za-z0-9._-]{1,220}$/.test(packageName) ? packageName : ''
    };
  }
  if(provider === 'apple'){
    const productId = line(raw.productId, 200);
    const bundleId = line(raw.bundleId, 220);
    return {
      productId:/^[A-Za-z0-9._-]{1,200}$/.test(productId) ? productId : '',
      bundleId:/^[A-Za-z0-9._-]{1,220}$/.test(bundleId) ? bundleId : ''
    };
  }
  throw Object.assign(new Error('bad_provider'), {status:400});
}

function validatedMapping(provider, raw){
  raw = raw && typeof raw === 'object' ? raw : {};
  const clean = sanitizeMapping(provider, raw);
  const bad = () => { throw Object.assign(new Error('bad_mapping'), {status:400}); };

  if(provider === 'stripe'){
    const entered = line(raw.priceId,160);
    if(entered && !clean.priceId) bad();
  }else if(provider === 'yookassa'){
    const amountEntered = String(raw.amount == null ? '' : raw.amount).trim();
    const currencyEntered = line(raw.currency,3);
    const clearing = !amountEntered && !currencyEntered;
    if(!clearing && (!(clean.amount > 0) || !clean.currency)) bad();
  }else if(provider === 'google_play'){
    const productEntered = line(raw.productId,200);
    const packageEntered = line(raw.packageName,220);
    if((productEntered && !clean.productId) || (packageEntered && !clean.packageName)) bad();
    if(!productEntered && packageEntered) bad();
  }else if(provider === 'apple'){
    const productEntered = line(raw.productId,200);
    const bundleEntered = line(raw.bundleId,220);
    if((productEntered && !clean.productId) || (bundleEntered && !clean.bundleId)) bad();
    if(!productEntered && bundleEntered) bad();
  }
  return clean;
}

function sanitizeOverrides(raw){
  const products = raw && raw.products && typeof raw.products === 'object' ? raw.products : {};
  const providerSettings = raw && raw.providers && typeof raw.providers === 'object' ? raw.providers : {};
  const out = {version:1, providers:{}, products:{}};
  for(const provider of PROVIDERS){
    const value = providerSettings[provider];
    if(value && typeof value === 'object' && typeof value.enabled === 'boolean'){
      out.providers[provider] = {enabled:value.enabled};
    }
  }
  for(const [rawSku, rawProviders] of Object.entries(products)){
    const sku = cleanSku(rawSku);
    if(!sku || checkSku(sku)) continue;
    const providers = rawProviders && typeof rawProviders === 'object' ? rawProviders : {};
    const item = {};
    for(const provider of PROVIDERS){
      if(!Object.prototype.hasOwnProperty.call(providers, provider)) continue;
      item[provider] = sanitizeMapping(provider, providers[provider]);
    }
    if(Object.keys(item).length) out.products[sku] = item;
  }
  return out;
}

async function getBillingOverrides(){
  let saved = null;
  try{ saved = JSON.parse(await store.get(KEY)); }catch(_){}
  return sanitizeOverrides(saved || {});
}

function baseProducts(){
  let config = {};
  try{ config = productConfig(); }catch(_){}
  return Array.isArray(config.products) ? config.products : [];
}

function baseProduct(sku){
  const raw = baseProducts().find(item => cleanSku(item && item.sku) === sku);
  if(!raw) return {sku, title:sku, kind:'owned', days:0, billing:{}};
  return {
    sku,
    title:line(raw.title,120) || sku,
    kind:raw.kind === 'subscription' ? 'subscription' : 'owned',
    days:raw.kind === 'subscription' ? Math.max(1, Math.min(3650, Math.round(+raw.days || 30))) : 0,
    billing:raw.billing && typeof raw.billing === 'object' ? raw.billing : {}
  };
}

function mergedBilling(base, overrides){
  const out = base && typeof base === 'object' ? {...base} : {};
  for(const provider of PROVIDERS){
    if(!Object.prototype.hasOwnProperty.call(overrides || {}, provider)) continue;
    out[providerKey(provider)] = sanitizeMapping(provider, overrides[provider]);
  }
  return out;
}

async function billingProduct(skuValue){
  const sku = cleanSku(skuValue);
  if(!sku || checkSku(sku)) return null;
  const base = baseProduct(sku);
  const overrides = await getBillingOverrides();
  const item = overrides.products[sku] || {};
  return {...base, billing:mergedBilling(base.billing, item)};
}

async function billingProducts(){
  const overrides = await getBillingOverrides();
  const skus = new Set(baseProducts().map(item => cleanSku(item && item.sku)).filter(Boolean));
  Object.keys(overrides.products).forEach(sku => skus.add(sku));
  const out = [];
  for(const sku of skus){
    if(checkSku(sku)) continue;
    const base = baseProduct(sku);
    out.push({...base, billing:mergedBilling(base.billing, overrides.products[sku] || {})});
  }
  return out;
}

async function billingProductByProviderId(provider, externalId){
  if(!PROVIDERS.has(provider)) return null;
  const id = String(externalId || '');
  if(!id) return null;
  const key = providerKey(provider);
  const field = provider === 'stripe' ? 'priceId' : provider === 'yookassa' ? '' : 'productId';
  if(!field) return null;
  const products = await billingProducts();
  return products.find(product => String(product.billing && product.billing[key] && product.billing[key][field] || '') === id) || null;
}

async function billingProviderEnabled(provider){
  if(!PROVIDERS.has(provider)) return true;
  const saved = await getBillingOverrides();
  return !saved.providers[provider] || saved.providers[provider].enabled !== false;
}

async function setBillingProviderEnabled(provider, enabled){
  if(!PROVIDERS.has(provider)) throw Object.assign(new Error('bad_provider'), {status:400});
  const saved = await getBillingOverrides();
  const next = {
    version:1,
    providers:{
      ...saved.providers,
      [provider]:{enabled:!!enabled}
    },
    products:saved.products
  };
  await store.set(KEY, JSON.stringify(next));
  return !!enabled;
}

async function saveBillingMapping(skuValue, provider, mapping){
  const sku = cleanSku(skuValue);
  if(!sku || checkSku(sku)) throw Object.assign(new Error('unknown_sku'), {status:400});
  if(!PROVIDERS.has(provider)) throw Object.assign(new Error('bad_provider'), {status:400});
  const saved = await getBillingOverrides();
  const next = {
    version:1,
    providers:saved.providers,
    products:{
      ...saved.products,
      [sku]:{
        ...(saved.products[sku] || {}),
        [provider]:validatedMapping(provider, mapping)
      }
    }
  };
  await store.set(KEY, JSON.stringify(next));
  return billingProduct(sku);
}

module.exports = {
  sanitizeMapping,
  getBillingOverrides,
  billingProduct,
  billingProducts,
  billingProductByProviderId,
  billingProviderEnabled,
  setBillingProviderEnabled,
  saveBillingMapping
};
