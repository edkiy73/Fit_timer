import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {validateEntry}=require('../lib/feture/catalog-admin');
const read=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
test('W01 drafts are private, revision-locked, checked and never published',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  await db.exec(read('20261010_001_feture_domain.sql'));
  await db.exec(read('20261010090405_feture_scoped_seed.sql'));
  await db.exec(read('20261011060000_feture_catalog_editorial_drafts.sql'));
  const send=async c=>(await db.query('select public.feture_catalog_editorial_admin($1::jsonb) result',[JSON.stringify(c)])).rows[0].result;
  const entry={definition:'Вопрос для самостоятельного изучения.',synonyms:['самостоятельно'],relatedIds:['interest-1-2']};
  await db.exec('set role service_role');
  assert.deepEqual((await send({action:'list'})).drafts,[]);
  assert.deepEqual(validateEntry(entry),entry);
  assert.equal((await send({action:'save',interestId:'interest-1-1',entry,expectedRevision:0})).revision,1);
  assert.equal((await send({action:'save',interestId:'interest-1-1',entry:{...entry,definition:'Новая редакция'},expectedRevision:0})).error,'revision_conflict');
  const next={...entry,definition:'Новая редакция'};
  assert.equal((await send({action:'save',interestId:'interest-1-1',entry:next,expectedRevision:1})).revision,2);
  assert.deepEqual((await send({action:'list'})).drafts,[{interestId:'interest-1-1',entry:next,revision:2}]);
  for(const bad of [
   {...entry,definition:'<script>'},{...entry,synonyms:['дубль','дубль']},
   {...entry,relatedIds:['interest-1-1']},{...entry,relatedIds:['missing']},
   {...entry,extra:'fake'}, {...entry,synonyms:[]}
  ]){
   assert.throws(()=>validateEntry(bad));
   assert.equal((await send({action:'save',interestId:'interest-1-1',entry:bad,expectedRevision:2})).error,'invalid_request');
  }
  assert.equal((await send({action:'save',interestId:'interest-999-999',entry,expectedRevision:0})).error,'invalid_request');
  assert.equal((await send({action:'save',interestId:'interest-1-1',entry,expectedRevision:2,owner:'x'})).error,'invalid_request');
  assert.equal((await db.query('select count(*)::int n from public.feture_catalog_topic_drafts')).rows[0].n,1);
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_catalog_topic_drafts'),/permission denied/);
   await assert.rejects(send({action:'list'}),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
});
