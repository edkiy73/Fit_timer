// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
const {createAccessGuard}=require('./access-guard');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const limits={nickname:80,about:2000,pronouns:160,identity:160,orientation:160,relationships:160,city:120};
/** @param {unknown} input @returns {import('./profile').ProfileData} */
function profileData(input){
 if(!object(input)||Object.keys(input).length!==7||Object.keys(input).some(k=>!Object.hasOwn(limits,k)))reject(422,'invalid_request');
 const r=/** @type {Record<string,unknown>} */(input);
 for(const [key,max] of Object.entries(limits)){const v=r[key];if(typeof v!=='string'||v.length>max||/[\x00-\x1f\x7f]/.test(key==='about'?v.replace(/\n/g,''):v))reject(422,'invalid_request');}
 return /** @type {import('./profile').ProfileData} */(r);
}
/** @param {unknown} input @returns {import('./profile').ProfileCommand} */
function profileCommand(input){
 if(!object(input))reject(422,'invalid_request');const v=/** @type {Record<string,unknown>} */(input);
 if(v.action==='profile.read'&&Object.keys(v).length===1)return {action:'profile.read'};
 if(v.action!=='profile.save'||Object.keys(v).sort().join(',')!=='action,data,expectedRevision,operationId'||!uuid(v.operationId)||typeof v.expectedRevision!=='number'||!Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<0||v.expectedRevision>=Number.MAX_SAFE_INTEGER)reject(422,'invalid_request');
 return {action:'profile.save',operationId:/** @type {string} */(v.operationId),expectedRevision:/** @type {number} */(v.expectedRevision),data:profileData(v.data)};
}
/** @param {import('./contracts').Actor} actor @param {unknown} input @returns {import('./profile').PrivateProfile} */
function projection(actor,input){
 if(!object(input)||input.account_hash!==actor.accountHash||!uuid(input.profile_id)||typeof input.revision!=='number'||!Number.isSafeInteger(input.revision)||input.revision<1||typeof input.updated_at!=='string'||!Number.isFinite(Date.parse(input.updated_at)))reject(503,'domain_unavailable');
 const r=/** @type {Record<string,unknown>} */(input);let data;try{data=profileData(r.data);}catch{return reject(503,'domain_unavailable');}
 return {id:/** @type {string} */(r.profile_id),data,revision:/** @type {number} */(r.revision),updatedAt:/** @type {string} */(r.updated_at)};
}
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents */
function createProfileRepository(transport,documents){
 const guard=createAccessGuard(documents);
 /** @param {string} path @param {Record<string,unknown>} [body] @returns {Promise<unknown>} */
 async function request(path,body){if(!transport.configured())reject(503,'domain_unavailable');try{const r=await transport.request(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),timeoutMs:8000}:{timeoutMs:8000});if(!r.ok)reject(503,'domain_unavailable');return await r.json();}catch{return reject(503,'domain_unavailable');}}
 return {
  /** @param {import('./contracts').Actor} actor */
  async read(actor){await guard(actor);const q=new URLSearchParams({select:'account_hash,profile_id,data,revision,updated_at',account_hash:'eq.'+actor.accountHash,limit:'1'});const rows=await request('/rest/v1/feture_profile_details?'+q);if(!Array.isArray(rows)||rows.length>1)reject(503,'domain_unavailable');return rows.length?projection(actor,rows[0]):null;},
  /** @param {import('./contracts').Actor} actor @param {Extract<import('./profile').ProfileCommand,{action:'profile.save'}>} input */
  async save(actor,input){await guard(actor);const c=profileCommand(input);if(c.action!=='profile.save')reject(422,'invalid_request');const v=await request('/rest/v1/rpc/feture_profile_save',{p_owner:actor.accountHash,p_operation:c.operationId,p_expected:c.expectedRevision,p_data:c.data});
   if(!object(v))reject(503,'domain_unavailable');const r=/** @type {Record<string,unknown>} */(v);
   if(r.ok!==true){if(r.error==='revision_conflict'||r.error==='operation_conflict')throw new DomainError(409,String(r.error));reject(503,'domain_unavailable');}
   if(typeof r.replayed!=='boolean')reject(503,'domain_unavailable');return {profile:projection(actor,r.profile),replayed:/** @type {boolean} */(r.replayed)};
  }
 };
}
module.exports={profileData,profileCommand,createProfileRepository};
