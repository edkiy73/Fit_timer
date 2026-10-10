import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '@appbase/core/auth.js';
import type { InterestDTO, InterestState, Mutation, MutationResult } from '../../lib/feture/contracts';
import { createInterestQueue } from './interest-queue';
import { createInterestStore, type InterestStore } from './interest-store';
import { createInterestAPI, InterestError, type InterestAPI } from './interest-api';

const state:InterestState={stance:'curious',experience:'none',boundary:'none',boundaryNote:null,intensity:4,visibility:'private',useForDiscovery:false};
const cleared:InterestState={...state,stance:'unknown',experience:'unspecified',intensity:null};
const session=(email:string):AuthSession=>({email,deviceId:'device',syncToken:'secret-'+email,handle:'',locale:'ru',sub:null,premium:false,owned:[],fresh:false});
const a=session('a@example.com'),b=session('b@example.com');
const at='2026-10-11T00:00:00.000Z';
const entry=(revision:number,value=state,deleted=false):InterestDTO=>({...value,interestId:'interest-1-1',revision,updatedAt:at,source:'manual',testVersion:null,deleted});
let serial=0;
const uuid=()=>`00000000-0000-4000-8000-${(++serial).toString().padStart(12,'0')}`;
const queues:ReturnType<typeof createInterestQueue>[]=[];
afterEach(()=>{queues.splice(0).forEach(q=>q.dispose());});
function setup(store:InterestStore=createInterestStore('queue-test-'+uuid())){
 let current:AuthSession|null=a,clock=Date.now(),mode:'online'|'offline'|'age'|'lost'='age';
 let remote:InterestDTO|null=null;
 const calls:Mutation[]=[],receipts=new Map<string,{command:string;applied:number}>();
 const api:InterestAPI={
  async list(){if(mode==='age')throw new InterestError('adult_verification_required');if(mode==='offline')throw new InterestError('offline');return remote?[structuredClone(remote)]:[];},
  async mutate(_session,op){
   calls.push(structuredClone(op));
   if(mode==='age')throw new InterestError('adult_verification_required');if(mode==='offline')throw new InterestError('offline');
   const old=receipts.get(op.operationId);let result:MutationResult;
   if(old){result=old.command===JSON.stringify(op)?{ok:true,replayed:true,appliedRevision:old.applied,appliedAt:at,entry:structuredClone(remote!)}:{ok:false,error:'operation_conflict',entry:remote};}
   else if(op.expectedRevision!==(remote?.revision??0))result={ok:false,error:'revision_conflict',entry:remote?structuredClone(remote):null};
   else{
    remote=entry(op.expectedRevision+1,op.action==='interests.set'?op.state:cleared,op.action==='interests.delete');
    receipts.set(op.operationId,{command:JSON.stringify(op),applied:remote.revision});
    result={ok:true,replayed:false,appliedRevision:remote.revision,appliedAt:at,entry:structuredClone(remote)};
   }
   if(mode==='lost')throw new InterestError('offline');return result;
  }
 };
 const getSession=async()=>current;
 const make=()=>{const q=createInterestQueue({store,api,getSession,uuid,now:()=>clock,hash:async v=>'hash:'+v});queues.push(q);return q;};
 return {store,api,make,getSession,calls,setSession:(v:AuthSession|null)=>{current=v;},setMode:(v:typeof mode)=>{mode=v;},advance:()=>{clock+=300000;},setRemote:(v:InterestDTO|null)=>{remote=v;},remote:()=>remote};
}
async function idle(q:ReturnType<typeof createInterestQueue>,store:InterestStore,phase:string){
 await vi.waitFor(async()=>{
  expect(q.getSnapshot().phase).toBe(phase);
  expect(await store.change(db=>Object.values(db.owners).every(c=>c.lease===null))).toBe(true);
 },{timeout:2000,interval:10});
}

describe('owner interest outbox',()=>{
 it('keeps guest data separate and imports only explicitly, privately and atomically',async()=>{
  const s=setup();s.setSession(null);const q=s.make();await q.select();
  expect(await q.save('interest-1-1',{...state,visibility:'public',useForDiscovery:true},'guest')).toBe(true);
  s.setSession(a);await q.select();expect(q.getSnapshot().map).toEqual({});expect(q.getSnapshot().guestCount).toBe(1);
  expect(s.calls).toHaveLength(0);
  await q.importGuest(q.getSnapshot().scope);await idle(q,s.store,'adult_verification_required');
  expect(q.getSnapshot().map['interest-1-1']!.visibility).toBe('private');
  expect(q.getSnapshot().map['interest-1-1']!.useForDiscovery).toBe(false);expect(q.getSnapshot().guestCount).toBe(0);
  expect(q.getSnapshot().pending).toBe(1);
  const persisted=await s.store.change(db=>JSON.stringify(db));
  // Test hash is transparent; operation records themselves never include credentials.
  expect(await s.store.change(db=>JSON.stringify(Object.values(db.owners)[0]!.pending))).not.toContain('secret-');
  expect(persisted).not.toContain('syncToken');
 });
 it('serializes two tabs in IndexedDB, preserving both immutable revisions and UUIDs',async()=>{
  const name='tabs-'+uuid(),s=setup(createInterestStore(name)),q=s.make();await q.select();
  const other=createInterestQueue({store:createInterestStore(name),api:s.api,getSession:s.getSession,uuid,hash:async v=>'hash:'+v});queues.push(other);await other.select();
  await Promise.all([q.save('interest-1-1',state,q.getSnapshot().scope),other.save('interest-1-1',{...state,experience:'tried'},other.getSnapshot().scope)]);
  const pending=await s.store.change(db=>Object.values(db.owners)[0]!.pending);
  expect(pending.map(op=>op.expectedRevision)).toEqual([0,1]);expect(new Set(pending.map(op=>op.operationId)).size).toBe(2);
 });
 it('retries the exact operation after restart and refuses to revive a newer deletion',async()=>{
  const s=setup(),q=s.make();await q.select();s.setMode('lost');
  await q.save('interest-1-1',state,q.getSnapshot().scope);await idle(q,s.store,'offline');
  expect(s.remote()!.revision).toBe(1);
  await q.save('interest-1-1',{...state,stance:'fantasy'},q.getSnapshot().scope);q.dispose();
  s.setRemote(entry(2,cleared,true));s.setMode('online');s.advance();const restarted=s.make();await restarted.select();await restarted.sync();
  expect(JSON.stringify(s.calls[0])).toBe(JSON.stringify(s.calls[1]));
  expect(restarted.getSnapshot().conflicts).toEqual(['interest-1-1']);expect(s.remote()!.deleted).toBe(true);
  expect(s.calls).toHaveLength(2);
  await restarted.resolve('interest-1-1',false,restarted.getSnapshot().scope);await idle(restarted,s.store,'synced');
  expect(restarted.getSnapshot().map).toEqual({});expect(restarted.getSnapshot().pending).toBe(0);
  await restarted.save('interest-1-1',state,restarted.getSnapshot().scope);await idle(restarted,s.store,'synced');
  expect(s.remote()!.revision).toBe(3);expect(s.remote()!.deleted).toBe(false);
 });
 it('shows a revision conflict and requires a new explicit operation to replace it',async()=>{
  const s=setup(),q=s.make();await q.select();s.setMode('online');s.setRemote(entry(1));await q.sync();
  s.setRemote(entry(2,{...cleared,boundary:'hard'}));
  await q.save('interest-1-1',{...state,visibility:'public'},q.getSnapshot().scope);await vi.waitFor(()=>expect(q.getSnapshot().conflicts).toEqual(['interest-1-1']));await idle(q,s.store,'pending');
  expect(q.getSnapshot().conflicts).toEqual(['interest-1-1']);expect(s.remote()!.boundary).toBe('hard');
  const old=s.calls[0]!.operationId;
  await q.resolve('interest-1-1',true,q.getSnapshot().scope);await idle(q,s.store,'synced');
  expect(s.calls[1]!.operationId).not.toBe(old);expect(s.calls[1]!.expectedRevision).toBe(2);
  expect(s.remote()!.revision).toBe(3);
 });
 it('fences logout across tabs and ignores late responses without erasing another owner',async()=>{
  const s=setup(),q=s.make();await q.select();const scopeA=q.getSnapshot().scope;
  let finish!:(result:MutationResult)=>void;
  s.api.mutate=async()=>new Promise(resolve=>{finish=resolve;});
  await q.save('interest-1-1',state,scopeA);await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  const fence=await q.prepareLogout();s.setSession(b);await q.select();const scopeB=q.getSnapshot().scope;
  expect(q.getSnapshot().map).toEqual({});expect(await q.save('interest-1-2',state,scopeA)).toBe(false);
  finish({ok:true,replayed:false,appliedRevision:1,appliedAt:at,entry:entry(1)});
  await q.finishLogout(fence,true);expect(q.getSnapshot().scope).toBe(scopeB);expect(q.getSnapshot().map).toEqual({});
  expect(await s.store.change(db=>db.owners['hash:'+a.email])).toBeUndefined();
  s.setSession(a);await q.select();expect(q.getSnapshot().phase).toBe('auth_required');expect(q.getSnapshot().map).toEqual({});
 });
 it('restores the unsent queue when logout fails and never lies about failed local persistence',async()=>{
  const s=setup(),q=s.make();await q.select();await q.save('interest-1-1',state,q.getSnapshot().scope);await idle(q,s.store,'adult_verification_required');
  const fence=await q.prepareLogout();await q.finishLogout(fence,false);expect(q.getSnapshot().pending).toBe(1);
  const bad=createInterestQueue({store:{async change(){throw new Error('full');}},api:s.api,getSession:s.getSession});queues.push(bad);
  await bad.select();expect(bad.getSnapshot().phase).toBe('storage_error');expect(await bad.save('interest-1-1',state,'loading')).toBe(false);
 });
 it('keeps a rejected session sealed until new credentials and preserves drafts on a storage failure',async()=>{
  const s=setup(),q=s.make();await q.select();await q.save('interest-1-1',state,q.getSnapshot().scope);await idle(q,s.store,'adult_verification_required');
  s.api.mutate=async()=>{throw new InterestError('auth_required');};
  await q.sync();expect(q.getSnapshot().phase).toBe('auth_required');expect(q.getSnapshot().map).toEqual({});
  await q.select();expect(q.getSnapshot().phase).toBe('auth_required');expect(q.getSnapshot().map).toEqual({});
  s.setSession({...a,syncToken:'new-session'});await q.select();expect(q.getSnapshot().pending).toBe(1);
  let fail=false;
  const flaky:InterestStore={change(edit){if(fail)return Promise.reject(new Error('disk_full'));return s.store.change(edit);}};
  const other=createInterestQueue({store:flaky,api:s.api,getSession:s.getSession,uuid,hash:async v=>'hash:'+v});queues.push(other);await other.select();
  fail=true;expect(await other.save('interest-1-2',state,other.getSnapshot().scope)).toBe(false);
  expect(await s.store.change(db=>Object.values(db.owners)[0]!.pending.length)).toBe(1);
 });
 it('guards request credentials and rejects invalid success envelopes instead of acknowledging writes',async()=>{
  let current:AuthSession|null=a;
  const send=vi.fn(async()=>new Response(JSON.stringify({ok:true,replayed:false,appliedRevision:1,appliedAt:at,entry:entry(1)}),{status:200}));
  const api=createInterestAPI('/api/domain',async()=>current,send);
  const op:Mutation={action:'interests.set',interestId:'interest-1-1',operationId:uuid(),expectedRevision:0,state};
  await api.mutate(a,op,new AbortController().signal);
  const request=send.mock.calls[0] as unknown as [string,RequestInit];
  expect(JSON.parse(request[1].body as string)).toEqual(op);
  expect(request[1].headers).toMatchObject({'x-fit-email':a.email,'x-fit-token':a.syncToken});
  current=b;await expect(api.mutate(a,op,new AbortController().signal)).rejects.toMatchObject({code:'auth_required'});expect(send).toHaveBeenCalledTimes(1);
  current={...a,expiresAt:'2020-01-01T00:00:00Z'};await expect(api.mutate(current,op,new AbortController().signal)).rejects.toMatchObject({code:'auth_required'});expect(send).toHaveBeenCalledTimes(1);
  current=a;send.mockImplementation(async()=>new Response(JSON.stringify({ok:true,replayed:false,appliedRevision:1,appliedAt:at,entry:entry(1,{...state,intensity:100})}),{status:200}));
  await expect(api.mutate(a,op,new AbortController().signal)).rejects.toMatchObject({code:'unavailable'});
 });
});
