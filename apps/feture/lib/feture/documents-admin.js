// @ts-check
'use strict';
const {createDocumentsRepository,blocks,KEYS,documentDTO}=require('./documents');
const {DomainError,reject}=require('./errors');
/** Core invokes product handlers ONLY after admin secret, quota and store checks.
 * Never add an unauthenticated route that calls this handler directly.
 * @param {import('./contracts').Transport} transport */
function createDocumentsAdmin(transport) {
 const repo=createDocumentsRepository(transport);
 /** @param {string} action @param {Record<string,unknown>} body @param {import('./contracts').Response} res */
 return async function handle(action,body,res) {
  if(!['feture.documents.list','feture.documents.save','feture.documents.publish'].includes(action))return false;
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  try {
   const allowed=action.endsWith('.list')?['action','locale']:action.endsWith('.save')?['action','key','locale','expectedRevision','title','blocks','requiresAccept']:['action','key','locale','revision','reviewed','effectiveAt'];
   if(Object.keys(body).some(k=>!allowed.includes(k))||body.locale!=='ru'&&body.locale!=='en')reject(422,'invalid_request');
   let result;
   if(action.endsWith('.list')) {
    if(!transport.configured())reject(503,'documents_unavailable');
    const query=new URLSearchParams({select:'document_key,locale,title,blocks,requires_accept,revision,updated_at',locale:'eq.'+body.locale,order:'document_key.asc',limit:'9'});
    const response=await transport.request('/rest/v1/feture_document_drafts?'+query,{timeoutMs:8000});const rows=await response.json();
    if(!response.ok||!Array.isArray(rows)||rows.length>9)reject(503,'documents_unavailable');
    const drafts=/** @type {Record<string,unknown>[]} */(rows).map(r=>{
     if(!r||typeof r.document_key!=='string'||!KEYS.includes(/** @type {import('./documents').DocumentKey} */(r.document_key))||r.locale!==body.locale||typeof r.title!=='string'||r.title.length>160||typeof r.requires_accept!=='boolean'||typeof r.revision!=='number'||!Number.isSafeInteger(r.revision)||r.revision<1)reject(503,'documents_unavailable');
     return {key:r.document_key,locale:r.locale,title:r.title,blocks:blocks(r.blocks),requiresAccept:r.requires_accept,revision:r.revision};
    });
    result={ok:true,drafts};
   } else {
    if(typeof body.key!=='string'||!KEYS.includes(/** @type {import('./documents').DocumentKey} */(body.key)))reject(422,'invalid_request');
    if(action.endsWith('.save')) {
     if(typeof body.expectedRevision!=='number'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||typeof body.title!=='string'||!body.title.trim()||body.title.length>160||typeof body.requiresAccept!=='boolean')reject(422,'invalid_request');
     result=await repo.rpc('feture_document_save',{p_key:body.key,p_locale:body.locale,p_expected:body.expectedRevision,p_title:body.title.trim(),p_blocks:blocks(body.blocks),p_required:body.requiresAccept});
    } else {
     if(typeof body.revision!=='number'||!Number.isSafeInteger(body.revision)||body.revision<1||body.reviewed!==true||typeof body.effectiveAt!=='string'||!Number.isFinite(Date.parse(body.effectiveAt)))reject(422,'review_required');
     const data=await repo.rpc('feture_document_publish',{p_key:body.key,p_locale:body.locale,p_revision:body.revision,p_reviewed:true,p_effective_at:body.effectiveAt});
     result={ok:true,document:documentDTO(data.document)};
    }
   }
   res.statusCode=200;res.end(JSON.stringify(result));
  } catch(error) {const safe=error instanceof DomainError?error:new DomainError(503,'documents_unavailable');res.statusCode=safe.status;res.end(JSON.stringify({error:safe.code}));}
  return true;
 };
}
module.exports={createDocumentsAdmin};
