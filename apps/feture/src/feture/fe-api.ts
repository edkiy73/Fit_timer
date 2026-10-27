import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {apiUrl} from '../api-url';
import {requireCurrentSession} from './domain-api';

/** Client for `POST /api/fe` (docs/server/S2-API.md). One command per call: `{action, ...input}`; the acting
 * profile («Я» / «Мы») goes in `X-Fe-Profile`; writes carry an `opId` the caller keeps for retries of the
 * same user action, so a repeated tap or a lost response never applies twice. */
export class FeError extends Error {
 constructor(public code:string,public status=0,public rule?:string,public fields?:string[],public state?:string){super(code);}
}

/** UUID v7 (time-ordered), as the server's ledger expects. */
export function newOpId():string{
 const b=crypto.getRandomValues(new Uint8Array(16));const t=Date.now();
 for(let i=0;i<6;i++)b[i]=Math.floor(t/2**(8*(5-i)))&0xff;
 b[6]=(b[6]!&0x0f)|0x70;b[8]=(b[8]!&0x3f)|0x80;
 const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

const failure=z.object({error:z.string(),rule:z.string().optional(),fields:z.array(z.string()).optional(),state:z.string().optional()});

export async function feRequest<T>(session:AuthSession,action:string,input:Record<string,unknown>,schema:z.ZodType<T>,
 opts:{profileId?:string,signal?:AbortSignal}={}):Promise<T>{
 const {signal,profileId}=opts;
 await requireCurrentSession(session,signal);
 const headers:Record<string,string>={'Content-Type':'application/json','x-fit-email':session.email,'x-fit-device':session.deviceId,'x-fit-token':session.syncToken};
 if(profileId)headers['x-fe-profile']=profileId;
 let response:Response;
 try{
  response=await fetch(apiUrl('/api/fe'),{method:'POST',cache:'no-store',headers,body:JSON.stringify({...input,action}),
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
 }catch(error){
  if(signal?.aborted)throw error;
  throw new FeError('network');
 }
 await requireCurrentSession(session,signal);
 let body:unknown;
 try{body=await response.json();}
 catch{throw new FeError(response.status===401?'auth_required':response.status===429?'rate_limited':'unavailable',response.status);}
 await requireCurrentSession(session,signal);
 if(!response.ok){
  const f=failure.safeParse(body);
  throw f.success?new FeError(f.data.error,response.status,f.data.rule,f.data.fields,f.data.state):new FeError('unavailable',response.status);
 }
 const parsed=schema.safeParse(body);
 if(!parsed.success)throw new FeError('unavailable',response.status);
 return parsed.data;
}

/** Plain-language message for an error; screens show it instead of codes. */
export function feErrorMessage(error:unknown,t:(key:string)=>string):string{
 const e=error instanceof FeError?error:null;
 if(!e)return t('fe.error.generic');
 if(e.code==='rule_violation'&&e.rule){const k='fe.rule.'+e.rule;const m=t(k);if(m!==k)return m;}
 const k='fe.error.'+e.code;const m=t(k);
 return m!==k?m:t('fe.error.generic');
}
