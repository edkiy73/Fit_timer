// @ts-check
'use strict';
const {reject}=require('./errors');
const {reportReview}=require('./post-reports');
const {uuid}=require('./documents');
const {requireOwner}=require('./permissions');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {unknown} v */
const date=v=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
/** @param {Record<string,unknown>} v @param {string[]} keys */
const shape=(v,keys)=>Object.keys(v).sort().join(',')===keys.sort().join(',');
/** @param {unknown} v */
const cursor=v=>v===null||object(v)&&shape(v,['id','at'])&&uuid(v.id)&&date(v.at);
const decisions=['approve','reject','hide','reopen'],reasons=['reviewed','policy','privacy','nonconsent','minor','illegal','spam','other'];
/** @param {import('./contracts').Transport} transport @param {import('./contracts').Actor} actor @param {Record<string,unknown>} body */
async function postReview(transport,actor,body){requireOwner(actor,actor.accountHash);if(!actor.accountGeneration)reject(403,'forbidden');
 const action=body.action;if(typeof action!=='string')reject(422,'invalid_request');const name=action.replace('feture.posts.','');
 if(['reports','resolveReport','reportAudit'].includes(name))return reportReview(transport,actor,body);
 if(name==='queue'||name==='audit'){if(!shape(body,['action','cursor'])||!cursor(body.cursor))reject(422,'invalid_request');}
 else if(name==='decide'){if(!shape(body,['action','decision','expectedRevision','id','operationId','reason'])||!uuid(body.id)||!uuid(body.operationId)||typeof body.expectedRevision!=='number'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>999999999999999||!decisions.includes(String(body.decision))||!reasons.includes(String(body.reason)))reject(422,'invalid_request');}
 else reject(422,'invalid_request');
 if(!transport.configured())reject(503,'operators_unavailable');const response=await transport.request('/rest/v1/rpc/feture_post_review_command',{method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,body:JSON.stringify({p_actor:actor.accountHash,p_generation:actor.accountGeneration,p_command:{...body,action:name}})}).catch(e=>{if(e?.detail==='photo_review_required')reject(409,'review_required');throw e;});const r=await response.json();
 if(!response.ok||!object(r))reject(503,'operators_unavailable');if(r.ok!==true){if(r.error==='forbidden')reject(403,'forbidden');if(r.error==='resource_not_found')reject(404,'resource_not_found');if(['revision_conflict','operation_conflict','review_required'].includes(String(r.error)))reject(409,String(r.error));if(['invalid_request','invalid_cursor'].includes(String(r.error)))reject(422,String(r.error));reject(503,'operators_unavailable');}
 if(name==='decide'){if(!object(r.post)||!shape(r.post,['id','state','revision'])||r.post.id!==body.id||!['draft','pending','published','rejected','hidden','deleted'].includes(String(r.post.state))||typeof r.post.revision!=='number'||!Number.isSafeInteger(r.post.revision)||r.post.revision<1||typeof r.replayed!=='boolean')reject(503,'operators_unavailable');return {ok:true,post:r.post,replayed:r.replayed};}
 if(!Array.isArray(r.items)||r.items.length>20||!cursor(r.nextCursor))reject(503,'operators_unavailable');
 for(const v of r.items){if(!object(v)||!uuid(v.id)||typeof v.revision!=='number'||!Number.isSafeInteger(v.revision)||v.revision<1)reject(503,'operators_unavailable');
 if(name==='queue'){if(!shape(v,['id','text','authorLabel','kind','audience','state','revision','submittedAt'])||typeof v.text!=='string'||v.text.length>3000||typeof v.authorLabel!=='string'||v.authorLabel.length>80||!['text','story','question'].includes(String(v.kind))||!['pending','published','hidden'].includes(String(v.state))||!['public','granted'].includes(String(v.audience))||!date(v.submittedAt))reject(503,'operators_unavailable');}
 else if(!shape(v,['id','postId','action','reason','revision','at'])||!uuid(v.postId)||!decisions.includes(String(v.action))||!reasons.includes(String(v.reason))||!date(v.at))reject(503,'operators_unavailable');}
 return {ok:true,items:r.items,nextCursor:r.nextCursor};
}
module.exports={postReview};
