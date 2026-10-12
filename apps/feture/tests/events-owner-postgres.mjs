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
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013002300_feture_event_staff_decisions.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013002500_feture_event_owner_cancel.sql',import.meta.url),'utf8'));
  await db.exec("create table public.feture_blocks(blocker_hash text,blocked_hash text,primary key(blocker_hash,blocked_hash));grant select,insert,delete on public.feture_blocks to service_role;");
  await db.exec("create function public.feture_pair_blocked(a text,b text) returns boolean language sql stable security invoker as 'select exists(select 1 from public.feture_blocks where (blocker_hash=a and blocked_hash=b) or (blocker_hash=b and blocked_hash=a))';");
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013002600_feture_event_rsvp_intents.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013002700_feture_event_public_catalog.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013002800_feture_event_attendance_requests.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013002900_feture_event_owner_request_queue.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013003100_feture_event_staff_publication.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013003200_feture_event_attendance_owner_decisions.sql',import.meta.url),'utf8'));
  await db.exec("create table public.feture_profile_details(account_hash text primary key,data jsonb not null,public_fields text[] not null default '{}');grant select,insert,update on public.feture_profile_details to service_role;");
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013003300_feture_event_owner_attendees.sql',import.meta.url),'utf8'));
  const a='a'.repeat(32),b='b'.repeat(32),guest='c'.repeat(32),manager='d'.repeat(32),qa='e'.repeat(32),auditor='f'.repeat(32),generation='1'.repeat(64);
  await db.query('insert into public.feture_profiles(account_hash) values ($1),($2),($3),($4),($5),($6)',[a,b,guest,manager,qa,auditor]);
  for(const [who,role] of [[manager,'manager'],[qa,'qa_operator'],[auditor,'auditor'],[a,'manager']])await db.query('insert into public.fixture_staff_role values ($1,$2,$3)',[who,generation,role]);
  await db.exec('set role service_role');
  const rpc=async(who,command)=>(await db.query('select public.'+(command.action==='events.submit'?'feture_event_submit_command':command.action==='events.cancel'?'feture_event_cancel_command':'feture_event_owner_command')+'($1,$2::jsonb) result',[who,JSON.stringify(command)])).rows[0].result;
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


  // E03b: publication is a distinct reviewed operation. A private approval cannot publish.
  const publish=async(who,command,gen=generation)=>(await db.query(
    'select public.feture_event_staff_publish($1,$2,$3::jsonb) result',
    [who,gen,JSON.stringify(command)])).rows[0].result;
  const pubCmd=(n,revision,operation)=>({action:'publish',id:id(n),
    operationId:id(operation),expectedRevision:revision});
  assert.equal((await publish(manager,pubCmd(3,4,9700))).error,'review_required'); // approved but private
  const cleanPublic={...clean,visibility:'public'};
  assert.equal((await rpc(a,cmd(43,0,cleanPublic))).entry.state,'draft');
  assert.equal((await rpc(a,{action:'events.submit',id:id(43),operationId:id(9701),expectedRevision:1})).entry.state,'pending');
  assert.equal((await decide(manager,review(43,2,'approve','reviewed',9702))).event.state,'approved');
  assert.equal((await publish(qa,pubCmd(43,3,9703))).error,'forbidden');
  assert.equal((await publish(a,pubCmd(43,3,9704))).error,'review_required'); // owner cannot self-publish
  assert.equal((await publish(manager,pubCmd(43,3,9705),'0'.repeat(64))).error,'forbidden');
  assert.equal((await publish(manager,{...pubCmd(43,3,9706),ownerHash:a})).error,'invalid_request');
  const publishCmd=pubCmd(43,3,9707);
  const published=await publish(manager,publishCmd);
  assert.deepEqual(published.event,{id:id(43),revision:4,state:'published'});
  assert.equal(published.replayed,false);
  assert.equal(JSON.stringify(published).includes(a),false);
  assert.equal((await publish(manager,publishCmd)).replayed,true);
  assert.equal((await publish(manager,{...publishCmd,expectedRevision:4})).error,'operation_conflict');
  assert.equal((await publish(manager,pubCmd(43,3,9708))).error,'revision_conflict');
  assert.equal((await rpc(a,{action:'events.read',id:id(43)})).entry.state,'published');
  const publishedCatalogue=(await db.query('select public.feture_event_catalog_command($1,$2::jsonb) result',
    [b,JSON.stringify({action:'events.preview',id:id(43)})])).rows[0].result;
  assert.equal(publishedCatalogue.entry.id,id(43));
  assert.equal(JSON.stringify(publishedCatalogue).includes('privateJoinUrl'),false);
  const publicationAudit=(await db.query('select approved_draft_hash,response from public.feture_event_publications where event_id=$1',[id(43)])).rows;
  assert.equal(publicationAudit.length,1);
  assert.match(publicationAudit[0].approved_draft_hash,/^[a-f0-9]{64}$/);
  assert.equal((await rpc(a,{action:'events.cancel',id:id(43),operationId:id(9709),expectedRevision:4})).event.state,'cancelled');
  assert.equal((await publish(manager,publishCmd)).error,'revision_conflict'); // stale replay after cancellation
  assert.equal((await db.query('select public.feture_event_catalog_command($1,$2::jsonb) result',
    [b,JSON.stringify({action:'events.preview',id:id(43)})])).rows[0].result.error,'resource_not_found');

  // E02b: owner cancellation is final and never exposes draft in response.
  const cancelOne={action:'events.cancel',id:id(1),operationId:id(9901),expectedRevision:4};
  assert.equal((await rpc(b,cancelOne)).error,'resource_not_found');
  const cancelledOne=await rpc(a,cancelOne);
  assert.equal(cancelledOne.ok,true);
  assert.deepEqual(cancelledOne.event,{id:id(1),state:'cancelled',revision:5});
  assert.equal(JSON.stringify(cancelledOne).includes(draft.privateJoinUrl),false);
  assert.equal((await rpc(a,cancelOne)).replayed,true);
  assert.deepEqual((await rpc(a,cancelOne)).event,cancelledOne.event);
  assert.equal((await rpc(a,{...cancelOne,expectedRevision:5})).error,'operation_conflict');
  assert.equal((await rpc(a,{...cancelOne,operationId:id(9902),expectedRevision:4})).error,'revision_conflict');
  assert.equal((await rpc(a,{action:'events.read',id:id(1)})).entry.state,'cancelled');
  assert.equal((await rpc(b,{action:'events.read',id:id(1)})).error,'resource_not_found');
  assert.equal((await rpc(a,{...cmd(1,5),operationId:id(9903)})).error,'revision_conflict');
  assert.equal((await rpc(a,{action:'events.submit',id:id(1),operationId:id(9904),expectedRevision:5})).error,'revision_conflict');
  const pendingFour={action:'events.submit',id:id(4),operationId:id(9905),expectedRevision:1};
  assert.equal((await rpc(a,pendingFour)).entry.state,'pending');
  assert.equal((await staffRpc(manager)).items.length,1);
  const cancellationFour=await rpc(a,{action:'events.cancel',id:id(4),operationId:id(9906),expectedRevision:2});
  assert.equal(cancellationFour.event.state,'cancelled');
  assert.equal((await staffRpc(manager)).items.length,0); // removed from staff queue immediately
  const cancelApproved=await rpc(a,{action:'events.cancel',id:id(3),operationId:id(9907),expectedRevision:4});
  assert.equal(cancelApproved.event.state,'cancelled');
  assert.equal((await rpc(b,{action:'events.read',id:id(3)})).error,'resource_not_found');

  // E04a future public catalogue gate: fixture seeding a published public event
  // bypasses the normal product API solely to prove RSVP ACL. No public publish RPC exists.
  const publishedDraft={...draft,visibility:'public',privateJoinUrl:null,ticketUrl:null};
  await db.query("insert into public.feture_events(id,owner_hash,draft,state,published_at) values($1,$2,$3::jsonb,'published',clock_timestamp())",
   [id(40),a,JSON.stringify(publishedDraft)]);
  await db.query("insert into public.feture_events(id,owner_hash,draft,state) values($1,$2,$3::jsonb,'draft')",
   [id(41),a,JSON.stringify(publishedDraft)]);
  await db.query("insert into public.feture_events(id,owner_hash,draft,state,published_at) values($1,$2,$3::jsonb,'published',clock_timestamp())",
   [id(42),a,JSON.stringify({...publishedDraft,visibility:'private'})]);

  const catalogue=async(who,command)=>(await db.query(
   'select public.feture_event_catalog_command($1,$2::jsonb) result',
   [who,JSON.stringify(command)])).rows[0].result;
  const catalogList=who=>catalogue(who,{action:'events.catalog',cursor:null});
  const eventPreview=(who,n)=>catalogue(who,{action:'events.preview',id:id(n)});
  const firstCard=await eventPreview(b,40);
  assert.equal(firstCard.entry.id,id(40));
  assert.deepEqual(Object.keys(firstCard.entry).sort(),
    ['id','revision','title','summary','description','conditions','format','startsAt','endsAt',
     'timeZone','language','city','publicLocation','price','hasExternalTickets'].sort());
  assert.equal(JSON.stringify(firstCard).includes(draft.privateJoinUrl),false);
  assert.equal(JSON.stringify(firstCard).includes(draft.ticketUrl),false);
  assert.equal((await catalogList(b)).items.length,1);
  assert.equal((await eventPreview(b,41)).error,'resource_not_found');
  assert.equal((await eventPreview(b,42)).error,'resource_not_found');
  assert.equal((await eventPreview(b,1)).error,'resource_not_found');
  assert.equal((await catalogue(b,{action:'events.preview',id:id(40),ownerHash:a})).error,'invalid_request');
  assert.equal((await catalogList('9'.repeat(32))).error,'resource_not_found');


  // E04b.1 attendance request is a non-admission intent, never a secure venue grant.
  const attendance=async(who,command)=>(await db.query(
   'select public.feture_event_attendance_command($1,$2::jsonb) result',
   [who,JSON.stringify(command)])).rows[0].result;
  const statusReq=(who,n=40)=>attendance(who,{action:'events.attendanceStatus',id:id(n)});
  const attendCmd=(action,n,operation)=>({action,id:id(n),operationId:id(operation)});
  assert.deepEqual(await statusReq(b),{ok:true,state:'none',replayed:false});
  assert.equal((await statusReq(a)).error,'resource_not_found'); // owner never participates
  assert.equal((await statusReq(b,41)).error,'resource_not_found'); // draft
  assert.equal((await statusReq(b,42)).error,'resource_not_found'); // private
  assert.equal((await statusReq(b,1)).error,'resource_not_found'); // rejected
  assert.equal((await attendance(b,{action:'events.attendanceRequest',id:id(40),operationId:id(4701),actorHash:a})).error,'invalid_request');
  const pendingCmd=attendCmd('events.attendanceRequest',40,4702);
  const pending=await attendance(b,pendingCmd);
  assert.deepEqual(pending,{ok:true,state:'pending',replayed:false});

  const requestQueue=async(who,eventId=40,cursor=null)=>(await db.query(
   'select public.feture_event_attendance_owner_queue($1,$2::jsonb) result',
   [who,JSON.stringify({action:'events.attendanceRequests',id:id(eventId),cursor})])).rows[0].result;
  const page=await requestQueue(a);
  assert.equal(page.ok,true);
  assert.equal(page.items.length,1);
  assert.equal(page.items[0].state,'pending');
  assert.match(page.items[0].requestId,/^[0-9a-f-]{36}$/);
  assert.ok(!JSON.stringify(page).includes(b));
  assert.equal(JSON.stringify(page).includes(draft.privateJoinUrl),false);
  assert.equal(JSON.stringify(page).includes(draft.ticketUrl),false);
  assert.equal(page.nextCursor,null);
  assert.equal((await requestQueue(b)).error,'resource_not_found');
  assert.equal((await requestQueue(manager)).error,'resource_not_found');
  assert.equal((await requestQueue(a,41)).error,'resource_not_found'); // draft
  assert.equal((await requestQueue(a,42)).error,'resource_not_found'); // private

  assert.deepEqual(await statusReq(b),{ok:true,state:'pending',replayed:false});
  assert.deepEqual(await attendance(b,pendingCmd),{ok:true,state:'pending',replayed:true});
  assert.equal((await attendance(b,attendCmd('events.attendanceWithdraw',40,4702))).error,'operation_conflict');
  assert.equal((await attendance(b,attendCmd('events.attendanceRequest',40,4703))).error,'revision_conflict');
  assert.equal((await attendance(a,attendCmd('events.attendanceRequest',40,4704))).error,'resource_not_found');
  assert.equal((await db.query('select count(*)::int n from public.feture_event_attendance_requests')).rows[0].n,1);

  const rsvp=async(who,cmd)=>(await db.query("select public.feture_event_rsvp_command($1,$2::jsonb) result",[who,JSON.stringify(cmd)])).rows[0].result;
  const choice=(who,operation,status,visibleToAttendees=false)=>({action:'events.rsvpSet',id:id(40),operationId:id(operation),status,visibleToAttendees});
  const own=(who)=>rsvp(who,{action:'events.rsvpStatus',id:id(40)});
  assert.equal((await own(b)).status,'none');
  assert.equal((await own(a)).error,'resource_not_found');
  assert.equal((await rsvp(b,{action:'events.rsvpStatus',id:id(41)})).error,'resource_not_found');
  assert.equal((await rsvp(b,{action:'events.rsvpStatus',id:id(42)})).error,'resource_not_found');
  assert.equal((await rsvp(b,{action:'events.rsvpStatus',id:id(1)})).error,'resource_not_found');
  const interested=choice(b,9801,'interested');
  assert.deepEqual((await rsvp(b,interested)).counts,{interested:null,going:null});
  assert.equal((await own(b)).status,'interested');
  assert.equal((await own(b)).visibleToAttendees,false);
  assert.equal((await rsvp(b,interested)).replayed,true);
  assert.equal((await rsvp(b,{...interested,visibleToAttendees:true})).error,'operation_conflict');
  const going=choice(b,9802,'going',true);
  assert.equal((await rsvp(b,going)).visibleToAttendees,true);
  assert.equal((await rsvp(b,interested)).status,'going'); // immutable replay cannot restore old RSVP
  assert.equal((await own(b)).status,'going');
  assert.equal((await rsvp(a,choice(a,9803,'going'))).error,'resource_not_found');
  assert.equal((await rsvp(b,{...going,operationId:id(9804),status:'declined',visibleToAttendees:true})).error,'invalid_request');
  for(const [n,who] of [[9805,guest],[9806,manager],[9807,qa],[9808,auditor]])
   assert.equal((await rsvp(who,choice(who,n,'going'))).ok,true);
  const aggregate=await own(b);
  assert.equal(aggregate.counts.going,5);
  assert.equal(aggregate.counts.interested,null);
  assert.equal(JSON.stringify(aggregate).includes(a),false);
  assert.equal(JSON.stringify(aggregate).includes(draft.privateJoinUrl),false);
  await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[a,b]);
  assert.deepEqual((await requestQueue(a)).items,[]); // blocked pending user excluded
  assert.equal((await statusReq(b)).error,'resource_not_found');
  assert.equal((await attendance(b,attendCmd('events.attendanceRequest',40,4705))).error,'resource_not_found');
  const withdrawnAttendance=await attendance(b,attendCmd('events.attendanceWithdraw',40,4706));
  assert.deepEqual(withdrawnAttendance,{ok:true,state:'withdrawn',replayed:false});
  assert.deepEqual(await attendance(b,attendCmd('events.attendanceWithdraw',40,4706)),{ok:true,state:'withdrawn',replayed:true});
  assert.equal((await attendance(b,attendCmd('events.attendanceRequest',40,4707))).error,'resource_not_found');

  assert.equal((await eventPreview(b,40)).error,'resource_not_found');
  assert.deepEqual((await catalogList(b)).items,[]);
  assert.equal((await own(b)).error,'resource_not_found');
  assert.equal((await rsvp(b,choice(b,9809,'going'))).error,'resource_not_found');
  assert.equal((await own(guest)).counts.going,null); // 4 remain, threshold prevents identifying b
  const withdrawn=choice(b,9810,'withdrawn');
  assert.equal((await rsvp(b,withdrawn)).status,'withdrawn');
  assert.equal((await rsvp(b,withdrawn)).replayed,true);
  assert.equal((await rsvp(b,choice(b,9811,'interested'))).error,'resource_not_found');
  assert.equal((await rsvp(guest,choice(guest,9812,'declined'))).status,'declined');
  assert.equal((await own(guest)).visibleToAttendees,false);
  assert.equal((await rsvp(guest,choice(guest,9813,'declined',true))).error,'invalid_request');
  await db.query('update public.feture_events set state=$1,published_at=null where id=$2',['hidden',id(40)]);
  assert.equal((await requestQueue(a)).error,'resource_not_found');
  const guestRequest=await attendance(guest,attendCmd('events.attendanceRequest',40,4710));
  assert.equal(guestRequest.error,'resource_not_found');
  assert.equal((await attendance(b,attendCmd('events.attendanceWithdraw',40,4711))).state,'withdrawn');
  assert.equal((await statusReq(guest)).error,'resource_not_found');
  const requestData=(await db.query('select state,actor_hash,revision from public.feture_event_attendance_requests')).rows;
  assert.equal(requestData.length,1);
  assert.equal(requestData[0].state,'withdrawn');

  assert.equal((await eventPreview(guest,40)).error,'resource_not_found');
  assert.deepEqual((await catalogList(guest)).items,[]);
  assert.equal((await own(guest)).error,'resource_not_found');
  assert.equal((await rsvp(guest,choice(guest,9814,'going'))).error,'resource_not_found');
  assert.equal((await rsvp(guest,choice(guest,9815,'withdrawn'))).status,'withdrawn'); // leave after hide
  assert.equal((await db.query('select count(*)::int count from public.feture_event_rsvps where event_id=$1',[id(40)])).rows[0].count,5);
  assert.equal((await db.query('select count(*)::int count from public.feture_event_rsvp_operations')).rows[0].count,9);


  // Stable date+UUID cursor across 21 published public events; no hidden URL leakage.
  for(let n=50;n<=70;n++){
   await db.query("insert into public.feture_events(id,owner_hash,draft,state,published_at) values($1,$2,$3::jsonb,'published',clock_timestamp())",
    [id(n),a,JSON.stringify({...publishedDraft,ticketUrl:'https://tickets.example.org/private-operator',
     privateJoinUrl:'https://meet.example.org/restricted'})]);
  }
  const firstPage=await catalogList(guest);
  assert.equal(firstPage.items.length,20);
  assert.ok(firstPage.nextCursor);
  const secondPage=await catalogue(guest,{action:'events.catalog',cursor:firstPage.nextCursor});
  assert.equal(secondPage.items.length,1);
  assert.equal(secondPage.nextCursor,null);
  assert.equal(new Set([...firstPage.items,...secondPage.items].map(x=>x.id)).size,21);
  assert.equal(JSON.stringify(firstPage).includes('tickets.example.org'),false);
  assert.equal(JSON.stringify(firstPage).includes('meet.example.org'),false);
  assert.equal(firstPage.items.every(x=>x.hasExternalTickets===true),true);
  assert.equal((await eventPreview(b,50)).error,'resource_not_found'); // blocked viewer


  // Queue paging uses opaque request UUIDs and never account identifiers.
  await db.query("insert into public.feture_events(id,owner_hash,draft,state,published_at) values($1,$2,$3::jsonb,'published',clock_timestamp())",
    [id(44),a,JSON.stringify(publishedDraft)]);
  for(let n=1;n<=21;n++){
   const h=n.toString(16).padStart(32,'0');
   await db.query('insert into public.feture_profiles(account_hash) values($1)',[h]);
   await db.query("insert into public.feture_event_attendance_requests(event_id,actor_hash,state) values($1,$2,'pending')",[id(44),h]);
  }
  const q1=await requestQueue(a,44);
  assert.equal(q1.items.length,20);
  assert.ok(q1.nextCursor);
  const q2=await requestQueue(a,44,q1.nextCursor);
  assert.equal(q2.items.length,1);
  assert.equal(q2.nextCursor,null);
  assert.equal(new Set([...q1.items,...q2.items].map(x=>x.requestId)).size,21);
  assert.equal((await requestQueue(a,44,{at:'bad',id:id(1)})).error,'invalid_cursor');
  assert.equal((await requestQueue(guest,44)).error,'resource_not_found');
  assert.equal(JSON.stringify(q1).includes('"actor_hash"'),false);
  assert.equal(JSON.stringify(q1).includes('"email"'),false);


  // E04b2b moderation of a request is metadata-only, never admission or a join link.
  await db.query("insert into public.feture_events(id,owner_hash,draft,state,published_at) values($1,$2,$3::jsonb,'published',clock_timestamp())",
    [id(45),a,JSON.stringify(publishedDraft)]);
  const attendanceDecision=async(who,command,gen=generation)=>(await db.query(
   'select public.feture_event_attendance_owner_decide($1,$2,$3::jsonb) result',
   [who,gen,JSON.stringify(command)])).rows[0].result;
  const decision=(req,revision,operation,choice='approve',reason='reviewed')=>({
   action:'events.attendanceDecide',id:id(45),requestId:req,operationId:id(operation),
   expectedRevision:revision,decision:choice,reason
  });
  assert.equal((await attendance(guest,attendCmd('events.attendanceRequest',45,4801))).state,'pending');
  const guestId=(await db.query("select request_id from public.feture_event_attendance_requests where event_id=$1 and actor_hash=$2",[id(45),guest])).rows[0].request_id;
  const yes=decision(guestId,1,4802);
  assert.equal((await attendanceDecision(guest,yes)).error,'resource_not_found'); // not event owner
  assert.equal((await attendanceDecision(a,{...yes,actorHash:guest})).error,'invalid_request');
  assert.equal((await attendanceDecision(a,{...yes,reason:'safety'})).error,'invalid_request');
  assert.equal((await attendanceDecision(a,{...yes,expectedRevision:0})).error,'invalid_request');
  assert.equal((await attendanceDecision(a,{...yes,requestId:id(9999)})).error,'resource_not_found');
  const accepted=await attendanceDecision(a,yes);
  assert.deepEqual(accepted.request,{requestId:guestId,state:'approved',revision:2});
  assert.equal(accepted.replayed,false);
  assert.equal(JSON.stringify(accepted).includes(guest),false);
  assert.equal(JSON.stringify(accepted).includes(publishedDraft.privateJoinUrl),false);
  assert.equal((await attendanceDecision(a,yes)).replayed,true);
  await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[a,guest]);
  assert.equal((await attendanceDecision(a,yes)).error,'resource_not_found'); // block revokes even replayed approval
  await db.query('delete from public.feture_blocks where blocker_hash=$1 and blocked_hash=$2',[a,guest]);
  await db.query('update public.feture_profiles set adult_allowed=false where account_hash=$1',[guest]);
  assert.equal((await attendanceDecision(a,yes)).error,'resource_not_found'); // revoke eligibility
  await db.query('update public.feture_profiles set adult_allowed=true where account_hash=$1',[guest]);
  assert.deepEqual((await statusReq(guest,45)).state,'approved');
  assert.equal((await requestQueue(a,45)).items.length,0);
  assert.equal((await attendanceDecision(a,{...yes,reason:'policy'})).error,'invalid_request');
  assert.equal((await attendanceDecision(a,{...yes,decision:'decline',reason:'policy'})).error,'operation_conflict');
  assert.equal((await attendanceDecision(a,decision(guestId,1,4803))).error,'revision_conflict');
  assert.equal((await attendance(guest,attendCmd('events.attendanceWithdraw',45,4804))).state,'withdrawn');
  assert.equal((await attendanceDecision(a,yes)).error,'revision_conflict');
  assert.equal((await attendance(guest,attendCmd('events.attendanceRequest',45,4805))).state,'pending'); // new withdrawal cycle
  assert.equal((await attendance(manager,attendCmd('events.attendanceRequest',45,4806))).state,'pending');
  const managerId=(await db.query("select request_id from public.feture_event_attendance_requests where event_id=$1 and actor_hash=$2",[id(45),manager])).rows[0].request_id;
  const no=decision(managerId,1,4807,'decline','capacity');
  assert.equal((await attendanceDecision(a,no)).request.state,'declined');
  assert.equal((await statusReq(manager,45)).state,'declined');
  await assert.rejects(attendance(manager,attendCmd('events.attendanceRequest',45,4808)),/attendance_decision_requires_new_request_cycle/);
  assert.equal((await attendance(manager,attendCmd('events.attendanceWithdraw',45,4809))).state,'withdrawn');
  assert.equal((await attendanceDecision(a,no)).error,'revision_conflict');
  await db.query("update public.feture_events set state='cancelled',published_at=null where id=$1",[id(45)]);
  assert.equal((await attendanceDecision(a,decision(guestId,4,4810))).error,'resource_not_found');
  const auditRows=(await db.query("select action,reason,response from public.feture_event_attendance_decisions where event_id=$1",[id(45)])).rows;
  assert.equal(auditRows.length,2);
  assert.deepEqual(auditRows.map(r=>r.action).sort(),['approve','decline']);
  for(const audit of auditRows){
   assert.equal(JSON.stringify(audit.response).includes(guest),false);
   assert.equal(JSON.stringify(audit.response).includes(manager),false);
   assert.equal(JSON.stringify(audit.response).includes('privateLocation'),false);
  }


  // E04c organizer-only, currently-public nickname, no individual declined list.
  const attendees=async(who,eventId=44,cursor=null)=>(await db.query(
   'select public.feture_event_owner_attendees($1,$2::jsonb) result',
   [who,JSON.stringify({action:'events.attendees',id:id(eventId),cursor})])).rows[0].result;
  assert.equal((await attendees(b)).error,'resource_not_found');
  assert.equal((await attendees(a,41)).error,'resource_not_found');
  assert.equal((await attendees(a,42)).error,'resource_not_found');
  // Earlier RSVP test intentionally blocked b; clear that fixture before testing active audience.
  await db.query('delete from public.feture_blocks where blocker_hash=$1 and blocked_hash=$2',[a,b]);
  await db.query("insert into public.feture_profile_details(account_hash,data,public_fields) values($1,$2::jsonb,$3::text[]),($4,$5::jsonb,$6::text[])",
   [guest,JSON.stringify({nickname:'Public attendee',about:'secret'}),['nickname'],
    b,JSON.stringify({nickname:'HIDDEN_NAME',about:'secret'}),[]]);
  await db.query("update public.feture_event_attendance_requests set state='approved' where event_id=$1 and actor_hash=$2",
   [id(44),'00000000000000000000000000000001']);
  await db.query("insert into public.feture_event_rsvps(event_id,actor_hash,status,visible_to_attendees) values($1,$2,'interested',false),($1,$3,'going',false),($1,$4,'declined',false)",
   [id(44),guest,b,manager]);
  const attendeePage=await attendees(a);
  assert.equal(attendeePage.items.length,3);
  assert.deepEqual(attendeePage.counts,{
   interested:1,going:1,rsvpDeclined:1,requestsPending:20,
   requestsApproved:1,requestsDeclined:0
  });
  assert.equal(attendeePage.items.some(x=>x.status==='interested'&&x.displayName==='Public attendee'),true);
  assert.equal(attendeePage.items.some(x=>x.status==='going'&&x.displayName===null),true);
  assert.equal(attendeePage.items.some(x=>x.kind==='request'&&x.status==='approved'),true);
  assert.equal(attendeePage.items.some(x=>x.status==='declined'||x.status==='withdrawn'),false);
  assert.equal(JSON.stringify(attendeePage).includes('HIDDEN_NAME'),false);
  assert.equal(JSON.stringify(attendeePage).includes(manager),false);
  assert.equal(JSON.stringify(attendeePage).includes(guest),false);
  await db.query("update public.feture_profile_details set public_fields='{}' where account_hash=$1",[guest]);
  assert.equal((await attendees(a)).items.some(x=>x.displayName==='Public attendee'),false);
  await db.query("insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)",[a,guest]);
  assert.equal((await attendees(a)).counts.interested,0);
  await db.query("update public.feture_profiles set adult_allowed=false where account_hash=$1",[b]);
  assert.equal((await attendees(a)).counts.going,0);
  await db.query("update public.feture_profiles set adult_allowed=true where account_hash=$1",[b]);
  assert.equal((await attendees(a,44,{at:'bad',id:id(1)})).error,'invalid_cursor');
  await db.query("update public.feture_events set state='cancelled',published_at=null where id=$1",[id(44)]);
  assert.equal((await attendees(a)).error,'resource_not_found');

  await db.query('update public.feture_profiles set adult_allowed=false where account_hash=$1',[manager]);
  assert.equal((await decide(manager,rejectOne)).error,'forbidden');
  assert.equal((await staffRpc(manager)).error,'forbidden');
  await db.query('update public.feture_profiles set adult_allowed=false where account_hash=$1',[a]);
  // Deletion/privacy escape hatch: cancellation works even after eligibility expiry.
  const cancelRevoked=await rpc(a,{action:'events.cancel',id:id(2),operationId:id(9908),expectedRevision:2});
  assert.equal(cancelRevoked.event.state,'cancelled');
  assert.equal(JSON.stringify(cancelRevoked).includes('Evening class'),false);

  assert.equal((await rpc(a,{action:'events.read',id:id(1)})).error,'resource_not_found');
  assert.equal((await rpc(a,cmd(1))).error,'resource_not_found');
  assert.equal((await rpc(a,{action:'events.mine',cursor:null})).error,'resource_not_found');
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_events'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_event_operations'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_event_reviews'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_event_publications'),/permission denied/);
   await assert.rejects(publish(manager,pubCmd(43,4,9799)),/permission denied/);
   await assert.rejects(rpc(a,{action:'events.mine',cursor:null}),/permission denied/);
   await assert.rejects(staffRpc(manager),/permission denied/);
   await assert.rejects(decide(manager,rejectOne),/permission denied/);
   await assert.rejects(rpc(a,{action:'events.cancel',id:id(1),operationId:id(9999),expectedRevision:5}),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_event_rsvps'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_event_rsvp_operations'),/permission denied/);
   await assert.rejects(rsvp(guest,{action:'events.rsvpStatus',id:id(40)}),/permission denied/);
   await assert.rejects(catalogList(guest),/permission denied/);
   await assert.rejects(eventPreview(guest,50),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_event_attendance_requests'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_event_attendance_decisions'),/permission denied/);
   await assert.rejects(attendees(a,44),/permission denied/);
   await assert.rejects(attendanceDecision(a,decision(guestId,1,4999)),/permission denied/);
   await assert.rejects(requestQueue(a,44),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_event_attendance_operations'),/permission denied/);
   await assert.rejects(attendance(guest,attendCmd('events.attendanceRequest',40,4799)),/permission denied/);

   await db.exec('reset role');
  }
 }finally{await db.close();}
}
