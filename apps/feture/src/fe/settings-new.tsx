import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,Bell,CircleHelp,Crown,Download,FileText,Heart,KeyRound,LogOut,ShieldCheck,Smartphone,UserCog,X} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Bar,Btn,Card,Empty,Group,Row,Skel,View} from './kit';
import {useFe,useLive,useShown} from './session';
import {AppRows,BlurRow,CheckRows,ListRows,useAccountSettings,useLogout} from './settings';
import {HiddenFeedSheet} from './settings-lists';
import {TermsSheet} from './terms-sheet';
import {Visibility,profileRes,settingsRes,type Profile,type Settings} from './me';

/** The new «Настройки» (owner's layout, 04.11.2026), next to the current one at /n/settings/new: one list of sections,
 * each opening a section screen (/n/settings/new/:section) or the existing screen of that section. */
type Section='who'|'discover'|'checks'|'app'|'lists'|'help';
const SECTIONS:Section[]=['who','discover','checks','app','lists','help'];

/** The acting profile and its «кто может» settings (the same reads and memory as «Я»). */
function useProfileSettings(){
 const {acting,call,peek}=useFe();
 const [p,setP]=useShown<Profile|null>('me.p',()=>acting?peek('profile.get',{profileId:acting.id},profileRes)?.profile??null:null);
 const [settings,setSettings]=useShown<Settings|null>('me.settings',()=>peek('profile.settings',{},settingsRes)?.settings??null);
 const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{if(!acting)return;setError(null);
  Promise.all([call('profile.get',{profileId:acting.id},profileRes),call('profile.settings',{},settingsRes)]).then(([a,b])=>{setP(a.profile);setSettings(b.settings);}).catch(setError);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[call,acting]);
 useEffect(()=>{load();},[load]);
 useLive(['profile','couple'],load);
 return {p,settings,error,load};
}

export function SettingsNewScreen(){
 const {acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const a=useAccountSettings();const {settings}=useProfileSettings();const out=useLogout();
 const cp=acting?.kind==='couple';const go=(to:string)=>()=>navigate(to);
 const prem=a.premium?t(a.premium.premium?'fe.set.premOn':'fe.set.premOff'):undefined;
 const checks=a.age&&a.photo?(a.age==='ok'&&a.photo==='approved'?t('fe.m2.checks.done'):a.age==='pending'||a.photo==='pending'?t('fe.set.ageVal.pending'):t('fe.m2.checks.todo')):undefined;
 return <>
  <Bar title={t('fe.set.title')} back="/n/me/new"/>
  <View className="nodock compact">
   <Card list>
    <Row icon={UserCog} title={t('fe.m2.s.who')} onClick={go('/n/settings/new/who')}/>
    <Row icon={Heart} title={t('fe.m2.s.discover')} val={settings?t('fe.mx.v.mode.'+settings.discoverMode+(cp?'Us':'')):undefined} onClick={go('/n/settings/new/discover')}/>
    <Row icon={Bell} title={t('fe.set.notifications')} onClick={go('/n/settings/notifications')}/>
    <Row icon={KeyRound} title={t('fe.m2.s.security')} onClick={go('/n/settings/security')}/>
    <Row icon={ShieldCheck} title={t('fe.m2.s.checks')} val={checks} onClick={go('/n/settings/new/checks')}/>
    <Row icon={Crown} title="Premium" val={prem} onClick={go('/n/premium')}/>
    <Row icon={Smartphone} title={t('fe.m2.s.app')} onClick={go('/n/settings/new/app')}/>
    <Row icon={Ban} title={t('fe.m2.s.lists')} val={a.blocked?String(a.blocked):undefined} onClick={go('/n/settings/new/lists')}/>
    <Row icon={Download} title={t('fe.set.myData')} onClick={go('/n/settings/data')}/>
    <Row icon={CircleHelp} title={t('fe.m2.s.help')} onClick={go('/n/settings/new/help')}/>
   </Card>
   <Card list><Row icon={LogOut} danger title={t('fe.set.logout')} onClick={out.ask}/></Card>
  </View>
  {out.node}
 </>;
}

/** One section of the new settings: the current rows and controls, one level down. */
export function SettingsNewSection(){
 const raw=useParams().section;const section=(SECTIONS.includes(raw as Section)?raw:'who') as Section;
 const {t}=useI18n();const navigate=useNavigate();
 const a=useAccountSettings();const ps=useProfileSettings();
 const [layer,setLayer]=useState<'hidden'|'terms'|null>(null);const close=useCallback(()=>setLayer(null),[]);
 const needsProfile=section==='who'||section==='discover';
 const fail=needsProfile?ps.error&&!ps.p:a.error&&!a.s;
 const ready=needsProfile?!!ps.p&&!!ps.settings:true;
 return <>
  <Bar title={t('fe.m2.s.'+section)} back="/n/settings/new"/>
  <View className="nodock compact">
   {fail?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(needsProfile?ps.error:a.error,t)}><Btn kind="soft" onClick={needsProfile?ps.load:a.load}>{t('fe.retry')}</Btn></Empty>
    :!ready?<Skel kind="list" rows={5}/>
    :section==='who'?<>
     <Visibility p={ps.p!} settings={ps.settings!} onChanged={ps.load} part="who"/>
     <Group title={t('fe.nav.chats')}><Card list><BlurRow a={a}/></Card></Group>
    </>
    :section==='discover'?<Visibility p={ps.p!} settings={ps.settings!} onChanged={ps.load} part="discover"/>
    :section==='checks'?<Card list><CheckRows a={a}/></Card>
    :section==='app'?<Card list><AppRows a={a}/></Card>
    :section==='lists'?<Card list><ListRows a={a} onHidden={()=>setLayer('hidden')}/></Card>
    :<Card list>
     <Row icon={CircleHelp} title={t('fe.ax.help.entry')} onClick={()=>navigate('/n/help')}/>
     <Row icon={FileText} title={t('fe.onb.terms.title')} onClick={()=>setLayer('terms')}/>
    </Card>}
  </View>
  {layer==='hidden'&&<HiddenFeedSheet onClose={close}/>}
  {layer==='terms'&&<TermsSheet onClose={close}/>}
 </>;
}
