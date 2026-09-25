/* Premium AI: авторизация, месячные лимиты и 30-дневный журнал качества. */
const crypto = require('crypto');
const { store } = require('./store');
const { send, fail, sameSecret, cors, rateOkScoped } = require('./util');
const { getSettings, generate } = require('./ai');
const { registry: AI_ACTIONS } = require('./fit-ai-actions');

const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

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
    return send(res, 200, {ai:{enabled:s.enabled}, prices:s.prices, payment:s.payment, update:s.update});
  }

  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  // AI — платный ресурс. Если защитный счётчик недоступен, запрос не запускаем:
  // fail-open здесь превращает сбой Redis в неограниченный расход провайдера.
  if(!(await rateOkScoped(req, 'ai', 120, '', 3600, true))) return fail(res, 429, 'rate_limited');
  let body;
  try{ body = await bodyOf(req); }catch(e){ return fail(res, 413, 'too_large'); }

  const email = String(body.email || '').trim().toLowerCase().slice(0,120);
  const deviceId = String(body.deviceId || '').trim().slice(0,80);
  const token = String(body.token || '');
  if(!EMAIL.test(email) || !deviceId || !token) return fail(res, 401, 'auth_required');
  const mh = sha(email).slice(0,32);
  if(!(await rateOkScoped(req, 'ai-account', 90, mh, 3600, true))){
    return fail(res, 429, 'rate_limited');
  }
  let acc = null;
  try{ acc = JSON.parse(await store.get(`a:${mh}`)); }catch(e){}
  const dev = acc && acc.syncDevices && acc.syncDevices[deviceId];
  if(!dev || !sameSecret(sha(token), dev.h || '')) return fail(res, 403, 'bad_sync_token');
  if((Date.parse(acc.sub && acc.sub.until) || 0) < Date.now()) return fail(res, 402, 'premium_required');

  const settings = await getSettings();
  if(!settings.enabled) return fail(res, 503, 'ai_disabled');
  const kind = String(body.kind || '');
  const action = AI_ACTIONS.get(kind);
  if(!action) return fail(res, 400, 'bad_kind');
  const type = action.type;
  const bucket = action.bucket;
  const prompt = String(body.prompt || '').trim();
  if(!prompt || prompt.length > 120000) return fail(res, 400, 'bad_prompt');

  const month = new Date().toISOString().slice(0,7);
  const used = await store.incr(`ai:use:${month}:${mh}:${bucket}`, 70 * 86400);
  const limit = settings.limits[bucket];
  if(limit === 0 || used > limit) return fail(res, 429, 'ai_limit', {bucket,used:Math.max(0,used-1),limit});

  const at = new Date().toISOString();
  try{
    const result = typeof action.run === 'function'
      ? await action.run({settings,body,prompt,generate})
      : await generate(type, settings, prompt, {
          aspectRatio:action.aspectRatio || null,
          validate:action.validate || null
        });
    const log = {at,account:mh,kind,provider:result.provider,model:result.model,
      fallback:result.fallback,prompt:prompt.slice(0,120000),
      result:(result.text || '[изображение]').slice(0,120000),ok:true};
    await store.push(`ai:log:${at.slice(0,10)}`, JSON.stringify(log), settings.retentionDays * 86400);
    return send(res, 200, Object.assign({ok:true,kind,usage:{bucket,used,limit}}, result));
  }catch(e){
    const validation = e && e.validation;
    const log = {at,account:mh,kind,ok:false,error:String(e && e.message || e).slice(0,500),
      validation:validation ? {reason:validation.reason || '',missing:(validation.missing || []).slice(0,20)} : undefined};
    try{ await store.push(`ai:log:${at.slice(0,10)}`, JSON.stringify(log), settings.retentionDays * 86400); }catch(_){}
    if(e && e.code === 'ai_timeout') return fail(res, 504, 'ai_timeout');
    if(action && typeof action.publicError === 'function'){
      const mapped = action.publicError(e);
      if(mapped) return fail(res,mapped.status || 422,mapped.code || 'ai_failed',mapped.extra || {});
    }
    const malformed = !!validation || /malformed_response|missing_fields|exercise_count|no_exercises|no_days|bad_image|video_.*_changed|video_exercise_count_mismatch/.test(String(e && e.message || ''));
    // reason/missing — коды проверки протокола (не текст ответа и не секреты):
    // по ним и приложение, и человек видят, ЧЕГО не хватило в ответе ИИ
    return fail(res, e.status && e.status < 500 ? e.status : 502, malformed ? 'ai_bad_response' : 'ai_failed', {
      detail: malformed ? 'AI returned an incomplete or invalid result' : String(e.message || e).slice(0,500),
      reason: malformed ? String((validation && validation.reason) || e.message || '').slice(0,60) : undefined,
      missing: malformed && validation ? (validation.missing || []).slice(0,8) : undefined
    });
  }
}

module.exports = { handleAI };
