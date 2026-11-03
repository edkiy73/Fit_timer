import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bookmark,Calendar,Camera,ClipboardList,Eye,Globe,Heart,Images,Inbox,KeyRound,Link2,Lock,MapPin,Newspaper,PenLine,Settings,Sparkles,UserRound,Users,X,AtSign,Type} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Av,Bar,Btn,Card,Empty,Group,IconBtn,Row,Seg,Skel,View} from './kit';
import {useFe,useLive,useShown} from './session';
import {BellButton,countsRes} from './inbox';
import {StaffEntry} from './staff';
import {waitingCount} from './links';
import {linksMineRes} from './profile-extras';
import {ActAsSheet,CoupleMembers,CouplePending} from './couple';
import {MeGallery} from './gallery';
import {factItems} from './about-facts';
import {BasicAge,BasicSheet,type BasicKey} from './me-basics';
import {PrivateLayer} from './private';
import {NameBadges} from './faces';
import {usePremiumStatus} from './account-extra';
import {DETAIL_ROWS,COUPLE_ROWS,MeSkel,PhotosBlock,StatusHint,profileRes,settingsRes,type Profile,type Settings as MeSettings} from './me';

/** The new «Я» (owner 04.11.2026), shown next to the current one at /n/me/new until the owner picks it.
 * Compact: a few short lists of one-line rows with their values, in the order other people see the profile
 * (photos, name, nick, age, city, description, facts, data, interests), then the private part with access, gallery
 * and links, then «Моё». Small things are edited in a sheet right here (me-basics.tsx); a bigger one opens its
 * screen, never deeper. In a couple the two profiles are two tabs on top. */
const photoRes=z.object({ok:z.literal(true),state:z.enum(['none','pending','approved','rejected'])}).passthrough();
const list=z.object({ok:z.literal(true),items:z.array(z.unknown())}).passthrough();
const postsRes=z.object({ok:z.literal(true),items:z.array(z.object({state:z.string().optional()}).passthrough())});
const evsRes=z.object({ok:z.literal(true)}).catchall(z.unknown());
const jarsRes=z.object({ok:z.literal(true),items:z.array(z.object({vis:z.string().nullable().optional()}).passthrough())});
const privRes=z.object({ok:z.literal(true),text:z.string().nullable().optional(),media:z.array(z.unknown()).optional(),interests:z.array(z.unknown()).optional()}).passthrough();
type Counts={posts:number,events:number,followers:number,following:number,saved:number,links:number,reqs:number,jars:number,priv:number};

export function MeNewScreen(){
 const {state,acting,setActing,call,peek}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [p,setP]=useShown<Profile|null>('me.p',()=>acting?peek('profile.get',{profileId:acting.id},profileRes)?.profile??null:null);
 const [settings,setSettings]=useShown<MeSettings|null>('me.settings',()=>peek('profile.settings',{},settingsRes)?.settings??null);
 const [error,setError]=useState<unknown>(null);const [tick,setTick]=useState(0);const [switching,setSwitching]=useState(false);
 const [todo,setTodo]=useShown('me.todo',()=>0);
 const [c,setC]=useState<Counts|null>(null);const [edit,setEdit]=useState<BasicKey|null>(null);
 const [verified,setVerified]=useState(false);const premium=usePremiumStatus().status;
 const load=useCallback(()=>{if(!acting)return;setError(null);setTick(n=>n+1);
  Promise.all([call('profile.get',{profileId:acting.id},profileRes),call('profile.settings',{},settingsRes)]).then(([a,b])=>{setP(a.profile);setSettings(b.settings);}).catch(setError);
 },[call,acting]);
 useEffect(()=>{load();},[load]);
 useLive(['profile','media','check','couple'],load);
 const pull=useCallback(()=>{
  call('inbox.counts',{},countsRes,{asAccount:true}).then(r=>setTodo(r.decide)).catch(()=>{});
  call('verification.photoStatus',{},photoRes,{asAccount:true}).then(r=>setVerified(r.state==='approved')).catch(()=>{});
  if(!acting)return;const id=acting.id;const n=<T,>(q:Promise<T>,f:(r:T)=>number)=>q.then(f).catch(()=>0);
  Promise.all([n(call('me.posts',{},postsRes),r=>r.items.filter(x=>x.state==='published').length),
   n(call('event.mine',{},evsRes),r=>new Set(['going','interested','organizing','applications','cancelled'].flatMap(k=>Array.isArray(r[k])?(r[k] as {id:string}[]).map(e=>e.id):[])).size),
   n(call('profile.followers',{profileId:id},list),r=>r.items.length),n(call('profile.followers',{profileId:id,following:true},list),r=>r.items.length),
   n(call('saved.list',{},list),r=>r.items.length),n(call('links.mine',{},linksMineRes),waitingCount),n(call('access.lists',{tab:'incoming'},list),r=>r.items.length),
   n(call('interests.list',{profileId:id},jarsRes),r=>r.items.filter(j=>j.vis!=='granted').length),
   n(call('private.get',{profileId:id},privRes),r=>(r.text?1:0)+(r.media?.length??0)+(r.interests?.length??0))])
   .then(([posts,events,followers,following,saved,links,reqs,jars,priv])=>setC({posts,events,followers,following,saved,links,reqs,jars,priv}));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[call,acting,tick]);
 useEffect(()=>{pull();},[pull]);
 useLive(['counts','decide','notify'],pull);
 if(state.status!=='ready'||!acting)return null;
 const profiles=state.boot.profiles.filter(x=>x.state!=='deleted');
 const couple=profiles.find(x=>x.kind==='couple');const person=profiles.find(x=>x.kind==='person');const cp=acting.kind==='couple';
 const name=p?.name||acting.name||acting.handle||'?';
 const avatarSrc=p?(p.photos[0]?.src?.thumb??p.photos[0]?.src?.card??p.avatar?.src?.thumb):acting.avatar;
 const go=(to:string)=>()=>navigate(to);
 const num=(v:number|undefined)=>v?String(v):undefined;
 const add=t('fe.m2.add');
 // The profile on screen must be the acting one: every row reads and writes as `acting`.
 const ready=!!p&&p.id===acting.id&&!!settings;
 const city=p?.city?(locale==='en'?p.city.en:p.city.ru):null;
 const facts=p?factItems((p.about??{}) as Parameters<typeof factItems>[0],t).map(f=>f.value).join(', '):'';
 const details=p?DETAIL_ROWS.filter(([f])=>!cp||COUPLE_ROWS.includes(f)).filter(([f])=>{const v=p.details[f];return Array.isArray(v)?v.length>0:!!v;}).length:0;
 const privOn=settings?.privateOn!==false&&!!c?.priv;
 return <>
  <Bar title={name} lead={<Av name={name} seed={acting.id} src={avatarSrc}/>}
   mark={cp?undefined:<NameBadges p={{photoVerified:verified,premium:!!premium?.premium}}/>}
   sub={couple?(cp?t('fe.me.weCouple'):t('fe.me.iPersonal')):t('fe.me.personalProfile')}
   {...(couple?{onTitle:()=>setSwitching(true),titleLabel:t('fe.mx.whose')}:{})}>
   <StaffEntry/>
   <BellButton/>
   <IconBtn icon={Eye} label={t('fe.mx.howSeen')} title={t('fe.mx.howSeen')} onClick={go('/n/me/preview')}/>
   <IconBtn icon={Settings} label={t('fe.me.settings')} onClick={go('/n/settings/new')}/>
  </Bar>
  <View refresh={()=>{load();pull();}}>
   {todo>0&&<Card list><Row className="me-todo" icon={Inbox} tone="l" title={t('fe.mx.todo')} badge={todo} onClick={go('/n/inbox')}/></Card>}
   {couple&&person&&<Seg value={cp?'couple':'person'} label={t('fe.mx.whose')}
    options={[{id:'person',label:t('fe.m2.mine.profile')},{id:'couple',label:t('fe.m2.couple.profile')}]}
    onChange={v=>setActing(v==='couple'?couple.id:person.id)}/>}
   {error&&!ready?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!ready?<MeSkel/>
    :<>
     {cp&&<CouplePending base={p} tick={tick} onDecided={()=>{load();pull();}}/>}
     {cp&&<CoupleMembers/>}
     {p.photos.length>0&&<PhotosBlock p={p} settings={settings} onChanged={load}/>}
     <Card list>
      {!p.photos.length&&<Row icon={Camera} title={t('fe.me.photos')} val={add} onClick={go('/n/me/edit?only=media')}/>}
      <Row icon={Type} title={cp?t('fe.nn.nameUs'):t('fe.nn.name')} val={p.chosenName||name} onClick={()=>setEdit('name')}/>
      <Row icon={AtSign} title={cp?t('fe.nn.nickUs'):t('fe.nn.nick')} val={p.handle?'@'+p.handle:add} onClick={()=>setEdit('handle')}/>
      {!cp&&p.age&&<BasicAge p={p} onChanged={load}/>}
      <Row icon={MapPin} title={t('fe.mx.ed.city')} val={city||add} onClick={()=>setEdit('city')}/>
      <Row icon={PenLine} title={t('fe.mx.ed.about')} val={p.bio?p.bio.replace(/[*_~`>#[\]()\n]/g,' ').slice(0,40):add} onClick={()=>setEdit('bio')}/>
      {!cp&&<Row icon={UserRound} title={t('fe.ab.title')} val={facts||add} onClick={go('/n/me/edit?only=about')}/>}
      <Row icon={ClipboardList} title={cp?t('fe.mx.detailsCouple'):t('fe.me.details')} val={details?String(details):add} onClick={go('/n/me/edit?only=details')}/>
      <Row icon={Sparkles} title={cp?t('fe.int.titleCouple'):t('fe.int.title')} val={num(c?.jars)??add} onClick={go('/n/me/interests')}/>
     </Card>
     {!cp&&couple&&<StatusHint p={p} coupleId={couple.id} onDone={load}/>}
     <Card list>
      <Row icon={Lock} title={t('fe.m2.private')} val={c?t(privOn?'fe.m2.on':'fe.m2.off'):undefined} onClick={go('/n/me/new/private')}/>
      <Row icon={KeyRound} title={t(cp?'fe.ac.titleUs':'fe.ac.title')} badge={c?.reqs||undefined} onClick={go('/n/me/access')}/>
     </Card>
     <Card list>
      <Row icon={Images} title={t('fe.mx.gal')} onClick={go('/n/me/new/gallery')}/>
      <Row icon={Link2} title={t(cp?'fe.ln.titleCouple':'fe.ln.title')} badge={c?.links||undefined} onClick={go('/n/me/links')}/>
      <Row icon={Heart} title={couple?t('fe.m2.couple.settings'):t('fe.pair.entry')} onClick={go('/n/me/pair')}/>
     </Card>
    </>}
   <Group title={t('fe.m2.g.mine')}><Card list>
    <Row icon={Newspaper} title={t(cp?'fe.mx.mine.postsUs':'fe.mx.mine.posts')} val={num(c?.posts)} onClick={go('/n/me/posts')}/>
    <Row icon={Calendar} title={t(cp?'fe.mx.mine.eventsUs':'fe.mx.mine.events')} val={num(c?.events)} onClick={go('/n/me/events')}/>
    <Row icon={Globe} title={t('fe.m2.communities')} onClick={go('/n/me/communities')}/>
    <Row icon={Users} title={t('fe.mx.mine.follows')} val={c?`${c.followers} · ${c.following}`:undefined} onClick={go('/n/me/follows?tab=followers')}/>
    <Row icon={Bookmark} title={t('fe.mx.mine.saved')} val={num(c?.saved)} onClick={go('/n/me/saved')}/>
   </Card></Group>
  </View>
  {edit&&p&&<BasicSheet k={edit} p={p} onClose={()=>setEdit(null)} onSaved={()=>{setEdit(null);load();}}/>}
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
