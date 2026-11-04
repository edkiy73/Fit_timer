import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bookmark,Calendar,Eye,Globe,Inbox,Newspaper,Settings,UserRound,Users,X} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Av,Bar,Btn,Card,Empty,Group,IconBtn,Row,Skel,View} from './kit';
import {useFe,useLive,useShown} from './session';
import {BellButton,countsRes} from './inbox';
import {StaffEntry} from './staff';
import {LinksBlock,waitingCount} from './links';
import {linksMineRes} from './profile-extras';
import {ActAsSheet,activeCouple} from './couple';
import {PairEntry} from './pair';
import {MeJars} from './interests';
import {MeGallery} from './gallery';
import {MeAboutBlock} from './about-facts';
import {PrivateLayer} from './private';
import {NameBadges} from './faces';
import {usePremiumStatus} from './account-extra';
import {BasicsForm} from './me-basics-form';
import {onStatusAnswered} from './status-todo';
import type {Place} from './kit/Place';
import {DetailsBlock,MeSkel,PhotosBlock,catalogRes,profileRes,settingsRes,type Profile,type Settings as MeSettings,type option} from './me';

/** The new «Я» (owner's layout, 04.11.2026), shown next to the current one at /n/me/new until the owner picks it:
 * the same header with the name badges, «Нужно решить», then one short list of sections. Every row opens an existing
 * screen or a section screen (/n/me/new/:section) built from the current blocks — nothing new, only placed anew. */
const photoRes=z.object({ok:z.literal(true),state:z.enum(['none','pending','approved','rejected'])}).passthrough();
const accessIn=z.object({ok:z.literal(true),items:z.array(z.unknown())});
const list=z.object({ok:z.literal(true),items:z.array(z.unknown())}).passthrough();
const postsRes=z.object({ok:z.literal(true),items:z.array(z.object({state:z.string().optional()}).passthrough())});
const evsRes=z.object({ok:z.literal(true)}).catchall(z.unknown());
type Counts={posts:number,events:number,followers:number,following:number,saved:number,links:number,reqs:number};

/** The own profile and its settings (the same reads and first-frame memory as «Я»). */
export function useMe(){
 const {acting,call,peek}=useFe();
 const [p,setP]=useShown<Profile|null>('me.p',()=>acting?peek('profile.get',{profileId:acting.id},profileRes)?.profile??null:null);
 const [settings,setSettings]=useShown<MeSettings|null>('me.settings',()=>peek('profile.settings',{},settingsRes)?.settings??null);
 const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{if(!acting)return;setError(null);
  Promise.all([call('profile.get',{profileId:acting.id},profileRes),call('profile.settings',{},settingsRes)]).then(([a,b])=>{setP(a.profile);setSettings(b.settings);}).catch(setError);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[call,acting]);
 useEffect(()=>{load();},[load]);
 useLive(['profile','media','check','couple'],load);
 return {p,settings,error,load};
}

export function MeNewScreen(){
 const {state,acting,call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const {p,settings}=useMe();
 const [switching,setSwitching]=useState(false);
 const [todo,setTodo]=useShown('me.todo',()=>0);
 const [c,setC]=useState<Counts|null>(null);
 const [verified,setVerified]=useState(false);const premium=usePremiumStatus().status;
 const pull=useCallback(()=>{
  call('inbox.counts',{},countsRes,{asAccount:true}).then(r=>setTodo(r.decide)).catch(()=>{});
  call('verification.photoStatus',{},photoRes,{asAccount:true}).then(r=>setVerified(r.state==='approved')).catch(()=>{});
  if(!acting)return;const n=<T,>(q:Promise<T>,f:(r:T)=>number)=>q.then(f).catch(()=>0);
  Promise.all([n(call('me.posts',{},postsRes),r=>r.items.filter(x=>x.state==='published').length),
   n(call('event.mine',{},evsRes),r=>new Set(['going','interested','organizing','applications','cancelled'].flatMap(k=>Array.isArray(r[k])?(r[k] as {id:string}[]).map(e=>e.id):[])).size),
   n(call('profile.followers',{profileId:acting.id},list),r=>r.items.length),n(call('profile.followers',{profileId:acting.id,following:true},list),r=>r.items.length),
   n(call('saved.list',{},list),r=>r.items.length),n(call('links.mine',{},linksMineRes),waitingCount),n(call('access.lists',{tab:'incoming'},accessIn),r=>r.items.length)])
   .then(([posts,events,followers,following,saved,links,reqs])=>setC({posts,events,followers,following,saved,links,reqs}));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[call,acting]);
 useEffect(()=>{pull();},[pull]);
 useEffect(()=>onStatusAnswered(pull),[pull]);
 useLive(['counts','decide','notify'],pull);
 if(state.status!=='ready'||!acting)return null;
 const couple=activeCouple(state.boot.profiles);const cp=acting.kind==='couple';
 const name=p?.name||acting.name||acting.handle||'?';
 const avatarSrc=p?(p.photos[0]?.src?.thumb??p.photos[0]?.src?.card??p.avatar?.src?.thumb):acting.avatar;
 const go=(to:string)=>()=>navigate(to);
 const num=(v:number|undefined)=>v===undefined?undefined:String(v);
 const privOn=settings?settings.privateOn!==false:undefined;
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
  <View refresh={pull}>
   {todo>0&&<Card list><Row className="me-todo" icon={Inbox} tone="l" title={t('fe.mx.todo')} badge={todo} onClick={go('/n/inbox')}/></Card>}
   <Group title={t('fe.m2.g.profile')}><Card list>
    <Row icon={UserRound} title={t('fe.m2.profile')} val={p?.photos.length?t('fe.m2.photosN',{n:String(p.photos.length)}):undefined} onClick={go('/n/me/new/profile')}/>
   </Card></Group>
   <Group title={t('fe.m2.g.mine')}><Card list>
    <Row icon={Newspaper} title={t(cp?'fe.mx.mine.postsUs':'fe.mx.mine.posts')} val={num(c?.posts)} onClick={go('/n/me/posts')}/>
    <Row icon={Calendar} title={t(cp?'fe.mx.mine.eventsUs':'fe.mx.mine.events')} val={num(c?.events)} onClick={go('/n/me/events')}/>
    <Row icon={Globe} title={t('fe.m2.communities')} onClick={go('/n/me/communities')}/>
    <Row icon={Users} title={t('fe.mx.mine.follows')} val={c?`${c.followers} · ${c.following}`:undefined} onClick={go('/n/me/follows?tab=followers')}/>
    <Row icon={Bookmark} title={t('fe.mx.mine.saved')} val={num(c?.saved)} onClick={go('/n/me/saved')}/>
   </Card></Group>
   <PairEntry/>
  </View>
  {switching&&<ActAsSheet onClose={()=>setSwitching(false)}/>}
 </>;
}

/** One section of the new «Я»: «Мой профиль», «Галерея», «Приватная часть» — the current blocks, one level down. */
export function MeNewSection(){
 const {section}=useParams();const {state,acting,call}=useFe();const {t,locale}=useI18n();
 const {p,settings,error,load}=useMe();
 const [options,setOptions]=useState<z.infer<typeof option>[]>([]);const [places,setPlaces]=useState<Place[]>([]);
 useEffect(()=>{if(section==='profile')call('catalog.get',{},catalogRes,{asAccount:true}).then(r=>{setOptions(r.options);setPlaces(r.places??[]);}).catch(()=>{});},[call,section]);
 if(state.status!=='ready'||!acting)return null;
 const cp=acting.kind==='couple';
 const couple=state.boot.profiles.find(x=>x.kind==='couple'&&x.state!=='deleted');
 const title=section==='gallery'?t('fe.mx.gal'):section==='private'?t('fe.m2.private'):t('fe.m2.profile');
 const label=(kind:string,code:string)=>{const o=options.find(x=>x.kind===kind&&x.code===code);return o?(locale==='en'?o.en:o.ru):code;};
 return <>
  <Bar title={title} back="/n/me/new"/>
  <View refresh={load}>
   {error&&!p?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!p||!settings?(section==='profile'?<MeSkel/>:<Skel kind="card" rows={2}/>)
    :section==='gallery'?<MeGallery profileId={p.id} couple={cp} title={t('fe.mx.gal')}/>
    :section==='private'?<PrivateLayer profileId={p.id} on={settings.privateOn!==false} requestsFrom={settings.requestsFrom??'all'} onChanged={load} askHere={false}/>
    :<>
     <PhotosBlock p={p} settings={settings} onChanged={load}/>
     <BasicsForm p={p} places={places} onSaved={load}/>
     <DetailsBlock p={p} label={label}/>
     <LinksBlock key={'links'+p.id}/>
     <MeAboutBlock p={p}/>
     <MeJars key={p.id}/>
     <MeGallery profileId={p.id} couple={cp} title={t('fe.mx.gal')}/>
     <PrivateLayer profileId={p.id} on={settings.privateOn!==false} requestsFrom={settings.requestsFrom??'all'} onChanged={load} askHere={false}/>
    </>}
  </View>
 </>;
}
