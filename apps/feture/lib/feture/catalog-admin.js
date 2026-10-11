// @ts-check
'use strict';
const {DomainError,reject}=require('./errors');
const {INTEREST_ID}=require('./interest-model');
/** @param {unknown} s @param {number} max */
const plain=(s,max)=>typeof s==='string'&&s.length>0&&s.length<=max&&s.trim()===s&&/\S/.test(s)&&!/[<>\x00-\x1f\x7f]/.test(s);
/** @param {unknown} entry @returns {{definition:string,synonyms:string[],relatedIds:string[]}} */
function validateEntry(entry){
 if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).sort().join(',')!=='definition,relatedIds,synonyms')reject(422,'invalid_request');
 const {definition,synonyms,relatedIds}=/** @type {Record<string,unknown>} */(entry);
 if(!plain(definition,400)||!Array.isArray(synonyms)||synonyms.length<1||synonyms.length>8||!synonyms.every(x=>plain(x,80))||new Set(synonyms).size!==synonyms.length
  ||!Array.isArray(relatedIds)||relatedIds.length>8||!relatedIds.every(id=>typeof id==='string'&&INTEREST_ID.test(id))||new Set(relatedIds).size!==relatedIds.length)reject(422,'invalid_request');
 return {definition:/** @type {string} */(definition),synonyms:/** @type {string[]} */(synonyms),relatedIds:/** @type {string[]} */(relatedIds)};
}
/** Core admin guard is the only entry point for this private editorial RPC.
 * @param {import('./contracts').Transport} transport */
function createCatalogAdmin(transport){
 /** @param {string} action @param {Record<string,unknown>} body @param {import('./contracts').Response} res */
 return async(action,body,res)=>{
  if(!['feture.catalog.list','feture.catalog.save','feture.catalog.status','feture.catalog.publish'].includes(action))return false;
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
   const allowed=action.endsWith('.list')||action.endsWith('.status')?['action']:action.endsWith('.publish')?['action','expectedVersion','reviewed','selected']:['action','interestId','expectedRevision','entry'];
   if(Object.keys(body).sort().join(',')!==allowed.sort().join(','))reject(422,'invalid_request');
   if(!transport.configured())reject(503,'domain_unavailable');
   let command;
   if(action.endsWith('.list'))command={action:'list'};
   else if(action.endsWith('.status'))command={action:'status'};
   else if(action.endsWith('.publish')){
    if(body.reviewed!==true||typeof body.expectedVersion!=='number'||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||body.expectedVersion>=1000000||!Array.isArray(body.selected)||body.selected.length<1||body.selected.length>144)reject(422,'invalid_request');
    const ids=new Set();
    for(const input of body.selected){
     if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='interestId,revision')reject(422,'invalid_request');
     const v=/** @type {Record<string,unknown>} */(input);
     if(typeof v.interestId!=='string'||!INTEREST_ID.test(v.interestId)||ids.has(v.interestId)||typeof v.revision!=='number'||!Number.isSafeInteger(v.revision)||v.revision<1||v.revision>=9007199254740991)reject(422,'invalid_request');
     ids.add(v.interestId);
    }
    command={action:'publish',expectedVersion:body.expectedVersion,reviewed:true,selected:body.selected};
   }else{
    if(typeof body.interestId!=='string'||!INTEREST_ID.test(body.interestId)||typeof body.expectedRevision!=='number'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)reject(422,'invalid_request');
    command={action:'save',interestId:body.interestId,expectedRevision:body.expectedRevision,entry:validateEntry(body.entry)};
   }
   const response=await transport.request(action.endsWith('.publish')||action.endsWith('.status')?'/rest/v1/rpc/feture_catalog_publish':'/rest/v1/rpc/feture_catalog_editorial_admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_command:command}),timeoutMs:8000});
   if(!response.ok)reject(503,'domain_unavailable');
   const data=await response.json();if(!data||typeof data!=='object')reject(503,'domain_unavailable');
   if(data.ok!==true){if(data.error==='revision_conflict')throw new DomainError(409,'revision_conflict');if(data.error==='invalid_request')reject(422,'invalid_request');reject(503,'domain_unavailable');}
   if(action.endsWith('.list')){
    if(!Array.isArray(data.drafts)||data.drafts.length>144)reject(503,'domain_unavailable');
    const drafts=/** @type {unknown[]} */(data.drafts).map(raw=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))reject(503,'domain_unavailable');const d=/** @type {Record<string,unknown>} */(raw);if(typeof d.interestId!=='string'||!INTEREST_ID.test(d.interestId)||typeof d.revision!=='number'||!Number.isSafeInteger(d.revision)||d.revision<1)reject(503,'domain_unavailable');return {interestId:d.interestId,revision:d.revision,entry:validateEntry(d.entry)};});
    res.statusCode=200;res.end(JSON.stringify({ok:true,drafts}));
   }else if(action.endsWith('.status')||action.endsWith('.publish')){
    if(typeof data.version!=='number'||!Number.isSafeInteger(data.version)||data.version<1)reject(503,'domain_unavailable');
    if(action.endsWith('.publish')&&(typeof data.published!=='number'||!Number.isSafeInteger(data.published)||data.published<1))reject(503,'domain_unavailable');
    res.statusCode=200;res.end(JSON.stringify({ok:true,version:data.version,...(action.endsWith('.publish')?{published:data.published}:{})}));
   }else{
    if(typeof data.revision!=='number'||!Number.isSafeInteger(data.revision)||data.revision<1)reject(503,'domain_unavailable');
    res.statusCode=200;res.end(JSON.stringify({ok:true,revision:data.revision}));
   }
  }catch(e){const safe=e instanceof DomainError?e:new DomainError(503,'domain_unavailable');res.statusCode=safe.status;res.end(JSON.stringify({error:safe.code}));}
  return true;
 };
}
module.exports={createCatalogAdmin,validateEntry};
