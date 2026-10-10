import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {profileData,profileCommand,createProfileRepository}=require('../lib/feture/profile');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('profile: private defaults, CAS, retry collision, account isolation, whitelisted fields and denied client roles',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010090405_feture_scoped_seed.sql','20261010230935_feture_private_profile.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const alice='a'.repeat(32),bob='b'.repeat(32),data={nickname:'Имя',about:'Абзац\nПродолжение',pronouns:'',identity:'',orientation:'',relationships:'',city:''};
  const save=async(owner,operation,revision,body=data)=>(await db.query('select public.feture_profile_save($1,$2::uuid,$3,$4::jsonb) result',[owner,operation,revision,JSON.stringify(body)])).rows[0].result;
  assert.deepEqual(profileData(data),data);
  for(const bad of [{...data,dob:'2000-01-01'},{...data,latitude:1},{...data,datingEnabled:true},{...data,identity:[]},{...data,nickname:'bad\t'}]){assert.throws(()=>profileData(bad));assert.equal((await save(alice,id(99),0,bad)).error,'invalid_request');}
  assert.throws(()=>profileData({...data,nickname:'bad\u0000'}));
  await assert.rejects(save(alice,id(99),0,{...data,nickname:'bad\u0000'}),/Unicode escape/);
  assert.throws(()=>profileCommand({action:'profile.save',operationId:id(1),expectedRevision:0,data,owner:bob}));
  await db.exec('set role service_role');
  const first=await save(alice,id(1),0);assert.equal(first.ok,true);assert.equal(first.profile.revision,1);assert.equal(first.profile.data.orientation,'');
  const retry=await save(alice,id(1),0);assert.equal(retry.replayed,true);assert.equal(retry.profile.updated_at,first.profile.updated_at);
  assert.equal((await save(alice,id(1),0,{...data,nickname:'Different payload'})).error,'operation_conflict');
  const races=await Promise.all([save(alice,id(2),1,{...data,nickname:'Device one'}),save(alice,id(3),1,{...data,nickname:'Device two'})]);
  assert.equal(races.filter(r=>r.ok).length,1);assert.equal(races.filter(r=>r.error==='revision_conflict').length,1);
  const oldRetry=await save(alice,id(1),0);assert.equal(oldRetry.appliedRevision,1);assert.equal(oldRetry.profile.revision,2);
  const other=await save(bob,id(1),0,{...data,nickname:'Other account'});assert.equal(other.ok,true);assert.notEqual(other.profile.profile_id,first.profile.profile_id);
  await db.exec('reset role');
  assert.equal((await db.query('select dating_enabled from public.feture_profiles where account_hash=$1',[alice])).rows[0].dating_enabled,false);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.feture_profile_details'),/permission denied/);await assert.rejects(save(alice,id(4),2),/permission denied/);await db.exec('reset role');}
  let calls=0;const repository=createProfileRepository({configured:()=>true,request:async()=>{calls++;return new Response('{}');}},{requireCurrent:async()=>{},status:async()=>{},accept:async()=>{}});
  await assert.rejects(repository.read({accountHash:alice,verifiedAdult:true}),e=>e.status===401);assert.equal(calls,0);
  await db.query('delete from public.feture_profiles where account_hash=$1',[alice]);
  assert.equal((await db.query('select count(*)::int n from public.feture_profile_details')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from public.feture_profile_operations')).rows[0].n,1);
 }finally{await db.close();}
});
