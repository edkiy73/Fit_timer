import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useOptionalAuth } from '@appbase/ui-react/auth.js';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { z } from 'zod';
import { authClient } from '../auth';
import { apiUrl } from '../api-url';
import { sameSession } from './interest-api';
import type { AuthSession } from '@appbase/core/auth.js';
import {Icon} from './components/Icon';
import './verification-page.css';
const statusSchema=z.discriminatedUnion('state',[z.object({state:z.literal('unavailable'),verifiedAdult:z.literal(false),validUntil:z.null(),reason:z.literal('provider_not_configured')}).strict(),z.object({state:z.literal('test_access'),verifiedAdult:z.literal(false),validUntil:z.null(),qaAccessUntil:z.iso.datetime({offset:true})}).strict()]);
const responseSchema=z.object({ok:z.literal(true),status:statusSchema,requestId:z.string().uuid()}).strict();
type Result={session:AuthSession;state:'unavailable'|'test_access'|'error'|'auth';qaUntil:string|undefined};
export function VerificationPage(){
 const auth=useOptionalAuth();const {t,locale}=useI18n();const location=useLocation();const c=(ru:string,en:string)=>locale==='ru'?ru:en;
 const parent=['/design/A06','/design/A07','/design/A08'].includes(location.state?.designParent)?location.state.designParent:'/design/A06';
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
   let state:Result['state']='error';let qaUntil:string|undefined;
   try {
    if(!sameSession(await authClient.getSession(),current))state='auth';
    else {
     const response=await fetch(apiUrl('/api/domain'),{method:'POST',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),headers:{'Content-Type':'application/json','x-fit-email':current.email,'x-fit-device':current.deviceId,'x-fit-token':current.syncToken},body:JSON.stringify({action:'verification.status'})});
     if(response.status===401)state='auth';
     else if(response.ok){const parsed=responseSchema.safeParse(await response.json());if(parsed.success){state=parsed.data.status.state;if(parsed.data.status.state==='test_access')qaUntil=parsed.data.status.qaAccessUntil;}}
    }
    if(!sameSession(await authClient.getSession(),current))state='auth';
   }catch { /* No cached proof or transport details are displayed. */ }
   if(!controller.signal.aborted)setResult({session:current,state,qaUntil});
  }
  void load(session);return ()=>controller.abort();
 },[session,attempt]);
 const state=result&&sameSession(result.session,session)?result.state:null;
 return <main className="fvd-page"><header><Link to={session?parent:'/design/A02'} state={{returnTo:'/design/A07'}}><Icon name="back" size={19}/>{c('Назад','Back')}</Link><span>FetUre</span></header><section className="fvd-card" aria-labelledby="verification-title"><span className="fvd-symbol"><Icon name="shield" size={34}/></span>
  <h2 id="verification-title">{t('verification.title')}</h2>
  {auth.loading?<p role="status">{t('account.loading')}</p>:!session?<p>{t('verification.guest')}</p>:state===null?<p role="status">{t('verification.loading')}</p>:state==='test_access'?<><p role="status">{t('verification.qaAccessUntil',{until:result?.qaUntil?new Date(result.qaUntil).toLocaleString(locale==='en'?'en-US':'ru-RU'):t('verification.qaUntilUnknown')})}</p><p>{t('verification.qaAccessInfo')}</p><p><Link to="/documents">{t('verification.qaConsents')}</Link></p></>:state==='unavailable'?<>
   <p role="status">{t('verification.unavailable')}</p><p>{t('verification.details')}</p><p>{t('verification.local')}</p>
  </>:<p role="alert">{t(state==='auth'?'verification.auth':'verification.error')}</p>}
  {session&&state==='error'&&<button className="link-button" type="button" onClick={()=>setAttempt(n=>n+1)}>{t('verification.retry')}</button>}
  <div className="fvd-actions"><Link className="fvd-primary" to={session?'/documents':'/design/A02'} state={{returnTo:'/design/A07',designParent:'/design/A09'}}>{session?c('Условия и согласия','Terms and consent'):t('nav.signIn')}<Icon name="arrow" size={18}/></Link><Link to="/design/X07">{c('К обычному опросу','Take a general questionnaire')}</Link></div>
 </section></main>;
}
