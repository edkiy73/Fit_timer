import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {feRequest,FeError} from '../feture/fe-api';

/** What `session.bootstrap` returns: the FetUre account and the profiles this account may act as. */
const profileCard=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string(),state:z.string(),avatarAssetId:z.uuid().nullable(),avatar:z.string().nullable().optional()});
export const bootstrapSchema=z.object({ok:z.literal(true),account:z.object({id:z.uuid(),locale:z.string(),onboarded:z.boolean()}),profiles:z.array(profileCard)});
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
 return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFe(){
 const value=useContext(Ctx);
 if(!value)throw new Error('useFe outside FeSessionProvider');
 return value;
}
