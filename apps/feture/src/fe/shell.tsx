import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import {Outlet,useLocation,useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Globe,Image as FeedIcon,MessageCircle,Plus,User,Users,X,type LucideIcon} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Av,Btn,Empty,Skel} from './ui';
import {FeSessionProvider,useFe,useRealtime} from './session';
import {countsRes} from './inbox';
import {Register} from './register';
import {SignedOut} from './start';
import {ToastProvider} from './toast';
import './v21.css';
import './kit/tokens.css';
import './kit/kit.css';
import './shell.css';

/** V21 shell with the prototype's markup: `.stage > .root > aside.side + main.main(.bar, .view, nav.dock)`.
 * Dock on phones, rail and sidebar on wider screens — all from v21.css. */
export const FE_TABS:{id:string,icon:LucideIcon}[]=[
 {id:'feed',icon:FeedIcon},{id:'people',icon:Users},{id:'communities',icon:Globe},{id:'chats',icon:MessageCircle},{id:'me',icon:User},
];

/** Pictures fade in when loaded instead of popping into an empty box (owner, 27.10.2026). Every <img> under .fe-v21
 * gets `.ld` once loaded or failed; CSS keeps it transparent until then while its box blinks softly. */
function useImageFade(){
 useEffect(()=>{
  const root=document.querySelector('.fe-v21');if(!root)return;
  const mark=(i:HTMLImageElement)=>{if(!i.decoding||i.decoding==='auto')i.decoding='async';if(i.complete)i.classList.add('ld');};
  const done=(e:Event)=>{const i=e.target;if(i instanceof HTMLImageElement)i.classList.add('ld');};
  root.addEventListener('load',done,true);root.addEventListener('error',done,true);
  root.querySelectorAll('img').forEach(mark);
  const mo=new MutationObserver(list=>{for(const m of list){
   if(m.type==='attributes'&&m.target instanceof HTMLImageElement){m.target.classList.remove('ld');mark(m.target);continue;}
   m.addedNodes.forEach(n=>{if(n instanceof HTMLImageElement)mark(n);else if(n instanceof Element)n.querySelectorAll('img').forEach(mark);});}});
  mo.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  return ()=>{mo.disconnect();root.removeEventListener('load',done,true);root.removeEventListener('error',done,true);};
 },[]);
}

export function FeRoot(){
 return <FeSessionProvider><ImageFade/><div className="v21 fe-v21"><FeGate/></div></FeSessionProvider>;
}
function ImageFade(){useImageFade();return null;}

function Center({children}:{children:React.ReactNode}){
 return <div className="stage"><div className="root"><main className="main"><div className="view"><div className="wrap fe-center">{children}</div></div></main></div></div>;
}

/** First frame while the session loads: the real frame (sidebar, header, dock with its icons) with shaped placeholders
 * inside, so nothing jumps when the screen arrives. */
function ShellSkeleton(){
 const {t}=useI18n();const {pathname}=useLocation();
 const current=pathname.split('/')[2]||'feed';const tab=FE_TABS.some(x=>x.id===current)?current:'feed';
 const nested=pathname.split('/').filter(Boolean).length>2;
 return <div className="stage"><div className="root">
  <aside className="side"><div className="brand"><img src={import.meta.env.BASE_URL+'fe-logo.svg'} alt=""/><b>Fet<i>Ure</i></b></div>
   <nav aria-hidden="true">{FE_TABS.map(({id,icon:Icon})=><button key={id} type="button" tabIndex={-1} className={'navb'+(tab===id?' on':'')}><Icon/><span>{t('fe.nav.'+id)}</span></button>)}</nav></aside>
  <main className="main has-dock hasbar">
   <header className="bar">{nested?<i className="sk sk-av"/>:null}<h1 className={nested?'sm':''}>{nested?<i className="sk sk-l" style={{width:120,height:16}}/>:t('fe.nav.'+tab)}</h1></header>
   <div className="view"><div className="wrap"><Skel kind={tab==='feed'?'post':tab==='people'?'tiles':'list'} rows={tab==='people'?2:4}/></div></div>
   <nav className="dock" style={{gridTemplateColumns:`repeat(${FE_TABS.length},1fr)`} as CSSProperties} aria-hidden="true">
    {FE_TABS.map(({id,icon:Icon})=><button key={id} type="button" tabIndex={-1} className={(tab===id?'on':'')+(id==='me'?' me-tab':'')}>{id==='me'?<span className="dock-av"><span className="av"><i className="sk" style={{width:'100%',height:'100%',borderRadius:'50%'}}/></span></span>:<Icon/>}<span>{t('fe.nav.'+id)}</span></button>)}
   </nav>
  </main>
 </div></div>;
}

function FeGate(){
 const {state,reload}=useFe();const {t}=useI18n();
 if(state.status==='loading')return <ShellSkeleton/>;
 // V21 A01 → A02 → A03: a signed-out visitor sees the welcome slides, then sign-up / sign-in by an email code.
 if(state.status==='signedOut')return <SignedOut/>;
 if(state.status==='error')return <Center><Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(state.error,t)}>
  <Btn kind="soft" onClick={reload}>{t('fe.retry')}</Btn></Empty></Center>;
 // V21 A04 → A04X → A05 in the auth frame (header bar, view, bottom-pinned buttons).
 if(!state.boot.account.onboarded)return <Register/>;
 return <FeLayout/>;
}

/** Tab badges as in the prototype's TABDEF: «Люди» — likes to you, «Чаты» — unread chats (a dot for new matches),
 * «Я» — things to decide. One `inbox.counts` call, refreshed by realtime signals and a slow poll. */
function useTabBadges(){
 const {call}=useFe();const [c,setC]=useState<{likes:number,chats:number,newMatches:number,decide:number}|null>(null);
 const pull=useCallback(()=>{call('inbox.counts',{},countsRes,{asAccount:true}).then(setC).catch(()=>{});},[call]);
 useEffect(()=>{pull();const id=setInterval(pull,60000);return ()=>clearInterval(id);},[pull]);
 useRealtime(['notify','decide','chat'],pull);
 return (id:string):number|'dot'|0=>!c?0:id==='people'?c.likes:id==='chats'?(c.chats||(c.newMatches?'dot':0)):id==='me'?c.decide:0;
}

function FeLayout(){
 const {acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const {pathname}=useLocation();
 const name=acting?.name||acting?.handle||'?';
 const current=pathname.split('/')[2]||'feed';
 // V21 keeps the phone dock on every screen (chats, profiles, editors too); only moderation hides it (SC.M01 dock:false).
 const nodock=current==='staff';
 const badge=useTabBadges();
 const em=(n:number|'dot'|0)=>n==='dot'?<em className="dot"/>:n?<em>{n>99?'99+':n}</em>:null;
 const label=(id:string)=>{const n=badge(id);return t('fe.nav.'+id)+(n&&n!=='dot'?', '+n:'');};
 // A second tap on the active tab returns to its root (V21 A4).
 const go=(id:string)=>navigate('/n/'+id);
 // V21 `hascta`: a screen with a pinned action bar (save / publish / continue) lifts it above the phone dock;
 // without the class the dock covers the bar. Screens render the bar themselves, so the frame watches for it.
 // The search screen's `.sbar` sits in the flow, not over the view: no room is kept for a floating `.bar` there.
 const main=useRef<HTMLElement>(null);const [cta,setCta]=useState(false);const [sbar,setSbar]=useState(false);
 useEffect(()=>{const m=main.current;if(!m)return;const sync=()=>{setCta(!!m.querySelector(':scope>.ctabar'));setSbar(!!m.querySelector(':scope>.sbar'));};sync();
  const o=new MutationObserver(sync);o.observe(m,{childList:true});return ()=>o.disconnect();},[]);
 return <div className="stage"><div className="root">
  <aside className="side">
   <div className="brand"><img src={import.meta.env.BASE_URL+'fe-logo.svg'} alt=""/><b>Fet<i>Ure</i></b></div>
   <nav aria-label={t('fe.nav.aria')}>{FE_TABS.map(({id,icon:Icon})=><button key={id} type="button" className={'navb'+(current===id?' on':'')} aria-current={current===id?'page':undefined} onClick={()=>go(id)}><Icon/><span>{t('fe.nav.'+id)}</span>{badge(id)==='dot'?<em style={{minWidth:9,width:9,height:9,padding:0}}/>:badge(id)?<em>{badge(id)}</em>:null}</button>)}</nav>
   <Btn className="create" icon={Plus} onClick={()=>navigate('/n/feed/new')} aria-label={t('fe.create')}><span>{t('fe.create')}</span></Btn>
   <div className="sp"/>
   {acting&&<button type="button" className="mebtn" onClick={()=>navigate('/n/me')}>
    <Av name={name} seed={acting.id} src={acting.avatar}/><span>{name}<small>{acting.kind==='couple'?t('fe.me.coupleProfile'):t('fe.me.personalProfile')}</small></span>
   </button>}
  </aside>
  <main ref={main} className={(nodock?'main':'main has-dock')+(sbar?'':' hasbar')+(cta?' hascta':'')}>
   <ToastProvider nodock={nodock}>
   <Outlet/>
   {!nodock&&<nav className="dock" style={{gridTemplateColumns:`repeat(${FE_TABS.length},1fr)`} as CSSProperties} aria-label={t('fe.nav.aria')}>
    {FE_TABS.map(({id,icon:Icon})=><button key={id} type="button" className={(current===id?'on':'')+(id==='me'?' me-tab':'')} aria-label={label(id)} aria-current={current===id?'page':undefined} onClick={()=>go(id)}>
     {id==='me'&&acting?<span className="dock-av"><Av name={name} seed={acting.id} src={acting.avatar}/></span>:<Icon/>}<span>{t('fe.nav.'+id)}</span>{em(badge(id))}
    </button>)}
   </nav>}
   </ToastProvider>
  </main>
 </div></div>;
}
