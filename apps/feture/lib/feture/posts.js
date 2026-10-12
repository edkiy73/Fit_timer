// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {reportCommand,createPostReportsRepository}=require('./post-reports');
const {createPostBookmarksRepository}=require('./post-bookmarks');
const {reactionCommand,createReactionsRepository}=require('./post-reactions');
const {commentCommand,createCommentsRepository}=require('./post-comments');
const {uuid}=require('./documents');
const {requireOwner}=require('./permissions');
const {createAccessGuard}=require('./access-guard');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} keys */
const shape=(v,keys)=>Object.keys(v).sort().join(',')===keys.sort().join(',');
/** @param {unknown} v */
const date=v=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
/** @param {unknown} v */
const cursor=v=>v===null||object(v)&&shape(v,['at','id'])&&date(v.at)&&uuid(v.id);
/** @param {unknown} input @returns {import('./posts').PostCommand} */
function postCommand(input){if(!object(input))reject(422,'invalid_request');const c=/** @type {Record<string,unknown>} */(input);
 if(c.action==='posts.testPreview'&&shape(c,['action','attemptId'])&&uuid(c.attemptId))return /** @type {import('./posts').PostCommand} */(c);
 if(c.action==='posts.fromTest'&&shape(c,['action','attemptId','authorLabel','consent','expectedAttemptRevision','id','operationId','plannedAudience','projectionHash','recipientCodes','selected','versionId'])&&uuid(c.attemptId)&&uuid(c.versionId)&&uuid(c.id)&&uuid(c.operationId)&&Number.isSafeInteger(c.expectedAttemptRevision)&&Number(c.expectedAttemptRevision)>0&&Number(c.expectedAttemptRevision)<=999999999999999&&c.consent===true&&typeof c.projectionHash==='string'&&/^[a-f0-9]{64}$/.test(c.projectionHash)&&Array.isArray(c.selected)&&c.selected.length>=1&&c.selected.length<=4&&c.selected.every(v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(v))&&new Set(c.selected).size===c.selected.length&&typeof c.authorLabel==='string'&&c.authorLabel.trim().length>0&&c.authorLabel.length<=80&&!/[\x00-\x1f\x7f]/.test(c.authorLabel)&&['public','granted'].includes(String(c.plannedAudience))&&Array.isArray(c.recipientCodes)&&c.recipientCodes.length<=20&&c.recipientCodes.every(uuid)&&new Set(c.recipientCodes).size===c.recipientCodes.length&&(c.plannedAudience==='granted'?c.recipientCodes.length>0:c.recipientCodes.length===0))return /** @type {import('./posts').PostCommand} */(c);
 if(c.action==='posts.address'&&shape(c,['action']))return c;
 if(c.action==='posts.rotateAddress'&&shape(c,['action','operationId'])&&uuid(c.operationId))return /** @type {import('./posts').PostCommand} */(c);
 if(c.action==='posts.report'||c.action==='posts.reports')return reportCommand(c);
 if(c.action==='posts.reactionSet'||c.action==='posts.reactionState')return reactionCommand(c);
 if(typeof c.action==='string'&&c.action.startsWith('comments.'))return commentCommand(c);
 if(c.action==='posts.bookmarks'&&shape(c,['action','cursor'])&&cursor(c.cursor))return /** @type {import('./posts').PostCommand} */(c);
 if((c.action==='posts.bookmarkSave'||c.action==='posts.bookmarkRemove')&&shape(c,['action','id','operationId'])&&uuid(c.id)&&uuid(c.operationId))return /** @type {import('./posts').PostCommand} */(c);
 if((c.action==='posts.feed'||c.action==='posts.mine')&&shape(c,['action','cursor'])&&cursor(c.cursor))return /** @type {import('./posts').PostCommand} */(c);
 if(c.action==='posts.read'&&shape(c,['action','id'])&&uuid(c.id))return /** @type {import('./posts').PostCommand} */(c);
 if(!uuid(c.id)||!uuid(c.operationId)||typeof c.expectedRevision!=='number'||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0||c.expectedRevision>999999999999999)reject(422,'invalid_request');
 if(c.action==='posts.revokeRecipient'&&shape(c,['action','id','operationId','expectedRevision','code'])&&uuid(c.code))return /** @type {import('./posts').PostCommand} */(c);
 if((c.action==='posts.delete'||c.action==='posts.submit')&&shape(c,['action','id','operationId','expectedRevision']))return /** @type {import('./posts').PostCommand} */(c);
 if(c.action==='posts.save'&&shape(c,['action','id','operationId','expectedRevision','text','kind','authorLabel','plannedAudience','recipientCodes'])&&['public','granted'].includes(String(c.plannedAudience))&&Array.isArray(c.recipientCodes)&&c.recipientCodes.length<=20&&c.recipientCodes.every(uuid)&&new Set(c.recipientCodes).size===c.recipientCodes.length&&(c.plannedAudience==='granted'||c.recipientCodes.length===0)&&typeof c.text==='string'&&c.text.length<=3000&&!/[\x00-\x09\x0b-\x1f\x7f]/.test(c.text)&&['text','story','question'].includes(String(c.kind))&&typeof c.authorLabel==='string'&&c.authorLabel.length<=80&&!/[\x00-\x1f\x7f]/.test(c.authorLabel))return /** @type {import('./posts').PostCommand} */(c);
 return reject(422,'invalid_request');}
/** @param {import('./contracts').Command} c @returns {c is import('./posts').PostCommand} */
const isPostCommand=c=>c.action.startsWith('posts.')||c.action.startsWith('comments.');
/** @param {unknown} v @returns {import('./posts').PostEntry} */
function dto(v){if(!object(v)||!shape(v,['id','text','kind','authorLabel','audience','state','revision','createdAt','updatedAt','publishedAt','mine','plannedAudience','recipientCodes'])||!['public','granted'].includes(String(v.plannedAudience))||!Array.isArray(v.recipientCodes)||v.recipientCodes.length>20||!v.recipientCodes.every(uuid)||new Set(v.recipientCodes).size!==v.recipientCodes.length||!uuid(v.id)||typeof v.text!=='string'||v.text.length>3000||typeof v.authorLabel!=='string'||v.authorLabel.length>80||!['text','story','question'].includes(String(v.kind))||!['private','public','granted'].includes(String(v.audience))||!['draft','pending','published','rejected','hidden','deleted'].includes(String(v.state))||typeof v.revision!=='number'||!Number.isSafeInteger(v.revision)||v.revision<1||!date(v.createdAt)||!date(v.updatedAt)||v.publishedAt!==null&&!date(v.publishedAt)||typeof v.mine!=='boolean')reject(503,'domain_unavailable');
 if(v.mine===false&&(v.state!=='published'||!['public','granted'].includes(String(v.audience))||v.publishedAt===null||v.recipientCodes.length!==0))reject(503,'domain_unavailable');
 if(v.state==='deleted'&&(v.text!==''||v.authorLabel!==''||v.audience!=='private'||v.publishedAt!==null))reject(503,'domain_unavailable');
 return /** @type {import('./posts').PostEntry} */(v);}
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents */
function createPostsRepository(transport,documents){const guard=createAccessGuard(documents),reports=createPostReportsRepository(transport,documents),bookmarks=createPostBookmarksRepository(transport,dto),reactions=createReactionsRepository(transport),comments=createCommentsRepository(transport);
 return {/** @param {import('./contracts').Actor} actor @param {import('./posts').PostCommand} input */
 async execute(actor,input){requireOwner(actor,actor.accountHash);const c=postCommand(input);
  if(c.action==='posts.report'||c.action==='posts.reports')return reports.execute(actor,c);
  if(c.action==='posts.reactionSet'||c.action==='posts.reactionState'){
   await guard(actor);return reactions.execute(actor,c);
  }
  if(c.action==='comments.page'||c.action==='comments.read'||c.action==='comments.create'||c.action==='comments.edit'||c.action==='comments.delete'){
   if(c.action!=='comments.delete')await guard(actor);
   return comments.execute(actor,c);
  }
  if(c.action==='posts.bookmarks'||c.action==='posts.bookmarkSave'||c.action==='posts.bookmarkRemove'){
   await guard(actor);return bookmarks.execute(actor,c);
  }
  if(!['posts.mine','posts.delete','posts.read','posts.address','posts.rotateAddress','posts.revokeRecipient'].includes(c.action))await guard(actor);
  if(!transport.configured())reject(503,'domain_unavailable');
  try{const response=await transport.request('/rest/v1/rpc/'+(['posts.testPreview','posts.fromTest'].includes(c.action)?'feture_test_share_command':['posts.address','posts.rotateAddress'].includes(c.action)?'feture_post_address_command':'feture_post_command'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_actor:actor.accountHash,p_command:c}),timeoutMs:8000});const r=await response.json();
   if(!response.ok||!object(r))reject(503,'domain_unavailable');
   if(r.ok!==true){if(['resource_not_found','recipient_unavailable'].includes(String(r.error)))reject(404,String(r.error));if(['revision_conflict','operation_conflict'].includes(String(r.error)))reject(409,String(r.error));if(r.error==='rate_limited')reject(429,'rate_limited');if(r.error==='invalid_request'||r.error==='invalid_cursor')reject(422,String(r.error));reject(503,'domain_unavailable');}
   if(c.action==='posts.testPreview'){
    const p=r.preview;if(!object(p)||!shape(r,['ok','preview'])||!shape(p,['attemptId','attemptRevision','versionId','projectionHash','items'])||p.attemptId!==c.attemptId||!uuid(p.versionId)||!Number.isSafeInteger(p.attemptRevision)||Number(p.attemptRevision)<1||typeof p.projectionHash!=='string'||!/^[a-f0-9]{64}$/.test(p.projectionHash)||!Array.isArray(p.items)||p.items.length>4||p.items.some(x=>!object(x)||!shape(x,['id','title','summary'])||typeof x.id!=='string'||!/^[a-z][a-z0-9-]{0,47}$/.test(x.id)||typeof x.title!=='string'||!x.title.trim()||x.title.length>120||typeof x.summary!=='string'||!x.summary.trim()||x.summary.length>300)||new Set(p.items.map(x=>x.id)).size!==p.items.length)reject(503,'domain_unavailable');return {preview:p};
   }
   if(c.action==='posts.address'||c.action==='posts.rotateAddress'){if(!shape(r,['ok','code','replayed'])||!uuid(r.code)||typeof r.replayed!=='boolean')reject(503,'domain_unavailable');return {code:r.code,replayed:r.replayed};}
   if(c.action==='posts.mine'||c.action==='posts.feed'){if(!Array.isArray(r.items)||r.items.length>20||!cursor(r.nextCursor))reject(503,'domain_unavailable');const items=r.items.map(dto);if(c.action==='posts.mine'&&items.some(x=>!x.mine)||c.action==='posts.feed'&&items.some(x=>x.state!=='published'||!['public','granted'].includes(x.audience)))reject(503,'domain_unavailable');return {items,nextCursor:r.nextCursor};}
   const entry=dto(r.entry);if(entry.id!==c.id||c.action!=='posts.read'&&!entry.mine)reject(503,'domain_unavailable');
   if(c.action==='posts.read')return {entry};if(typeof r.replayed!=='boolean')reject(503,'domain_unavailable');if(c.action==='posts.delete')await require('./post-photos').cleanupPhotoObjects(transport);return {entry,replayed:r.replayed};
  }catch(e){if(e instanceof DomainError)throw e;return reject(503,'domain_unavailable');}
 }};}
module.exports={postDto:dto,postCommand,isPostCommand,createPostsRepository};
