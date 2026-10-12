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
  const a='a'.repeat(32),b='b'.repeat(32),guest='c'.repeat(32);
  await db.query('insert into public.feture_profiles(account_hash) values ($1),($2),($3)',[a,b,guest]);
  await db.exec('set role service_role');
  const rpc=async(who,command)=>(await db.query('select public.feture_event_owner_command($1,$2::jsonb) result',[who,JSON.stringify(command)])).rows[0].result;
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
  assert.equal((await rpc(a,{action:'events.submit',id:id(1),operationId:id(77),expectedRevision:1})).error,'invalid_request');
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
  await db.query('update public.feture_profiles set adult_allowed=false where account_hash=$1',[a]);
  assert.equal((await rpc(a,{action:'events.read',id:id(1)})).error,'resource_not_found');
  assert.equal((await rpc(a,cmd(1))).error,'resource_not_found');
  assert.equal((await rpc(a,{action:'events.mine',cursor:null})).error,'resource_not_found');
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from public.feture_events'),/permission denied/);
   await assert.rejects(db.query('select * from public.feture_event_operations'),/permission denied/);
   await assert.rejects(rpc(a,{action:'events.mine',cursor:null}),/permission denied/);
   await db.exec('reset role');
  }
 }finally{await db.close();}
}
