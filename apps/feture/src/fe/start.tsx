import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import type {AuthResponseError} from '@appbase/core/auth.js';
import {CircleAlert,Mail} from 'lucide-react';
import {Alert,Bar,Btn,CodeInput,Field,H,Input,Seg,Spacer,Stack} from './kit';
import {pendingPairLink} from './pair-link';
import {ToastProvider} from './toast';
import {Welcome} from './welcome';
import {SignInHelp} from './support';

/** The signed-out and sign-up frame of V21: `.stage > .root.auth > main.main.hasbar(header.bar, .view, .ctabar)`,
 * so the auth screens get the prototype's header, the card look on a computer and the bottom-pinned buttons. */
export function AuthFrame({screen,children}:{screen:string,children:ReactNode}){
 return <div className="stage"><div className="root auth"><main className="main hasbar" data-screen={screen}><ToastProvider nodock>{children}</ToastProvider></main></div></div>;
}

/** `bar('',{back:1,actions})` of the auth screens: only «‹» and, where the prototype has it, the language switch. */
export function AuthBar({onBack,onLeave,lang}:{onBack?:()=>void,/** «Выйти»: ends an unfinished sign-up (the session) and returns to the start screen. */ onLeave?:()=>void,lang?:boolean}){
 const {t,locale,canSwitch,setPreference}=useI18n();
 return <Bar title="" {...(onBack?{onBack}:{})}>
  {onLeave&&<Btn kind="text" size="sm" onClick={onLeave}>{t('fe.set.logout')}</Btn>}
  {lang&&canSwitch&&<div className="langsw" role="group" aria-label="Language">{(['ru','en'] as const).map(l=><button key={l} type="button" className={locale===l?'on':''} aria-pressed={locale===l} onClick={()=>setPreference(l)}>{l.toUpperCase()}</button>)}</div>}
 </Bar>;
}

/** V21 AUTH-021: the logo on the sign-up forms (shown as the card header on a computer, hidden on a phone). */
export function AuthLogo(){
 return <div className="auth-logo" aria-hidden="true"><img src={import.meta.env.BASE_URL+'fe-logo.svg'} alt=""/><b>Fet<i>Ure</i></b></div>;
}

type Mode='up'|'in';
type Step={id:'A01'}|{id:'A02',mode:Mode}|{id:'A03',mode:Mode,email:string,sent:boolean};

/** Signed out: A01 welcome → A02 sign-up / sign-in by email → A03 the 6-digit code. The existing account server
 * (packages/core auth: send → verify) does the work; a verified session reloads the FetUre session, which then
 * shows the app or the sign-up form (A04). */
export function SignedOut(){
 const [step,setStep]=useState<Step>({id:'A01'});
 if(step.id==='A01')return <Welcome onStart={mode=>setStep({id:'A02',mode})}/>;
 if(step.id==='A02')return <AuthFrame screen="A02"><EmailStep mode={step.mode} onBack={()=>setStep({id:'A01'})} onMode={mode=>setStep({id:'A02',mode})}
  onCode={(email,sent)=>setStep({id:'A03',mode:step.mode,email,sent})}/></AuthFrame>;
 return <AuthFrame screen="A03"><CodeStep email={step.email} sent={step.sent} onBack={()=>setStep({id:'A02',mode:step.mode})}/></AuthFrame>;
}

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const codeOf=(e:unknown)=>String((e as AuthResponseError|undefined)?.code||(e as Error|undefined)?.message||'');
let lastEmail='';

function EmailStep({mode,onBack,onMode,onCode}:{mode:Mode,onBack:()=>void,onMode:(m:Mode)=>void,onCode:(email:string,sent:boolean)=>void}){
 const {client}=useOptionalAuth();const {t,locale}=useI18n();
 const [email,setEmail]=useState(lastEmail);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [noMail,setNoMail]=useState(false);
 const field=useRef<HTMLDivElement>(null);
 const fail=(m:string)=>{setError(m);const f=field.current;if(f){f.classList.remove('shake');void f.offsetWidth;f.classList.add('shake');}};
 const send=async()=>{
  const v=email.trim().toLowerCase();
  if(!v)return fail(t('fe.onb.email.missing'));
  if(!EMAIL.test(v)||/\.\./.test(v)||v.split('@')[0]!.length>64)return fail(t('fe.onb.email.bad'));
  setBusy(true);setError('');setNoMail(false);
  try{await client.sendCode(v,locale==='en'?'en':'ru');lastEmail=v;onCode(v,true);}
  catch(e){const c=codeOf(e);
   if(c==='mail_failed'||c==='no_mail'){setNoMail(true);fail(t('fe.onb.email.mailFailed'));}
   else{if(c==='rate_limited'||c==='too_many_today')setNoMail(true);fail(t(c==='rate_limited'?'fe.onb.email.limit':c==='too_many_today'?'fe.onb.email.today':c==='bad_email'?'fe.onb.email.bad':'fe.onb.failed'));}}
  finally{setBusy(false);}
 };
 return <>
  <AuthBar onBack={onBack} lang/>
  <div className="view nodock"><div className="auth-wrap">
   <AuthLogo/>
   <Seg small={false} value={mode} onChange={onMode} options={[{id:'up',label:t('fe.onb.up')},{id:'in',label:t('fe.onb.in')}]}/>
   <H level={2} className="t">{mode==='up'?t('fe.onb.upTitle'):t('fe.onb.inTitle')}</H>
   {/* A partner link (V21 pairShareLink): the couple forms right after the sign-up — said before, not after (owner). */}
   {pendingPairLink()&&<Alert kind="info">{t('fe.c6.land.signup')}</Alert>}
   <div ref={field} data-field="email"><Field id="fe-email" label={t('fe.onb.email')} error={error||undefined}>
    <div className="inwrap"><Mail/><Input id="fe-email" name="email" type="email" value={email} placeholder="name@mail.com" autoComplete="email" inputMode="email" invalid={!!error}
     onChange={e=>{setEmail(e.target.value);setError('');setNoMail(false);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void send();}}}/></div>
    {!error&&<div className="fhint">{t('fe.onb.email.hint')}</div>}
   </Field></div>
   <Btn onClick={send} disabled={busy} busy={busy}>{t('fe.onb.getCode')}</Btn>
   {noMail&&<Btn kind="text" onClick={()=>{const v=email.trim().toLowerCase();lastEmail=v;onCode(v,false);}}>{t('fe.onb.haveCode')}</Btn>}
   <SignInHelp/>
  </div></div>
 </>;
}

const RESEND=30;
function CodeStep({email,sent,onBack}:{email:string,sent:boolean,onBack:()=>void}){
 const {client,acceptSession}=useOptionalAuth();const {t,locale}=useI18n();
 const [code,setCode]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [locked,setLocked]=useState(false);const [sentAt,setSentAt]=useState(()=>sent?Date.now():0);const [now,setNow]=useState(Date.now());
 const box=useRef<HTMLDivElement>(null);
 const first=()=>box.current?.querySelector<HTMLInputElement>('input')?.focus();
 const left=Math.max(0,RESEND-Math.round((now-sentAt)/1000));
 const ticking=left>0;
 useEffect(()=>{if(!ticking)return;const id=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(id);},[ticking]);
 useEffect(()=>{first();},[]);
 const masked=email.replace(/^(.)(.*)(@.*)$/,(_x,a:string,b:string,c:string)=>a+'•'.repeat(Math.min(6,b.length))+c);
 const fail=(m:string)=>{setError(m);setCode('');first();const b=box.current;if(b){b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');}};
 const check=async(code:string)=>{
  if(code.length<6){setError(t('fe.onb.code.all'));return;}
  if(locked||busy)return;
  setBusy(true);setError('');
  try{const session=await client.verifyCode({email,code,locale:locale==='en'?'en':'ru'});acceptSession(session);}
  catch(e){const c=codeOf(e);const n=(e as AuthResponseError).left;
   if(c==='bad_code')fail(typeof n==='number'?t('fe.onb.code.wrongLeft').replace('{n}',String(n)):t('fe.onb.code.wrong'));
   else if(c==='too_many_tries'){setLocked(true);setSentAt(0);fail(t('fe.onb.code.locked'));}
   else if(c==='code_expired'||c==='expired_code'){setSentAt(0);fail(t('fe.onb.code.expired'));}
   else if(c==='rate_limited')fail(t('fe.onb.email.limit'));
   else fail(t('fe.onb.failed'));}
  finally{setBusy(false);}
 };
 const resend=async()=>{
  setBusy(true);setError('');
  try{await client.sendCode(email,locale==='en'?'en':'ru');setSentAt(Date.now());setNow(Date.now());setLocked(false);setCode('');first();}
  catch(e){const c=codeOf(e);setError(t(c==='rate_limited'?'fe.onb.email.limit':c==='too_many_today'?'fe.onb.email.today':c==='mail_failed'||c==='no_mail'?'fe.onb.email.mailFailed':'fe.onb.failed'));}
  finally{setBusy(false);}
 };
 return <>
  <AuthBar onBack={onBack}/>
  <div className="view nodock"><div className="auth-wrap">
   <AuthLogo/>
   <H level={2} className="t">{t('fe.onb.code.title')}</H>
   <p className="lead">{sent?t('fe.onb.code.sent'):t('fe.onb.code.enterFor')} <b>{masked}</b>. {t('fe.onb.code.valid')}</p>
   <CodeInput ref={box} name="code" label={t('fe.onb.code.title')} digitLabel={t('fe.onb.code.digit')} value={code} invalid={!!error} disabled={locked}
    onChange={v=>{setCode(v);setError('');}} onComplete={v=>void check(v)} onEnter={v=>void check(v)}/>
   {error&&<div className="ferr" role="alert"><CircleAlert/>{error}</div>}
   <Spacer size={6}/>
   <Stack gap={4}>
    <Btn onClick={()=>check(code)} disabled={locked||busy} busy={busy}>{t('fe.onb.code.confirm')}</Btn>
    <div className="authrow">
     <Btn kind="text" auto onClick={onBack}>{t('fe.onb.code.change')}</Btn>
     <Btn kind="text" auto onClick={resend} disabled={!!left||busy}>{left?t('fe.onb.code.resendIn').replace('{n}',String(left)):t('fe.onb.code.resend')}</Btn>
    </div>
    <SignInHelp/>
   </Stack>
  </div></div>
 </>;
}
