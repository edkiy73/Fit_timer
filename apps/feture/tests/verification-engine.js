'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac,timingSafeEqual}=require('node:crypto');
const {createVerificationIngestor,transition,proofStatus}=require('../lib/feture/verification-engine');
const time=Date.parse('2026-10-10T20:00:00Z');
const policy={issuer:'local-fixture',environment:'sandbox',version:'adult-1',threshold:18,proofLifetimeMs:86400000};
const attemptId='00000000-0000-4000-8000-000000000001';
const makeAttempt=(patch={})=>({id:attemptId,accountHash:'a'.repeat(32),providerReference:'reference-1',issuer:policy.issuer,environment:policy.environment,policyVersion:policy.version,threshold:18,createdAt:time-10000,expiresAt:time+60000,state:'pending',lastEventAt:null,proof:null,...patch});
const makeEvent=(patch={})=>({eventId:'event-1',attemptId,providerReference:'reference-1',issuer:policy.issuer,environment:policy.environment,policyVersion:policy.version,threshold:18,occurredAt:time,outcome:'approved',adult:true,identity:false,...patch});

// Deliberately TEST-ONLY HMAC protocol. No production adapter or public bypass.
function sandbox(attempt=makeAttempt()) {
 let current=attempt,clock=time,calls=0,deleted=false,currentAttempt=attempt.id,tail=Promise.resolve();
 const receipts=new Map(),key=Buffer.from('ephemeral-test-fixture-key');
 const sign=body=>createHmac('sha256',key).update(body).digest('hex');
 const provider={verify:async(raw,headers)=>{
  const signature=headers.signature;
  if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(raw),'hex')))throw Error('raw provider secret must not leak');
  return JSON.parse(raw.toString());
 }};
 const store={apply:(event,digest,fixedPolicy,now)=>{
  calls++;
  const work=tail.then(()=>{
   if(deleted||currentAttempt!==event.attemptId)throw Error('account deleted or attempt superseded');
   const eventKey=event.issuer+':'+event.environment+':'+event.eventId;
   const result=transition(current,event,digest,receipts.get(eventKey)||null,fixedPolicy,now);
   current=result.attempt;receipts.set(eventKey,result.receipt);return result;
  });tail=work.then(()=>{},()=>{});return work;
 }};
 const ingest=createVerificationIngestor({provider,store,policy,now:()=>clock});
 const send=event=>{const body=Buffer.from(JSON.stringify(event));return ingest(body,{signature:sign(body)});};
 return {send,ingest,sign,get current(){return current;},get calls(){return calls;},get receipts(){return receipts.size;},set clock(value){clock=value;},deleteAccount(){deleted=true;},supersede(){currentAttempt='new-attempt';}};
}
test('verification raw signatures, malformed/private events, issuer/environment and freshness fail before store',async()=>{
 const s=sandbox(),body=Buffer.from(JSON.stringify(makeEvent()));
 await assert.rejects(s.ingest(Buffer.from(body.toString().replace('approved','rejected')),{signature:s.sign(body)}),e=>e.status===401&&!e.message.includes('secret'));
 await assert.rejects(s.ingest(makeEvent(),{}),e=>e.status===413);
 await assert.rejects(s.ingest(Buffer.alloc(65537),{}),e=>e.status===413);
 for(const patch of [{issuer:'foreign'},{environment:'production'},{policyVersion:'new'},{threshold:21},{occurredAt:time-300001},{occurredAt:time+30001},{adult:false},{outcome:'redirect'},{accountHash:'b'.repeat(32)},{dateOfBirth:'2000-01-01'},{documents:[]},{identity:'true'},{attemptId:'not-uuid'}])await assert.rejects(s.send(makeEvent(patch)),e=>e.status===422);
 assert.equal(s.calls,0);assert.equal(s.receipts,0);assert.equal(s.current.proof,null);
});
test('sandbox atomic receipt handles simultaneous retries, conflict and replay after revocation without renewal',async()=>{
 const s=sandbox();const results=await Promise.all([s.send(makeEvent()),s.send(makeEvent())]);
 assert.equal(results.filter(r=>r.replayed).length,1);assert.equal(s.receipts,1);
 assert.deepEqual(proofStatus(s.current,policy,time),{state:'verified',verifiedAdult:true,validUntil:new Date(time+86400000).toISOString()});
 assert.equal(s.current.proof.identity,false); // Adult proof does not imply identity proof.
 const firstExpiry=s.current.proof.expiresAt;
 await assert.rejects(s.send(makeEvent({identity:true})),e=>e.status===503);assert.equal(s.current.proof.expiresAt,firstExpiry);
 s.clock=time+1000;
 await s.send(makeEvent({eventId:'revoke-1',occurredAt:time+1000,outcome:'revoked',adult:false,identity:false}));
 assert.equal(proofStatus(s.current,policy,time+1000).verifiedAdult,false);
 const replay=await s.send(makeEvent());assert.equal(replay.replayed,true);assert.equal(s.current.state,'revoked');assert.equal(s.current.proof,null);
 await assert.rejects(s.send(makeEvent({eventId:'new-approval',occurredAt:time+1001})),e=>e.status===503);
 assert.equal(s.current.proof,null);
});
test('wrong reference, expired/terminal/superseded attempts and deleted accounts cannot issue proof',async()=>{
 for(const patch of [{providerReference:'foreign-reference'},{id:'00000000-0000-4000-8000-000000000002'},{environment:'production'},{policyVersion:'old'},{expiresAt:time},{createdAt:time+1},{state:'rejected'}]) {
  const s=sandbox(makeAttempt(patch));await assert.rejects(s.send(makeEvent()),e=>e.status===503);assert.equal(s.receipts,0);assert.equal(s.current.proof,null);
 }
 for(const action of ['deleteAccount','supersede']) {
  const s=sandbox();s[action]();await assert.rejects(s.send(makeEvent()),e=>e.status===503);assert.equal(s.current.proof,null);
 }
 const s=sandbox();await s.send(makeEvent({outcome:'rejected',adult:false}));
 assert.equal(s.current.state,'rejected');assert.equal(s.current.proof,null);
 await assert.rejects(s.send(makeEvent({eventId:'late',occurredAt:time+1})),e=>e.status===503);
});
test('expiry, policy changes and invalid stored proofs fail closed; output has no private fields',async()=>{
 const s=sandbox();await s.send(makeEvent());
 assert.equal(proofStatus(s.current,policy,time+86400000).state,'expired');
 for(const patch of [{issuer:'new'},{version:'adult-2'},{environment:'production'},{proofLifetimeMs:60000}])assert.equal(proofStatus(s.current,{...policy,...patch},time).verifiedAdult,false);
 for(const now of [NaN,Infinity,-1])assert.equal(proofStatus(s.current,policy,now).verifiedAdult,false);
 for(const proof of [null,{...s.current.proof,adult:false},{...s.current.proof,issuedAt:time+1},{...s.current.proof,expiresAt:Infinity}])assert.equal(proofStatus({...s.current,proof},policy,time).verifiedAdult,false);
 assert.deepEqual(Object.keys(proofStatus(s.current,policy,time)).sort(),['state','verifiedAdult','validUntil'].sort());
});
test('server policy is required; old event cannot revoke newer proof',async()=>{
 for(const patch of [{issuer:undefined},{version:undefined},{proofLifetimeMs:0},{threshold:17}])assert.throws(()=>createVerificationIngestor({provider:{verify:async()=>null},store:{apply:async()=>null},policy:{...policy,...patch}}),e=>e.status===503);
 const s=sandbox();await s.send(makeEvent());
 await assert.rejects(s.send(makeEvent({eventId:'old-revoke',occurredAt:time-1,outcome:'revoked',adult:false,identity:false})),e=>e.status===503);
 assert.equal(proofStatus(s.current,policy,time).verifiedAdult,true);
 assert.equal(s.receipts,1);
});
