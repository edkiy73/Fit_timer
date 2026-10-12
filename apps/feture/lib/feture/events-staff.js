// @ts-check
'use strict';
// E01d.1 staff-only pending metadata, never public feeds or venue secrets.
const {requireOwner}=require('./permissions');
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} fields */
const shape=(v,fields)=>Object.keys(v).sort().join(',')===fields.slice().sort().join(',');
/** @param {unknown} v */
const stamp=v=>typeof v==='string'&&v.length<=50&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
/** @param {unknown} v */
const cursor=v=>v===null||obj(v)&&shape(v,['at','id'])&&stamp(v.at)&&uuid(v.id);
/** @param {unknown} v */
function entry(v){
 if(!obj(v)||!shape(v,['id','revision','state','submittedAt','title','summary','description','conditions',
  'format','visibility','startsAt','endsAt','timeZone'])||!uuid(v.id)||!Number.isSafeInteger(v.revision)||
  Number(v.revision)<2||v.state!=='pending'||!stamp(v.submittedAt)||!stamp(v.startsAt)||!stamp(v.endsAt)||
  typeof v.title!=='string'||v.title.length<2||v.title.length>120||
  typeof v.summary!=='string'||v.summary.length>500||
  typeof v.description!=='string'||v.description.length>6000||
  typeof v.conditions!=='string'||v.conditions.length>3000||
  !['online','offline'].includes(String(v.format))||!['public','private'].includes(String(v.visibility))||
  typeof v.timeZone!=='string'||v.timeZone.length>64)reject(503,'operators_unavailable');
 return {
  id:v.id,revision:v.revision,state:'pending',submittedAt:v.submittedAt,
  title:v.title,summary:v.summary,description:v.description,conditions:v.conditions,
  format:v.format,visibility:v.visibility,startsAt:v.startsAt,endsAt:v.endsAt,timeZone:v.timeZone
 };
}
/** @param {import('./contracts').Transport} transport @param {import('./contracts').Actor} actor @param {Record<string,unknown>} input */
async function eventStaffQueue(transport,actor,input){
 requireOwner(actor,actor.accountHash);
 if(!actor.accountGeneration)reject(403,'forbidden');
 if(!obj(input)||!shape(input,['action','cursor'])||input.action!=='feture.events.queue'||!cursor(input.cursor))
  reject(422,'invalid_request');
 if(!transport.configured())reject(503,'operators_unavailable');
 try{
  const response=await transport.request('/rest/v1/rpc/feture_event_staff_queue',{
   method:'POST',timeoutMs:8000,headers:{'Content-Type':'application/json'},
   body:JSON.stringify({p_actor:actor.accountHash,p_generation:actor.accountGeneration,p_command:{action:'queue',cursor:input.cursor}})
  });
  const data=await response.json();
  if(!response.ok||!obj(data))reject(503,'operators_unavailable');
  if(data.ok!==true){
   if(data.error==='forbidden')reject(403,'forbidden');
   if(data.error==='invalid_request'||data.error==='invalid_cursor')reject(422,String(data.error));
   reject(503,'operators_unavailable');
  }
  if(!shape(data,['ok','items','nextCursor'])||!Array.isArray(data.items)||data.items.length>20||!cursor(data.nextCursor))
   reject(503,'operators_unavailable');
  return {ok:true,items:data.items.map(entry),nextCursor:data.nextCursor};
 }catch(e){if(e instanceof DomainError)throw e;return reject(503,'operators_unavailable');}
}
module.exports={eventStaffQueue};


const reasons=['reviewed','policy','privacy','nonconsent','minor','illegal','spam','other'];
/** E01e: decision changes pending to approved or rejected, NOT published.
 * @param {import('./contracts').Transport} transport
 * @param {import('./contracts').Actor} actor
 * @param {Record<string,unknown>} input */
async function eventStaffDecision(transport,actor,input){
 requireOwner(actor,actor.accountHash);
 if(!actor.accountGeneration)reject(403,'forbidden');
 if(!obj(input)||!shape(input,['action','decision','expectedRevision','id','operationId','reason'])||
   input.action!=='feture.events.decide'||!uuid(input.id)||!uuid(input.operationId)||
   !Number.isSafeInteger(input.expectedRevision)||Number(input.expectedRevision)<2||
   Number(input.expectedRevision)>999999999999999||
   !['approve','reject'].includes(String(input.decision))||!reasons.includes(String(input.reason))||
   (input.decision==='approve'&&input.reason!=='reviewed')||
   (input.decision==='reject'&&input.reason==='reviewed'))
  reject(422,'invalid_request');
 if(!transport.configured())reject(503,'operators_unavailable');
 const command={action:'decide',decision:input.decision,reason:input.reason,id:input.id,
   operationId:input.operationId,expectedRevision:input.expectedRevision};
 try{
  const response=await transport.request('/rest/v1/rpc/feture_event_staff_decide',{
   method:'POST',timeoutMs:8000,headers:{'Content-Type':'application/json'},
   body:JSON.stringify({p_actor:actor.accountHash,p_generation:actor.accountGeneration,p_command:command})
  });
  const data=await response.json();
  if(!response.ok||!obj(data))reject(503,'operators_unavailable');
  if(data.ok!==true){
   if(data.error==='forbidden')reject(403,'forbidden');
   if(data.error==='review_required'||data.error==='revision_conflict'||data.error==='operation_conflict')
    reject(409,String(data.error));
   if(data.error==='resource_not_found')reject(404,'resource_not_found');
   if(data.error==='invalid_request')reject(422,'invalid_request');
   reject(503,'operators_unavailable');
  }
  if(!shape(data,['ok','event','replayed'])||typeof data.replayed!=='boolean'||
     !obj(data.event)||!shape(data.event,['id','state','revision'])||
     data.event.id!==input.id||!uuid(data.event.id)||
     !['approved','rejected'].includes(String(data.event.state))||
     data.event.state!==(input.decision==='approve'?'approved':'rejected')||
     !Number.isSafeInteger(data.event.revision)||Number(data.event.revision)<3)
    reject(503,'operators_unavailable');
  // Never forward upstream metadata, owner hashes, drafts, URLs or reviewer identities.
  return {ok:true,event:{id:data.event.id,state:data.event.state,revision:data.event.revision},
   replayed:data.replayed};
 }catch(e){if(e instanceof DomainError)throw e;return reject(503,'operators_unavailable');}
}
module.exports.eventStaffDecision=eventStaffDecision;


/** E03b publication is a separate checked transition AFTER manager-approved review.
 * @param {import('./contracts').Transport} transport
 * @param {import('./contracts').Actor} actor
 * @param {Record<string,unknown>} input
 */
async function eventStaffPublish(transport,actor,input){
 requireOwner(actor,actor.accountHash);
 if(!actor.accountGeneration)reject(403,'forbidden');
 if(!obj(input)||!shape(input,['action','expectedRevision','id','operationId'])||
   input.action!=='feture.events.publish'||!uuid(input.id)||!uuid(input.operationId)||
   !Number.isSafeInteger(input.expectedRevision)||Number(input.expectedRevision)<3||
   Number(input.expectedRevision)>999999999999999)
  reject(422,'invalid_request');
 if(!transport.configured())reject(503,'operators_unavailable');
 const command={action:'publish',id:input.id,
   operationId:input.operationId,expectedRevision:input.expectedRevision};
 try{
  const response=await transport.request('/rest/v1/rpc/feture_event_staff_publish',{
   method:'POST',timeoutMs:8000,headers:{'Content-Type':'application/json'},
   body:JSON.stringify({p_actor:actor.accountHash,p_generation:actor.accountGeneration,p_command:command})
  });
  const data=await response.json();
  if(!response.ok||!obj(data))reject(503,'operators_unavailable');
  if(data.ok!==true){
   if(data.error==='forbidden')reject(403,'forbidden');
   if(['review_required','revision_conflict','operation_conflict'].includes(String(data.error)))
    reject(409,String(data.error));
   if(data.error==='resource_not_found')reject(404,'resource_not_found');
   if(data.error==='invalid_request')reject(422,'invalid_request');
   reject(503,'operators_unavailable');
  }
  if(!shape(data,['ok','event','replayed'])||typeof data.replayed!=='boolean'||
    !obj(data.event)||!shape(data.event,['id','state','revision'])||
    data.event.id!==input.id||data.event.state!=='published'||
    !Number.isSafeInteger(data.event.revision)||Number(data.event.revision)<4)
   reject(503,'operators_unavailable');
  return {ok:true,event:{id:data.event.id,state:'published',revision:data.event.revision},
   replayed:data.replayed};
 }catch(e){if(e instanceof DomainError)throw e;return reject(503,'operators_unavailable');}
}
module.exports.eventStaffPublish=eventStaffPublish;
