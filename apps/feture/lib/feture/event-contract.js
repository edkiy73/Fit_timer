// @ts-check
'use strict';
// E01a: pure, strict event metadata contract. Not wired to /api/domain until server ACL/SQL land.
const {reject}=require('./errors');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} keys */
const keys=(v,keys)=>Object.keys(v).sort().join('\0')===keys.slice().sort().join('\0');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const pgStamp=v=>typeof v==='string'&&v.length<=50&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,6})?)?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
/** @param {unknown} v @param {number} max @param {number} [min] */
const plain=(v,max,min=0)=>typeof v==='string'&&v.length>=min&&v.length<=max&&v.trim().length>=min&&!/[\x00-\x08\x0b-\x1f\x7f]/.test(v);
/** @param {unknown} v */
function instant(v){
 if(typeof v!=='string'||v.length>40||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(v))return false;
 const [y,m,d]=v.slice(0,10).split('-').map(Number);
 if(m<1||m>12||d<1||d>31||new Date(Date.UTC(y,m-1,d)).getUTCDate()!==d)return false;
 const h=Number(v.slice(11,13)),mm=Number(v.slice(14,16)),sec=v[16]===':'?Number(v.slice(17,19)):0;
 if(h>23||mm>59||sec>59)return false;
 const match=v.match(/([+-])(\d\d):(\d\d)$/);
 if(match&&(Number(match[2])>14||Number(match[3])>59||(Number(match[2])===14&&Number(match[3])!==0)))return false;
 return Number.isFinite(Date.parse(v));
}
/** @param {unknown} v */
function timeZone(v){
 if(typeof v!=='string'||v.length>64||!(v==='UTC'||/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(v)))return false;
 try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}
}
/** Public external links only; avoid localhost, IP destinations, credentials and script URLs. @param {unknown} v */
function https(v){
 if(typeof v!=='string'||v.length>1500||/[\x00-\x20\x7f]/.test(v))return false;
 try{
  const u=new URL(v);
  const host=u.hostname.toLowerCase();
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
    host.length<=253&&host.includes('.')&&!host.endsWith('.local')&&!host.endsWith('.localhost')&&
    /^[a-z0-9.-]+$/.test(host)&&!/(^|\.)(localhost|local|internal|test|invalid)$/.test(host)&&
    !/^\d+(?:\.\d+){3}$/.test(host)&&!host.startsWith('[');
 }catch{return false;}
}
/** @param {unknown} v @returns {import('./event-contract').EventDraft} */
function eventDraft(v){
 if(!record(v)||!keys(v,['title','summary','description','conditions','format','visibility','startsAt','endsAt','timeZone','language','city','publicLocation','privateLocation','privateJoinUrl','ticketUrl','price']))reject(422,'invalid_request');
 if(!plain(v.title,120,2)||!plain(v.summary,500)||!plain(v.description,6000)||!plain(v.conditions,3000))reject(422,'invalid_request');
 if(v.format!=='online'&&v.format!=='offline'||v.visibility!=='public'&&v.visibility!=='private')reject(422,'invalid_request');
 if(!instant(v.startsAt)||!instant(v.endsAt)||Date.parse(String(v.endsAt))<=Date.parse(String(v.startsAt))||!timeZone(v.timeZone))reject(422,'invalid_request');
 if(typeof v.language!=='string'||!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(v.language)||!plain(v.city,120)||!plain(v.publicLocation,200))reject(422,'invalid_request');
 if(v.privateLocation!==null&&!plain(v.privateLocation,500)||v.privateJoinUrl!==null&&!https(v.privateJoinUrl)||v.ticketUrl!==null&&!https(v.ticketUrl))reject(422,'invalid_request');
 if(v.format==='online'&&(v.privateLocation!==null||v.publicLocation!=='')||v.format==='offline'&&(v.privateJoinUrl!==null||!String(v.city).trim()))reject(422,'invalid_request');
 if(v.price!==null&&(!record(v.price)||!keys(v.price,['amountMinor','currency'])||!Number.isSafeInteger(v.price.amountMinor)||Number(v.price.amountMinor)<1||Number(v.price.amountMinor)>1e11||typeof v.price.currency!=='string'||!/^[A-Z]{3}$/.test(v.price.currency)))reject(422,'invalid_request');
 return /** @type {import('./event-contract').EventDraft} */(v);
}
/** Strict command boundary, no account or organizer IDs from client. @param {unknown} v @returns {import('./event-contract').EventCommand} */
function eventCommand(v){
 if(!record(v)||typeof v.action!=='string')reject(422,'invalid_request');
 if((v.action==='events.mine'||v.action==='events.catalog')&&keys(v,['action','cursor'])&&
    (v.cursor===null||record(v.cursor)&&keys(v.cursor,['at','id'])&&pgStamp(v.cursor.at)&&typeof v.cursor.id==='string'&&uuid.test(v.cursor.id)))
  return /** @type {import('./event-contract').EventCommand} */(v);
 if(v.action==='events.attendanceStatus'&&keys(v,['action','id'])&&
    typeof v.id==='string'&&uuid.test(v.id))
  return /** @type {import('./event-contract').EventCommand} */(v);
 if((v.action==='events.attendanceRequest'||v.action==='events.attendanceWithdraw')&&
    keys(v,['action','id','operationId'])&&typeof v.id==='string'&&uuid.test(v.id)&&
    typeof v.operationId==='string'&&uuid.test(v.operationId))
  return /** @type {import('./event-contract').EventCommand} */(v);
 if(v.action==='events.rsvpStatus'&&keys(v,['action','id'])&&
    typeof v.id==='string'&&uuid.test(v.id))
  return /** @type {import('./event-contract').EventCommand} */(v);
 if(v.action==='events.rsvpSet'&&keys(v,['action','id','operationId','status','visibleToAttendees'])&&
    typeof v.id==='string'&&uuid.test(v.id)&&
    typeof v.operationId==='string'&&uuid.test(v.operationId)&&
    ['interested','going','declined','withdrawn'].includes(String(v.status))&&
    typeof v.visibleToAttendees==='boolean'&&
    ((v.status==='interested'||v.status==='going')||v.visibleToAttendees===false))
  return /** @type {import('./event-contract').EventCommand} */(v);
 if(v.action==='events.preview'&&keys(v,['action','id'])&&
    typeof v.id==='string'&&uuid.test(v.id))
  return /** @type {import('./event-contract').EventCommand} */(v);
 if(v.action==='events.read'&&keys(v,['action','id'])&&typeof v.id==='string'&&uuid.test(v.id))
  return /** @type {import('./event-contract').EventCommand} */(v);
 if(v.action==='events.save'&&keys(v,['action','id','operationId','expectedRevision','draft'])&&
    typeof v.id==='string'&&uuid.test(v.id)&&typeof v.operationId==='string'&&uuid.test(v.operationId)&&
    Number.isSafeInteger(v.expectedRevision)&&Number(v.expectedRevision)>=0&&Number(v.expectedRevision)<=999999999999999){
  eventDraft(v.draft);return /** @type {import('./event-contract').EventCommand} */(v);
 }
 if((v.action==='events.submit'||v.action==='events.cancel')&&keys(v,['action','id','operationId','expectedRevision'])&&
    typeof v.id==='string'&&uuid.test(v.id)&&typeof v.operationId==='string'&&uuid.test(v.operationId)&&
    Number.isSafeInteger(v.expectedRevision)&&Number(v.expectedRevision)>=1&&Number(v.expectedRevision)<=999999999999999)
  return /** @type {import('./event-contract').EventCommand} */(v);
 return reject(422,'invalid_request');
}
/** Public whitelist: never return attendee, private venue, join URL or personal identity. SQL must enforce ACL BEFORE this serializer.
 * @param {unknown} row @returns {import('./event-contract').PublicEvent}
 */
function publicEventDto(row){
 if(!record(row)||typeof row.id!=='string'||!uuid.test(row.id)||
   row.state!=='published'||!Number.isSafeInteger(row.revision)||Number(row.revision)<1)reject(503,'domain_unavailable');
 let draft;
 try{draft=eventDraft(row.draft);}catch{return reject(503,'domain_unavailable');}
 if(draft.visibility!=='public')reject(503,'domain_unavailable');
 return {
  id:row.id,revision:/** @type {number} */(row.revision),
  title:draft.title,summary:draft.summary,description:draft.description,conditions:draft.conditions,
  format:draft.format,startsAt:draft.startsAt,endsAt:draft.endsAt,timeZone:draft.timeZone,
  language:draft.language,city:draft.city,publicLocation:draft.publicLocation,
  price:draft.price,hasExternalTickets:draft.ticketUrl!==null
 };
}
module.exports={eventDraft,eventCommand,publicEventDto};
