// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {unknown} input */
function reactionCommand(input){
 if(!record(input))reject(422,'invalid_request');
 const keys=Object.keys(input).sort().join(',');
 if(input.action==='posts.reactionState'&&keys==='action,id'&&uuid(input.id))return /** @type {import('./post-reactions').ReactionCommand} */(input);
 if(input.action==='posts.reactionSet'&&keys==='action,active,id,kind,operationId'&&
  uuid(input.id)&&uuid(input.operationId)&&input.kind==='like'&&typeof input.active==='boolean')
  return /** @type {import('./post-reactions').ReactionCommand} */(input);
 return reject(422,'invalid_request');
}
/** @param {import('./contracts').Transport} transport */
function createReactionsRepository(transport){
 return {
  /** @param {import('./contracts').Actor} actor @param {import('./post-reactions').ReactionCommand} input */
  async execute(actor,input){
   const command=reactionCommand(input);
   if(!transport.configured())reject(503,'domain_unavailable');
   try{
    const response=await transport.request('/rest/v1/rpc/feture_post_reaction_command',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({p_actor:actor.accountHash,p_command:command}),timeoutMs:8000
    });
    const raw=await response.json();
    if(!response.ok||!record(raw))reject(503,'domain_unavailable');
    if(raw.ok!==true){
     if(raw.error==='resource_not_found')reject(404,'resource_not_found');
     if(raw.error==='operation_conflict')reject(409,'operation_conflict');
     if(raw.error==='invalid_request')reject(422,'invalid_request');
     reject(503,'domain_unavailable');
    }
    const keys=Object.keys(raw).sort().join(',');
    const read=command.action==='posts.reactionState';
    if(keys!==(read?'liked,likes,ok':'liked,likes,ok,replayed')||
      typeof raw.liked!=='boolean'||typeof raw.likes!=='number'||!Number.isSafeInteger(raw.likes)||raw.likes<0||
      (!read&&typeof raw.replayed!=='boolean'))reject(503,'domain_unavailable');
    return read?{liked:raw.liked,likes:raw.likes}:{liked:raw.liked,likes:raw.likes,replayed:raw.replayed};
   }catch(e){if(e instanceof DomainError)throw e;return reject(503,'domain_unavailable');}
  }
 };
}
module.exports={reactionCommand,createReactionsRepository};
