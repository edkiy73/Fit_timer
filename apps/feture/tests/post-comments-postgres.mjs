import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('C02.3a comments: moderation-first pending, ACL, exact CAS/replay, tombstones, one reply level',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql','20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql','20261010233014_feture_moderation.sql','20261011080915_feture_share_links.sql','20261011083303_feture_qa_adult_access.sql','20261011113717_feture_qa_any_account_audit.sql','20261011120139_feture_operator_roles.sql','20261011121629_feture_operator_account_binding.sql','20261011133134_feture_community_posts.sql','20261011134257_feture_post_review.sql','20261011140051_feture_post_reports.sql','20261011140835_feture_post_report_author_privacy.sql','20261011141800_feture_post_recipients.sql','20261011043127_feture_questionnaires.sql','20261011045829_feture_questionnaires_release.sql','20261011190651_feture_test_result_posts.sql','20261011193939_feture_post_photos.sql','20261012050032_feture_photo_review_consent.sql','20261012073357_feture_staff_photo_read.sql'])await db.exec(sql(file));
  await db.exec(sql('20261012190000_feture_post_comments.sql'));
  await db.exec(sql('20261012193000_feture_post_comment_review.sql'));
  const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
  const cmd=(actor,request)=>rpc('feture_post_comment_command',[actor,JSON.stringify(request)]);
  const [a,b,c]=['a','b','c'].map(x=>x.repeat(32));
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

  // Bound personal staff operator: separate from comment author/post author, never a client-supplied role.
  const manager='d'.repeat(32),generation='1'.repeat(64);
  await db.exec('reset role');
  await db.query('insert into public.feture_profiles(account_hash) values($1)',[manager]);
  await db.query("insert into public.feture_operators(account_hash,role,revision,account_generation) values($1,'manager',1,$2)",[manager,generation]);
  await db.exec('set role service_role');
  await rpc('feture_consent_accept',[manager,'ru',docs]);
  await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[id(8),manager]);
  const staff=(actor,body,gen=generation)=>rpc('feture_post_comment_review_command',[actor,gen,JSON.stringify(body)]);
  const decide=(commentId,operationId,expectedRevision,decision,reason)=>
   ({action:'decide',id:commentId,operationId,expectedRevision,decision,reason});
  assert.equal((await staff(b,{action:'queue',cursor:null})).error,'forbidden');
  assert.equal((await staff(manager,{action:'queue',cursor:null},'2'.repeat(64))).error,'forbidden');
  const post=id(100),privatePost=id(200);
  await db.query("insert into public.feture_posts(id,author_hash,body,kind,author_label,state,audience,published_at) values($1,$2,'Posted text','text','Alias','published','public',clock_timestamp())",[post,a]);
  await db.query("insert into public.feture_posts(id,author_hash,body,kind,author_label,state,audience) values($1,$2,'Private text','text','Alias','draft','private')",[privatePost,a]);
  const page={action:'comments.page',postId:post,cursor:null};
  const create={action:'comments.create',id:id(300),postId:post,parentId:null,operationId:id(301),text:'Мой ответ'};
  const read=id=>({action:'comments.read',id});
  assert.deepEqual((await cmd(b,page)).items,[]);
  assert.equal((await cmd(b,{...create,postId:privatePost})).error,'resource_not_found');
  assert.equal((await cmd(b,{...create,actor:a})).error,'invalid_request');
  const first=await cmd(b,create);
  assert.equal(first.entry.state,'pending');
  assert.equal(first.entry.text,'Мой ответ');
  assert.equal(first.replayed,false);
  assert.equal((await cmd(b,create)).replayed,true);
  assert.equal((await cmd(b,{...create,text:'Подмена'})).error,'operation_conflict');
  assert.equal((await cmd(c,read(create.id))).error,'resource_not_found');
  assert.equal((await cmd(b,read(create.id))).entry.text,'Мой ответ');
  assert.deepEqual((await cmd(a,page)).items,[]);
  assert.equal((await cmd(b,{action:'comments.page',postId:post,cursor:{at:'no',id:create.id}})).error,'invalid_cursor');
  assert.equal((await cmd(c,{action:'comments.create',id:id(400),postId:post,parentId:create.id,operationId:id(401),text:'На ответ'})).error,'resource_not_found');
  const edit={action:'comments.edit',id:create.id,expectedRevision:1,operationId:id(302),text:'Исправленный ответ'};
  assert.equal((await cmd(c,edit)).error,'resource_not_found');
  assert.equal((await cmd(b,{...edit,expectedRevision:2})).error,'revision_conflict');
  assert.equal((await cmd(b,edit)).entry.revision,2);
  assert.equal((await cmd(b,edit)).replayed,true);
  assert.equal((await cmd(b,create)).entry.text,'Исправленный ответ');

  assert.equal((await staff(manager,{action:'queue',cursor:null})).items.find(x=>x.id===create.id).text,'Исправленный ответ');
  assert.equal((await staff(manager,decide(create.id,id(320),1,'approve','reviewed'))).error,'revision_conflict');
  assert.equal((await staff(manager,decide(create.id,id(321),2,'approve','policy'))).error,'invalid_request');
  const approved=decide(create.id,id(322),2,'approve','reviewed');
  assert.equal((await staff(manager,approved)).entry.state,'published');
  assert.equal((await staff(manager,approved)).replayed,true);
  assert.equal((await staff(manager,{...approved,expectedRevision:3})).error,'operation_conflict');
  assert.equal((await staff(b,{action:'audit',cursor:null})).error,'forbidden');
  const reply={action:'comments.create',id:id(400),postId:post,parentId:create.id,operationId:id(401),text:'Ответ на комментарий'};
  assert.equal((await cmd(c,reply)).entry.state,'pending');
  assert.equal((await cmd(b,{...reply,id:id(402),operationId:id(403),parentId:reply.id})).error,'resource_not_found');
  assert.equal((await cmd(a,page)).items.length,1);

  const approveReply=decide(reply.id,id(323),1,'approve','reviewed');
  assert.equal((await staff(manager,approveReply)).entry.state,'published');
  const audit=(await staff(manager,{action:'audit',cursor:null}));
  assert.equal(audit.items.length,2);
  assert.equal(JSON.stringify(audit).includes('Ответ на комментарий'),false);
  assert.equal(JSON.stringify(audit).includes('author_hash'),false);
  assert.equal((await cmd(a,page)).items.length,2);
  // A block or expired adult proof of the commenter also hides the comment and its replies.
  await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[c,b]);
  assert.deepEqual((await cmd(c,page)).items,[]);
  assert.equal((await cmd(c,read(create.id))).error,'resource_not_found');
  assert.equal((await cmd(a,page)).items.length,2); // Another reader is not affected.
  await db.query('delete from public.feture_blocks where blocker_hash=$1 and blocked_hash=$2',[c,b]);
  await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[b]);
  assert.deepEqual((await cmd(a,page)).items,[]);
  assert.equal((await cmd(a,read(create.id))).error,'resource_not_found');
  await db.query("update public.feture_verification_attempts set proof_expires_at=clock_timestamp()+interval '1 hour' where account_hash=$1",[b]);
  assert.equal((await cmd(a,page)).items.length,2);

  assert.equal((await staff(manager,decide(create.id,id(324),3,'hide','privacy'))).entry.state,'hidden');
  assert.deepEqual((await cmd(a,page)).items,[]);
  assert.equal((await cmd(a,read(reply.id))).error,'resource_not_found');
  assert.equal((await cmd(c,read(reply.id))).entry.text,'Ответ на комментарий'); // Owner can still delete own reply.

  assert.equal((await staff(manager,decide(create.id,id(325),4,'reopen','reviewed'))).entry.state,'pending');
  assert.equal((await staff(manager,decide(create.id,id(326),5,'approve','reviewed'))).entry.state,'published');
  const deleted={action:'comments.delete',id:create.id,expectedRevision:6,operationId:id(304)};
  assert.equal((await cmd(b,deleted)).entry.state,'deleted');
  assert.equal((await cmd(b,deleted)).entry.text,'');
  assert.equal((await cmd(b,deleted)).replayed,true);
  assert.equal((await cmd(b,create)).entry.state,'deleted');
  assert.deepEqual((await cmd(a,page)).items,[]);
  assert.equal((await cmd(c,read(reply.id))).entry.text,'Ответ на комментарий'); // Child owner only while parent deleted.
  const cdelete={action:'comments.delete',id:reply.id,expectedRevision:2,operationId:id(404)};
  await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[a,c]);
  assert.equal((await cmd(c,read(reply.id))).error,'resource_not_found');
  assert.equal((await cmd(c,{action:'comments.edit',id:reply.id,expectedRevision:1,operationId:id(405),text:'нельзя'})).error,'resource_not_found');
  assert.equal((await cmd(c,cdelete)).entry.state,'deleted');
  assert.equal((await cmd(c,reply)).entry.text,'');
  assert.equal((await db.query('select count(*)::int n from public.feture_post_comment_operations where account_hash=$1',[c])).rows[0].n,2);

  assert.equal((await staff(manager,decide(reply.id,id(329),2,'hide','privacy'))).error,'resource_not_found');
  await db.exec('reset role');
  await db.query("update public.feture_operators set role=null where account_hash=$1",[manager]);
  await db.exec('set role service_role');
  assert.equal((await staff(manager,{action:'queue',cursor:null})).error,'forbidden');
  await db.query('delete from public.feture_posts where id=$1',[post]);
  assert.equal((await cmd(b,page)).error,'resource_not_found');
  assert.equal((await cmd(b,create)).error,'resource_not_found');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_post_comments'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_post_comment_operations'),/permission denied/);
   await assert.rejects(cmd(b,page),/permission denied/);
   await assert.rejects(staff(manager,{action:'audit',cursor:null}),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_post_comment_reviews'),/permission denied/);
  }
 }finally{await db.close();}
});
