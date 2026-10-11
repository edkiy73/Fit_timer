import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {moderationCommand,queueItem}=require('../lib/feture/moderation');
const {createModerationEngine}=require('../lib/feture/moderation-engine');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('moderation: own reports, no auto ban, selected permitted snapshot, manual CAS/replay, sanctions/appeal/restore and client isolation',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const f of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql','20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql','20261010233014_feture_moderation.sql','20261011071500_feture_moderation_decision_status.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
  const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  const [alice,bob,third]=['a','b','c'].map(c=>c.repeat(32));
  for(const owner of [alice,bob,third])await db.query('insert into public.feture_profiles(account_hash) values($1)',[owner]);
  await db.query('insert into public.feture_profile_details(account_hash,profile_id,data,revision,public_fields) values($1,$2,$3,1,$4)',[alice,id(1),JSON.stringify({nickname:'Name',about:'Public reported text',pronouns:'',identity:'Private identity',orientation:'',relationships:'',city:''}),['nickname','about']]);
  await db.query("insert into public.feture_verification_policies values('fixture','production','v1',18,86400000,60000,90,true)");
  const docs=[];for(const key of ['terms','privacy','community','adult-content']){await rpc('feture_document_save',[key,'ru',0,key,JSON.stringify([{type:'paragraph',text:'SQL fixture'}]),true]);docs.push((await rpc('feture_document_publish',[key,'ru',1,true,new Date().toISOString()])).document.id);}
  for(const [i,owner] of [alice,bob,third].entries()){await rpc('feture_consent_accept',[owner,'ru',docs]);await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[id(10+i),owner]);}
  const report=(actor,nonce,field='about',text='Please review')=>rpc('feture_report_create',[actor,id(nonce),id(1),'harassment',text,field,true]);
  const decide=(nonce,caseNonce,revision,action,reason='abuse')=>rpc('feture_moderation_decide',[id(nonce),id(caseNonce),revision,action,reason,7]);
  await db.exec('set role service_role');
  assert.equal((await report(bob,20)).ok,true);assert.equal((await report(bob,20)).ok,true);assert.equal((await report(bob,20,'identity')).error,'operation_conflict');
  assert.equal((await report(third,20)).error,'operation_conflict');
  assert.equal((await rpc('feture_peer_eligible',[alice])),true); // complaints never automatically ban
  await report(third,21,'identity');
  const queue=await rpc('feture_moderation_queue',['cases',null]);assert.equal(queue.items.length,2);
  const first=queue.items.find(v=>v.caseId===id(20));assert.deepEqual(first.snapshot,{field:'about',text:'Public reported text'});
  assert.deepEqual(queue.items.find(v=>v.caseId===id(21)).snapshot,{});assert.equal(JSON.stringify(queue.items).includes('Private identity'),false);
  assert.equal(JSON.stringify(queueItem({...first,email:'never expose',subject_hash:alice})).includes(alice),false);
  assert.equal((await rpc('feture_moderation_own',[bob,'reports',null])).items.length,1);
  assert.equal((await rpc('feture_moderation_own',[alice,'reports',null])).items.length,0);
  assert.equal((await rpc('feture_moderation_decision_status',[id(30),id(20)])).state,'unknown');
  assert.equal((await decide(30,20,9,'hide')).error,'revision_conflict');
  assert.equal((await decide(30,20,1,'hide')).ok,true);assert.equal((await rpc('feture_peer_eligible',[alice])),false);
  assert.equal((await decide(30,20,1,'hide')).ok,true);assert.equal((await decide(30,20,1,'suspend')).error,'operation_conflict');
  assert.deepEqual(await rpc('feture_moderation_decision_status',[id(30),id(20)]),{ok:true,state:'applied'});
  assert.equal((await rpc('feture_moderation_decision_status',[id(30),id(21)])).state,'unknown');
  assert.equal((await rpc('feture_moderation_decision_status',[id(101),id(20)])).state,'unknown');
  assert.equal((await rpc('feture_appeal_create',[third,id(40),id(20),'Appeal'])).error,'resource_not_found');
  assert.equal((await rpc('feture_appeal_create',[alice,id(40),id(20),'Please review again'])).ok,true);
  assert.equal((await rpc('feture_appeal_create',[alice,id(40),id(20),'Please review again'])).ok,true);
  assert.equal((await rpc('feture_appeal_create',[alice,id(41),id(20),'Another'])).error,'appeal_pending');
  assert.equal((await rpc('feture_moderation_queue',['appeals',null])).items[0].appealText,'Please review again');
  assert.equal((await decide(31,20,2,'restore','appeal')).ok,true);assert.equal((await rpc('feture_peer_eligible',[alice])),true);
  assert.equal((await rpc('feture_moderation_own',[alice,'appeals',null])).items[0].state,'resolved');
  assert.equal((await decide(32,21,1,'suspend')).ok,true);assert.equal((await decide(33,20,3,'restore','appeal')).error,'revision_conflict'); // cannot lift newer case
  await db.exec('reset role');
  await assert.rejects(db.exec("update public.feture_moderation_decisions set reason='policy'"),/immutable/);
  await assert.rejects(db.exec('delete from public.feture_moderation_decisions'),/immutable/);
  await db.exec('set role service_role');for(let nonce=50;nonce<59;nonce++)await report(bob,nonce,null);
  assert.equal((await report(bob,60,null)).error,'rate_limited');await db.exec('reset role');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.feture_reports'),/permission denied/);await assert.rejects(decide(99,20,3,'dismiss','insufficient'),/permission denied/);await assert.rejects(rpc('feture_moderation_queue',['cases',null]),/permission denied/);await assert.rejects(rpc('feture_moderation_decision_status',[id(30),id(20)]),/permission denied/);await db.exec('reset role');}
  assert.throws(()=>moderationCommand({action:'moderation.report',operationId:id(70),targetId:id(1),reason:'privacy',note:'',field:'about',snapshot:{text:'forged'}}));
  assert.deepEqual(await createModerationEngine({provider:null})({kind:'profile',text:'Text'}),{label:'manual_required',attempts:0});
  assert.deepEqual(await createModerationEngine({provider:{review:async()=>({label:'clear',identity:'private'})}})({kind:'profile',text:'Text'}),{label:'manual_required',attempts:2});
  assert.deepEqual(await createModerationEngine({provider:{review:async()=>new Promise(()=>{})},timeoutMs:10})({kind:'profile',text:'Text'}),{label:'manual_required',attempts:2});
 }finally{await db.close();}
});
