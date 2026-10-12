import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('C02.4d mute: pre-limit feed filtering and stable cursor without private post grants',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql','20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql','20261010233014_feture_moderation.sql','20261011080915_feture_share_links.sql','20261011083303_feture_qa_adult_access.sql','20261011113717_feture_qa_any_account_audit.sql','20261011120139_feture_operator_roles.sql','20261011121629_feture_operator_account_binding.sql','20261011133134_feture_community_posts.sql','20261011134257_feture_post_review.sql','20261011140051_feture_post_reports.sql','20261011140835_feture_post_report_author_privacy.sql','20261011141800_feture_post_recipients.sql','20261011043127_feture_questionnaires.sql','20261011045829_feture_questionnaires_release.sql','20261011190651_feture_test_result_posts.sql','20261011193939_feture_post_photos.sql','20261012050032_feture_photo_review_consent.sql','20261012073357_feture_staff_photo_read.sql'])await db.exec(sql(file));
  for(const file of ['20261012213000_feture_public_authors.sql','20261012215000_feture_public_author_resolve.sql',
   '20261012223000_feture_author_relationships.sql','20261012233000_feture_muted_feed.sql'])await db.exec(sql(file));
  const [a,b,c]=['a','b','c'].map(k=>k.repeat(32));
  for(const actor of [a,b,c])await db.query('insert into public.feture_profiles(account_hash) values($1)',[actor]);
  await db.query("insert into public.feture_verification_policies values('fixture','production','v1',18,86400000,60000,90,true)");
  await db.exec('set role service_role');
  const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
  const feed=(actor,cursor=null)=>rpc('feture_post_feed_command',[actor,JSON.stringify({action:'posts.feed',cursor})]);
  const originals=(actor,cmd)=>rpc('feture_post_command',[actor,JSON.stringify(cmd)]);
  const relate=(actor,cmd)=>rpc('feture_author_relationship_command',[actor,JSON.stringify(cmd)]);
  const docs=[];
  for(const key of ['privacy','adult-content','community','terms']){
   await rpc('feture_document_save',[key,'ru',0,'Правила',JSON.stringify([{type:'paragraph',text:'Правила для тестов'}]),true]);
   docs.push((await rpc('feture_document_publish',[key,'ru',1,true,new Date().toISOString()])).document.id);
  }
  for(const [n,actor] of [a,b,c].entries()){
   await rpc('feture_consent_accept',[actor,'ru',docs]);
   await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[uuid(n+1),actor]);
  }
  const publicId=(await rpc('feture_public_author_command',[a,JSON.stringify({action:'authors.enable',consent:true,operationId:uuid(20)})])).publicAuthorId;
  for(let i=0;i<25;i++){
   await db.query("insert into public.feture_posts(id,author_hash,body,kind,author_label,state,audience,published_at) values($1,$2,'Published A','text','A','published','public',clock_timestamp()-$3*interval '1 minute'+interval '1 second')",[uuid(1000+i),a,i]);
   await db.query("insert into public.feture_posts(id,author_hash,body,kind,author_label,state,audience,published_at) values($1,$2,'Published C','text','C','published','public',clock_timestamp()-$3*interval '1 minute')",[uuid(2000+i),c,i]);
  }
  const address=(await rpc('feture_post_address_command',[b,JSON.stringify({action:'posts.address'})])).code;
  const selected=uuid(3000);
  await db.query("insert into public.feture_posts(id,author_hash,body,kind,author_label,state,audience,published_at) values($1,$2,'Selected A','text','A','published','granted',clock_timestamp()+interval '2 minutes')",[selected,a]);
  await db.query('insert into public.feture_post_recipients(post_id,code) values($1,$2)',[selected,address]);
  assert.equal((await feed(b)).items.length,20);
  assert.equal((await feed(b)).items.some(x=>x.id===selected),true);
  const mute=(n,active,postId=active?uuid(1000):null)=>({action:'relationships.set',kind:'mute',publicAuthorId:publicId,postId,operationId:uuid(n),active});
  assert.equal((await relate(b,mute(100,true))).active,true);
  const p1=await feed(b);
  assert.equal(p1.items.length,20);
  assert.equal(p1.items.every(x=>x.authorLabel==='C'),true);
  assert.equal(p1.items.some(x=>x.id===selected),false);
  assert.ok(p1.nextCursor);
  const p2=await feed(b,p1.nextCursor);
  assert.equal(p2.items.length,5);
  assert.equal(p2.nextCursor,null);
  assert.equal(new Set([...p1.items,...p2.items].map(x=>x.id)).size,25);
  assert.equal((await originals(b,{action:'posts.read',id:selected})).entry.id,selected); // Mute is not a permission revocation.
  assert.equal((await originals(a,{action:'posts.mine',cursor:null})).items.some(x=>x.authorLabel==='A'),true);
  assert.equal((await feed(c)).items.some(x=>x.authorLabel==='A'),true); // Mute affects only owner.
  await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[b,c]);
  assert.equal((await feed(b)).items.length,0); // Author A muted; author C blocked.
  await db.query('delete from public.feture_blocks where blocker_hash=$1 and blocked_hash=$2',[b,c]);
  await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[b]);
  assert.equal((await feed(b)).error,'resource_not_found');
  assert.deepEqual(await relate(b,mute(101,false)),{ok:true,active:false,replayed:false});
  await db.query("update public.feture_verification_attempts set proof_expires_at=clock_timestamp()+interval '1 hour' where account_hash=$1",[b]);
  assert.equal((await feed(b)).items.some(x=>x.authorLabel==='A'),true);
  assert.equal((await relate(b,mute(102,true))).active,true);
  await rpc('feture_public_author_command',[a,JSON.stringify({action:'authors.rotate',operationId:uuid(103)})]);
  assert.equal((await feed(b)).items.some(x=>x.authorLabel==='A'),true); // Cascaded mute cannot survive rotation.
  assert.equal((await db.query("select count(*)::int n from public.feture_author_relationships where viewer_hash=$1 and kind='mute'",[b])).rows[0].n,0);
  assert.equal((await feed(b,{at:'bad',id:uuid(1)})).error,'invalid_cursor');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(feed(b),/permission denied/);
  }
 }finally{await db.close();}
});
