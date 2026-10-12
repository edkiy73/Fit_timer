import { z } from 'zod';
import type { AuthSession } from '@appbase/core/auth.js';
import type { InterestDTO, Mutation, MutationResult } from '../../lib/feture/contracts';
import { interestStateSchema } from './model';

const id=z.string().regex(/^interest-[1-9]\d{0,2}-[1-9]\d{0,2}$/);
const state=interestStateSchema;
export const dto=state.safeExtend({interestId:id,revision:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
 updatedAt:z.string().datetime({offset:true}),source:z.enum(['manual','test']),testVersion:z.string().uuid().nullable(),deleted:z.boolean()
}).refine(v=>v.source==='manual'?v.testVersion===null:v.testVersion!==null)
 .refine(v=>!v.deleted||(v.stance==='unknown'&&v.experience==='unspecified'&&v.boundary==='none'&&v.boundaryNote===null&&v.intensity===null&&v.visibility==='private'&&!v.useForDiscovery&&v.source==='manual'));
const page=z.object({ok:z.literal(true),items:z.array(dto).max(50),nextCursor:z.string().regex(/^v1\.[A-Za-z0-9_-]{1,156}$/).nullable()});
const result=z.discriminatedUnion('ok',[
 z.object({ok:z.literal(true),replayed:z.boolean(),appliedRevision:z.number().int().min(1),appliedAt:z.string().datetime({offset:true}),entry:dto}),
 z.object({ok:z.literal(false),error:z.enum(['revision_conflict','operation_conflict']),entry:dto.nullable()})
]);
export class InterestError extends Error {
 constructor(public code:string,public retryAfter=0){super(code);}
}
export interface InterestAPI {
 list(session:AuthSession,signal:AbortSignal):Promise<InterestDTO[]>;
 mutate(session:AuthSession,command:Mutation,signal:AbortSignal):Promise<MutationResult>;
}
export function sameSession(a:AuthSession|null,b:AuthSession|null){
 return a===b||!!a&&!!b&&a.email===b.email&&a.deviceId===b.deviceId&&a.syncToken===b.syncToken;
}
export function createInterestAPI(endpoint:string,getSession:()=>Promise<AuthSession|null>,send:typeof fetch=globalThis.fetch):InterestAPI {
 // Credential-storage failures must never be mistaken for an offline request:
 // no response may be accepted when the active owner session is unreadable.
 async function checkedSession():Promise<AuthSession|null>{
  try{return await getSession();}
  catch{throw new InterestError('auth_required');}
 }
 async function post(session:AuthSession,body:object,signal:AbortSignal){
  if(!sameSession(await checkedSession(),session)||session.expiresAt&&Date.parse(session.expiresAt)<=Date.now())throw new InterestError('auth_required');
  try {
   const response=await send(endpoint,{method:'POST',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),
    headers:{'Content-Type':'application/json','x-fit-email':session.email,'x-fit-device':session.deviceId,'x-fit-token':session.syncToken},body:JSON.stringify(body)});
   if(!sameSession(await checkedSession(),session)||signal.aborted)throw new InterestError('auth_required');
   // Proxy/provider error pages are not guaranteed to be JSON.
   // Respect the HTTP status (particularly 429 Retry-After) before parsing a body.
   if(!response.ok&&response.status!==409){
    const code=response.status===401?'auth_required':response.status===403?'adult_verification_required':response.status===429?'rate_limited':response.status===422||response.status===413?'invalid_request':'unavailable';
    const retry=Number(response.headers.get('Retry-After'));
    throw new InterestError(code,Number.isFinite(retry)?Math.min(300000,Math.max(0,retry*1000)):0);
   }
   // An HTTP response with unreadable JSON is a bad server/proxy envelope,
   // not proof that the device is offline. Keep immutable outbox commands for
   // a later retry, without mislabelling this as a connectivity failure.
   let data:unknown;
   try{data=await response.json();}
   catch{throw new InterestError(signal.aborted?'auth_required':'unavailable');}
   if(!sameSession(await checkedSession(),session)||signal.aborted)throw new InterestError('auth_required');
   return data;
  }catch(error){if(error instanceof InterestError)throw error;throw new InterestError(signal.aborted?'auth_required':'offline');}
 }
 return {
  async list(session,signal){
   const items:InterestDTO[]=[];let cursor:string|null=null;const cursors=new Set<string>();
   for(let n=0;n<20;n++){
    const checked=page.safeParse(await post(session,{action:'interests.list',limit:50,...(cursor?{cursor}:{})},signal));
    if(!checked.success)throw new InterestError('unavailable');
    const value=checked.data;
    for(const entry of value.items){if(items.some(i=>i.interestId===entry.interestId))throw new InterestError('unavailable');items.push(entry);}
    if(value.nextCursor===null)return items;
    if(cursors.has(value.nextCursor)||value.items.length===0)throw new InterestError('unavailable');
    cursor=value.nextCursor;cursors.add(cursor);
   }
   throw new InterestError('unavailable');
  },
  async mutate(session,command,signal){
   const checked=result.safeParse(await post(session,command,signal));
   if(!checked.success)throw new InterestError('unavailable');
   const value=checked.data;
   if(value.entry&&value.entry.interestId!==command.interestId||value.ok&&(value.appliedRevision!==command.expectedRevision+1||value.entry.revision<value.appliedRevision))throw new InterestError('unavailable');
   return value;
  }
 };
}
