import {useCallback,useEffect,useState} from 'react';
import {z} from 'zod';
import {useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import type {AuthResponseError,AuthSessionInfo} from '@appbase/core/auth.js';
import {Book,Calendar,Crown,Globe,Heart,Lock,LogOut,Mail,Pencil,ShieldCheck,Smartphone,type LucideIcon} from 'lucide-react';
import {Alert,Ask,Bar,Btn,Card,CodeInput,Field,Group,Input,Note,Pill,Row,SectionLabel,Sheet,Skel,Stack,View} from './kit';
import {useToast} from './toast';
import {useFe,useShown} from './session';
import {useDate} from './premium';
import {SupportBlock} from './support';

/** V21 K06 (sign-in & security) and S01 (help & safety); B01 Premium lives in premium.tsx. */
export {PremiumScreen,usePremiumStatus} from './premium';

/* ---------- K06 Вход и безопасность ---------- */
const EMAIL=/^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const mobile=(label:string)=>/iPhone|iPad|Android/.test(label);

/** Auth errors from Core in plain words. */
function mailError(e:unknown,t:(k:string,p?:Record<string,string>)=>string){
 const x=e as AuthResponseError;
 switch(x?.code){
  case 'bad_email':return t('fe.w8.mail.bad');
  case 'same_email':return t('fe.w8.mail.same');
  case 'email_taken':return t('fe.w8.mail.taken');
  case 'bad_code':return t('fe.w8.mail.badCode',{n:String(x.left??0)});
  case 'code_expired':return t('fe.w8.mail.expired');
  case 'too_many_today':case 'rate_limited':return t('fe.w8.mail.tooMany');
  case 'too_many_tries':return t('fe.w8.mail.tries');
  case 'mail_failed':return /test|domain|own email/i.test(x.detail??'')?t('fe.w8.mail.testDomain'):t('fe.w8.mail.failed');
  default:return t('fe.error.generic');
 }
}

/** k6email → k6emailCode → k6emailDo: the new address, then the six digits sent to it. */
function EmailChangeSheet({current,onClose}:{current:string,onClose:()=>void}){
 const {t,locale}=useI18n();const auth=useOptionalAuth();const toast=useToast();
 const [step,setStep]=useState<1|2>(1);const [email,setEmail]=useState('');const [code,setCode]=useState('');
 const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
 const send=async()=>{
  const v=email.trim().toLowerCase();
  if(!EMAIL.test(v)){setErr(t('fe.w8.mail.bad'));return;}
  if(v===current.toLowerCase()){setErr(t('fe.w8.mail.same'));return;}
  setBusy(true);setErr('');
  try{await auth.client.changeEmailStart?.(v,locale==='en'?'en':'ru');setEmail(v);setCode('');setStep(2);}
  catch(e){setErr(mailError(e,t));}finally{setBusy(false);}
 };
 const confirm=async(c=code)=>{
  if(c.length<6||busy)return;
  setBusy(true);setErr('');
  try{const next=await auth.client.changeEmailConfirm?.(email,c);if(next)auth.acceptSession(next);toast(t('fe.w8.mail.done',{email}),{type:'ok'});onClose();}
  catch(e){setErr(mailError(e,t));setCode('');}finally{setBusy(false);}
 };
 if(step===1)return <Sheet title={t('fe.w8.mail.title')} onClose={onClose} dirty={!!email.trim()} foot={<Btn busy={busy} onClick={()=>void send()}>{t('fe.w8.mail.get')}</Btn>}>
  <p className="lead">{t('fe.w8.mail.lead')}</p>
  <Field id="fe-k6-new" label={t('fe.w8.mail.label')} error={err||undefined}>
   <Input id="fe-k6-new" type="email" inputMode="email" autoComplete="email" placeholder="name@mail.com" value={email} invalid={!!err} autoFocus
    onChange={e=>{setEmail(e.target.value);setErr('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void send();}}}/>
  </Field>
 </Sheet>;
 return <Sheet title={t('fe.w8.mail.codeTitle')} onClose={onClose} dirty
  foot={<Stack gap={2}><Btn busy={busy} disabled={code.length<6} onClick={()=>void confirm()}>{t('fe.w8.mail.confirm')}</Btn><Btn kind="text" onClick={()=>{setStep(1);setErr('');}}>{t('fe.w8.mail.other')}</Btn></Stack>}>
  <p className="lead">{t('fe.w8.mail.codeLead',{email})}</p>
  <Field label={t('fe.w8.mail.code')} error={err||undefined}>
   <CodeInput value={code} onChange={v=>{setCode(v);setErr('');}} label={t('fe.w8.mail.code')} invalid={!!err} autoFocus disabled={busy} onComplete={c=>void confirm(c)}/>
  </Field>
 </Sheet>;
}

const devicesRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.string(),seenAt:z.string(),city:z.string().nullable(),country:z.string().nullable()}))});
type Seen=z.infer<typeof devicesRes>['items'][number];

/** «активно 2 ч назад» / «Берлин, Германия»: the device's last use and rough place (account.devices). */
function useSeenText(){
 const {t,locale}=useI18n();
 const rel=new Intl.RelativeTimeFormat(locale,{numeric:'auto'});
 let region:Intl.DisplayNames|null=null;try{region=new Intl.DisplayNames([locale],{type:'region'});}catch{/* old browser: the code */}
 const when=(iso:string)=>{const s=(Date.now()-Date.parse(iso))/1000;
  if(s<120)return t('fe.dev.now');
  const [n,u]:[number,Intl.RelativeTimeFormatUnit]=s<3600?[Math.round(s/60),'minute']:s<86400?[Math.round(s/3600),'hour']:[Math.round(s/86400),'day'];
  return t('fe.dev.seen',{when:rel.format(-n,u)});};
 const place=(x:Seen)=>[x.city,x.country?(region?.of(x.country)??x.country):null].filter(Boolean).join(', ');
 return {when,place};
}

export function SecurityScreen(){
 const {state,call}=useFe();const {t}=useI18n();const seenText=useSeenText();const auth=useOptionalAuth();const date=useDate();const toast=useToast();
 const email=state.status==='ready'?state.session.email:'';
 const [list,setList]=useShown<AuthSessionInfo[]|null>('set.sessions',()=>null);const [loadErr,setLoadErr]=useState(false);
 const [sheet,setSheet]=useState<null|'email'|'others'|'logout'|AuthSessionInfo>(null);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const [seen,setSeen]=useState<Record<string,Seen>>({});
 const load=useCallback(()=>{setLoadErr(false);const s=auth.client.sessions;if(!s){setList([]);return;}s().then(setList).catch(()=>setLoadErr(true));
  // When and where each device last used the app: a quiet extra, the list works without it.
  call('account.devices',{},devicesRes,{asAccount:true,fresh:true}).then(r=>setSeen(Object.fromEntries(r.items.map(x=>[x.id,x])))).catch(()=>{});},[auth.client,call]);
 useEffect(()=>{load();},[load,email]);
 const others=(list??[]).filter(s=>!s.current);
 const run=async(job:()=>Promise<string>)=>{setBusy(true);setErr('');
  try{const msg=await job();setSheet(null);toast(msg,{type:'ok'});load();}catch{setErr(t('fe.error.generic'));}finally{setBusy(false);}};
 const name=(s:AuthSessionInfo)=>s.label||t('fe.w8.sec.unknownDevice');
 /** «Chrome · Mac · Берлин, Германия · активно 2 ч назад»; without a note of use, when it signed in. */
 const line=(s:AuthSessionInfo)=>{const x=seen[s.id];
  return [s.current?name(s):null,x?seenText.place(x):null,s.current?t('fe.dev.now'):x?seenText.when(x.seenAt):s.at?t('fe.dev.signedIn',{date:date(s.at)}):null].filter(Boolean).join(' · ');};
 return <>
  <Bar title={t('fe.ax.sec.title')} back="/n/settings"/>
  <View className="nodock compact">
   <SectionLabel>{t('fe.ax.sec.methods')}</SectionLabel>
   <Card list>
    <Row icon={Mail} title={<>{t('fe.ax.sec.email')} <Pill tone="ok">{t('fe.ax.sec.primary')}</Pill></>} sub={<span className="one">{email||'—'}</span>}/>
    {auth.client.changeEmailStart&&<Row icon={Pencil} title={t('fe.w8.sec.change')} sub={t('fe.w8.sec.changeSub')} onClick={()=>setSheet('email')}/>}
   </Card>
   <Note className="mt8">{t('fe.w8.sec.oauthNote')}</Note>
   <Group title={t('fe.dev.title')} foot={t('fe.dev.note')}>
    {loadErr?<Alert kind="err" action={<Btn kind="soft" size="sm" auto onClick={load}>{t('fe.retry')}</Btn>}>{t('fe.w8.sec.loadFailed')}</Alert>
     :!list?<Skel kind="list" rows={1}/>
     :<Card list>{list.map(s=><Row key={s.id} icon={mobile(s.label)?Smartphone:Globe} tone={s.current?'g':undefined} noChev
      title={s.current?t('fe.ax.sec.thisDevice'):name(s)}
      sub={line(s)||undefined}
      end={s.current?undefined:<Btn kind="text" size="sm" auto onClick={()=>setSheet(s)}>{t('fe.dev.out')}</Btn>}/>)}</Card>}
   </Group>
   <Stack gap={2} className="mt12">
    {others.length>0&&<Btn kind="soft" icon={ShieldCheck} onClick={()=>setSheet('others')}>{t('fe.dev.others')}</Btn>}
    <Btn kind="text" icon={LogOut} onClick={()=>setSheet('logout')}>{t('fe.ax.sec.logout')}</Btn>
   </Stack>
  </View>
  {sheet==='email'&&<EmailChangeSheet current={email} onClose={()=>setSheet(null)}/>}
  {sheet==='others'&&<Ask title={t('fe.dev.othersTitle')} text={t('fe.dev.othersText')} ok={t('fe.dev.others')} danger busy={busy} error={err||undefined}
   onOk={()=>void run(async()=>t('fe.dev.othersDone',{n:String(await auth.client.revokeOtherSessions!())}))} onCancel={()=>setSheet(null)}/>}
  {sheet==='logout'&&<Ask title={t('fe.ax.sec.logout')} ok={t('fe.ax.sec.logout')} danger busy={busy} error={err||undefined}
   onOk={async()=>{setBusy(true);setErr('');try{await auth.logout();}catch{setErr(t('fe.ax.sec.logoutFailed'));}finally{setBusy(false);}}} onCancel={()=>setSheet(null)}/>}
  {sheet&&typeof sheet==='object'&&<Ask title={t('fe.dev.outTitle')} text={t('fe.dev.outText',{name:name(sheet)})} ok={t('fe.dev.out')} danger busy={busy} error={err||undefined}
   onOk={()=>void run(async()=>{await auth.client.revokeSession!(sheet.id);return t('fe.dev.outDone');})} onCancel={()=>setSheet(null)}/>}
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
   <SupportBlock/>
   <SectionLabel>{t('fe.ax.help.rules')}</SectionLabel>
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
