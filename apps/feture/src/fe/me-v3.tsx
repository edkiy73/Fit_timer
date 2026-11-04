import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,Bell,Bookmark,Calendar,CircleHelp,Crown,Download,Eye,Globe,Heart,Images,Inbox,Info,KeyRound,Link2,ListChecks,Lock,LogOut,Newspaper,Settings,ShieldCheck,Smartphone,Sparkles,UserCog,UserRound,Users} from 'lucide-react';
import {ActingAv,Actions,Av,Bar,Btn,Card,Group,IconBtn,Row,Seg,Skel,View} from './kit';
import {useFe,useLive,useShown} from './session';
import {BellButton,countsRes} from './inbox';
import {StaffEntry} from './staff';
import {waitingCount} from './links';
import {ActAsSheet,activeCouple} from './couple';
import {NameBadges} from './faces';
import {usePremiumStatus} from './account-extra';
import {onStatusAnswered} from './status-todo';
import {useAccountSettings,useLogout} from './settings';
import {useMe} from './me-new';
import {COUPLE_ROWS,DETAIL_ROWS,MeSkel,PhotosBlock} from './me';
import {filledFacts} from './about-facts';
import {linksMineRes,plural} from './profile-extras';

/** «Я» v3 (owner's account prototype, 05.11.2026), by address only (/n/me/v3) until the owner picks it: one header,
 * then two zones of the acting profile — «Профиль» (what others see) and «Приватность» (who reaches it). The account's
 * own settings are behind the gear in the header (owner: they are not the profile's, so not a tab). Every row opens an
 * existing screen; nothing here owns data of its own. The zone sits in `?tab=`. */
type Tab='profile'|'privacy'|'mine';
const TABS:Tab[]=['profile','privacy','mine'];
const photoRes=z.object({ok:z.literal(true),state:z.enum(['none','pending','approved','rejected'])}).passthrough();
const accessIn=z.object({ok:z.literal(true),items:z.array(z.unknown())});

export function MeV3Screen(){
 const {state,acting,call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [params,setParams]=useSearchParams();const raw=params.get('tab');const tab:Tab=TABS.includes(raw as Tab)?raw as Tab:'profile';
 const {p,settings,load}=useMe();
 const [switching,setSwitching]=useState(false);
 const [todo,setTodo]=useShown('me.todo',()=>0);
 const [verified,setVerified]=useState(false);const premium=usePremiumStatus().status;
 const [waiting,setWaiting]=useState<{links:number,reqs:number}|null>(null);
 const pull=useCallback(()=>{
  call('inbox.counts',{},countsRes,{asAccount:true}).then(r=>setTodo(r.decide)).catch(()=>{});
  call('verification.photoStatus',{},photoRes,{asAccount:true}).then(r=>setVerified(r.state==='approved')).catch(()=>{});
  if(!acting)return;
  Promise.all([call('links.mine',{},linksMineRes).then(waitingCount).catch(()=>0),call('access.lists',{tab:'incoming'},accessIn).then(r=>r.items.length).catch(()=>0)])
   .then(([links,reqs])=>setWaiting({links,reqs}));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[call,acting]);
 useEffect(()=>{pull();},[pull]);
 useEffect(()=>onStatusAnswered(pull),[pull]);
 useLive(['counts','decide','notify'],pull);
 if(state.status!=='ready'||!acting)return null;
 const couple=activeCouple(state.boot.profiles);const cp=acting.kind==='couple';
 const name=p?.name||acting.name||acting.handle||'?';
 const avatarSrc=p?(p.photos[0]?.src?.thumb??p.photos[0]?.src?.card??p.avatar?.src?.thumb):acting.avatar;
 const refresh=()=>{pull();load();};
 return <>
  <Bar title={name} lead={<ActingAv p={{...acting,name,avatar:avatarSrc??null}} size=""/>}
   mark={cp?undefined:<NameBadges p={{photoVerified:verified,premium:!!premium?.premium}}/>}
   sub={couple?(cp?t('fe.me.weCouple'):t('fe.me.iPersonal')):t('fe.me.personalProfile')}
   {...(couple?{onTitle:()=>setSwitching(true),titleLabel:t('fe.mx.whose')}:{})}>
   <StaffEntry/>
   <BellButton/>
   <IconBtn icon={Settings} label={t('fe.me.settings')} onClick={()=>navigate('/n/me/v3/settings')}/>
  </Bar>
  <View refresh={refresh}>
   {todo>0&&<Group><Card list><Row className="me-todo" icon={Inbox} tone="l" title={t('fe.mx.todo')} badge={todo} onClick={()=>navigate('/n/inbox')}/></Card></Group>}
   {/* every block of the screen is a Group, so they all stand 24 apart (the tabs too) */}
   <Group><Seg value={tab} label={t('fe.mx.whose')} onChange={v=>setParams(v==='profile'?{}:{tab:v},{replace:true})}
    options={TABS.map(id=>({id,label:id==='mine'?t(cp?'fe.v3.mineUs':'fe.v3.mine'):t('fe.v3.tab.'+id),...(id==='privacy'&&waiting?.reqs?{n:waiting.reqs}:{})}))}/></Group>
   {tab==='profile'?<ProfileZone p={p} settings={settings} load={load} cp={cp} links={waiting?.links}/>
    :tab==='privacy'?<PrivacyZone discover={settings?.discoverMode} cp={cp} reqs={waiting?.reqs}/>
    :<MineZone cp={cp}/>}
  </View>
  {switching&&<ActAsSheet onClose={()=>setSwitching(false)}/>}
 </>;
}

type MeData=ReturnType<typeof useMe>;

/** What each row of «Профиль» holds, read for its summary line (counts are whole lists, a paged one says «+»). */
const countRes=z.object({ok:z.literal(true),items:z.array(z.unknown())}).passthrough();
const intRes=z.object({ok:z.literal(true),items:z.array(z.object({mark:z.string().nullable().optional()}).passthrough())});
const pagedRes=z.object({ok:z.literal(true),items:z.array(z.unknown()),next:z.string().nullable()}).passthrough();
const privRes=z.object({ok:z.literal(true),text:z.string().nullable().optional(),media:z.array(z.unknown()).optional()}).passthrough();
type Sums={links:{ok:number,wait:number},interests:{level:number,discuss:number,hard:number},albums:number,pics:string,priv:{text:boolean,media:boolean}};
function useSums(profileId:string|undefined){
 const {call}=useFe();
 const [s,setS]=useShown<Sums|null>('v3.sums:'+profileId,()=>null);
 const load=useCallback(()=>{if(!profileId)return;
  Promise.all([call('links.mine',{},linksMineRes),call('interests.list',{profileId},intRes),call('album.list',{profileId},countRes),call('gallery.list',{profileId},pagedRes),call('private.get',{profileId},privRes)])
   .then(([l,i,a,g,pv])=>setS({links:{ok:l.confirmed.length,wait:waitingCount(l)},interests:{level:i.items.filter(x=>!x.mark).length,discuss:i.items.filter(x=>x.mark==='discuss').length,hard:i.items.filter(x=>x.mark==='hard').length},albums:a.items.length,pics:g.items.length+(g.next?'+':''),
    priv:{text:!!pv.text?.trim(),media:!!pv.media?.length}})).catch(()=>{});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[call,profileId]);
 useEffect(()=>{load();},[load]);
 useLive(['profile','media','post','decide'],load);
 return s;
}

/** «Профиль» (owner 05.11.2026): «Как видят», the photos, then one list in the order the public profile shows it —
 * Основное · Ваша пара · Обо мне · Данные · Связи · Интересы · Галерея · Приватная часть, each with a line of what it holds
 * (owner: under the title, so they read in a row); each part edits on its own screen. */
function ProfileZone({p,settings,load,cp,links}:{p:MeData['p'],settings:MeData['settings'],load:()=>void,cp:boolean,links:number|undefined}){
 const {t,locale}=useI18n();const navigate=useNavigate();const go=(to:string)=>()=>navigate(to);const {state}=useFe();
 const sums=useSums(p?.id);
 const pair=state.status==='ready'?state.boot.profiles.find(x=>x.kind==='couple'&&x.state!=='deleted'):undefined;
 const list=(xs:string[])=>xs.length?xs.map((x,i)=>i?x.toLowerCase():x).join(', '):t('fe.v3.s.empty');
 const city=p?.city?(locale==='en'?p.city.en:p.city.ru):null;
 const basics=p?[city,p.age?(p.showAge!==false?String(p.age):t('fe.v3.s.ageHid',{n:p.age})):null,p.bio.trim()?null:t('fe.v3.s.noBio')].filter(Boolean).join(' · '):undefined;
 const about=p?list(filledFacts(p.about).map(k=>t('fe.ab.f.'+k))):undefined;
 const details=p?list(DETAIL_ROWS.filter(([f])=>!cp||COUPLE_ROWS.includes(f)).filter(([f])=>{const v=p.details[f];return Array.isArray(v)?v.length>0:!!v;})
  .map(([,kind])=>t('fe.v3.d.'+kind))):undefined;
 const linksSub=sums?[sums.links.ok?plural(t,locale,'fe.v3.n.link',sums.links.ok):t('fe.v3.s.noLinks'),sums.links.wait?plural(t,locale,'fe.v3.n.wait',sums.links.wait):null].filter(Boolean).join(' · '):undefined;
 const galSub=sums?(sums.albums||sums.pics!=='0'?[sums.albums?plural(t,locale,'fe.v3.n.album',sums.albums):null,sums.pics!=='0'?t('fe.v3.n.pics',{n:sums.pics}):null].filter(Boolean).join(' · '):t('fe.v3.s.empty')):undefined;
 // «Интересно 3 · Обсуждаемо 1 · Табу 1» — the three groups of «Мои интересы», only those that have any
 const intSub=sums?([['level',sums.interests.level],['discuss',sums.interests.discuss],['hard',sums.interests.hard]] as const).filter(([,n])=>n>0)
  .map(([k,n])=>t('fe.int.group.'+k)+' '+n).join(' · ')||t('fe.v3.s.empty'):undefined;
 const privOn=settings?settings.privateOn!==false:undefined;
 const privParts=sums?[sums.priv.text?t('fe.v3.s.pText'):null,sums.priv.media?t('fe.v3.s.pMedia'):null].filter((x):x is string=>!!x):[];
 const privSub=privOn===undefined?undefined:!privOn?t('fe.m2.off'):[t('fe.m2.on'),privParts.length?privParts.join(', '):t('fe.v3.s.emptyLow')].join(' · ');
 const cap=(x:string|undefined)=>x&&x[0]!.toUpperCase()+x.slice(1);
 return <>
  <Group><Actions>
   <Btn kind="soft" icon={Eye} onClick={go('/n/me/preview')}>{t('fe.mx.howSeen')}</Btn>
  </Actions></Group>
  {!p||!settings?<MeSkel/>:<PhotosBlock p={p} settings={settings} onChanged={load}/>}
  <Group title={t('fe.v3.g.profileData')}><Card list className="k-one-line">
   <Row icon={UserRound} title={t('fe.me.basics')} sub={basics} onClick={go('/n/me/edit?only=basics')}/>
   {/* the pair where the public profile shows it, under the name (owner 05.11.2026): «Ваша пара», its name and nick */}
   <Row icon={Heart} tone="v" title={t(pair?'fe.v3.pair':'fe.pair.entry')} sub={pair?[pair.name,pair.handle?'@'+pair.handle:null,pair.state==='paused'?t('fe.v3.pairPaused'):null].filter(Boolean).join(' · '):t('fe.pair.entryOff')} onClick={go('/n/me/pair')}/>
   {!cp&&<Row icon={Info} title={t('fe.ab.title')} sub={about} onClick={go('/n/me/edit?only=about')}/>}
   <Row icon={ListChecks} title={t(cp?'fe.v3.us.details':'fe.me.details')} sub={details} onClick={go('/n/me/edit?only=details')}/>
   <Row icon={Link2} title={t('fe.v3.links')} sub={linksSub} badge={sums?.links.wait||links||undefined} onClick={go('/n/me/links')}/>
   <Row icon={Sparkles} title={t('fe.v3.interests')} sub={intSub} onClick={go('/n/me/interests')}/>
   <Row icon={Images} title={t('fe.mx.gal')} sub={galSub} onClick={go('/n/me/new/gallery')}/>
   <Row icon={Lock} tone="v" title={t('fe.m2.private')} sub={cap(privSub)} onClick={go('/n/me/new/private')}/>
  </Card></Group>
 </>;
}

/** «Приватность»: who reaches this profile and who sees its private part, one list (the part itself is a row of «Профиль»). */
function PrivacyZone({discover,cp,reqs}:{discover:string|undefined,cp:boolean,reqs:number|undefined}){
 const {t}=useI18n();const navigate=useNavigate();const go=(to:string)=>()=>navigate(to);
 const a=useAccountSettings();
 return <Group><Card list>
  <Row icon={KeyRound} title={t(cp?'fe.ac.titleUs':'fe.ac.title')} badge={reqs||undefined} onClick={go('/n/me/access')}/>
  <Row icon={UserCog} title={t('fe.m2.s.who')} onClick={go('/n/settings/new/who')}/>
  <Row icon={Heart} title={t('fe.m2.s.discover')} val={discover?t('fe.mx.v.mode.'+discover+(cp?'Us':'')):undefined} onClick={go('/n/settings/new/discover')}/>
  <Row icon={Ban} title={t('fe.m2.s.lists')} val={a.blocked?String(a.blocked):undefined} onClick={go('/n/settings/new/lists')}/>
 </Card></Group>;
}

/** «Настройки» behind the gear: what holds for the whole account (the person's own, whichever profile acts). */
export function MeV3SettingsScreen(){
 const {t}=useI18n();
 return <>
  <Bar title={t('fe.v3.settings')} back="/n/me/v3"/>
  <View><AccountZone/></View>
 </>;
}

function AccountZone(){
 const {t}=useI18n();const navigate=useNavigate();const go=(to:string)=>()=>navigate(to);
 const a=useAccountSettings();const out=useLogout();
 const prem=a.premium?t(a.premium.premium?'fe.set.premOn':'fe.set.premOff'):undefined;
 const checks=a.age&&a.photo?(a.age==='ok'&&a.photo==='approved'?t('fe.m2.checks.done'):a.age==='pending'||a.photo==='pending'?t('fe.set.ageVal.pending'):t('fe.m2.checks.todo')):undefined;
 return <>
  <Group title={t('fe.v3.g.login')}><Card list>
   <Row icon={KeyRound} title={t('fe.m2.s.security')} onClick={go('/n/settings/security')}/>
   <Row icon={ShieldCheck} title={t('fe.m2.s.checks')} val={checks} onClick={go('/n/settings/new/checks')}/>
  </Card></Group>
  <Group title={t('fe.v3.g.app')}><Card list>
   <Row icon={Bell} title={t('fe.set.notifications')} onClick={go('/n/settings/notifications')}/>
   <Row icon={Smartphone} title={t('fe.m2.s.app')} onClick={go('/n/settings/new/app')}/>
   <Row icon={Crown} title="Premium" val={prem} onClick={go('/n/premium')}/>
  </Card></Group>
  <Group title={t('fe.v3.g.data')}><Card list>
   <Row icon={Download} title={t('fe.set.myData')} onClick={go('/n/settings/data')}/>
   <Row icon={CircleHelp} title={t('fe.m2.s.help')} onClick={go('/n/settings/new/help')}/>
  </Card></Group>
  <Group><Card list><Row icon={LogOut} danger title={t('fe.set.logout')} onClick={out.ask}/></Card></Group>
  {out.node}
 </>;
}

/** «Моё» / «Наше» — the third tab: one list of what this profile has done (no tabs inside, no counters: they counted
 * one page only). */
function MineZone({cp}:{cp:boolean}){
 const {t}=useI18n();const navigate=useNavigate();const go=(to:string)=>()=>navigate(to);
 return <Group><Card list>
  <Row icon={Newspaper} title={t(cp?'fe.v3.us.posts':'fe.mx.mine.posts')} onClick={go('/n/me/posts')}/>
  <Row icon={Calendar} title={t(cp?'fe.v3.us.events':'fe.mx.mine.events')} onClick={go('/n/me/events')}/>
  <Row icon={Globe} title={t(cp?'fe.v3.us.communities':'fe.m2.communities')} onClick={go('/n/me/communities')}/>
  <Row icon={Users} title={t('fe.mx.mine.follows')} onClick={go('/n/me/follows?tab=followers')}/>
  <Row icon={Bookmark} title={t('fe.mx.mine.saved')} onClick={go('/n/me/saved')}/>
 </Card></Group>;
}
