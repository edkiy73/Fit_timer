import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('C02.4a public authors: opt-in, sever on revoke/rotate, exact replay, RLS roles',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql','20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql','20261010233014_feture_moderation.sql','20261011080915_feture_share_links.sql','20261011083303_feture_qa_adult_access.sql','20261011113717_feture_qa_any_account_audit.sql','20261011120139_feture_operator_roles.sql','20261011121629_feture_operator_account_binding.sql','20261011133134_feture_community_posts.sql','20261011134257_feture_post_review.sql','20261011140051_feture_post_reports.sql','20261011140835_feture_post_report_author_privacy.sql','20261011141800_feture_post_recipients.sql','20261011043127_feture_questionnaires.sql','20261011045829_feture_questionnaires_release.sql','20261011190651_feture_test_result_posts.sql','20261011193939_feture_post_photos.sql','20261012050032_feture_photo_review_consent.sql','20261012073357_feture_staff_photo_read.sql'])await db.exec(sql(file));
  await db.exec(sql('20261012213000_feture_public_authors.sql'));
  await db.exec(sql('20261012215000_feture_public_author_resolve.sql'));
  const a='a'.repeat(32),b='b'.repeat(32);
  for(const actor of [a,b])await db.query('insert into public.feture_profiles(account_hash) values($1)',[actor]);
  await db.query("insert into public.feture_verification_policies values('fixture','production','v1',18,86400000,60000,90,true)");
  await db.exec('set role service_role');
  const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
  const op=(actor,cmd)=>rpc('feture_public_author_command',[actor,JSON.stringify(cmd)]);
  const enable=n=>({action:'authors.enable',operationId:uuid(n),consent:true});
  const disable=n=>({action:'authors.disable',operationId:uuid(n)});
  const rotate=n=>({action:'authors.rotate',operationId:uuid(n)});
  assert.equal((await op(a,{action:'authors.status'})).enabled,false);
  assert.equal((await op(a,enable(10))).error,'resource_not_found');
  assert.equal((await op(a,{...enable(10),accountHash:b})).error,'invalid_request');
  assert.equal((await op(a,{...enable(10),consent:false})).error,'invalid_request');
  assert.equal((await op(b,rotate(20))).error,'resource_not_found');
  const docs=[];
  for(const key of ['privacy','adult-content','community','terms']){
   await rpc('feture_document_save',[key,'ru',0,'Правила',JSON.stringify([{type:'paragraph',text:'Правила для тестов'}]),true]);
   docs.push((await rpc('feture_document_publish',[key,'ru',1,true,new Date().toISOString()])).document.id);
  }
  await rpc('feture_consent_accept',[a,'ru',docs]);
  await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[uuid(1),a]);
  const first=await op(a,enable(11));
  assert.equal(first.ok,true);assert.equal(first.enabled,true);assert.equal(first.replayed,false);
  assert.match(first.publicAuthorId,/^[0-9a-f-]{36}$/);
  assert.equal((await op(a,enable(11))).replayed,true);
  assert.equal((await op(a,{action:'authors.disable',operationId:uuid(11)})).error,'operation_conflict');
  assert.equal((await op(b,{action:'authors.status'})).publicAuthorId,null);
  const rotated=await op(a,rotate(12));
  assert.equal(rotated.enabled,true);
  assert.notEqual(rotated.publicAuthorId,first.publicAuthorId);
  assert.equal((await op(a,rotate(12))).publicAuthorId,rotated.publicAuthorId);
  assert.equal((await db.query('select count(*)::int n from public.feture_public_authors')).rows[0].n,1);
  await rpc('feture_consent_accept',[b,'ru',docs]);
  await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[uuid(2),b]);
  const published=uuid(100),hidden=uuid(101);
  await db.query("insert into public.feture_posts(id,author_hash,body,kind,author_label,state,audience,published_at) values($1,$2,'Shared text','text','Alias','published','public',clock_timestamp())",[published,a]);
  await db.query("insert into public.feture_posts(id,author_hash,body,kind,author_label,state,audience) values($1,$2,'Private text','text','Alias','hidden','private')",[hidden,a]);
  const resolve=(actor,postId)=>rpc('feture_public_author_resolve',[actor,postId]);
  assert.deepEqual(await resolve(b,published),{ok:true,publicAuthorId:rotated.publicAuthorId});
  assert.equal((await resolve(b,hidden)).error,'resource_not_found');
  assert.equal((await resolve(b,uuid(200))).error,'resource_not_found');
  await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[a,b]);
  assert.equal((await resolve(b,published)).error,'resource_not_found');
  await db.query('delete from public.feture_blocks where blocker_hash=$1 and blocked_hash=$2',[a,b]);
  assert.equal((await resolve(b,published)).publicAuthorId,rotated.publicAuthorId);

  await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[a]);
  assert.equal((await op(a,rotate(13))).error,'resource_not_found');
  assert.equal((await resolve(b,published)).error,'resource_not_found');
  const denied=await op(a,disable(14));
  assert.equal(denied.enabled,false);assert.equal(denied.publicAuthorId,null);
  assert.equal((await op(a,enable(11))).enabled,false); // historical retry cannot resurrect a link.
  assert.equal((await op(a,disable(14))).replayed,true);
  assert.equal((await op(a,enable(15))).error,'resource_not_found');
  assert.equal((await db.query('select count(*)::int n from public.feture_public_authors')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.feture_public_author_operations where account_hash=$1',[a])).rows[0].n,3);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_public_authors'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_public_author_operations'),/permission denied/);
   await assert.rejects(op(a,{action:'authors.status'}),/permission denied/);
   await assert.rejects(resolve(b,published),/permission denied/);
  }
 } finally {await db.close();}
});
