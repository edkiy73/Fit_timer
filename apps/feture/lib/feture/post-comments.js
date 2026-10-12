// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} keys */
const shape=(v,keys)=>Object.keys(v).sort().join(',')===keys.sort().join(',');
/** @param {unknown} v */
const date=v=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
/** @param {unknown} v */
const cursor=v=>v===null||obj(v)&&shape(v,['at','id'])&&date(v.at)&&uuid(v.id);
/** @param {unknown} v */
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=1200&&!/[\x00-\x08\x0b-\x1f\x7f]/.test(v);
/** @param {unknown} v */
const revision=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<1e15;
/** @param {unknown} input @returns {import('./post-comments').CommentCommand} */
function commentCommand(input){
 if(!obj(input))reject(422,'invalid_request');
 const c=input;
 if(c.action==='comments.page'&&shape(c,['action','postId','cursor'])&&uuid(c.postId)&&cursor(c.cursor))return /** @type {import('./post-comments').CommentCommand} */(c);
 if(c.action==='comments.read'&&shape(c,['action','id'])&&uuid(c.id))return /** @type {import('./post-comments').CommentCommand} */(c);
 if(c.action==='comments.create'&&shape(c,['action','id','postId','parentId','operationId','text'])&&uuid(c.id)&&uuid(c.postId)&&uuid(c.operationId)&&(c.parentId===null||uuid(c.parentId))&&text(c.text))return /** @type {import('./post-comments').CommentCommand} */(c);
 if(c.action==='comments.edit'&&shape(c,['action','id','operationId','expectedRevision','text'])&&uuid(c.id)&&uuid(c.operationId)&&revision(c.expectedRevision)&&text(c.text))return /** @type {import('./post-comments').CommentCommand} */(c);
 if(c.action==='comments.delete'&&shape(c,['action','id','operationId','expectedRevision'])&&uuid(c.id)&&uuid(c.operationId)&&revision(c.expectedRevision))return /** @type {import('./post-comments').CommentCommand} */(c);
 return reject(422,'invalid_request');
}
/** @param {unknown} value @returns {import('./post-comments').CommentEntry} */
function commentDto(value){
 if(!obj(value)||!shape(value,['id','postId','parentId','text','state','revision','mine','createdAt','updatedAt'])||
 !uuid(value.id)||!uuid(value.postId)||value.parentId!==null&&!uuid(value.parentId)||
 typeof value.text!=='string'||value.text.length>1200||
 !['pending','published','hidden','deleted'].includes(String(value.state))||
 !revision(value.revision)||typeof value.mine!=='boolean'||!date(value.createdAt)||!date(value.updatedAt)||
 value.state==='deleted'&&value.text!=='')reject(503,'domain_unavailable');
 if(!value.mine&&value.state!=='published')reject(503,'domain_unavailable');
 return /** @type {import('./post-comments').CommentEntry} */(value);
}
/** @param {import('./contracts').Transport} transport */
function createCommentsRepository(transport){
 return {
 /** @param {import('./contracts').Actor} actor @param {import('./post-comments').CommentCommand} input */
 async execute(actor,input){
  const command=commentCommand(input);
  if(!transport.configured())reject(503,'domain_unavailable');
  try{
   const response=await transport.request('/rest/v1/rpc/feture_post_comment_command',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_actor:actor.accountHash,p_command:command}),timeoutMs:8000
   });
   const data=await response.json();
   if(!response.ok||!obj(data))reject(503,'domain_unavailable');
   if(data.ok!==true){
    if(data.error==='resource_not_found')reject(404,'resource_not_found');
    if(data.error==='operation_conflict'||data.error==='revision_conflict')reject(409,String(data.error));
    if(data.error==='invalid_cursor'||data.error==='invalid_request')reject(422,String(data.error));
    if(data.error==='rate_limited')reject(429,'rate_limited');
    reject(503,'domain_unavailable');
   }
   if(command.action==='comments.page'){
    if(!shape(data,['ok','items','nextCursor'])||!Array.isArray(data.items)||data.items.length>20||!cursor(data.nextCursor))reject(503,'domain_unavailable');
    const items=data.items.map(commentDto);
    if(items.some(entry=>entry.state!=='published'||entry.postId!==command.postId))reject(503,'domain_unavailable');
    return {items,nextCursor:data.nextCursor};
   }
   if(command.action==='comments.read'){
    if(!shape(data,['ok','entry']))reject(503,'domain_unavailable');
    const entry=commentDto(data.entry);
    if(entry.id!==command.id)reject(503,'domain_unavailable');
    return {entry};
   }
   if(!shape(data,['ok','entry','replayed'])||typeof data.replayed!=='boolean')reject(503,'domain_unavailable');
   const entry=commentDto(data.entry);
   if(entry.id!==command.id||!entry.mine)reject(503,'domain_unavailable');
   return {entry,replayed:data.replayed};
  }catch(e){if(e instanceof DomainError)throw e;return reject(503,'domain_unavailable');}
 }
 };
}
module.exports={commentCommand,commentDto,createCommentsRepository};
