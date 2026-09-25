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

function configured(){
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl) && !!secret;
}

function info(){
  const seen=Object.keys(process.env)
    .filter(k=>/^SUPABASE_/.test(k))
    .sort();
  return {
    configured:configured(),
    urlConfigured:!!baseUrl,
    secretConfigured:!!secret,
    urlVar:urlKey,
    secretVar:secretKeyName,
    seen
  };
}

async function request(path, options={}){
  if(!configured()) throw Object.assign(new Error('supabase_not_configured'),{status:503});
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(), Math.max(1000, Number(options.timeoutMs)||8000));
  try{
    const res=await fetch(baseUrl+path,{
      method:options.method||'GET',
      headers:Object.assign({
        apikey:secret,
        Authorization:'Bearer '+secret,
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

module.exports={configured,info,request,selfTest};
