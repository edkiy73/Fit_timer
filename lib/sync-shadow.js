'use strict';

const Supabase=require('./supabase');
const {documentStore}=require('./supabase-document-store');

const writeEnabled=()=>Supabase.configured()&&process.env.SUPABASE_SHADOW_WRITE==='1';
const compareEnabled=()=>Supabase.configured()&&process.env.SUPABASE_SHADOW_COMPARE==='1';

const idOf=d=>String(d.profileId||'')+'\n'+String(d.key||'');
const same=(a,b)=>
  Number(a.rev||0)===Number(b.rev||0)
  && Number(a.schema||0)===Number(b.schema||0)
  && String(a.deviceId||'')===String(b.deviceId||'')
  && !!a.deleted===!!b.deleted
  && (a.deleted||String(a.value??'')===String(b.value??''));

async function writeDocument(doc){
  if(!writeEnabled()) return {enabled:false,ok:false};
  try{
    await documentStore.upsert(doc);
    return {enabled:true,ok:true};
  }catch(e){
    return {enabled:true,ok:false,error:String(e&&e.message||e).slice(0,200)};
  }
}

async function purgeProfile(accountHash,profileId){
  if(!writeEnabled()) return {enabled:false,ok:false};
  try{
    await documentStore.purgeProfile(accountHash,profileId);
    return {enabled:true,ok:true};
  }catch(e){
    return {enabled:true,ok:false,error:String(e&&e.message||e).slice(0,200)};
  }
}

async function purgeAccount(accountHash){
  if(!writeEnabled()) return {enabled:false,ok:false};
  try{
    await documentStore.purgeAccount(accountHash);
    return {enabled:true,ok:true};
  }catch(e){
    return {enabled:true,ok:false,error:String(e&&e.message||e).slice(0,200)};
  }
}

async function compareAccount(accountHash, authoritative){
  if(!compareEnabled()) return {enabled:false};
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
    return {
      enabled:true,ok:true,checked:left.size,
      shadow:shadow.length,matches,missing,mismatched,extra,
      parity:missing===0&&mismatched===0&&extra===0
    };
  }catch(e){
    return {enabled:true,ok:false,error:String(e&&e.message||e).slice(0,200)};
  }
}

function status(){
  return {
    configured:Supabase.configured(),
    writeEnabled:writeEnabled(),
    compareEnabled:compareEnabled()
  };
}

module.exports={writeDocument,purgeProfile,purgeAccount,compareAccount,status};
