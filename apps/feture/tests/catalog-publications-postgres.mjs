import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {publishedRelease}=require('../lib/feture/catalog-public');
const load=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');

test('W01.2 immutable reviewed catalog publications, strict ownership and no draft disclosure',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const name of ['20261010_001_feture_domain.sql','20261010090405_feture_scoped_seed.sql','20261011060000_feture_catalog_editorial_drafts.sql','20261011062357_feture_catalog_publications.sql'])await db.exec(load(name));
  const draft=async command=>(await db.query('select public.feture_catalog_editorial_admin($1::jsonb) result',[JSON.stringify(command)])).rows[0].result;
  const publish=async command=>(await db.query('select public.feture_catalog_publish($1::jsonb) result',[JSON.stringify(command)])).rows[0].result;
  const first={interestId:'interest-1-1',entry:{definition:'Уважение и согласование важных решений.',synonyms:['инициатива'],relatedIds:['interest-1-2']},expectedRevision:0,action:'save'};
  await db.exec('set role service_role');
  assert.equal((await publish({action:'status'})).version,1);
  assert.equal((await publish({action:'publish',expectedVersion:1,reviewed:true,selected:[{interestId:first.interestId,revision:1}]})).error,'revision_conflict');
  assert.equal((await draft(first)).revision,1);
  assert.equal((await publish({action:'publish',expectedVersion:1,reviewed:false,selected:[{interestId:first.interestId,revision:1}]})).error,'invalid_request');
  assert.equal((await publish({action:'publish',expectedVersion:1,reviewed:true,selected:[{interestId:first.interestId,revision:2}]})).error,'revision_conflict');
  const p={action:'publish',expectedVersion:1,reviewed:true,selected:[{interestId:first.interestId,revision:1}]};
  assert.equal((await publish(p)).version,2);
  assert.equal((await publish(p)).error,'revision_conflict');
  const existing=(await db.query('select entries from public.feture_catalog_publications where version=2')).rows[0].entries;
  assert.equal(existing['interest-1-1'].definition,first.entry.definition);
  const second={action:'save',interestId:'interest-1-2',entry:{definition:'Только добровольное принятие предложений.',synonyms:['принимающая роль'],relatedIds:[]},expectedRevision:0};
  assert.equal((await draft(second)).revision,1);
  assert.equal((await publish({action:'publish',expectedVersion:2,reviewed:true,selected:[{interestId:second.interestId,revision:1},{interestId:second.interestId,revision:1}]})).error,'invalid_request');
  assert.equal((await publish({action:'publish',expectedVersion:2,reviewed:true,selected:[{interestId:second.interestId,revision:1}]})).version,3);
  const final=(await db.query('select version,entries from public.feture_catalog_publications order by version desc limit 1')).rows[0];
  assert.equal(final.version,3);
  assert.equal(Object.keys(final.entries).length,2);
  assert.equal(final.entries['interest-1-1'].definition,existing['interest-1-1'].definition);
  await assert.rejects(db.query("update public.feture_catalog_publications set entries='{}'::jsonb where version=2"),/permission denied/);
  await db.exec('reset role');
  await db.exec('set role anon');
  assert.equal((await db.query('select count(*)::int n from public.feture_catalog_publications')).rows[0].n,2);
  await assert.rejects(db.query('select * from public.feture_catalog_topic_drafts'),/permission denied/);
  await assert.rejects(publish({action:'status'}),/permission denied/);
  await assert.rejects(db.query("insert into public.feture_catalog_publications(version,entries,changed_ids) values(4,'{}',array['interest-1-1'])"),/permission denied/);
  await db.exec('reset role');
  assert.equal(publishedRelease(null,new Set(['interest-1-1'])).version,1);
  const safe=publishedRelease({version:3,entries:final.entries},new Set(['interest-1-1','interest-1-2']));
  assert.equal(safe.entries['interest-1-1'].definition,first.entry.definition);
  for(const value of [{version:3,entries:{private:{definition:'secret',synonyms:['key'],relatedIds:[]}}},{version:3,entries:{'interest-1-1':{definition:'<bad>',synonyms:['word'],relatedIds:[]}}}])
    assert.throws(()=>publishedRelease(value,new Set(['interest-1-1','interest-1-2'])));
 }finally{await db.close();}
});
