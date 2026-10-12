// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
/** @param {unknown} x @returns {x is Record<string,unknown>} */
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
/** @param {Record<string,unknown>} x @param {string[]} keys */
const shape=(x,keys)=>Object.keys(x).sort().join(',')===keys.slice().sort().join(',');
/** @param {unknown} x */
const date=x=>typeof x==='string'&&x.length<=40&&/^\d{4}-\d\d-\d\dT/.test(x)&&Number.isFinite(Date.parse(x));
/** @param {unknown} x */
const cursor=x=>x===null||obj(x)&&shape(x,['at','id'])&&date(x.at)&&uuid(x.id);
/** @param {unknown} input @returns {import('./author-relationships').RelationshipCommand} */
function relationshipCommand(input){
 if(!obj(input)||!['follow','mute'].includes(String(input.kind)))reject(422,'invalid_request');
 if(input.action==='relationships.mine'&&shape(input,['action','kind','cursor'])&&cursor(input.cursor))
  return /** @type {import('./author-relationships').RelationshipCommand} */(input);
 if(input.action==='relationships.state'&&shape(input,['action','kind','postId','publicAuthorId'])&&uuid(input.postId)&&uuid(input.publicAuthorId))
  return /** @type {import('./author-relationships').RelationshipCommand} */(input);
 if(input.action==='relationships.set'&&shape(input,['action','active','kind','operationId','postId','publicAuthorId'])&&
  uuid(input.operationId)&&uuid(input.publicAuthorId)&&typeof input.active==='boolean'&&
  (input.active?uuid(input.postId):input.postId===null))
  return /** @type {import('./author-relationships').RelationshipCommand} */(input);
 return reject(422,'invalid_request');
}
/** @param {import('./contracts').Transport} transport */
function createAuthorRelationshipsRepository(transport){
 return {
  /** @param {import('./contracts').Actor} actor @param {import('./author-relationships').RelationshipCommand} input */
  async execute(actor,input){
   const cmd=relationshipCommand(input);
   if(!transport.configured())reject(503,'domain_unavailable');
   try{
    const response=await transport.request('/rest/v1/rpc/feture_author_relationship_command',{
     method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,
     body:JSON.stringify({p_actor:actor.accountHash,p_command:cmd})
    });
    const data=await response.json();
    if(!response.ok||!obj(data))reject(503,'domain_unavailable');
    if(data.ok!==true){
     if(data.error==='resource_not_found')reject(404,'resource_not_found');
     if(data.error==='operation_conflict')reject(409,'operation_conflict');
     if(data.error==='rate_limited')reject(429,'rate_limited');
     if(data.error==='invalid_request'||data.error==='invalid_cursor')reject(422,String(data.error));
     reject(503,'domain_unavailable');
    }
    if(cmd.action==='relationships.mine'){
     if(!shape(data,['ok','items','nextCursor'])||!Array.isArray(data.items)||data.items.length>20||!cursor(data.nextCursor))reject(503,'domain_unavailable');
     for(const item of data.items){
      if(!obj(item)||!shape(item,['id','at'])||!uuid(item.id)||!date(item.at))reject(503,'domain_unavailable');
     }
     return {items:data.items,nextCursor:data.nextCursor};
    }
    if(cmd.action==='relationships.state'){
     if(!shape(data,['ok','active'])||typeof data.active!=='boolean')reject(503,'domain_unavailable');
     return {active:data.active};
    }
    if(!shape(data,['ok','active','replayed'])||typeof data.active!=='boolean'||typeof data.replayed!=='boolean')reject(503,'domain_unavailable');
    return {active:data.active,replayed:data.replayed};
   }catch(e){if(e instanceof DomainError)throw e;return reject(503,'domain_unavailable');}
  }
 };
}
module.exports={relationshipCommand,createAuthorRelationshipsRepository};
