// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {createAccessGuard}=require('./access-guard');
const {requireOwner}=require('./permissions');
const {uuid}=require('./documents');
const {INTEREST_ID}=require('./interest-model');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} keys */
const exact=(v,keys)=>Object.keys(v).sort().join(',')===keys.sort().join(',');
/** @param {unknown} input @returns {import('./comparisons').ComparisonCommand} */
function comparisonCommand(input){
 if(!object(input))reject(422,'invalid_request');
 const v=/** @type {Record<string,unknown>} */(input);
 if(v.action==='share.compare.list'&&exact(v,['action']))return {action:'share.compare.list'};
 if(!uuid(v.comparisonId))reject(422,'invalid_request');
 if(['share.compare.read','share.compare.revoke'].includes(String(v.action))&&exact(v,['action','comparisonId']))return /** @type {import('./comparisons').ComparisonCommand} */(v);
 if(v.action==='share.compare.approve'&&exact(v,['action','comparisonId','expectedRevision','reviewed'])&&v.reviewed===true&&typeof v.expectedRevision==='number'&&Number.isSafeInteger(v.expectedRevision)&&v.expectedRevision>0&&v.expectedRevision<Number.MAX_SAFE_INTEGER)return /** @type {import('./comparisons').ComparisonCommand} */(v);
 if(v.action!=='share.compare.create'||!exact(v,['action','comparisonId','linkId','selected','reviewed'])||!uuid(v.linkId)||v.reviewed!==true||!Array.isArray(v.selected)||v.selected.length<1||v.selected.length>6)reject(422,'invalid_request');
 const ids=new Set();
 for(const row of v.selected){
  if(!object(row)||!exact(row,['interestId','expectedRevision'])||typeof row.interestId!=='string'||!INTEREST_ID.test(row.interestId)||ids.has(row.interestId)||typeof row.expectedRevision!=='number'||!Number.isSafeInteger(row.expectedRevision)||row.expectedRevision<1||row.expectedRevision>=Number.MAX_SAFE_INTEGER)reject(422,'invalid_request');
  ids.add(row.interestId);
 }
 return /** @type {import('./comparisons').ComparisonCommand} */(v);
}
/** @param {import('./shares').ShareCommand} c @returns {c is import('./comparisons').ComparisonCommand} */
const isComparisonCommand=c=>c.action.startsWith('share.compare.');
/** @param {unknown} input */
function metaDTO(input){
 if(!object(input)||!exact(input,['id','linkId','role','revision','state','expiresAt'])||!uuid(input.id)||!uuid(input.linkId)||!['owner','guest'].includes(String(input.role))||!['pending','active','revoked','unavailable'].includes(String(input.state))||typeof input.revision!=='number'||!Number.isSafeInteger(input.revision)||input.revision<1||typeof input.expiresAt!=='string'||!Number.isFinite(Date.parse(input.expiresAt)))reject(503,'domain_unavailable');
 return {...input};
}
const stances=['curious','fantasy','want_to_try','not_interested'];
/** @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents @returns {import('./comparisons').ComparisonRepository} */
function createComparisonRepository(transport,documents){
 const guard=createAccessGuard(documents);
 return {async execute(actor,input){
  requireOwner(actor,actor.accountHash);const c=comparisonCommand(input);
  if(c.action!=='share.compare.list'&&c.action!=='share.compare.revoke')await guard(actor);
  if(!transport.configured())reject(503,'domain_unavailable');
  let value;
  try{const response=await transport.request('/rest/v1/rpc/feture_comparison_command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_actor:actor.accountHash,p_command:c}),timeoutMs:8000});if(!response.ok)reject(503,'domain_unavailable');value=await response.json();}
  catch(e){if(e instanceof DomainError)throw e;reject(503,'domain_unavailable');}
  if(!object(value))reject(503,'domain_unavailable');
  if(value.ok!==true){const code=String(value.error);if(code==='resource_not_found')reject(404,code);if(['revision_conflict','operation_conflict'].includes(code))reject(409,code);if(code==='rate_limited')reject(429,code);if(code==='invalid_request')reject(422,code);reject(503,'domain_unavailable');}
  if(c.action==='share.compare.list'){if(!Array.isArray(value.items)||value.items.length>25)reject(503,'domain_unavailable');return {items:value.items.map(metaDTO)};}
  if(c.action==='share.compare.revoke'){if(value.revoked!==true)reject(503,'domain_unavailable');return {revoked:true};}
  const comparison=metaDTO(value.comparison);
  if(comparison.id!==c.comparisonId||c.action==='share.compare.create'&&comparison.linkId!==c.linkId)reject(503,'domain_unavailable');
  if(c.action==='share.compare.create')return {comparison};
  if(!Array.isArray(value.myItems)||value.myItems.length<1||value.myItems.length>6)reject(503,'domain_unavailable');
  const myItems=value.myItems.map(v=>{if(!object(v)||!exact(v,['title','stance'])||typeof v.title!=='string'||v.title.length<1||v.title.length>160||!stances.includes(String(v.stance)))reject(503,'domain_unavailable');return {title:v.title,stance:v.stance};});
  if(comparison.state==='pending'&&value.items!==null||comparison.state==='active'&&!Array.isArray(value.items)||!['pending','active'].includes(String(comparison.state)))reject(503,'domain_unavailable');
  const items=value.items===null?null:Array.isArray(value.items)&&value.items.length<=6?value.items.map(v=>{if(!object(v)||!exact(v,['title','mine','theirs'])||typeof v.title!=='string'||v.title.length<1||v.title.length>160||!stances.includes(String(v.mine))||!stances.includes(String(v.theirs)))reject(503,'domain_unavailable');return {title:v.title,mine:v.mine,theirs:v.theirs};}):reject(503,'domain_unavailable');
  return {comparison,myItems,items};
 }};
}
module.exports={comparisonCommand,isComparisonCommand,createComparisonRepository};
