import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {Book,Calendar,Check,Crown,Globe,Heart,History,Lock,Mail,ShieldCheck,Smartphone,Undo2,X,type LucideIcon} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Alert,Bar,Btn,Card,Empty,Note,Pill,Row,SectionLabel,Skel,View} from './kit';
import {useToast} from './toast';
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
 const {t}=useI18n();const date=useDate();const [params]=useSearchParams();const toast=useToast();
 const kind=params.get('for') as Feat|null;
 const {status,error,load}=usePremiumStatus();const [plan,setPlan]=useState<Plan>('year');
 const premium=!!status?.premium;
 return <>
  <Bar title="" back/>
  <View className={'nodock'+(status&&!premium?' cta1':'')}>
   <div className="pw-hero"><span className="pw-crown"><Crown/></span><b>FetUre Premium</b><p>{t('fe.ax.prem.lead')}</p><i/><i/></div>
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!status?<Skel kind="list"/>:<>
    {premium&&<Alert kind="ok" icon={Check} className="mt12">{status.viaPartner
     ?<><b>{t('fe.ax.prem.viaPartner')}</b>{t('fe.ax.prem.viaPartnerText')}</>
     :<><b>{t('fe.ax.prem.active')}</b>{status.until?t('fe.ax.prem.until',{date:date(status.until)}):''}</>}</Alert>}
    <div className="free14"><Check/><span><b>{t('fe.ax.prem.freeTitle')}</b>{t('fe.ax.prem.freeText')}</span></div>
    <SectionLabel>{t('fe.ax.prem.what')}</SectionLabel>
    <div className="pw-feats">{FEATS.map(([k,Icon])=><div key={k} className={'pw-f'+(k===kind?' on':'')}><span className={'ico'+(k===kind?' l':'')}><Icon/></span>
     <span className="tx"><b>{t('fe.ax.prem.f.'+k)}</b><small>{t('fe.ax.prem.f.'+k+'Text')}</small></span>{k===kind&&!premium&&<Pill tone="hot">{t('fe.ax.prem.needed')}</Pill>}</div>)}</div>
    {!premium&&<>
     <SectionLabel>{t('fe.ax.prem.plan')}</SectionLabel>
     <div className="pw-plans">{(['year','month'] as const).map(k=><button key={k} type="button" className={'pw-plan'+(plan===k?' on':'')} aria-pressed={plan===k} onClick={()=>setPlan(k)}>
      {k==='year'&&<em>{t('fe.ax.prem.yearBadge')}</em>}<b>{t('fe.ax.prem.'+k)}</b><span className="pr">{t('fe.ax.prem.'+k+'Price')}</span><small>{t('fe.ax.prem.'+k+'Note')}</small></button>)}</div>
     <div id="fe-ax-soon"><Note className="mt12"><b>{t('fe.ax.prem.soon')}.</b> {t('fe.ax.prem.soonText')}</Note></div>
    </>}
    <SectionLabel>{t('fe.ax.prem.honest')}</SectionLabel>
    <Card>{(['h1','h2','h3'] as const).map(k=><div key={k} className="fact"><i className="g"><Check/></i><span>{t('fe.ax.prem.'+k)}</span></div>)}</Card>
   </>}
  </View>
  {status&&!premium&&<div className="ctabar"><div className="wrap"><Btn aria-describedby="fe-ax-soon" onClick={()=>toast(t('fe.ax.prem.soon')+'. '+t('fe.ax.prem.soonText'),{type:'info'})}>{t('fe.ax.prem.buy',{price:t('fe.ax.prem.'+plan+'Price')})}</Btn></div></div>}
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
 const {state}=useFe();const {t}=useI18n();const auth=useOptionalAuth();const date=useDate();
 const email=state.status==='ready'?state.session.email:'';
 const expires=auth.session?.expiresAt;
 const dev=thisDevice(t);
 // The auth server knows only this device's session and has no other sign-in methods yet: only what is real is shown.
 return <>
  <Bar title={t('fe.ax.sec.title')} back="/n/settings"/>
  <View className="nodock compact">
   <SectionLabel>{t('fe.ax.sec.methods')}</SectionLabel>
   <Card list>
    <div className="li"><span className="ico"><Mail/></span><span className="tx"><b>{t('fe.ax.sec.email')} <Pill tone="ok">{t('fe.ax.sec.primary')}</Pill></b><small className="one">{email||'—'}</small></span></div>
   </Card>
   <Note className="mt8">{t('fe.ax.sec.methodsNote')}</Note>
   <SectionLabel>{t('fe.ax.sec.sessions')}</SectionLabel>
   <Card list>
    <div className="li"><span className="ico g">{dev.mobile?<Smartphone/>:<Globe/>}</span><span className="tx"><b>{t('fe.ax.sec.thisDevice')}</b>
     <small>{dev.name} · {t('fe.ax.sec.now')}{expires?' · '+t('fe.ax.sec.expires',{date:date(expires)}):''}</small></span></div>
   </Card>
  </View>
 </>;
}

/* ---------- S01 Помощь и безопасность ---------- */
type HelpKey='rules'|'report'|'shield'|'lock'|'heart'|'cal'|'crown';
const HELP_ICON:Record<HelpKey,LucideIcon>={rules:Book,report:ShieldCheck,shield:ShieldCheck,lock:Lock,heart:Heart,cal:Calendar,crown:Crown};

export function HelpScreen(){
 const {t}=useI18n();const navigate=useNavigate();const [open,setOpen]=useState<HelpKey|null>(null);const close=useCallback(()=>setOpen(null),[]);
 const row=(k:HelpKey)=><Row key={k} icon={HELP_ICON[k]} tone="v" title={t('fe.ax.help.'+k)} onClick={()=>setOpen(k)}/>;
 return <>
  <Bar title={t('fe.ax.help.title')} back/>
  <View className="nodock compact">
   <Card list>{(['rules','report'] as const).map(row)}</Card>
   <SectionLabel>{t('fe.ax.help.faq')}</SectionLabel>
   <Card list>{(['shield','lock','heart','cal','crown'] as const).map(row)}</Card>
   <Alert kind="warn" className="mt16"><b>{t('fe.ax.help.threatTitle')}</b>{t('fe.ax.help.threatText')}</Alert>
  </View>
  {open&&<Sheet title={t('fe.ax.help.'+open)} onClose={close}
   foot={open==='crown'?<Btn kind="soft" onClick={()=>navigate('/n/premium')}>{t('fe.ax.help.morePremium')}</Btn>:undefined}>
   <p className="lead">{t('fe.ax.help.'+open+'Text')}</p></Sheet>}
 </>;
}
