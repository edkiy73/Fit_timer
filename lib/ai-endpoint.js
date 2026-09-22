/* Premium AI: авторизация, месячные лимиты и 30-дневный журнал качества. */
const crypto = require('crypto');
const { store } = require('./store');
const { send, fail, sameSecret, cors, rateOk } = require('./util');
const { getSettings, generate } = require('./ai');

const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const KINDS = /^(program\.create|program\.modify|video\.parse|exercise\.create|exercise\.modify|exercise\.replace|image\.cover|image\.exercise)$/;

async function bodyOf(req){
  if(req.body && typeof req.body === 'object') return req.body;
  const chunks = []; let size = 0;
  for await(const c of req){ size += c.length; if(size > 160000) throw new Error('too_large'); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function handleAI(req, res){
  if(cors(req, res)) return;

  // Публичная конфигурация живёт в этой же функции, чтобы не превышать лимит
  // количества Serverless Functions на Vercel. /api/config переписывается сюда.
  if(req.method === 'GET' && req.query && req.query.public_config === '1'){
    const s = await getSettings();
    return send(res, 200, {ai:{enabled:s.enabled}, prices:s.prices, payment:s.payment});
  }

  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'ai', 120))) return fail(res, 429, 'rate_limited');
  let body;
  try{ body = await bodyOf(req); }catch(e){ return fail(res, 413, 'too_large'); }

  const email = String(body.email || '').trim().toLowerCase().slice(0,120);
  const deviceId = String(body.deviceId || '').trim().slice(0,80);
  const token = String(body.token || '');
  if(!EMAIL.test(email) || !deviceId || !token) return fail(res, 401, 'auth_required');
  const mh = sha(email).slice(0,32);
  let acc = null;
  try{ acc = JSON.parse(await store.get(`a:${mh}`)); }catch(e){}
  const dev = acc && acc.syncDevices && acc.syncDevices[deviceId];
  if(!dev || !sameSecret(sha(token), dev.h || '')) return fail(res, 403, 'bad_sync_token');
  if((Date.parse(acc.sub && acc.sub.until) || 0) < Date.now()) return fail(res, 402, 'premium_required');

  const settings = await getSettings();
  if(!settings.enabled) return fail(res, 503, 'ai_disabled');
  const kind = String(body.kind || '');
  if(!KINDS.test(kind)) return fail(res, 400, 'bad_kind');
  const type = kind.startsWith('image.') ? 'image' : 'text';
  const bucket = type === 'image' ? 'image' : (/^program\.|^video\./.test(kind) ? 'heavy' : 'light');
  const prompt = String(body.prompt || '').trim();
  if(!prompt || prompt.length > 120000) return fail(res, 400, 'bad_prompt');

  const month = new Date().toISOString().slice(0,7);
  const used = await store.incr(`ai:use:${month}:${mh}:${bucket}`, 70 * 86400);
  const limit = settings.limits[bucket];
  if(limit === 0 || used > limit) return fail(res, 429, 'ai_limit', {bucket,used:Math.max(0,used-1),limit});

  const at = new Date().toISOString();
  try{
    const aspectRatio = kind === 'image.exercise' ? '4:3' : (kind === 'image.cover' ? '1:1' : null);
    const result = await generate(type, settings, prompt, {aspectRatio});
    const log = {at,account:mh,kind,provider:result.provider,model:result.model,
      fallback:result.fallback,prompt:prompt.slice(0,120000),
      result:(result.text || '[изображение]').slice(0,120000),ok:true};
    await store.push(`ai:log:${at.slice(0,10)}`, JSON.stringify(log), settings.retentionDays * 86400);
    return send(res, 200, Object.assign({ok:true,kind,usage:{bucket,used,limit}}, result));
  }catch(e){
    const log = {at,account:mh,kind,ok:false,error:String(e && e.message || e).slice(0,500)};
    try{ await store.push(`ai:log:${at.slice(0,10)}`, JSON.stringify(log), settings.retentionDays * 86400); }catch(_){}
    return fail(res, e.status && e.status < 500 ? e.status : 502, 'ai_failed', {detail:String(e.message || e).slice(0,500)});
  }
}

module.exports = { handleAI };
