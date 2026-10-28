import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {feRequest,FeError} from '../feture/fe-api';
import {connectRealtime,type RtKind,type RtListener} from './realtime';
import {forgetWebPush,noteAction} from './push-web';
import {forgetNativePush} from './push-native';
import {linksExpireAt} from './kit/media';

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
 /** The last answer this session got for a read, at once (null when never read): a screen draws it on its first frame
  * and reads again behind it, so a revisit never flashes a skeleton. Writes and signals do not forget it. */
 peek:<T>(action:string,input:Record<string,unknown>,schema:z.ZodType<T>,opts?:{asAccount?:boolean,profileId?:string})=>T|null;
};

const Ctx=createContext<FeSession|null>(null);
/** Realtime listeners live in their own context: a signal never re-renders the session consumers. */
const RtCtx=createContext<((l:RtListener)=>()=>void)|null>(null);
const ACTING_KEY='feture.fe.acting';
const BOOT_KEY='feture.fe.boot:';
/** Reads (no opId) are kept so returning to a screen is instant; any write or realtime signal drops them all, so
 * nothing stale outlives a change. The server stays the source of truth. A read younger than READ_TTL is answered
 * from memory; an older one (up to STALE_TTL) is answered from memory too — the screen appears at once, whole — while
 * it is asked again in the background, and the new answer is what the next visit shows.
 * The cache holds the server's raw answer per (account, profile, command, input): two screens that read the same
 * command with different schemas share one request. */
const READ_TTL=30000;
const STALE_TTL=10*60000;
const READ_MAX=400;
/** Pauses before a read refused with 429 is asked again: together longer than the server's one-minute window. */
const READ_BACKOFF=[2500,6000,15000,40000];
const wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
type Entry={at:number,action:string,value:Promise<unknown>,settled:boolean,refreshing?:boolean,/** The first media link inside it stops working (ms). */ until?:number|null};
/** An answer is never served from memory once a media link in it is about to run out (signed links live 5–10 min,
 * shorter than STALE_TTL): avatars and pictures came back broken. A minute to spare for the picture to load. */
const LINK_SPARE=60000;
const usable=(e:Entry|undefined):e is Entry=>!!e&&(e.until==null||Date.now()<e.until-LINK_SPARE);
const readCache=new Map<string,Entry>();
const raw=z.unknown();
/** The schema check a screen asks for, on a shared raw answer: a mismatch is the same «unavailable» feRequest gives. */
function parse<T>(value:Promise<unknown>,schema:z.ZodType<T>):Promise<T>{
 return value.then(body=>{const r=schema.safeParse(body);if(!r.success)throw new FeError('unavailable',200);return r.data;});
}
/** Writes that change only a known corner: they drop the reads of that corner, not the whole cache. A Discover swipe
 * changes the deck, likes and matches — never the catalog, one's own follows or other screens — so a swipe costs one
 * request instead of every open screen reading again (owner 28.10.2026: the rate limit after a few swipes). */
const NARROW_WRITES:Record<string,RegExp>={'discover.decide':/^(discover\.|likes\.|matches\.)/};
const dropReads=(action:string)=>{const only=NARROW_WRITES[action];if(!only){readCache.clear();return;}for(const [k,v] of readCache)if(only.test(v.action))readCache.delete(k);};
/** Writes whose input carries no opId (contracts with `ledger: false`): never served from the cache, and they drop it.
 * Without this a second «Без звука» / «В архив» within 30 s was answered from memory and never reached the server. */
const WRITES_WITHOUT_OPID=new Set(['chat.read','chat.mute','chat.archive','notifications.read','notifications.readAll','media.commit','staff.mediaView','profile.setVisibility']);
export function dropReadCache(){readCache.clear();}
/** The last answer per read key — what a screen shows first on a revisit (see `peek`); emptied only at sign-out. */
const lastBody=new Map<string,unknown>();
const remember=(key:string,body:unknown)=>{lastBody.delete(key);lastBody.set(key,body);if(lastBody.size>READ_MAX){const first=lastBody.keys().next().value;if(first!==undefined)lastBody.delete(first);}};
/** What screens showed last, per account (`useShown`); emptied at sign-out. */
const shownMemo=new Map<string,unknown>();

export function FeSessionProvider({children}:{children:ReactNode}){
 const auth=useOptionalAuth();
 // Core refreshes the session object in the background (rights, handle): only a different login or token is a new
 // session here, so the refresh does not start bootstrap and every screen's reads over again.
 const sessionKey=auth.session?[auth.session.email,auth.session.deviceId,auth.session.syncToken].join('\n'):'';
 const latestSession=useRef(auth.session);latestSession.current=auth.session;
 const [state,setState]=useState<State>({status:'loading'});
 const [nonce,setNonce]=useState(0);
 const [actingId,setActingId]=useState<string|null>(()=>{try{return sessionStorage.getItem(ACTING_KEY);}catch{return null;}});
 // Signed out after being signed in: this browser stops getting the account's pushes.
 const had=useRef(false);
 useEffect(()=>{if(auth.session)had.current=true;else if(!auth.loading&&had.current){had.current=false;void forgetWebPush();void forgetNativePush();}},[auth.loading,auth.session]);
 useEffect(()=>{
  if(auth.loading){setState({status:'loading'});return;}
  if(!sessionKey){readCache.clear();lastBody.clear();shownMemo.clear();try{for(const k of Object.keys(localStorage))if(k.startsWith(BOOT_KEY))localStorage.removeItem(k);}catch{/* no storage */}setState({status:'signedOut'});return;}
  const session=latestSession.current!;const ctl=new AbortController();
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
 },[auth.loading,sessionKey,nonce]);
 const profiles=state.status==='ready'?state.boot.profiles.filter(p=>p.state!=='deleted'):[];
 const acting=profiles.find(p=>p.id===actingId)??profiles.find(p=>p.kind==='person')??null;
 const setActing=useCallback((id:string)=>{setActingId(id);try{sessionStorage.setItem(ACTING_KEY,id);}catch{/* this tab only */}},[]);
 const reload=useCallback(()=>setNonce(n=>n+1),[]);
 // `call` keeps its identity while the same login acts as the same profile: screens load with `useEffect(…,[call])`,
 // so a new `call` reloads every open screen — a refreshed bootstrap or session object must not do that (owner
 // 28.10.2026: «моргает при скролле и вылетает в новую загрузку»).
 const stateRef=useRef(state);stateRef.current=state;
 const ready=state.status==='ready';
 const call=useCallback(<T,>(action:string,input:Record<string,unknown>,schema:z.ZodType<T>,opts:{asAccount?:boolean,profileId?:string,signal?:AbortSignal,/** Skip the short read cache: «Обновить» and other explicit refreshes. */ fresh?:boolean}={})=>{
  const state=stateRef.current;
  if(state.status!=='ready')return Promise.reject(new FeError('auth_required'));
  const profileId=opts.asAccount?undefined:opts.profileId??acting?.id;
  // The newest session object (same login and token): its expiry may have been extended by Core's refresh.
  const cur=latestSession.current;
  const session=cur&&[cur.email,cur.deviceId,cur.syncToken].join('\n')===sessionKey?cur:state.session;
  if('opId' in input||WRITES_WITHOUT_OPID.has(action)){ // a write: whatever was read before may have changed
   dropReads(action);
   return feRequest(session,action,input,schema,{signal:opts.signal,profileId}).then(r=>{noteAction(action);return r;}).finally(()=>dropReads(action));
  }
  const key=JSON.stringify([session.email,profileId??'',action,input]);
  const cached=readCache.get(key);const hit=usable(cached)?cached:undefined;const age=hit?Date.now()-hit.at:Infinity;
  // A read refused for «too many at once» (429) is asked again, quietly, with growing pauses that outlast the
  // per-minute window (owner 28.10.2026: a read never shows a rate-limit error); writes never retry on their own.
  const once=()=>feRequest(session,action,input,raw,{profileId});
  const ask=()=>READ_BACKOFF.reduce<Promise<unknown>>((p,ms)=>p.catch(e=>e instanceof FeError&&e.code==='rate_limited'?wait(ms+Math.random()*1000).then(once):Promise.reject(e)),once());
  const store=(value:Promise<unknown>)=>{
   const entry:Entry={at:Date.now(),action,value,settled:false};readCache.set(key,entry);
   value.then(body=>{entry.settled=true;entry.until=linksExpireAt(body);remember(key,body);},()=>{if(readCache.get(key)===entry)readCache.delete(key);});
   if(readCache.size>READ_MAX){const first=readCache.keys().next().value;if(first!==undefined)readCache.delete(first);}
  };
  let value:Promise<unknown>;
  if(hit&&!opts.fresh&&age<READ_TTL)value=hit.value;
  else if(hit&&!opts.fresh&&age<STALE_TTL&&hit.settled){
   // Stale: answer from memory now, ask the server in the background.
   value=hit.value;
   if(!hit.refreshing){hit.refreshing=true;
    // The new answer is kept for the next visit; an open screen is never torn down under the reader.
    ask().then(body=>{
     if(readCache.get(key)!==hit)return; // a write or a signal emptied the cache meanwhile
     readCache.set(key,{at:Date.now(),action,value:Promise.resolve(body),settled:true,until:linksExpireAt(body)});remember(key,body);
    },()=>{hit.refreshing=false;});}
  }else{value=ask();store(value);}
  // Not bound to the caller's AbortSignal: a screen that unmounts must not cancel a read another screen will reuse.
  const parsed=parse(value,schema);
  if(opts.signal){const sig=opts.signal;return new Promise<T>((res,rej)=>{sig.addEventListener('abort',()=>rej(new DOMException('Aborted','AbortError')),{once:true});parsed.then(res,rej);});}
  return parsed;
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,acting?.id,sessionKey]);
 const peek=useCallback(<T,>(action:string,input:Record<string,unknown>,schema:z.ZodType<T>,opts:{asAccount?:boolean,profileId?:string}={}):T|null=>{
  const state=stateRef.current;if(state.status!=='ready')return null;
  const profileId=opts.asAccount?undefined:opts.profileId??acting?.id;
  const key=JSON.stringify([state.session.email,profileId??'',action,input]);
  if(!lastBody.has(key))return null;const r=schema.safeParse(lastBody.get(key));return r.success?r.data:null;
 },[acting?.id]);
 const value=useMemo(()=>({state,acting,setActing,reload,call,peek}),[state,acting,setActing,reload,call,peek]);
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

/** Another `key` (another profile, list or screen subject) starts from empty: `reset` runs during that render (React's
 * «state from the previous render» pattern, no effect, so no frame with the old one). Reading the same key again — a
 * revisit, a realtime signal, a retry — keeps what is on screen until the new answer replaces it. */
/** `useState` that remembers its value per account and `key` across visits: a screen opened again draws what it
 * showed last (its own optimistic changes included) on the first frame, then its reads replace it. `initial` runs only
 * when nothing is remembered — typically `peek` of the screen's read. */
export function useShown<T>(key:string,initial:()=>T):[T,(v:T|((x:T)=>T))=>void]{
 const {state,acting}=useFe();const full=(state.status==='ready'?state.session.email:'')+'\n'+(acting?.id??'')+'\n'+key;
 const [v,setV]=useState<T>(()=>shownMemo.has(full)?shownMemo.get(full) as T:initial());
 const fullRef=useRef(full);
 useKeyChange(full,()=>{fullRef.current=full;setV(shownMemo.has(full)?shownMemo.get(full) as T:initial());});
 const set=useCallback((next:T|((x:T)=>T))=>setV(cur=>{const n=typeof next==='function'?(next as (x:T)=>T)(cur):next;shownMemo.set(fullRef.current,n);return n;}),[]);
 return [v,set];
}

export function useKeyChange(key:string,reset:()=>void){const [was,setWas]=useState(key);if(was!==key){setWas(key);reset();}}

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
