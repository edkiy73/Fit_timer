import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const draft={
 title:'Evening class',summary:'Small online group',description:'Education and discussion',
 conditions:'18+; consent required',format:'online',visibility:'private',
 startsAt:'2026-11-01T18:00:00+08:00',endsAt:'2026-11-01T20:00:00+08:00',
 timeZone:'Asia/Makassar',language:'ru',city:'',publicLocation:'',
 privateLocation:null,privateJoinUrl:'https://meet.example.org/secret-room',
 ticketUrl:'https://tickets.example.org/event',price:{amountMinor:250000,currency:'IDR'}
};
export async function runEventOwnersPostgres(){
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  await db.exec("create schema feture_seed;create table feture_seed.environment(singleton boolean,project_ref text,stage text);insert into feture_seed.environment values(true,'anrhayozrhrmiwexmbhw','prelaunch');");
  await db.exec('create table public.feture_profiles(account_hash text primary key,adult_allowed boolean not null default true);grant select,insert,update,delete on public.feture_profiles to service_role;');
  await db.exec("create function public.feture_peer_eligible(p text) returns boolean language sql stable security invoker as $$ select exists(select 1 from public.feture_profiles where account_hash=p and adult_allowed) $$;");
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013002000_feture_event_owner_drafts.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013002100_feture_event_submit_pending.sql',import.meta.url),'utf8'));
  await db.exec("create table public.fixture_staff_role(account_hash text primary key, generation text not null, role text not null); grant select,insert,update on public.fixture_staff_role to service_role;");
  await db.exec("create function public.feture_operator_bound_command(p_actor text,p_generation text,p_target_generation text,p_bootstrap boolean,p_command jsonb) returns jsonb language sql stable security invoker as $$ select jsonb_build_object('ok',true,'role',(select role from public.fixture_staff_role where account_hash=p_actor and generation=p_generation)) $$;");
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013002200_feture_event_staff_queue.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013002300_feture_event_staff_decisions.sql',import.meta.url),'utf8'))
  const a='a'.repeat(32),b='b'.repeat(32),guest='c'.repeat(32),manager='d'.repeat(32),qa='e'.repeat(32),auditor='f'.repeat(32),generation='1'.repeat(64);
  await db.query('insert into public.feture_profiles(account_hash) values ($1),($2),($3),($4),($5),($6)',[a,b,guest,manager,qa,auditor]);
  for(const [who,role] of [[manager,'manager'],[qa,'qa_operator'],[auditor,'auditor'],[a,'manager']])await db.query('insert into public.fixture_staff_role values ($1,$2,$3)',[who,generation,role]);
  await db.exec('set role service_role');
  const rpc=async(who,command)=>(await db.query('select public.'+(command.action==='events.submit'?'feture_event_submit_command':'feture_event_owner_command')+'($1,$2::jsonb) result',[who,JSON.stringify(command)])).rows[0].result;
  const cmd=(n,revision=0,content=draft)=>({action:'events.save',id:id(n),operationId:id(1000+n),expectedRevision:revision,draft:content});
  const first=await rpc(a,cmd(1));
  assert.equal(first.ok,true);
  assert.equal(first.entry.state,'draft');
  assert.equal(first.entry.revision,1);
  assert.equal(first.entry.draft.privateJoinUrl,draft.privateJoinUrl);
  assert.equal(JSON.stringify(first).includes(a),false);
  assert.equal((await rpc(a,cmd(1))).replayed,true);
  assert.deepEqual((await rpc(a,cmd(1))).entry,first.entry);
  const sameOpChanged={...cmd(1),draft:{...draft,title:'Changed'}};
  assert.equal((await rpc(a,sameOpChanged)).error,'operation_conflict');
  assert.equal((await rpc(b,{action:'events.read',id:id(1)})).error,'resource_not_found');
  assert.equal((await rpc(guest,{action:'events.read',id:id(1)})).error,'resource_not_found');
  assert.equal((await rpc(a,{action:'events.read',id:id(99)})).error,'resource_not_found');
  assert.equal((await rpc(b,cmd(1))).error,'resource_not_found');
  assert.equal((await rpc(a,{...cmd(2),ownerHash:b})).error,'invalid_request');
  assert.equal((await rpc(a,{...cmd(2),draft:{...draft,secretAttendees:[b]}})).error,'invalid_request');
  assert.equal((await rpc(a,{...cmd(2),draft:{...draft,ticketUrl:'javascript:alert(1)'}})).error,'invalid_request');
  assert.equal((await rpc(a,{...cmd(2),draft:{...draft,privateLocation:'Hidden address'}})).error,'invalid_request');
  assert.equal((await rpc(a,{action:'events.catalog',cursor:null})).error,'invalid_request');
  assert.equal((await rpc(a,{action:'events.submit',id:id(1),operationId:id(77),expectedRevision:0})).error,'invalid_request');
  const updated={...cmd(1,1,{...draft,title:'Private updated class'}),operationId:id(2001)};
  const second=await rpc(a,updated);
  assert.equal(second.entry.revision,2);
  assert.equal(second.entry.draft.title,'Private updated class');
  assert.equal((await rpc(a,updated)).entry.revision,2);
  assert.equal((await rpc(a,{...updated,operationId:id(2002),expectedRevision:1})).error,'revision_conflict');
  assert.equal((await rpc(a,cmd(1))).entry.revision,1); // first receipt immutable
  const current=(await rpc(a,{action:'events.read',id:id(1)})).entry;
  assert.equal(current.revision,2);
  assert.equal(JSON.stringify(current).includes(b),false);
  for(let n=2;n<=23;n++)assert.equal((await rpc(a,cmd(n))).ok,true);
  const page1=await rpc(a,{action:'events.mine',cursor:null});
  assert.equal(page1.items.length,20);
  assert.ok(page1.nextCursor);
  const page2=await rpc(a,{action:'events.mine',cursor:page1.nextCursor});
  assert.equal(page2.items.length,3);
  assert.equal(page2.nextCursor,null);
  assert.equal(new Set([...page1.items,...page2.items].map(x=>x.id)).size,23);
  assert.deepEqual((await rpc(b,{action:'events.mine',cursor:null})).items,[]);
  assert.equal((await rpc(a,{action:'events.mine',cursor:{...page1.nextCursor,ownerHash:b}})).error,'invalid_cursor');
  const submit={action:'events.submit',id:id(1),operationId:id(6001),expectedRevision:2};
  const submitted=await rpc(a,submit);
  assert.equal(submitted.ok,true);
  assert.equal(submitted.entry.state,'pending');
  assert.equal(submitted.entry.revision,3);
  assert.equal((await rpc(a,submit)).replayed,true);
  assert.deepEqual((await rpc(a,submit)).entry,submitted.entry);
  assert.equal((await rpc(a,{...submit,operationId:id(6002),expectedRevision:2})).error,'revision_conflict');
  assert.equal((await rpc(a,{...submit,id:id(2),operationId:id(6001)})).error,'operation_conflict');
  assert.equal((await rpc(b,submit)).error,'resource_not_found');
  assert.equal((await rpc(b,{action:'events.read',id:id(1)})).error,'resource_not_found');
  assert.equal((await rpc(a,{action:'events.read',id:id(1)})).entry.state,'pending');
  assert.equal((await rpc(a,{...cmd(1,3),operationId:id(7001)})).error,'revision_conflict');
  const stillPrivate=await rpc(a,{action:'events.mine',cursor:null});
  const followingPrivate=stillPrivate.nextCursor?await rpc(a,{action:'events.mine',cursor:stillPrivate.nextCursor}):{items:[]};
  assert.ok([...stillPrivate.items,...followingPrivate.items].some(x=>x.id===id(1)&&x.state==='pending'));
  assert.equal((await rpc(a,{action:'events.catalog',cursor:null})).error,'invalid_request');
  const empty={...draft,description:'',conditions:''};
  assert.equal((await rpc(a,{...cmd(2,1,empty),operationId:id(8001)})).ok,true);
  assert.equal((await rpc(a,{action:'events.submit',id:id(2),operationId:id(8002),expectedRevision:2})).error,'invalid_request');
  
  const staffRpc=async(who,gen=generation,cursor=null)=>(await db.query('select public.feture_event_staff_queue($1,$2,$3::jsonb) result',[who,gen,JSON.stringify({action:'queue',cursor})])).rows[0].result;
  const staff=await staffRpc(manager);
  assert.equal(staff.ok,true);
  assert.equal(staff.items.length,1);
  assert.equal(staff.items[0].id,id(1));
  assert.equal(staff.items[0].state,'pending');
  assert.equal(staff.items[0].title,'Private updated class');
  assert.equal(staff.nextCursor,null);
  for(const secret of [a,draft.privateJoinUrl,draft.ticketUrl,'owner_hash','privateJoinUrl','privateLocation','ticketUrl'])
   assert.equal(JSON.stringify(staff).includes(secret),false);
  assert.equal((await staffRpc(qa)).error,'forbidden');
  assert.equal((await staffRpc(auditor)).error,'forbidden');
  assert.equal((await staffRpc(manager,'0'.repeat(64))).error,'forbidden');
  assert.equal((await staffRpc(guest)).error,'forbidden');

  const decide=async(who,command,gen=generation)=>(await db.query(
   'select public.feture_event_staff_decide($1,$2,$3::jsonb) result',
   [who,gen,JSON.stringify(command)])).rows[0].result;
  const review=(eventId,revision,decision,reason,op)=>({
   action:'decide',id:id(eventId),expectedRevision:revision,
   operationId:id(op),decision,reason
  });
  const denyUnreviewed=review(1,3,'approve','reviewed',9100);
  assert.equal((await decide(manager,denyUnreviewed)).error,'review_required');
  assert.equal((await decide(manager,{...denyUnreviewed,ownerHash:a})).error,'invalid_request');
  assert.equal((await decide(manager,{...denyUnreviewed,reason:'policy'})).error,'invalid_request');
  assert.equal((await decide(manager,review(1,3,'reject','reviewed',9100))).error,'invalid_request');
  assert.equal((await decide(a,review(1,3,'reject','privacy',9101))).error,'review_required');
  assert.equal((await decide(qa,review(1,3,'reject','privacy',9102))).error,'forbidden');
  assert.equal((await decide(auditor,review(1,3,'reject','privacy',9103))).error,'forbidden');
  assert.equal((await decide(manager,review(1,3,'reject','privacy',9104),'0'.repeat(64))).error,'forbidden');
  const rejectOne=review(1,3,'reject','privacy',9201);
  const rejected=await decide(manager,rejectOne);
  assert.equal(rejected.ok,true);
  assert.deepEqual(rejected.event,{id:id(1),revision:4,state:'rejected'});
  assert.equal((await decide(manager,rejectOne)).replayed,true);
  assert.deepEqual((await decide(manager,rejectOne)).event,rejected.event);
  assert.equal((await decide(manager,{...rejectOne,reason:'spam'})).error,'operation_conflict');
  assert.equal((await decide(manager,review(1,3,'reject','privacy',9202))).error,'revision_conflict');
  assert.equal((await rpc(a,{action:'events.read',id:id(1)})).entry.state,'rejected');
  assert.equal((await rpc(b,{action:'events.read',id:id(1)})).error,'resource_not_found');
  // No private venue or external ticket in manager-approved unexamined event.
  const clean={...draft,title:'No links class',ticketUrl:null,privateJoinUrl:null};
  const updateThree={action:'events.save',id:id(3),operationId:id(9203),expectedRevision:1,draft:clean};
  assert.equal((await rpc(a,updateThree)).entry.revision,2);
  const submitThree={action:'events.submit',id:id(3),operationId:id(9204),expectedRevision:2};
  assert.equal((await rpc(a,submitThree)).entry.state,'pending');
  assert.equal((await decide(manager,review(3,3,'approve','reviewed',9205))).ok,true);
  const approved=await decide(manager,review(3,3,'approve','reviewed',9205));
  assert.equal(approved.replayed,true);
  assert.deepEqual(approved.event,{id:id(3),revision:4,state:'approved'});
  assert.equal((await decide(manager,review(3,3,'approve','reviewed',9206))).error,'revision_conflict');
  assert.equal((await rpc(a,{action:'events.read',id:id(3)})).entry.state,'approved');
  assert.equal((await rpc(b,{action:'events.read',id:id(3)})).error,'resource_not_found');
  assert.equal((await rpc(a,{action:'events.catalog',cursor:null})).error,'invalid_request');
  assert.equal((await staffRpc(manager)).items.length,0); // Approved is not pending and not public.
  const audit=(await db.query('select action,reason,draft_hash,response from public.feture_event_reviews order by created_at')).rows;
  assert.equal(audit.length,2);
  assert.deepEqual(audit.map(x=>x.action).sort(),['approve','reject']);
  for(const entry of audit){
   assert.match(entry.draft_hash,/^[a-f0-9]{64}$/);
   assert.ok(!JSON.stringify(entry.response).includes(a));
   assert.ok(!JSON.stringify(entry.response).includes(draft.privateJoinUrl));
   assert.ok(!JSON.stringify(entry.response).includes(draft.ticketUrl));
  }
  await db.query('update public.feture_profiles set adult_allowed=false where account_hash=$1',[manager]);
  assert.equal((await decide(manager,rejectOne)).error,'forbidden');
  assert.equal((await staffRpc(manager)).error,'forbidden');
  await db.query('update public.feture_profiles set adult_allowed=false where account_hash=$1',[a]);
  assert.equal((await rpc(a,{action:'events.read',id:id(1)})).error,'resource_not_found');
  assert.equal((await rpc(a,cmd(1))).error,'resource_not_found');
  assert.equal((await rpc(a,{action:'events.mine',cursor:null})).error,'resource_not_found');
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_events'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_event_operations'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_event_reviews'),/permission denied/);
   await assert.rejects(rpc(a,{action:'events.mine',cursor:null}),/permission denied/);
   await assert.rejects(staffRpc(manager),/permission denied/);
   await assert.rejects(decide(manager,rejectOne),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
}
