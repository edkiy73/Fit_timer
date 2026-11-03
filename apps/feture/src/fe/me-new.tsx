import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bookmark,Calendar,Camera,ClipboardList,Eye,Globe,Heart,Images,Inbox,KeyRound,Lock,PenLine,Settings,Sparkles,UserRound,Users,X} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Av,Bar,Btn,Card,Empty,Group,IconBtn,Row,Seg,Skel,View} from './kit';
import {useFe,useLive,useShown} from './session';
import {BellButton,countsRes} from './inbox';
import {StaffEntry} from './staff';
import {ActAsSheet,CouplePending} from './couple';
import {MeGallery} from './gallery';
import {PrivateLayer} from './private';
import {NameBadges} from './faces';
import {usePremiumStatus} from './account-extra';
import {AboutGroup} from './about-facts';
import {Activity,DetailsGroup,GalleryGroup,InterestsGroup,LinksSection,PersonBio,ProfileHero,PhotoViewer,personProfileRes,useRelation,type PersonProfile} from './profile-extras';
import {settingsRes,type Settings as MeSettings} from './me';

/** The new «Я» (owner 04.11.2026), at /n/me/new until the owner picks it: the own profile exactly as other people see
 * it (the same parts as someone else's profile page, in the same order), plus the few controls to change it —
 * «Изменить профиль» where others have Нравится / Подписаться, «Изменить» in a section's header, and one
 * «Заполни профиль» card that lists only what is missing. In a couple the two profiles are two tabs on top. */
const list=z.object({ok:z.literal(true),items:z.array(z.unknown())}).passthrough();
const jarsRes=z.object({ok:z.literal(true),items:z.array(z.object({vis:z.string().nullable().optional()}).passthrough())});
const privRes=z.object({ok:z.literal(true),exists:z.boolean().optional(),on:z.boolean().optional(),text:z.string().nullable().optional(),media:z.array(z.unknown()).optional(),interests:z.array(z.unknown()).optional()}).passthrough();
const photoRes=z.object({ok:z.literal(true),state:z.enum(['none','pending','approved','rejected'])}).passthrough();
const evsRes=z.object({ok:z.literal(true)}).catchall(z.unknown());
type Extra={jars:number,priv:number,privOn:boolean,reqs:number,events:number,saved:number};

export function MeNewScreen(){
 const {state,acting,setActing,call,peek}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [p,setP]=useShown<PersonProfile|null>('me.pp',()=>acting?peek('profile.get',{profileId:acting.id},personProfileRes)?.profile??null:null);
 const [error,setError]=useState<unknown>(null);const [tick,setTick]=useState(0);const [switching,setSwitching]=useState(false);
 const [todo,setTodo]=useShown('me.todo',()=>0);const [x,setX]=useState<Extra|null>(null);const [view,setView]=useState<number|null>(null);
 const [verified,setVerified]=useState(false);const premium=usePremiumStatus().status;
 const [rel]=useRelation(acting?.id??'');
 const load=useCallback(()=>{if(!acting)return;setError(null);setTick(n=>n+1);
  call('profile.get',{profileId:acting.id},personProfileRes,{fresh:true}).then(r=>setP(r.profile)).catch(setError);
 },[call,acting]);
 useEffect(()=>{load();},[load]);
 useLive(['profile','media','check','couple'],load);
 const pull=useCallback(()=>{
  call('inbox.counts',{},countsRes,{asAccount:true}).then(r=>setTodo(r.decide)).catch(()=>{});
  call('verification.photoStatus',{},photoRes,{asAccount:true}).then(r=>setVerified(r.state==='approved')).catch(()=>{});
  if(!acting)return;const id=acting.id;const n=<T,>(q:Promise<T>,f:(r:T)=>number)=>q.then(f).catch(()=>0);
  Promise.all([n(call('interests.list',{profileId:id},jarsRes),r=>r.items.filter(j=>j.vis!=='granted'&&j.vis!=='only').length),
   call('private.get',{profileId:id},privRes).catch(()=>null),
   call('profile.settings',{},settingsRes).catch(()=>null),
   n(call('access.lists',{tab:'incoming'},list),r=>r.items.length),
   n(call('event.mine',{},evsRes),r=>new Set(['going','interested','organizing','applications'].flatMap(k=>Array.isArray(r[k])?(r[k] as {id:string}[]).map(e=>e.id):[])).size),
   n(call('saved.list',{},list),r=>r.items.length)])
   .then(([jars,pr,st,reqs,events,saved])=>{const s=st?.settings as MeSettings|undefined;
    const priv=pr?(pr.text?1:0)+(pr.media?.length??0)+(pr.interests?.length??0):0;
    setX({jars,priv,privOn:(s?.privateOn!==false)&&priv>0,reqs,events,saved});});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[call,acting,tick]);
 useEffect(()=>{pull();},[pull]);
 useLive(['counts','decide','notify'],pull);
 if(state.status!=='ready'||!acting)return null;
 const profiles=state.boot.profiles.filter(q=>q.state!=='deleted');
 const couple=profiles.find(q=>q.kind==='couple');const person=profiles.find(q=>q.kind==='person');const cp=acting.kind==='couple';
 const name=p?.name||acting.name||acting.handle||'?';
 const go=(to:string)=>()=>navigate(to);
 const edit=(to:string)=><button type="button" onClick={go(to)}>{t('fe.mx.edit')}</button>;
 // The page is drawn only for the acting profile, whole: no blocks popping in after a tab switch.
 const ready=!!p&&p.id===acting.id&&!!x;
 const photos=p?p.photos.filter(m=>m.src):[];
 const hasDetails=!!p&&Object.values(p.details).some(v=>Array.isArray(v)?v.length>0:!!v);
 const hasFacts=!!p&&p.kind==='person'&&!!p.about&&Object.values(p.about as Record<string,unknown>).some(v=>Array.isArray(v)?v.length>0:v!=null&&v!=='');
 const missing=ready?[
  cp&&!p.photos.length&&{icon:Camera,title:t('fe.m3.miss.photo'),to:'/n/me/edit?only=media'},
  !p.bio&&{icon:PenLine,title:t('fe.m3.miss.bio'),to:'/n/me/edit?only=basics'},
  !cp&&!hasFacts&&{icon:UserRound,title:t('fe.m3.miss.facts'),to:'/n/me/edit?only=about'},
  !hasDetails&&{icon:ClipboardList,title:t('fe.m3.miss.details'),to:'/n/me/edit?only=details'},
  !x.jars&&{icon:Sparkles,title:t('fe.m3.miss.jars'),to:'/n/me/interests'},
 ].filter((m):m is {icon:typeof Camera,title:string,to:string}=>!!m):[];
 return <>
  <Bar title={name} lead={<Av name={name} seed={acting.id} src={p?.avatar?.src?.thumb??acting.avatar}/>}
   mark={cp?undefined:<NameBadges p={{photoVerified:verified,premium:!!premium?.premium}}/>}
   sub={couple?(cp?t('fe.me.weCouple'):t('fe.me.iPersonal')):t('fe.me.personalProfile')}
   {...(couple?{onTitle:()=>setSwitching(true),titleLabel:t('fe.mx.whose')}:{})}>
   <StaffEntry/>
   <BellButton/>
   <IconBtn icon={Eye} label={t('fe.mx.howSeen')} title={t('fe.mx.howSeen')} onClick={go('/n/me/preview')}/>
   <IconBtn icon={Settings} label={t('fe.me.settings')} onClick={go('/n/settings/new')}/>
  </Bar>
  <View refresh={()=>{load();pull();}}>
   {couple&&person&&<Seg value={cp?'couple':'person'} label={t('fe.mx.whose')}
    options={[{id:'person',label:t('fe.m2.mine.profile')},{id:'couple',label:t('fe.m2.couple.profile')}]}
    onChange={v=>setActing(v==='couple'?couple.id:person.id)}/>}
   {todo>0&&<Card list><Row className="me-todo" icon={Inbox} tone="l" title={t('fe.mx.todo')} badge={todo} onClick={go('/n/inbox')}/></Card>}
   {error&&!ready?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!ready?<Skel kind="card" rows={3}/>
    :<div className="profile-page m3">
     {cp&&<CouplePending tick={tick} onDecided={()=>{load();pull();}}/>}
     <ProfileHero p={p} rel={rel} onOpen={setView}/>
     <PersonBio p={p}/>
     <div className="p-acts">
      <Btn kind="soft" icon={PenLine} onClick={go('/n/me/edit')}>{t('fe.m3.edit')}</Btn>
      {cp?<Btn kind="soft" icon={Heart} onClick={go('/n/me/pair')}>{t('fe.m3.pair')}</Btn>
       :<Btn kind="soft" icon={Camera} onClick={go('/n/me/edit?only=media')}>{t('fe.m3.photos')}</Btn>}
     </div>
     {missing.length>0&&<Group title={t('fe.m3.fill')}><Card list>
      {missing.map(m=><Row key={m.to} icon={m.icon} title={m.title} onClick={go(m.to)}/>)}
     </Card></Group>}
     <AboutGroup p={p} action={edit('/n/me/edit?only=about')}/>
     <DetailsGroup p={p} action={edit('/n/me/edit?only=details')}/>
     <LinksSection profileId={p.id} action={edit('/n/me/links')}/>
     <InterestsGroup profileId={p.id} name={name} action={edit('/n/me/interests')}/>
     <GalleryGroup p={p}/>
     <Group><Card list>
      <Row icon={Lock} title={t('fe.m2.private')} val={t(x.privOn?'fe.m2.on':'fe.m2.off')} onClick={go('/n/me/new/private')}/>
      <Row icon={KeyRound} title={t(cp?'fe.ac.titleUs':'fe.ac.title')} badge={x.reqs||undefined} onClick={go('/n/me/access')}/>
     </Card></Group>
     <Activity profileId={p.id}/>
     <Group title={t('fe.m2.g.mine')}><Card list>
      <Row icon={Calendar} title={t(cp?'fe.mx.mine.eventsUs':'fe.mx.mine.events')} val={x.events?String(x.events):undefined} onClick={go('/n/me/events')}/>
      <Row icon={Globe} title={t('fe.m2.communities')} onClick={go('/n/me/communities')}/>
      <Row icon={Users} title={t('fe.mx.mine.follows')} onClick={go('/n/me/follows?tab=followers')}/>
      <Row icon={Bookmark} title={t('fe.mx.mine.saved')} val={x.saved?String(x.saved):undefined} onClick={go('/n/me/saved')}/>
      <Row icon={Images} title={t('fe.mx.gal')} onClick={go('/n/me/new/gallery')}/>
     </Card></Group>
    </div>}
  </View>
  {view!==null&&photos&&<PhotoViewer srcs={photos.map(m=>m.src?.full??m.src?.card??'').filter(Boolean)} index={view} onClose={()=>setView(null)}/>}
  {switching&&<ActAsSheet onClose={()=>setSwitching(false)}/>}
 </>;
}

/** «Приватная часть» and «Галерея» of the new «Я»: the current blocks on their own screen, one level down. */
export function MeNewSection(){
 const {section}=useParams();const {acting,call}=useFe();const {t}=useI18n();
 const [settings,setSettings]=useState<MeSettings|null>(null);
 const load=useCallback(()=>{call('profile.settings',{},settingsRes).then(r=>setSettings(r.settings)).catch(()=>{});},[call]);
 useEffect(()=>{load();},[load]);
 if(!acting)return null;
 const gallery=section==='gallery';
 return <>
  <Bar title={gallery?t('fe.mx.gal'):t('fe.m2.private')} back="/n/me/new"/>
  <View refresh={load}>
   {gallery?<MeGallery profileId={acting.id} couple={acting.kind==='couple'} title={t('fe.mx.gal')}/>
    :!settings?<Skel kind="card" rows={2}/>
    :<PrivateLayer key={acting.id} profileId={acting.id} on={settings.privateOn!==false} requestsFrom={settings.requestsFrom??'all'} onChanged={load} askHere={false}/>}
  </View>
 </>;
}
