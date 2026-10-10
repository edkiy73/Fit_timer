// @ts-check
'use strict';
const {requireOwner}=require('./permissions');
const {reject}=require('./errors');
/** @typedef {import('./verification-engine').Attempt} Attempt */
/** @typedef {import('./verification-engine').Policy} Policy */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** @param {unknown} value @returns {number} */
function time(value) {if(typeof value!=='string'||!Number.isSafeInteger(Date.parse(value)))reject(503,'verification_unavailable');return Date.parse(/** @type {string} */(value));}
/** @param {unknown} input @returns {Attempt} */
function attemptFromRow(input) {
 if(!object(input))reject(503,'verification_unavailable');const r=/** @type {Record<string,unknown>} */(input);
 if(typeof r.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.id)||typeof r.account_hash!=='string'||!/^[a-f0-9]{32}$/.test(r.account_hash)||typeof r.issuer!=='string'||typeof r.policy_version!=='string'||typeof r.environment!=='string'||!['sandbox','production'].includes(r.environment)||typeof r.provider_reference!=='string'||typeof r.state!=='string'||!['pending','verified','rejected','revoked'].includes(r.state)||typeof r.identity_verified!=='boolean')reject(503,'verification_unavailable');
 const createdAt=time(r.created_at),expiresAt=time(r.expires_at),lastEventAt=r.last_event_at===null?null:time(r.last_event_at);
 if(expiresAt<=createdAt)reject(503,'verification_unavailable');
 const proof=r.state==='verified'?Object.freeze({adult:/** @type {true} */(true),identity:/** @type {boolean} */(r.identity_verified),issuedAt:time(r.proof_issued_at),expiresAt:time(r.proof_expires_at)}):null;
 if(r.state!=='verified'&&(r.proof_issued_at!==null||r.proof_expires_at!==null||r.identity_verified))reject(503,'verification_unavailable');
 return Object.freeze({id:/** @type {string} */(r.id),accountHash:/** @type {string} */(r.account_hash),providerReference:/** @type {string} */(r.provider_reference),issuer:/** @type {string} */(r.issuer),environment:/** @type {'sandbox'|'production'} */(r.environment),policyVersion:/** @type {string} */(r.policy_version),threshold:18,createdAt,expiresAt,lastEventAt,state:/** @type {Attempt['state']} */(r.state),proof});
}
/** No provider or route is registered here. Caller must supply server-owned policy and
 * live Core identity; private status never accepts client owner/provider/age fields.
 * @param {{transport:import('./contracts').Transport;accountStore:import('./contracts').AccountStore}} deps */
function createVerificationStore({transport,accountStore}) {
 /** @param {string} path @param {Record<string,unknown>} body */
 async function rpc(path,body) {
  if(!transport.configured())reject(503,'verification_unavailable');
  try {const response=await transport.request('/rest/v1/rpc/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),timeoutMs:8000});
   const data=await response.json();if(!object(data)||data.ok!==true)reject(503,'verification_unavailable');return /** @type {Record<string,unknown>} */(data);
  } catch {return reject(503,'verification_unavailable');}
 }
 /** @param {Record<string,string>} filters */
 async function rows(filters) {
  if(!transport.configured())reject(503,'verification_unavailable');
  try {const response=await transport.request('/rest/v1/feture_verification_attempts?'+new URLSearchParams({select:'id,account_hash,issuer,environment,policy_version,provider_reference,state,current,created_at,expires_at,last_event_at,proof_issued_at,proof_expires_at,identity_verified',...filters,limit:'1'}),{timeoutMs:8000});
   const data=await response.json();if(!Array.isArray(data)||data.length>1||!data.every(object))reject(503,'verification_unavailable');return /** @type {Record<string,unknown>[]} */(data);
  } catch {return reject(503,'verification_unavailable');}
 }
 return {
  /** @param {import('./contracts').Actor} actor @param {string} id @param {Policy} policy */
  async reserve(actor,id,policy) {
   requireOwner(actor,actor.accountHash);
   const data=await rpc('feture_verification_reserve',{p_owner:actor.accountHash,p_id:id,p_issuer:policy.issuer,p_environment:policy.environment,p_version:policy.version});
   if(!object(data.attempt)||data.attempt.account_hash!==actor.accountHash||data.attempt.id!==id)reject(503,'verification_unavailable');
   // Reservation has no provider reference until bind; do not pretend it is proof.
   return {attemptId:id,expiresAt:new Date(time(data.attempt.expires_at)).toISOString(),replayed:data.replayed===true};
  },
  /** @param {import('./contracts').Actor} actor @param {string} id @param {string} reference */
  async bind(actor,id,reference) {
   requireOwner(actor,actor.accountHash);
   const data=await rpc('feture_verification_bind',{p_owner:actor.accountHash,p_id:id,p_reference:reference});const attempt=attemptFromRow(data.attempt);
   if(attempt.accountHash!==actor.accountHash||attempt.id!==id||attempt.providerReference!==reference)reject(503,'verification_unavailable');return attempt;
  },
  /** Fresh DB status, including disabled policy; browser clock never grants access.
   * @param {import('./contracts').Actor} actor @param {Policy} policy */
  async status(actor,policy) {
   requireOwner(actor,actor.accountHash);const data=await rpc('feture_verification_status',{p_owner:actor.accountHash,p_issuer:policy.issuer,p_environment:policy.environment,p_version:policy.version});
   const s=data.status;
   if(!object(s)||typeof s.state!=='string'||!['unavailable','unverified','pending','verified','rejected','expired'].includes(s.state)||typeof s.verifiedAdult!=='boolean'||Object.keys(s).sort().join(',')!=='state,validUntil,verifiedAdult')reject(503,'verification_unavailable');
   const value=/** @type {Record<string,unknown>} */(s);
   if(value.state==='verified'){if(value.verifiedAdult!==true||time(value.validUntil)<=Date.now())reject(503,'verification_unavailable');}
   else if(value.verifiedAdult!==false||value.validUntil!==null)reject(503,'verification_unavailable');
   return {state:value.state,verifiedAdult:value.verifiedAdult,validUntil:value.validUntil};
  },
  /** EventStore implementation; not a public client command. SQL resolves owner from
   * the stored attempt and locks account+event. Core account deletion also fails closed.
   * @param {import('./verification-engine').ProviderEvent} event @param {string} digest @param {Policy} policy @param {number} _now
   * @returns {Promise<import('./verification-engine').Transition>} */
  async apply(event,digest,policy,_now) {
   const data=await rows({id:'eq.'+event.attemptId});if(!data.length)reject(503,'verification_unavailable');const attempt=attemptFromRow(data[0]);
   if(!accountStore.configured())reject(503,'verification_unavailable');
   let account;try {account=JSON.parse(await accountStore.get('a:'+attempt.accountHash)||'null');}catch {reject(503,'verification_unavailable');}
   if(!object(account)||typeof account.email!=='string')reject(503,'verification_unavailable');
   const applied=await rpc('feture_verification_apply',{p_event:event,p_digest:digest});const updated=attemptFromRow(applied.attempt);
   if(updated.id!==attempt.id||updated.accountHash!==attempt.accountHash||updated.issuer!==policy.issuer||updated.environment!==policy.environment||updated.policyVersion!==policy.version||applied.digest!==digest||typeof applied.replayed!=='boolean')reject(503,'verification_unavailable');
   return {attempt:updated,receipt:{digest},replayed:/** @type {boolean} */(applied.replayed)};
  }
 };
}
module.exports={createVerificationStore,attemptFromRow};
