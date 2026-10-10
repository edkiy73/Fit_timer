import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {authenticate}=require('../lib/feture/identity');
const {createVerificationStore}=require('../lib/feture/verification-store');
const {createVerificationIngestor}=require('../lib/feture/verification-engine');
const sha=v=>createHash('sha256').update(v).digest('hex');
const policy={issuer:'fixture',environment:'sandbox',version:'adult-1',threshold:18,proofLifetimeMs:86400000};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('verification PostgreSQL contract: reserve/bind, atomic global receipts, revocation, expiry, deletion and locked client roles',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010225100_feture_verification_store.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const identities=['alice','bob'].map(name=>({email:name+'@example.com',device:name,token:name+'-secret',hash:sha(name+'@example.com').slice(0,32)}));
  const accounts=new Map(identities.map(i=>['a:'+i.hash,JSON.stringify({email:i.email,syncDevices:{[i.device]:{h:sha(i.token),at:new Date().toISOString()}}})]));
  const accountStore={configured:()=>true,get:async key=>accounts.get(key)||null};
  const actors=await Promise.all(identities.map(i=>authenticate({headers:{'x-fit-email':i.email,'x-fit-device':i.device,'x-fit-token':i.token}},accountStore)));
  const rpc=async(name,params)=>(await db.query(`select public.${name}(${params.map((_,i)=>'$'+(i+1)).join(',')}) result`,params)).rows[0].result;
  const transport={configured:()=>true,request:async(path,options)=>{
   const body=options?.body?JSON.parse(options.body):null;let data;
   if(path.includes('/rpc/'))data=await rpc(path.split('/rpc/')[1],Object.values(body).map(v=>typeof v==='object'?JSON.stringify(v):v));
   else {
    const filters=new URLSearchParams(path.split('?')[1]);
    data=(await db.query('select * from public.feture_verification_attempts where id=$1::uuid',[filters.get('id').slice(3)])).rows;
   }
   return new Response(JSON.stringify(data));
  }};
  const store=createVerificationStore({transport,accountStore});
  assert.equal((await store.status(actors[0],policy)).state,'unavailable');
  await assert.rejects(store.reserve(actors[0],id(1),policy));
  await db.query('insert into public.feture_verification_policies(issuer,environment,version,threshold,proof_lifetime_ms,attempt_lifetime_ms,retention_days,enabled) values($1,$2,$3,18,86400000,60000,90,true)',[policy.issuer,policy.environment,policy.version]);
  const first=await store.reserve(actors[0],id(1),policy);assert.equal(first.replayed,false);
  const repeat=await store.reserve(actors[0],id(1),policy);assert.equal(repeat.expiresAt,first.expiresAt);assert.equal(repeat.replayed,true);
  await assert.rejects(store.reserve(actors[1],id(1),policy));
  await store.bind(actors[0],id(1),'reference-1');await store.bind(actors[0],id(1),'reference-1');
  await assert.rejects(store.bind(actors[0],id(1),'changed-reference'));await assert.rejects(store.bind(actors[1],id(1),'reference-1'));
  const event={eventId:'global-event-1',attemptId:id(1),providerReference:'reference-1',issuer:policy.issuer,environment:policy.environment,policyVersion:policy.version,threshold:18,occurredAt:Date.now()+10,outcome:'approved',adult:true,identity:false};
  const ingest=createVerificationIngestor({provider:{verify:async raw=>JSON.parse(raw.toString())},store,policy});
  const send=e=>ingest(Buffer.from(JSON.stringify(e)),{});
  const deliveries=await Promise.all([send(event),send(event)]);assert.equal(deliveries.filter(r=>r.replayed).length,1);
  assert.equal((await db.query('select count(*)::int n from public.feture_verification_events')).rows[0].n,1);
  const status=await store.status(actors[0],policy);assert.equal(status.verifiedAdult,true);assert.deepEqual(Object.keys(status).sort(),['state','validUntil','verifiedAdult']);
  assert.equal((await store.status(actors[1],policy)).verifiedAdult,false);
  const until=deliveries[0].attempt.proof.expiresAt;assert.equal(deliveries[0].attempt.proof.identity,false);
  await assert.rejects(send({...event,identity:true}));assert.equal((await send(event)).attempt.proof.expiresAt,until);
  await assert.rejects(store.reserve(actors[0],id(3),policy)); // no accidental loss of current valid proof
  const revoked={...event,eventId:'revoke-1',outcome:'revoked',adult:false,identity:false,occurredAt:event.occurredAt+1};
  await send(revoked);assert.equal((await store.status(actors[0],policy)).verifiedAdult,false);
  assert.equal((await send(event)).attempt.proof,null); // retry old approval never restores proof
  await assert.rejects(send({...event,eventId:'another-approval',occurredAt:revoked.occurredAt+1}));
  await store.reserve(actors[0],id(3),policy);await store.bind(actors[0],id(3),'reference-3');
  await assert.rejects(send(event)); // superseded attempt cannot issue new proof
  await store.reserve(actors[1],id(2),policy);await store.bind(actors[1],id(2),'reference-2');
  await assert.rejects(send({...event,attemptId:id(2),providerReference:'reference-2',occurredAt:Date.now()+10})); // globally reused event id across owners
  const second={...event,eventId:'event-2',attemptId:id(2),providerReference:'reference-2',occurredAt:Date.now()+10};
  await send(second);
  await db.exec("update public.feture_verification_policies set enabled=false");assert.equal((await store.status(actors[1],policy)).state,'unavailable');
  await db.exec("update public.feture_verification_policies set enabled=true");
  await db.query("update public.feture_verification_attempts set created_at=created_at-interval '2 days',expires_at=expires_at-interval '2 days',proof_issued_at=proof_issued_at-interval '2 days',proof_expires_at=proof_expires_at-interval '2 days' where id=$1",[id(2)]);
  assert.equal((await store.status(actors[1],policy)).state,'expired');
  // Private/raw fields do not enter state, including direct RPC calls with a privileged fixture.
  assert.equal((await rpc('feture_verification_apply',[JSON.stringify({...second,documents:['private']}),sha('invalid')])).error,'invalid_request');
  await assert.rejects(db.query("update public.feture_verification_attempts set state='verified',proof_issued_at=created_at,proof_expires_at=null where id=$1",[id(3)]),/check constraint/);
  for(const role of ['anon','authenticated']) {
   await db.exec('set role '+role);await assert.rejects(db.query('select * from public.feture_verification_attempts'),/permission denied/);
   await assert.rejects(rpc('feture_verification_apply',[JSON.stringify(event),sha('event')]),/permission denied/);await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await assert.rejects(db.exec("insert into public.feture_verification_policies values('illegal','production','v',18,60000,60000,90,true)"),/permission denied/);
  await assert.rejects(rpc('feture_verification_purge',[]),/permission denied/);await db.exec('reset role');
  accounts.delete('a:'+identities[1].hash);await assert.rejects(send({...second,eventId:'deleted-core',outcome:'revoked',adult:false,occurredAt:Date.now()+10}));
  await db.query('delete from public.feture_profiles where account_hash=$1',[identities[1].hash]);
  assert.equal((await db.query('select count(*)::int n from public.feture_verification_attempts where account_hash=$1',[identities[1].hash])).rows[0].n,0);
  await assert.rejects(send(second));
  await db.query("update public.feture_verification_attempts set created_at=created_at-interval '100 days',expires_at=expires_at-interval '100 days',last_event_at=last_event_at-interval '100 days' where account_hash=$1",[identities[0].hash]);
  assert.equal(await rpc('feture_verification_purge',[]),2);
  assert.equal((await db.query('select count(*)::int n from public.feture_verification_events')).rows[0].n,0);
  await assert.rejects(store.status({accountHash:identities[0].hash,verifiedAdult:true},policy),e=>e.status===401);
 } finally {await db.close();}
});
