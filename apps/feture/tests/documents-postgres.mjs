import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {authenticate}=require('../lib/feture/identity');
const {createDocumentsRepository,blocks}=require('../lib/feture/documents');
const {command}=require('../lib/feture/validation');
test('documents: reviewed immutable publication, exact-version own consent, future policy, client isolation and stale drafts',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010225653_feture_documents.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  const body=[{type:'paragraph',text:'<script>alert("escaped text")</script>'}];
  const save=(key,revision=0,content=body,required=true)=>rpc('feture_document_save',[key,'ru',revision,key,JSON.stringify(content),required]);
  const publish=(key,revision=1,reviewed=true,date=new Date().toISOString())=>rpc('feture_document_publish',[key,'ru',revision,reviewed,date]);
  const transport={configured:()=>true,request:async(path,options)=>{
   const b=JSON.parse(options.body);const args=Object.values(b).map(v=>Array.isArray(v)&&!path.endsWith('feture_consent_accept')?JSON.stringify(v):v);
   return new Response(JSON.stringify(await rpc(path.split('/rpc/')[1],args)));
  }};
  const documents=createDocumentsRepository(transport);
  const actors=[];
  for(const name of ['alice','bob','third']){
   const email=name+'@example.com',token=name+'-secret-device-token',sha=v=>createHash('sha256').update(v).digest('hex');
   actors.push(await authenticate({headers:{'x-fit-email':email,'x-fit-device':name,'x-fit-token':token}},{configured:()=>true,get:async key=>key==='a:'+sha(email).slice(0,32)?JSON.stringify({email,syncDevices:{[name]:{h:sha(token),at:new Date().toISOString()}}}):null}));
  }
  assert.equal((await documents.status(actors[0],'ru')).ready,false);
  await assert.rejects(documents.requireCurrent(actors[0]),e=>e.code==='consent_required');
  const versions=[];
  for(const key of ['terms','privacy','community','adult-content']){
   assert.equal((await save(key,0,body,false)).error,'invalid_request');
   assert.equal((await save(key)).ok,true);
   assert.equal((await save(key)).error,'revision_conflict');
   assert.equal((await publish(key,1,false)).error,'review_required');
   assert.equal((await publish(key,2)).error,'revision_conflict');
   const first=(await publish(key)).document;versions.push(first);
   assert.equal((await publish(key,1,true,'2000-01-01T00:00:00Z')).document.id,first.id); // lost response retry
  }
  assert.equal((await documents.status(actors[0],'ru')).ready,true);
  assert.equal((await documents.accept(actors[0],'ru',versions.slice(0,3).map(v=>v.id))).accepted,false);
  assert.equal((await documents.accept(actors[0],'ru',versions.map(v=>v.id))).accepted,true);
  await documents.requireCurrent(actors[0]);
  for(const actor of actors.slice(1))assert.equal((await documents.status(actor,'ru')).accepted,false);
  const before=(await db.query('select * from public.feture_consent_receipts where account_hash=$1 order by document_id',[actors[0].accountHash])).rows;
  await documents.accept(actors[0],'ru',versions.map(v=>v.id));
  assert.deepEqual((await db.query('select * from public.feture_consent_receipts where account_hash=$1 order by document_id',[actors[0].accountHash])).rows,before);
  assert.equal(before[0].content_hash,versions.find(v=>v.id===before[0].document_id).content_hash);
  await assert.rejects(db.query('update public.feture_document_versions set title=$1 where id=$2',['rewritten',versions[0].id]),/immutable/);
  await assert.rejects(db.query('delete from public.feture_document_versions where id=$1',[versions[0].id]),/immutable/);
  await assert.rejects(db.query('update public.feture_consent_receipts set accepted_at=clock_timestamp()'),/immutable/);
  await save('terms',1,[{type:'paragraph',text:'New exact policy'}]);
  const future=(await publish('terms',2,true,new Date(Date.now()+60000).toISOString())).document;
  assert.equal((await documents.status(actors[0],'ru')).accepted,true);
  assert.equal((await rpc('feture_consent_accept',[actors[0].accountHash,'ru',[future.id]])).error,'document_changed');
  await save('terms',2,[{type:'paragraph',text:'Immediate replacement'}]);
  const next=(await publish('terms',3)).document;
  await assert.rejects(documents.requireCurrent(actors[0]),e=>e.code==='consent_required');
  await assert.rejects(documents.accept(actors[0],'ru',[versions[0].id]),e=>e.code==='document_changed');
  assert.equal((await documents.accept(actors[0],'ru',[next.id])).accepted,true);
  assert.equal((await rpc('feture_document_save',['privacy','ru',1,'Title',JSON.stringify([{type:'html',text:'bad'}]),true])).error,'invalid_request');
  assert.throws(()=>blocks([{type:'paragraph',text:'Text',html:'bad'}]));
  assert.equal(blocks(body)[0].text,body[0].text); // rendered as text by React
  assert.throws(()=>command({action:'documents.accept',locale:'ru',documentIds:[next.id],owner:actors[1].accountHash}));
  await assert.rejects(documents.status({accountHash:actors[0].accountHash,verifiedAdult:true},'ru'),e=>e.status===401);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   assert.equal((await db.query('select * from public.feture_document_current')).rows.length,4);
   await assert.rejects(db.query('select * from public.feture_document_drafts'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_consent_receipts'),/permission denied/);
   await assert.rejects(rpc('feture_consent_accept',[actors[1].accountHash,'ru',[next.id]]),/permission denied/);
   await db.exec('reset role');
  }
  await db.query('delete from public.feture_profiles where account_hash=$1',[actors[0].accountHash]);
  assert.equal((await db.query('select count(*)::int n from public.feture_consent_receipts')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.feture_document_versions')).rows[0].n,6);
 }finally{await db.close();}
});
