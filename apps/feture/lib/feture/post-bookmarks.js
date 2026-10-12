// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {unknown} v @param {string[]} keys */
const shape=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
/** @param {unknown} v */
const date=v=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
/** @param {unknown} v */
const cursor=v=>v===null||shape(v,['at','id'])&&date(v.at)&&uuid(v.id);
/** @param {import('./contracts').Transport} transport @param {(value:unknown)=>import('./posts').PostEntry} postDto */
function createPostBookmarksRepository(transport,postDto){
 return {
  /** @param {import('./contracts').Actor} actor @param {import('./posts').PostBookmarkCommand} command */
  async execute(actor,command){
   if(!transport.configured())reject(503,'domain_unavailable');
   try{
    const response=await transport.request('/rest/v1/rpc/feture_post_bookmark_command',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({p_actor:actor.accountHash,p_command:command}),timeoutMs:8000
    });
    const r=await response.json();
    if(!response.ok||!object(r))reject(503,'domain_unavailable');
    if(r.ok!==true){
     if(r.error==='resource_not_found')reject(404,'resource_not_found');
     if(r.error==='operation_conflict')reject(409,'operation_conflict');
     if(r.error==='invalid_request'||r.error==='invalid_cursor')reject(422,String(r.error));
     reject(503,'domain_unavailable');
    }
    if(command.action==='posts.bookmarks'){
     if(!shape(r,['ok','items','nextCursor'])||!Array.isArray(r.items)||r.items.length>20||!cursor(r.nextCursor))reject(503,'domain_unavailable');
     const items=r.items.map(postDto);
     if(items.some(p=>p.state!=='published'||!['public','granted'].includes(p.audience)||p.publishedAt===null))reject(503,'domain_unavailable');
     return {items,nextCursor:r.nextCursor};
    }
    if(!shape(r,['ok','saved','replayed'])||typeof r.saved!=='boolean'||typeof r.replayed!=='boolean')reject(503,'domain_unavailable');
    return {saved:r.saved,replayed:r.replayed};
   }catch(e){if(e instanceof DomainError)throw e;return reject(503,'domain_unavailable');}
  }
 };
}
module.exports={createPostBookmarksRepository};
