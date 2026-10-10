// @ts-check
'use strict';
const {createHash}=require('node:crypto');
const {reject}=require('./errors');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9_.:-]{1,160}$/;
const fields=['eventId','attemptId','providerReference','issuer','environment','policyVersion','threshold','occurredAt','outcome','adult','identity'];
/** @typedef {import('./verification-engine').Policy} Policy */
/** @typedef {import('./verification-engine').ProviderEvent} ProviderEvent */
/** @typedef {import('./verification-engine').Attempt} Attempt */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
/** Policy is server-owned. No default issuer/lifetime may silently enable access.
 * @param {Policy} policy */
function checkPolicy(policy) {
 if(!object(policy)||typeof policy.issuer!=='string'||!ID.test(policy.issuer)||typeof policy.version!=='string'||!ID.test(policy.version)||!['sandbox','production'].includes(policy.environment)||policy.threshold!==18||!Number.isSafeInteger(policy.proofLifetimeMs)||policy.proofLifetimeMs<60000||policy.proofLifetimeMs>366*86400000)reject(503,'verification_unavailable');
}
/** Only the selected provider adapter may translate its signed raw event into this DTO.
 * Extra fields, including DOB/documents/account identifiers, are never retained.
 * @param {unknown} value @param {Policy} policy @param {number} now @returns {ProviderEvent} */
function normalizedEvent(value,policy,now) {
 if(!object(value)||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)))reject(422,'invalid_verification_event');
 if(typeof value.eventId!=='string'||!ID.test(value.eventId)||typeof value.attemptId!=='string'||!UUID.test(value.attemptId)||typeof value.providerReference!=='string'||!ID.test(value.providerReference)||value.issuer!==policy.issuer||value.environment!==policy.environment||value.policyVersion!==policy.version||value.threshold!==18||typeof value.occurredAt!=='number'||!Number.isSafeInteger(value.occurredAt)||value.occurredAt<now-300000||value.occurredAt>now+30000||typeof value.outcome!=='string'||!['approved','rejected','revoked'].includes(value.outcome)||typeof value.adult!=='boolean'||typeof value.identity!=='boolean')reject(422,'invalid_verification_event');
 if(value.outcome==='approved'&&!value.adult||value.outcome!=='approved'&&(value.adult||value.identity))reject(422,'invalid_verification_event');
 // Build a new object; do not retain a provider's mutable payload.
 return Object.freeze({eventId:value.eventId,attemptId:value.attemptId,providerReference:value.providerReference,issuer:policy.issuer,environment:policy.environment,policyVersion:policy.version,threshold:18,occurredAt:value.occurredAt,outcome:/** @type {ProviderEvent['outcome']} */(value.outcome),adult:value.adult,identity:value.identity});
}
/** Signature verification is provider-specific; this module invents no public signature format.
 * Parsed req.body is deliberately not accepted. Not mounted in public API.
 * @param {{provider:import('./verification-engine').Provider;store:import('./verification-engine').EventStore;policy:Policy;now?:()=>number}} deps */
function createVerificationIngestor({provider,store,policy,now=Date.now}) {
 checkPolicy(policy);const fixedPolicy=Object.freeze({...policy});
 /** @param {Buffer} rawBody @param {Readonly<Record<string,string>>} headers */
 return async function ingest(rawBody,headers) {
  if(!Buffer.isBuffer(rawBody)||rawBody.length===0||rawBody.length>65536)reject(413,'invalid_verification_body');
  let value;
  try {value=await provider.verify(Buffer.from(rawBody),Object.freeze({...headers}));}
  catch {return reject(401,'invalid_verification_signature');}
  const at=now();if(!Number.isSafeInteger(at)||at<0)reject(503,'verification_unavailable');
  const event=normalizedEvent(value,fixedPolicy,at);
  // Digest minimal normalized metadata, never raw provider/document/biometric content.
  const digest=createHash('sha256').update(JSON.stringify(event)).digest('hex');
  try {return await store.apply(event,digest,fixedPolicy,at);}
  catch {return reject(503,'verification_unavailable');}
 };
}
/** Pure transition to execute INSIDE an atomic attempt+event transaction. Caller must
 * validate stored account existence/current attempt and unique issuer/environment/eventId.
 * Never update proof from a redirect, client flag, expired attempt or late old event.
 * @param {Attempt} attempt @param {ProviderEvent} event @param {string} digest
 * @param {import('./verification-engine').Receipt|null} receipt @param {Policy} policy @param {number} now
 * @returns {import('./verification-engine').Transition} */
function transition(attempt,event,digest,receipt,policy,now) {
 checkPolicy(policy);
 normalizedEvent(event,policy,now);
 if(!/^[a-f0-9]{64}$/.test(digest)||attempt.id!==event.attemptId||attempt.providerReference!==event.providerReference||attempt.issuer!==policy.issuer||attempt.environment!==policy.environment||attempt.policyVersion!==policy.version||attempt.threshold!==18||!/^[a-f0-9]{32}$/.test(attempt.accountHash)||!Number.isSafeInteger(attempt.createdAt)||attempt.createdAt<0||!Number.isSafeInteger(attempt.expiresAt)||attempt.expiresAt<=attempt.createdAt||event.occurredAt<attempt.createdAt)reject(422,'invalid_verification_attempt');
 if(receipt) {
  if(receipt.digest!==digest)reject(409,'verification_event_conflict');
  return {attempt,receipt,replayed:true}; // No renewal or restoration from old receipt.
 }
 if(attempt.lastEventAt!==null&&event.occurredAt<=attempt.lastEventAt)reject(409,'stale_verification_event');
 if(event.outcome==='revoked') {
  if(attempt.state!=='verified')reject(409,'invalid_verification_transition');
  return {attempt:Object.freeze({...attempt,state:'revoked',proof:null,lastEventAt:event.occurredAt}),receipt:{digest},replayed:false};
 }
 if(attempt.state!=='pending'||now>=attempt.expiresAt||event.occurredAt>=attempt.expiresAt)reject(409,'invalid_verification_transition');
 const approved=event.outcome==='approved';
 const issuedAt=Math.min(now,event.occurredAt);
 return {attempt:Object.freeze({...attempt,state:approved?'verified':'rejected',lastEventAt:event.occurredAt,proof:approved?Object.freeze({adult:true,identity:event.identity,issuedAt,expiresAt:issuedAt+policy.proofLifetimeMs}):null}),receipt:{digest},replayed:false};
}
/** Fresh status from stored proof. Adult and identity are separate, policy/environment
 * changes invalidate old proof. This helper cannot mint an authenticated Actor.
 * @param {Attempt} attempt @param {Policy} policy @param {number} now @returns {import('./verification-engine').Status} */
function proofStatus(attempt,policy,now) {
 checkPolicy(policy);
 const denied=/** @param {import('./verification-engine').Status['state']} state */state=>({state,verifiedAdult:false,validUntil:null});
 if(!Number.isSafeInteger(now)||now<0)return denied('unverified');
 if(attempt.issuer!==policy.issuer||attempt.environment!==policy.environment||attempt.policyVersion!==policy.version||attempt.threshold!==policy.threshold)return denied('unverified');
 if(attempt.state==='verified') {
  const proof=attempt.proof;
  if(!proof||proof.adult!==true||!Number.isSafeInteger(proof.issuedAt)||!Number.isSafeInteger(proof.expiresAt)||proof.issuedAt<attempt.createdAt||proof.issuedAt>now||proof.expiresAt<=proof.issuedAt||proof.expiresAt>proof.issuedAt+policy.proofLifetimeMs)return denied('unverified');
  if(now>=proof.expiresAt)return denied('expired');
  return {state:'verified',verifiedAdult:true,validUntil:new Date(proof.expiresAt).toISOString()};
 }
 if(attempt.state==='pending')return denied(now>=attempt.expiresAt?'expired':'pending');
 return denied(attempt.state==='rejected'?'rejected':'unverified');
}
module.exports={createVerificationIngestor,transition,proofStatus};
