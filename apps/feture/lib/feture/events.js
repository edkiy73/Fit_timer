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
  Number(value.revision)<1||!['draft','pending','approved','rejected','cancelled','published'].includes(String(value.state))||!stamp(value.createdAt)||!stamp(value.updatedAt))reject(503,'domain_unavailable');
 try{eventDraft(value.draft);}catch{return reject(503,'domain_unavailable');}
 return /** @type {import('./events').EventOwnerEntry} */({
  id:value.id,revision:value.revision,state:/** @type {'draft'|'pending'|'approved'|'rejected'|'cancelled'|'published'} */(value.state),draft:value.draft,createdAt:value.createdAt,updatedAt:value.updatedAt
 });
}

/** SQL must check live ACL before projecting this strict public whitelist.
 * @param {unknown} value @returns {import('./event-contract').PublicEvent} */
function publicCardDto(value){
 if(!object(value)||!shape(value,['id','revision','title','summary','description','conditions',
  'format','startsAt','endsAt','timeZone','language','city','publicLocation','price','hasExternalTickets'])||
  typeof value.id!=='string'||!uuid.test(value.id)||!Number.isSafeInteger(value.revision)||
  Number(value.revision)<1||typeof value.title!=='string'||value.title.trim().length<2||
  value.title.length>120||typeof value.summary!=='string'||value.summary.length>500||
  typeof value.description!=='string'||value.description.length>6000||
  typeof value.conditions!=='string'||value.conditions.length>3000||
  !['online','offline'].includes(String(value.format))||
  typeof value.startsAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value.startsAt)||
  typeof value.endsAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value.endsAt)||
  !Number.isFinite(Date.parse(value.startsAt))||!Number.isFinite(Date.parse(value.endsAt))||
  Date.parse(value.endsAt)<=Date.parse(value.startsAt)||
  typeof value.timeZone!=='string'||value.timeZone.length>64||
  typeof value.language!=='string'||!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(value.language)||
  typeof value.city!=='string'||value.city.length>120||
  typeof value.publicLocation!=='string'||value.publicLocation.length>200||
  (value.price!==null&&(!object(value.price)||
    !shape(value.price,['amountMinor','currency'])||!Number.isSafeInteger(value.price.amountMinor)||
    Number(value.price.amountMinor)<1||Number(value.price.amountMinor)>100000000000||
    typeof value.price.currency!=='string'||!/^[A-Z]{3}$/.test(value.price.currency)))||
  typeof value.hasExternalTickets!=='boolean')
  reject(503,'domain_unavailable');
 return /** @type {import('./event-contract').PublicEvent} */(value);
}


/** Minimal request preview. This is not a verified public profile identity.
 * @param {unknown} value */
function requestQueueDto(value){
 if(!object(value)||!shape(value,['requestId','requestedAt','state'])||
  typeof value.requestId!=='string'||!uuid.test(value.requestId)||
  !stamp(value.requestedAt)||value.state!=='pending')
  reject(503,'domain_unavailable');
 return {requestId:value.requestId,requestedAt:value.requestedAt,state:'pending'};
}


/** Organizer-owned roster only; incoming SQL projection never includes account ids.
 * @param {unknown} value */
function attendeeDto(value){
 if(!object(value)||!shape(value,['participationId','kind','status','updatedAt','displayName'])||
  typeof value.participationId!=='string'||!uuid.test(value.participationId)||
  !['rsvp','request'].includes(String(value.kind))||
  !stamp(value.updatedAt)||
  !(value.kind==='rsvp'&&['interested','going'].includes(String(value.status))||
    value.kind==='request'&&value.status==='approved')||
  !(value.displayName===null||typeof value.displayName==='string'&&
    value.displayName.trim().length>0&&value.displayName.length<=80))
  reject(503,'domain_unavailable');
 return {participationId:value.participationId,kind:value.kind,status:value.status,
  updatedAt:value.updatedAt,displayName:value.displayName};
}
const countKeys=['interested','going','rsvpDeclined','requestsPending','requestsApproved','requestsDeclined'];
/** @param {unknown} value */
function attendeeCountsDto(value){
 if(!object(value)||!shape(value,countKeys)||
   !countKeys.every(k=>Number.isSafeInteger(value[k])&&Number(value[k])>=0))
   reject(503,'domain_unavailable');
 return {interested:value.interested,going:value.going,rsvpDeclined:value.rsvpDeclined,
  requestsPending:value.requestsPending,requestsApproved:value.requestsApproved,
  requestsDeclined:value.requestsDeclined};
}


/** Strict peer-visible projection: never pass account hash, private profile or RSVP visibility.
 * @param {unknown} value */
function peerDto(value){
 if(!object(value)||!shape(value,['participationId','status','displayName','updatedAt'])||
    typeof value.participationId!=='string'||!uuid.test(value.participationId)||
    !['interested','going'].includes(String(value.status))||
    typeof value.displayName!=='string'||value.displayName.trim().length===0||
    value.displayName.length>80||!stamp(value.updatedAt))
  reject(503,'domain_unavailable');
 return {participationId:value.participationId,status:value.status,
  displayName:value.displayName,updatedAt:value.updatedAt};
}

/** @param {unknown} value @returns {value is import('./event-contract').EventCursor|null} */
function cursor(value){return value===null||object(value)&&shape(value,['at','id'])&&typeof value.at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,6})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value.at)&&Number.isFinite(Date.parse(value.at))&&typeof value.id==='string'&&uuid.test(value.id);}
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
   if(!['events.save','events.read','events.mine','events.submit','events.cancel','events.rsvpStatus','events.rsvpSet','events.catalog','events.preview','events.attendanceStatus','events.attendanceRequest','events.attendanceWithdraw','events.attendanceRequests','events.attendanceDecide','events.attendees','events.peers'].includes(command.action))reject(422,'invalid_request');
   if(command.action!=='events.cancel'&&!(command.action==='events.rsvpSet'&&command.status==='withdrawn')&&command.action!=='events.attendanceWithdraw')
    await guard(actor); // Withdrawal must stay possible after loss of event/18+/consent access.
   if(command.action==='events.attendanceDecide'&&(!actor.accountGeneration||!/^[a-f0-9]{64}$/.test(actor.accountGeneration)))reject(403,'forbidden');
   if(!transport.configured())reject(503,'domain_unavailable');
   try{
    const response=await transport.request('/rest/v1/rpc/'+(command.action==='events.submit'?'feture_event_submit_command':command.action==='events.cancel'?'feture_event_cancel_command':command.action==='events.rsvpSet'||command.action==='events.rsvpStatus'?'feture_event_rsvp_command':command.action==='events.catalog'||command.action==='events.preview'?'feture_event_catalog_command':command.action==='events.peers'?'feture_event_attendee_peers':command.action==='events.attendees'?'feture_event_owner_attendees':command.action==='events.attendanceDecide'?'feture_event_attendance_owner_decide':command.action==='events.attendanceRequests'?'feture_event_attendance_owner_queue':command.action==='events.attendanceStatus'||command.action==='events.attendanceRequest'||command.action==='events.attendanceWithdraw'?'feture_event_attendance_command':'feture_event_owner_command'),{
     method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,
     body:JSON.stringify({p_actor:actor.accountHash,...(command.action==='events.attendanceDecide'?{p_generation:actor.accountGeneration}:{}),p_command:command})
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
    if(command.action==='events.peers'){
     if(!shape(data,['ok','items','nextCursor'])||
       !Array.isArray(data.items)||data.items.length>20||!cursor(data.nextCursor))
       reject(503,'domain_unavailable');
     return {items:data.items.map(peerDto),nextCursor:data.nextCursor};
    }
    if(command.action==='events.attendees'){
     if(!shape(data,['ok','items','nextCursor','counts'])||
       !Array.isArray(data.items)||data.items.length>20||!cursor(data.nextCursor))
       reject(503,'domain_unavailable');
     return {items:data.items.map(attendeeDto),nextCursor:data.nextCursor,
       counts:attendeeCountsDto(data.counts)};
    }
    if(command.action==='events.attendanceDecide'){
     if(!shape(data,['ok','request','replayed'])||typeof data.replayed!=='boolean'||
       !object(data.request)||!shape(data.request,['requestId','state','revision'])||
       data.request.requestId!==command.requestId||
       !['approved','declined'].includes(String(data.request.state))||
       data.request.state!==(command.decision==='approve'?'approved':'declined')||
       !Number.isSafeInteger(data.request.revision)||data.request.revision<=command.expectedRevision)
       reject(503,'domain_unavailable');
     return {request:{requestId:data.request.requestId,state:data.request.state,
       revision:data.request.revision},replayed:data.replayed};
    }
    if(command.action==='events.attendanceRequests'){
     if(!shape(data,['ok','items','nextCursor'])||!Array.isArray(data.items)||
       data.items.length>20||!cursor(data.nextCursor))reject(503,'domain_unavailable');
     return {items:data.items.map(requestQueueDto),nextCursor:data.nextCursor};
    }
    if(command.action==='events.attendanceStatus'||command.action==='events.attendanceRequest'||command.action==='events.attendanceWithdraw'){
     if(!shape(data,['ok','state','replayed'])||
       !['none','pending','approved','declined','withdrawn'].includes(String(data.state))||
       typeof data.replayed!=='boolean'||
       (command.action==='events.attendanceWithdraw'&&data.state!=='withdrawn'))
       reject(503,'domain_unavailable');
     return {state:data.state,replayed:data.replayed};
    }
    if(command.action==='events.rsvpSet'||command.action==='events.rsvpStatus'){
     if(!shape(data,['ok','status','visibleToAttendees','counts','replayed'])||
       !['none','interested','going','declined','withdrawn'].includes(String(data.status))||
       (command.action==='events.rsvpSet'&&command.status==='withdrawn'&&data.status!=='withdrawn'&&!data.replayed)||
       typeof data.visibleToAttendees!=='boolean'||typeof data.replayed!=='boolean'||
       !object(data.counts)||!shape(data.counts,['interested','going'])||
       !['interested','going'].every(key=>data.counts[key]===null||
         Number.isSafeInteger(data.counts[key])&&Number(data.counts[key])>=5)||
       (!['interested','going'].includes(String(data.status))&&data.visibleToAttendees))
       reject(503,'domain_unavailable');
     return {status:data.status,visibleToAttendees:data.visibleToAttendees,
       counts:{interested:data.counts.interested,going:data.counts.going},replayed:data.replayed};
    }
    if(command.action==='events.cancel'){
     if(!shape(data,['ok','event','replayed'])||typeof data.replayed!=='boolean'||!object(data.event)||
      !shape(data.event,['id','state','revision'])||data.event.id!==command.id||
      data.event.state!=='cancelled'||!Number.isSafeInteger(data.event.revision)||
      Number(data.event.revision)<=command.expectedRevision)
       reject(503,'domain_unavailable');
     return {event:{id:data.event.id,state:'cancelled',revision:data.event.revision},replayed:data.replayed};
    }
    if(command.action==='events.preview'){
     if(!shape(data,['ok','entry']))reject(503,'domain_unavailable');
     const entry=publicCardDto(data.entry);
     if(entry.id!==command.id)reject(503,'domain_unavailable');
     return {entry};
    }
    if(command.action==='events.catalog'){
     if(!shape(data,['ok','items','nextCursor'])||
       !Array.isArray(data.items)||data.items.length>20||!cursor(data.nextCursor))
      reject(503,'domain_unavailable');
     return {items:data.items.map(publicCardDto),nextCursor:data.nextCursor};
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
module.exports={ownerDto,publicCardDto,requestQueueDto,attendeeDto,attendeeCountsDto,peerDto,isEventsCommand,createEventsRepository};
