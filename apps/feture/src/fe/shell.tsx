import {Suspense,useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {MaintenanceGate} from './maintenance';
import {PaywallHost} from './premium';
import {Outlet,useLocation,useNavigate} from 'react-router';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Globe,Image as FeedIcon,MessageCircle,Plus,User,Users,X,type LucideIcon} from 'lucide-react';
import {feErrorMessage} from '../feture/fe-api';
import {Av,Btn,Empty,H,Skel} from './kit';
import {FeSessionProvider,useFe,useRealtime} from './session';
import {countsRes} from './inbox';
import {Register} from './register';
import {SignedOut} from './start';
import {ToastProvider,useToast} from './toast';
import {PushOffer} from './push';
import {ActAsSheet} from './couple';
import {CreateSheet} from './create-entry';
import {AppUpdateProvider,UpdateRequired,UpdateSheet,useUpdateRequired} from './app-update';
import {DockHide} from './dock';
import {prefetchScreens} from '../lazy-screens';
import './kit/base.css';
import './kit/tokens.css';
import './kit/kit.css';
import './kit/loading.css';
import './shell.css';

/** V21 shell with the prototype's markup: `.stage > .root > aside.side + main.main(.bar, .view, nav.dock)`.
 * Dock on phones, rail and sidebar on wider screens — all from the kit base.css. */
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
 return <FeSessionProvider><AppUpdateProvider><ImageFade/><div className="v21 fe-v21"><MaintenanceGate><FeGate/></MaintenanceGate></div></AppUpdateProvider></FeSessionProvider>;
}
function ImageFade(){useImageFade();return null;}

/** The greeting after sign-up (A05 «Готово») on the screen it opened — the profile photos or the pair invitation.
 * The feed greets on its own: it also offers «Показать всё» for the topics chosen at step 2. */
function Hello(){
 const location=useLocation();const navigate=useNavigate();const toast=useToast();
 useEffect(()=>{const st=location.state as {hello?:unknown,warn?:unknown}|null;
  if(typeof st?.hello!=='string'||location.pathname==='/n/feed')return;
  toast(st.hello,{type:st.warn?'warn':'ok'});navigate(location.pathname+location.search,{replace:true,state:null});
 },[location,navigate,toast]);
 return null;
}

function Center({children}:{children:React.ReactNode}){
 return <div className="stage"><div className="root"><main className="main"><div className="view"><div className="wrap fe-center">{children}</div></div></main></div></div>;
}

/** The screen part of the first frame: the header with the tab's name (or a placeholder title on a nested screen) and
 * shaped placeholders. Also what a screen whose code is still loading shows (deep link straight into it). */
function ScreenSkeleton(){
 const {t}=useI18n();const {pathname}=useLocation();
 const current=pathname.split('/')[2]||'feed';const tab=FE_TABS.some(x=>x.id===current)?current:'feed';
 const nested=pathname.split('/').filter(Boolean).length>2;
 return <>
  <header className="bar">{nested?<i className="sk sk-av"/>:null}<H level={1} {...(nested?{className:'sm'}:{})}>{nested?<i className="sk sk-l fe-sk-title"/>:t('fe.nav.'+tab)}</H></header>
  <div className="view"><div className="wrap"><Skel kind={tab==='feed'?'post':tab==='people'?'tiles':'list'} rows={tab==='people'?2:4}/></div></div>
 </>;
}

/** First frame while the session loads: the real frame (sidebar, header, dock with its icons) with shaped placeholders
 * inside, so nothing jumps when the screen arrives. */
function ShellSkeleton(){
 const {t}=useI18n();const {pathname}=useLocation();
 const current=pathname.split('/')[2]||'feed';const tab=FE_TABS.some(x=>x.id===current)?current:'feed';
 return <div className="stage"><div className="root">
  <aside className="side"><div className="brand"><img src={import.meta.env.BASE_URL+'fe-logo.svg'} alt=""/><b>Fet<i>Ure</i></b></div>
   <nav aria-hidden="true">{FE_TABS.map(({id,icon:Icon})=><button key={id} type="button" tabIndex={-1} className={'navb'+(tab===id?' on':'')}><Icon/><span>{t('fe.nav.'+id)}</span></button>)}</nav></aside>
  <main className="main has-dock hasbar">
   <ScreenSkeleton/>
   <nav className="dock" aria-hidden="true">
    {FE_TABS.map(({id,icon:Icon})=><button key={id} type="button" tabIndex={-1} className={(tab===id?'on':'')+(id==='me'?' me-tab':'')}>{id==='me'?<span className="dock-av"><span className="av"><i className="sk fe-sk-av"/></span></span>:<Icon/>}<span>{t('fe.nav.'+id)}</span></button>)}
   </nav>
  </main>
 </div></div>;
}

function FeGate(){
 const {state,reload}=useFe();const {t}=useI18n();
 // Android app below the published minimum version: nothing but the update (app-update.tsx).
 if(useUpdateRequired())return <Center><UpdateRequired/></Center>;
 if(state.status==='loading')return <ShellSkeleton/>;
 // V21 A01 → A02 → A03: a signed-out visitor sees the welcome slides, then sign-up / sign-in by an email code.
 if(state.status==='signedOut')return <SignedOut/>;
 if(state.status==='error')return <Center><Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(state.error,t)}>
  <Btn kind="soft" onClick={reload}>{t('fe.retry')}</Btn></Empty></Center>;
 // V21 A04 → A04X → A05 in the auth frame (header bar, view, bottom-pinned buttons).
 // The sign-up has its own toasts (limits, «Заявку отправим…») — no dock there.
 if(!state.boot.account.onboarded)return <ToastProvider nodock><Register/></ToastProvider>;
 return <FeLayout/>;
}

/** Tab badges as in the prototype's TABDEF: «Люди» — likes to you, «Чаты» — unread chats and message requests (a dot for new matches),
 * «Я» — things to decide. One `inbox.counts` call, refreshed by realtime signals and a slow poll. */
function useTabBadges(){
 const {call}=useFe();const [c,setC]=useState<{likes:number,chats:number,newMatches:number,requests:number,decide:number}|null>(null);
 const pull=useCallback(()=>{call('inbox.counts',{},countsRes,{asAccount:true}).then(setC).catch(()=>{});},[call]);
 useEffect(()=>{pull();const id=setInterval(pull,60000);return ()=>clearInterval(id);},[pull]);
 useRealtime(['notify','decide','chat'],pull);
 return (id:string):number|'dot'|0=>!c?0:id==='people'?c.likes:id==='chats'?((c.chats+c.requests)||(c.newMatches?'dot':0)):id==='me'?c.decide:0;
}

/** An app left open across a release keeps running the old build. On screen changes (at most once a minute) it reads
 * the published page; once its script differs, the next screen change reloads into the new build — the person sees
 * the fix without being told to reload. */
let staleBuild=false,lastCheck=0;
function useNewVersion(pathname:string){
 useEffect(()=>{
  if(staleBuild){location.reload();return;}
  if(Date.now()-lastCheck<60000)return;lastCheck=Date.now();
  const mine=document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')?.src.split('/').pop();
  if(!mine)return;
  fetch(location.pathname+'?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(html=>{
   const live=html.match(/assets\/(index-[^"']+\.js)/)?.[1];if(live&&live!==mine)staleBuild=true;}).catch(()=>{});
 },[pathname]);
}

function FeLayout(){
 const {acting,state}=useFe();const {t}=useI18n();const navigate=useNavigate();const {pathname}=useLocation();
 const name=acting?.name||acting?.handle||'?';
 // V21 dockMe: with an active couple «Я» opens «Действовать как» (the person and the couple, what waits on each).
 const pair=state.status==='ready'&&state.boot.profiles.some(p=>p.kind==='couple'&&p.state==='active');const [actAs,setActAs]=useState(false);
 const current=pathname.split('/')[2]||'feed';
 // V21 keeps the phone dock on every screen (chats, profiles, editors too); only moderation hides it (SC.M01 dock:false),
 // and a screen while one of its modes asks for it (useHideDock: the gallery's selection mode).
 const [hiders,setHiders]=useState(0);
 const hideDock=useCallback((on:boolean)=>setHiders(n=>Math.max(0,n+(on?1:-1))),[]);
 const nodock=current==='staff'||hiders>0;
 const badge=useTabBadges();
 useNewVersion(pathname);
 // The other screens' code comes in the background once this one is up (lazy-screens.ts).
 useEffect(()=>{const id=setTimeout(prefetchScreens,1500);return ()=>clearTimeout(id);},[]);
 const em=(n:number|'dot'|0)=>n==='dot'?<em className="dot"/>:n?<em>{n>99?'99+':n}</em>:null;
 const label=(id:string)=>{const n=badge(id);return t('fe.nav.'+id)+(n&&n!=='dot'?', '+n:'');};
 // A second tap on the active tab returns to its root (V21 A4).
 const go=(id:string)=>navigate('/n/'+id);
 // V21 `hascta`: a screen with a pinned action bar (save / publish / continue) lifts it above the phone dock;
 // without the class the dock covers the bar. Screens render the bar themselves, so the frame watches for it.
 // The search screen's `.sbar` sits in the flow, not over the view: no room is kept for a floating `.bar` there.
 const [create,setCreate]=useState(false);
 const main=useRef<HTMLElement>(null);const [cta,setCta]=useState(false);const [sbar,setSbar]=useState(false);
 // Applied before the next paint (flushSync in the observer's microtask): a frame without the class moved the bar
 // up under the reader on every screen with one (owner 28.10.2026: «все прыгает при переходах»).
 useLayoutEffect(()=>{const m=main.current;if(!m)return;const sync=()=>{const c=!!m.querySelector(':scope>.ctabar'),b=!!m.querySelector(':scope>.sbar');flushSync(()=>{setCta(c);setSbar(b);});};
  setCta(!!m.querySelector(':scope>.ctabar'));setSbar(!!m.querySelector(':scope>.sbar'));
  const o=new MutationObserver(sync);o.observe(m,{childList:true});return ()=>o.disconnect();},[]);
 // The floating header's title fades as the screen's view scrolls (--sc 0→1 over the first 48px), so it never sits on
 // top of the posts; a new screen starts at the top again.
 useEffect(()=>{const m=main.current;if(!m)return;
  const set=(top:number)=>{const sc=Math.min(1,Math.max(0,top/48));m.style.setProperty('--sc',sc.toFixed(3));m.classList.toggle('scrolled',top>0);};
  const on=(e:Event)=>{const v=e.target as HTMLElement;if(v?.classList?.contains('view')&&v.parentElement===m)set(v.scrollTop);};
  const reset=()=>{const v=m.querySelector<HTMLElement>(':scope>.view');set(v?v.scrollTop:0);};
  m.addEventListener('scroll',on,{capture:true,passive:true});const o=new MutationObserver(reset);o.observe(m,{childList:true});reset();
  return ()=>{m.removeEventListener('scroll',on,{capture:true});o.disconnect();};},[]);
 return <div className="stage"><div className="root">
  <aside className="side">
   <div className="brand"><img src={import.meta.env.BASE_URL+'fe-logo.svg'} alt=""/><b>Fet<i>Ure</i></b></div>
   <nav aria-label={t('fe.nav.aria')}>{FE_TABS.map(({id,icon:Icon})=><button key={id} type="button" className={'navb'+(current===id?' on':'')} aria-current={current===id?'page':undefined} onClick={()=>go(id)}><Icon/><span>{t('fe.nav.'+id)}</span>{badge(id)==='dot'?<em className="dot"/>:badge(id)?<em>{badge(id)}</em>:null}</button>)}</nav>
   <Btn className="create" icon={Plus} aria-haspopup="dialog" onClick={()=>setCreate(true)} aria-label={t('fe.create')}><span>{t('fe.create')}</span></Btn>
   <div className="sp"/>
   {acting&&<button type="button" className="mebtn" aria-haspopup={pair?'dialog':undefined} onClick={()=>pair?setActAs(true):navigate('/n/me')}>
    <Av name={name} seed={acting.id} src={acting.avatar}/><span>{name}<small>{acting.kind==='couple'?t('fe.me.coupleProfile'):t('fe.me.personalProfile')}</small></span>
   </button>}
  </aside>
  <main ref={main} className={(nodock?'main':'main has-dock')+(sbar?'':' hasbar')+(cta?' hascta':'')}>
   <DockHide.Provider value={hideDock}><ToastProvider nodock={nodock}>
   <Hello/>
   <PushOffer/>
   <UpdateSheet/>
   <PaywallHost/>
   <Suspense fallback={<ScreenSkeleton/>}><Outlet/></Suspense>
   {/* The dock's five columns come from base.css (.dock: repeat(5,1fr)) — FE_TABS has five tabs. */}
   {!nodock&&<nav className="dock" aria-label={t('fe.nav.aria')}>
    {FE_TABS.map(({id,icon:Icon})=><button key={id} type="button" className={(current===id?'on':'')+(id==='me'?' me-tab':'')} aria-label={label(id)} aria-current={current===id?'page':undefined} aria-haspopup={id==='me'&&pair?'dialog':undefined} onClick={()=>id==='me'&&pair?setActAs(true):go(id)}>
     {id==='me'&&acting?<span className="dock-av"><Av name={name} seed={acting.id} src={acting.avatar}/></span>:<Icon/>}<span>{t('fe.nav.'+id)}</span>{em(badge(id))}
    </button>)}
   </nav>}
   {actAs&&<ActAsSheet onClose={()=>setActAs(false)}/>}
   {create&&<CreateSheet onClose={()=>setCreate(false)}/>}
   </ToastProvider></DockHide.Provider>
  </main>
 </div></div>;
}
