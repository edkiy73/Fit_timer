import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
const alice='a'.repeat(32),bob='b'.repeat(32);
test('A04 QA: prelaunch-only, Core-admin-only grants expire/revoke, no bypass of consent',async()=>{
 const db=new PGlite();
 const sql=async(s,a=[])=>db.query(s,a).then(r=>r.rows);
 const admin=c=>sql('select public.feture_qa_adult_bound_admin($1,$2,$3::jsonb) result',['c'.repeat(32),'1'.repeat(64),JSON.stringify(c)]).then(r=>r[0].result);
 const until=o=>sql('select public.feture_qa_adult_until($1::text) t',[o]).then(r=>r[0].t);
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const filename of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql',
   '20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql',
   '20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql',
   '20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql',
   '20261010233014_feture_moderation.sql','20261011080915_feture_share_links.sql',
   '20261011083303_feture_qa_adult_access.sql',
   '20261011113717_feture_qa_any_account_audit.sql','20261011120139_feture_operator_roles.sql','20261011121629_feture_operator_account_binding.sql'])await db.exec(load(filename));
  await db.exec('set role service_role');
  const manager='c'.repeat(32),operator='d'.repeat(32),auditor='e'.repeat(32);
  const staff=(actor,cmd,bootstrap=false)=>sql('select public.feture_operator_bound_command($1,$2,$3,$4,$5::jsonb) result',[actor,'1'.repeat(64),'1'.repeat(64),bootstrap,JSON.stringify(cmd)]).then(x=>x[0].result);
  const decision=(actor,cmd)=>sql('select public.feture_qa_adult_bound_admin($1,$2,$3::jsonb) result',[actor,'1'.repeat(64),JSON.stringify(cmd)]).then(x=>x[0].result);
  assert.equal((await decision(manager,{action:'list'})).error,'forbidden');
  assert.equal((await staff(manager,{action:'bootstrap'})).error,'forbidden');
  assert.equal((await staff(manager,{action:'bootstrap'},true)).role,'manager');
  assert.equal((await staff(operator,{action:'bootstrap'},true)).error,'already_initialized');
  assert.equal((await staff(operator,{action:'set',accountHash:operator,role:'manager',expectedRevision:0})).error,'forbidden');
  assert.equal((await staff(manager,{action:'set',accountHash:manager,role:null,expectedRevision:1})).error,'last_manager');
  assert.equal((await staff(manager,{action:'set',accountHash:operator,role:'qa_operator',expectedRevision:0})).ok,true);
  assert.equal((await staff(manager,{action:'set',accountHash:auditor,role:'auditor',expectedRevision:0})).ok,true);
  const reviewed={action:'grant',accountHash:alice,days:1,reviewed:true};
  assert.equal((await decision(auditor,reviewed)).error,'forbidden');
  assert.equal((await decision(operator,reviewed)).ok,true);
  assert.equal((await decision(auditor,{action:'audit'})).items[0].actor_hash,operator);
  assert.deepEqual((await staff(auditor,{action:'status'})).items,[]);
  assert.equal((await staff(manager,{action:'set',accountHash:operator,role:null,expectedRevision:0})).error,'revision_conflict');
  assert.equal((await staff(manager,{action:'set',accountHash:operator,role:null,expectedRevision:1})).ok,true);
  assert.equal((await decision(operator,reviewed)).error,'forbidden');
  assert.equal((await decision(operator,{action:'audit'})).error,'forbidden');
  await assert.rejects(sql('select * from public.feture_operator_events'),/permission denied/);
  await assert.rejects(sql('select * from public.feture_qa_adult_events'),/permission denied/);
  await assert.rejects(sql('select public.feture_qa_adult_admin($1::jsonb)',[JSON.stringify(reviewed)]),/does not exist/);
  assert.equal((await sql('select public.feture_qa_adult_bound_admin($1,$2,$3::jsonb) result',[manager,'2'.repeat(64),JSON.stringify({action:'audit'})]))[0].result.error,'forbidden','recreated email must not recover old role');
  await assert.rejects(sql('select public.feture_qa_adult_admin($1,$2::jsonb)',[manager,JSON.stringify(reviewed)]),/permission denied/);
  // Clear fixture permission only as database owner; now test the complete consent flow.
  await db.exec('reset role;truncate public.feture_qa_adult_access,public.feture_qa_adult_events;set role service_role');
  const grant={action:'grant',accountHash:alice,days:1,reviewed:true};
  assert.equal((await until(alice)),null);
  assert.equal((await admin({...grant,reviewed:false})).error,'invalid_request');
  assert.equal((await admin({...grant,days:7})).error,'invalid_request');
  assert.equal((await admin({...grant,accountHash:'seed:feture-x:y'})).error,'invalid_request');
  assert.equal((await admin(grant)).ok,true);
  assert.equal((await admin({action:'lookup',accountHash:alice})).entry.accountHash,alice);
  assert.equal((await admin({action:'lookup',accountHash:'f'.repeat(32)})).entry,null);
  // Admin can approve any existing Core account; no global 12-person QA cap.
  for(let i=1;i<=14;i++)assert.equal((await admin({action:'grant',accountHash:i.toString(16).padStart(32,'0'),days:1,reviewed:true})).ok,true);
  assert.equal((await admin({action:'list'})).activeCount,15);
  assert.equal((await admin({action:'audit'})).items.filter(x=>x.event_type==='grant').length,15);

  assert.ok(Date.parse(await until(alice))>Date.now());
  assert.equal((await sql('select public.feture_peer_eligible($1) eligible',[alice]))[0].eligible,false,
   'QA access cannot skip current legal consent');
  // Publishing and accepting required legal releases remains an independent gate.
  const rpc=async(name,args)=>(await sql('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args))[0].value;
  const docs=[];
  for(const key of ['terms','privacy','community','adult-content']){
   await rpc('feture_document_save',[key,'ru',0,key,JSON.stringify([{type:'paragraph',text:'Fixture'}]),true]);
   const p=await rpc('feture_document_publish',[key,'ru',1,true,new Date().toISOString()]);
   docs.push(p.document.id);
  }
  await rpc('feture_consent_accept',[alice,'ru',docs]);
  assert.equal((await sql('select public.feture_peer_eligible($1) eligible',[alice]))[0].eligible,true);
  assert.equal((await admin({action:'grant',accountHash:bob,days:1,reviewed:true})).ok,true);
  assert.equal((await until(bob))!==null,true);
  // The cross-owner share RPC must see the same current QA and consent status.
  const linkId='00000000-0000-4000-8000-000000000120';
  await sql("insert into public.feture_interest_states(account_hash,interest_id,stance,experience,boundary,boundary_note,intensity,visibility,use_for_discovery,revision,source,test_version,deleted) values($1,'interest-1-1','curious','none','none',null,4,'private',false,1,'manual',null,false)",[alice]);
  const share=async(actor,command)=>(await sql('select public.feture_share_command($1,$2::jsonb) value',[actor,JSON.stringify(command)]))[0].value;
  const create={action:'share.create',linkId,reviewed:true,days:1,selected:[{interestId:'interest-1-1',expectedRevision:1}]};
  assert.equal((await share(alice,create)).ok,true);
  assert.equal((await share(bob,{action:'share.read',linkId})).error,'resource_not_found','no consent on viewer');
  await rpc('feture_consent_accept',[bob,'ru',docs]);
  const card=await share(bob,{action:'share.read',linkId});
  assert.equal(card.ok,true);
  assert.deepEqual(card.card.items,[{title:'Ведущая роль',stance:'curious'}]);
  assert.equal((await admin({action:'revoke',accountHash:bob})).revoked,true);
  assert.equal((await admin({action:'lookup',accountHash:bob})).entry.revoked,true);
  assert.equal((await admin({action:'revoke',accountHash:bob})).revoked,true);
  assert.equal((await admin({action:'audit'})).items.filter(x=>x.account_hash===bob&&x.event_type==='revoke').length,1,'repeat revoke must not add misleading audit events');
  assert.equal((await share(bob,{action:'share.read',linkId})).error,'resource_not_found','revoked viewer QA access');

  assert.equal(await until(bob),null);
  await sql("update public.feture_qa_adult_access set expires_at=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '2 days' where account_hash=$1",[alice]);
  assert.equal(await until(alice),null);
  assert.equal((await admin(grant)).ok,true);
  assert.equal((await admin({action:'grant',accountHash:bob,days:1,reviewed:true})).ok,true);
  assert.equal((await share(bob,{action:'share.read',linkId})).ok,true);
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(sql('select * from public.feture_qa_adult_access'),/permission denied/);
   await assert.rejects(sql('select * from public.feture_qa_adult_events'),/permission denied/);
   await assert.rejects(staff(manager,{action:'status'}),/permission denied/);
   await assert.rejects(sql('select * from public.feture_operators'),/permission denied/);
   await assert.rejects(until(alice),/permission denied/);
   await assert.rejects(admin(grant),/permission denied/);
   await db.exec('reset role');
  }
  await sql("update feture_seed.environment set stage='live' where singleton");
  await db.exec('set role service_role');
  assert.equal(await until(alice),null,'stage transition disables all QA permissions at once');
  assert.equal((await share(bob,{action:'share.read',linkId})).error,'resource_not_found','switching to live denies a still valid link via QA');
  assert.equal((await admin(grant)).error,'not_prelaunch','production gate forbids new grants');
  assert.equal((await sql('select public.feture_peer_eligible($1) eligible',[alice]))[0].eligible,false);
 }finally{await db.close();}
});
