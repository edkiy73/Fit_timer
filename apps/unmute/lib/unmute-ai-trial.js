'use strict';

const TRIAL_MAX_CALLS=10;
const TRIAL_WINDOW_MS=24*60*60*1000;
const TRIAL_RECORD_TTL=10*365*24*60*60;

const clean=value=>String(value||'').trim().slice(0,120);
const validToken=value=>/^[A-Za-z0-9_-]{16,120}$/.test(value);

function trialKey(accountHash){
  return 'unmute:ai-trial:'+accountHash;
}

function parseRecord(raw){
  if(!raw)return null;
  try{
    const value=JSON.parse(raw);
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const id=clean(value.id);
    const scope=clean(value.scope);
    const startedAt=Number(value.startedAt)||0;
    const calls=Math.max(0,Math.floor(Number(value.calls)||0));
    if(!validToken(id)||!scope||!startedAt)return null;
    return {id,scope,startedAt,calls};
  }catch(_){
    return null;
  }
}

function denied(code='premium_required',status=402){
  return {allowed:false,code,status};
}

// «Почему?» without Plus: a few answer explanations per account, ever (owner decision).
const FREE_EXPLAIN_CALLS=3;

function explainKey(accountHash){
  return 'unmute:ai-explain-free:'+accountHash;
}

async function authorizeFreeExplain({accountHash,store}){
  return store.withLock('lock:unmute-ai-explain:'+accountHash,async()=>{
    const key=explainKey(accountHash);
    const used=Math.max(0,Math.floor(Number(await store.get(key))||0));
    if(used>=FREE_EXPLAIN_CALLS)return denied('free_explain_used');
    await store.set(key,String(used+1),TRIAL_RECORD_TTL);
    return {
      allowed:true,
      meta:{mode:'free',remaining:FREE_EXPLAIN_CALLS-used-1,maxCalls:FREE_EXPLAIN_CALLS}
    };
  });
}

async function authorizeUnMuteAI({accountHash,body,store,now=Date.now()}){
  const kind=String(body&&body.kind||'');
  if(kind==='answer.explain')return authorizeFreeExplain({accountHash,store});
  if(kind!=='talk.reply'&&kind!=='talk.review')return denied();

  const trial=body&&body.trial&&typeof body.trial==='object'?body.trial:null;
  const id=clean(trial&&trial.id);
  const scope=clean(trial&&trial.scope);
  if(!validToken(id)||!scope)return denied();

  return store.withLock('lock:unmute-ai-trial:'+accountHash,async()=>{
    const key=trialKey(accountHash);
    const raw=await store.get(key);
    const existing=parseRecord(raw);

    if(raw&&!existing)return denied('trial_used');

    if(!existing){
      if(kind!=='talk.reply'||body.start!==true)return denied();
      const record={id,scope,startedAt:now,calls:1};
      await store.set(key,JSON.stringify(record),TRIAL_RECORD_TTL);
      return {
        allowed:true,
        meta:{
          mode:'trial',
          remaining:TRIAL_MAX_CALLS-record.calls,
          maxCalls:TRIAL_MAX_CALLS
        }
      };
    }

    if(existing.id!==id||existing.scope!==scope)return denied('trial_used');
    if(now-existing.startedAt>TRIAL_WINDOW_MS)return denied('trial_used');
    if(existing.calls>=TRIAL_MAX_CALLS)return denied('trial_limit',429);

    const next={...existing,calls:existing.calls+1};
    await store.set(key,JSON.stringify(next),TRIAL_RECORD_TTL);
    return {
      allowed:true,
      meta:{
        mode:'trial',
        remaining:TRIAL_MAX_CALLS-next.calls,
        maxCalls:TRIAL_MAX_CALLS
      }
    };
  });
}

module.exports={
  authorizeUnMuteAI,
  TRIAL_MAX_CALLS,
  TRIAL_WINDOW_MS,
  FREE_EXPLAIN_CALLS,
  explainKey,
  trialKey,
  parseRecord
};
