import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('C03 group drafts: private owner save, CAS, pending moderation, lossless delete replay',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql','20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql','20261010233014_feture_moderation.sql','20261011080915_feture_share_links.sql','20261011083303_feture_qa_adult_access.sql','20261011113717_feture_qa_any_account_audit.sql','20261011120139_feture_operator_roles.sql','20261011121629_feture_operator_account_binding.sql','20261011133134_feture_community_posts.sql','20261011134257_feture_post_review.sql','20261011140051_feture_post_reports.sql','20261011140835_feture_post_report_author_privacy.sql','20261011141800_feture_post_recipients.sql','20261011043127_feture_questionnaires.sql','20261011045829_feture_questionnaires_release.sql','20261011190651_feture_test_result_posts.sql','20261011193939_feture_post_photos.sql','20261012050032_feture_photo_review_consent.sql','20261012073357_feture_staff_photo_read.sql','20261012170000_feture_post_bookmarks.sql'])await db.exec(sql(file));
  await db.exec(sql('20261012235000_feture_groups_catalog.sql'));
  await db.exec(sql('20261013001000_feture_group_owner_drafts.sql'));
  const [a,b,c]=['a','b','c'].map(s=>s.repeat(32));
  for(const actor of [a,b,c])await db.query('insert into public.feture_profiles(account_hash) values($1)',[actor]);
  await db.query("insert into public.feture_verification_policies values('fixture','production','v1',18,86400000,60000,90,true)");
  await db.exec('set role service_role');
  const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
  const own=(actor,c)=>rpc('feture_group_owner_command',[actor,JSON.stringify(c)]);
  const catalog=(actor)=>rpc('feture_group_catalog_command',[actor,JSON.stringify({action:'groups.catalog',cursor:null})]);
  const docs=[];
  for(const key of ['privacy','adult-content','community','terms']){
   await rpc('feture_document_save',[key,'ru',0,'Правила',JSON.stringify([{type:'paragraph',text:'Правила'}]),true]);
   docs.push((await rpc('feture_document_publish',[key,'ru',1,true,new Date().toISOString()])).document.id);
  }
  for(const [i,actor] of [a,b].entries()){
   await rpc('feture_consent_accept',[actor,'ru',docs]);
   await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[uuid(i+1),actor]);
  }
  const id=uuid(200),save={action:'groups.save',id,operationId:uuid(201),expectedRevision:0,
   title:'Разговорный клуб',summary:'Описание',rules:'Уважать границы и частную жизнь участников',visibility:'closed'};
  assert.equal((await own(c,save)).error,'resource_not_found');
  assert.equal((await own(a,{...save,ownerHash:b})).error,'invalid_request');
  assert.equal((await own(a,{...save,rules:'нет'.repeat(800)})).error,'invalid_request');
  const first=await own(a,save);
  assert.equal(first.ok,true);
  assert.equal(first.entry.state,'draft');
  assert.equal(first.entry.revision,1);
  assert.equal(first.entry.slug,'group-'+id.replaceAll('-',''));
  assert.equal(first.replayed,false);
  assert.equal((await own(a,save)).replayed,true);
  assert.equal((await own(a,{...save,title:'Изменение'})).error,'operation_conflict');
  assert.equal((await own(b,{...save,operationId:uuid(205)})).error,'resource_not_found');
  assert.equal((await own(a,{action:'groups.mine',cursor:null})).items.length,1);
  assert.equal((await own(b,{action:'groups.mine',cursor:null})).items.length,0);
  assert.equal((await catalog(b)).items.length,0);
  const edit={...save,title:'Обновлённый клуб',expectedRevision:1,operationId:uuid(202)};
  assert.equal((await own(a,edit)).entry.revision,2);
  assert.equal((await own(a,{...edit,expectedRevision:1,operationId:uuid(203)})).error,'revision_conflict');
  const submit={action:'groups.submit',id,expectedRevision:2,operationId:uuid(204)};
  assert.equal((await own(a,submit)).entry.state,'pending');
  assert.equal((await own(a,submit)).replayed,true);
  assert.equal((await catalog(b)).items.length,0);
  assert.equal((await own(b,{action:'groups.delete',id,expectedRevision:3,operationId:uuid(206)})).error,'resource_not_found');
  await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[a]);
  assert.equal((await own(a,{action:'groups.mine',cursor:null})).items[0].state,'pending');
  assert.equal((await own(a,{...save,expectedRevision:3,operationId:uuid(207)})).error,'resource_not_found');
  const erase={action:'groups.delete',id,expectedRevision:3,operationId:uuid(208)};
  assert.deepEqual(await own(a,erase),{ok:true,deleted:true,replayed:false});
  assert.deepEqual(await own(a,erase),{ok:true,deleted:true,replayed:true});
  assert.equal((await own(a,{action:'groups.mine',cursor:null})).items.length,0);
  assert.equal((await own(a,save)).error,'resource_not_found');
  assert.equal((await own(a,{...save,operationId:uuid(209)})).error,'resource_not_found');
  assert.equal((await db.query('select count(*)::int n from public.feture_groups where id=$1',[id])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.feture_group_operations where group_id=$1',[id])).rows[0].n,4);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_group_operations'),/permission denied/);
   await assert.rejects(own(a,{action:'groups.mine',cursor:null}),/permission denied/);
  }
 }finally{await db.close();}
});
