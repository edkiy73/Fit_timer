'use strict';
/* Оплата (AppBase Core): одна дорога «платёж подтверждён → право выдано».

   Провайдер (Google Play, App Store, ЮKassa, Paddle …) подключается адаптером:
     {
       id: 'yookassa',
       testOnly?: true,                              // только при ALLOW_MEMORY_STORE=1
       available?(): Promise<boolean>,               // включён ли сейчас (например, настройкой в админке)
       checkout?({email, sku, product}) → {url} | {events},   // начать покупку
       verifyWebhook({headers, body, query}) → {ok, events},  // подтвердить уведомление
       setRenewal?({email, sub, autoRenew}) → {url} | {}      // автопродление подписки у провайдера
     }
   Событие провайдера:
     {orderId, email, sku, status:'paid'|'refunded'|'canceled', until?, autoRenew?}

   Core проверяет SKU по каталогу продукта (config/product.json → products, у
   подписки kind:'subscription' и days; комплект — config/product.json → bundles), применяет событие к записи аккаунта
   идемпотентно (повтор того же события ничего не меняет) и пишет журнал без
   платёжных данных. Что открывает SKU, по-прежнему решает продукт. */

const crypto = require('crypto');
const { store } = require('./store');
const { send, fail, readBody, cors, rateOk, sameSecret } = require('./util');
const { productCatalog, checkSku, cleanSku, grantOwned, revokeOwned, entitlementsOf } = require('./entitlements');
const { productConfig } = require('./product-core');

const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const PROVIDER = /^[a-z0-9_-]{1,32}$/;
const PLATFORM = new Set(['web','android','ios','unknown']);
const DISTRIBUTION = new Set(['web','google_play','app_store','direct','unknown']);
const STATUSES = new Set(['paid', 'refunded', 'canceled']);
const YEAR = 365 * 24 * 3600;
const LOG_TTL = 400 * 24 * 3600;

const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const mail = v => String(v || '').trim().toLowerCase().slice(0, 120);
const line = (v, max) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

function billingContext(raw){
  raw = raw && typeof raw === 'object' ? raw : {};
  const platformRaw = String(raw.platform || 'unknown').toLowerCase();
  const distributionRaw = String(raw.distribution || 'unknown').toLowerCase();
  const country = String(raw.country || '').trim().toUpperCase();
  return {
    platform: PLATFORM.has(platformRaw) ? platformRaw : 'unknown',
    distribution: DISTRIBUTION.has(distributionRaw) ? distributionRaw : 'unknown',
    country: /^[A-Z]{2}$/.test(country) ? country : '',
    storefront: line(raw.storefront, 80)
  };
}

function adapterSupports(adapter, context){
  const inList = (value, list) => !Array.isArray(list) || !list.length || list.includes(value);
  if(!inList(context.platform, adapter.platforms)) return false;
  if(!inList(context.distribution, adapter.distributions)) return false;
  if(Array.isArray(adapter.countries) && adapter.countries.length && (!context.country || !adapter.countries.includes(context.country))) return false;
  if(Array.isArray(adapter.excludeCountries) && context.country && adapter.excludeCountries.includes(context.country)) return false;
  return true;
}

function methodInfo(adapter){
  return {
    id:String(adapter.id),
    kind:['store','external','direct','test'].includes(adapter.kind) ? adapter.kind : 'external',
    external:!!adapter.external
  };
}

/** Catalog item with its kind; subscriptions carry a period in days. */
function catalogItem(sku){
  let list = [];
  try{ list = Array.isArray(productConfig().products) ? productConfig().products : []; }catch(_){}
  const raw = list.find(item => cleanSku(item && item.sku) === sku) || {};
  if(raw.kind !== 'subscription') return {sku, kind: 'owned', days: 0};
  return {sku, kind: 'subscription', days: Math.max(1, Math.min(3650, Math.round(+raw.days || 30)))};
}

/** config/product.json → bundles: [{pattern:'bundle.x.*', includes:['x.*','sub.year']}] — one
 *  purchase that grants several SKUs. «*» in includes stands for what the pattern's «*» matched.
 *  The bundle SKU itself must also pass checkSku (list it in skuPatterns or products). */
function bundleParts(sku){
  let list = [];
  try{ list = Array.isArray(productConfig().bundles) ? productConfig().bundles : []; }catch(_){}
  for(const bundle of list){
    const pattern = String((bundle && bundle.pattern) || '').trim().toLowerCase();
    if(!/^[a-z0-9][a-z0-9._:-]{0,62}\*?$/.test(pattern)) continue;
    let rest = null;
    if(pattern.endsWith('*')){
      const head = pattern.slice(0, -1);
      if(sku.length > head.length && sku.startsWith(head)) rest = sku.slice(head.length);
    }else if(sku === pattern) rest = '';
    if(rest === null) continue;
    const parts = (Array.isArray(bundle.includes) ? bundle.includes : [])
      .map(part => cleanSku(String(part || '').replace('*', rest)))
      .filter(part => part && part !== sku);
    return parts.length ? parts : null;
  }
  return null;
}

function normalizeEvent(provider, event){
  const e = event && typeof event === 'object' ? event : {};
  const out = {
    provider: String(provider || ''),
    orderId: line(e.orderId, 120),
    email: mail(e.email),
    sku: cleanSku(e.sku),
    status: String(e.status || ''),
    until: e.until ? line(e.until, 40) : '',
    autoRenew: !!e.autoRenew
  };
  if(!PROVIDER.test(out.provider)) return {error: 'bad_provider'};
  if(!out.orderId) return {error: 'bad_order'};
  if(!EMAIL.test(out.email)) return {error: 'bad_email'};
  if(!STATUSES.has(out.status)) return {error: 'bad_status'};
  const skuError = checkSku(out.sku);
  if(skuError) return {error: skuError};
  return {event: out};
}

async function log(entry){
  const month = entry.at.slice(0, 7);
  await store.push(`bill:log:${month}`, JSON.stringify(entry), LOG_TTL);
}

/** Applies one confirmed provider event. Idempotent per provider + order + status. */
async function applyBillingEvent(provider, rawEvent, now = new Date(), {inBundle = false} = {}){
  const {event, error} = normalizeEvent(provider, rawEvent);
  if(error) return {ok: false, error};
  // A bundle is applied part by part, each as its own order («<order>|<sku>»), so a refund
  // or a repeated notification touches every part the same way. Bundles never nest.
  const parts = inBundle ? null : bundleParts(event.sku);
  if(parts){
    let last = null, applied = false;
    for(const sku of parts){
      last = await applyBillingEvent(provider, {...rawEvent, sku, orderId: event.orderId + '|' + sku}, now, {inBundle: true});
      if(!last.ok) return last;
      applied = applied || !!last.applied;
    }
    return applied ? {ok: true, applied: true, bundle: true, entitlements: last.entitlements} : {ok: true, duplicate: true, bundle: true};
  }
  const mh = sha(event.email).slice(0, 32);
  const orderKey = `bill:${event.provider}:${sha(event.orderId).slice(0, 40)}`;
  const item = catalogItem(event.sku);

  return store.withLock(`lock:bill:${mh}`, async () => {
    const prev = await store.get(orderKey);
    if(prev === event.status) return {ok: true, duplicate: true};

    let acc = null;
    try{ acc = JSON.parse(await store.get(`a:${mh}`)); }catch(_){}
    // A purchase can arrive before the first sign-in (web checkout): the account is
    // created with the purchase, and the person sees it after signing in.
    const created = !acc;
    if(!acc) acc = {email: event.email, since: now.toISOString(), seen: now.toISOString(), handle: '', sub: null, locale: 'ru'};

    if(item.kind === 'owned'){
      if(event.status === 'paid') grantOwned(acc, event.sku, {provider: event.provider, orderId: event.orderId, now});
      else revokeOwned(acc, event.sku);
    }else if(event.status === 'paid'){
      // Buying again while Plus is active adds the period to what is left, not from today.
      const activeUntil = acc.sub ? (Date.parse(acc.sub.until) || 0) : 0;
      const start = Math.max(now.getTime(), activeUntil);
      const until = Date.parse(event.until) ? new Date(event.until) : new Date(start + item.days * 86400000);
      acc.sub = {
        plan: event.sku, since: now.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10),
        autoRenew: event.autoRenew, provider: event.provider, source: 'billing', orderId: event.orderId
      };
    }else if(acc.sub && acc.sub.orderId === event.orderId){
      // Refund ends access now; cancel only stops renewal, paid time stays.
      if(event.status === 'refunded') acc.sub = null;
      else acc.sub.autoRenew = false;
    }

    await store.set(`a:${mh}`, JSON.stringify(acc));
    if(created && !(await store.get(`a:indexed:${mh}`))){
      await store.set(`a:indexed:${mh}`, '1');
      await store.push('a:all', mh);
    }
    await store.set(orderKey, event.status, YEAR * 5);
    await log({
      at: now.toISOString(), provider: event.provider, status: event.status, sku: event.sku,
      kind: item.kind, account: mh.slice(0, 12), order: sha(event.orderId).slice(0, 12)
    });
    return {ok: true, applied: true, created, entitlements: entitlementsOf(acc)};
  }, {ttl: 8, retries: 60, delay: 50});
}

/** Last payment events for Admin, newest first. No emails, no order ids. */
async function billingLog(limit = 200, now = new Date()){
  const months = [0, 1].map(back => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return d.toISOString().slice(0, 7);
  });
  const rows = [];
  for(const month of months){
    for(const raw of await store.list(`bill:log:${month}`)){
      try{ rows.push(JSON.parse(raw)); }catch(_){}
    }
  }
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

async function signedInAccount(body){
  const email = mail(body && body.email);
  if(!EMAIL.test(email)) return null;
  const deviceId = line(body && body.deviceId, 80);
  const token = String((body && body.syncToken) || '');
  let acc = null;
  try{ acc = JSON.parse(await store.get(`a:${sha(email).slice(0, 32)}`)); }catch(_){}
  const device = acc && acc.syncDevices && acc.syncDevices[deviceId];
  if(!device || !sameSecret(sha(token), device.h || '')) return null;
  return {email, acc};
}

/* POST /api/billing
     {action:'providers'}                                            → доступные провайдеры
     {action:'checkout', provider, sku, email, deviceId, syncToken}  → {url} или право сразу
   POST /api/billing?provider=<id>                                   → уведомление провайдера */
function createBillingHandler({adapters = []} = {}){
  const list = (Array.isArray(adapters) ? adapters : []).filter(a => a && PROVIDER.test(String(a.id || '')));
  const enabled = async (rawContext = {}) => {
    const context = billingContext(rawContext);
    const out = [];
    for(const adapter of list){
      if(adapter.testOnly && process.env.ALLOW_MEMORY_STORE !== '1') continue;
      if(!adapterSupports(adapter, context)) continue;
      if(typeof adapter.supports === 'function'){
        let supported = false;
        try{ supported = !!(await adapter.supports(context)); }catch(_){}
        if(!supported) continue;
      }
      if(typeof adapter.available === 'function'){
        let on = false;
        try{ on = !!(await adapter.available(context)); }catch(_){}
        if(!on) continue;
      }
      out.push(adapter);
    }
    return out;
  };
  const find = async (id, context) => (await enabled(context)).find(a => a.id === id) || null;

  return async function billingHandler(req, res){
    if(cors(req, res)) return;
    if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');

    let body;
    try{ body = await readBody(req); }catch(_){ return fail(res, 413, 'too_large'); }
    const query = req.query || Object.fromEntries(new URL(req.url || '/', 'http://local').searchParams);

    // Needs no storage: tells the app which buy buttons are legal/available for this context.
    if(!query.provider && body && (body.action === 'providers' || body.action === 'methods')){
      const context = billingContext(body.context);
      const methods = (await enabled(context)).filter(a => typeof a.checkout === 'function').map(methodInfo);
      if(body.action === 'providers') return send(res, 200, {ok: true, providers: methods.map(x => x.id)});
      return send(res, 200, {ok: true, context, methods});
    }

    if(!store.configured()) return fail(res, 503, 'no_store');
    if(!(await rateOk(req, 'billing', 240))) return fail(res, 429, 'rate_limited');

    if(query.provider){
      const adapter = await find(String(query.provider), billingContext(body && body.context));
      if(!adapter || typeof adapter.verifyWebhook !== 'function') return fail(res, 404, 'unknown_provider');
      let verified;
      try{ verified = await adapter.verifyWebhook({headers: req.headers || {}, body, query}); }
      catch(_){ return fail(res, 401, 'bad_signature'); }
      if(!verified || !verified.ok) return fail(res, 401, 'bad_signature');
      const results = [];
      for(const event of Array.isArray(verified.events) ? verified.events : []){
        results.push(await applyBillingEvent(adapter.id, event));
      }
      const bad = results.find(r => !r.ok);
      // Providers retry non-2xx: a malformed event is answered 400 so it shows up in their dashboard.
      if(bad) return fail(res, 400, bad.error);
      return send(res, 200, {ok: true, applied: results.filter(r => r.applied).length});
    }

    const action = String((body && body.action) || '');
    // Automatic renewal of the active subscription: on or off, the paid period stays. A provider
    // that manages it on its own page answers {url}; otherwise the account keeps the choice
    // (instant grants, admin grants) and the provider's next webhook can update it.
    if(action === 'renewal'){
      const who = await signedInAccount(body);
      if(!who) return fail(res, 403, 'bad_sync_token');
      const autoRenew = !!body.autoRenew;
      const mh = sha(who.email).slice(0, 32);
      const current = who.acc && who.acc.sub;
      if(!current || !((Date.parse(current.until) || 0) >= Date.now())) return fail(res, 409, 'no_active_subscription');
      const adapter = list.find(a => a.id === current.provider);
      if(adapter && typeof adapter.setRenewal === 'function'){
        let answer;
        try{ answer = await adapter.setRenewal({email: who.email, sub: current, autoRenew}); }
        catch(e){ return fail(res, (e && e.status) || 502, String((e && e.message) || 'renewal_failed')); }
        if(answer && answer.url) return send(res, 200, {ok: true, url: String(answer.url), autoRenew: !!current.autoRenew});
      }
      const saved = await store.withLock(`lock:bill:${mh}`, async () => {
        let acc = null;
        try{ acc = JSON.parse(await store.get(`a:${mh}`)); }catch(_){}
        if(!acc || !acc.sub) return null;
        acc.sub.autoRenew = autoRenew;
        await store.set(`a:${mh}`, JSON.stringify(acc));
        return acc;
      }, {ttl: 8, retries: 60, delay: 50});
      if(!saved) return fail(res, 409, 'no_active_subscription');
      await log({at: new Date().toISOString(), provider: String(saved.sub.provider || ''), status: autoRenew ? 'renewal_on' : 'renewal_off',
        sku: String(saved.sub.plan || ''), kind: 'subscription', account: mh.slice(0, 12), order: ''});
      return send(res, 200, {ok: true, autoRenew, ...entitlementsOf(saved)});
    }

    if(action === 'checkout'){
      const adapter = await find(String(body.provider || ''), billingContext(body && body.context));
      if(!adapter || typeof adapter.checkout !== 'function') return fail(res, 404, 'unknown_provider');
      const who = await signedInAccount(body);
      if(!who) return fail(res, 403, 'bad_sync_token');
      const sku = cleanSku(body.sku);
      const skuError = checkSku(sku);
      if(skuError) return fail(res, 400, skuError);
      const product = productCatalog().find(item => item.sku === sku) || {sku, title: sku};
      let started;
      try{ started = await adapter.checkout({email: who.email, sku, product}); }
      catch(e){ return fail(res, (e && e.status) || 502, String((e && e.message) || 'checkout_failed')); }
      if(started && started.url) return send(res, 200, {ok: true, url: String(started.url)});
      const results = [];
      for(const event of (started && Array.isArray(started.events)) ? started.events : []){
        results.push(await applyBillingEvent(adapter.id, event));
      }
      const bad = results.find(r => !r.ok);
      if(bad) return fail(res, 400, bad.error);
      const last = results[results.length - 1];
      return send(res, 200, {ok: true, granted: !!last, ...(last ? last.entitlements : {})});
    }

    return fail(res, 400, 'unknown_action');
  };
}

/* «Выдать сразу»: until a payment provider is connected, the pay button grants the
   purchase at once. Works in production, but only while `isEnabled()` says so (the product
   wires it to a switch in Admin → «Способы оплаты»); a real provider replaces it later. */
function createInstantBillingAdapter({isEnabled = async () => false} = {}){
  return {
    id: 'instant',
    available: isEnabled,
    async checkout({email, sku}){
      if(!(await isEnabled())) throw Object.assign(new Error('provider_disabled'), {status: 409});
      // A subscription granted this way is shown as auto-renewing, so the app's renewal switch is
      // real before money is charged; owned SKUs ignore the flag.
      return {events: [{orderId: 'instant-' + crypto.randomBytes(10).toString('hex'), email, sku, status: 'paid', autoRenew: true}]};
    }
  };
}

/* Test provider for local runs and e2e. Signs events with HMAC over the JSON body;
   works only on the memory store, never in production. */
function createTestBillingAdapter({secret = process.env.BILLING_TEST_SECRET || 'appbase-test-billing'} = {}){
  const sign = body => crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
  return {
    id: 'test',
    testOnly: true,
    sign,
    async checkout({email, sku}){
      return {events: [{orderId: 'test-' + crypto.randomBytes(8).toString('hex'), email, sku, status: 'paid', autoRenew: true}]};
    },
    async verifyWebhook({headers, body}){
      const given = String(headers['x-billing-signature'] || '');
      return given && sameSecret(given, sign(body)) ? {ok: true, events: Array.isArray(body.events) ? body.events : []} : {ok: false};
    }
  };
}

/* Admin: payment journal (mounted by the Core admin handler). */
async function handleAdminBilling(action, body, res){
  if(action !== 'billing_log') return false;
  send(res, 200, {ok: true, events: await billingLog(Math.max(1, Math.min(500, Math.round(+(body && body.limit) || 200))))});
  return true;
}

module.exports = { applyBillingEvent, billingLog, billingContext, createBillingHandler, createInstantBillingAdapter, createTestBillingAdapter, handleAdminBilling };
