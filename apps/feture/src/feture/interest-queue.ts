import type { AuthSession } from '@appbase/core/auth.js';
import type { InterestDTO, InterestState, Mutation } from '../../lib/feture/contracts';
import { normalizeRecord, type InterestMap, interestStateSchema } from './model';
import { InterestError, sameSession, type InterestAPI } from './interest-api';
import { emptyCache, type InterestCache, type InterestDatabase, type InterestStore } from './interest-store';

export type InterestPhase='loading'|'local'|'pending'|'syncing'|'synced'|'offline'|'adult_verification_required'|'auth_required'|'unavailable'|'rate_limited'|'invalid_request'|'storage_error';
export type InterestSnapshot={scope:string;map:InterestMap;phase:InterestPhase;pending:number;guestCount:number;conflicts:string[];server:Record<string,InterestDTO>};
type Context={owner:string;stamp:string;session:AuthSession};
const blank=(phase:InterestPhase='loading'):InterestSnapshot=>({scope:'loading',map:{},phase,pending:0,guestCount:0,conflicts:[],server:{}});
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
function putEntry(cache:InterestCache,entry:InterestDTO){
 if(!cache.entries[entry.interestId]||cache.entries[entry.interestId]!.revision<=entry.revision)cache.entries[entry.interestId]=entry;
}
function append(cache:InterestCache,id:string,state:InterestState|null,uuid:()=>string){
 if(cache.pending.length>=512)throw new InterestError('storage_error');
 const previous=[...cache.pending].reverse().find(op=>op.interestId===id);
 const expectedRevision=previous?previous.expectedRevision+1:cache.entries[id]?.revision??0;
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision>=Number.MAX_SAFE_INTEGER)throw new InterestError('invalid_request');
 const base={interestId:id,operationId:uuid(),expectedRevision};
 cache.pending.push(state?{...base,action:'interests.set',state}:{...base,action:'interests.delete'});
}
function project(cache:InterestCache):InterestMap {
 const map:InterestMap={};
 for(const entry of Object.values(cache.entries))if(!entry.deleted){const {interestId,revision,updatedAt,source,testVersion,deleted,...state}=entry;map[interestId]=normalizeRecord(state,updatedAt);}
 for(const op of cache.pending){if(op.action==='interests.delete')delete map[op.interestId];else map[op.interestId]=normalizeRecord(op.state);}
 return map;
}
/** Credentials are captured per request; the outbox contains neither tokens nor caller-supplied owners. */
export function createInterestQueue(deps:{store:InterestStore;api:InterestAPI;getSession:()=>Promise<AuthSession|null>;hash?:(v:string)=>Promise<string>;uuid?:()=>string;now?:()=>number;changed?:()=>void}){
 const {store,api,getSession}=deps,hash=deps.hash??digest,uuid=deps.uuid??(()=>crypto.randomUUID()),now=deps.now??Date.now;
 let context:Context|null=null,snapshot=blank(),generation=0,controller:AbortController|null=null;
 let running:object|null=null,timer:ReturnType<typeof setTimeout>|undefined,disposed=false;
 const listeners=new Set<()=>void>();
 function publish(value:InterestSnapshot){snapshot=value;for(const listener of listeners)listener();}
 const signalChange=()=>deps.changed?.();
 const valid=(db:InterestDatabase,c:Context)=>context===c&&!db.blocked[c.stamp]&&db.owners[c.owner]?.session===c.stamp;
 async function identity(session:AuthSession):Promise<Context>{return {owner:await hash(session.email.trim().toLowerCase()),stamp:await hash(JSON.stringify([session.email,session.deviceId,session.syncToken])),session};}
 async function show(phase:InterestPhase=snapshot.phase){
  const c=context,g=generation;
  if(phase==='auth_required'){publish(blank('auth_required'));return;}
  const value=await store.change(db=>{
   if(c&&!valid(db,c))return blank('auth_required');
   const cache=c?db.owners[c.owner]!:null;
   return {scope:c?.stamp??'guest',map:cache?project(cache):db.guest,phase:phase==='synced'&&cache?.pending.length?'pending':phase,pending:cache?.pending.length??0,
    guestCount:Object.keys(db.guest).length,conflicts:Object.keys(cache?.conflicts??{}),server:cache?.entries??{}};
  });
  if(g===generation&&!disposed)publish(value);
 }
 async function select(){
  const session=await getSession();
  const expired=!!session?.expiresAt&&Date.parse(session.expiresAt)<=now();
  if(!expired&&sameSession(context?.session??null,session)&&snapshot.scope!=='loading')return;
  const g=++generation;controller?.abort();controller=null;running=null;clearTimeout(timer);context=null;publish(blank());
  try{
   const c=session?await identity(session):null;
   if(g!==generation||disposed)return;
   if(expired){publish(blank('auth_required'));return;}
   const allowed=await store.change(db=>{
    if(c&&db.blocked[c.stamp])return false;
    if(c){const cache=db.owners[c.owner]??=emptyCache(c.stamp);if(cache.session!==c.stamp){cache.session=c.stamp;cache.lease=null;cache.retryAt=0;}}
    return true;
   });
   if(g!==generation||disposed)return;
   if(!sameSession(await getSession(),session)){if(g===generation)await select();return;}
   if(!allowed){publish(blank('auth_required'));return;}
   context=c;await show(c?'pending':'local');
  }catch{if(g===generation)publish(blank('storage_error'));}
 }
 async function active(scope:string){
  await select();
  if(scope!==snapshot.scope||scope==='loading')throw new InterestError('auth_required');
  const c=context;
  if(c&&!sameSession(await getSession(),c.session))throw new InterestError('auth_required');
  return c;
 }
 function schedule(delay:number){clearTimeout(timer);if(!disposed)timer=setTimeout(()=>{void sync();},Math.max(1000,delay));}
 async function sync(){
  await select();const c=context;if(!c||disposed||running)return;
  const token={};running=token;const abort=new AbortController();controller=abort;
  const leaseId=uuid();
  try{
   const wait=await store.change(db=>{
    if(!valid(db,c))throw new InterestError('auth_required');const cache=db.owners[c.owner]!;
    const until=cache.lease?.until??0;
    if(until>now()||cache.retryAt>now())return Math.max(until,cache.retryAt)-now();
    cache.lease={id:leaseId,until:now()+30000};return 0;
   });
   if(wait){schedule(wait);return;}
   await show('syncing');
   for(let n=0;n<512;n++){
    if(!sameSession(await getSession(),c.session)||context!==c||abort.signal.aborted)throw new InterestError('auth_required');
    const op=await store.change(db=>{
     if(!valid(db,c))throw new InterestError('auth_required');const cache=db.owners[c.owner]!;
     if(cache.lease?.id!==leaseId)throw new InterestError('unavailable');
     cache.lease.until=now()+30000;return cache.pending.find(p=>!cache.conflicts[p.interestId])??null;
    });
    if(!op)break;
    const result=await api.mutate(c.session,op,abort.signal);
    if(!sameSession(await getSession(),c.session)||context!==c||abort.signal.aborted)throw new InterestError('auth_required');
    await store.change(db=>{
     if(!valid(db,c))return;const cache=db.owners[c.owner]!;
     if(cache.lease?.id!==leaseId||!cache.pending.some(p=>p.operationId===op.operationId))return;
     if(result.entry)putEntry(cache,result.entry);
     if(!result.ok)cache.conflicts[op.interestId]=result.error;
     else{
      cache.pending=cache.pending.filter(p=>p.operationId!==op.operationId);
      // A receipt can return a newer tombstone. Dependent drafts must never auto-rebase onto it.
      if(result.entry.revision>result.appliedRevision&&cache.pending.some(p=>p.interestId===op.interestId))cache.conflicts[op.interestId]='revision_conflict';
     }
     cache.retryAt=0;cache.attempts=0;
    });signalChange();await show('syncing');
   }
   const entries=await api.list(c.session,abort.signal);
   if(!sameSession(await getSession(),c.session)||context!==c||abort.signal.aborted)throw new InterestError('auth_required');
   const ready=await store.change(db=>{if(!valid(db,c))return false;const cache=db.owners[c.owner]!;for(const entry of entries)putEntry(cache,entry);return cache.pending.some(p=>!cache.conflicts[p.interestId]);});
   signalChange();await show(snapshot.pending?'pending':'synced');
   if(ready)schedule(1000);
  }catch(error){
   if(context!==c)return;
   const code=error instanceof InterestError?error.code:'storage_error';
   if(code==='auth_required'){
    if(!sameSession(await getSession(),c.session)){await select();return;}
    await store.change(db=>{db.blocked[c.stamp]=true;}).catch(()=>{});signalChange();
   }
   if(['offline','unavailable','rate_limited'].includes(code)){
    const delay=await store.change(db=>{
     if(!valid(db,c))return 0;const cache=db.owners[c.owner]!;cache.attempts++;
     const delay=Math.max(error instanceof InterestError?error.retryAfter:0,Math.min(60000,1000*2**Math.min(cache.attempts,6)));
     cache.retryAt=now()+delay;return delay;
    }).catch(()=>0);if(delay)schedule(delay);
   }
   await show(code as InterestPhase).catch(()=>publish(blank('storage_error')));
  }finally{
   await store.change(db=>{const cache=db.owners[c.owner];if(cache?.lease?.id===leaseId)cache.lease=null;}).catch(()=>{});
   if(running===token){running=null;controller=null;}
  }
 }
 async function edit(id:string,state:InterestState|null,scope:string){
  try{
   if(!/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/.test(id))throw new InterestError('invalid_request');
   const checked=state?interestStateSchema.parse(state):null,c=await active(scope);
   await store.change(db=>{
    if(c){if(!valid(db,c))throw new InterestError('auth_required');append(db.owners[c.owner]!,id,checked,uuid);}
    else if(checked)db.guest[id]=normalizeRecord(checked);else delete db.guest[id];
   });signalChange();await show(c?'pending':'local');void sync();return true;
  }catch(error){if(scope!==snapshot.scope)return false;await show(error instanceof InterestError?error.code as InterestPhase:'storage_error').catch(()=>publish(blank('storage_error')));return false;}
 }
 return {
  getSnapshot:()=>snapshot,
  subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};},
  select, sync,
  async reload(){await select();await show();},
  save:(id:string,state:InterestState,scope:string)=>edit(id,state,scope),
  remove:(id:string,scope:string)=>edit(id,null,scope),
  async resolve(id:string,keepLocal:boolean,scope:string){
   try{
    const c=await active(scope);if(!c)return false;
    await store.change(db=>{
     if(!valid(db,c))throw new InterestError('auth_required');const cache=db.owners[c.owner]!;
     if(!cache.conflicts[id])return;
     const last=[...cache.pending].reverse().find(p=>p.interestId===id);
     cache.pending=cache.pending.filter(p=>p.interestId!==id);delete cache.conflicts[id];
     if(keepLocal&&last)append(cache,id,last.action==='interests.set'?last.state:null,uuid);
    });signalChange();await show('pending');void sync();return true;
   }catch{await show('storage_error').catch(()=>{});return false;}
  },
  async importGuest(scope:string){
   try{
    const c=await active(scope);if(!c)return false;
    await store.change(db=>{
     if(!valid(db,c))throw new InterestError('auth_required');const cache=db.owners[c.owner]!;
     for(const [id,record] of Object.entries(db.guest)){
      const {at,...state}=record;append(cache,id,{...state,visibility:'private',useForDiscovery:false},uuid);
     }
     db.guest={};
    });signalChange();await show('pending');void sync();return true;
   }catch{await show('storage_error').catch(()=>{});return false;}
  },
  async prepareLogout(expected?:AuthSession|null){
   const session=await getSession();if(expected!==undefined&&!sameSession(session,expected))throw new InterestError('auth_required');if(!session)return null;const c=await identity(session);
   if(!sameSession(await getSession(),session))throw new InterestError('auth_required');
   const pending=await store.change(db=>{db.blocked[c.stamp]=true;return db.owners[c.owner]?.pending.length??0;});
   controller?.abort();generation++;context=null;running=null;clearTimeout(timer);publish(blank('auth_required'));signalChange();return {...c,pending};
  },
  async finishLogout(c:Context|null,success:boolean){
   if(!c)return;
   await store.change(db=>{
    if(success){if(db.owners[c.owner]?.session===c.stamp)delete db.owners[c.owner];}
    else delete db.blocked[c.stamp];
   });signalChange();await select();await show();if(!success)void sync();
  },
  dispose(){disposed=true;generation++;controller?.abort();clearTimeout(timer);listeners.clear();}
 };
}
