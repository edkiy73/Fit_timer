'use strict';
/* Права аккаунта (AppBase Core).

   Два вида доступа, оба живут в записи аккаунта:
   - acc.sub   — подписка до даты (Premium). Формат не меняется: его уже читают
                 синхронизация, ИИ и клиенты;
   - acc.owned — покупки навсегда: { "<sku>": {since, provider, orderId?} }.

   Что открывает каждый SKU, знает только продукт. Core хранит, выдаёт, отзывает
   и отдаёт права клиенту. Список SKU продукта — config/product.json → products:
   [{sku, title}]; если он задан, выдать можно только SKU из списка. */

const { productConfig } = require('./product-core');

const SKU = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const MAX_OWNED = 200;

const cleanSku = value => {
  const sku = String(value || '').trim().toLowerCase();
  return SKU.test(sku) ? sku : '';
};
const line = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

function hasPremium(acc){
  return !!(acc && acc.sub && (Date.parse(acc.sub.until) || 0) > Date.now());
}

function ownedOf(acc){
  const src = acc && acc.owned && typeof acc.owned === 'object' ? acc.owned : {};
  const out = {};
  for(const [key, value] of Object.entries(src).slice(0, MAX_OWNED)){
    const sku = cleanSku(key);
    if(!sku || !value || typeof value !== 'object') continue;
    out[sku] = {
      since: line(value.since, 40),
      provider: line(value.provider, 40)
    };
    if(value.orderId) out[sku].orderId = line(value.orderId, 120);
  }
  return out;
}

function hasOwned(acc, sku){
  const key = cleanSku(sku);
  return !!key && Object.prototype.hasOwnProperty.call(ownedOf(acc), key);
}

/** What the client receives: never order ids or payment details. */
function entitlementsOf(acc){
  return {
    sub: (acc && acc.sub) || null,
    premium: hasPremium(acc),
    owned: Object.keys(ownedOf(acc)).sort()
  };
}

function productCatalog(){
  let config = null;
  try{ config = productConfig(); }catch(_){ return []; }
  const list = Array.isArray(config && config.products) ? config.products : [];
  const seen = new Set();
  return list.flatMap(item => {
    const sku = cleanSku(item && item.sku);
    if(!sku || seen.has(sku)) return [];
    seen.add(sku);
    return [{sku, title: line(item.title, 80) || sku}];
  });
}

/** null when the SKU may be granted, otherwise an error code. */
function checkSku(sku){
  const key = cleanSku(sku);
  if(!key) return 'bad_sku';
  const catalog = productCatalog();
  if(catalog.length && !catalog.some(item => item.sku === key)) return 'unknown_sku';
  return null;
}

/** Idempotent: granting an owned SKU again keeps the first purchase record. */
function grantOwned(acc, sku, {provider = 'admin', orderId = '', now = new Date()} = {}){
  const key = cleanSku(sku);
  if(!key) throw new Error('bad_sku');
  const owned = ownedOf(acc);
  if(!owned[key]){
    owned[key] = {since: now.toISOString(), provider: line(provider, 40) || 'admin'};
    if(orderId) owned[key].orderId = line(orderId, 120);
  }
  acc.owned = owned;
  return acc;
}

function revokeOwned(acc, sku){
  const key = cleanSku(sku);
  const owned = ownedOf(acc);
  delete owned[key];
  acc.owned = owned;
  return acc;
}

module.exports = {
  hasPremium, hasOwned, ownedOf, entitlementsOf, productCatalog, checkSku,
  grantOwned, revokeOwned, cleanSku
};
