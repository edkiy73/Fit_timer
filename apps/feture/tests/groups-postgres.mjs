import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('C03 group catalog: paginated public/closed metadata without any membership leakage',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql','20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql','20261010233014_feture_moderation.sql','20261011080915_feture_share_links.sql','20261011083303_feture_qa_adult_access.sql','20261011113717_feture_qa_any_account_audit.sql','20261011120139_feture_operator_roles.sql','20261011121629_feture_operator_account_binding.sql','20261011133134_feture_community_posts.sql','20261011134257_feture_post_review.sql','20261011140051_feture_post_reports.sql','20261011140835_feture_post_report_author_privacy.sql','20261011141800_feture_post_recipients.sql','20261011043127_feture_questionnaires.sql','20261011045829_feture_questionnaires_release.sql','20261011190651_feture_test_result_posts.sql','20261011193939_feture_post_photos.sql','20261012050032_feture_photo_review_consent.sql','20261012073357_feture_staff_photo_read.sql','20261012170000_feture_post_bookmarks.sql'])await db.exec(sql(file));
  await db.exec(sql('20261012235000_feture_groups_catalog.sql'));
  const [a,b,c]=['a','b','c'].map(s=>s.repeat(32));
  for(const person of [a,b,c])await db.query('insert into public.feture_profiles(account_hash) values($1)',[person]);
  await db.query("insert into public.feture_verification_policies values('fixture','production','v1',18,86400000,60000,90,true)");
  await db.exec('set role service_role');
  const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
  const docs=[];
  for(const key of ['privacy','adult-content','community','terms']){
   await rpc('feture_document_save',[key,'ru',0,'Правила',JSON.stringify([{type:'paragraph',text:'Открытый тестовый текст'}]),true]);
   docs.push((await rpc('feture_document_publish',[key,'ru',1,true,new Date().toISOString()])).document.id);
  }
  for(const [n,person] of [a,b,c].entries()){
   await rpc('feture_consent_accept',[person,'ru',docs]);
   await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[uuid(n+1),person]);
  }
  const group=(who,i,visibility,state='published')=>db.query(
   "insert into public.feture_groups(id,owner_hash,slug,title,summary,rules,visibility,state,published_at) values($1,$2,$3,$4,'Описание сообщества','Общие правила',$5,$6,$7)",
   [uuid(100+i),who,'group-'+i,'Группа '+i,visibility,state,state==='published'?new Date(Date.now()-i*60000).toISOString():null]);
  for(let i=0;i<24;i++)await group(a,i,i%2?'closed':'public');
  await group(b,24,'public');
  await group(b,25,'closed');
  await group(a,26,'closed','draft');
  await group(a,27,'public','hidden');
  const catalog=(who,cursor=null)=>rpc('feture_group_catalog_command',[who,JSON.stringify({action:'groups.catalog',cursor})]);
  const preview=(who,id)=>rpc('feture_group_catalog_command',[who,JSON.stringify({action:'groups.preview',id})]);
  const first=await catalog(c);
  assert.equal(first.items.length,20);
  assert.ok(first.nextCursor);
  const second=await catalog(c,first.nextCursor);
  assert.equal(second.items.length,6);
  assert.equal(second.nextCursor,null);
  const all=[...first.items,...second.items];
  assert.equal(new Set(all.map(item=>item.id)).size,26);
  assert.equal(all.some(item=>item.visibility==='closed'),true);
  assert.equal(all.some(item=>item.visibility==='public'),true);
  assert.equal(all.every(x=>Object.keys(x).sort().join(',')==='id,publishedAt,rules,slug,summary,title,visibility'),true);
  assert.equal(JSON.stringify(all).includes(a),false);
  assert.equal(JSON.stringify(all).includes('owner_hash'),false);
  const closed=all.find(x=>x.visibility==='closed');
  assert.deepEqual((await preview(c,closed.id)).entry,closed);
  assert.equal((await preview(c,uuid(126))).error,'resource_not_found');
  assert.equal((await preview(c,uuid(127))).error,'resource_not_found');
  assert.equal((await preview(c,uuid(999))).error,'resource_not_found');
  assert.equal((await catalog(c,{at:'nonsense',id:uuid(1)})).error,'invalid_cursor');
  assert.equal((await catalog(c,{at:first.nextCursor.at,id:uuid(1),extra:'leak'})).error,'invalid_cursor');
  assert.equal((await preview(c,closed.id)).ok,true);
  assert.equal((await rpc('feture_group_catalog_command',[c,JSON.stringify({action:'groups.preview',id:closed.id,actor:b})])).error,'invalid_request');
  await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[c,a]);
  const filtered=await catalog(c);
  assert.equal(filtered.items.length,2);
  assert.equal(filtered.items.every(x=>x.slug==='group-24'||x.slug==='group-25'),true);
  assert.equal((await preview(c,uuid(100))).error,'resource_not_found');
  assert.equal((await catalog(b)).items.some(x=>x.slug==='group-1'),true);
  await db.query('delete from public.feture_blocks where blocker_hash=$1 and blocked_hash=$2',[c,a]);
  await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[a]);
  assert.equal((await catalog(c)).items.length,2);
  assert.equal((await preview(c,uuid(100))).error,'resource_not_found');
  await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[c]);
  assert.equal((await catalog(c)).error,'resource_not_found');
  assert.equal((await preview(c,uuid(124))).error,'resource_not_found');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_groups'),/permission denied/);
   await assert.rejects(catalog(b),/permission denied/);
  }
 }finally{await db.close();}
});
