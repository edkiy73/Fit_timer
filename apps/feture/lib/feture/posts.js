// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {reportCommand,createPostReportsRepository}=require('./post-reports');
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
 if(c.action==='posts.report'||c.action==='posts.reports')return reportCommand(c);
 if((c.action==='posts.feed'||c.action==='posts.mine')&&shape(c,['action','cursor'])&&cursor(c.cursor))return /** @type {import('./posts').PostCommand} */(c);
 if(c.action==='posts.read'&&shape(c,['action','id'])&&uuid(c.id))return /** @type {import('./posts').PostCommand} */(c);
 if(!uuid(c.id)||!uuid(c.operationId)||typeof c.expectedRevision!=='number'||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0||c.expectedRevision>999999999999999)reject(422,'invalid_request');
 if((c.action==='posts.delete'||c.action==='posts.submit')&&shape(c,['action','id','operationId','expectedRevision']))return /** @type {import('./posts').PostCommand} */(c);
 if(c.action==='posts.save'&&shape(c,['action','id','operationId','expectedRevision','text','kind','authorLabel'])&&typeof c.text==='string'&&c.text.length<=3000&&!/[\x00-\x09\x0b-\x1f\x7f]/.test(c.text)&&['text','story','question'].includes(String(c.kind))&&typeof c.authorLabel==='string'&&c.authorLabel.length<=80&&!/[\x00-\x1f\x7f]/.test(c.authorLabel))return /** @type {import('./posts').PostCommand} */(c);
 return reject(422,'invalid_request');}
/** @param {import('./contracts').Command} c @returns {c is import('./posts').PostCommand} */
const isPostCommand=c=>c.action.startsWith('posts.');
/** @param {unknown} v @returns {import('./posts').PostEntry} */
function dto(v){if(!object(v)||!shape(v,['id','text','kind','authorLabel','audience','state','revision','createdAt','updatedAt','publishedAt','mine'])||!uuid(v.id)||typeof v.text!=='string'||v.text.length>3000||typeof v.authorLabel!=='string'||v.authorLabel.length>80||!['text','story','question'].includes(String(v.kind))||!['private','public'].includes(String(v.audience))||!['draft','pending','published','rejected','hidden','deleted'].includes(String(v.state))||typeof v.revision!=='number'||!Number.isSafeInteger(v.revision)||v.revision<1||!date(v.createdAt)||!date(v.updatedAt)||v.publishedAt!==null&&!date(v.publishedAt)||typeof v.mine!=='boolean')reject(503,'domain_unavailable');
 if(v.mine===false&&(v.state!=='published'||v.audience!=='public'||v.publishedAt===null))reject(503,'domain_unavailable');
 if(v.state==='deleted'&&(v.text!==''||v.authorLabel!==''||v.audience!=='private'||v.publishedAt!==null))reject(503,'domain_unavailable');
 return /** @type {import('./posts').PostEntry} */(v);}
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents */
function createPostsRepository(transport,documents){const guard=createAccessGuard(documents),reports=createPostReportsRepository(transport,documents);
 return {/** @param {import('./contracts').Actor} actor @param {import('./posts').PostCommand} input */
 async execute(actor,input){requireOwner(actor,actor.accountHash);const c=postCommand(input);
  if(c.action==='posts.report'||c.action==='posts.reports')return reports.execute(actor,c);
  if(!['posts.mine','posts.delete','posts.read'].includes(c.action))await guard(actor);
  if(!transport.configured())reject(503,'domain_unavailable');
  try{const response=await transport.request('/rest/v1/rpc/feture_post_command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_actor:actor.accountHash,p_command:c}),timeoutMs:8000});const r=await response.json();
   if(!response.ok||!object(r))reject(503,'domain_unavailable');
   if(r.ok!==true){if(r.error==='resource_not_found')reject(404,'resource_not_found');if(['revision_conflict','operation_conflict'].includes(String(r.error)))reject(409,String(r.error));if(r.error==='rate_limited')reject(429,'rate_limited');if(r.error==='invalid_request'||r.error==='invalid_cursor')reject(422,String(r.error));reject(503,'domain_unavailable');}
   if(c.action==='posts.mine'||c.action==='posts.feed'){if(!Array.isArray(r.items)||r.items.length>20||!cursor(r.nextCursor))reject(503,'domain_unavailable');const items=r.items.map(dto);if(c.action==='posts.mine'&&items.some(x=>!x.mine)||c.action==='posts.feed'&&items.some(x=>x.state!=='published'||x.audience!=='public'))reject(503,'domain_unavailable');return {items,nextCursor:r.nextCursor};}
   const entry=dto(r.entry);if(entry.id!==c.id||c.action!=='posts.read'&&!entry.mine)reject(503,'domain_unavailable');
   if(c.action==='posts.read')return {entry};if(typeof r.replayed!=='boolean')reject(503,'domain_unavailable');return {entry,replayed:r.replayed};
  }catch(e){if(e instanceof DomainError)throw e;return reject(503,'domain_unavailable');}
 }};}
module.exports={postCommand,isPostCommand,createPostsRepository};
