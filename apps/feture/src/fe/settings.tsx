import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {Ban,Bell,Calendar,Camera,CircleHelp,Crown,Download,EyeOff,Globe,Heart,Image,KeyRound,LogOut,Mail,MessageCircle,Moon,ShieldCheck,Smartphone,Sparkles,Trash2,Users,X,type LucideIcon} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {getThemePreference,setThemePreference,type ThemePreference} from '../theme';
import {Alert,Bar,Btn,Card,ChannelHeads,ChannelToggle,ChoiceCards,Empty,Field,Group,H,Input,LockPreview,Note,Row,SectionLabel,SelectRow,Skel,Stack,Switch,TimeSpan,ToggleRow,View} from './kit';
import {useFe,useShown} from './session';
import {useToast} from './toast';
import {usePremiumStatus} from './account-extra';
import {Sheet} from './profile-extras';
import {HiddenFeedSheet} from './settings-lists';
import {Ask,LinkRow} from './settings-ui';
import {disableWebPush} from './push-web';
import {disableNativePush} from './push-native';
import {usePushDevice,warmPushState} from './push';

/** V21 K01 (settings), K05 (notifications), K07 (my data and deletion) on /api/fe. */
const settingsRes=z.object({ok:z.literal(true),settings:z.object({locale:z.string(),chatBlur:z.boolean(),newsOptIn:z.boolean(),showExplicit:z.boolean()})});
const channel=z.object({push:z.boolean(),email:z.boolean()});
const notif=z.object({mode:z.enum(['safe','normal']),push:z.boolean(),email:z.boolean(),digest:z.enum(['instant','daily','weekly']),quiet:z.object({on:z.boolean(),from:z.string(),to:z.string()}),
 categories:z.object({match:channel,likes:channel,req:channel,events:channel,replies:channel,follows:channel,groups:channel,news:channel}),offered:z.boolean().optional()});
type Notif=z.infer<typeof notif>;
const notifRes=z.object({ok:z.literal(true),settings:notif});
const ageRes=z.object({ok:z.literal(true),verified:z.boolean(),check:z.object({state:z.string()}).passthrough().nullable().optional()}).passthrough();
const photoRes=z.object({ok:z.literal(true),state:z.enum(['none','pending','approved','rejected'])}).passthrough();
const ok=z.object({ok:z.literal(true)}).passthrough();
const blocksRes=z.object({ok:z.literal(true),items:z.array(z.unknown())}).passthrough();

type AgeState='ok'|'pending'|'none';

export function SettingsScreen(){
 const {call,peek,state,acting}=useFe();const {t,preference,setPreference,canSwitch}=useI18n();const auth=useOptionalAuth();const navigate=useNavigate();const toast=useToast();
 // What the screen showed last (or the last answers) on the first frame; one wave of reads replaces them together.
 const ageOf=(r:z.infer<typeof ageRes>):AgeState=>r.verified?'ok':r.check?.state==='submitted'?'pending':'none';
 const [blocked,setBlocked]=useShown<number|null>('set.blocked',()=>peek('blocks.list',{},blocksRes)?.items.length??null);
 const [s,setS]=useShown<z.infer<typeof settingsRes>['settings']|null>('set.s',()=>peek('settings.get',{},settingsRes,{asAccount:true})?.settings??null);
 const [age,setAge]=useShown<AgeState|null>('set.age',()=>{const r=peek('verification.ageStatus',{},ageRes,{asAccount:true});return r?ageOf(r):null;});
 const [photo,setPhoto]=useShown<z.infer<typeof photoRes>['state']|null>('set.photo',()=>peek('verification.photoStatus',{},photoRes,{asAccount:true})?.state??null);
 const [theme,setTheme]=useState<ThemePreference>(getThemePreference());
 const [error,setError]=useState<unknown>(null);const premium=usePremiumStatus().status;
 const [layer,setLayer]=useState<'hidden'|'logout'|null>(null);const [leaving,setLeaving]=useState(false);
 const load=useCallback(()=>{setError(null);
  void Promise.allSettled([call('settings.get',{},settingsRes,{asAccount:true}),call('verification.ageStatus',{},ageRes,{asAccount:true}),
   call('verification.photoStatus',{},photoRes,{asAccount:true}),call('blocks.list',{},blocksRes)]).then(([a,b,c,d])=>{
   if(a.status==='fulfilled')setS(a.value.settings);else setError(a.reason);
   if(b.status==='fulfilled')setAge(ageOf(b.value));if(c.status==='fulfilled')setPhoto(c.value.state);if(d.status==='fulfilled')setBlocked(d.value.items.length);});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[call]);
 useEffect(()=>{load();warmPushState();},[load]);
 const update=async(patch:Record<string,unknown>,done?:string)=>{
  // Optimistic: the switch moves at once and comes back if the server says no.
  const before=s;if(s)setS({...s,...patch} as typeof s);
  try{await call('settings.update',{opId:newOpId(),...patch},ok,{asAccount:true});if(done)toast(done,{type:'ok'});}
  catch(e){setS(before);toast(feErrorMessage(e,t),{type:'err'});}};
 const couple=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='couple'&&p.state!=='deleted'):undefined;
 const email=state.status==='ready'?state.session.email:'';
 const closeLayer=useCallback(()=>setLayer(null),[]);
 const logout=async()=>{setLeaving(true);try{await disableWebPush(call);await disableNativePush(call);await auth.logout();navigate('/n/feed',{replace:true});}catch{setLeaving(false);setLayer(null);toast(t('fe.ax.sec.logoutFailed'),{type:'err'});}};
 const ageVal=age&&t('fe.set.ageVal.'+age);
 const photoVal=photo&&t('fe.set.pcVal.'+photo);
 return <>
  <Bar title={t('fe.set.title')} back="/n/me"/>
  <View className="nodock compact">
   {error&&!s?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!s?<><SectionLabel>{t('fe.set.account')}</SectionLabel><Skel kind="list" rows={6}/><SectionLabel>{t('fe.set.app')}</SectionLabel><Skel kind="list" rows={3}/></>:<>
    <SectionLabel>{t('fe.set.account')}</SectionLabel>
    <Card list>
     <LinkRow icon={KeyRound} title={t('fe.set.signIn')} sub={email||t('fe.set.noEmail')} onClick={()=>navigate('/n/settings/security')}/>
     <LinkRow icon={ShieldCheck} tone={age==='ok'?'g':''} title={t('fe.set.age')} sub={t('fe.set.ageNote')} val={ageVal} onClick={()=>navigate('/n/settings/age')}/>
     <LinkRow icon={Camera} tone="v" title={t('fe.pc.row')} sub={t('fe.set.pcSub')} val={photoVal} onClick={()=>navigate('/n/settings/photo-check')}/>
     <LinkRow icon={Crown} tone="l" title="Premium" sub={t('fe.set.premSub')} val={premium?t(premium.premium?'fe.set.premOn':'fe.set.premOff'):undefined} onClick={()=>navigate('/n/premium')}/>
     {couple?<LinkRow icon={Users} tone="v" title={t('fe.set.pair')} sub={t('fe.set.pairSub',{name:couple.name||couple.handle||''})} onClick={()=>navigate('/n/me/pair')}/>
      :<LinkRow icon={Users} tone="v" title={t('fe.set.pairNew')} sub={t('fe.set.pairNewSub')} onClick={()=>navigate('/n/me/pair')}/>}
    </Card>
    <SectionLabel>{t('fe.set.app')}</SectionLabel>
    <Card list>
     {canSwitch&&<SelectRow icon={Globe} label={t('fe.set.lang')} sub={t('fe.set.langNote')} value={preference} options={(['system','ru','en'] as const).map(v=>[v,t('fe.set.lang.'+v)] as const)}
      onChange={v=>{setPreference(v);toast(t('fe.set.langDone.'+(v==='system'?'system':v)),{type:'ok'});void update({locale:v});}}/>}
     <SelectRow icon={Moon} label={t('fe.set.theme')} sub={t('fe.set.themeNote')} value={theme} options={(['light','dark','system'] as const).map(v=>[v,t('fe.set.theme.'+v)] as const)}
      onChange={v=>{setTheme(v);setThemePreference(v);}}/>
     <LinkRow icon={Bell} title={t('fe.set.notifications')} sub={t('fe.set.notificationsNote')} onClick={()=>navigate('/n/settings/notifications')}/>
    </Card>
    <SectionLabel>{t('fe.nav.chats')}</SectionLabel>
    <Card list>
     <ToggleRow icon={EyeOff} title={t('fe.set.blur')} sub={t('fe.set.blurNote')} on={!!s?.chatBlur} disabled={!s}
      onClick={()=>s&&void update({chatBlur:!s.chatBlur},t(s.chatBlur?'fe.set.blurOff':'fe.set.blurOn'))}/>
    </Card>
    <SectionLabel>{t('fe.set.data')}</SectionLabel>
    <Card list>
     <LinkRow icon={EyeOff} title={t('fe.tl.set.hidden')} sub={t('fe.tl.set.hiddenNote')} onClick={()=>setLayer('hidden')}/>
     <LinkRow icon={Ban} title={t('fe.tl.set.blocked')} sub={acting?.kind==='couple'?t('fe.tl.set.blockedNoteCouple').replace('{name}',acting.name||acting.handle||''):t('fe.tl.set.blockedNote')}
      val={blocked===null?undefined:String(blocked)} onClick={()=>navigate('/n/settings/blocked')}/>
     <LinkRow icon={Download} title={t('fe.set.myData')} sub={t('fe.set.myDataNote')} onClick={()=>navigate('/n/settings/data')}/>
    </Card>
    <SectionLabel>{t('fe.set.support')}</SectionLabel>
    <Card list>
     <LinkRow icon={CircleHelp} title={t('fe.ax.help.entry')} sub={t('fe.ax.help.entryNote')} onClick={()=>navigate('/n/help')}/>
     <LinkRow icon={LogOut} danger title={t('fe.set.logout')} onClick={()=>setLayer('logout')}/>
    </Card>
   </>}
  </View>
  {layer==='hidden'&&<HiddenFeedSheet onClose={closeLayer}/>}
  {layer==='logout'&&<Ask icon={LogOut} title={t('fe.set.logoutTitle')} text={t('fe.set.logoutText')} ok={t('fe.set.logout')} danger busy={leaving} onOk={()=>void logout()} onCancel={closeLayer}/>}
 </>;
}

/* ---------- K05 ---------- */
const CATS:[keyof Notif['categories'],LucideIcon][]=[['match',MessageCircle],['likes',Heart],['req',KeyRound],['events',Calendar],['replies',Image],['follows',Users],['groups',Globe],['news',Sparkles]];
const HALF_HOURS=Array.from({length:48},(_,i)=>`${String(i>>1).padStart(2,'0')}:${i%2?'30':'00'}`);

export function NotificationSettingsScreen(){
 const {call,peek,state}=useFe();const {t}=useI18n();const toast=useToast();
 const [n,setN]=useShown<Notif|null>('set.notif',()=>peek('notifications.settings.get',{},notifRes,{asAccount:true})?.settings??null);const [error,setError]=useState<unknown>(null);
 const email=state.status==='ready'?state.session.email:'';
 const load=useCallback(()=>{setError(null);call('notifications.settings.get',{},notifRes,{asAccount:true}).then(r=>setN(r.settings)).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 // Every change is saved at once; a refusal brings the screen back to what the server has.
 const last=useRef(0);
 const save=async(next:Notif,done?:string)=>{const before=n;setN(next);const mine=++last.current;
  try{await call('notifications.settings.update',{opId:newOpId(),settings:next},ok,{asAccount:true});if(done)toast(done,{type:'ok'});}
  catch(e){if(mine===last.current)setN(before);toast(feErrorMessage(e,t),{type:'err'});}};
 const safe=n?.mode==='safe';const device=usePushDevice();
 return <>
  <Bar title={t('fe.set.notifications')} back="/n/settings"/>
  <View className="nodock compact">
   {error&&!n?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!n?<><SectionLabel>{t('fe.set.n.lock')}</SectionLabel><Skel kind="card" rows={2}/><Skel kind="list" rows={4}/></>:<>
    <SectionLabel>{t('fe.set.n.lock')}</SectionLabel>
    <ChoiceCards label={t('fe.set.n.lock')} value={n.mode} onChange={k=>void save({...n,mode:k},t('fe.set.n.modeDone.'+k))}
      options={(['normal','safe'] as const).map(k=>[k,t('fe.set.n.mode.'+k),t('fe.set.n.modeNote.'+k)] as const)}/>
    <LockPreview app="FetUre" icon="/icon.svg" items={safe
      ?[{title:'FetUre',body:t('fe.set.n.lsSafe'),time:t('fe.ax.sec.now')},{title:'FetUre',body:t('fe.set.n.lsSafe'),time:t('fe.set.n.lsAgo')}]
      :[{title:t('fe.set.n.lsMsgT'),body:t('fe.set.n.lsMsgB'),time:t('fe.ax.sec.now')},{title:t('fe.set.n.lsLikeT'),body:t('fe.set.n.lsLikeB'),time:t('fe.set.n.lsAgo')}]}/>
    <SectionLabel>{t('fe.set.n.channels')}</SectionLabel>
    <Card list>
     <ToggleRow title={t('fe.set.n.push')} sub={t('fe.set.n.pushSub')} on={n.push} onClick={()=>void save({...n,push:!n.push})}/>
     {n.push&&device.row}
     <ToggleRow title={t('fe.set.n.email')} sub={email||t('fe.set.noEmail')} on={n.email} onClick={()=>void save({...n,email:!n.email})}/>
     {n.email&&<SelectRow row label={t('fe.set.n.digest')} sub={t('fe.set.n.digestSub')} value={n.digest}
      options={(['instant','daily','weekly'] as const).map(v=>[v,t('fe.set.n.digest.'+v)] as const)} onChange={v=>void save({...n,digest:v})}/>}
    </Card>
    {n.push&&device.note}
    <SectionLabel action={<ChannelHeads labels={[t('fe.set.n.colPush'),t('fe.set.n.colEmail')]}/>}>{t('fe.set.n.what')}</SectionLabel>
    <Card list className="ncats">{CATS.map(([k,Icon])=>{const c=n.categories[k];const title=t('fe.set.n.cat.'+k);
     const flip=(ch:'push'|'email')=>void save({...n,categories:{...n.categories,[k]:{...c,[ch]:!c[ch]}}});
     return <Row key={k} icon={Icon} title={title} sub={t('fe.set.n.catSub.'+k)} end={<>
      <ChannelToggle icon={Smartphone} on={c.push} disabled={!n.push} label={t('fe.set.n.colPush')+': '+title} onClick={()=>flip('push')}/>
      <ChannelToggle icon={Mail} on={c.email} disabled={!n.email} label={t('fe.set.n.colEmail')+': '+title} onClick={()=>flip('email')}/></>}/>;})}</Card>
    <Group title={t('fe.set.n.quiet')} foot={t('fe.set.n.security')}><Card list>
     <Row title={t('fe.set.n.dnd')} extra={<TimeSpan from={n.quiet.from} to={n.quiet.to} options={HALF_HOURS.map(v=>[v,v] as const)} disabled={!n.quiet.on}
       words={{from:t('fe.set.n.from'),to:t('fe.set.n.to'),fromLabel:t('fe.set.n.fromLabel'),toLabel:t('fe.set.n.toLabel')}}
       onFrom={v=>void save({...n,quiet:{...n.quiet,from:v}})} onTo={v=>void save({...n,quiet:{...n.quiet,to:v}})}/>}
      end={<Switch label={t('fe.set.n.dnd')} on={n.quiet.on} onChange={on=>void save({...n,quiet:{...n.quiet,on}})}/>}/>
    </Card></Group>
   </>}
  </View>
 </>;
}

/* ---------- K07 ---------- */
export function DataScreen(){
 const {call,state}=useFe();const {t}=useI18n();const auth=useOptionalAuth();const navigate=useNavigate();const toast=useToast();
 const [exporting,setExporting]=useState(false);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [confirm,setConfirm]=useState('');const [ask,setAsk]=useState(false);
 const [shake,setShake]=useState(false);const op=useRef(newOpId());
 const profiles=state.status==='ready'?state.boot.profiles.filter(p=>p.state!=='deleted'):[];
 const handle=profiles.find(p=>p.kind==='person')?.handle??'';
 const couple=profiles.find(p=>p.kind==='couple');
 const exportData=async()=>{setExporting(true);try{const r=await call('account.export',{},z.object({ok:z.literal(true)}).passthrough(),{asAccount:true});
  const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='feture-data.json';a.click();URL.revokeObjectURL(a.href);
  toast(t('fe.set.exportDone'),{type:'ok'});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setExporting(false);}};
 const remove=async()=>{
  if(confirm.trim().replace(/^@/,'').toLowerCase()!==handle.toLowerCase()){setFailure(t('fe.set.deleteMismatch'));setShake(true);setTimeout(()=>setShake(false),500);return;}
  setBusy(true);setFailure('');
  try{await call('account.delete',{opId:op.current,confirmHandle:confirm.trim().replace(/^@/,'')},ok,{asAccount:true});await auth.logout();navigate('/n/feed',{replace:true});}
  catch(e){setFailure(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}};
 const close=useCallback(()=>{if(!busy){setAsk(false);setConfirm('');setFailure('');}},[busy]);
 return <>
  <Bar title={t('fe.set.myData')} back="/n/settings"/>
  <View className="nodock compact">
   <Card><Stack gap={3}><Stack gap={1}><H level={4} as="h3" className="t">{t('fe.set.exportTitle')}</H><Note>{t('fe.set.exportText')}</Note></Stack>
    <Btn kind="soft" size="md" icon={Download} onClick={exportData} busy={exporting} disabled={exporting}>{t('fe.set.exportTitle')}</Btn></Stack></Card>
   <Card tone="danger"><Stack gap={3}><Stack gap={1}><H level={4} as="h3" className="t k-danger">{t('fe.set.delete')}</H>
    <Note>{couple?t('fe.set.deleteTextCouple',{name:couple.name||couple.handle||''}):t('fe.set.deleteText')}</Note></Stack>
    <Btn kind="danger" size="md" icon={Trash2} onClick={()=>setAsk(true)}>{t('fe.set.deleteBtn')}</Btn></Stack></Card>
  </View>
  {ask&&<Sheet title={t('fe.set.deleteTitle')} onClose={close} foot={<>
   <Btn kind="danger" onClick={()=>void remove()} busy={busy} disabled={busy||!confirm.trim()}>{t('fe.set.deleteFinal')}</Btn>
   <Btn kind="soft" onClick={close} disabled={busy}>{t('fe.set.deleteKeep')}</Btn></>}>
   <p className="lead">{t('fe.set.deleteConfirm')} <b>{handle}</b></p>
   <div className={shake?'shake':undefined}><Field><Input value={confirm} placeholder={handle} aria-label={t('fe.set.deleteConfirm')} invalid={!!failure}
    onChange={e=>{setConfirm(e.target.value);setFailure('');}} onKeyDown={e=>{if(e.key==='Enter')void remove();}} autoCapitalize="off" autoComplete="off" spellCheck={false} autoFocus/></Field></div>
   {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
  </Sheet>}
 </>;
}
