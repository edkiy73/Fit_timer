import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import type {AuthResponseError} from '@appbase/core/auth.js';
import {ChevronLeft,CircleAlert,Mail} from 'lucide-react';
import {Btn,Seg} from './ui';
import {ToastProvider} from './toast';
import {Welcome} from './welcome';

/** The signed-out and sign-up frame of V21: `.stage > .root.auth > main.main.hasbar(header.bar, .view, .ctabar)`,
 * so the auth screens get the prototype's header, the card look on a computer and the bottom-pinned buttons. */
export function AuthFrame({screen,children}:{screen:string,children:ReactNode}){
 return <div className="stage"><div className="root auth"><main className="main hasbar" data-screen={screen}><ToastProvider nodock>{children}</ToastProvider></main></div></div>;
}

/** `bar('',{back:1,actions})` of the auth screens: only «‹» and, where the prototype has it, the language switch. */
export function AuthBar({onBack,lang}:{onBack?:()=>void,lang?:boolean}){
 const {t,locale,canSwitch,setPreference}=useI18n();
 return <header className="bar">
  {onBack&&<button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={onBack}><ChevronLeft/></button>}
  <h1 tabIndex={-1}/>
  {lang&&canSwitch&&<div className="langsw" role="group" aria-label="Language">{(['ru','en'] as const).map(l=><button key={l} type="button" className={locale===l?'on':''} aria-pressed={locale===l} onClick={()=>setPreference(l)}>{l.toUpperCase()}</button>)}</div>}
 </header>;
}

/** V21 AUTH-021: the logo on the sign-up forms (shown as the card header on a computer, hidden on a phone). */
export function AuthLogo(){
 return <div className="auth-logo" aria-hidden="true"><img src={import.meta.env.BASE_URL+'icon.svg'} alt=""/><b>Fet<i>Ure</i></b></div>;
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
 const field=useRef<HTMLLabelElement>(null);
 const fail=(m:string)=>{setError(m);const f=field.current;if(f){f.classList.remove('shake');void f.offsetWidth;f.classList.add('shake');}};
 const send=async()=>{
  const v=email.trim().toLowerCase();
  if(!v)return fail(t('fe.onb.email.missing'));
  if(!EMAIL.test(v)||/\.\./.test(v)||v.split('@')[0]!.length>64)return fail(t('fe.onb.email.bad'));
  setBusy(true);setError('');setNoMail(false);
  try{await client.sendCode(v,locale==='en'?'en':'ru');lastEmail=v;onCode(v,true);}
  catch(e){const c=codeOf(e);
   if(c==='mail_failed'||c==='no_mail'){setNoMail(true);fail(t('fe.onb.email.mailFailed'));}
   else fail(t(c==='rate_limited'?'fe.onb.email.limit':c==='too_many_today'?'fe.onb.email.today':c==='bad_email'?'fe.onb.email.bad':'fe.onb.failed'));}
  finally{setBusy(false);}
 };
 return <>
  <AuthBar onBack={onBack} lang/>
  <div className="view nodock"><div className="auth-wrap">
   <AuthLogo/>
   <Seg small={false} value={mode} onChange={onMode} options={[{id:'up',label:t('fe.onb.up')},{id:'in',label:t('fe.onb.in')}]}/>
   <h2 className="t">{mode==='up'?t('fe.onb.upTitle'):t('fe.onb.inTitle')}</h2>
   <label ref={field} className={'field'+(error?' err':'')} data-field="email"><span>{t('fe.onb.email')}</span>
    <div className="inwrap"><Mail/><input className="inp" name="email" type="email" value={email} placeholder="name@mail.com" autoComplete="email" inputMode="email" aria-invalid={!!error}
     onChange={e=>{setEmail(e.target.value);setError('');setNoMail(false);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void send();}}}/></div>
    {error?<div className="ferr"><CircleAlert/>{error}</div>:<div className="fhint">{t('fe.onb.email.hint')}</div>}
   </label>
   <Btn onClick={send} disabled={busy} busy={busy}>{t('fe.onb.getCode')}</Btn>
   {noMail&&<Btn kind="text" className="mt8" onClick={()=>{const v=email.trim().toLowerCase();lastEmail=v;onCode(v,false);}}>{t('fe.onb.haveCode')}</Btn>}
  </div></div>
 </>;
}

const RESEND=30;
function CodeStep({email,sent,onBack}:{email:string,sent:boolean,onBack:()=>void}){
 const {client,acceptSession}=useOptionalAuth();const {t,locale}=useI18n();
 const [digits,setDigits]=useState<string[]>(['','','','','','']);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [locked,setLocked]=useState(false);const [sentAt,setSentAt]=useState(()=>sent?Date.now():0);const [now,setNow]=useState(Date.now());
 const inputs=useRef<(HTMLInputElement|null)[]>([]);const box=useRef<HTMLDivElement>(null);
 const left=Math.max(0,RESEND-Math.round((now-sentAt)/1000));
 const ticking=left>0;
 useEffect(()=>{if(!ticking)return;const id=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(id);},[ticking]);
 useEffect(()=>{inputs.current[0]?.focus();},[]);
 const masked=email.replace(/^(.)(.*)(@.*)$/,(_x,a:string,b:string,c:string)=>a+'•'.repeat(Math.min(6,b.length))+c);
 const fail=(m:string)=>{setError(m);setDigits(['','','','','','']);inputs.current[0]?.focus();const b=box.current;if(b){b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');}};
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
 const type=(i:number,raw:string)=>{
  const v=raw.replace(/\D/g,'');const next=[...digits];
  if(v.length>1)v.split('').slice(0,6-i).forEach((d,k)=>{next[i+k]=d;});else next[i]=v;
  setDigits(next);setError('');
  const code=next.join('');
  if(v&&i<5)inputs.current[Math.min(5,i+v.length)]?.focus();
  if(code.length===6)void check(code);
 };
 const resend=async()=>{
  setBusy(true);setError('');
  try{await client.sendCode(email,locale==='en'?'en':'ru');setSentAt(Date.now());setNow(Date.now());setLocked(false);setDigits(['','','','','','']);inputs.current[0]?.focus();}
  catch(e){const c=codeOf(e);setError(t(c==='rate_limited'?'fe.onb.email.limit':c==='too_many_today'?'fe.onb.email.today':c==='mail_failed'||c==='no_mail'?'fe.onb.email.mailFailed':'fe.onb.failed'));}
  finally{setBusy(false);}
 };
 return <>
  <AuthBar onBack={onBack}/>
  <div className="view nodock"><div className="auth-wrap">
   <AuthLogo/>
   <h2 className="t">{t('fe.onb.code.title')}</h2>
   <p className="lead">{sent?t('fe.onb.code.sent'):t('fe.onb.code.enterFor')} <b>{masked}</b>. {t('fe.onb.code.valid')}</p>
   <div ref={box} className={'code'+(error?' err':'')} data-field="code">{digits.map((d,i)=><input key={i} ref={el=>{inputs.current[i]=el;}} inputMode="numeric" autoComplete="one-time-code" aria-label={`${t('fe.onb.code.digit')} ${i+1}`}
    value={d} disabled={locked} onChange={e=>type(i,e.target.value)} onKeyDown={e=>{if(e.key==='Backspace'&&!digits[i]&&i>0)inputs.current[i-1]?.focus();if(e.key==='Enter')void check(digits.join(''));}}/>)}</div>
   {error&&<div className="ferr" role="alert"><CircleAlert/>{error}</div>}
   <Btn className="mt24" onClick={()=>check(digits.join(''))} disabled={locked||busy} busy={busy}>{t('fe.onb.code.confirm')}</Btn>
   <div className="authrow mt16">
    <Btn kind="text" auto onClick={onBack}>{t('fe.onb.code.change')}</Btn>
    <Btn kind="text" auto onClick={resend} disabled={!!left||busy}>{left?t('fe.onb.code.resendIn').replace('{n}',String(left)):t('fe.onb.code.resend')}</Btn>
   </div>
  </div></div>
 </>;
}
