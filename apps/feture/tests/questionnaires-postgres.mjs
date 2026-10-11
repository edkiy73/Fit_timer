import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {definition,testsCommand,createTestsRepository}=require('../lib/feture/questionnaires');
const {authenticate}=require('../lib/feture/identity');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const make=()=>({id:'contract-test',title:'Близость',description:'Личное исследование без диагноза.',dimensions:[{id:'connection',title:'Связь',low:'Нужно пространство.',mid:'Важен баланс.',high:'Хочется близости.'}],questions:Array.from({length:6},(_,i)=>({id:'q'+i,prompt:'Вопрос '+i,dimension:'connection',kind:i===0?'multi':i===1?'single':'scale',options:Array.from({length:5},(_,n)=>({id:'o'+n,label:'Ответ '+n,score:n}))}))});
test('questionnaires: version pinning, private attempts, authoritative scoring, CAS/replay, erasure and denied roles',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['20261010_001_feture_domain.sql','20261010090405_feture_scoped_seed.sql','20261011043127_feture_questionnaires.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const rpc=async(name,...args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args.map(v=>typeof v==='object'?JSON.stringify(v):v))).rows[0].result;
  const admin=c=>rpc('feture_test_admin',c),alice='a'.repeat(32),bob='b'.repeat(32),run=(owner,c)=>rpc('feture_test_command',owner,c);
  const seeds=JSON.parse(readFileSync(new URL('../data/questionnaires.json',import.meta.url),'utf8'));
  for(const seed of seeds){definition(seed);assert.equal(await rpc('feture_test_definition_valid',seed),true);for(const choice of [0,4,null]){const answers=Object.fromEntries(seed.questions.map(q=>[q.id,choice===null?null:[q.options[choice].id]]));const score=await rpc('feture_test_score',seed,answers);assert.equal(score.answered,choice===null?0:8);for(const dim of score.dimensions){assert.equal(dim.average,choice);assert.equal(dim.level,choice===null?'insufficient':choice===0?'low':'high');}}}
  await db.exec(readFileSync(new URL('../supabase/migrations/20261011045829_feture_questionnaires_release.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('select count(*)::int n from public.feture_test_versions')).rows[0].n,6);
  await db.exec('set role service_role');
  for(const [index,seed] of seeds.entries()){
   const v=(await run(alice,{action:'tests.start',testId:seed.id,operationId:id(1000+index)})).attempt;
   assert.deepEqual(v.version.definition,seed);
   const all=Object.fromEntries(seed.questions.map(q=>[q.id,[q.options[4].id]]));
   const completed=(await run(alice,{action:'tests.complete',attemptId:v.id,operationId:id(1100+index),expectedRevision:1,answers:all,position:7})).attempt;
   assert.equal(completed.result.answered,8);assert.equal(completed.result.dimensions.every(d=>d.level==='high'),true);
   await run(alice,{action:'tests.delete',attemptId:v.id,operationId:id(1200+index),expectedRevision:2});
   await admin({action:'feture.tests.retire',testId:seed.id,revision:v.version.revision});
  }
  await db.exec('reset role');
  const def=make();assert.deepEqual(definition(def),def);
  for(const bad of [{...def,formula:'eval'}, {...def,dimensions:[{...def.dimensions[0],high:''}]},{...def,questions:def.questions.map((q,i)=>i===1?{...q,dimension:null}:q)},{...def,questions:def.questions.map((q,i)=>i===1?{...q,options:[{id:'a',label:'A',score:-1},{id:'b',label:'B',score:5}]}:q)}]){assert.throws(()=>definition(bad));assert.equal((await rpc('feture_test_definition_valid',bad)),false);}
  assert.throws(()=>testsCommand({action:'tests.start',testId:'closeness',operationId:id(1),owner:bob}));
  assert.throws(()=>testsCommand({action:'tests.complete',attemptId:id(1),operationId:id(2),expectedRevision:1,answers:{},position:0,score:100}));
  await db.exec('set role service_role');
  assert.equal((await admin({action:'feture.tests.save',definition:def,expectedRevision:0})).revision,1);
  assert.equal((await admin({action:'feture.tests.publish',testId:def.id,revision:1,reviewed:false})).error,'review_required');
  assert.equal((await run(alice,{action:'tests.list'})).versions.length,0);
  const v1=(await admin({action:'feture.tests.publish',testId:def.id,revision:1,reviewed:true})).version;
  assert.equal((await admin({action:'feture.tests.publish',testId:def.id,revision:1,reviewed:true})).version.id,v1.id);
  const start={action:'tests.start',testId:def.id,operationId:id(1)};
  const first=(await run(alice,start)).attempt;assert.equal(first.version.id,v1.id);
  assert.equal((await run(alice,start)).attempt.id,first.id);
  const renamed={...def,title:'Новая редакция',questions:def.questions.map(q=>({...q,prompt:q.prompt+' новая редакция'}))};
  await admin({action:'feture.tests.save',definition:renamed,expectedRevision:1});
  const v2=(await admin({action:'feture.tests.publish',testId:def.id,revision:2,reviewed:true})).version;
  assert.notEqual(v2.id,v1.id);assert.equal((await run(alice,{...start,operationId:id(2)})).attempt.version.id,v1.id);
  const second=(await run(bob,start)).attempt;assert.equal(second.version.id,v2.id);
  assert.equal((await run(bob,{action:'tests.read',attemptId:first.id})).error,'resource_not_found');
  assert.equal((await run(bob,{action:'tests.list'})).attempts.length,1);
  const base={action:'tests.save',attemptId:first.id,operationId:id(3),expectedRevision:1,answers:{q0:['o0','o4'],q1:null},position:1};
  const saved=await run(alice,base);assert.equal(saved.attempt.revision,2);assert.equal(saved.attempt.version.definition.title,'Близость');
  assert.equal((await run(alice,base)).replayed,true);
  assert.equal((await run(alice,{...base,position:0})).error,'operation_conflict');
  assert.equal((await run(alice,{...base,operationId:id(4),answers:{q0:['o4']}})).error,'revision_conflict');
  assert.equal((await run(bob,{...base,expectedRevision:2})).error,'resource_not_found');
  for(const answers of [{q1:['o1','o2']},{q2:['unknown']},{q0:['o1','o1']},{other:null},{q1:false}])assert.equal((await run(alice,{...base,operationId:id(5),expectedRevision:2,answers})).error,'invalid_request');
  assert.equal((await run(alice,{...base,action:'tests.complete',operationId:id(6),expectedRevision:2})).error,'answers_incomplete');
  const answers={q0:['o0','o4'],q1:null,q2:['o4'],q3:['o4'],q4:null,q5:['o2']};
  const complete={...base,action:'tests.complete',operationId:id(7),expectedRevision:2,answers,position:5};
  const done=(await run(alice,complete)).attempt;assert.equal(done.status,'completed');assert.equal(done.result.answered,4);assert.equal(done.result.dimensions[0].average,3);assert.equal(done.result.dimensions[0].level,'high');assert.deepEqual(done.result.dimensions[0].questionIds,['q0','q2','q3','q5']);
  assert.equal((await run(alice,complete)).replayed,true);
  assert.equal((await run(alice,{...complete,operationId:id(8),expectedRevision:3})).error,'attempt_completed');
  const retake=(await run(alice,{...start,operationId:id(9)})).attempt;assert.notEqual(retake.id,done.id);assert.equal(retake.version.id,v2.id);
  const skipped=Object.fromEntries(def.questions.map(q=>[q.id,null]));
  const empty=(await run(alice,{action:'tests.complete',attemptId:retake.id,operationId:id(10),expectedRevision:1,answers:skipped,position:5})).attempt;
  assert.equal(empty.result.answered,0);assert.equal(empty.result.dimensions[0].average,null);assert.equal(empty.result.dimensions[0].level,'insufficient');
  const del={action:'tests.delete',attemptId:done.id,operationId:id(11),expectedRevision:3};assert.equal((await run(alice,del)).deleted,true);assert.equal((await run(alice,del)).deleted,true);
  assert.equal((await run(alice,complete)).error,'resource_not_found');assert.equal((await run(alice,start)).error,'resource_not_found');
  assert.equal((await run(alice,{action:'tests.read',attemptId:done.id})).error,'resource_not_found');
  assert.equal((await db.query('select answers,result from public.feture_test_attempts where id=$1',[done.id])).rows[0].result,null);
  await assert.rejects(db.query("update public.feture_test_versions set definition=definition"),/permission denied/);
  await admin({action:'feture.tests.retire',testId:def.id,revision:2});assert.equal((await run(alice,{action:'tests.list'})).versions.length,0);
  assert.equal((await run(bob,{action:'tests.read',attemptId:second.id})).attempt.version.id,v2.id);
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.feture_test_attempts'),/permission denied/);await assert.rejects(run(alice,{action:'tests.list'}),/permission denied/);await assert.rejects(admin({action:'feture.tests.list'}),/permission denied/);await db.exec('reset role');}
  let calls=0;const repository=createTestsRepository({configured:()=>true,request:async()=>{calls++;return new Response('{}');}},{requireCurrent:async()=>{},status:async()=>{},accept:async()=>{}});
  await assert.rejects(repository.execute({accountHash:alice,verifiedAdult:true},{action:'tests.list'}),e=>e.status===401);assert.equal(calls,0);
  const sha=s=>createHash('sha256').update(s).digest('hex'),email='owner@example.com',device='device',token='token',hash=sha(email).slice(0,32);
  const actor=await authenticate({headers:{'x-fit-email':email,'x-fit-token':token,'x-fit-device':device}},{configured:()=>true,get:async key=>key==='a:'+hash?JSON.stringify({email,syncDevices:{[device]:{h:sha(token),at:new Date().toISOString()}}}):null});
  await assert.rejects(repository.execute(actor,{action:'tests.list'}),e=>e.status===403);assert.equal(calls,0);
  const erase=createTestsRepository({configured:()=>true,request:async()=>new Response(JSON.stringify({ok:true,deleted:true,account_hash:bob,secret:'hidden'}))},{requireCurrent:async()=>{throw Error('must not gate erasure');}});
  assert.deepEqual(await erase.execute(actor,{action:'tests.delete',attemptId:id(100),operationId:id(101),expectedRevision:1}),{deleted:true});
  await db.query('delete from public.feture_profiles where account_hash=$1',[alice]);assert.equal((await db.query('select count(*)::int n from public.feture_test_operations where account_hash=$1',[alice])).rows[0].n,0);
 }finally{await db.close();}
});
