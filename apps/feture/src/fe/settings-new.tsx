import {useCallback,useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {CircleHelp,FileText,X} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Bar,Btn,Card,Empty,Row,Skel,View} from './kit';
import {useFe,useLive,useShown} from './session';
import {AppRows,BlurRow,CheckRows,ListRows,useAccountSettings} from './settings';
import {HiddenFeedSheet} from './settings-lists';
import {TermsSheet} from './terms-sheet';
import {Visibility,profileRes,settingsRes,type Profile,type Settings} from './me';

/** Sections of the settings one level down (/n/settings/new/:section): the current rows and controls. Privacy ones
 * (who, discover, lists) belong to the «Приватность» tab of «Я», the rest to the account settings behind the gear. */
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
  <Bar title={t('fe.m2.s.'+section)} back={section==='who'||section==='discover'||section==='lists'?'/n/me':'/n/me/v3/settings'}/>
  <View className="nodock compact">
   {fail?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(needsProfile?ps.error:a.error,t)}><Btn kind="soft" onClick={needsProfile?ps.load:a.load}>{t('fe.retry')}</Btn></Empty>
    :!ready?<Skel kind="list" rows={5}/>
    :section==='who'?<>
     <Visibility p={ps.p!} settings={ps.settings!} onChanged={ps.load} part="who"/>
    </>
    :section==='discover'?<Visibility p={ps.p!} settings={ps.settings!} onChanged={ps.load} part="discover"/>
    :section==='checks'?<Card list><CheckRows a={a}/></Card>
    :section==='app'?<Card list><AppRows a={a}/><BlurRow a={a}/></Card>
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
