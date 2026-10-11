import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
const alice='a'.repeat(32),bob='b'.repeat(32);
test('A04 QA: prelaunch-only, Core-admin-only grants expire/revoke, no bypass of consent',async()=>{
 const db=new PGlite();
 const sql=async(s,a=[])=>db.query(s,a).then(r=>r.rows);
 const admin=c=>sql('select public.feture_qa_adult_admin($1::jsonb) result',[JSON.stringify(c)]).then(r=>r[0].result);
 const until=o=>sql('select public.feture_qa_adult_until($1::text) t',[o]).then(r=>r[0].t);
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const filename of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql',
   '20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql',
   '20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql',
   '20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql',
   '20261010233014_feture_moderation.sql','20261011080915_feture_share_links.sql',
   '20261011083303_feture_qa_adult_access.sql'])await db.exec(load(filename));
  await db.exec('set role service_role');
  const grant={action:'grant',accountHash:alice,days:1,reviewed:true};
  assert.equal((await until(alice)),null);
  assert.equal((await admin({...grant,reviewed:false})).error,'invalid_request');
  assert.equal((await admin({...grant,days:7})).error,'invalid_request');
  assert.equal((await admin({...grant,accountHash:'seed:feture-x:y'})).error,'invalid_request');
  assert.equal((await admin(grant)).ok,true);
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
