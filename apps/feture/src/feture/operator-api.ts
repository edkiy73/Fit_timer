import type {AdminClient,AdminError} from '@appbase/core/admin.js';
import type {AuthSession} from '@appbase/core/auth.js';
import {z} from 'zod';
import {sameSession} from './interest-api';

export const operatorRole=z.enum(['manager','qa_operator','auditor']).nullable();
export const operatorStatus=z.object({ok:z.literal(true),role:operatorRole,initialized:z.boolean(),events:z.array(z.object({actor:z.string().regex(/^[a-f0-9]{32}$/),accountHash:z.string().regex(/^[a-f0-9]{32}$/),action:z.enum(['bootstrap','role_set']),role:operatorRole,revision:z.number().int().positive(),at:z.iso.datetime({offset:true})}).strict()).max(25),items:z.array(z.object({accountHash:z.string().regex(/^[a-f0-9]{32}$/),role:operatorRole,revision:z.number().int().positive()}).strict()).max(100)}).strict();
export const operatorLabels={manager:'Управляющий FetUre',qa_operator:'Оператор QA',auditor:'Аудитор FetUre'};
const actions=new Set(['feture.posts.reports','feture.posts.resolveReport','feture.posts.reportAudit','feture.posts.queue','feture.posts.audit','feture.posts.decide','feture.comments.queue','feture.comments.audit','feture.comments.decide','feture.operators.status','feture.operators.set','feture.qa.list','feture.qa.audit','feture.qa.lookup','feture.qa.grant','feture.qa.revoke']);

/** A personal-session transport for the existing QA sections. No Core key or health access. */
export function createOperatorClient(endpoint:string,session:AuthSession,getSession:()=>Promise<AuthSession|null>,send:typeof fetch,onAccessLost:()=>void=()=>{}):AdminClient{
 const fail=(code:string,status?:number):never=>{
  if(['auth_required','session_changed','forbidden'].includes(code))onAccessLost();
  throw Object.assign(new Error(code),{code,status}) as AdminError;
 };
 const check=async()=>{
  if(!sameSession(await getSession(),session))fail('session_changed');
  if(session.expiresAt&&Date.parse(session.expiresAt)<=Date.now())fail('auth_required');
 };
 return {
  async health(){return fail('forbidden');},
  async action<T extends Record<string,unknown>>(_unusedKey:string,action:string,body:Record<string,unknown>={}){
   if(!actions.has(action))fail('forbidden');
   await check();
   const response=await send(endpoint,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','X-Fit-Email':session.email,'X-Fit-Device':session.deviceId,'X-Fit-Token':session.syncToken},body:JSON.stringify({...body,action})});
   const payload:unknown=await response.json();
   // Check after consuming the body too: a late reply belongs only to its original session.
   await check();
   if(response.status===401)fail('auth_required',401);
   if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('invalid_response');
   const result=payload as Record<string,unknown>;
   if(!response.ok||result.ok!==true)fail(typeof result.error==='string'?result.error:'request_failed',response.status);
   return result as T;
  }
 };
}
