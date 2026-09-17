/* POST /api/sync — обмен данными профилей одного подтверждённого аккаунта.

   Фото-прогресс сюда не попадает: клиент не создаёт документ `photos`, а сервер
   дополнительно принимает только известные ключи. Программа — отдельный документ,
   поэтому правка одной программы на телефоне не затирает другую с планшета. */

const { store } = require('../lib/store');
const { send, fail, rateOk, sameSecret, cors } = require('../lib/util');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const YEAR = 365 * 24 * 3600;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_DOC = 3 * 1024 * 1024;
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const PROFILE = /^[a-z0-9_-]{1,80}$/i;
const DOC = /^(stats|progWeights|index|program:[a-z0-9_-]{1,100})$/i;

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

const cleanUser = u => ({
  id: String((u && u.id) || '').slice(0, 80),
  name: String((u && u.name) || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20),
  gender: (u && (u.gender === 'f' || u.gender === 'm')) ? u.gender : '',
  birth: /^\d{4}-\d{2}-\d{2}$/.test(String(u && u.birth || '')) ? u.birth : '',
  theme: ['system','light','dark'].includes(u && u.theme) ? u.theme : 'system'
});
const newer = (a, b) => {
  const ta = Date.parse((a && a.at) || '') || 0, tb = Date.parse((b && b.at) || '') || 0;
  if(ta !== tb) return ta > tb;
  return String((a && a.deviceId) || '') > String((b && b.deviceId) || '');
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
  if(paidUntil < Date.now()) return fail(res, 402, 'premium_required');

  const manifestKey = `s:${mh}`;
  let manifest = {v: 1, profiles: {}};
  try{ manifest = JSON.parse(await store.get(manifestKey)) || manifest; }catch(e){}
  if(!manifest.profiles || typeof manifest.profiles !== 'object') manifest.profiles = {};

  if(body.action === 'push'){
    const profiles = Array.isArray(body.profiles) ? body.profiles.slice(0, 20) : [];
    const docs = Array.isArray(body.docs) ? body.docs.slice(0, 80) : [];
    const now = new Date().toISOString();
    for(const rec of profiles){
      const user = cleanUser(rec && rec.user);
      if(!PROFILE.test(user.id)) continue;
      const prev = manifest.profiles[user.id] || {docs: {}};
      if(!prev.docs) prev.docs = {};
      if(prev.userAt && !newer({at: rec.at, deviceId}, {at: prev.userAt, deviceId: prev.userDevice})) continue;
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
      if(!PROFILE.test(pid) || !DOC.test(key)) continue;
      const value = d.value == null ? null : String(d.value);
      if(value && Buffer.byteLength(value, 'utf8') > MAX_DOC) return fail(res, 413, 'doc_too_large', {key});
      const prof = manifest.profiles[pid] || {user: cleanUser({id: pid}), docs: {}};
      if(prof.deleted) continue;
      if(!prof.docs) prof.docs = {};
      const prev = prof.docs[key];
      const meta = {rev: Math.max(1, +d.rev || 1), at: d.at || now,
                    schema: Math.max(1, +d.schema || 1), deviceId,
                    deleted: !!d.deleted};
      if(prev && !newer(meta, prev)) continue;
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
    const profiles = Object.entries(manifest.profiles).slice(0, 20);
    const keys = [];
    profiles.forEach(([, p]) => Object.values((p && p.docs) || {}).forEach(d => {
      if(d && !d.deleted && d.storeKey) keys.push(d.storeKey);
    }));
    const vals = await store.many(keys);
    const byStore = new Map(keys.map((k, i) => [k, vals[i]]));
    const out = profiles.map(([id, p]) => ({
      user: cleanUser(Object.assign({}, p.user || {}, {id})),
      userAt: p.userAt || '',
      deleted: !!p.deleted,
      docs: Object.entries(p.docs || {}).map(([key, d]) => ({
        key, rev: d.rev, at: d.at, schema: d.schema, deviceId: d.deviceId,
        deleted: !!d.deleted, value: d.deleted ? null : (byStore.get(d.storeKey) ?? null)
      }))
    }));
    return send(res, 200, {ok: true, profiles: out});
  }

  fail(res, 400, 'unknown_action');
};
