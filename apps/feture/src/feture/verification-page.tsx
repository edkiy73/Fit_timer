import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { z } from 'zod';
import { authClient } from '../auth';
import { apiUrl } from '../api-url';
import { sameSession } from './interest-api';
import type { AuthSession } from '@appbase/core/auth.js';
const responseSchema=z.object({ok:z.literal(true),status:z.object({state:z.literal('unavailable'),verifiedAdult:z.literal(false),validUntil:z.null(),reason:z.literal('provider_not_configured')}).strict(),requestId:z.string().uuid()}).strict();
type Result={session:AuthSession;state:'unavailable'|'error'|'auth'};
export function VerificationPage(){
 const auth=useOptionalAuth();const {t}=useI18n();
 const [result,setResult]=useState<Result|null>(null);const [attempt,setAttempt]=useState(0);
 const session=auth.session;
 useEffect(()=>{
  const changed=(event:StorageEvent)=>{if(event.key==='feture.auth.session'||event.key===null){setResult(null);setAttempt(n=>n+1);}};
  window.addEventListener('storage',changed);return ()=>window.removeEventListener('storage',changed);
 },[]);
 useEffect(()=>{
  setResult(null);if(!session)return;
  const controller=new AbortController();
  async function load(current:AuthSession){
   let state:Result['state']='error';
   try {
    if(!sameSession(await authClient.getSession(),current))state='auth';
    else {
     const response=await fetch(apiUrl('/api/domain'),{method:'POST',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),headers:{'Content-Type':'application/json','x-fit-email':current.email,'x-fit-device':current.deviceId,'x-fit-token':current.syncToken},body:JSON.stringify({action:'verification.status'})});
     if(response.status===401)state='auth';
     else if(response.ok&&responseSchema.safeParse(await response.json()).success)state='unavailable';
    }
    if(!sameSession(await authClient.getSession(),current))state='auth';
   }catch { /* No cached proof or transport details are displayed. */ }
   if(!controller.signal.aborted)setResult({session:current,state});
  }
  void load(session);return ()=>controller.abort();
 },[session,attempt]);
 const state=result&&sameSession(result.session,session)?result.state:null;
 return <section className="card" aria-labelledby="verification-title">
  <h2 id="verification-title">{t('verification.title')}</h2>
  {auth.loading?<p role="status">{t('account.loading')}</p>:!session?<p>{t('verification.guest')}</p>:state===null?<p role="status">{t('verification.loading')}</p>:state==='unavailable'?<>
   <p role="status">{t('verification.unavailable')}</p><p>{t('verification.details')}</p><p>{t('verification.local')}</p>
  </>:<p role="alert">{t(state==='auth'?'verification.auth':'verification.error')}</p>}
  {session&&state==='error'&&<button className="link-button" type="button" onClick={()=>setAttempt(n=>n+1)}>{t('verification.retry')}</button>}
  <p><Link to="/account">{t(session?'nav.account':'nav.signIn')}</Link></p>
  <p><Link to="/">{t('route.home')}</Link></p>
 </section>;
}
