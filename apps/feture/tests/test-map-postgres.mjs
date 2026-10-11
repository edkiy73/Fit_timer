import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const file=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('W05: owner-scoped reviewed private map import, CAS, retry and tombstones',async()=>{
 const db=new PGlite(),alice='a'.repeat(32),bob='b'.repeat(32);
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const name of ['20261010_001_feture_domain.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261011043127_feture_questionnaires.sql','20261011045829_feture_questionnaires_release.sql','20261011054100_feture_test_map_apply.sql'])await db.exec(file(name));
  const rpc=async(name,...args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args.map(v=>typeof v==='object'?JSON.stringify(v):v))).rows[0].result;
  const run=(owner,c)=>rpc('feture_test_command',owner,c);
  const apply=async(owner,attempt,op,ids)=>(await db.query("select public.feture_test_map_apply($1::text,$2::uuid,$3::uuid,string_to_array($4::text, ',')) result",[owner,attempt,op,ids.join(',')])).rows[0].result;
  await db.exec('set role service_role');
  const draft=(await run(alice,{action:'tests.start',testId:'dynamics',operationId:uid(1)})).attempt;
  const answers=Object.fromEntries(draft.version.definition.questions.map(q=>[q.id,null]));
  const done=(await run(alice,{action:'tests.complete',attemptId:draft.id,expectedRevision:1,operationId:uid(2),answers,position:7})).attempt;
  assert.equal(done.result.answered,0); // Even skipped answers are never interpreted as desire.
  const topics=['interest-1-4','interest-1-11'];
  assert.equal((await apply(bob,done.id,uid(3),topics)).error,'resource_not_found');
  assert.equal((await apply(alice,draft.id,uid(3),['interest-2-2'])).error,'invalid_request');
  const first=await apply(alice,draft.id,uid(3),topics);
  assert.equal(first.ok,true);assert.equal(first.replayed,false);
  assert.deepEqual(first.interestIds,[...topics].sort());
  const state=(await db.query('select stance,experience,boundary,visibility,use_for_discovery,source,test_version from public.feture_interest_states where account_hash=$1 and interest_id=$2',[alice,topics[0]])).rows[0];
  assert.deepEqual([state.stance,state.experience,state.boundary,state.visibility,state.use_for_discovery,state.source,state.test_version],['curious','unspecified','none','private',false,'test',done.version.id]);
  assert.equal((await apply(alice,draft.id,uid(3),topics.slice().reverse())).replayed,true);
  assert.equal((await apply(alice,draft.id,uid(3),[topics[0]])).error,'operation_conflict');
  assert.equal((await apply(alice,draft.id,uid(4),[topics[0]])).error,'revision_conflict');
  assert.equal((await apply(alice,draft.id,uid(5),['interest-1-4','interest-1-4'])).error,'invalid_request');
  assert.equal((await apply(alice,draft.id,uid(6),['interest-1-12'])).ok,true);
  assert.equal((await db.query('select count(*)::int n from public.feture_interest_states where account_hash=$1',[alice])).rows[0].n,3);
  const third=await rpc('feture_interest_mutate',alice,uid(7),'interest-1-12',1,'delete',null);
  assert.equal(third.ok,true);assert.equal(third.entry.deleted,true);
  assert.equal((await apply(alice,draft.id,uid(8),['interest-1-12'])).error,'revision_conflict');
  await run(alice,{action:'tests.delete',attemptId:draft.id,expectedRevision:2,operationId:uid(9)});
  assert.equal((await apply(alice,draft.id,uid(3),topics)).error,'resource_not_found');
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_test_map_receipts'),/permission denied/);
   await assert.rejects(apply(alice,draft.id,uid(10),['interest-1-11']),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
});
