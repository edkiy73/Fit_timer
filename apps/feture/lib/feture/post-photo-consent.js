// @ts-check
'use strict';
const {reject}=require('./errors');
const {uuid}=require('./documents');
const {requireOwner}=require('./permissions');
const {createAccessGuard}=require('./access-guard');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
/** @param {Record<string,unknown>} v @param {string[]} keys */
const shape=(v,keys)=>Object.keys(v).sort().join(',')===keys.sort().join(',');
/** @param {unknown} v */
const revision=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<999999999999999;
/** @param {unknown} input @returns {import('./post-photos').PhotoReviewCommand} */
function reviewCommand(input){if(!object(input)||!uuid(input.id))reject(422,'invalid_request');const c=/** @type {Record<string,unknown>} */(input);
 if(c.action==='photo.reviewStatus'&&shape(c,['action','id']))return /** @type {import('./post-photos').PhotoReviewCommand} */(c);
 if(!uuid(c.operationId)||!revision(c.expectedConsentRevision))reject(422,'invalid_request');
 if(c.action==='photo.reviewRevoke'&&shape(c,['action','id','operationId','expectedConsentRevision']))return /** @type {import('./post-photos').PhotoReviewCommand} */(c);
 if(c.action==='photo.reviewConsent'&&shape(c,['action','id','operationId','expectedConsentRevision','expectedRevision','consent','consentVersion'])&&c.consent===true&&c.consentVersion==='photo-staff-review-v1'&&revision(c.expectedRevision)&&Number(c.expectedRevision)>0)return /** @type {import('./post-photos').PhotoReviewCommand} */(c);
 return reject(422,'invalid_request');}
/** Owner-only metadata. No Storage reads, paths, content hashes or staff authorizations.
 * @param {import('./contracts').Transport} transport @param {import('./documents').DocumentsRepository} documents
 * @param {import('./contracts').Actor} actor @param {import('./post-photos').PhotoReviewCommand} input */
async function executeReviewConsent(transport,documents,actor,input){requireOwner(actor,actor.accountHash);const c=reviewCommand(input);
 if(c.action==='photo.reviewConsent')await createAccessGuard(documents)(actor);
 if(!transport.configured())reject(503,'domain_unavailable');
 const names={'photo.reviewStatus':'status','photo.reviewConsent':'consent','photo.reviewRevoke':'revoke'};
 let r;try{const response=await transport.request('/rest/v1/rpc/feture_photo_review_command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_actor:actor.accountHash,p_command:{...c,action:names[c.action]}}),timeoutMs:8000});r=await response.json();if(!response.ok)reject(503,'domain_unavailable');}catch{return reject(503,'domain_unavailable');}
 if(!object(r))reject(503,'domain_unavailable');
 if(r.ok!==true){if(r.error==='resource_not_found')reject(404,'resource_not_found');if(['revision_conflict','operation_conflict','review_required'].includes(String(r.error)))reject(409,String(r.error));if(r.error==='invalid_request')reject(422,'invalid_request');reject(503,'domain_unavailable');}
 const status=r.reviewConsent;
 if(!shape(r,c.action==='photo.reviewStatus'?['ok','reviewConsent']:['ok','reviewConsent','replayed'])||!object(status)||!shape(status,['postId','postRevision','revision','hasPhoto','active'])||status.postId!==c.id||!revision(status.postRevision)||Number(status.postRevision)<1||!revision(status.revision)||typeof status.hasPhoto!=='boolean'||typeof status.active!=='boolean'||status.active&&(!status.hasPhoto||Number(status.revision)<1)||c.action!=='photo.reviewStatus'&&typeof r.replayed!=='boolean')reject(503,'domain_unavailable');
 return {reviewConsent:status,...(c.action==='photo.reviewStatus'?{}:{replayed:r.replayed})};
}
module.exports={reviewCommand,executeReviewConsent};
