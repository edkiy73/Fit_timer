/* Server store engines: modes, mirroring, Upstash/Supabase wire format and the
   Upstash → Supabase migration (copy + verify + repair). No network: Upstash and
   Supabase are replaced by fake fetch or by independent in-memory engines. */
let bad=0;
const ok=(name,cond,extra)=>{
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(extra==null?'':' → '+extra));
};

process.env.SUPABASE_URL='https://demo-project.supabase.co';
process.env.SUPABASE_SECRET_KEY='sb_secret_store_test';
process.env.KV_REST_API_URL='https://demo-redis.upstash.io';
process.env.KV_REST_API_TOKEN='redis_token_test';
delete process.env.ALLOW_MEMORY_STORE;

const { store } = require('../../../packages/core/server/store');
const migration = require('../../../packages/core/server/store-migration');

const originalFetch=global.fetch;
const realRedis=store.BACKENDS.redis;
const realSupabase=store.BACKENDS.supabase;

function fakeEngine(name){
  const e=store.createMemoryBackend(name);
  e.configured=()=>true;
  return e;
}
function useEngines(redis,supabase){
  store.BACKENDS.redis=redis;
  store.BACKENDS.supabase=supabase;
}
async function dump(engine,key){
  const [type,ttl]=await engine.exec([['TYPE',key],['TTL',key]]);
  const [value]=await engine.exec([type==='list'?['LRANGE',key,'0','-1']:['GET',key]]);
  return {type,ttl,value};
}
async function runAll(fn,args){
  const total={};
  let cursor='0';
  do{
    const step=await fn(Object.assign({cursor,count:3},args));
    Object.keys(step).forEach(k=>{ if(typeof step[k]==='number') total[k]=(total[k]||0)+step[k]; });
    cursor=step.cursor;
  }while(cursor!=='0');
  return total;
}

(async()=>{
  try{
    // ---------- wire format ----------
    let seen=[];
    global.fetch=async(url,opts)=>{
      const body=JSON.parse(opts.body);
      seen.push({url:String(url),body,headers:opts.headers});
      if(String(url).includes('/rest/v1/rpc/kv_exec')){
        return {ok:true,status:200,json:async()=>body.cmds.map(c=>c[0]==='GET'?'v':'OK')};
      }
      const cmds=String(url).endsWith('/pipeline')?body:[body];
      const out=cmds.map(c=>({result:c[0]==='EVAL'?1:(c[0]==='GET'?'v':'OK')}));
      return {ok:true,status:200,json:async()=>String(url).endsWith('/pipeline')?out:out[0]};
    };

    process.env.APPBASE_STORE='supabase';
    ok('supabase mode is configured without memory',store.configured()===true);
    ok('info names engines without secrets',
      store.info().primary==='supabase' && !JSON.stringify(store.info()).includes('sb_secret_store_test'),
      JSON.stringify(store.info()));
    seen=[];
    const got=await store.get('a:1');
    ok('supabase engine calls kv_exec RPC once',
      seen.length===1 && seen[0].url==='https://demo-project.supabase.co/rest/v1/rpc/kv_exec'
      && JSON.stringify(seen[0].body)==='{"cmds":[["GET","a:1"]]}' && got==='v',
      JSON.stringify(seen));
    ok('supabase secret stays in server headers',
      seen[0].headers.apikey==='sb_secret_store_test' && seen[0].headers.Authorization==='Bearer sb_secret_store_test');
    seen=[];
    await store.push('p:1:reports','r',60);
    ok('push sends RPUSH + EXPIRE in one request',
      seen.length===1 && JSON.stringify(seen[0].body.cmds)==='[["RPUSH","p:1:reports","r"],["EXPIRE","p:1:reports","60"]]',
      JSON.stringify(seen.map(x=>x.body)));

    process.env.APPBASE_STORE='redis';
    seen=[];
    await store.withLock('lock:sync:x',async()=>1);
    ok('redis lock release is compare-and-delete EVAL',
      seen.length===2 && seen[1].body[0]==='EVAL' && seen[1].body[3]==='lock:sync:x',
      JSON.stringify(seen.map(x=>x.body)));
    seen=[];
    await realRedis.exec([['KVPUT','l','list','["a","b"]','100'],['KVPUT','s','string','"x"','-1']]);
    ok('redis KVPUT expands to native commands',
      JSON.stringify(seen[0].body)==='[["DEL","l"],["RPUSH","l","a","b"],["EXPIRE","l","100"],["DEL","s"],["SET","s","x"]]',
      JSON.stringify(seen[0].body));

    process.env.APPBASE_STORE='mongo';
    ok('unknown mode is not configured',store.configured()===false && store.info().modeValid===false);
    global.fetch=originalFetch;

    // ---------- mirroring ----------
    const up=fakeEngine('redis'), sb=fakeEngine('supabase');
    useEngines(up,sb);
    process.env.APPBASE_STORE='redis+supabase';
    await store.set('a:acc','{"n":1}');
    await store.incr('t:h:opens');
    await store.push('p:x:reports','r1');
    await store.incr('rl:auth:ip:1',60);
    await store.withLock('lock:sync:acc',async()=>{ await store.set('s:acc:m','m1'); });
    ok('dual mode reads from the primary engine',await store.get('a:acc')==='{"n":1}');
    ok('dual mode mirrors writes',
      (await dump(sb,'a:acc')).value==='{"n":1}' && (await dump(sb,'t:h:opens')).value==='1'
      && JSON.stringify((await dump(sb,'p:x:reports')).value)==='["r1"]' && (await dump(sb,'s:acc:m')).value==='m1');
    ok('rate-limit and lock keys are not mirrored',
      (await dump(sb,'rl:auth:ip:1')).type==='none' && (await dump(sb,'lock:sync:acc')).type==='none');
    ok('mirror keeps TTL',(await dump(sb,'a:acc')).ttl>360*24*3600);

    const failing=fakeEngine('supabase');
    failing.exec=async()=>{ throw new Error('supabase_http_503'); };
    useEngines(up,failing);
    await store.set('a:after-failure','1');
    ok('mirror failure does not fail the request',await store.get('a:after-failure')==='1');
    ok('mirror failure is counted in the primary',(await dump(up,store.MIRROR_FAIL_KEY)).value==='1');
    let status=await migration.migrationStatus();
    ok('status reports mirror failures',status.mirrorFailed===1 && status.paired===true,JSON.stringify(status));
    await migration.resetMirrorFailures();
    useEngines(up,sb);

    // ---------- migration ----------
    await up.exec([
      ['SET','c:1','{"id":1}','EX','3600'],
      ['SET','u:forever','x'],
      ['RPUSH','c:approved','1','2','3'],
      ['SET','rl:ignored','1','EX','60'],
      ['SET','a:bulk:1','1'],['SET','a:bulk:2','2'],['SET','a:bulk:3','3'],['SET','a:bulk:4','4']
    ]);
    const before=await runAll(migration.verifyBatch,{});
    ok('verify finds keys missing in mirror before copy',before.missing>=7,JSON.stringify(before));
    const copied=await runAll(migration.copyBatch,{});
    ok('copy moves every non-ephemeral key',copied.copied>=10 && copied.skipped>=1,JSON.stringify(copied));
    ok('copy skips rate-limit keys',(await dump(sb,'rl:ignored')).type==='none');
    ok('copy keeps list order',JSON.stringify((await dump(sb,'c:approved')).value)==='["1","2","3"]');
    ok('copy keeps expiring and permanent TTL',
      (await dump(sb,'c:1')).ttl>3500 && (await dump(sb,'u:forever')).ttl===-1);
    const clean=await runAll(migration.verifyBatch,{});
    const cleanReverse=await runAll(migration.verifyBatch,{reverse:true});
    ok('verify is clean after copy',
      !clean.missing && !clean.different && !clean.ttlDifferent && !clean.extra && !cleanReverse.extra,
      JSON.stringify({clean,cleanReverse}));

    await sb.exec([['SET','c:1','stale'],['SET','zz:extra','1'],['DEL','u:forever']]);
    const dirty=await runAll(migration.verifyBatch,{});
    const dirtyReverse=await runAll(migration.verifyBatch,{reverse:true});
    ok('verify detects different, missing and extra keys',
      dirty.different===1 && dirty.missing===1 && dirtyReverse.extra===1,
      JSON.stringify({dirty,dirtyReverse}));
    await runAll(migration.verifyBatch,{repair:true});
    await runAll(migration.verifyBatch,{repair:true,reverse:true});
    const repaired=await runAll(migration.verifyBatch,{});
    const repairedReverse=await runAll(migration.verifyBatch,{reverse:true});
    ok('repair restores full parity',
      !repaired.missing && !repaired.different && !repaired.ttlDifferent && !repairedReverse.extra
      && (await dump(sb,'c:1')).value==='{"id":1}' && (await dump(sb,'zz:extra')).type==='none',
      JSON.stringify({repaired,repairedReverse}));

    // cutover: Supabase becomes primary, Upstash keeps a warm copy
    process.env.APPBASE_STORE='supabase+redis';
    ok('reversed pair reads Supabase',await store.get('c:1')==='{"id":1}' && store.info().primary==='supabase');
    await store.set('a:new','after-cutover');
    ok('reversed pair mirrors back to Upstash for rollback',(await dump(up,'a:new')).value==='after-cutover');

    process.env.APPBASE_STORE='supabase';
    let notPaired=null;
    try{ await migration.copyBatch({}); }catch(e){ notPaired=e; }
    ok('migration refuses to run without a mirror',notPaired && notPaired.status===409);
  }catch(e){
    ok('store engines test does not throw',false,e && e.stack);
  }finally{
    global.fetch=originalFetch;
    useEngines(realRedis,realSupabase);
    delete process.env.APPBASE_STORE;
  }
  if(bad){ console.log('\nПровалено: '+bad); process.exit(1); }
  console.log('\nВсе проверки хранилища прошли');
})();
