import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {feRequest,FeError} from '../feture/fe-api';
import {connectRealtime,type RtKind,type RtListener} from './realtime';

/** What `session.bootstrap` returns: the FetUre account and the profiles this account may act as. */
const profileCard=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string(),state:z.string(),avatarAssetId:z.uuid().nullable(),avatar:z.string().nullable().optional()});
/** realtime: the public socket address and the opaque per-profile channels (S2 §8); null when the server has none. */
const realtimeCfg=z.object({url:z.url(),key:z.string().min(1),channels:z.record(z.uuid(),z.string().regex(/^fe:[A-Za-z0-9_-]{22,}$/))});
export const bootstrapSchema=z.object({ok:z.literal(true),account:z.object({id:z.uuid(),locale:z.string(),onboarded:z.boolean()}),profiles:z.array(profileCard),realtime:realtimeCfg.nullable().optional()});
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
 call:<T>(action:string,input:Record<string,unknown>,schema:z.ZodType<T>,opts?:{asAccount?:boolean,profileId?:string,signal?:AbortSignal})=>Promise<T>;
};

const Ctx=createContext<FeSession|null>(null);
/** Realtime listeners live in their own context: a signal never re-renders the session consumers. */
const RtCtx=createContext<((l:RtListener)=>()=>void)|null>(null);
const ACTING_KEY='feture.fe.acting';

export function FeSessionProvider({children}:{children:ReactNode}){
 const auth=useOptionalAuth();
 const [state,setState]=useState<State>({status:'loading'});
 const [nonce,setNonce]=useState(0);
 const [actingId,setActingId]=useState<string|null>(()=>{try{return sessionStorage.getItem(ACTING_KEY);}catch{return null;}});
 useEffect(()=>{
  if(auth.loading){setState({status:'loading'});return;}
  if(!auth.session){setState({status:'signedOut'});return;}
  const session=auth.session;const ctl=new AbortController();
  setState({status:'loading'});
  feRequest(session,'session.bootstrap',{},bootstrapSchema,{signal:ctl.signal})
   .then(boot=>setState({status:'ready',session,boot}))
   .catch(error=>{if(!ctl.signal.aborted)setState(error instanceof FeError&&error.code==='auth_required'?{status:'signedOut'}:{status:'error',error});});
  return ()=>ctl.abort();
 },[auth.loading,auth.session,nonce]);
 const profiles=state.status==='ready'?state.boot.profiles.filter(p=>p.state!=='deleted'):[];
 const acting=profiles.find(p=>p.id===actingId)??profiles.find(p=>p.kind==='person')??null;
 const setActing=useCallback((id:string)=>{setActingId(id);try{sessionStorage.setItem(ACTING_KEY,id);}catch{/* this tab only */}},[]);
 const reload=useCallback(()=>setNonce(n=>n+1),[]);
 const call=useCallback(<T,>(action:string,input:Record<string,unknown>,schema:z.ZodType<T>,opts:{asAccount?:boolean,profileId?:string,signal?:AbortSignal}={})=>{
  if(state.status!=='ready')return Promise.reject(new FeError('auth_required'));
  return feRequest(state.session,action,input,schema,{signal:opts.signal,profileId:opts.asAccount?undefined:opts.profileId??acting?.id});
 },[state,acting?.id]);
 const value=useMemo(()=>({state,acting,setActing,reload,call}),[state,acting,setActing,reload,call]);
 // One socket per signed-in session, joined to the channels of every profile this account may act as.
 const listeners=useRef(new Set<RtListener>());
 const rt=state.status==='ready'?state.boot.realtime??null:null;
 const rtKey=rt?JSON.stringify(rt):'';
 useEffect(()=>{
  if(!rt)return;
  const conn=connectRealtime(rt,(kind,profile)=>{for(const l of [...listeners.current]){try{l(kind,profile);}catch{/* one screen never breaks another */}}});
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

export function useFe(){
 const value=useContext(Ctx);
 if(!value)throw new Error('useFe outside FeSessionProvider');
 return value;
}
