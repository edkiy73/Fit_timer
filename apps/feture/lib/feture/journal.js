// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {interestState}=require('./interest-model');
const {uuid}=require('./documents');
const {requireOwner}=require('./permissions');
const {createAccessGuard}=require('./access-guard');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} c @param {string[]} keys */
const shape=(c,keys)=>Object.keys(c).sort().join(',')===keys.sort().join(',');
/** @param {unknown} v */
const date=v=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
/** @param {unknown} input @returns {import('./journal').JournalCommand} */
function journalCommand(input){if(!object(input))reject(422,'invalid_request');const c=/** @type {Record<string,unknown>} */(input);
 if(c.action==='journal.list'||c.action==='history.list'){if(!shape(c,['action','cursor'])||(c.cursor!==null&&(!object(c.cursor)||!shape(c.cursor,['id','at'])||!uuid(c.cursor.id)||!date(c.cursor.at))))reject(422,'invalid_request');return /** @type {import('./journal').JournalCommand} */(c);}
 if(c.action==='journal.read'&&shape(c,['action','id'])&&uuid(c.id))return /** @type {import('./journal').JournalCommand} */(c);
 if(!uuid(c.operationId))reject(422,'invalid_request');
 if(c.action==='history.clear'&&shape(c,['action','operationId']))return /** @type {import('./journal').JournalCommand} */(c);
 if(!uuid(c.id)||typeof c.expectedRevision!=='number'||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0||c.expectedRevision>=Number.MAX_SAFE_INTEGER)reject(422,'invalid_request');
 if(c.action==='journal.delete'&&shape(c,['action','id','operationId','expectedRevision']))return /** @type {import('./journal').JournalCommand} */(c);
 if(c.action==='journal.save'&&shape(c,['action','id','operationId','expectedRevision','title','text','topicId'])&&typeof c.title==='string'&&c.title.length<=160&&!/[\x00-\x1f\x7f]/.test(c.title)&&typeof c.text==='string'&&c.text.trim().length>0&&c.text.length<=3000&&!/[\x00-\x09\x0b-\x1f\x7f]/.test(c.text)&&(c.topicId===null||typeof c.topicId==='string'&&/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/.test(c.topicId)))return /** @type {import('./journal').JournalCommand} */(c);
 return reject(422,'invalid_request');}
/** @param {import('./contracts').Command} c @returns {c is import('./journal').JournalCommand} */
const isJournalCommand=c=>c.action.startsWith('journal.')||c.action.startsWith('history.');
/** @param {unknown} input @returns {import('./journal').JournalEntry} */
function entryDTO(input){if(!object(input)||!uuid(input.id)||typeof input.title!=='string'||input.title.length>160||typeof input.text!=='string'||input.text.length>3000||input.topicId!==null&&(typeof input.topicId!=='string'||!/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/.test(input.topicId))||typeof input.deleted!=='boolean'||typeof input.revision!=='number'||!Number.isSafeInteger(input.revision)||input.revision<1||!date(input.createdAt)||!date(input.updatedAt))reject(503,'domain_unavailable');
 if(input.deleted&&(input.text!==''||input.title!==''||input.topicId!==null))reject(503,'domain_unavailable');
 return /** @type {import('./journal').JournalEntry} */({id:input.id,title:input.title,text:input.text,topicId:input.topicId,deleted:input.deleted,revision:input.revision,createdAt:input.createdAt,updatedAt:input.updatedAt});}
/** @param {unknown} input @returns {import('./journal').InterestHistory} */
function historyDTO(input){if(!object(input)||!uuid(input.id)||typeof input.interestId!=='string'||!/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/.test(input.interestId)||typeof input.revision!=='number'||!Number.isSafeInteger(input.revision)||input.revision<1||!date(input.createdAt)||!object(input.entry))reject(503,'domain_unavailable');
 const e=/** @type {Record<string,unknown>} */(input.entry);if(e.interest_id!==input.interestId||e.revision!==input.revision||typeof e.deleted!=='boolean'||e.source!=='manual'&&e.source!=='test'||e.test_version!==null&&!uuid(e.test_version)||!date(e.updated_at))reject(503,'domain_unavailable');let state;try{state=interestState({stance:e.stance,experience:e.experience,boundary:e.boundary,boundaryNote:e.boundary_note,intensity:e.intensity,visibility:e.visibility,useForDiscovery:e.use_for_discovery});}catch{return reject(503,'domain_unavailable');}
 return /** @type {import('./journal').InterestHistory} */({id:input.id,interestId:input.interestId,revision:input.revision,createdAt:input.createdAt,entry:{...state,interestId:input.interestId,revision:input.revision,updatedAt:e.updated_at,source:e.source,testVersion:e.test_version,deleted:e.deleted}});}
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents @returns {import('./journal').JournalRepository} */
function createJournalRepository(transport,documents){const guard=createAccessGuard(documents);return {async execute(actor,input){
 requireOwner(actor,actor.accountHash);const c=journalCommand(input);if(c.action!=='journal.delete'&&c.action!=='history.clear')await guard(actor);
 if(!transport.configured())reject(503,'domain_unavailable');let result;
 try{const r=await transport.request('/rest/v1/rpc/feture_journal_command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner:actor.accountHash,p_command:c}),timeoutMs:8000});if(!r.ok)reject(503,'domain_unavailable');result=await r.json();}catch{return reject(503,'domain_unavailable');}
 if(!object(result))reject(503,'domain_unavailable');
 if(result.ok!==true){const e=result.error;if(e==='resource_not_found')reject(404,e);if(e==='revision_conflict'||e==='operation_conflict')throw new DomainError(409,e);if(e==='invalid_request')reject(422,e);if(e==='journal_limit')reject(429,e);reject(503,'domain_unavailable');}
 // SQL DTO explicitly omits owner. Do not expose unexpected transport fields.
 if(c.action==='journal.list'||c.action==='history.list'){
  if(!Array.isArray(result.items)||result.items.length>30||
    result.nextCursor!==null&&(!object(result.nextCursor)||!uuid(result.nextCursor.id)||!date(result.nextCursor.at)))reject(503,'domain_unavailable');
  const items=result.items.map(c.action==='journal.list'?entryDTO:historyDTO);
  // SQL returns one extra row only to detect a next page. Its cursor is the
  // (id,createdAt) pair from item 30, not an arbitrary provider-supplied URL.
  // A repeated or detached cursor could otherwise trap the UI in a loop.
  if(new Set(items.map(item=>item.id)).size!==items.length)reject(503,'domain_unavailable');
  if(result.nextCursor!==null){
   const last=items.at(-1);
   if(items.length!==30||!last||result.nextCursor.id!==last.id||result.nextCursor.at!==last.createdAt||
     c.cursor!==null&&result.nextCursor.id===c.cursor.id&&result.nextCursor.at===c.cursor.at)
    reject(503,'domain_unavailable');
  }
  return {items,nextCursor:result.nextCursor===null?null:{id:result.nextCursor.id,at:result.nextCursor.at}};
 }
 if(c.action==='history.clear'){if(typeof result.cleared!=='number'||!Number.isSafeInteger(result.cleared)||result.cleared<0||typeof result.replayed!=='boolean')reject(503,'domain_unavailable');return {cleared:result.cleared,replayed:result.replayed};}
 if(!object(result.entry)||!uuid(result.entry.id)||result.entry.id!==c.id||typeof result.entry.revision!=='number'||!Number.isSafeInteger(result.entry.revision)||result.entry.revision<1)reject(503,'domain_unavailable');
 if(c.action!=='journal.read'&&typeof result.replayed!=='boolean')reject(503,'domain_unavailable');return {entry:entryDTO(result.entry),...(c.action==='journal.read'?{}:{replayed:result.replayed})};
}};}
module.exports={journalCommand,isJournalCommand,createJournalRepository};
