import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('C01 posts: draft/pending isolation, reviewed feed ACL, CAS, retries and irreversible text removal',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql','20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql','20261010233014_feture_moderation.sql','20261011133134_feture_community_posts.sql'])await db.exec(sql(file));
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
 // Reviewer transition is deliberately a DB fixture: no client has a publish command.
 await db.query("update public.feture_posts set state='published',published_at=clock_timestamp(),revision=revision+1 where id=$1",[id(10)]);
 const feed=await op(b,{action:'posts.feed',cursor:null});assert.equal(feed.items.length,1);assert.equal(feed.items[0].mine,false);
 for(const secret of ['author_hash','account_hash','email','nickname','boundary','granted'])assert.equal(JSON.stringify(feed).includes(secret),false);
 await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[c,a]);
 assert.equal((await op(c,{action:'posts.feed',cursor:null})).items.length,0);assert.equal((await op(c,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[b]);assert.equal((await op(b,{action:'posts.feed',cursor:null})).error,'resource_not_found');
 const edit={...create,operationId:id(15),expectedRevision:3,text:'Исправленный текст'};assert.equal((await op(a,edit)).entry.state,'draft');assert.equal((await op(c,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 assert.equal((await op(a,{...edit,text:'другой повтор'})).error,'operation_conflict');
 const remove={action:'posts.delete',id:id(10),operationId:id(16),expectedRevision:4};await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[a]);
 const deleted=await op(a,remove);assert.equal(deleted.entry.state,'deleted');assert.equal(deleted.entry.text,'');assert.equal(deleted.entry.authorLabel,'');assert.equal((await op(a,remove)).replayed,true);assert.equal((await op(a,create)).entry.state,'deleted');assert.equal((await op(a,submit)).entry.state,'deleted');
 assert.equal((await op(a,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 assert.equal((await op(a,{action:'posts.mine',cursor:null})).items.length,0);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.feture_posts'));await assert.rejects(db.query('select * from public.feture_post_operations'));await assert.rejects(op(a,{action:'posts.mine',cursor:null}));}
 }finally{await db.close();}
});
