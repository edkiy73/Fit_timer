import type {CSSProperties} from 'react';
import {NavLink,Outlet,useLocation,useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Icon,type IconName} from '../feture/components/Icon';
import {feErrorMessage} from '../feture/fe-api';
import {ActionButton,Avatar,StateCard} from './components';
import {FeSessionProvider,useFe} from './session';
import './tokens.css';
import './shell.css';

/** V21 shell: five tabs — dock on phones, rail at 768–1099, sidebar from 1100 (V21-INTEGRATION-GUIDE §4 A3). */
export const FE_TABS:{id:string,icon:IconName}[]=[
 {id:'feed',icon:'feed'},{id:'people',icon:'users'},{id:'communities',icon:'world'},{id:'chats',icon:'message'},{id:'me',icon:'user'},
];

export function FeRoot(){
 return <FeSessionProvider><FeGate/></FeSessionProvider>;
}

function FeGate(){
 const {state,reload}=useFe();const {t}=useI18n();const navigate=useNavigate();const {pathname}=useLocation();
 if(state.status==='loading')return <main className="fe-app fe-center" role="status"><span className="fe-spinner" aria-hidden="true"/>{t('fe.loading')}</main>;
 if(state.status==='signedOut')return <main className="fe-app fe-center">
  <StateCard icon="lock" title={t('fe.signIn.title')} text={t('fe.signIn.text')}
   action={<ActionButton onClick={()=>navigate('/account?returnTo='+encodeURIComponent(pathname))}>{t('fe.signIn.action')}</ActionButton>}/>
 </main>;
 if(state.status==='error')return <main className="fe-app fe-center">
  <StateCard icon="close" role="alert" title={t('fe.error.title')} text={feErrorMessage(state.error,t)} action={<ActionButton variant="soft" onClick={reload}>{t('fe.retry')}</ActionButton>}/>
 </main>;
 return <FeLayout/>;
}

function FeLayout(){
 const {state,acting}=useFe();const {t}=useI18n();
 if(state.status!=='ready')return null;
 const onboarded=state.boot.account.onboarded;
 return <div className="fe-app fe-layout">
  <aside className="fe-side" aria-label={t('fe.nav.aria')}>
   <div className="fe-wordmark">Fet<span>Ure</span></div>
   <nav>{FE_TABS.map(tab=><NavLink key={tab.id} to={'/n/'+tab.id} className="fe-side-link"><Icon name={tab.icon} size={22}/><span>{t('fe.nav.'+tab.id)}</span></NavLink>)}</nav>
   {acting&&<NavLink to="/n/me" className="fe-side-me"><Avatar name={acting.name||acting.handle||'?'} size="s" couple={acting.kind==='couple'}/><span>{acting.name||'@'+acting.handle}</span></NavLink>}
  </aside>
  <main className="fe-main">{onboarded?<Outlet/>:<FeOnboardingNeeded/>}</main>
  <nav className="fe-dock" aria-label={t('fe.nav.aria')} style={{'--fe-tabs':FE_TABS.length} as CSSProperties}>
   {FE_TABS.map(tab=><NavLink key={tab.id} to={'/n/'+tab.id} className="fe-dock-link"><Icon name={tab.icon} size={23}/><span>{t('fe.nav.'+tab.id)}</span></NavLink>)}
  </nav>
 </div>;
}

/** Registration lives in slice C; until then the shell says honestly what is missing. */
function FeOnboardingNeeded(){
 const {t}=useI18n();
 return <div className="fe-center"><StateCard icon="user" title={t('fe.onboarding.title')} text={t('fe.onboarding.text')}/></div>;
}
