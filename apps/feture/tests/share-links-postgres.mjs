import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('W07 share links: private source projection, atomic replay, expiry, revoke and distinct adult owner/viewer',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql',
   '20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql',
   '20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql',
   '20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql',
   '20261010233014_feture_moderation.sql','20261011081500_feture_share_links.sql'])await db.exec(sql(file));
  const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
  const op=(actor,command)=>db.query('select public.feture_share_command($1::text,$2::jsonb) result',[actor,JSON.stringify(command)]).then(v=>v.rows[0].result);
  const [alice,bob,third]=['a','b','c'].map(x=>x.repeat(32));
  for(const owner of [alice,bob,third])await db.query('insert into public.feture_profiles(account_hash) values($1)',[owner]);
  await db.exec('set role service_role');
  await db.query("insert into public.feture_verification_policies values('fixture','production','v1',18,86400000,60000,90,true)");
  const docs=[];
  for(const key of ['terms','privacy','community','adult-content']){
   await rpc('feture_document_save',[key,'ru',0,key,JSON.stringify([{type:'paragraph',text:'Fixture'}]),true]);
   docs.push((await rpc('feture_document_publish',[key,'ru',1,true,new Date().toISOString()])).document.id);
  }
  for(const [i,owner] of [alice,bob].entries()){
   await rpc('feture_consent_accept',[owner,'ru',docs]);
   await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[id(10+i),owner]);
  }
  await db.query("insert into public.feture_interest_states(account_hash,interest_id,stance,experience,boundary,boundary_note,intensity,visibility,use_for_discovery,revision,source,test_version,deleted) values($1,'interest-1-1','curious','ongoing','none','TOP SECRET CONDITIONS',4,'private',false,1,'manual',null,false)",[alice]);
  const link=id(100);
  const selected=[{interestId:'interest-1-1',expectedRevision:1}];
  const create={action:'share.create',linkId:link,days:3,reviewed:true,selected};
  assert.equal((await op(alice,create)).ok,true);
  assert.equal((await op(alice,create)).replayed,true);
  assert.equal((await op(alice,{...create,days:7})).error,'operation_conflict');
  assert.equal((await op(third,{action:'share.revoke',linkId:link})).error,'resource_not_found');
  const read=await op(bob,{action:'share.read',linkId:link});
  assert.equal(read.ok,true);
  assert.deepEqual(read.card.items,[{title:'Ведущая роль',stance:'curious'}]);
  for(const secret of ['TOP SECRET','ongoing','private','intensity','account_hash','email'])assert.equal(JSON.stringify(read).includes(secret),false);
  assert.equal((await op(third,{action:'share.read',linkId:link})).error,'resource_not_found');
  const list=await op(alice,{action:'share.list'});assert.equal(list.items.length,1);assert.equal(list.items[0].id,link);
  assert.equal((await op(bob,{action:'share.list'})).items.length,0);
  assert.equal((await op(alice,{action:'share.create',linkId:id(101),days:1,reviewed:true,selected:[...selected,...selected]})).error,'invalid_request');
  assert.equal((await op(alice,{action:'share.create',linkId:id(102),days:1,reviewed:false,selected})).error,'invalid_request');
  await db.query("update public.feture_interest_states set boundary='hard',revision=2 where account_hash=$1 and interest_id='interest-1-1'",[alice]);
  assert.equal((await op(bob,{action:'share.read',linkId:link})).error,'resource_not_found');
  assert.equal((await op(alice,{action:'share.revoke',linkId:link})).ok,true);
  assert.equal((await op(alice,{action:'share.revoke',linkId:link})).revoked,true);
  assert.equal((await op(bob,{action:'share.read',linkId:link})).error,'resource_not_found');
  const r=await db.query('select snapshot from public.feture_share_links where id=$1',[link]);
  assert.equal(JSON.stringify(r.rows[0].snapshot).includes('TOP SECRET'),false);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_share_links'),/permission denied/);
   await assert.rejects(op(bob,{action:'share.read',linkId:link}),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
});
