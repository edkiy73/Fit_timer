import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {reactionCommand,createReactionsRepository}=require('../lib/feture/post-reactions.js');
const sql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('C02.2 react: strict client contract and filtered server DTO',async()=>{
 assert.deepEqual(reactionCommand({action:'posts.reactionState',id:id(1)}),{action:'posts.reactionState',id:id(1)});
 for(const bad of [{action:'posts.reactionSet',id:id(1),operationId:id(2),kind:'like',active:true,account_hash:'spoof'},
 {action:'posts.reactionSet',id:id(1),operationId:id(2),kind:'like',active:'true'},
 {action:'posts.reactionSet',id:id(1),operationId:id(2),kind:'heart',active:true}])
 assert.throws(()=>reactionCommand(bad),e=>e.code==='invalid_request');
 const actor={accountHash:'a'.repeat(32)};
 const makeRepository=data=>createReactionsRepository({configured:()=>true,request:async()=>({ok:true,json:async()=>data})});
 assert.deepEqual(await makeRepository({ok:true,likes:1,liked:true}).execute(actor,{action:'posts.reactionState',id:id(1)}),{likes:1,liked:true});
 for(const bad of [{ok:true,likes:1,liked:true,actor:'secret'},{ok:true,likes:-1,liked:false},{ok:true,likes:'5',liked:true}])
 await assert.rejects(makeRepository(bad).execute(actor,{action:'posts.reactionState',id:id(1)}),e=>e.code==='domain_unavailable');
});

test('C02.2 reactions: visibility, revoke, replay, immutable counters and client RLS',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql','20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql','20261010233014_feture_moderation.sql','20261011080915_feture_share_links.sql','20261011083303_feture_qa_adult_access.sql','20261011113717_feture_qa_any_account_audit.sql','20261011120139_feture_operator_roles.sql','20261011121629_feture_operator_account_binding.sql','20261011133134_feture_community_posts.sql','20261011134257_feture_post_review.sql','20261011140051_feture_post_reports.sql','20261011140835_feture_post_report_author_privacy.sql','20261011141800_feture_post_recipients.sql','20261011043127_feture_questionnaires.sql','20261011045829_feture_questionnaires_release.sql','20261011190651_feture_test_result_posts.sql','20261011193939_feture_post_photos.sql','20261012050032_feture_photo_review_consent.sql','20261012073357_feture_staff_photo_read.sql'])await db.exec(sql(file));
  await db.exec(sql('20261012180000_feture_post_reactions.sql'));
  const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
  const react=(actor,cmd)=>rpc('feture_post_reaction_command',[actor,JSON.stringify(cmd)]);
  const [a,b,c]=['a','b','c'].map(v=>v.repeat(32));
  for(const owner of [a,b,c])await db.query('insert into public.feture_profiles(account_hash) values($1)',[owner]);
  await db.query("insert into public.feture_verification_policies values('fixture','production','v1',18,86400000,60000,90,true)");
  await db.exec('set role service_role');
  const docs=[];
  for(const key of ['privacy','adult-content','community','terms']){
   await rpc('feture_document_save',[key,'ru',0,'Правила',JSON.stringify([{type:'paragraph',text:'Правила для тестов'}]),true]);
   docs.push((await rpc('feture_document_publish',[key,'ru',1,true,new Date().toISOString()])).document.id);
  }
  for(const [n,owner] of [a,b,c].entries()){
   await rpc('feture_consent_accept',[owner,'ru',docs]);
   await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[id(n+1),owner]);
  }
  const publicId=id(100),selectedId=id(200),privateId=id(300);
  for(const [postId,state,audience] of [[publicId,'published','public'],[selectedId,'published','granted'],[privateId,'draft','private']]){
   await db.query("insert into public.feture_posts(id,author_hash,body,author_label,kind,state,audience,published_at) values($1,$2,'Published safe text','Author','text',$3,$4,$5)",[postId,a,state,audience,state==='published'?new Date().toISOString():null]);
  }
  const address=(await rpc('feture_post_address_command',[b,JSON.stringify({action:'posts.address'})])).code;
  await db.query('insert into public.feture_post_recipients(post_id,code) values($1,$2)',[selectedId,address]);
  const state=id=>({action:'posts.reactionState',id});
  const set=(id,op,active)=>({action:'posts.reactionSet',id,operationId:op,kind:'like',active});
  const like=set(publicId,id(110),true),unlike=set(publicId,id(111),false),clike=set(publicId,id(112),true);
  assert.deepEqual(await react(b,state(publicId)),{ok:true,liked:false,likes:0});
  assert.equal((await react(b,state(privateId))).error,'resource_not_found');
  assert.equal((await react(b,{...like,actor:a})).error,'invalid_request');
  assert.equal((await react(b,{...like,kind:'support'})).error,'invalid_request');
  assert.deepEqual(await react(b,like),{ok:true,liked:true,likes:1,replayed:false});
  assert.deepEqual(await react(b,like),{ok:true,liked:true,likes:1,replayed:true});
  assert.equal((await react(b,{...like,id:privateId})).error,'operation_conflict');
  assert.equal((await react(b,{...like,active:false})).error,'operation_conflict');
  assert.equal((await react(c,clike)).likes,2);
  assert.equal((await react(b,unlike)).likes,1);
  assert.deepEqual(await react(b,like),{ok:true,liked:false,likes:1,replayed:true});
  assert.equal((await db.query('select count(*)::int n from public.feture_post_reactions where post_id=$1',[publicId])).rows[0].n,1);
  assert.equal((await react(c,set(selectedId,id(119),true))).error,'resource_not_found');
  assert.equal((await react(b,set(selectedId,id(120),true))).likes,1);
  assert.equal((await react(a,state(selectedId))).likes,1);
  await db.query('delete from public.feture_post_recipients where post_id=$1',[selectedId]);
  assert.equal((await react(b,state(selectedId))).error,'resource_not_found');
  assert.equal((await react(b,set(selectedId,id(120),true))).error,'resource_not_found');
  assert.equal((await react(a,state(selectedId))).likes,0);
  await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[a,c]);
  assert.equal((await react(c,state(publicId))).error,'resource_not_found');
  assert.equal((await react(b,state(publicId))).likes,0); // blocked previous reactor excluded
  await db.query('delete from public.feture_blocks where blocker_hash=$1 and blocked_hash=$2',[a,c]);
  assert.equal((await react(b,state(publicId))).likes,1);
  await db.query("update public.feture_posts set state='hidden',audience='private',published_at=null where id=$1",[publicId]);
  assert.equal((await react(b,state(publicId))).error,'resource_not_found');
  assert.equal((await react(b,like)).error,'resource_not_found');
  await db.query("update public.feture_posts set state='published',audience='public',published_at=clock_timestamp() where id=$1",[publicId]);
  await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[b]);
  assert.equal((await react(b,state(publicId))).error,'resource_not_found');
  assert.equal((await react(a,state(publicId))).likes,1); // c remains eligible
  await db.query('delete from public.feture_posts where id=$1',[publicId]);
  assert.equal((await react(c,clike)).error,'resource_not_found');
  assert.equal((await db.query('select count(*)::int n from public.feture_post_reactions where post_id=$1',[publicId])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.feture_post_reaction_operations where operation_id=$1',[clike.operationId])).rows[0].n,1);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_post_reactions'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_post_reaction_operations'),/permission denied/);
   await assert.rejects(react(a,state(selectedId)),/permission denied/);
  }
 }finally{await db.close();}
});
