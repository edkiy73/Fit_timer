'use strict';

const URL_KEYS = ['SUPABASE_URL'];
const SECRET_KEYS = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

function firstEnv(keys){
  for(const key of keys){
    const value=String(process.env[key]||'').trim();
    if(value) return [key,value];
  }
  return [null,''];
}

function normalizeBase(value){
  return String(value||'').trim().replace(/\/$/,'');
}

const [urlKey,rawUrl]=firstEnv(URL_KEYS);
const [secretKeyName,secret]=firstEnv(SECRET_KEYS);
const baseUrl=normalizeBase(rawUrl);

/* Self-hosted PostgREST instead of a Supabase project (apps/feture/docs/infra/migration-plan.md).
   APPBASE_REST_URL is PostgREST's own root (e.g. http://rest:3000 inside the compose network) and
   APPBASE_REST_KEY a JWT with role=service_role signed by its jwt-secret. Callers keep their
   `/rest/v1/...` paths: the prefix is dropped here. Storage, Auth and Realtime do not exist there,
   so any other path fails loudly (501) instead of reaching a wrong host. Without these two
   variables nothing changes for the apps that stay on Supabase. */
const restBase=normalizeBase(process.env.APPBASE_REST_URL);
const restKey=String(process.env.APPBASE_REST_KEY||'').trim();
function selfHosted(){
  return /^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(restBase) && !!restKey;
}

function configured(){
  if(selfHosted()) return true;
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl) && !!secret;
}

function target(path){
  if(!selfHosted()) return {url:baseUrl+path, key:secret, rest:false};
  const p=String(path);
  if(p!=='/rest/v1' && !p.startsWith('/rest/v1/') && !p.startsWith('/rest/v1?'))
    throw Object.assign(new Error('supabase_feature_unavailable'),{status:501});
  return {url:restBase+(p.slice('/rest/v1'.length)||'/'), key:restKey, rest:true};
}

function info(){
  const seen=Object.keys(process.env)
    .filter(k=>/^SUPABASE_/.test(k))
    .sort();
  return {
    configured:configured(),
    selfHosted:selfHosted(),
    urlConfigured:!!baseUrl,
    secretConfigured:!!secret,
    urlVar:urlKey,
    secretVar:secretKeyName,
    seen
  };
}

async function request(path, options={}){
  if(!configured()) throw Object.assign(new Error('supabase_not_configured'),{status:503});
  const to=target(path);
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(), Math.max(1000, Number(options.timeoutMs)||8000));
  try{
    const res=await fetch(to.url,{
      method:options.method||'GET',
      headers:Object.assign(to.rest?{}:{apikey:to.key},{
        Authorization:'Bearer '+to.key,
        Accept:'application/json'
      }, options.headers||{}),
      body:options.body,
      signal:ctl.signal
    });
    if(!res.ok){
      const err=Object.assign(new Error('supabase_http_'+res.status),{status:res.status});
      try{
        const j=await res.json();
        err.detail=String((j&&j.message)||'').slice(0,300);
      }catch(_){}
      throw err;
    }
    return res;
  }catch(e){
    if(ctl.signal.aborted) throw Object.assign(new Error('supabase_timeout'),{status:504});
    throw e;
  }finally{
    clearTimeout(timer);
  }
}

async function selfTest(){
  const started=Date.now();
  // PostgREST root returns its schema document. This verifies project URL, secret
  // key and database API reachability without requiring any application table.
  const res=await request('/rest/v1/',{timeoutMs:8000});
  await res.text();
  return {ok:true,latencyMs:Date.now()-started};
}

module.exports={configured,selfHosted,info,request,selfTest};
