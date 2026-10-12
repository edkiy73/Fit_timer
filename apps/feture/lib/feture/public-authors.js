// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} fields */
const shape=(v,fields)=>Object.keys(v).sort().join(',')===fields.sort().join(',');
/** @param {unknown} input @returns {import('./public-authors').AuthorCommand} */
function authorCommand(input){
 if(!obj(input))reject(422,'invalid_request');
 if(input.action==='authors.status'&&shape(input,['action']))return {action:'authors.status'};
 if(input.action==='authors.resolve'&&shape(input,['action','postId'])&&uuid(input.postId))
  return /** @type {import('./public-authors').AuthorCommand} */(input);
 if(input.action==='authors.enable'&&shape(input,['action','consent','operationId'])&&input.consent===true&&uuid(input.operationId))
  return /** @type {import('./public-authors').AuthorCommand} */(input);
 if((input.action==='authors.disable'||input.action==='authors.rotate')&&shape(input,['action','operationId'])&&uuid(input.operationId))
  return /** @type {import('./public-authors').AuthorCommand} */(input);
 return reject(422,'invalid_request');
}
/** @param {import('./contracts').Transport} transport */
function createPublicAuthorsRepository(transport){
 return {
  /** @param {import('./contracts').Actor} actor @param {import('./public-authors').AuthorCommand} input */
  async execute(actor,input){
   const cmd=authorCommand(input);
   if(!transport.configured())reject(503,'domain_unavailable');
   try{
    const resolving=cmd.action==='authors.resolve';
    const response=await transport.request(resolving?'/rest/v1/rpc/feture_public_author_resolve':'/rest/v1/rpc/feture_public_author_command',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify(resolving?{p_actor:actor.accountHash,p_post_id:cmd.postId}:{p_actor:actor.accountHash,p_command:cmd}),timeoutMs:8000
    });
    const data=await response.json();
    if(!response.ok||!obj(data))reject(503,'domain_unavailable');
    if(data.ok!==true){
     if(data.error==='resource_not_found')reject(404,'resource_not_found');
     if(data.error==='operation_conflict')reject(409,'operation_conflict');
     if(data.error==='invalid_request')reject(422,'invalid_request');
     reject(503,'domain_unavailable');
    }
    if(resolving){
     if(!shape(data,['ok','publicAuthorId'])||(data.publicAuthorId!==null&&!uuid(data.publicAuthorId)))reject(503,'domain_unavailable');
     return {publicAuthorId:data.publicAuthorId};
    }
    if(!shape(data,['ok','enabled','publicAuthorId','replayed'])||
      typeof data.enabled!=='boolean'||typeof data.replayed!=='boolean'||
      (data.enabled?!uuid(data.publicAuthorId):data.publicAuthorId!==null))
     reject(503,'domain_unavailable');
    return {enabled:data.enabled,publicAuthorId:data.publicAuthorId,replayed:data.replayed};
   }catch(e){if(e instanceof DomainError)throw e;return reject(503,'domain_unavailable');}
  }
 };
}
module.exports={authorCommand,createPublicAuthorsRepository};
