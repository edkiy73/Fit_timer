// @ts-check
'use strict';
// M01: explicit post detail open, never implicit feed impressions.
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
const {requireOwner}=require('./permissions');
const {createAccessGuard}=require('./access-guard');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {unknown} v @returns {import('./post-views').PostViewCommand} */
function postViewCommand(v){
 if(!object(v)||v.action!=='posts.viewOpen'||Object.keys(v).sort().join(',')!=='action,id'||!uuid(v.id))
  reject(422,'invalid_request');
 return /** @type {import('./post-views').PostViewCommand} */(v);
}
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents */
function createPostViewsRepository(transport,documents){
 const guard=createAccessGuard(documents);
 return {
  /** @param {import('./contracts').Actor} actor @param {import('./post-views').PostViewCommand} input */
  async execute(actor,input){
   requireOwner(actor,actor.accountHash);
   const command=postViewCommand(input);
   await guard(actor);
   if(!transport.configured())reject(503,'domain_unavailable');
   try{
    const response=await transport.request('/rest/v1/rpc/feture_post_view_open',{
     method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,
     body:JSON.stringify({p_actor:actor.accountHash,p_id:command.id})
    });
    const r=await response.json();
    if(!response.ok||!object(r))reject(503,'domain_unavailable');
    if(r.ok!==true){
     if(r.error==='resource_not_found')reject(404,'resource_not_found');
     if(r.error==='invalid_request')reject(422,'invalid_request');
     reject(503,'domain_unavailable');
    }
    if(Object.keys(r).sort().join(',')!=='hidden,ok,uniqueDailyOpens'||
      typeof r.hidden!=='boolean'||
      (r.hidden?r.uniqueDailyOpens!==null:typeof r.uniqueDailyOpens!=='number'||
        !Number.isSafeInteger(r.uniqueDailyOpens)||r.uniqueDailyOpens<5))
      reject(503,'domain_unavailable');
    return {hidden:r.hidden,uniqueDailyOpens:r.uniqueDailyOpens};
   }catch(error){if(error instanceof DomainError)throw error;return reject(503,'domain_unavailable');}
  }
 };
}
module.exports={postViewCommand,createPostViewsRepository};
