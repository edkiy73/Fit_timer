// @ts-check
'use strict';
const {createHash}=require('node:crypto');
const {DomainError,reject}=require('./errors');
const EMAIL=/^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const HASH=/^[a-f0-9]{32}$/;
const hashEmail=email=>createHash('sha256').update(email).digest('hex').slice(0,32);
/** Resolve time-limited QA permission only after Core device session was checked.
 * No browser age flags, email headers or Core metadata grant this permission.
 * PostgreSQL independently verifies the prelaunch flag for every call.
 * @param {import('./contracts').Transport} transport */
function createQaAdultResolver(transport){
 /** @param {string} accountHash */
 return async accountHash=>{
  if(!HASH.test(accountHash)||!transport.configured())return null;
  try{
   const r=await transport.request('/rest/v1/rpc/feture_qa_adult_until',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({p_owner:accountHash}),timeoutMs:5000});
   if(!r.ok)return null;
   const value=await r.json();
   if(typeof value!=='string')return null;
   const expiry=Date.parse(value);
   if(!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+3*86400000+60000)return null;
   return new Date(expiry).toISOString();
  }catch{return null;} // SQL or network failure never grants access.
 };
}
/** Core-admin-only routes. Operator must manually confirm tester is 18+.
 * Admin account/email lookup remains private; only the hash goes to Supabase.
 * @param {import('./contracts').Transport} transport @param {import('./contracts').AccountStore} accounts */
function createQaAdultAdmin(transport,accounts){
 /** @param {Record<string,unknown>} cmd */
 async function rpc(cmd){
  if(!transport.configured())reject(503,'verification_unavailable');
  try{
   const r=await transport.request('/rest/v1/rpc/feture_qa_adult_admin',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({p_command:cmd}),timeoutMs:8000});
   if(!r.ok)reject(503,'verification_unavailable');
   const body=await r.json();
   if(!body||typeof body!=='object'||Array.isArray(body))reject(503,'verification_unavailable');
   if(body.ok!==true){
    if(body.error==='not_prelaunch')reject(403,'not_prelaunch');
    if(body.error==='account_not_found')reject(404,'account_not_found');
    if(body.error==='capacity')reject(429,'rate_limited');
    if(body.error==='invalid_request')reject(422,'invalid_request');
    reject(503,'verification_unavailable');
   }
   return body;
  }catch(e){if(e instanceof DomainError)throw e;return reject(503,'verification_unavailable');}
 }
 /** @param {string} action @param {Record<string,unknown>} body @param {import('./contracts').Response} res */
 return async(action,body,res)=>{
  if(!['feture.qa.list','feture.qa.grant','feture.qa.revoke'].includes(action))return false;
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
   let output;
   if(action==='feture.qa.list'){
    if(Object.keys(body).sort().join(',')!=='action')reject(422,'invalid_request');
    const data=await rpc({action:'list'});
    if(!Array.isArray(data.items)||data.items.length>25||!data.items.every(item=>
     item&&typeof item==='object'&&HASH.test(item.accountHash)&&typeof item.expiresAt==='string'
     &&Number.isFinite(Date.parse(item.expiresAt))&&typeof item.revoked==='boolean'))reject(503,'verification_unavailable');
    output={ok:true,items:data.items};
   }else{
    const names=action==='feture.qa.grant'?'action,days,email,reviewed':'action,email';
    if(Object.keys(body).sort().join(',')!==names||typeof body.email!=='string')reject(422,'invalid_request');
    const email=body.email.trim().toLowerCase();
    if(!EMAIL.test(email)||email.length>120)reject(422,'invalid_request');
    if(action==='feture.qa.grant'&&(![1,2,3].includes(/** @type {number} */(body.days))||body.reviewed!==true))reject(422,'invalid_request');
    if(!accounts.configured())reject(503,'identity_unavailable');
    const hash=hashEmail(email);
    if(action==='feture.qa.grant'){
     let data;
     try{data=JSON.parse(await accounts.get('a:'+hash)||'null');}catch{reject(503,'identity_unavailable');}
     if(!data||typeof data.email!=='string'||data.email.trim().toLowerCase()!==email)reject(404,'account_not_found');
    }
    const answer=await rpc(action==='feture.qa.grant'?{action:'grant',accountHash:hash,days:body.days,reviewed:true}:{action:'revoke',accountHash:hash});
    if(action==='feture.qa.grant'){
     if(typeof answer.expiresAt!=='string'||!Number.isFinite(Date.parse(answer.expiresAt)))reject(503,'verification_unavailable');
     output={ok:true,expiresAt:answer.expiresAt};
    }else{if(answer.revoked!==true)reject(503,'verification_unavailable');output={ok:true,revoked:true};}
   }
   res.statusCode=200;res.end(JSON.stringify(output));
  }catch(e){const safe=e instanceof DomainError?e:new DomainError(503,'verification_unavailable');res.statusCode=safe.status;res.end(JSON.stringify({error:safe.code}));}
  return true;
 };
}
module.exports={createQaAdultResolver,createQaAdultAdmin};
