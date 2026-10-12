// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {requireOwner}=require('./permissions');
const {createAccessGuard}=require('./access-guard');
const {eventDraft,eventCommand}=require('./event-contract');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} fields */
const shape=(v,fields)=>Object.keys(v).sort().join('|')===fields.slice().sort().join('|');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
/** DB timestamptz may contain six fractional digits. @param {unknown} value */
function stamp(value){return typeof value==='string'&&value.length<=50&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));}
/** Owner-only DTO: no account key / moderator metadata / operations table payload. @param {unknown} value @returns {import('./events').EventOwnerEntry} */
function ownerDto(value){
 if(!object(value)||!shape(value,['id','revision','state','draft','createdAt','updatedAt'])||
  typeof value.id!=='string'||!uuid.test(value.id)||!Number.isSafeInteger(value.revision)||
  Number(value.revision)<1||!['draft','pending'].includes(String(value.state))||!stamp(value.createdAt)||!stamp(value.updatedAt))reject(503,'domain_unavailable');
 try{eventDraft(value.draft);}catch{return reject(503,'domain_unavailable');}
 return /** @type {import('./events').EventOwnerEntry} */({
  id:value.id,revision:value.revision,state:/** @type {'draft'|'pending'} */(value.state),draft:value.draft,createdAt:value.createdAt,updatedAt:value.updatedAt
 });
}
/** @param {unknown} value @returns {value is import('./event-contract').EventCursor|null} */
function cursor(value){return value===null||object(value)&&shape(value,['at','id'])&&stamp(value.at)&&typeof value.id==='string'&&uuid.test(value.id);}
/** @param {import('./contracts').Command} input @returns {input is import('./event-contract').EventCommand} */
const isEventsCommand=input=>input.action.startsWith('events.');
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository|null} documents */
function createEventsRepository(transport,documents){
 const guard=createAccessGuard(documents);
 return {
  /** @param {import('./contracts').Actor} actor @param {import('./event-contract').EventCommand} request */
  async execute(actor,request){
   requireOwner(actor,actor.accountHash);
   const command=eventCommand(request);
   if(!['events.save','events.read','events.mine','events.submit'].includes(command.action))reject(422,'invalid_request');
   await guard(actor);
   if(!transport.configured())reject(503,'domain_unavailable');
   try{
    const response=await transport.request('/rest/v1/rpc/'+(command.action==='events.submit'?'feture_event_submit_command':'feture_event_owner_command'),{
     method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,
     body:JSON.stringify({p_actor:actor.accountHash,p_command:command})
    });
    const data=await response.json();
    if(!response.ok||!object(data))reject(503,'domain_unavailable');
    if(data.ok!==true){
     if(data.error==='resource_not_found')reject(404,'resource_not_found');
     if(data.error==='invalid_request'||data.error==='invalid_cursor')reject(422,String(data.error));
     if(data.error==='revision_conflict'||data.error==='operation_conflict')reject(409,String(data.error));
     if(data.error==='rate_limited')reject(429,'rate_limited');
     reject(503,'domain_unavailable');
    }
    if(command.action==='events.mine'){
     if(!shape(data,['ok','items','nextCursor'])||!Array.isArray(data.items)||data.items.length>20||!cursor(data.nextCursor))reject(503,'domain_unavailable');
     return {items:data.items.map(ownerDto),nextCursor:data.nextCursor};
    }
    if(!shape(data,command.action==='events.save'||command.action==='events.submit'?['ok','entry','replayed']:['ok','entry']))reject(503,'domain_unavailable');
    const entry=ownerDto(data.entry);
    if(command.id!==entry.id)reject(503,'domain_unavailable');
    if(command.action==='events.submit'&&entry.state!=='pending'||command.action==='events.save'&&entry.state!=='draft')reject(503,'domain_unavailable');
    if(command.action==='events.save'||command.action==='events.submit'){
     if(typeof data.replayed!=='boolean')reject(503,'domain_unavailable');
     return {entry,replayed:data.replayed};
    }
    return {entry};
   }catch(error){if(error instanceof DomainError)throw error;return reject(503,'domain_unavailable');}
  }
 };
}
module.exports={ownerDto,isEventsCommand,createEventsRepository};
