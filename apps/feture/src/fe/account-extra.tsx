import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {BookOpen,CalendarDays,Check,ChevronRight,Crown,Globe,Heart,History,Lock,LogOut,Mail,Shield,Smartphone,TriangleAlert,Undo2,X,type LucideIcon} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Bar,Btn,Empty,View} from './ui';
import {useFe} from './session';
import {Sheet} from './profile-extras';

/** V21 B01 (Premium), K06 (sign-in & security), S01 (help & safety) on /api/fe. */

const statusRes=z.object({ok:z.literal(true),premium:z.boolean(),until:z.string().nullable(),viaPartner:z.boolean()}).passthrough();
type Status=z.infer<typeof statusRes>;

const useDate=()=>{const {locale}=useI18n();return (v:string)=>new Date(v).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long',year:'numeric'});};

/** The account's Premium state (`premium.status`); null while loading or unknown. Shared with the settings row. */
export function usePremiumStatus(){
 const {call}=useFe();const [status,setStatus]=useState<Status|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);call('premium.status',{},statusRes).then(setStatus).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 return {status,error,load};
}

/* ---------- B01 Premium ---------- */
type Feat='undo'|'history';
const FEATS:[Feat,LucideIcon][]=[['undo',Undo2],['history',History]];
type Plan='year'|'month';

export function PremiumScreen(){
 const {t}=useI18n();const date=useDate();const [params]=useSearchParams();
 const kind=params.get('for') as Feat|null;
 const {status,error,load}=usePremiumStatus();const [plan,setPlan]=useState<Plan>('year');
 const premium=!!status?.premium;
 return <>
  <Bar title="" back/>
  <View className={'nodock'+(status&&!premium?' cta1':'')}>
   <div className="pw-hero"><span className="pw-crown"><Crown/></span><b>FetUre Premium</b><p>{t('fe.ax.prem.lead')}</p><i/><i/></div>
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!status?<p className="note mt12" role="status">{t('fe.loading')}</p>:<>
    {premium&&<div className="alert ok mt12" role="status"><Check/><span>{status.viaPartner
     ?<><b>{t('fe.ax.prem.viaPartner')}</b>{t('fe.ax.prem.viaPartnerText')}</>
     :<><b>{t('fe.ax.prem.active')}</b>{status.until?t('fe.ax.prem.until',{date:date(status.until)}):''}</>}</span></div>}
    <div className="free14"><Check/><span><b>{t('fe.ax.prem.freeTitle')}</b>{t('fe.ax.prem.freeText')}</span></div>
    <div className="sec">{t('fe.ax.prem.what')}</div>
    <div className="pw-feats">{FEATS.map(([k,Icon])=><div key={k} className={'pw-f'+(k===kind?' on':'')}><span className={'ico'+(k===kind?' l':'')}><Icon/></span>
     <span className="tx"><b>{t('fe.ax.prem.f.'+k)}</b><small>{t('fe.ax.prem.f.'+k+'Text')}</small></span>{k===kind&&!premium&&<span className="pill hot">{t('fe.ax.prem.needed')}</span>}</div>)}</div>
    {!premium&&<>
     <div className="sec">{t('fe.ax.prem.plan')}</div>
     <div className="pw-plans">{(['year','month'] as const).map(k=><button key={k} type="button" className={'pw-plan'+(plan===k?' on':'')} aria-pressed={plan===k} onClick={()=>setPlan(k)}>
      {k==='year'&&<em>{t('fe.ax.prem.yearBadge')}</em>}<b>{t('fe.ax.prem.'+k)}</b><span className="pr">{t('fe.ax.prem.'+k+'Price')}</span><small>{t('fe.ax.prem.'+k+'Note')}</small></button>)}</div>
     <p className="note mt12" id="fe-ax-soon"><b>{t('fe.ax.prem.soon')}.</b> {t('fe.ax.prem.soonText')}</p>
    </>}
    <div className="sec">{t('fe.ax.prem.honest')}</div>
    <div className="card">{(['h1','h2','h3'] as const).map(k=><div key={k} className="fact"><i className="g"><Check/></i><span>{t('fe.ax.prem.'+k)}</span></div>)}</div>
   </>}
  </View>
  {status&&!premium&&<div className="ctabar"><div className="wrap"><Btn disabled aria-describedby="fe-ax-soon">{t('fe.ax.prem.buy',{price:t('fe.ax.prem.'+plan+'Price')})}</Btn></div></div>}
 </>;
}

/* ---------- K06 Вход и безопасность ---------- */
function thisDevice(t:(k:string)=>string){
 const u=navigator.userAgent;
 if(/iPhone/.test(u))return {mobile:true,name:'iPhone'};if(/iPad/.test(u))return {mobile:true,name:'iPad'};if(/Android/.test(u))return {mobile:true,name:'Android'};
 const b=/Edg\//.test(u)?'Edge':/Firefox\//.test(u)?'Firefox':/Chrome\//.test(u)?'Chrome':/Safari\//.test(u)?'Safari':t('fe.ax.sec.browser');
 const os=/Mac OS X|Macintosh/.test(u)?'Mac':/Windows/.test(u)?'Windows':/Linux/.test(u)?'Linux':t('fe.ax.sec.computer');
 return {mobile:false,name:b+' · '+os};
}

export function SecurityScreen(){
 const {state}=useFe();const {t}=useI18n();const auth=useOptionalAuth();const navigate=useNavigate();const date=useDate();
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const email=state.status==='ready'?state.session.email:'';
 const expires=auth.session?.expiresAt;
 const dev=thisDevice(t);
 // The auth server knows only the current device's session (Core auth `logout`); it has no list and no «everywhere».
 const logout=async()=>{setBusy(true);setFailure('');try{await auth.logout();navigate('/');}catch{setFailure(t('fe.ax.sec.logoutFailed'));}finally{setBusy(false);}};
 return <>
  <Bar title={t('fe.ax.sec.title')} back="/n/settings"/>
  <View className="nodock compact">
   <div className="sec" style={{marginTop:4}}>{t('fe.ax.sec.methods')}</div>
   <div className="card list">
    <div className="li"><span className="ico"><Mail/></span><span className="tx"><b>{t('fe.ax.sec.email')} <span className="pill ok">{t('fe.ax.sec.primary')}</span></b><small className="one">{email||'—'}</small></span></div>
   </div>
   <p className="note mt8">{t('fe.ax.sec.methodsNote')}</p>
   <div className="sec">{t('fe.ax.sec.sessions')}</div>
   <div className="card list">
    <div className="li"><span className="ico g">{dev.mobile?<Smartphone/>:<Globe/>}</span><span className="tx"><b>{t('fe.ax.sec.thisDevice')}</b>
     <small>{dev.name} · {t('fe.ax.sec.now')}{expires?' · '+t('fe.ax.sec.expires',{date:date(expires)}):''}</small></span></div>
   </div>
   <p className="note mt8">{t('fe.ax.sec.sessionsNote')}</p>
   <Btn kind="soft" icon={LogOut} className="mt16" onClick={logout} disabled={busy}>{t('fe.ax.sec.logout')}</Btn>
   {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
  </View>
 </>;
}

/* ---------- S01 Помощь и безопасность ---------- */
type HelpKey='rules'|'report'|'shield'|'lock'|'heart'|'cal'|'crown';
const HELP_ICON:Record<HelpKey,LucideIcon>={rules:BookOpen,report:Shield,shield:Shield,lock:Lock,heart:Heart,cal:CalendarDays,crown:Crown};

export function HelpScreen(){
 const {t}=useI18n();const navigate=useNavigate();const [open,setOpen]=useState<HelpKey|null>(null);const close=useCallback(()=>setOpen(null),[]);
 const row=(k:HelpKey)=>{const Icon=HELP_ICON[k];return <button key={k} type="button" className="li" onClick={()=>setOpen(k)}><span className="ico v"><Icon/></span><span className="tx"><b>{t('fe.ax.help.'+k)}</b></span><ChevronRight/></button>;};
 return <>
  <Bar title={t('fe.ax.help.title')} back/>
  <View className="nodock compact">
   <div className="card list">{(['rules','report'] as const).map(row)}</div>
   <div className="sec">{t('fe.ax.help.faq')}</div>
   <div className="card list">{(['shield','lock','heart','cal','crown'] as const).map(row)}</div>
   <div className="alert warn mt16"><TriangleAlert/><span><b>{t('fe.ax.help.threatTitle')}</b>{t('fe.ax.help.threatText')}</span></div>
  </View>
  {open&&<Sheet title={t('fe.ax.help.'+open)} onClose={close}
   foot={open==='crown'?<Btn kind="soft" onClick={()=>navigate('/n/premium')}>{t('fe.ax.help.morePremium')}</Btn>:undefined}>
   <p className="lead">{t('fe.ax.help.'+open+'Text')}</p></Sheet>}
 </>;
}
