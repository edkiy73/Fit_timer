import {useState,type CSSProperties} from 'react';
import {Outlet,useLocation,useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Globe,Image as FeedIcon,Lock,MessageCircle,Plus,User,Users,X,type LucideIcon} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Av,Btn,Empty,Skel} from './ui';
import {FeSessionProvider,useFe} from './session';
import {Register} from './register';
import {Welcome,welcomeSeen} from './welcome';
import {ToastProvider} from './toast';
import './v21.css';
import './shell.css';

/** V21 shell with the prototype's markup: `.stage > .root > aside.side + main.main(.bar, .view, nav.dock)`.
 * Dock on phones, rail and sidebar on wider screens — all from v21.css. */
export const FE_TABS:{id:string,icon:LucideIcon}[]=[
 {id:'feed',icon:FeedIcon},{id:'people',icon:Users},{id:'communities',icon:Globe},{id:'chats',icon:MessageCircle},{id:'me',icon:User},
];

export function FeRoot(){
 return <FeSessionProvider><div className="v21 fe-v21"><FeGate/></div></FeSessionProvider>;
}

function Center({children}:{children:React.ReactNode}){
 return <div className="stage"><div className="root"><main className="main"><div className="view"><div className="wrap fe-center">{children}</div></div></main></div></div>;
}

function FeGate(){
 const {state,reload}=useFe();const {t}=useI18n();const navigate=useNavigate();const {pathname}=useLocation();const [welcomed,setWelcomed]=useState(welcomeSeen);
 if(state.status==='loading')return <Center><Skel kind="list"/></Center>;
 // V21 A01: a signed-out visitor sees the welcome slides once, then the existing sign-in.
 if(state.status==='signedOut'&&!welcomed)return <Welcome onStart={()=>{setWelcomed(true);navigate('/account?returnTo='+encodeURIComponent(pathname));}}/>;
 if(state.status==='signedOut')return <Center><Empty icon={Lock} title={t('fe.signIn.title')} text={t('fe.signIn.text')}>
  <Btn onClick={()=>navigate('/account?returnTo='+encodeURIComponent(pathname))}>{t('fe.signIn.action')}</Btn></Empty></Center>;
 if(state.status==='error')return <Center><Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(state.error,t)}>
  <Btn kind="soft" onClick={reload}>{t('fe.retry')}</Btn></Empty></Center>;
 if(!state.boot.account.onboarded)return <Center><Register/></Center>;
 return <FeLayout/>;
}

function FeLayout(){
 const {acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const {pathname}=useLocation();
 const name=acting?.name||acting?.handle||'?';
 const current=pathname.split('/')[2]||'feed';
 // Nested screens (a chat, a post, an editor) have no dock in V21; tab roots do.
 // Premium and Help are standalone screens too (prototype B01/S01 `.view.nodock`).
 const nested=pathname.split('/').filter(Boolean).length>2||current==='premium'||current==='help';
 // A second tap on the active tab returns to its root (V21 A4).
 const go=(id:string)=>navigate('/n/'+id);
 return <div className="stage"><div className="root">
  <aside className="side">
   <div className="brand"><b>Fet<i>Ure</i></b></div>
   <nav aria-label={t('fe.nav.aria')}>{FE_TABS.map(({id,icon:Icon})=><button key={id} type="button" className={'navb'+(current===id?' on':'')} aria-current={current===id?'page':undefined} onClick={()=>go(id)}><Icon/><span>{t('fe.nav.'+id)}</span></button>)}</nav>
   <Btn className="create" icon={Plus} onClick={()=>navigate('/n/feed/new')} aria-label={t('fe.create')}><span>{t('fe.create')}</span></Btn>
   <div className="sp"/>
   {acting&&<button type="button" className="mebtn" onClick={()=>navigate('/n/me')}>
    <Av name={name} seed={acting.id} src={acting.avatar}/><span>{name}<small>{acting.kind==='couple'?t('fe.me.coupleProfile'):t('fe.me.personalProfile')}</small></span>
   </button>}
  </aside>
  <main className={nested?'main hasbar':'main has-dock hasbar'}>
   <ToastProvider nodock={nested}>
   <Outlet/>
   {!nested&&<nav className="dock" style={{gridTemplateColumns:`repeat(${FE_TABS.length},1fr)`} as CSSProperties} aria-label={t('fe.nav.aria')}>
    {FE_TABS.map(({id,icon:Icon})=><button key={id} type="button" className={(current===id?'on':'')+(id==='me'?' me-tab':'')} aria-label={t('fe.nav.'+id)} aria-current={current===id?'page':undefined} onClick={()=>go(id)}>
     {id==='me'&&acting?<span className="dock-av"><Av name={name} seed={acting.id} src={acting.avatar}/></span>:<Icon/>}<span>{t('fe.nav.'+id)}</span>
    </button>)}
   </nav>}
   </ToastProvider>
  </main>
 </div></div>;
}
