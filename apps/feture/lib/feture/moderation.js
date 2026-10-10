// @ts-check
'use strict';
const {createHash}=require('node:crypto');
const {requireOwner}=require('./permissions');
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
const reasons=['harassment','privacy','nonconsent','minor','illegal','spam','other'];
const fields=['nickname','about','pronouns','identity','orientation','relationships','city'];
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {unknown} v @returns {v is string} */
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
/** @param {unknown} input @returns {import('./moderation').ModerationCommand} */
function moderationCommand(input){
 if(!object(input))reject(422,'invalid_request');const v=/** @type {Record<string,unknown>} */(input);
 if(v.action==='moderation.report'){
  if(Object.keys(v).sort().join(',')!=='action,field,note,operationId,reason,targetId'||!uuid(v.operationId)||!uuid(v.targetId)||typeof v.reason!=='string'||!reasons.includes(v.reason)||typeof v.note!=='string'||v.note.length>1000||v.field!==null&&(typeof v.field!=='string'||!fields.includes(v.field)))reject(422,'invalid_request');
 }else if(v.action==='moderation.appeal'){
  if(Object.keys(v).sort().join(',')!=='action,caseId,operationId,text'||!uuid(v.operationId)||!uuid(v.caseId)||typeof v.text!=='string'||!v.text.trim()||v.text.length>1000)reject(422,'invalid_request');
 }else if(v.action==='moderation.status'){
  if(Object.keys(v).sort().join(',')!=='action,cursor,kind'||v.kind!=='reports'&&v.kind!=='appeals'||v.cursor!==null&&!uuid(v.cursor))reject(422,'invalid_request');
 }else reject(422,'invalid_request');
 return /** @type {import('./moderation').ModerationCommand} */(v);
}
/** @param {import('./contracts').Command} input @returns {input is import('./moderation').ModerationCommand} */
function isModerationCommand(input){return input.action.startsWith('moderation.');}
/** @param {unknown} input @returns {Record<string,unknown>} */
function queueItem(input){
 if(!object(input))reject(503,'moderation_unavailable');const r=/** @type {Record<string,unknown>} */(input);
 if(!uuid(r.id)||!uuid(r.caseId)||!uuid(r.targetId)||typeof r.reason!=='string'||!reasons.includes(r.reason)||typeof r.note!=='string'||r.note.length>1000||!['open','reviewing','resolved'].includes(String(r.state))||typeof r.revision!=='number'||!Number.isSafeInteger(r.revision)||r.revision<1||!object(r.snapshot)||typeof r.priority!=='number'||![1,2,3].includes(r.priority)||!date(r.createdAt)||r.appealText!==null&&(typeof r.appealText!=='string'||r.appealText.length>1000))reject(503,'moderation_unavailable');
 const s=/** @type {Record<string,unknown>} */(r.snapshot);let snapshot={};
 if(Object.keys(s).length){if(Object.keys(s).sort().join(',')!=='field,text'||typeof s.field!=='string'||!fields.includes(s.field)||typeof s.text!=='string'||s.text.length>2000)reject(503,'moderation_unavailable');snapshot={field:s.field,text:s.text};}
 return {id:r.id,caseId:r.caseId,targetId:r.targetId,reason:r.reason,note:r.note,state:r.state,revision:r.revision,snapshot,priority:r.priority,createdAt:r.createdAt,appealText:r.appealText};
}
/** @param {import('./contracts').Transport} transport @param {import('./contracts').AccountStore} store */
function createModerationRepository(transport,store){
 /** @param {string} name @param {Record<string,unknown>} body @returns {Promise<Record<string,unknown>>} */
 async function rpc(name,body){if(!transport.configured())reject(503,'moderation_unavailable');try{const response=await transport.request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),timeoutMs:8000});const r=await response.json();if(!response.ok||!object(r))reject(503,'moderation_unavailable');
  if(r.ok!==true){if(r.error==='resource_not_found')reject(404,'resource_not_found');if(r.error==='rate_limited')reject(429,'rate_limited');if(['revision_conflict','operation_conflict','appeal_pending'].includes(String(r.error)))reject(409,String(r.error));if(r.error==='invalid_request'||r.error==='invalid_cursor')reject(422,String(r.error));reject(503,'moderation_unavailable');}return r;
 }catch(e){if(e instanceof DomainError)throw e;return reject(503,'moderation_unavailable');}}
 /** @param {string} id */
 async function coreExists(id){if(!transport.configured())reject(503,'moderation_unavailable');try{const q=new URLSearchParams({select:'account_hash,profile_id',profile_id:'eq.'+id,limit:'1'});const r=await transport.request('/rest/v1/feture_profile_details?'+q,{timeoutMs:8000});const rows=await r.json();if(!r.ok||!Array.isArray(rows)||rows.length>1)reject(503,'moderation_unavailable');if(!rows.length)return false;
  const row=rows[0];if(!object(row)||row.profile_id!==id||typeof row.account_hash!=='string'||!/^[a-f0-9]{32}$/.test(row.account_hash))reject(503,'moderation_unavailable');const a=JSON.parse(await store.get('a:'+row.account_hash)||'null');return !!a&&typeof a.email==='string'&&createHash('sha256').update(a.email.trim().toLowerCase()).digest('hex').slice(0,32)===row.account_hash;
 }catch{return reject(503,'moderation_unavailable');}}
 return {rpc,
  /** @param {import('./contracts').Actor} actor @param {import('./moderation').ModerationCommand} input @returns {Promise<Record<string,unknown>>} */
  async execute(actor,input){requireOwner(actor,actor.accountHash);const c=moderationCommand(input);
   if(c.action==='moderation.report'){const allowed=c.field!==null&&await coreExists(c.targetId);const r=await rpc('feture_report_create',{p_actor:actor.accountHash,p_id:c.operationId,p_target:c.targetId,p_reason:c.reason,p_note:c.note,p_field:c.field,p_snapshot_allowed:allowed});if(r.reportId!==c.operationId)reject(503,'moderation_unavailable');return {reportId:r.reportId};}
   if(c.action==='moderation.appeal'){const r=await rpc('feture_appeal_create',{p_actor:actor.accountHash,p_id:c.operationId,p_case:c.caseId,p_text:c.text});if(r.appealId!==c.operationId)reject(503,'moderation_unavailable');return {appealId:r.appealId};}
   const r=await rpc('feture_moderation_own',{p_actor:actor.accountHash,p_kind:c.kind,p_after:c.cursor});
   if(!Array.isArray(r.items)||r.items.length>30||r.nextCursor!==null&&!uuid(r.nextCursor))reject(503,'moderation_unavailable');
   const items=/** @type {unknown[]} */(r.items).map(v=>{if(!object(v)||!uuid(v.id)||!uuid(v.caseId)||!['open','reviewing','resolved'].includes(String(v.state))||!date(v.createdAt))reject(503,'moderation_unavailable');return {id:v.id,caseId:v.caseId,state:v.state,createdAt:v.createdAt};});
   let restriction=null;if(r.restriction!==null){const v=r.restriction;if(!object(v)||!uuid(v.caseId)||!['hidden','suspended'].includes(String(v.state))||!['policy','abuse','age','illegal'].includes(String(v.reason))||!date(v.expiresAt)||typeof v.active!=='boolean')reject(503,'moderation_unavailable');restriction={caseId:v.caseId,state:v.state,reason:v.reason,expiresAt:v.expiresAt,active:v.active};}
   return {items,nextCursor:r.nextCursor,restriction};
  }
 };
}
module.exports={moderationCommand,isModerationCommand,queueItem,createModerationRepository};
