// @ts-check
'use strict';
const {reject,DomainError}=require('./errors');
const {requireOwner}=require('./permissions');
const KEYS=['terms','privacy','community','adult-content','complaints','age','retention','cookies','copyright'];
/** @param {unknown} value @returns {value is Record<string,unknown>} */
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
/** @param {unknown} input @returns {import('./documents').DocumentBlock[]} */
function blocks(input) {
 if(!Array.isArray(input)||input.length<1||input.length>80||Buffer.byteLength(JSON.stringify(input))>65536)reject(422,'invalid_document');
 return /** @type {unknown[]} */(input).map(item=>{
  if(!object(item))reject(422,'invalid_document');const b=/** @type {Record<string,unknown>} */(item);
  if(b.type==='list'){
   if(Object.keys(b).sort().join(',')!=='items,type'||!Array.isArray(b.items)||b.items.length<1||b.items.length>30||!b.items.every(i=>typeof i==='string'&&i.length>0&&i.length<=1200))reject(422,'invalid_document');
   return {type:'list',items:/** @type {string[]} */(b.items)};
  }
  if(!['heading','paragraph'].includes(String(b.type))||typeof b.type!=='string'||Object.keys(b).sort().join(',')!=='text,type'||typeof b.text!=='string'||!b.text.length||b.text.length>4000)reject(422,'invalid_document');
  return {type:/** @type {'heading'|'paragraph'} */(b.type),text:/** @type {string} */(b.text)};
 });
}
/** @param {unknown} value @returns {value is string} */
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
/** @param {unknown} input @returns {import('./documents').DocumentDTO} */
function documentDTO(input) {
 if(!object(input))reject(503,'documents_unavailable');const r=/** @type {Record<string,unknown>} */(input);
 if(!uuid(r.id)||typeof r.document_key!=='string'||!KEYS.includes(r.document_key)||r.locale!=='ru'&&r.locale!=='en'||typeof r.version!=='number'||!Number.isInteger(r.version)||r.version<1||typeof r.title!=='string'||!r.title.length||r.title.length>160||typeof r.content_hash!=='string'||!/^[a-f0-9]{64}$/.test(r.content_hash)||typeof r.requires_accept!=='boolean'||typeof r.published_at!=='string'||!Number.isFinite(Date.parse(r.published_at))||typeof r.effective_at!=='string'||!Number.isFinite(Date.parse(r.effective_at)))reject(503,'documents_unavailable');
 let content;try{content=blocks(r.blocks);}catch{return reject(503,'documents_unavailable');}
 return {id:/** @type {string} */(r.id),key:/** @type {import('./documents').DocumentKey} */(r.document_key),locale:/** @type {'ru'|'en'} */(r.locale),version:/** @type {number} */(r.version),title:/** @type {string} */(r.title),blocks:content,hash:/** @type {string} */(r.content_hash),requiresAccept:/** @type {boolean} */(r.requires_accept),publishedAt:/** @type {string} */(r.published_at),effectiveAt:/** @type {string} */(r.effective_at)};
}
/** @param {import('./contracts').Transport} transport */
function createDocumentsRepository(transport) {
 /** @param {string} name @param {Record<string,unknown>} body */
 async function rpc(name,body) {
  if(!transport.configured())reject(503,'documents_unavailable');
  try {const response=await transport.request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),timeoutMs:8000});const result=await response.json();
   if(!object(result))reject(503,'documents_unavailable');
   if(result.ok!==true){if(result.error==='document_changed'||result.error==='revision_conflict')reject(409,String(result.error));if(result.error==='invalid_request'||result.error==='review_required')reject(422,String(result.error));reject(503,'documents_unavailable');}
   return /** @type {Record<string,unknown>} */(result);
  }catch(error){if(error instanceof DomainError)throw error;return reject(503,'documents_unavailable');}
 }
 /** @param {import('./contracts').Actor} actor @param {'ru'|'en'} locale @returns {Promise<import('./documents').ConsentStatus>} */
 async function status(actor,locale) {
  requireOwner(actor,actor.accountHash);const data=await rpc('feture_consent_status',{p_owner:actor.accountHash,p_locale:locale});
  if(typeof data.ready!=='boolean'||typeof data.accepted!=='boolean'||!Array.isArray(data.documents)||data.documents.length>9)reject(503,'documents_unavailable');
  const documents=/** @type {unknown[]} */(data.documents).map(value=>{
   if(!object(value)||!uuid(value.id)||typeof value.key!=='string'||!KEYS.includes(value.key)||value.locale!==locale||typeof value.version!=='number'||!Number.isInteger(value.version)||value.version<1||typeof value.title!=='string'||value.title.length>160||typeof value.hash!=='string'||!/^[a-f0-9]{64}$/.test(value.hash)||typeof value.requiresAccept!=='boolean'||typeof value.accepted!=='boolean'||typeof value.effectiveAt!=='string'||!Number.isFinite(Date.parse(value.effectiveAt)))reject(503,'documents_unavailable');
   return /** @type {import('./documents').DocumentSummary} */({id:value.id,key:value.key,locale:value.locale,version:value.version,title:value.title,hash:value.hash,requiresAccept:value.requiresAccept,effectiveAt:value.effectiveAt,accepted:value.accepted});
  });
  return {ready:/** @type {boolean} */(data.ready),accepted:/** @type {boolean} */(data.accepted),documents};
 }
 return {rpc,status,
  /** @param {import('./contracts').Actor} actor @param {'ru'|'en'} locale @param {string[]} ids */
  async accept(actor,locale,ids) {
   requireOwner(actor,actor.accountHash);if(!ids.length||ids.length>9||new Set(ids).size!==ids.length||!ids.every(uuid))reject(422,'invalid_request');
   await rpc('feture_consent_accept',{p_owner:actor.accountHash,p_locale:locale,p_documents:ids});return status(actor,locale);
  },
  /** RU is the initial canonical legal release. Other translations cannot silently
   * satisfy a newer required RU policy; policy locale is never client-selected.
   * @param {import('./contracts').Actor} actor */
  async requireCurrent(actor) {const ru=await status(actor,'ru');if(!ru.ready||!ru.accepted)reject(403,'consent_required');}
 };
}
module.exports={KEYS,blocks,uuid,documentDTO,createDocumentsRepository};
