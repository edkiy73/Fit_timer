// @ts-check
'use strict';
const {reject}=require('./errors');
const {requireOwner}=require('./permissions');
const {uuid}=require('./documents');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} keys */
const shape=(v,keys)=>Object.keys(v).sort().join(',')===keys.sort().join(',');
/** @param {unknown} v */
const date=v=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
/** @param {unknown} v */
const cursor=v=>v===null||object(v)&&shape(v,['at','id'])&&date(v.at)&&uuid(v.id);
const reasons=['reviewed','policy','privacy','nonconsent','minor','illegal','spam','other'];
/** @param {import('./contracts').Transport} transport @param {import('./contracts').Actor} actor @param {Record<string,unknown>} input */
async function commentReview(transport,actor,input){
 requireOwner(actor,actor.accountHash);
 if(!actor.accountGeneration)reject(403,'forbidden');
 const action=input.action;
 if(typeof action!=='string'||!action.startsWith('feture.comments.'))reject(422,'invalid_request');
 const name=action.slice('feture.comments.'.length);
 if(name==='queue'||name==='audit'){
  if(!shape(input,['action','cursor'])||!cursor(input.cursor))reject(422,'invalid_request');
 }else if(name==='decide'){
  if(!shape(input,['action','decision','expectedRevision','id','operationId','reason'])||
    !uuid(input.id)||!uuid(input.operationId)||!Number.isSafeInteger(input.expectedRevision)||
    Number(input.expectedRevision)<1||Number(input.expectedRevision)>999999999999999||
    !['approve','hide','reopen'].includes(String(input.decision))||
    !reasons.includes(String(input.reason))||
    (input.decision==='hide' ? input.reason==='reviewed' : input.reason!=='reviewed'))
   reject(422,'invalid_request');
 }else reject(422,'invalid_request');
 if(!transport.configured())reject(503,'operators_unavailable');
 const response=await transport.request('/rest/v1/rpc/feture_post_comment_review_command',{
  method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,
  body:JSON.stringify({p_actor:actor.accountHash,p_generation:actor.accountGeneration,p_command:{...input,action:name}})
 });
 const reply=await response.json();
 if(!response.ok||!object(reply))reject(503,'operators_unavailable');
 if(reply.ok!==true){
  if(reply.error==='forbidden')reject(403,'forbidden');
  if(reply.error==='resource_not_found')reject(404,'resource_not_found');
  if(['revision_conflict','operation_conflict','review_required'].includes(String(reply.error)))reject(409,String(reply.error));
  if(['invalid_request','invalid_cursor'].includes(String(reply.error)))reject(422,String(reply.error));
  reject(503,'operators_unavailable');
 }
 if(name==='decide'){
  const v=reply.entry;
  if(!shape(reply,['ok','entry','replayed'])||!object(v)||!shape(v,['id','state','revision'])||
   v.id!==input.id||!['pending','published','hidden'].includes(String(v.state))||
   !Number.isSafeInteger(v.revision)||Number(v.revision)<1||typeof reply.replayed!=='boolean')
   reject(503,'operators_unavailable');
  return {ok:true,entry:{id:v.id,state:v.state,revision:v.revision},replayed:reply.replayed};
 }
 if(!shape(reply,['ok','items','nextCursor'])||!Array.isArray(reply.items)||
   reply.items.length>20||!cursor(reply.nextCursor))reject(503,'operators_unavailable');
 if(name==='queue'){
  for(const v of reply.items){
   if(!object(v)||!shape(v,['at','id','postId','parentId','text','state','revision'])||
     !uuid(v.id)||!uuid(v.postId)||v.parentId!==null&&!uuid(v.parentId)||
     typeof v.text!=='string'||v.text.length>1200||!['pending','published','hidden'].includes(String(v.state))||
     !Number.isSafeInteger(v.revision)||Number(v.revision)<1||!date(v.at))
     reject(503,'operators_unavailable');
  }
 }else{
  for(const v of reply.items){
   if(!object(v)||!shape(v,['at','commentId','decision','id','reason','revision'])||
      !uuid(v.id)||!uuid(v.commentId)||!['approve','hide','reopen'].includes(String(v.decision))||
      !reasons.includes(String(v.reason))||!Number.isSafeInteger(v.revision)||Number(v.revision)<1||!date(v.at))
     reject(503,'operators_unavailable');
  }
 }
 return {ok:true,items:reply.items,nextCursor:reply.nextCursor};
}
module.exports={commentReview};
