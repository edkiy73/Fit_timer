import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('C01 posts: draft/pending isolation, reviewed feed ACL, CAS, retries and irreversible text removal',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql','20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql','20261010233014_feture_moderation.sql','20261011080915_feture_share_links.sql','20261011083303_feture_qa_adult_access.sql','20261011113717_feture_qa_any_account_audit.sql','20261011120139_feture_operator_roles.sql','20261011121629_feture_operator_account_binding.sql','20261011133134_feture_community_posts.sql','20261011134257_feture_post_review.sql'])await db.exec(sql(file));
 const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
 const op=(actor,command)=>rpc('feture_post_command',[actor,JSON.stringify(command)]);
 const [a,b,c]=['a','b','c'].map(x=>x.repeat(32));for(const owner of [a,b,c])await db.query('insert into public.feture_profiles(account_hash) values($1)',[owner]);
 await db.query("insert into public.feture_verification_policies values('fixture','production','v1',18,86400000,60000,90,true)");
 await db.exec('set role service_role');const docs=[];
 for(const key of ['privacy','adult-content','community','terms']){await rpc('feture_document_save',[key,'ru',0,'Правила',JSON.stringify([{type:'paragraph',text:'Правила для проверок'}]),true]);docs.push((await rpc('feture_document_publish',[key,'ru',1,true,new Date().toISOString()])).document.id);}
 for(const [n,owner] of [a,b,c].entries()){await rpc('feture_consent_accept',[owner,'ru',docs]);await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[id(n+1),owner]);}
 const create={action:'posts.save',id:id(10),operationId:id(11),expectedRevision:0,text:'Мой личный текст',kind:'question',authorLabel:'Открытое имя'};
 assert.equal((await op(a,{...create,author_hash:b})).error,'invalid_request');
 const draft=await op(a,create);assert.equal(draft.entry.state,'draft');assert.equal(draft.entry.audience,'private');assert.equal((await op(a,create)).replayed,true);
 assert.equal((await db.query('select count(*) n from public.feture_posts')).rows[0].n,1);
 for(const actor of [b,c])assert.equal((await op(actor,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 assert.equal((await op(b,{action:'posts.mine',cursor:null})).items.length,0);
 assert.equal((await op(b,{action:'posts.feed',cursor:null})).items.length,0);
 assert.equal((await op(b,{...create,operationId:id(12),expectedRevision:1})).error,'resource_not_found');
 const submit={action:'posts.submit',id:id(10),operationId:id(13),expectedRevision:1};const pending=await op(a,submit);assert.equal(pending.entry.state,'pending');assert.equal((await op(a,submit)).replayed,true);
 assert.equal((await op(b,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 assert.equal((await op(a,{...create,operationId:id(14),expectedRevision:1})).error,'revision_conflict');
 const manager='d'.repeat(32),auditor='e'.repeat(32),qa='f'.repeat(32),generation='1'.repeat(64);
 await db.exec('reset role');await db.query("insert into public.feture_operators(account_hash,role,revision,account_generation) values($1,'manager',1,$4),($2,'auditor',1,$4),($3,'qa_operator',1,$4)",[manager,auditor,qa,generation]);await db.exec('set role service_role');
 await db.query('insert into public.feture_profiles(account_hash) values($1)',[manager]);await rpc('feture_consent_accept',[manager,'ru',docs]);await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[id(4),manager]);
 const review=(actor,cmd,gen=generation)=>rpc('feture_post_review_command',[actor,gen,JSON.stringify(cmd)]);
 assert.equal((await review(qa,{action:'queue',cursor:null})).error,'forbidden');assert.equal((await review(auditor,{action:'queue',cursor:null})).error,'forbidden');assert.equal((await review(manager,{action:'queue',cursor:null},'2'.repeat(64))).error,'forbidden');
 assert.equal((await review(manager,{action:'queue',cursor:null})).items.length,1);
 const approve={action:'decide',id:id(10),operationId:id(90),expectedRevision:2,decision:'approve',reason:'reviewed'};
 await db.exec('reset role');await db.query("insert into public.feture_operators(account_hash,role,revision,account_generation) values($1,'manager',1,$2)",[a,generation]);await db.exec('set role service_role');assert.equal((await review(a,approve)).error,'review_required');
 assert.equal((await review(qa,{...approve,action:null})).error,'invalid_request');
 assert.equal((await review(auditor,approve)).error,'forbidden');assert.equal((await review(manager,{...approve,expectedRevision:1})).error,'revision_conflict');
 const approved=await review(manager,approve);assert.equal(approved.post.state,'published');assert.equal((await review(manager,approve)).replayed,true);
 assert.equal((await review(manager,{...approve,decision:'hide',reason:'privacy'})).error,'operation_conflict');
 const audit=await review(auditor,{action:'audit',cursor:null});assert.equal(audit.items.length,1);assert.equal(JSON.stringify(audit).includes('Мой личный текст'),false);
 const hide={action:'decide',id:id(10),operationId:id(91),expectedRevision:3,decision:'hide',reason:'privacy'};
 assert.equal((await review(manager,hide)).post.state,'hidden');assert.equal((await op(b,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 const reopen={...hide,operationId:id(92),expectedRevision:4,decision:'reopen',reason:'reviewed'};assert.equal((await review(manager,reopen)).post.state,'pending');assert.equal((await op(b,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 const reapprove={...approve,operationId:id(93),expectedRevision:5};assert.equal((await review(manager,reapprove)).post.state,'published');
 await db.exec('reset role');await db.query("update public.feture_operators set role=null where account_hash=$1",[manager]);await db.exec('set role service_role');assert.equal((await review(manager,reapprove)).error,'forbidden');await db.exec('reset role');await db.query("update public.feture_operators set role='manager' where account_hash=$1",[manager]);await db.exec('set role service_role');

 const feed=await op(b,{action:'posts.feed',cursor:null});assert.equal(feed.items.length,1);assert.equal(feed.items[0].mine,false);
 for(const secret of ['author_hash','account_hash','email','nickname','boundary','granted'])assert.equal(JSON.stringify(feed).includes(secret),false);
 await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[c,a]);
 assert.equal((await op(c,{action:'posts.feed',cursor:null})).items.length,0);assert.equal((await op(c,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[b]);assert.equal((await op(b,{action:'posts.feed',cursor:null})).error,'resource_not_found');
 const edit={...create,operationId:id(15),expectedRevision:6,text:'Исправленный текст'};assert.equal((await op(a,edit)).entry.state,'draft');assert.equal((await op(c,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 assert.equal((await op(a,{...edit,text:'другой повтор'})).error,'operation_conflict');
 const remove={action:'posts.delete',id:id(10),operationId:id(16),expectedRevision:7};await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[a]);
 const deleted=await op(a,remove);assert.equal(deleted.entry.state,'deleted');assert.equal(deleted.entry.text,'');assert.equal(deleted.entry.authorLabel,'');assert.equal((await op(a,remove)).replayed,true);assert.equal((await op(a,create)).entry.state,'deleted');assert.equal((await op(a,submit)).entry.state,'deleted');assert.equal((await review(manager,approve)).post.state,'deleted');assert.equal((await review(manager,{action:'queue',cursor:null})).items.length,0);assert.equal(JSON.stringify(await review(auditor,{action:'audit',cursor:null})).includes('Мой личный текст'),false);
 assert.equal((await op(a,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 assert.equal((await op(a,{action:'posts.mine',cursor:null})).items.length,0);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.feture_posts'));await assert.rejects(db.query('select * from public.feture_post_operations'));await assert.rejects(op(a,{action:'posts.mine',cursor:null}));await assert.rejects(review(manager,{action:'queue',cursor:null}));await assert.rejects(db.query('select * from public.feture_post_reviews'));}
 }finally{await db.close();}
});
