// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {createAccessGuard}=require('./access-guard');
const {requireOwner}=require('./permissions');
const {INTEREST_ID}=require('./interest-model');
const {uuid}=require('./documents');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} keys */
const exact=(v,keys)=>Object.keys(v).sort().join(',')===keys.sort().join(',');
/** @param {unknown} input @returns {import('./shares').ShareCommand} */
function shareCommand(input){
 if(!object(input)||typeof input.action!=='string')reject(422,'invalid_request');
 const v=/** @type {Record<string,unknown>} */(input);
 if(v.action==='share.list'&&exact(v,['action']))return {action:'share.list'};
 if(v.action==='share.read'||v.action==='share.revoke'){
  if(!exact(v,['action','linkId'])||!uuid(v.linkId))reject(422,'invalid_request');
  return /** @type {import('./shares').ShareCommand} */(v);
 }
 if(v.action!=='share.create'||!exact(v,['action','linkId','selected','days','reviewed'])
    ||!uuid(v.linkId)||v.reviewed!==true||![1,3,7].includes(/** @type {number} */(v.days))
    ||!Array.isArray(v.selected)||v.selected.length<1||v.selected.length>6)reject(422,'invalid_request');
 const ids=new Set();
 for(const item of v.selected){
  if(!object(item)||!exact(item,['interestId','expectedRevision'])||typeof item.interestId!=='string'
   ||!INTEREST_ID.test(item.interestId)||ids.has(item.interestId)
   ||typeof item.expectedRevision!=='number'||!Number.isSafeInteger(item.expectedRevision)
   ||item.expectedRevision<1||item.expectedRevision>=Number.MAX_SAFE_INTEGER)reject(422,'invalid_request');
  ids.add(item.interestId);
 }
 return /** @type {import('./shares').ShareCommand} */(v);
}
/** @param {import('./contracts').Command} input @returns {input is import('./shares').ShareCommand} */
const isShareCommand=input=>input.action.startsWith('share.');
/** @param {unknown} value */
function linkDTO(value){
 if(!object(value)||!uuid(value.id)||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))
   ||typeof value.revoked!=='boolean')reject(503,'domain_unavailable');
 return {id:value.id,expiresAt:value.expiresAt,revoked:value.revoked};
}
/** @param {unknown} value */
function cardDTO(value){
 if(!object(value)||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))
   ||!Array.isArray(value.items)||value.items.length<1||value.items.length>6)reject(503,'domain_unavailable');
 const allowed=['unknown','curious','fantasy','want_to_try','not_interested'];
 const items=value.items.map(item=>{
  if(!object(item)||Object.keys(item).sort().join(',')!=='stance,title'
    ||typeof item.title!=='string'||item.title.length<1||item.title.length>160
    ||typeof item.stance!=='string'||!allowed.includes(item.stance)||item.stance==='unknown')reject(503,'domain_unavailable');
  return {title:item.title,stance:item.stance};
 });
 return {items,expiresAt:value.expiresAt};
}
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents @returns {import('./shares').ShareRepository} */
function createShareRepository(transport,documents){
 const guard=createAccessGuard(documents);
 return {async execute(actor,input){
  requireOwner(actor,actor.accountHash);
  const c=shareCommand(input);
  await guard(actor); // Both owner and recipient must have trusted 18+ and current legal consent.
  if(!transport.configured())reject(503,'domain_unavailable');
  let value;
  try{
   const res=await transport.request('/rest/v1/rpc/feture_share_command',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({p_actor:actor.accountHash,p_command:c}),timeoutMs:8000
   });
   if(!res.ok)reject(503,'domain_unavailable');
   value=await res.json();
  }catch(error){if(error instanceof DomainError)throw error;reject(503,'domain_unavailable');}
  if(!object(value))reject(503,'domain_unavailable');
  if(value.ok!==true){
   const code=value.error;
   if(code==='resource_not_found')reject(404,'resource_not_found');
   if(code==='revision_conflict'||code==='operation_conflict')reject(409,String(code));
   if(code==='rate_limited')reject(429,'rate_limited');
   if(code==='invalid_request')reject(422,'invalid_request');
   reject(503,'domain_unavailable');
  }
  if(c.action==='share.read')return {card:cardDTO(value.card)};
  if(c.action==='share.create'){
   if(typeof value.replayed!=='boolean')reject(503,'domain_unavailable');
   const link=linkDTO(value.link);
   if(link.id!==c.linkId)reject(503,'domain_unavailable');
   return {link,replayed:value.replayed};
  }
  if(c.action==='share.revoke'){
   if(value.revoked!==true)reject(503,'domain_unavailable');return {revoked:true};
  }
  if(!Array.isArray(value.items)||value.items.length>25)reject(503,'domain_unavailable');
  return {items:value.items.map(v=>{
   const link=linkDTO(v);
   if(!object(v)||typeof v.createdAt!=='string'||!Number.isFinite(Date.parse(v.createdAt))
     ||typeof v.count!=='number'||!Number.isInteger(v.count)||v.count<1||v.count>6)reject(503,'domain_unavailable');
   return {...link,createdAt:v.createdAt,count:v.count};
  })};
 }};
}
module.exports={shareCommand,isShareCommand,createShareRepository,cardDTO};
