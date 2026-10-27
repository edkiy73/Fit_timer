import {useI18n} from '@appbase/ui-react/i18n.js';
import {Avatar,ScreenHeader,StateCard} from './components';
import {useFe} from './session';
import type {IconName} from '../feture/components/Icon';

/** Tab roots. Each slice (B…H) replaces its «скоро» card with the real screen. */
function Soon({tab,icon}:{tab:string,icon:IconName}){
 const {t}=useI18n();
 return <>
  <ScreenHeader title={t('fe.nav.'+tab)}/>
  <div className="fe-body"><StateCard icon={icon} title={t('fe.soon.'+tab+'.title')} text={t('fe.soon.'+tab+'.text')}/></div>
 </>;
}
export const PeopleTab=()=> <Soon tab="people" icon="users"/>;
export const CommunitiesTab=()=> <Soon tab="communities" icon="world"/>;
export const ChatsTab=()=> <Soon tab="chats" icon="message"/>;

export function MeTab(){
 const {state,acting,setActing}=useFe();const {t}=useI18n();
 if(state.status!=='ready'||!acting)return null;
 const profiles=state.boot.profiles.filter(p=>p.state!=='deleted');
 return <>
  <ScreenHeader title={t('fe.nav.me')}/>
  <div className="fe-body">
   <section className="fe-me-card">
    <Avatar name={acting.name||acting.handle||'?'} size="xl" couple={acting.kind==='couple'}/>
    <div><h2>{acting.name||'@'+acting.handle}</h2>{acting.handle&&<p className="fe-mute">@{acting.handle}</p>}</div>
   </section>
   {profiles.length>1&&<section className="fe-section">
    <h3>{t('fe.me.actAs')}</h3>
    <div className="fe-seg" role="radiogroup" aria-label={t('fe.me.actAs')}>
     {profiles.map(p=><button key={p.id} type="button" role="radio" aria-checked={p.id===acting.id} className={p.id===acting.id?'on':''} onClick={()=>setActing(p.id)}>
      {p.kind==='couple'?t('fe.me.we'):t('fe.me.i')}
     </button>)}
    </div>
   </section>}
   <StateCard icon="settings" title={t('fe.soon.me.title')} text={t('fe.soon.me.text')}/>
  </div>
 </>;
}
