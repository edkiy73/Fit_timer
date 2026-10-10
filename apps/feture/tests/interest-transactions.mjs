import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {interestState}=require('../lib/feture/interest-model');
const {command}=require('../lib/feture/validation');
const migration=readFileSync(new URL('../supabase/migrations/20261010164924_feture_interest_transactions.sql',import.meta.url),'utf8');
const owner='a'.repeat(32),other='b'.repeat(32),id='interest-1-1';
const op=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const wanted={stance:'want_to_try',experience:'tried',boundary:'none',intensity:3};

test('interest transactions: independent fields, revision races, retries, tombstones and denied client roles',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.query('insert into public.feture_profiles(account_hash) values($1)',[owner]);
  await db.query("insert into public.feture_interest_states(account_hash,interest_id,status) values($1,$2,'experienced')",[owner,id]);
  await assert.rejects(db.exec('begin;'+migration+'commit;'),/reset_requires_review/);
  await db.exec('rollback');
  assert.equal((await db.query('select status from public.feture_interest_states')).rows[0].status,'experienced');
  await db.exec('delete from public.feture_interest_states');
  await db.exec("update feture_seed.environment set stage='live'");
  await assert.rejects(db.exec('begin;'+migration+'commit;'),/prelaunch_required/);await db.exec('rollback');
  await db.exec("update feture_seed.environment set stage='prelaunch'");
  await db.exec('begin;'+migration+'commit;');
  const call=async(n,expected,state=wanted,kind='set',account=owner,interest=id)=>(await db.query('select public.feture_interest_mutate($1,$2::uuid,$3,$4::bigint,$5,$6::jsonb) result',[account,op(n),interest,expected,kind,state===null?null:JSON.stringify(state)])).rows[0].result;
  const normal=interestState(wanted);assert.equal(normal.visibility,'private');assert.equal(normal.useForDiscovery,false);
  let result=await call(1,0);assert.equal(result.ok,true);assert.equal(result.entry.revision,1);assert.equal(result.entry.experience,'tried');assert.equal(result.entry.stance,'want_to_try');
  assert.equal(result.entry.visibility,'private');assert.equal(result.entry.use_for_discovery,false);assert.equal(result.entry.source,'manual');
  const retry=await call(1,0);assert.equal(retry.replayed,true);assert.equal(retry.appliedRevision,1);assert.equal(retry.appliedAt,result.appliedAt);
  assert.equal((await call(1,0,{...wanted,intensity:4})).error,'operation_conflict');
  assert.equal((await call(2,0)).error,'revision_conflict');
  const hard={stance:'not_interested',experience:'ongoing',boundary:'hard',intensity:null};
  const raced=await Promise.all([call(3,1,hard),call(4,1,{...wanted,intensity:5})]);
  assert.equal(raced.filter(r=>r.ok).length,1);assert.equal(raced.filter(r=>r.error==='revision_conflict').length,1);
  result=await call(5,2,hard);assert.equal(result.entry.experience,'ongoing');assert.equal(result.entry.boundary,'hard');assert.equal(result.entry.intensity,null);
  assert.equal((await call(6,3,null,'delete')).entry.deleted,true);
  const old=await call(1,0);assert.equal(old.replayed,true);assert.equal(old.appliedRevision,1);assert.equal(old.entry.revision,4);assert.equal(old.entry.deleted,true);assert.equal(old.entry.boundary_note,null);assert.equal(old.entry.intensity,null);
  assert.equal((await call(7,1)).error,'revision_conflict'); // old queue cannot revive a deleted entry
  assert.equal((await call(7,4)).entry.revision,5); // deliberate edit at the tombstone revision may restore it
  assert.equal((await call(1,0,wanted,'set',other)).entry.revision,1); // operation IDs are owner-scoped
  assert.equal((await call(8,0,wanted,'set',owner,'interest-999-999')).error,'interest_not_found');
  const bad=[{...wanted,intensity:100},{...wanted,boundary:'hard'},{...wanted,stance:'unknown'}, {...wanted,boundaryNote:'private conditions'}, {...wanted,useForDiscovery:'true'}, {...wanted,revision:9}, {...wanted,source:'test'}, {...wanted,experience:'experienced'},[],null];
  for(const state of bad){assert.throws(()=>interestState(state));assert.equal((await call(20,5,state)).error,'invalid_request');}
  const row=(await db.query('select * from public.feture_interest_states where account_hash=$1',[owner])).rows[0];assert.equal(row.revision,5);
  await assert.rejects(db.query('update public.feture_interest_states set intensity=100 where account_hash=$1',[owner]),/check constraint/);
  await assert.rejects(db.query("update public.feture_interest_states set boundary='hard' where account_hash=$1",[owner]),/check constraint/);
  const receipt=(await db.query('select * from public.feture_interest_operations limit 1')).rows[0];
  assert.deepEqual(Object.keys(receipt).sort(),['account_hash','operation_id','interest_id','request_hash','applied_revision','applied_at'].sort());
  for(const role of ['anon','authenticated']) {
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_interest_states'),/permission denied/);
   await assert.rejects(call(1,0),/permission denied/);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');assert.equal((await call(99,0,wanted,'set',other,'interest-1-2')).ok,true);await db.exec('reset role');
  for(const patch of [{accountHash:other},{verifiedAdult:true},{source:'test'},{expectedRevision:-1},{operationId:'not-uuid'},{state:{...wanted,updatedAt:'client clock'}}])assert.throws(()=>command({action:'interests.set',interestId:id,operationId:op(99),expectedRevision:0,state:wanted,...patch}));
 } finally {await db.close();}
});
