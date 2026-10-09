/* Premium AI: авторизация, месячные лимиты и 30-дневный журнал качества. */
const crypto = require('crypto');
const { store } = require('./store');
const { send, fail, sameSecret, cors, rateOkScoped } = require('./util');
const { getSettings, generate } = require('./ai');
const { capabilities } = require('./capabilities-core');

const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

async function bodyOf(req){
  if(req.body && typeof req.body === 'object') return req.body;
  const chunks = []; let size = 0;
  for await(const c of req){ size += c.length; if(size > 160000) throw new Error('too_large'); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

/* The product passes its AI action registry (lib/ai-action-registry.js) at composition time. */
function createAIHandler(AI_ACTIONS, options = {}){
  if(!AI_ACTIONS || typeof AI_ACTIONS.get !== 'function') throw new Error('ai_action_registry_required');
  const authorize = typeof options.authorize === 'function' ? options.authorize : null;
  return async function handleAI(req, res){
    if(cors(req, res)) return;

    // Публичная конфигурация живёт в этой же функции, чтобы не превышать лимит
    // количества Serverless Functions на Vercel. /api/config переписывается сюда.
    if(req.method === 'GET' && req.query && req.query.public_config === '1'){
      const s = await getSettings();
      const {terms = '', ...legal} = s.legal || {};
      // The terms text is long: only the terms page asks for it (?terms=1), not every app start.
      if(req.query.terms === '1') return send(res, 200, {terms, legal});
      return send(res, 200, {ai:{enabled:!!s.enabled && capabilities().enabled('ai')}, prices:s.prices, payment:s.payment, update:s.update, legal});
    }

    if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
    if(!capabilities().enabled('ai')) return fail(res, 404, 'capability_disabled');
    if(!store.configured()) return fail(res, 503, 'no_store');
    // AI — платный ресурс. Если защитный счётчик недоступен, запрос не запускаем:
    // fail-open здесь превращает сбой Redis в неограниченный расход провайдера.
    if(!(await rateOkScoped(req, 'ai', 120, '', 3600, true))) return fail(res, 429, 'rate_limited');
    let body;
    try{ body = await bodyOf(req); }catch(e){ return fail(res, 413, 'too_large'); }

    const email = String(body.email || '').trim().toLowerCase().slice(0,120);
    const deviceId = String(body.deviceId || '').trim().slice(0,80);
    // Older clients send `token`; React apps send `syncToken` (authClient.authFields()).
    const token = String(body.token || body.syncToken || '');
    if(!EMAIL.test(email) || !deviceId || !token) return fail(res, 401, 'auth_required');
    const mh = sha(email).slice(0,32);
    if(!(await rateOkScoped(req, 'ai-account', 90, mh, 3600, true))){
      return fail(res, 429, 'rate_limited');
    }
    let acc = null;
    try{ acc = JSON.parse(await store.get(`a:${mh}`)); }catch(e){}
    const dev = acc && acc.syncDevices && acc.syncDevices[deviceId];
    if(!dev || !sameSecret(sha(token), dev.h || '')) return fail(res, 403, 'bad_sync_token');

    const premium = (Date.parse(acc.sub && acc.sub.until) || 0) >= Date.now();
    let accessMeta = null;
    // A product authorizer may hand back release(): it undoes the access it just granted
    // (e.g. a free trial) when the request then fails, so a provider error never burns it.
    let release = null;
    const failReleased = async (...args) => {
      if(release){ try{ await release(); }catch(_){} release = null; }
      return fail(...args);
    };
    if(!premium){
      if(!authorize) return fail(res, 402, 'premium_required');
      let decision;
      try{
        decision = await authorize({
          account:acc,
          accountHash:mh,
          body,
          store,
          now:Date.now()
        });
      }catch(_){
        return fail(res, 503, 'ai_access_unavailable');
      }
      if(!decision || decision.allowed !== true){
        return fail(
          res,
          Number(decision && decision.status) || 402,
          String(decision && decision.code || 'premium_required')
        );
      }
      accessMeta = decision.meta || null;
      if(typeof decision.release === 'function') release = decision.release;
    }

    const settings = await getSettings();
    if(!settings.enabled) return failReleased(res, 503, 'ai_disabled');
    const kind = String(body.kind || '');
    const action = AI_ACTIONS.get(kind);
    if(!action) return failReleased(res, 400, 'bad_kind');
    const type = action.type;
    const bucket = action.bucket;
    // Действие со своим контрактом собирает prompt на сервере из структурированного
    // input: клиент не присылает текст prompt'а и не может подменить инструкции/схему.
    let prompt;
    if(typeof action.buildPrompt === 'function'){
      try{ prompt = String(action.buildPrompt({body, settings}) || '').trim(); }
      catch(e){ return failReleased(res, 400, String(e && e.code || 'bad_input'), {detail:String(e && e.message || '').slice(0,200)}); }
    }else prompt = String(body.prompt || '').trim();
    if(!prompt || prompt.length > 120000) return failReleased(res, 400, 'bad_prompt');

    // A product can opt into small sequential AI parts. The server remembers
    // completed responses per authenticated account and charges the first part
    // once; clients cannot mint uncharged continuations or change the input.
    let batch = null, batchKey = '', batchRecord = null, batchHash = '';
    if(typeof action.batch === 'function'){
      try{ batch = action.batch(body); }
      catch(e){ return failReleased(res, 400, String(e.code || 'bad_batch')); }
    }
    if(batch){
      batchKey = `ai:batch:${mh}:${kind}:${batch.id}`;
      batchHash = sha(JSON.stringify({kind, input:body.input, days:batch.days}));
      try{
        const raw = await store.get(batchKey);
        batchRecord = raw ? JSON.parse(raw) : null;
      }catch(_){ return failReleased(res, 503, 'ai_batch_store_unavailable'); }
      if(batchRecord && (batchRecord.hash !== batchHash
        || batchRecord.total !== batch.days.length
        || !Array.isArray(batchRecord.parts))){
        return failReleased(res, 409, 'ai_batch_mismatch');
      }
      if(batch.index > 0 && !batchRecord) return failReleased(res, 409, 'ai_batch_missing');
      if(batchRecord && batch.index > batchRecord.parts.length)
        return failReleased(res, 409, 'ai_batch_out_of_order');
    }

    const month = new Date().toISOString().slice(0,7);
    const limit = settings.limits[bucket];
    // Replaying a successful part is free and returns the exact same verified JSON.
    if(batchRecord && batch.index < batchRecord.parts.length){
      return send(res, 200, {ok:true, kind, usage:{bucket,used:batchRecord.used,limit},
        result:batchRecord.parts[batch.index]});
    }
    const continuing = !!(batchRecord && batch.index > 0);
    const used = continuing ? batchRecord.used
      : await store.incr(`ai:use:${month}:${mh}:${bucket}`, 70 * 86400);
    if(!continuing && (limit === 0 || used > limit))
      return failReleased(res, 429, 'ai_limit', {bucket,used:Math.max(0,used-1),limit});

    const at = new Date().toISOString();
    try{
      const result = typeof action.run === 'function'
        ? await action.run({settings,body,prompt,generate})
        : await generate(type, settings, prompt, {
            aspectRatio:action.aspectRatio || null,
            validate:action.validate || null,
            schema:action.schema || null,
            maxOutputTokens:action.maxOutputTokens || null
          });
      if(batch){
        // Store the verified response *before* acknowledging the part, so a lost
        // mobile connection can replay instead of wasting another model call.
        const record = batchRecord || {hash:batchHash,total:batch.days.length,used,parts:[]};
        if(batch.index !== record.parts.length) throw new Error('ai_batch_out_of_order');
        record.parts.push(result);
        await store.set(batchKey, JSON.stringify(record), 60 * 60);
      }
      const log = {at,account:mh,kind,provider:result.provider,model:result.model,
        fallback:result.fallback,prompt:prompt.slice(0,120000),
        result:(result.text || '[изображение]').slice(0,120000),ok:true};
      await store.push(`ai:log:${at.slice(0,10)}`, JSON.stringify(log), settings.retentionDays * 86400);
      return send(res, 200, Object.assign(
        {ok:true,kind,usage:{bucket,used,limit}},
        accessMeta ? {access:accessMeta} : {},
        result
      ));
    }catch(e){
      const validation = e && e.validation;
      const log = {at,account:mh,kind,ok:false,error:String(e && e.message || e).slice(0,500),
        validation:validation ? {reason:validation.reason || '',missing:(validation.missing || []).slice(0,20)} : undefined};
      try{ await store.push(`ai:log:${at.slice(0,10)}`, JSON.stringify(log), settings.retentionDays * 86400); }catch(_){}
      if(e && e.code === 'ai_timeout') return failReleased(res, 504, 'ai_timeout');
      if(e && e.code === 'ai_refused') return failReleased(res, 422, 'ai_refused');
      if(action && typeof action.publicError === 'function'){
        const mapped = action.publicError(e);
        if(mapped) return failReleased(res,mapped.status || 422,mapped.code || 'ai_failed',mapped.extra || {});
      }
      const malformed = !!validation || AI_ACTIONS.isMalformed(e && e.message);
      // reason/missing — коды проверки протокола (не текст ответа и не секреты):
      // по ним и приложение, и человек видят, ЧЕГО не хватило в ответе ИИ
      return failReleased(res, e.status && e.status < 500 ? e.status : 502, malformed ? 'ai_bad_response' : 'ai_failed', {
        detail: malformed ? 'AI returned an incomplete or invalid result' : String(e.message || e).slice(0,500),
        reason: malformed ? String((validation && validation.reason) || e.message || '').slice(0,60) : undefined,
        missing: malformed && validation ? (validation.missing || []).slice(0,8) : undefined
      });
    }
  };
}

module.exports = { createAIHandler };
