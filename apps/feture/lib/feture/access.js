// @ts-check
'use strict';
const {createHash}=require('node:crypto');
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
const {requireOwner}=require('./permissions');
const {createAccessGuard}=require('./access-guard');
const {profileData}=require('./profile');
const {interestState,INTEREST_ID}=require('./interest-model');
const FIELDS=['nickname','about','pronouns','identity','orientation','relationships','city'];
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {unknown} v @param {boolean} [fieldOnly] @returns {v is string[]} */
function scopes(v,fieldOnly=false){return Array.isArray(v)&&v.length<=(fieldOnly?7:30)&&new Set(v).size===v.length&&v.every(s=>typeof s==='string'&&(fieldOnly?FIELDS.includes(s):s.startsWith('profile:')?FIELDS.includes(s.slice(8)):s.startsWith('interest:')&&INTEREST_ID.test(s.slice(9))));}
/** @param {unknown} input @returns {import('./access').AccessCommand} */
function accessCommand(input){
 if(!object(input))reject(422,'invalid_request');const v=/** @type {Record<string,unknown>} */(input);
 const allowed={
  'access.settings':['action'],'access.disclosure':['action','expectedRevision','publicFields','grantedFields'],
  'access.list':['action','kind','cursor'],'access.request':['action','targetId','operationId','scopes','canMessage'],
  'access.decide':['action','requestId','decision','scopes','canMessage','days'],'access.close':['action','requestId','kind'],
  'access.block':['action','targetId','blocked'],'access.profile':['action','targetId'],'access.preview':['action','viewerId']};
 if(typeof v.action!=='string'||!Object.hasOwn(allowed,v.action))reject(422,'invalid_request');
 const keys=/** @type {Record<string,string[]>} */(allowed)[/** @type {string} */(v.action)];
 if(Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))reject(422,'invalid_request');
 switch(v.action){
  case 'access.settings':break;
  case 'access.disclosure':if(typeof v.expectedRevision!=='number'||!Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<0||v.expectedRevision>=Number.MAX_SAFE_INTEGER||!scopes(v.publicFields,true)||!scopes(v.grantedFields,true)||v.publicFields.some(s=>v.grantedFields.includes(s)))reject(422,'invalid_request');break;
  case 'access.list':if(!['requests','grants','blocks'].includes(String(v.kind))||v.cursor!==null&&!uuid(v.cursor))reject(422,'invalid_request');break;
  case 'access.request':if(!uuid(v.targetId)||!uuid(v.operationId)||!scopes(v.scopes)||typeof v.canMessage!=='boolean'||!v.scopes.length&&!v.canMessage)reject(422,'invalid_request');break;
  case 'access.decide':if(!uuid(v.requestId)||!['approve','decline'].includes(String(v.decision))||!scopes(v.scopes)||typeof v.canMessage!=='boolean'||typeof v.days!=='number'||!Number.isInteger(v.days)||v.days<1||v.days>90||v.decision==='decline'&&(v.scopes.length||v.canMessage)||v.decision==='approve'&&!v.scopes.length&&!v.canMessage)reject(422,'invalid_request');break;
  case 'access.close':if(!uuid(v.requestId)||!['cancel','revoke'].includes(String(v.kind)))reject(422,'invalid_request');break;
  case 'access.block':if(!uuid(v.targetId)||typeof v.blocked!=='boolean')reject(422,'invalid_request');break;
  case 'access.profile':if(!uuid(v.targetId))reject(422,'invalid_request');break;
  case 'access.preview':if(v.viewerId!==null&&!uuid(v.viewerId))reject(422,'invalid_request');break;
 }
 return /** @type {import('./access').AccessCommand} */(v);
}
/** @param {import('./contracts').Command} input @returns {input is import('./access').AccessCommand} */
function isAccessCommand(input){return input.action.startsWith('access.');}
/** Whitelist does not return source/revision/timestamps/discovery flags for another owner.
 * @param {unknown} input */
function projection(input){
 if(!object(input)||!object(input.fields)||Object.keys(input.fields).some(k=>!FIELDS.includes(k))||!Array.isArray(input.interests)||input.interests.length>144||typeof input.canMessage!=='boolean')reject(503,'domain_unavailable');
 const r=/** @type {Record<string,unknown>} */(input),fields=/** @type {Record<string,unknown>} */(r.fields);
 try{profileData({nickname:'',about:'',pronouns:'',identity:'',orientation:'',relationships:'',city:'',...fields});}catch{return reject(503,'domain_unavailable');}
 const interests=/** @type {unknown[]} */(r.interests).map(v=>{
  if(!object(v)||typeof v.interestId!=='string'||!INTEREST_ID.test(v.interestId)||Object.keys(v).sort().join(',')!=='boundary,boundaryNote,experience,intensity,interestId,stance')reject(503,'domain_unavailable');
  const i=/** @type {Record<string,unknown>} */(v);let checked;try{checked=interestState({stance:i.stance,experience:i.experience,boundary:i.boundary,boundaryNote:i.boundaryNote,intensity:i.intensity,visibility:'private',useForDiscovery:false});}catch{return reject(503,'domain_unavailable');}
  return {interestId:i.interestId,stance:checked.stance,experience:checked.experience,boundary:checked.boundary,boundaryNote:checked.boundaryNote,intensity:checked.intensity};
 });return {fields,interests,canMessage:r.canMessage};
}
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents @param {import('./contracts').AccountStore} store */
function createAccessRepository(transport,documents,store){
 const guard=createAccessGuard(documents);
 /** @param {string} path @param {Record<string,unknown>} [body] @returns {Promise<unknown>} */
 async function request(path,body){if(!transport.configured())reject(503,'domain_unavailable');try{const r=await transport.request(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),timeoutMs:8000}:{timeoutMs:8000});if(!r.ok)reject(503,'domain_unavailable');return await r.json();}catch{return reject(503,'domain_unavailable');}}
 /** @param {string} name @param {Record<string,unknown>} body @returns {Promise<Record<string,unknown>>} */
 async function rpc(name,body){const r=await request('/rest/v1/rpc/'+name,body);if(!object(r))reject(503,'domain_unavailable');const v=/** @type {Record<string,unknown>} */(r);if(v.ok!==true){if(v.error==='resource_not_found')reject(404,'resource_not_found');if(['revision_conflict','operation_conflict','request_pending','request_closed','scope_not_available'].includes(String(v.error)))throw new DomainError(409,String(v.error));if(v.error==='invalid_request')reject(422,'invalid_request');reject(503,'domain_unavailable');}return v;}
 /** @param {string} hash */
 async function existingCore(hash){if(!/^[a-f0-9]{32}$/.test(hash))reject(503,'domain_unavailable');let a;try{a=JSON.parse(await store.get('a:'+hash)||'null');}catch{return reject(503,'identity_unavailable');}if(!a||typeof a.email!=='string'||createHash('sha256').update(a.email.trim().toLowerCase()).digest('hex').slice(0,32)!==hash)reject(404,'resource_not_found');}
 /** @param {string} id */
 async function peer(id){const q=new URLSearchParams({select:'account_hash,profile_id',profile_id:'eq.'+id,limit:'1'});const rows=await request('/rest/v1/feture_profile_details?'+q);if(!Array.isArray(rows)||rows.length!==1||!object(rows[0])||rows[0].profile_id!==id||typeof rows[0].account_hash!=='string')reject(404,'resource_not_found');const hash=/** @type {string} */(rows[0].account_hash);await existingCore(hash);return hash;}
 return {
  /** @param {import('./contracts').Actor} actor @param {import('./access').AccessCommand} input @returns {Promise<Record<string,unknown>>} */
  async execute(actor,input){requireOwner(actor,actor.accountHash);const c=accessCommand(input);
   // Revoking or blocking stays possible after age/consent expires. Lists contain own permissions, no private values.
   if(!['access.close','access.block','access.list'].includes(c.action))await guard(actor);
   if(c.action==='access.list'){
    const r=await rpc('feture_access_list',{p_actor:actor.accountHash,p_kind:c.kind,p_after:c.cursor,p_limit:30});
    if(!Array.isArray(r.items)||r.items.length>30||r.nextCursor!==null&&!uuid(r.nextCursor))reject(503,'domain_unavailable');
    const items=/** @type {unknown[]} */(r.items).map(v=>{
     if(!object(v)||!uuid(v.id)||!uuid(v.peerId)||!['incoming','outgoing'].includes(String(v.direction))||!scopes(v.scopes)||typeof v.canMessage!=='boolean'||!['pending','approved','declined','cancelled','expired','active','revoked','blocked'].includes(String(v.state))||v.expiresAt!==null&&(typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.expiresAt))))reject(503,'domain_unavailable');
     return {id:v.id,peerId:v.peerId,direction:v.direction,scopes:v.scopes,canMessage:v.canMessage,state:v.state,expiresAt:v.expiresAt};
    });return {items,nextCursor:r.nextCursor};
   }
   if(c.action==='access.request'){await peer(c.targetId);const r=await rpc('feture_access_request',{p_viewer:actor.accountHash,p_target:c.targetId,p_id:c.operationId,p_scopes:c.scopes,p_message:c.canMessage});if(!uuid(r.requestId))reject(503,'domain_unavailable');return {accessId:r.requestId};}
   if(c.action==='access.decide'){
    const q=new URLSearchParams({select:'viewer_hash',id:'eq.'+c.requestId,owner_hash:'eq.'+actor.accountHash,limit:'1'});const rows=await request('/rest/v1/feture_access_requests?'+q);
    if(!Array.isArray(rows)||rows.length!==1||!object(rows[0])||typeof rows[0].viewer_hash!=='string')reject(404,'resource_not_found');await existingCore(rows[0].viewer_hash);
    await rpc('feture_access_decide',{p_owner:actor.accountHash,p_id:c.requestId,p_decision:c.decision,p_scopes:c.scopes,p_message:c.canMessage,p_days:c.days});return {};
   }
   if(c.action==='access.close'){await rpc('feture_access_close',{p_actor:actor.accountHash,p_id:c.requestId,p_kind:c.kind});return {};}
   if(c.action==='access.block'){await rpc('feture_block_set',{p_actor:actor.accountHash,p_target:c.targetId,p_blocked:c.blocked});return {};}
   if(c.action==='access.disclosure'){await rpc('feture_profile_disclosure',{p_owner:actor.accountHash,p_expected:c.expectedRevision,p_public:c.publicFields,p_granted:c.grantedFields});return {};}
   if(c.action==='access.profile'){await peer(c.targetId);const r=await rpc('feture_profile_project',{p_viewer:actor.accountHash,p_target:c.targetId});if(r.id!==c.targetId||typeof r.isOwner!=='boolean')reject(503,'domain_unavailable');return {id:c.targetId,isOwner:r.isOwner,projection:projection(r.projection)};}
   if(c.action==='access.preview'){const viewer=c.viewerId?await peer(c.viewerId):null;const r=await rpc('feture_profile_preview',{p_owner:actor.accountHash,p_viewer:viewer});return {projection:projection(r.projection)};}
   const q=new URLSearchParams({select:'profile_id,public_fields,granted_fields,disclosure_revision',account_hash:'eq.'+actor.accountHash,limit:'1'});const rows=await request('/rest/v1/feture_profile_details?'+q);
   if(!Array.isArray(rows)||rows.length!==1||!object(rows[0]))reject(404,'resource_not_found');const r=rows[0];
   if(!uuid(r.profile_id)||!scopes(r.public_fields,true)||!scopes(r.granted_fields,true)||typeof r.disclosure_revision!=='number'||!Number.isSafeInteger(r.disclosure_revision)||r.disclosure_revision<0)reject(503,'domain_unavailable');
   return {id:r.profile_id,publicFields:r.public_fields,grantedFields:r.granted_fields,revision:r.disclosure_revision};
  }
 };
}
module.exports={accessCommand,isAccessCommand,createAccessRepository};
