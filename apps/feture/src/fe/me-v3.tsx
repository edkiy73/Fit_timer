import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,Bell,Bookmark,Calendar,CircleHelp,Crown,Download,Eye,Globe,Heart,Images,Inbox,KeyRound,Link2,Lock,LogOut,Newspaper,PenLine,Pencil,ShieldCheck,Smartphone,Sparkles,UserCog,Users} from 'lucide-react';
import {Actions,AddCard,Av,Bar,Btn,Card,Group,Note,Row,Seg,Skel,View} from './kit';
import {useFe,useLive,useShown} from './session';
import {BellButton,countsRes} from './inbox';
import {StaffEntry} from './staff';
import {waitingCount} from './links';
import {linksMineRes} from './profile-extras';
import {ActAsSheet} from './couple';
import {PairEntry} from './pair';
import {NameBadges} from './faces';
import {usePremiumStatus} from './account-extra';
import {useStatusTodo} from './status-todo';
import {useAccountSettings,useLogout} from './settings';
import {useMe} from './me-new';
import {MeSkel,PhotosBlock} from './me';

/** «Я» v3 (owner's account prototype, 05.11.2026), by address only (/n/me/v3) until the owner picks it: one header,
 * then three zones — «Профиль» (what others see), «Приватность» (who reaches this profile), «Настройки» (the whole
 * account). Every row opens an existing screen; nothing here owns data of its own. The zone sits in `?tab=`. */
type Tab='profile'|'privacy'|'account';
const TABS:Tab[]=['profile','privacy','account'];
const photoRes=z.object({ok:z.literal(true),state:z.enum(['none','pending','approved','rejected'])}).passthrough();
const accessIn=z.object({ok:z.literal(true),items:z.array(z.unknown())});

export function MeV3Screen(){
 const {state,acting,call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [params,setParams]=useSearchParams();const raw=params.get('tab');const tab:Tab=TABS.includes(raw as Tab)?raw as Tab:'profile';
 const {p,settings,load}=useMe();
 const [switching,setSwitching]=useState(false);
 const [todo,setTodo]=useShown('me.todo',()=>0);const stTodo=useStatusTodo().show?1:0;
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
 useLive(['counts','decide','notify'],pull);
 if(state.status!=='ready'||!acting)return null;
 const couple=state.boot.profiles.find(x=>x.kind==='couple'&&x.state!=='deleted');const cp=acting.kind==='couple';
 const name=p?.name||acting.name||acting.handle||'?';
 const avatarSrc=p?(p.photos[0]?.src?.thumb??p.photos[0]?.src?.card??p.avatar?.src?.thumb):acting.avatar;
 const refresh=()=>{pull();load();};
 return <>
  <Bar title={name} lead={<Av name={name} seed={acting.id} src={avatarSrc}/>}
   mark={cp?undefined:<NameBadges p={{photoVerified:verified,premium:!!premium?.premium}}/>}
   sub={couple?(cp?t('fe.me.weCouple'):t('fe.me.iPersonal')):t('fe.me.personalProfile')}
   {...(couple?{onTitle:()=>setSwitching(true),titleLabel:t('fe.mx.whose')}:{})}>
   <StaffEntry/>
   <BellButton/>
  </Bar>
  <View refresh={refresh}>
   {todo+stTodo>0&&<Group><Card list><Row className="me-todo" icon={Inbox} tone="l" title={t('fe.mx.todo')} badge={todo+stTodo} onClick={()=>navigate('/n/inbox')}/></Card></Group>}
   {/* every block of the screen is a Group, so they all stand 24 apart (the tabs too) */}
   <Group><Seg value={tab} label={t('fe.mx.whose')} onChange={v=>setParams(v==='profile'?{}:{tab:v},{replace:true})}
    options={TABS.map(id=>({id,label:t('fe.v3.tab.'+id),...(id==='privacy'&&waiting?.reqs?{n:waiting.reqs}:{})}))}/></Group>
   {tab==='profile'?<ProfileZone p={p} settings={settings} load={load} cp={cp} links={waiting?.links}/>
    :tab==='privacy'?<PrivacyZone privOn={settings?settings.privateOn!==false:undefined} discover={settings?.discoverMode} cp={cp} reqs={waiting?.reqs}/>
    :<AccountZone couple={!!couple}/>}
  </View>
  {switching&&<ActAsSheet onClose={()=>setSwitching(false)}/>}
 </>;
}

type MeData=ReturnType<typeof useMe>;

/** «Профиль»: the two main actions, the photos, one next step, what the profile holds, the pair and «Моё». */
function ProfileZone({p,settings,load,cp,links}:{p:MeData['p'],settings:MeData['settings'],load:()=>void,cp:boolean,links:number|undefined}){
 const {t}=useI18n();const navigate=useNavigate();const go=(to:string)=>()=>navigate(to);
 return <>
  <Group><Actions>
   <Btn icon={Pencil} onClick={go('/n/me/new/profile')}>{t('fe.v3.edit')}</Btn>
   <Btn kind="soft" icon={Eye} onClick={go('/n/me/preview')}>{t('fe.mx.howSeen')}</Btn>
  </Actions></Group>
  {!p||!settings?<MeSkel/>:<>
   <PhotosBlock p={p} settings={settings} onChanged={load}/>
   {p.photos.length>0&&!p.bio&&<Group><AddCard icon={PenLine} title={t(cp?'fe.mp.bioAddUs':'fe.mp.bioAdd')} sub={t(cp?'fe.mp.bioAddSubUs':'fe.mp.bioAddSub')} onClick={go('/n/me/new/profile')}/></Group>}
  </>}
  <Group title={t('fe.v3.g.content')}><Card list>
   <Row icon={Images} title={t('fe.mx.gal')} onClick={go('/n/me/new/gallery')}/>
   <Row icon={Sparkles} title={t('fe.v3.interests')} onClick={go('/n/me/interests')}/>
   <Row icon={Link2} title={t('fe.v3.links')} badge={links||undefined} onClick={go('/n/me/links')}/>
   <Row icon={Bookmark} title={t('fe.v3.mine')} onClick={go('/n/me/v3/mine')}/>
  </Card></Group>
  <PairEntry plain/>
 </>;
}

/** «Приватность»: the private part and its accesses, then who can reach this profile. */
function PrivacyZone({privOn,discover,cp,reqs}:{privOn:boolean|undefined,discover:string|undefined,cp:boolean,reqs:number|undefined}){
 const {t}=useI18n();const navigate=useNavigate();const go=(to:string)=>()=>navigate(to);
 const a=useAccountSettings();
 return <>
  <Group title={t('fe.v3.g.private')}><Card list>
   <Row icon={Lock} tone="v" title={t('fe.m2.private')} val={privOn===undefined?undefined:t(privOn?'fe.m2.on':'fe.m2.off')} onClick={go('/n/me/new/private')}/>
   <Row icon={KeyRound} title={t('fe.ac.title')} badge={reqs||undefined} onClick={go('/n/me/access')}/>
  </Card></Group>
  <Group title={t('fe.v3.g.reach')}><Card list>
   <Row icon={UserCog} title={t('fe.v3.who')} onClick={go('/n/settings/new/who')}/>
   <Row icon={Heart} title={t('fe.m2.s.discover')} val={discover?t('fe.mx.v.mode.'+discover+(cp?'Us':'')):undefined} onClick={go('/n/settings/new/discover')}/>
   <Row icon={Ban} title={t('fe.m2.s.lists')} val={a.blocked?String(a.blocked):undefined} onClick={go('/n/settings/new/lists')}/>
  </Card></Group>
 </>;
}

/** «Настройки»: what holds for the whole account, in three groups. */
function AccountZone({couple}:{couple:boolean}){
 const {t}=useI18n();const navigate=useNavigate();const go=(to:string)=>()=>navigate(to);
 const a=useAccountSettings();const out=useLogout();
 const prem=a.premium?t(a.premium.premium?'fe.set.premOn':'fe.set.premOff'):undefined;
 const checks=a.age&&a.photo?(a.age==='ok'&&a.photo==='approved'?t('fe.m2.checks.done'):a.age==='pending'||a.photo==='pending'?t('fe.set.ageVal.pending'):t('fe.m2.checks.todo')):undefined;
 return <>
  {couple&&<Group><Note>{t('fe.v3.accountNote')}</Note></Group>}
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

/** «Моё»: one list of what this profile has done — no tabs inside tabs, no counters (they counted one page only). */
export function MeV3MineScreen(){
 const {acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const go=(to:string)=>()=>navigate(to);
 if(!acting)return <Skel kind="card" rows={3}/>;
 const cp=acting.kind==='couple';
 return <>
  <Bar title={t('fe.v3.mine')} back="/n/me/v3"/>
  <View>
   <Card list>
    <Row icon={Newspaper} title={t(cp?'fe.mx.mine.postsUs':'fe.mx.mine.posts')} onClick={go('/n/me/posts')}/>
    <Row icon={Calendar} title={t(cp?'fe.mx.mine.eventsUs':'fe.mx.mine.events')} onClick={go('/n/me/events')}/>
    <Row icon={Globe} title={t('fe.m2.communities')} onClick={go('/n/me/communities')}/>
    <Row icon={Users} title={t('fe.mx.mine.follows')} onClick={go('/n/me/follows?tab=followers')}/>
    <Row icon={Bookmark} title={t('fe.mx.mine.saved')} onClick={go('/n/me/saved')}/>
   </Card>
  </View>
 </>;
}
