import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {journalCommand,createJournalRepository}=require('../lib/feture/journal');
const {authenticate}=require('../lib/feture/identity');
const {createHash}=require('node:crypto');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sha=x=>createHash('sha256').update(x).digest('hex');
test('journal/history: owner isolation, CAS/retry, tombstones, clear retry and locked client roles',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261011043516_feture_private_journal.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const alice='a'.repeat(32),bob='b'.repeat(32);
  const rpc=async(owner,c)=>(await db.query('select public.feture_journal_command($1,$2::jsonb) result',[owner,JSON.stringify(c)])).rows[0].result;
  const save=(owner,entry,op,expected,text='Моя мысль\nПродолжение')=>rpc(owner,{action:'journal.save',id:id(entry),operationId:id(op),expectedRevision:expected,title:'Запись',text,topicId:'interest-1-1'});
  for(const c of [{action:'journal.list',cursor:null,owner:bob},{action:'journal.save',id:id(1),operationId:id(2),expectedRevision:0,title:'',text:'hi',topicId:null,public:true},{action:'journal.list',cursor:{at:'2026-10-11T00:00:00Z',id:'bad'}},{action:'journal.save',id:id(1),operationId:id(2),expectedRevision:0,title:'',text:'\t',topicId:null}])assert.throws(()=>journalCommand(c));
  await db.exec('set role service_role');
  const first=await save(alice,1,2,0);assert.equal(first.ok,true);assert.equal(first.entry.revision,1);assert.equal(first.entry.topicId,'interest-1-1');assert.equal(Object.hasOwn(first.entry,'account_hash'),false);
  const repeat=await save(alice,1,2,0);assert.equal(repeat.replayed,true);assert.deepEqual(repeat.entry,first.entry);
  assert.equal((await save(alice,1,2,0,'changed')).error,'operation_conflict');
  const race=await Promise.all([save(alice,1,3,1,'Device one'),save(alice,1,4,1,'Device two')]);assert.equal(race.filter(r=>r.ok).length,1);assert.equal(race.filter(r=>r.error==='revision_conflict').length,1);
  const sameIdOther=await save(bob,1,2,0,'Bob private');assert.equal(sameIdOther.ok,true);assert.equal((await rpc(bob,{action:'journal.list',cursor:null})).items[0].text,'Bob private');
  assert.equal((await rpc(bob,{action:'journal.read',id:id(999)})).error,'resource_not_found');
  const deleted=await rpc(alice,{action:'journal.delete',id:id(1),operationId:id(5),expectedRevision:2});assert.equal(deleted.entry.deleted,true);assert.equal(deleted.entry.text,'');assert.equal(deleted.entry.topicId,null);
  const old=await save(alice,1,2,0);assert.equal(old.replayed,true);assert.equal(old.entry.deleted,true);assert.equal(old.entry.text,'');assert.equal((await save(alice,1,6,3)).error,'resource_not_found');
  assert.equal((await rpc(alice,{action:'journal.read',id:id(1)})).error,'resource_not_found');assert.equal((await rpc(alice,{action:'journal.list',cursor:null})).items.length,0);
  for(let n=10;n<43;n++)assert.equal((await save(alice,n,n+100,0,'Private '+n)).ok,true);
  const page=await rpc(alice,{action:'journal.list',cursor:null});assert.equal(page.items.length,30);assert.ok(page.nextCursor);
  const page2=await rpc(alice,{action:'journal.list',cursor:page.nextCursor});assert.equal(page2.items.length,3);assert.equal(page2.nextCursor,null);assert.equal(new Set([...page.items,...page2.items].map(e=>e.id)).size,33);
  const state={stance:'curious',experience:'none',boundary:'conditional',boundaryNote:'Приватные условия',intensity:3,visibility:'private',useForDiscovery:false};
  const interest=async(owner,op,rev,body)=> (await db.query("select public.feture_interest_mutate($1,$2::uuid,'interest-1-1',$3,'set',$4::jsonb) result",[owner,id(op),rev,JSON.stringify(body)])).rows[0].result;
  await interest(alice,300,0,state);await interest(alice,300,0,state);await interest(alice,301,1,{...state,intensity:4});await interest(bob,300,0,state);
  const hist=await rpc(alice,{action:'history.list',cursor:null});assert.equal(hist.items.length,2);assert.equal(hist.items[0].entry.boundary_note,'Приватные условия');assert.equal(Object.hasOwn(hist.items[0].entry,'account_hash'),false);
  const clear={action:'history.clear',operationId:id(302)};assert.equal((await rpc(alice,clear)).cleared,2);await interest(alice,303,2,{...state,intensity:5});const clearRepeat=await rpc(alice,clear);assert.equal(clearRepeat.replayed,true);assert.equal((await rpc(alice,{action:'history.list',cursor:null})).items.length,1);assert.equal((await rpc(bob,{action:'history.list',cursor:null})).items.length,1);
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const table of ['feture_journal_entries','feture_journal_operations','feture_interest_history'])await assert.rejects(db.query('select * from public.'+table),/permission denied/);await assert.rejects(rpc(alice,{action:'journal.list',cursor:null}),/permission denied/);await db.exec('reset role');}
  let calls=0;const repo=createJournalRepository({configured:()=>true,request:async()=>{calls++;return new Response('{}');}},{requireCurrent:async()=>{},status:async()=>{},accept:async()=>{}});
  await assert.rejects(repo.execute(Object.freeze({accountHash:alice,verifiedAdult:true}),{action:'journal.list',cursor:null}),e=>e.status===401);assert.equal(calls,0);
  const email='journal@example.com',hash=sha(email).slice(0,32),token='token',device='device';
  const actor=await authenticate({headers:{'x-fit-email':email,'x-fit-token':token,'x-fit-device':device}},{configured:()=>true,get:async key=>key==='a:'+hash?JSON.stringify({email,syncDevices:{[device]:{h:sha(token),at:new Date().toISOString()}}}):null});
  await assert.rejects(repo.execute(actor,{action:'journal.list',cursor:null}),e=>e.status===403);assert.equal(calls,0);
  await assert.rejects(repo.execute(actor,{action:'history.clear',operationId:id(800)}),e=>e.status===503);assert.equal(calls,1); // deletion allowed after age expiry, transport still mandatory
  const leakRepo=createJournalRepository({configured:()=>true,request:async()=>new Response(JSON.stringify({ok:true,replayed:false,entry:{...first.entry,id:id(800),account_hash:bob,secret:'never'}}))},{requireCurrent:async()=>{},status:async()=>{},accept:async()=>{}});
  const safe=await leakRepo.execute(actor,{action:'journal.delete',id:id(800),operationId:id(801),expectedRevision:1});assert.equal(Object.hasOwn(safe.entry,'account_hash'),false);assert.equal(Object.hasOwn(safe.entry,'secret'),false);
  await db.query('delete from public.feture_profiles where account_hash=$1',[alice]);
  assert.equal((await db.query('select count(*)::int n from public.feture_journal_entries where account_hash=$1',[alice])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from public.feture_interest_history where account_hash=$1',[alice])).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from public.feture_journal_entries where account_hash=$1',[bob])).rows[0].n,1);
 }finally{await db.close();}
});
