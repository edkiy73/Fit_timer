// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {requireOwner}=require('./permissions');
const {createAccessGuard}=require('./access-guard');
const {uuid}=require('./documents');
const reasons=['policy','privacy','nonconsent','minor','illegal','spam','other'];
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} keys */
const shape=(v,keys)=>Object.keys(v).sort().join(',')===keys.sort().join(',');
/** @param {unknown} v */
const date=v=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
/** @param {unknown} v */
const revision=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=999999999999999;
/** @param {unknown} v */
const cursor=v=>v===null||object(v)&&shape(v,['at','id'])&&date(v.at)&&uuid(v.id);
/** @param {unknown} input @returns {import('./post-reports').PostReportCommand} */
function reportCommand(input){if(!object(input))reject(422,'invalid_request');const c=/** @type {Record<string,unknown>} */(input);
 if(c.action==='posts.reports'&&shape(c,['action','cursor'])&&cursor(c.cursor))return /** @type {import('./post-reports').PostReportCommand} */(c);
 if(c.action==='posts.report'&&shape(c,['action','id','reportId','expectedRevision','reason','note'])&&uuid(c.id)&&uuid(c.reportId)&&revision(c.expectedRevision)&&reasons.includes(String(c.reason))&&typeof c.note==='string'&&c.note.length<=1000&&!/[\x00-\x09\x0b-\x1f\x7f]/.test(c.note))return /** @type {import('./post-reports').PostReportCommand} */(c);
 return reject(422,'invalid_request');}
/** @param {unknown} input @returns {import('./post-reports').PostReport} */
function reportDTO(input){if(!object(input)||!shape(input,['id','postId','postRevision','reason','state','revision','createdAt','resolvedAt','resolution'])||!uuid(input.id)||!uuid(input.postId)||!revision(input.postRevision)||!revision(input.revision)||!reasons.includes(String(input.reason))||!['open','resolved'].includes(String(input.state))||!date(input.createdAt)||input.resolvedAt!==null&&!date(input.resolvedAt)||![null,'dismiss','hide'].includes(/** @type {string|null} */(input.resolution))||(input.state==='open'?(input.resolvedAt!==null||input.resolution!==null):(input.resolvedAt===null||input.resolution===null)))reject(503,'domain_unavailable');return /** @type {import('./post-reports').PostReport} */(input);}
/** @param {import('./contracts').Transport} transport @param {string} name @param {Record<string,unknown>} body */
async function rpc(transport,name,body){if(!transport.configured())reject(503,'domain_unavailable');try{const response=await transport.request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,body:JSON.stringify(body)});const r=await response.json();if(!response.ok||!object(r))reject(503,'domain_unavailable');if(r.ok!==true){if(r.error==='forbidden')reject(403,'forbidden');if(r.error==='resource_not_found')reject(404,'resource_not_found');if(['revision_conflict','operation_conflict','report_pending','review_required'].includes(String(r.error)))reject(409,String(r.error));if(r.error==='rate_limited')reject(429,'rate_limited');if(['invalid_request','invalid_cursor'].includes(String(r.error)))reject(422,String(r.error));reject(503,'domain_unavailable');}return r;}catch(e){if(e instanceof DomainError)throw e;return reject(503,'domain_unavailable');}}
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents */
function createPostReportsRepository(transport,documents){const guard=createAccessGuard(documents);return {/** @param {import('./contracts').Actor} actor @param {import('./post-reports').PostReportCommand} input */
 async execute(actor,input){requireOwner(actor,actor.accountHash);const c=reportCommand(input);if(c.action==='posts.report')await guard(actor);const r=await rpc(transport,'feture_post_report_command',{p_actor:actor.accountHash,p_command:c});
 if(c.action==='posts.reports'){if(!Array.isArray(r.items)||r.items.length>20||!cursor(r.nextCursor))reject(503,'domain_unavailable');return {items:r.items.map(reportDTO),nextCursor:r.nextCursor};}
 const report=reportDTO(r.report);if(report.id!==c.reportId||report.postId!==c.id||typeof r.replayed!=='boolean')reject(503,'domain_unavailable');return {report,replayed:r.replayed};}};}
/** @param {import('./contracts').Transport} transport @param {import('./contracts').Actor} actor @param {Record<string,unknown>} body */
async function reportReview(transport,actor,body){requireOwner(actor,actor.accountHash);if(!actor.accountGeneration)reject(403,'forbidden');const name=String(body.action).replace('feture.posts.','');
 if(name==='reports'||name==='reportAudit'){if(!shape(body,['action','cursor'])||!cursor(body.cursor))reject(422,'invalid_request');}
 else if(name==='resolveReport'){if(!shape(body,['action','decision','expectedRevision','id','operationId','reason'])||!uuid(body.id)||!uuid(body.operationId)||!revision(body.expectedRevision)||!['dismiss','hide'].includes(String(body.decision))||![...reasons,'reviewed'].includes(String(body.reason)))reject(422,'invalid_request');}
 else reject(422,'invalid_request');
 const r=await rpc(transport,'feture_post_report_review',{p_actor:actor.accountHash,p_generation:actor.accountGeneration,p_command:{...body,action:name}});
 if(name==='resolveReport'){const report=reportDTO(r.report);if(report.id!==body.id||typeof r.replayed!=='boolean')reject(503,'domain_unavailable');return {ok:true,report,replayed:r.replayed};}
 if(!Array.isArray(r.items)||r.items.length>20||!cursor(r.nextCursor))reject(503,'domain_unavailable');
 const items=r.items.map(v=>{if(!object(v))reject(503,'domain_unavailable');
 if(name==='reports'){const {note,context,...meta}=v;const report=reportDTO(meta);if(report.state!=='open'||typeof note!=='string'||note.length>1000)reject(503,'domain_unavailable');if(context!==null&&(!object(context)||!shape(context,['text','authorLabel','revision'])||typeof context.text!=='string'||context.text.length>3000||typeof context.authorLabel!=='string'||context.authorLabel.length>80||context.revision!==report.postRevision))reject(503,'domain_unavailable');return {...report,note,context};}
 if(!shape(v,['id','reportId','action','reason','revision','at'])||!uuid(v.id)||!uuid(v.reportId)||!['dismiss','hide'].includes(String(v.action))||![...reasons,'reviewed'].includes(String(v.reason))||!revision(v.revision)||!date(v.at))reject(503,'domain_unavailable');return v;});return {ok:true,items,nextCursor:r.nextCursor};
}
module.exports={reportCommand,reportDTO,createPostReportsRepository,reportReview};
