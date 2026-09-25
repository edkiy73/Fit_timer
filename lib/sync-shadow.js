'use strict';

const Supabase=require('./supabase');
const {documentStore}=require('./supabase-document-store');
const {store}=require('./store');

const METRIC_TTL=30*24*3600;
const writeEnabled=()=>Supabase.configured()&&process.env.SUPABASE_SHADOW_WRITE==='1';
const compareEnabled=()=>Supabase.configured()&&process.env.SUPABASE_SHADOW_COMPARE==='1';

const idOf=d=>String(d.profileId||'')+'\n'+String(d.key||'');
const same=(a,b)=>
  Number(a.rev||0)===Number(b.rev||0)
  && Number(a.schema||0)===Number(b.schema||0)
  && String(a.deviceId||'')===String(b.deviceId||'')
  && !!a.deleted===!!b.deleted
  && (a.deleted||String(a.value??'')===String(b.value??''));

const safeError=e=>String(e&&e.message||e||'unknown_error').slice(0,200);
const metricGet=async key=>{
  try{return await store.get(key);}catch(_){return null;}
};
const metricSet=async(key,value)=>{
  try{await store.set(key,typeof value==='string'?value:JSON.stringify(value),METRIC_TTL);}catch(_){}
};
const metricIncr=async key=>{
  try{return await store.incr(key,METRIC_TTL);}catch(_){return null;}
};
const jsonMetric=async key=>{
  try{return JSON.parse(await metricGet(key)||'null');}catch(_){return null;}
};

async function writeDocument(doc){
  if(!writeEnabled()) return {enabled:false,ok:false};
  try{
    await documentStore.upsert(doc);
    return {enabled:true,ok:true};
  }catch(e){
    return {enabled:true,ok:false,error:safeError(e)};
  }
}

async function recordWriteBatch(results){
  if(!writeEnabled()) return {enabled:false};
  const list=Array.isArray(results)?results:[];
  const failed=list.filter(x=>x&&x.enabled&&!x.ok);
  const summary={
    at:new Date().toISOString(),
    attempted:list.filter(x=>x&&x.enabled).length,
    written:list.filter(x=>x&&x.enabled&&x.ok).length,
    failed:failed.length,
    lastError:failed.length?safeError(failed[failed.length-1].error):null
  };
  await metricSet('migration:supabase:shadow:write:last',summary);
  await metricIncr('migration:supabase:shadow:write:batches');
  if(failed.length) await metricIncr('migration:supabase:shadow:write:error_batches');
  return {enabled:true,summary};
}

async function purgeProfile(accountHash,profileId){
  if(!Supabase.configured()) return {enabled:false,ok:false};
  try{
    await documentStore.purgeProfile(accountHash,profileId);
    return {enabled:true,ok:true};
  }catch(e){
    return {enabled:true,ok:false,error:safeError(e)};
  }
}

async function purgeAccount(accountHash){
  if(!Supabase.configured()) return {enabled:false,ok:false};
  try{
    await documentStore.purgeAccount(accountHash);
    return {enabled:true,ok:true};
  }catch(e){
    return {enabled:true,ok:false,error:safeError(e)};
  }
}

async function compareAccount(accountHash, authoritative){
  if(!compareEnabled()) return {enabled:false};
  let result;
  try{
    const shadow=await documentStore.listAccount(accountHash);
    const left=new Map((authoritative||[]).map(d=>[idOf(d),d]));
    const right=new Map(shadow.map(d=>[idOf(d),d]));
    let matches=0,missing=0,mismatched=0,extra=0;
    for(const [id,doc] of left){
      const other=right.get(id);
      if(!other) missing++;
      else if(same(doc,other)) matches++;
      else mismatched++;
    }
    for(const id of right.keys()) if(!left.has(id)) extra++;
    result={
      enabled:true,ok:true,checked:left.size,
      shadow:shadow.length,matches,missing,mismatched,extra,
      parity:missing===0&&mismatched===0&&extra===0
    };
  }catch(e){
    result={enabled:true,ok:false,error:safeError(e)};
  }

  const summary=Object.assign({at:new Date().toISOString()},result);
  delete summary.error;
  await metricSet('migration:supabase:parity:last',summary);
  await metricIncr('migration:supabase:parity:checks');
  if(!result.ok) await metricIncr('migration:supabase:parity:errors');
  else if(!result.parity) await metricIncr('migration:supabase:parity:mismatch');
  return result;
}

function parseTotal(response){
  const raw=response&&response.headers&&typeof response.headers.get==='function'
    ?response.headers.get('content-range'):null;
  const m=String(raw||'').match(/\/(\d+)$/);
  return m?Math.max(0,Number(m[1])||0):null;
}

async function exactCount(filter){
  const suffix=filter?'&'+filter:'';
  const res=await Supabase.request('/rest/v1/appbase_documents?select=account_hash&limit=1'+suffix,{
    headers:{Prefer:'count=exact',Range:'0-0'},
    timeoutMs:8000
  });
  return parseTotal(res);
}

async function shadowStats(){
  if(!Supabase.configured()) return {enabled:false,ok:false};
  try{
    const [documents,tombstones,latestRes]=await Promise.all([
      exactCount(''),
      exactCount('deleted=eq.true'),
      Supabase.request('/rest/v1/appbase_documents?select=shadowed_at&order=shadowed_at.desc&limit=1',{timeoutMs:8000})
    ]);
    const rows=await latestRes.json();
    return {
      enabled:true,ok:true,
      documents:documents==null?0:documents,
      tombstones:tombstones==null?0:tombstones,
      latestShadowedAt:Array.isArray(rows)&&rows[0]&&rows[0].shadowed_at||null
    };
  }catch(e){
    return {enabled:true,ok:false,error:safeError(e)};
  }
}

function readiness(base,stats,lastWrite,lastParity){
  if(!base.configured) return {stage:'disabled',readyForCompare:false,reason:'Supabase не настроен.'};
  if(!base.writeEnabled) return {stage:'write_off',readyForCompare:false,reason:'Shadow write выключен.'};
  if(!stats||!stats.ok) return {stage:'investigate',readyForCompare:false,reason:'Не удалось прочитать статистику shadow table.'};
  if(lastWrite&&Number(lastWrite.failed||0)>0) return {stage:'investigate',readyForCompare:false,reason:'В последнем shadow-write batch есть ошибки.'};
  if(!lastWrite||!Number(lastWrite.written||0)||!Number(stats.documents||0)){
    return {stage:'collecting',readyForCompare:false,reason:'Нужно дождаться успешных shadow writes и появления документов.'};
  }
  if(!base.compareEnabled){
    return {stage:'ready_for_compare',readyForCompare:true,reason:'Shadow writes проходят, документы есть, последняя пачка без ошибок.'};
  }
  if(!lastParity) return {stage:'comparing',readyForCompare:true,reason:'Compare включён, ждём первый Premium pull.'};
  if(lastParity.ok===false) return {stage:'investigate',readyForCompare:true,reason:'Последний compare завершился ошибкой.'};
  if(lastParity.parity===false) return {stage:'parity_issue',readyForCompare:true,reason:'Последний compare нашёл расхождения.'};
  return {stage:'healthy_compare',readyForCompare:true,reason:'Последний compare совпал с authoritative Upstash.'};
}

async function migrationStatus(){
  const base=status();
  const [stats,lastWrite,lastParity,writeBatches,writeErrorBatches,parityChecks,parityErrors,parityMismatch]=await Promise.all([
    shadowStats(),
    jsonMetric('migration:supabase:shadow:write:last'),
    jsonMetric('migration:supabase:parity:last'),
    metricGet('migration:supabase:shadow:write:batches'),
    metricGet('migration:supabase:shadow:write:error_batches'),
    metricGet('migration:supabase:parity:checks'),
    metricGet('migration:supabase:parity:errors'),
    metricGet('migration:supabase:parity:mismatch')
  ]);
  return Object.assign({},base,{
    stats,
    lastWrite,
    parity:lastParity,
    counters:{
      writeBatches:Number(writeBatches||0),
      writeErrorBatches:Number(writeErrorBatches||0),
      parityChecks:Number(parityChecks||0),
      parityErrors:Number(parityErrors||0),
      parityMismatchChecks:Number(parityMismatch||0)
    },
    readiness:readiness(base,stats,lastWrite,lastParity)
  });
}

function status(){
  return {
    configured:Supabase.configured(),
    writeEnabled:writeEnabled(),
    compareEnabled:compareEnabled()
  };
}

module.exports={
  writeDocument,recordWriteBatch,purgeProfile,purgeAccount,compareAccount,
  shadowStats,migrationStatus,status
};
