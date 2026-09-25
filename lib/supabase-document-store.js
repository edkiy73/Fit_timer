'use strict';

const Supabase=require('./supabase');
const {createDocumentStore}=require('./document-store');

function escEq(value){ return encodeURIComponent(String(value||'')); }

function normalized(row){
  row=row&&typeof row==='object'?row:{};
  return {
    accountHash:String(row.accountHash||row.account_hash||''),
    profileId:String(row.profileId||row.profile_id||''),
    key:String(row.key||row.doc_key||''),
    rev:Math.max(1,Number(row.rev||row.revision)||1),
    schema:Math.max(1,Number(row.schema||row.schema_version)||1),
    deviceId:String(row.deviceId||row.device_id||''),
    deleted:!!row.deleted,
    value:row.value==null?(row.payload==null?null:String(row.payload)):String(row.value),
    at:String(row.at||row.source_at||'')
  };
}

const adapter={
  async upsert(input){
    const d=normalized(input);
    if(!d.accountHash||!d.profileId||!d.key) throw new Error('bad_document_identity');
    const body=[{
      account_hash:d.accountHash,
      profile_id:d.profileId,
      doc_key:d.key,
      revision:d.rev,
      schema_version:d.schema,
      device_id:d.deviceId,
      deleted:d.deleted,
      payload:d.deleted?null:(d.value==null?'':d.value),
      source_at:Number.isFinite(Date.parse(d.at))?new Date(d.at).toISOString():null,
      shadowed_at:new Date().toISOString()
    }];
    await Supabase.request('/rest/v1/appbase_documents?on_conflict=account_hash,profile_id,doc_key',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Prefer:'resolution=merge-duplicates,return=minimal'
      },
      body:JSON.stringify(body),
      timeoutMs:8000
    });
    return true;
  },

  async listAccount(accountHash){
    const res=await Supabase.request(
      '/rest/v1/appbase_documents?account_hash=eq.'+escEq(accountHash)
      +'&select=account_hash,profile_id,doc_key,revision,schema_version,device_id,deleted,payload,source_at',
      {timeoutMs:8000}
    );
    const rows=await res.json();
    return (Array.isArray(rows)?rows:[]).map(normalized);
  },

  async purgeProfile(accountHash, profileId){
    await Supabase.request(
      '/rest/v1/appbase_documents?account_hash=eq.'+escEq(accountHash)
      +'&profile_id=eq.'+escEq(profileId),
      {method:'DELETE',headers:{Prefer:'return=minimal'},timeoutMs:8000}
    );
    return true;
  },

  async purgeAccount(accountHash){
    await Supabase.request(
      '/rest/v1/appbase_documents?account_hash=eq.'+escEq(accountHash),
      {method:'DELETE',headers:{Prefer:'return=minimal'},timeoutMs:8000}
    );
    return true;
  }
};

module.exports={documentStore:createDocumentStore(adapter)};
