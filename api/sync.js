/* POST /api/sync — обмен данными профилей одного подтверждённого аккаунта.

   Фото-прогресс сюда не попадает: клиент не создаёт документ `photos`, а сервер
   дополнительно принимает только известные ключи. Программа — отдельный документ,
   поэтому правка одной программы на телефоне не затирает другую с планшета. */

const { store } = require('../lib/store');
const { send, fail, rateOk, sameSecret, cors } = require('../lib/util');
const { ACCOUNT_PROFILE, registry: SYNC_REGISTRY } = require('../lib/fit-sync-schema');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const YEAR = 365 * 24 * 3600;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_DOC = 3 * 1024 * 1024;
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const PROFILE = /^[a-z0-9_-]{1,80}$/i;

async function bodyOf(req){
  if(req.body && typeof req.body === 'object') return req.body;
  const chunks = []; let size = 0;
  for await (const c of req){
    size += c.length;
    if(size > MAX_BODY) throw new Error('too_large');
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

const cleanAge = v => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 5 && n <= 100 ? n : null;
};
// Старые клиенты могли прислать точную дату. Сервер преобразует её в полные годы
// и сохраняет только возраст, чтобы после первого обмена точная дата исчезла.
const legacyAge = v => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return null;
  const d = new Date(v), now = new Date();
  if(isNaN(d)) return null;
  let n = now.getUTCFullYear() - d.getUTCFullYear();
  if(now.getUTCMonth() < d.getUTCMonth()
    || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) n--;
  return cleanAge(n);
};
const cleanProfileInt = (value, def, lo, hi) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : def;
};
const cleanUser = u => ({
  id: String((u && u.id) || '').slice(0, 80),
  name: String((u && u.name) || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20),
  gender: (u && (u.gender === 'f' || u.gender === 'm')) ? u.gender : '',
  age: cleanAge(u && u.age) || legacyAge(u && u.birth),
  theme: ['system','light','dark'].includes(u && u.theme) ? u.theme : 'system',
  locale: ['system','ru','en'].includes(u && u.locale) ? u.locale : 'system',
  prepSec: cleanProfileInt(u && u.prepSec, 5, 0, 30),
  readySec: cleanProfileInt(u && u.readySec, 5, 0, 30),
  sideSec: cleanProfileInt(u && u.sideSec, 10, 3, 60),
  voiceVol: cleanProfileInt(u && u.voiceVol, 100, 0, 100),
  fxVol: cleanProfileInt(u && u.fxVol, 100, 0, 100)
});
const newerProfile = (a, b) => {
  const ta = Date.parse((a && a.at) || '') || 0, tb = Date.parse((b && b.at) || '') || 0;
  if(ta !== tb) return ta > tb;
  return String((a && a.deviceId) || '') > String((b && b.deviceId) || '');
};
// Документы уже имеют монотонный rev. На часы телефона для конфликтов не опираемся:
// неверная дата на одном устройстве иначе может навсегда заблокировать свежие правки.
// Если два устройства изменили одну базовую ревизию одновременно, сервер принимает
// последнее доставленное изменение; повтор той же ревизии с того же устройства идемпотентен.
const newerDoc = (a, b) => {
  const ra = Math.max(0, +(a && a.rev) || 0), rb = Math.max(0, +(b && b.rev) || 0);
  if(ra !== rb) return ra > rb;
  return String((a && a.deviceId) || '') !== String((b && b.deviceId) || '');
};

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'sync', 240))) return fail(res, 429, 'rate_limited');

  let body;
  try{ body = await bodyOf(req); }catch(e){ return fail(res, 413, 'too_large'); }
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  const deviceId = String(body.deviceId || '').trim().slice(0, 80);
  const token = String(body.token || '');
  if(!EMAIL.test(email) || !deviceId || !token) return fail(res, 401, 'auth_required');
  const mh = sha(email).slice(0, 32);
  const araw = await store.get(`a:${mh}`);
  let acc = null;
  try{ acc = JSON.parse(araw); }catch(e){}
  const dev = acc && acc.syncDevices && acc.syncDevices[deviceId];
  if(!dev || !sameSecret(sha(token), dev.h || '')) return fail(res, 403, 'bad_sync_token');
  const paidUntil = Date.parse((acc.sub && acc.sub.until) || '') || 0;
  const premium = paidUntil >= Date.now();

  const manifestKey = `s:${mh}`;
  try{
    return await store.withLock(`lock:sync:${mh}`, async()=> {
      let manifest = {v: 2, profiles: {}, accountDocs: {}};
      try{ manifest = JSON.parse(await store.get(manifestKey)) || manifest; }catch(e){}
      if(!manifest.profiles || typeof manifest.profiles !== 'object') manifest.profiles = {};
      if(!manifest.accountDocs || typeof manifest.accountDocs !== 'object') manifest.accountDocs = {};

      if(body.action === 'push'){
    const profiles = Array.isArray(body.profiles) ? body.profiles.slice(0, 20) : [];
    const docs = Array.isArray(body.docs) ? body.docs.slice(0, 80) : [];
    // Бесплатному аккаунту разрешён только документ настроек уведомлений:
    // маркетинговая отписка обязана работать независимо от тарифа.
    if(!premium && (profiles.length || docs.some(d => {
      const key = String(d && d.key || '');
      return String(d && d.profileId || '') !== ACCOUNT_PROFILE || !SYNC_REGISTRY.isFree('account', key);
    }))){
      return fail(res, 402, 'premium_required');
    }
    const now = new Date().toISOString();
    for(const rec of profiles){
      const user = cleanUser(rec && rec.user);
      if(!PROFILE.test(user.id)) continue;
      const prev = manifest.profiles[user.id] || {docs: {}};
      if(!prev.docs) prev.docs = {};
      if(prev.userAt && !newerProfile({at: rec.at, deviceId}, {at: prev.userAt, deviceId: prev.userDevice})) continue;
      if(rec && rec.deleted){
        for(const d of Object.values(prev.docs)) if(d && d.storeKey) await store.del(d.storeKey);
        manifest.profiles[user.id] = {user, userAt:rec.at || now, userDevice:deviceId,
          deleted:true, docs:{}};
        continue;
      }
      prev.user = user; prev.userAt = rec.at || now; prev.userDevice = deviceId;
      prev.deleted = false;
      manifest.profiles[user.id] = prev;
    }

    for(const d of docs){
      const pid = String(d && d.profileId || '');
      const key = String(d && d.key || '');
      if(pid === ACCOUNT_PROFILE && SYNC_REGISTRY.accepts('account', key)){
        const value = d.value == null ? null : String(d.value);
        if(value && Buffer.byteLength(value, 'utf8') > MAX_DOC) return fail(res, 413, 'doc_too_large', {key});
        const prev = manifest.accountDocs[key];
        const meta = {rev: Math.max(1, +d.rev || 1), at: d.at || now,
                      schema: Math.max(1, +d.schema || 1), deviceId,
                      deleted: !!d.deleted};
        if(prev && !newerDoc(meta, prev)) continue;
        const storeKey = `sa:${mh}:${key}`;
        if(meta.deleted) await store.del(storeKey);
        else await store.set(storeKey, value || '', YEAR);
        manifest.accountDocs[key] = Object.assign(meta, {storeKey});
        continue;
      }
      if(!PROFILE.test(pid) || !SYNC_REGISTRY.accepts('profile', key)) continue;
      const value = d.value == null ? null : String(d.value);
      if(value && Buffer.byteLength(value, 'utf8') > MAX_DOC) return fail(res, 413, 'doc_too_large', {key});
      const prof = manifest.profiles[pid] || {user: cleanUser({id: pid}), docs: {}};
      if(prof.deleted) continue;
      if(!prof.docs) prof.docs = {};
      const prev = prof.docs[key];
      const meta = {rev: Math.max(1, +d.rev || 1), at: d.at || now,
                    schema: Math.max(1, +d.schema || 1), deviceId,
                    deleted: !!d.deleted};
      if(prev && !newerDoc(meta, prev)) continue;
      const storeKey = `sd:${mh}:${sha(pid + '\n' + key).slice(0, 32)}`;
      if(meta.deleted) await store.del(storeKey);
      else await store.set(storeKey, value || '', YEAR);
      prof.docs[key] = Object.assign(meta, {storeKey});
      manifest.profiles[pid] = prof;
    }
    manifest.at = now;
    await store.set(manifestKey, JSON.stringify(manifest), YEAR);
    return send(res, 200, {ok: true});
  }

  if(body.action === 'pull'){
    const profiles = premium ? Object.entries(manifest.profiles).slice(0, 20) : [];
    const keys = [];
    profiles.forEach(([, p]) => Object.values((p && p.docs) || {}).forEach(d => {
      if(d && !d.deleted && d.storeKey) keys.push(d.storeKey);
    }));
    const vals = await store.many(keys);
    const byStore = new Map(keys.map((k, i) => [k, vals[i]]));
    const accountKeys = Object.values(manifest.accountDocs).filter(d => d && !d.deleted && d.storeKey).map(d => d.storeKey);
    const accountVals = await store.many(accountKeys);
    const accountByStore = new Map(accountKeys.map((k, i) => [k, accountVals[i]]));
    const out = profiles.map(([id, p]) => ({
      user: cleanUser(Object.assign({}, p.user || {}, {id})),
      userAt: p.userAt || '',
      deleted: !!p.deleted,
      docs: Object.entries(p.docs || {}).map(([key, d]) => ({
        key, rev: d.rev, at: d.at, schema: d.schema, deviceId: d.deviceId,
        deleted: !!d.deleted, value: d.deleted ? null : (byStore.get(d.storeKey) ?? null)
      }))
    }));
    const accountDocEntries = Object.entries(manifest.accountDocs)
      .filter(([key]) => premium || SYNC_REGISTRY.isFree('account', key));
    const accountDocs = accountDocEntries.map(([key, d]) => ({
      key, rev:d.rev, at:d.at, schema:d.schema, deviceId:d.deviceId,
      deleted:!!d.deleted, value:d.deleted ? null : (accountByStore.get(d.storeKey) ?? null)
    }));
    return send(res, 200, {ok: true, profiles: out, accountDocs});
  }

      fail(res, 400, 'unknown_action');
    }, {ttl:8, retries:60, delay:50});
  }catch(e){
    if(e && e.message === 'lock_timeout') return fail(res, 503, 'sync_busy');
    throw e;
  }
};
