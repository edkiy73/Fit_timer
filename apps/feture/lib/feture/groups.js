// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {uuid}=require('./documents');
const {createAccessGuard}=require('./access-guard');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} keys */
const shape=(v,keys)=>Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
/** @param {unknown} v */
const date=v=>typeof v==='string'&&v.length<=45&&Number.isFinite(Date.parse(v))&&/^\d{4}-\d\d-\d\dT/.test(v);
/** @param {unknown} v */
const cursor=v=>v===null||obj(v)&&shape(v,['at','id'])&&date(v.at)&&uuid(v.id);
/** @param {unknown} input @returns {import('./groups').GroupCommand} */
function groupCommand(input){
 if(!obj(input))reject(422,'invalid_request');
 if(input.action==='groups.catalog'&&shape(input,['action','cursor'])&&cursor(input.cursor))
  return /** @type {import('./groups').GroupCommand} */(input);
 if(input.action==='groups.preview'&&shape(input,['action','id'])&&uuid(input.id))
  return /** @type {import('./groups').GroupCommand} */(input);
 return reject(422,'invalid_request');
}
/** @param {unknown} data @returns {import('./groups').GroupPreview} */
function groupDto(data){
 if(!obj(data)||!shape(data,['id','slug','title','summary','rules','visibility','publishedAt'])||
  !uuid(data.id)||typeof data.slug!=='string'||data.slug.length>64||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.slug)||
  typeof data.title!=='string'||data.title.length>100||data.title.trim().length<2||
  typeof data.summary!=='string'||data.summary.length>500||
  typeof data.rules!=='string'||data.rules.length>2000||
  !['public','closed'].includes(String(data.visibility))||!date(data.publishedAt))
  reject(503,'domain_unavailable');
 return /** @type {import('./groups').GroupPreview} */(data);
}
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository|null} documents */
function createGroupsRepository(transport,documents){
 const guard=createAccessGuard(documents);
 return {
  /** @param {import('./contracts').Actor} actor @param {import('./groups').GroupCommand} request */
  async execute(actor,request){
   const cmd=groupCommand(request);await guard(actor);
   if(!transport.configured())reject(503,'domain_unavailable');
   try{
    const response=await transport.request('/rest/v1/rpc/feture_group_catalog_command',{
     method:'POST',headers:{'Content-Type':'application/json'},timeoutMs:8000,
     body:JSON.stringify({p_actor:actor.accountHash,p_command:cmd})
    });
    const body=await response.json();
    if(!response.ok||!obj(body))reject(503,'domain_unavailable');
    if(body.ok!==true){
     if(body.error==='resource_not_found')reject(404,'resource_not_found');
     if(body.error==='invalid_request'||body.error==='invalid_cursor')reject(422,String(body.error));
     reject(503,'domain_unavailable');
    }
    if(cmd.action==='groups.preview'){
     if(!shape(body,['ok','entry']))reject(503,'domain_unavailable');
     return {entry:groupDto(body.entry)};
    }
    if(!shape(body,['ok','items','nextCursor'])||!Array.isArray(body.items)||body.items.length>20||!cursor(body.nextCursor))
     reject(503,'domain_unavailable');
    return {items:body.items.map(groupDto),nextCursor:body.nextCursor};
   }catch(error){if(error instanceof DomainError)throw error;return reject(503,'domain_unavailable');}
  }
 };
}
const isGroupsCommand=/** @param {import('./contracts').Command} command */(command)=>command.action.startsWith('groups.');
module.exports={groupCommand,groupDto,isGroupsCommand,createGroupsRepository};
