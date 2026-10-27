import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {BadgeCheck,Ban,Bell,ChevronRight,Crown,LifeBuoy,Download,Eye,EyeOff,Globe,Heart,LogOut,Moon,ShieldCheck,Trash2,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {getThemePreference,setThemePreference,type ThemePreference} from '../theme';
import {Bar,Btn,Empty,View} from './ui';
import {useFe} from './session';
import {usePremiumStatus} from './account-extra';

/** V21 K01 (settings), K05 (notifications), K07 (my data and deletion) on /api/fe. */
const settingsRes=z.object({ok:z.literal(true),settings:z.object({locale:z.string(),chatBlur:z.boolean(),newsOptIn:z.boolean(),showExplicit:z.boolean()})});
const channel=z.object({push:z.boolean(),email:z.boolean()});
const notif=z.object({mode:z.enum(['safe','normal']),push:z.boolean(),email:z.boolean(),digest:z.enum(['instant','daily','weekly']),quiet:z.object({on:z.boolean(),from:z.string(),to:z.string()}),
 categories:z.object({match:channel,likes:channel,req:channel,events:channel,replies:channel,follows:channel,groups:channel,news:channel})});
type Notif=z.infer<typeof notif>;
const notifRes=z.object({ok:z.literal(true),settings:notif});
const ageRes=z.object({ok:z.literal(true),verified:z.boolean()}).passthrough();
const photoRes=z.object({ok:z.literal(true),state:z.enum(['none','pending','approved','rejected'])}).passthrough();
const ok=z.object({ok:z.literal(true)}).passthrough();
const blocksRes=z.object({ok:z.literal(true),items:z.array(z.unknown())}).passthrough();

function Row({icon:Icon,title,note,value,onClick,danger}:{icon:typeof Bell,title:string,note?:string|undefined,value?:string|undefined,onClick:()=>void,danger?:boolean}){
 return <button type="button" className={'li'+(danger?' danger':'')} onClick={onClick}><span className="ico"><Icon/></span><span className="tx"><b>{title}</b>{note&&<small>{note}</small>}</span>{value&&<span className="val">{value}</span>}{!danger&&<ChevronRight/>}</button>;
}

export function SettingsScreen(){
 const {call,state,acting}=useFe();const {t,preference,setPreference,canSwitch}=useI18n();const [blocked,setBlocked]=useState<number|null>(null);const auth=useOptionalAuth();const navigate=useNavigate();
 const [s,setS]=useState<z.infer<typeof settingsRes>['settings']|null>(null);const [age,setAge]=useState<boolean|null>(null);const [photo,setPhoto]=useState<z.infer<typeof photoRes>['state']|null>(null);const [theme,setTheme]=useState<ThemePreference>(getThemePreference());
 const [error,setError]=useState<unknown>(null);const [failure,setFailure]=useState('');const premium=usePremiumStatus().status;
 const load=useCallback(()=>{setError(null);call('settings.get',{},settingsRes,{asAccount:true}).then(r=>setS(r.settings)).catch(setError);
  call('verification.ageStatus',{},ageRes,{asAccount:true}).then(r=>setAge(r.verified)).catch(()=>{});
  call('verification.photoStatus',{},photoRes,{asAccount:true}).then(r=>setPhoto(r.state)).catch(()=>{});
  call('blocks.list',{},blocksRes).then(r=>setBlocked(r.items.length)).catch(()=>{});},[call]);
 useEffect(()=>{load();},[load]);
 const update=async(patch:Record<string,unknown>)=>{setFailure('');try{await call('settings.update',{opId:newOpId(),...patch},ok,{asAccount:true});load();}catch(e){setFailure(feErrorMessage(e,t));}};
 const couple=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='couple'):undefined;
 const email=state.status==='ready'?state.session.email:'';
 return <>
  <Bar title={t('fe.set.title')} back="/n/me"/>
  <View className="compact">
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>:<>
    <div className="sec" style={{marginTop:4}}>{t('fe.set.account')}</div>
    <div className="card list">
     <Row icon={ShieldCheck} title={t('fe.set.signIn')} note={email} onClick={()=>navigate('/n/settings/security')}/>
     <Row icon={ShieldCheck} title={t('fe.set.age')} note={t('fe.set.ageNote')} value={age===null?undefined:age?t('fe.set.ageOk'):t('fe.set.ageNo')} onClick={()=>navigate('/n/settings/age')}/>
     <Row icon={BadgeCheck} title={t('fe.pc.row')} note={t('fe.pc.rowNote')} value={photo===null?undefined:photo==='approved'?t('fe.pc.rowOk'):photo==='pending'?t('fe.pc.rowWait'):t('fe.pc.rowNo')} onClick={()=>navigate('/n/settings/photo-check')}/>
     <Row icon={Eye} title={t('fe.set.privacy')} note={t('fe.set.privacyNote')} onClick={()=>navigate('/n/me?layer=vis')}/>
     <Row icon={Crown} title={t('fe.ax.prem.entry')} note={t('fe.ax.prem.entryNote')} value={premium?.premium?t('fe.ax.prem.entryOn'):undefined} onClick={()=>navigate('/n/premium')}/>
     <Row icon={Heart} title={t('fe.pair.section')} note={couple?(couple.name||t('fe.pair.ourProfile')):t('fe.pair.entryOff')} onClick={()=>navigate('/n/me/pair')}/>
    </div>
    <div className="sec">{t('fe.set.app')}</div>
    <div className="card list">
     {canSwitch&&<div className="li"><span className="ico"><Globe/></span><label className="selrow"><span className="selt">{t('fe.set.lang')}<small>{t('fe.set.langNote')}</small></span>
      <span className="selv" aria-hidden="true">{t('fe.set.lang.'+preference)}</span>
      <select value={preference} onChange={e=>{setPreference(e.target.value);if(e.target.value!=='system')void update({locale:e.target.value});}} aria-label={t('fe.set.lang')}>
       {(['system','ru','en'] as const).map(v=><option key={v} value={v}>{t('fe.set.lang.'+v)}</option>)}</select></label></div>}
     <div className="li"><span className="ico"><Moon/></span><label className="selrow"><span className="selt">{t('fe.set.theme')}<small>{t('fe.set.themeNote')}</small></span>
      <span className="selv" aria-hidden="true">{t('fe.set.theme.'+theme)}</span>
      <select value={theme} onChange={e=>{const v=e.target.value as ThemePreference;setTheme(v);setThemePreference(v);}} aria-label={t('fe.set.theme')}>
       {(['system','light','dark'] as const).map(v=><option key={v} value={v}>{t('fe.set.theme.'+v)}</option>)}</select></label></div>
     <Row icon={Bell} title={t('fe.set.notifications')} note={t('fe.set.notificationsNote')} onClick={()=>navigate('/n/settings/notifications')}/>
    </div>
    <div className="sec">{t('fe.nav.chats')}</div>
    <div className="card list">
     <button type="button" className="li" role="switch" aria-checked={!!s?.chatBlur} disabled={!s} onClick={()=>s&&update({chatBlur:!s.chatBlur})}>
      <span className="ico"><Eye/></span><span className="tx"><b>{t('fe.set.blur')}</b><small>{t('fe.set.blurNote')}</small></span><span className={'sw'+(s?.chatBlur?' on':'')} aria-hidden="true"/>
     </button>
    </div>
    <div className="sec">{t('fe.set.data')}</div>
    <div className="card list">
     <Row icon={EyeOff} title={t('fe.tl.set.hidden')} note={t('fe.tl.set.hiddenNote')} onClick={()=>navigate('/n/settings/hidden')}/>
     <Row icon={Ban} title={t('fe.tl.set.blocked')} note={acting?.kind==='couple'?t('fe.tl.set.blockedNoteCouple').replace('{name}',acting.name||acting.handle||''):t('fe.tl.set.blockedNote')} value={blocked===null?undefined:String(blocked)} onClick={()=>navigate('/n/settings/blocked')}/>
     <Row icon={Download} title={t('fe.set.myData')} note={t('fe.set.myDataNote')} onClick={()=>navigate('/n/settings/data')}/></div>
    <div className="sec">{t('fe.set.support')}</div>
    <div className="card list"><Row icon={LifeBuoy} title={t('fe.ax.help.entry')} note={t('fe.ax.help.entryNote')} onClick={()=>navigate('/n/help')}/><Row icon={LogOut} title={t('fe.set.logout')} danger onClick={()=>{void auth.logout().then(()=>navigate('/'));}}/></div>
    {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
    <p className="note center mt24">FetUre · V21</p>
   </>}
  </View>
 </>;
}

export function NotificationSettingsScreen(){
 const {call}=useFe();const {t}=useI18n();
 const [n,setN]=useState<Notif|null>(null);const [error,setError]=useState<unknown>(null);const [failure,setFailure]=useState('');const [saved,setSaved]=useState(false);
 const load=useCallback(()=>{setError(null);call('notifications.settings.get',{},notifRes,{asAccount:true}).then(r=>setN(r.settings)).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 const save=async(next:Notif)=>{setN(next);setFailure('');setSaved(false);try{await call('notifications.settings.update',{opId:newOpId(),settings:next},ok,{asAccount:true});setSaved(true);}catch(e){setFailure(feErrorMessage(e,t));load();}};
 const sw=(on:boolean,title:string,note:string|undefined,flip:()=>void)=><button type="button" className="li" role="switch" aria-checked={on} onClick={flip}><span className="tx"><b>{title}</b>{note&&<small>{note}</small>}</span><span className={'sw'+(on?' on':'')} aria-hidden="true"/></button>;
 return <>
  <Bar title={t('fe.set.notifications')} back="/n/settings"/>
  <View className="compact">
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!n?<p className="note" role="status">{t('fe.loading')}</p>:<>
    <div className="sec" style={{marginTop:4}}>{t('fe.set.n.channels')}</div>
    <div className="card list">{sw(n.push,t('fe.set.n.push'),undefined,()=>save({...n,push:!n.push}))}{sw(n.email,t('fe.set.n.email'),undefined,()=>save({...n,email:!n.email}))}</div>
    <div className="sec">{t('fe.set.n.lock')}</div>
    <div className="chips" role="radiogroup">{(['safe','normal'] as const).map(m=><button key={m} type="button" role="radio" aria-checked={n.mode===m} className={'chip'+(n.mode===m?' on':'')} onClick={()=>save({...n,mode:m})}>{t('fe.set.n.mode.'+m)}</button>)}</div>
    <p className="note mt8">{t('fe.set.n.modeNote.'+n.mode)}</p>
    <div className="sec">{t('fe.set.n.quiet')}</div>
    <div className="card list">{sw(n.quiet.on,t('fe.set.n.quietOn'),t('fe.set.n.quietNote').replace('{from}',n.quiet.from).replace('{to}',n.quiet.to),()=>save({...n,quiet:{...n.quiet,on:!n.quiet.on}}))}</div>
    <div className="sec">{t('fe.set.n.what')}</div>
    <div className="card list">{(Object.keys(n.categories) as (keyof Notif['categories'])[]).map(k=>sw(n.categories[k].push,t('fe.set.n.cat.'+k),undefined,()=>save({...n,categories:{...n.categories,[k]:{...n.categories[k],push:!n.categories[k].push}}})))}</div>
    {saved&&<p className="note mt8" role="status">{t('fe.me.saved')}</p>}
    {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
   </>}
  </View>
 </>;
}

export function DataScreen(){
 const {call,state}=useFe();const {t}=useI18n();const auth=useOptionalAuth();const navigate=useNavigate();
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [confirm,setConfirm]=useState('');const [ask,setAsk]=useState(false);const op=useRef(newOpId());
 const handle=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='person')?.handle??'':'';
 const exportData=async()=>{setBusy(true);setFailure('');try{const r=await call('account.export',{},z.object({ok:z.literal(true)}).passthrough(),{asAccount:true});
  const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='feture-data.json';a.click();URL.revokeObjectURL(a.href);}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 const remove=async()=>{setBusy(true);setFailure('');try{await call('account.delete',{opId:op.current,confirmHandle:confirm.trim()},ok,{asAccount:true});await auth.logout();navigate('/');}
  catch(e){setFailure(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}};
 return <>
  <Bar title={t('fe.set.myData')} back="/n/settings"/>
  <View>
   <section className="grp"><div className="grp-t"><span>{t('fe.set.export')}</span></div>
    <div className="card"><p>{t('fe.set.exportText')}</p><Btn kind="soft" icon={Download} className="mt12" onClick={exportData} disabled={busy}>{t('fe.set.exportBtn')}</Btn></div></section>
   <section className="grp"><div className="grp-t"><span>{t('fe.set.delete')}</span></div>
    <div className="card"><p>{t('fe.set.deleteText')}</p>
     {!ask?<Btn kind="danger" icon={Trash2} className="mt12" onClick={()=>setAsk(true)}>{t('fe.set.deleteBtn')}</Btn>:<>
      <label className="field mt12"><span>{t('fe.set.deleteConfirm').replace('{nick}',handle)}</span><input className="inp" value={confirm} onChange={e=>setConfirm(e.target.value)} autoCapitalize="off" spellCheck={false}/></label>
      <div className="btns"><Btn kind="danger" onClick={remove} disabled={busy||confirm.trim().toLowerCase()!==handle.toLowerCase()}>{t('fe.set.deleteFinal')}</Btn><Btn kind="text" onClick={()=>{setAsk(false);setConfirm('');}}>{t('fe.cancel')}</Btn></div>
     </>}
    </div></section>
   {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
  </View>
 </>;
}
