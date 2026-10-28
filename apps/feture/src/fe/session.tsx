import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {feRequest,FeError} from '../feture/fe-api';
import {connectRealtime,type RtKind,type RtListener} from './realtime';
import {forgetWebPush,noteAction} from './push-web';
import {forgetNativePush} from './push-native';

/** What `session.bootstrap` returns: the FetUre account and the profiles this account may act as. */
const profileCard=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string(),state:z.string(),avatarAssetId:z.uuid().nullable(),avatar:z.string().nullable().optional()});
/** realtime: the public socket address and the opaque per-profile channels (S2 §8); null when the server has none. */
const realtimeCfg=z.object({url:z.url(),key:z.string().min(1),channels:z.record(z.uuid(),z.string().regex(/^fe:[A-Za-z0-9_-]{22,}$/))});
export const bootstrapSchema=z.object({ok:z.literal(true),account:z.object({id:z.uuid(),locale:z.string(),onboarded:z.boolean()}),profiles:z.array(profileCard),realtime:realtimeCfg.nullable().optional(),
 /** Web push: the server's public VAPID key; null while the server sends none. */
 push:z.object({webKey:z.string().regex(/^[A-Za-z0-9_-]{80,100}$/)}).nullable().optional()});
export type ProfileCard=z.infer<typeof profileCard>;
export type Bootstrap=z.infer<typeof bootstrapSchema>;

type State=
 |{status:'loading'}
 |{status:'signedOut'}
 |{status:'error',error:unknown}
 |{status:'ready',session:AuthSession,boot:Bootstrap};

type FeSession={
 state:State;
 /** The profile actions are sent as («Я» or «Мы»); the person profile until the person switches. */
 acting:ProfileCard|null;
 setActing:(profileId:string)=>void;
 reload:()=>void;
 call:<T>(action:string,input:Record<string,unknown>,schema:z.ZodType<T>,opts?:{asAccount?:boolean,profileId?:string,signal?:AbortSignal,fresh?:boolean})=>Promise<T>;
};

const Ctx=createContext<FeSession|null>(null);
/** Realtime listeners live in their own context: a signal never re-renders the session consumers. */
const RtCtx=createContext<((l:RtListener)=>()=>void)|null>(null);
const ACTING_KEY='feture.fe.acting';
const BOOT_KEY='feture.fe.boot:';
/** Reads (no opId) are kept for a short while so returning to a tab is instant; any write or realtime signal drops
 * them all, so nothing stale outlives a change. The server stays the source of truth. */
const READ_TTL=30000;
const wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
const readCache=new Map<string,{at:number,value:Promise<unknown>}>();
/** Writes whose input carries no opId (contracts with `ledger: false`): never served from the cache, and they drop it.
 * Without this a second «Без звука» / «В архив» within 30 s was answered from memory and never reached the server. */
const WRITES_WITHOUT_OPID=new Set(['chat.read','chat.mute','chat.archive','notifications.read','notifications.readAll','media.commit','staff.mediaView','profile.setVisibility']);
const schemaIds=new WeakMap<object,number>();let schemaSeq=0;
export function dropReadCache(){readCache.clear();}

export function FeSessionProvider({children}:{children:ReactNode}){
 const auth=useOptionalAuth();
 const [state,setState]=useState<State>({status:'loading'});
 const [nonce,setNonce]=useState(0);
 const [actingId,setActingId]=useState<string|null>(()=>{try{return sessionStorage.getItem(ACTING_KEY);}catch{return null;}});
 // Signed out after being signed in: this browser stops getting the account's pushes.
 const had=useRef(false);
 useEffect(()=>{if(auth.session)had.current=true;else if(!auth.loading&&had.current){had.current=false;void forgetWebPush();void forgetNativePush();}},[auth.loading,auth.session]);
 useEffect(()=>{
  if(auth.loading){setState({status:'loading'});return;}
  if(!auth.session){readCache.clear();try{for(const k of Object.keys(localStorage))if(k.startsWith(BOOT_KEY))localStorage.removeItem(k);}catch{/* no storage */}setState({status:'signedOut'});return;}
  const session=auth.session;const ctl=new AbortController();
  // The last bootstrap of this account paints the app at once; the fresh one replaces it in the background.
  let cached:Bootstrap|null=null;
  try{const raw=localStorage.getItem(BOOT_KEY+session.email);if(raw){const r=bootstrapSchema.safeParse(JSON.parse(raw));if(r.success)cached=r.data;}}catch{/* no storage */}
  setState(cached?{status:'ready',session,boot:cached}:{status:'loading'});
  // «Too many at once» (429) is asked again after a pause before the whole app shows an error.
  const ask=()=>feRequest(session,'session.bootstrap',{},bootstrapSchema,{signal:ctl.signal});
  const later=(ms:number)=>(e:unknown)=>e instanceof FeError&&e.code==='rate_limited'&&!ctl.signal.aborted?wait(ms).then(ask):Promise.reject(e);
  ask().catch(later(2500)).catch(later(6000))
   .then(boot=>{try{localStorage.setItem(BOOT_KEY+session.email,JSON.stringify(boot));}catch{/* no storage */}
    setState(cur=>cur.status==='ready'&&JSON.stringify(cur.boot)===JSON.stringify(boot)?cur:{status:'ready',session,boot});})
   .catch(error=>{if(!ctl.signal.aborted)setState(cached&&!(error instanceof FeError&&error.code==='auth_required')?(cur=>cur):error instanceof FeError&&error.code==='auth_required'?{status:'signedOut'}:{status:'error',error});});
  return ()=>ctl.abort();
 },[auth.loading,auth.session,nonce]);
 const profiles=state.status==='ready'?state.boot.profiles.filter(p=>p.state!=='deleted'):[];
 const acting=profiles.find(p=>p.id===actingId)??profiles.find(p=>p.kind==='person')??null;
 const setActing=useCallback((id:string)=>{setActingId(id);try{sessionStorage.setItem(ACTING_KEY,id);}catch{/* this tab only */}},[]);
 const reload=useCallback(()=>setNonce(n=>n+1),[]);
 const call=useCallback(<T,>(action:string,input:Record<string,unknown>,schema:z.ZodType<T>,opts:{asAccount?:boolean,profileId?:string,signal?:AbortSignal,/** Skip the short read cache: «Обновить» and other explicit refreshes. */ fresh?:boolean}={})=>{
  if(state.status!=='ready')return Promise.reject(new FeError('auth_required'));
  const profileId=opts.asAccount?undefined:opts.profileId??acting?.id;
  if('opId' in input||WRITES_WITHOUT_OPID.has(action)){ // a write: whatever was read before may have changed
   readCache.clear();
   return feRequest(state.session,action,input,schema,{signal:opts.signal,profileId}).then(r=>{noteAction(action);return r;}).finally(()=>readCache.clear());
  }
  let sid=schemaIds.get(schema);if(sid==null){sid=++schemaSeq;schemaIds.set(schema,sid);}
  const key=JSON.stringify([state.session.email,profileId??'',action,input,sid]);
  const hit=readCache.get(key);
  if(hit&&!opts.fresh&&Date.now()-hit.at<READ_TTL)return hit.value as Promise<T>;
  // Not bound to the caller's AbortSignal: a screen that unmounts must not cancel a read another screen will reuse.
  // A read refused for «too many at once» (429) is asked again after a short pause instead of failing the screen;
  // writes never retry on their own.
  const once=()=>feRequest(state.session,action,input,schema,{profileId});
  const value=once().catch(e=>e instanceof FeError&&e.code==='rate_limited'?wait(2500).then(once):Promise.reject(e))
   .catch(e=>e instanceof FeError&&e.code==='rate_limited'?wait(6000).then(once):Promise.reject(e));
  readCache.set(key,{at:Date.now(),value});
  value.catch(()=>{if(readCache.get(key)?.value===value)readCache.delete(key);});
  if(opts.signal){const sig=opts.signal;return new Promise<T>((res,rej)=>{sig.addEventListener('abort',()=>rej(new DOMException('Aborted','AbortError')),{once:true});value.then(res,rej);});}
  return value;
 },[state,acting?.id]);
 const value=useMemo(()=>({state,acting,setActing,reload,call}),[state,acting,setActing,reload,call]);
 // One socket per signed-in session, joined to the channels of every profile this account may act as.
 const listeners=useRef(new Set<RtListener>());
 const rt=state.status==='ready'?state.boot.realtime??null:null;
 const rtKey=rt?JSON.stringify(rt):'';
 useEffect(()=>{
  if(!rt)return;
  // «печатает…» changes no data: it never empties the read cache.
  const conn=connectRealtime(rt,(kind,profile,tag)=>{if(kind!=='typing')readCache.clear();for(const l of [...listeners.current]){try{l(kind,profile,tag);}catch{/* one screen never breaks another */}}});
  return ()=>conn.close();
 },[rtKey]);
 const subscribe=useCallback((l:RtListener)=>{listeners.current.add(l);return ()=>{listeners.current.delete(l);};},[]);
 return <Ctx.Provider value={value}><RtCtx.Provider value={subscribe}>{children}</RtCtx.Provider></Ctx.Provider>;
}

/** Calls `handler` when a realtime signal of one of `kinds` arrives (any own profile), and once after a reconnect
 * (signals may have been missed). Data is never in the signal: the handler fetches with the normal commands.
 * Signals in a burst are coalesced (250 ms), so a screen reloads once. */
export function useRealtime(kinds:RtKind|readonly RtKind[],handler:()=>void){
 const subscribe=useContext(RtCtx);
 const latest=useRef(handler);latest.current=handler;
 const key=[kinds].flat().join(',');
 useEffect(()=>{
  if(!subscribe)return;
  const wanted=new Set(key.split(','));let timer:ReturnType<typeof setTimeout>|undefined;
  const off=subscribe(kind=>{
   if(kind!==null&&!wanted.has(kind))return;
   clearTimeout(timer);timer=setTimeout(()=>latest.current(),250);
  });
  return ()=>{clearTimeout(timer);off();};
 },[subscribe,key]);
}

/** «печатает…»: calls `handler` at once for each typing signal whose conversation tag is `tag` (chat.messages
 * `typingTag`); a reconnect or another chat's signal is ignored. */
export function useTypingSignal(tag:string|null|undefined,handler:()=>void){
 const subscribe=useContext(RtCtx);
 const latest=useRef(handler);latest.current=handler;
 useEffect(()=>{
  if(!subscribe||!tag)return;
  return subscribe((kind,_p,t)=>{if(kind==='typing'&&t===tag)latest.current();});
 },[subscribe,tag]);
}

export function useFe(){
 const value=useContext(Ctx);
 if(!value)throw new Error('useFe outside FeSessionProvider');
 return value;
}

const approvalRes=z.object({ok:z.literal(true),couple:z.object({members:z.array(z.object({me:z.boolean(),approvesPartner:z.boolean().optional()}).passthrough())}).passthrough()});
/** Acting as the couple: true when the partner approves the couple's changes (their `approvesPartner`), so a button
 * says it goes to the partner before it is pressed. False as a person or while unknown — the server's `pending`
 * answer still decides the toast. */
export function usePartnerApproves(){
 const {call,acting}=useFe();const [on,setOn]=useState(false);
 const id=acting?.kind==='couple'?acting.id:null;
 const read=useCallback((fresh:boolean)=>{if(!id)return ()=>{};let live=true;
  call('couple.get',{},approvalRes,{profileId:id,fresh}).then(r=>{if(live)setOn(!!r.couple.members.find(m=>!m.me)?.approvesPartner);}).catch(()=>{});
  return ()=>{live=false;};},[call,id]);
 useEffect(()=>{setOn(false);return read(false);},[read]);
 // A partner switching approval on or off reaches the couple as a notification.
 useRealtime(['decide','notify'],()=>{read(true);});
 return on;
}
