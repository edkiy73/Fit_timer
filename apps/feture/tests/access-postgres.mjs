import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const require=createRequire(import.meta.url);
const {authenticate}=require('../lib/feture/identity');
const {createAccessRepository,accessCommand}=require('../lib/feture/access');
test('ACL PostgreSQL: partial scopes, third account, expiry/revoke/block, replay, private filtering and production eligibility',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql','20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  const owners=['a','b','c'].map(c=>c.repeat(32));const [alice,bob,third]=owners;
  const profile={nickname:'Owner',about:'Visible only by grant',pronouns:'',identity:'Hidden',orientation:'Hidden orientation',relationships:'',city:'Hidden city'};
  for(let i=0;i<3;i++)await rpc('feture_profile_save',[owners[i],id(i+1),0,JSON.stringify(profile)]);
  const people=(await db.query('select account_hash,profile_id from public.feture_profile_details')).rows;
  const person=owner=>people.find(p=>p.account_hash===owner).profile_id;
  const request=(viewer,target,nonce,scopes=['profile:about','interest:interest-1-1'],message=true)=>rpc('feture_access_request',[viewer,person(target),id(nonce),scopes,message]);
  const decide=(nonce,scopes,message=false,days=7,owner=alice)=>rpc('feture_access_decide',[owner,id(nonce),'approve',scopes,message,days]);
  const project=viewer=>rpc('feture_profile_project',[viewer,person(alice)]);
  assert.equal((await request(bob,alice,20)).error,'resource_not_found');
  const documents=[];
  for(const key of ['terms','privacy','community','adult-content']){await rpc('feture_document_save',[key,'ru',0,key,JSON.stringify([{type:'paragraph',text:'Reviewed SQL fixture'}]),true]);documents.push((await rpc('feture_document_publish',[key,'ru',1,true,new Date().toISOString()])).document.id);}
  for(const owner of owners)await rpc('feture_consent_accept',[owner,'ru',documents]);
  await db.exec("insert into public.feture_verification_policies values('fixture','production','v1',18,86400000,60000,90,true)");
  for(let i=0;i<3;i++)await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[id(10+i),owners[i]]);
  await assert.rejects(db.exec("insert into public.feture_verification_policies values('another','production','v2',18,86400000,60000,90,true)"),/unique constraint/);
  assert.equal((await rpc('feture_profile_disclosure',[alice,0,['nickname'],['about']])).ok,true);
  assert.equal((await rpc('feture_profile_disclosure',[alice,0,['identity'],[]])).error,'revision_conflict');
  assert.equal((await rpc('feture_profile_disclosure',[alice,1,['identity'],['identity']])).error,'invalid_request');
  const state=visibility=>JSON.stringify({stance:'curious',experience:'none',boundary:'none',boundaryNote:null,intensity:2,visibility,useForDiscovery:false});
  for(const [nonce,interest,visibility] of [[30,'interest-1-1','granted'],[31,'interest-1-2','private'],[32,'interest-1-3','public']])await rpc('feture_interest_mutate',[alice,id(nonce),interest,0,'set',state(visibility)]);
  await db.exec('set role service_role');
  assert.equal((await rpc('feture_access_list',[alice,'requests',null,30])).items.length,0);
  assert.deepEqual((await project(bob)).projection.fields,{nickname:'Owner'});
  assert.equal((await request(bob,alice,20)).ok,true);assert.equal((await request(bob,alice,20)).ok,true);
  const listed=await rpc('feture_access_list',[alice,'requests',null,1]);assert.equal(listed.items[0].peerId,person(bob));assert.equal(listed.items[0].direction,'incoming');assert.equal(JSON.stringify(listed).includes(bob),false);
  assert.equal((await rpc('feture_access_list',[third,'requests',null,30])).items.length,0);
  assert.equal((await request(bob,alice,20,['profile:city'])).error,'operation_conflict');
  assert.equal((await request(bob,alice,21)).error,'request_pending');
  assert.equal((await decide(20,['profile:about'],false,7,third)).error,'resource_not_found');
  assert.equal((await decide(20,['profile:orientation'])).error,'invalid_request');
  assert.equal((await decide(20,['profile:about'])).ok,true); // partial, no messaging, no topic
  assert.deepEqual((await project(bob)).projection.fields,{nickname:'Owner',about:profile.about});
  assert.equal((await rpc('feture_profile_project',[alice,person(alice)])).isOwner,true);
  assert.deepEqual((await rpc('feture_profile_project',[alice,person(alice)])).projection.fields,{nickname:'Owner'});
  assert.deepEqual((await rpc('feture_profile_preview',[alice,bob])).projection,(await project(bob)).projection);
  await rpc('feture_profile_disclosure',[alice,1,['nickname'],[]]);assert.deepEqual((await project(bob)).projection.fields,{nickname:'Owner'});
  await rpc('feture_profile_disclosure',[alice,2,['nickname'],['about']]);
  assert.equal((await project(bob)).projection.canMessage,false);
  assert.deepEqual((await project(bob)).projection.interests.map(i=>i.interestId),['interest-1-3']);
  assert.deepEqual((await project(third)).projection.fields,{nickname:'Owner'});
  assert.equal((await rpc('feture_access_close',[third,id(20),'revoke'])).error,'resource_not_found');
  assert.equal((await rpc('feture_access_close',[alice,id(20),'revoke'])).ok,true);
  await decide(20,['profile:about']);assert.deepEqual((await project(bob)).projection.fields,{nickname:'Owner'}); // retry cannot restore
  await request(bob,alice,22);assert.equal((await decide(22,['profile:about','interest:interest-1-1'],true)).ok,true);
  const firstPage=await rpc('feture_access_list',[alice,'requests',null,1]);assert.equal(firstPage.nextCursor,id(20));
  const nextPage=await rpc('feture_access_list',[alice,'requests',firstPage.nextCursor,1]);assert.equal(nextPage.items[0].id,id(22));assert.equal(nextPage.nextCursor,null);
  assert.equal((await project(bob)).projection.canMessage,true);
  assert.deepEqual((await project(bob)).projection.interests.map(i=>i.interestId),['interest-1-1','interest-1-3']);
  assert.equal((await rpc('feture_block_set',[bob,person(alice),true])).ok,true);
  assert.equal((await project(bob)).error,'resource_not_found');
  assert.equal((await rpc('feture_profile_preview',[alice,bob])).error,'resource_not_found');
  assert.equal((await request(bob,alice,23)).error,'resource_not_found');
  await rpc('feture_block_set',[bob,person(alice),false]);assert.deepEqual((await project(bob)).projection.fields,{nickname:'Owner'});assert.equal((await project(bob)).projection.canMessage,false);
  await request(bob,alice,24);await decide(24,['profile:about']);
  await db.exec('reset role');
  await db.query("update public.feture_scoped_grants set granted_at=granted_at-interval '8 days',expires_at=expires_at-interval '8 days' where owner_hash=$1 and viewer_hash=$2",[alice,bob]);
  assert.deepEqual((await project(bob)).projection.fields,{nickname:'Owner'});
  await db.query("update public.feture_verification_attempts set environment='production',proof_expires_at=clock_timestamp()-interval '1 second',proof_issued_at=clock_timestamp()-interval '30 seconds' where account_hash=$1",[bob]);
  assert.equal((await project(bob)).error,'resource_not_found');
  await db.exec("update public.feture_verification_policies set enabled=false");assert.equal((await project(third)).error,'resource_not_found');
  // Public HTTP actors still cannot be forged from a persisted fixture proof.
  const email='actor@example.com',token='actor-secret-token',sha=v=>createHash('sha256').update(v).digest('hex');
  const actor=await authenticate({headers:{'x-fit-email':email,'x-fit-device':'device','x-fit-token':token}},{configured:()=>true,get:async key=>key==='a:'+sha(email).slice(0,32)?JSON.stringify({email,syncDevices:{device:{h:sha(token),at:new Date().toISOString()}}}):null});
  let calls=0;const repo=createAccessRepository({configured:()=>true,request:async()=>{calls++;return new Response('{}');}},{requireCurrent:async()=>{},status:async()=>{},accept:async()=>{}},{configured:()=>true,get:async()=>null});
  await assert.rejects(repo.execute(actor,{action:'access.profile',targetId:person(alice)}),e=>e.code==='verification_required');
  await assert.rejects(repo.execute({...actor,verifiedAdult:true},{action:'access.list',kind:'requests',cursor:null}),e=>e.code==='auth_required');assert.equal(calls,0);
  assert.throws(()=>accessCommand({action:'access.request',targetId:person(alice),operationId:id(60),scopes:['profile:dob'],canMessage:false}));
  assert.throws(()=>accessCommand({action:'access.close',requestId:id(20),kind:'revoke',ownerHash:alice}));
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.feture_scoped_grants'),/permission denied/);await assert.rejects(project(bob),/permission denied/);await assert.rejects(db.query('select * from public.feture_blocks'),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
