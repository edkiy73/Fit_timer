import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Archive,ArchiveRestore,Ban,Camera,Check,ChevronDown,ChevronLeft,ChevronRight,CircleAlert,Clock,Copy,Ellipsis,Eye,EyeOff,Flag,Image as ImageIcon,Info,Lock,LockOpen,MessageCircle,Plus,Search,SendHorizontal,Sparkles,Undo2,User,Users,X,type LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,Layer,Skel} from './ui';
import {AgeCheckLink} from './age-check';
import {useFe,useRealtime} from './session';
import {useToast} from './toast';
import {BellButton,SegN} from './inbox';
import './css/chats.css';

/** Slice G (V21 H01, H02, H05) with the prototype's markup. A conversation exists only after a mutual like (server).
 * New messages and receipts arrive on a realtime «chat» signal (S2 §8); a slow poll stays as the fallback. */
const media=z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough();
const chat=z.object({id:z.uuid(),state:z.string(),side:z.object({id:z.uuid(),kind:z.enum(['person','couple'])}),newMatch:z.boolean(),
 other:z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),avatar:media.nullable()}),
 unread:z.number(),muted:z.boolean(),archived:z.boolean().optional(),last:z.object({body:z.string(),media:z.boolean(),mode:z.string(),mine:z.boolean()}).nullable(),at:z.string()});
type Chat=z.infer<typeof chat>;
const list=z.object({ok:z.literal(true),items:z.array(chat)});
const msg=z.object({id:z.uuid(),seq:z.number(),mine:z.boolean(),body:z.string(),at:z.string(),replyTo:z.uuid().nullable().optional(),
 media:z.object({ephemeral:z.boolean().optional(),mode:z.string().optional(),state:z.string().optional(),blurred:z.boolean().optional(),pending:z.boolean().optional(),gone:z.boolean().optional(),w:z.number().nullable().optional(),h:z.number().nullable().optional(),src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional()});
type Msg=z.infer<typeof msg>;
const msgs=z.object({ok:z.literal(true),state:z.string(),items:z.array(msg),otherRead:z.number(),lastSeq:z.number()});
const ok=z.object({ok:z.literal(true)}).passthrough();
const opened=z.object({ok:z.literal(true),media:z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough().nullable(),until:z.string().nullable().optional(),gone:z.boolean().optional()}).passthrough();
const grantList=z.object({ok:z.literal(true),items:z.array(z.object({profile:z.object({id:z.uuid()}).passthrough()}).passthrough())});
const uploadIntent=z.object({ok:z.literal(true),assetId:z.uuid(),upload:z.object({url:z.string(),method:z.string(),headers:z.record(z.string(),z.string())})});

const nameOf=(o:{name?:string|null,handle?:string|null})=>o.name||(o.handle?'@'+o.handle:'?');
function ago(iso:string,locale:string){const s=(Date.now()-Date.parse(iso))/1000;const ru=locale!=='en';
 if(s<3600)return Math.max(1,Math.floor(s/60))+(ru?' мин':' min');if(s<86400)return Math.floor(s/3600)+(ru?' ч':' h');
 return new Date(iso).toLocaleDateString(ru?'ru':'en',{day:'numeric',month:'short'});}

/** The prototype styles a screen by `main[data-screen]` (H02's glass name pill, the «down» button above the input). */
function useScreenTag(id:string){
 useLayoutEffect(()=>{const m=document.querySelector<HTMLElement>('.fe-v21 main.main');if(!m)return;const was=m.dataset.screen;m.dataset.screen=id;
  return ()=>{if(m.dataset.screen===id){if(was)m.dataset.screen=was;else delete m.dataset.screen;}};},[id]);
}
/** The active couple of this account, if any (the «Личные / Чаты пары» split exists only then). */
function useCouple(){
 const {state}=useFe();
 return state.status==='ready'?state.boot.profiles.find(p=>p.kind==='couple'&&p.state==='active')??null:null;
}

/* ================= H01 chats / H05 archive ================= */
const RELOAD='fe:chats-reload';
export function ChatsTab(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const couple=useCouple();
 const [params]=useSearchParams();const archived=params.get('archived')==='1';
 useScreenTag(archived?'H05':'H01');
 const [kind,setKind]=useState<'all'|'me'|'couple'>('all');const [items,setItems]=useState<Chat[]|null>(null);const [error,setError]=useState<unknown>(null);
 const [searching,setSearching]=useState(false);const [q,setQ]=useState('');const qRef=useRef<HTMLInputElement>(null);
 // One list for every split: the counters on «Личные» / «Чаты пары» come from the same rows.
 const load=useCallback(()=>{setError(null);call('chats.list',{filter:'all',archived},list,{asAccount:true}).then(r=>setItems(r.items)).catch(setError);},[call,archived]);
 useEffect(()=>{setItems(null);},[archived]);
 useEffect(()=>{load();const id=setInterval(load,30000);return ()=>clearInterval(id);},[load]);
 useRealtime('chat',load);
 // «Отменить» on the archive toast runs after the chat closed: the list asks again.
 useEffect(()=>{addEventListener(RELOAD,load);return ()=>removeEventListener(RELOAD,load);},[load]);
 useEffect(()=>{if(searching)qRef.current?.focus();},[searching]);
 const f=couple&&!archived?kind:'all';
 const side=(c:Chat)=>c.side.kind==='couple'?'couple':'me';
 const needle=q.trim().toLowerCase();
 const hit=(c:Chat)=>!needle||nameOf(c.other).toLowerCase().includes(needle)||(c.other.handle??'').toLowerCase().includes(needle);
 const mine=(items??[]).filter(c=>(f==='all'||side(c)===f)&&hit(c));
 // A contact without messages lives only in «Новые совпадения»; an ended chat without messages leaves the list (server).
 const fresh=archived?[]:mine.filter(c=>c.newMatch&&c.state==='active');const rows=mine.filter(c=>!fresh.includes(c));
 const unreadFor=(s:'me'|'couple')=>(items??[]).filter(c=>side(c)===s&&c.unread>0).length;
 const preview=(c:Chat)=>c.state==='ended'?t('fe.chx.endedRow'):!c.last?t('fe.chx.sayFirst'):c.last.media&&!c.last.body?(c.last.mode!=='normal'?t('fe.chats.ephemeral'):t('fe.chats.photo')):c.last.body;
 const row=(c:Chat)=><button key={c.id} type="button" className={'chat-row'+(c.unread?' unread':'')+(c.state==='ended'?' ended':'')} onClick={()=>navigate('/n/chats/'+c.id)}>
  <Av name={nameOf(c.other)} seed={c.other.id} size="lg" src={c.other.avatar?.src?.thumb}/>
  <span className="tx"><b>{nameOf(c.other)}</b><small>{c.side.kind==='couple'&&<span className="ct-us"><Users/>{t('fe.chx.coupleChat')}</span>}{preview(c)}</small></span>
  <span className="side2">{c.unread>0&&<span className="unr">{c.unread>99?'99+':c.unread}</span>}<time>{ago(c.at,locale)}</time></span>
 </button>;
 const toggleSearch=()=>{setSearching(s=>!s);setQ('');};

 if(archived)return <>
  <Bar title={t('fe.chx.archiveTitle')} back="/n/chats" small/>
  <div className="view nodock"><div className="wrap">
   {error&&!items?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<Skel kind="list"/>
    :rows.length?rows.map(row):<Empty icon={Archive} title={t('fe.chx.archiveEmpty')}/>}
  </div></div>
 </>;
 return <>
  <Bar title={t('fe.nav.chats')}>
   <button type="button" className="ibtn" aria-label={t('fe.chx.search')} aria-pressed={searching} onClick={toggleSearch}><Search/></button>
   <button type="button" className="ibtn" aria-label={t('fe.chx.archiveTitle')} onClick={()=>navigate('/n/chats?archived=1')}><Archive/></button>
   <BellButton/>
  </Bar>
  <View>
   {couple&&<SegN value={kind} onChange={setKind} options={[{id:'all',label:t('fe.chats.all')},{id:'me',label:t('fe.chats.personal'),n:unreadFor('me')},{id:'couple',label:t('fe.chats.couple'),n:unreadFor('couple')}]}/>}
   {couple&&kind==='couple'&&<p className="note mt8">{t('fe.chx.coupleNote',{name:couple.name})}</p>}
   {searching&&<div className="inwrap mt12 chat-q"><Search/>
    <input ref={qRef} className="inp" type="search" placeholder={t('fe.chx.searchPh')} aria-label={t('fe.chx.search')} value={q} onChange={e=>setQ(e.target.value)}/>
    <button type="button" className="ibtn ghost sm" aria-label={t('fe.chx.searchClose')} onClick={toggleSearch}><X/></button></div>}
   {error&&!items?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<Skel kind="list" rows={4}/>
    :<>
     {fresh.length>0&&<><div className="sec">{t('fe.chats.newMatches')}</div>
      <div className="matches">{fresh.map(c=><button key={c.id} type="button" onClick={()=>navigate('/n/chats/'+c.id)}>
       <span className="ring2"><Av name={nameOf(c.other)} seed={c.other.id} src={c.other.avatar?.src?.thumb}/>{c.side.kind==='couple'&&<i className="m-us" aria-hidden="true"><Users/></i>}</span>
       <span className="mn">{nameOf(c.other)}</span>{c.side.kind==='couple'&&<span className="sr-only">{t('fe.chx.coupleChatSr')}</span>}
      </button>)}</div></>}
     {rows.map(row)}
     {!rows.length&&!fresh.length&&(needle?<Empty icon={Search} title={t('fe.chx.notFound',{q:q.trim()})}><Btn kind="text" auto onClick={()=>setQ('')}>{t('fe.chx.clear')}</Btn></Empty>
      :<Empty icon={MessageCircle} title={t('fe.chx.noChats')} text={t('fe.chx.noChatsText')}/>)}
    </>}
  </View>
 </>;
}
function View({children}:{children:ReactNode}){return <div className="view"><div className="wrap">{children}</div></div>;}

/* ================= shared sheet bits ================= */
/** The prototype's sheet (`#scrim` + `#sheet`) in the app layer: Esc and the scrim close it. */
function Sheet({title,lead,onClose,foot,children}:{title:string,lead?:ReactNode,onClose:()=>void,foot?:ReactNode,children:ReactNode}){
 const {t}=useI18n();const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const opener=document.activeElement as HTMLElement|null;ref.current?.focus({preventScroll:true});return ()=>{opener?.focus?.({preventScroll:true});};},[]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose]);
 return <Layer>
  <div className="scrim on" onClick={onClose}/>
  <div ref={ref} className="sheet on" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
   <div className="grab"/>
   <div className="sh-h">{lead}<div className="sh-ht"><h2>{title}</h2></div><button type="button" className="ibtn ghost sm" aria-label={t('fe.chx.close')} onClick={onClose}><X/></button></div>
   <div className="sh-b">{children}</div>
   {foot&&<div className="sh-f">{foot}</div>}
  </div>
 </Layer>;
}
/** `linkRow()` — with a chevron unless `noChev`. */
function Li({icon:Icon,tone,danger,title,sub,onClick,chev}:{icon:LucideIcon,tone?:string,danger?:boolean,title:string,sub?:string,onClick:()=>void,chev?:boolean}){
 return <button type="button" className={'li'+(danger?' danger':'')} onClick={onClick}><span className={'ico'+(tone?' '+tone:'')}><Icon/></span><span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span>{chev&&<ChevronRight/>}</button>;
}
/** `toggleRow()` */
function Toggle({title,sub,on,onClick}:{title:string,sub?:string,on:boolean,onClick:()=>void}){
 return <button type="button" className="li" role="switch" aria-checked={on} onClick={onClick}><span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span><span className={'sw'+(on?' on':'')} aria-hidden="true"/></button>;
}
/** `openViewer()` for one chat photo: optional label («Один просмотр…») and the viewer's handle as a watermark. */
function Viewer({src,label,wm,onClose}:{src:string,label?:string|undefined,wm?:string|undefined,onClose:()=>void}){
 const {t}=useI18n();const [on,setOn]=useState(false);const close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const r=requestAnimationFrame(()=>{setOn(true);close.current?.focus({preventScroll:true});});return ()=>cancelAnimationFrame(r);},[]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose]);
 return <Layer><div className={'viewer'+(on?' on':'')} role="dialog" aria-modal="true" aria-label={t('fe.chx.viewer')}>
  <div className="vw-track"><figure><img src={src} alt="" draggable={false}/>{wm&&<div className="vw-wm" aria-hidden="true">{Array.from({length:18},(_,i)=><span key={i}>{wm}</span>)}</div>}</figure></div>
  <div className="vw-top"><span className="vw-n"/>{label&&<span className="vw-label">{label}</span>}<button ref={close} type="button" className="ibtn glass" aria-label={t('fe.chx.close')} onClick={onClose}><X/></button></div>
 </div></Layer>;
}
/** `matchSVG()` — the ring burns down with the time left. */
function MatchRing({frac,lit}:{frac:number,lit:boolean}){
 const c=2*Math.PI*21,off=(c*(1-Math.max(0,Math.min(1,frac)))).toFixed(1);
 return <span className={'mmatch '+(lit?'lit':'out')} aria-hidden="true"><svg viewBox="0 0 56 56"><circle className="rg-t" cx="28" cy="28" r="21"/><circle className="rg-p" cx="28" cy="28" r="21" strokeDasharray={c.toFixed(1)} strokeDashoffset={off} transform="rotate(-90 28 28)"/></svg><span className="rg-i">{lit?<Eye/>:<EyeOff/>}</span></span>;
}

type Mode='normal'|'once'|'t15'|'t120'|'t1440';
const MODES:Mode[]=['normal','once','t15','t120','t1440'];
const TTL:Record<string,number>={t15:15*60e3,t120:2*3600e3,t1440:24*3600e3};
const REASONS=['threat','private','minor','spam','other'] as const;
type Reason=typeof REASONS[number];
/** A photo on its way: the asset is kept between attempts, so a retry after review only sends the message. */
type Outgoing={file:File,preview:string,mode:Mode,assetId?:string,assetMode?:Mode,opId:string,pending?:boolean};
/** A text on its way (the prototype's optimistic bubble with «Отправляется» / «Не отправлено · Повторить»). */
type Pend={key:string,body:string,replyTo?:string,opId:string,at:string,status:'sending'|'failed'};
type SheetKind='attach'|'send'|'menu'|'end'|'report'|'block'|'msg'|'readers'|'copy';
const PHOTO_TYPES=['image/jpeg','image/png','image/webp'];

/* ================= H02 conversation ================= */
export function ChatScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 useScreenTag('H02');
 const [meta,setMeta]=useState<Chat|null>(null);const [items,setItems]=useState<Msg[]|null>(null);const [state,setState]=useState('active');const [otherRead,setOtherRead]=useState(0);
 const [error,setError]=useState<unknown>(null);const [text,setText]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const [pend,setPend]=useState<Pend[]>([]);const [tries,setTries]=useState(0);const [replyTo,setReplyTo]=useState<string|null>(null);
 const [open,setOpen]=useState<Record<string,string>>({});
 const [eph,setEph]=useState<Record<string,{state:'open'|'done',until?:number}>>({});
 const [viewer,setViewer]=useState<{src:string,label?:string|undefined,wm?:string|undefined}|null>(null);
 const [sheet,setSheet]=useState<SheetKind|null>(null);const [sheetErr,setSheetErr]=useState('');const [sheetBusy,setSheetBusy]=useState(false);
 const [msgFor,setMsgFor]=useState<Msg|null>(null);
 const [out,setOut]=useState<Outgoing|null>(null);const outRef=useRef<Outgoing|null>(null);outRef.current=out;
 const [rp,setRp]=useState<{why:Reason|null,details:string,block:boolean,sel:string[]}>({why:null,details:'',block:true,sel:[]});
 const [grants,setGrants]=useState<{byMe:boolean,withMe:boolean}>({byMe:false,withMe:false});const [ecRevoke,setEcRevoke]=useState(true);
 const [near,setNear]=useState(true);const [fresh,setFresh]=useState(0);const [,tick]=useState(0);
 const viewRef=useRef<HTMLDivElement>(null);const last=useRef(0);const input=useRef<HTMLTextAreaElement>(null);
 const gallery=useRef<HTMLInputElement>(null);const camera=useRef<HTMLInputElement>(null);
 const stick=useRef(true);const nearRef=useRef(true);const seen=useRef(0);
 const profileId=meta?.side.id;
 useEffect(()=>{
  // An archived conversation is opened from «Архив» too, so both lists are asked.
  Promise.all([call('chats.list',{filter:'all'},list,{asAccount:true}),call('chats.list',{filter:'all',archived:true},list,{asAccount:true})])
   .then(([a,b])=>{const c=[...a.items,...b.items].find(x=>x.id===id);if(c){setMeta(c);setState(c.state);}else setError(new FeError('not_found',404));}).catch(setError);
 },[call,id,tries]);
 const pull=useCallback(async(initial:boolean)=>{
  if(!meta)return;
  const r=await call('chat.messages',initial?{conversationId:id}:{conversationId:id,afterSeq:last.current},msgs,{profileId:meta.side.id});
  setState(r.state);setOtherRead(r.otherRead);
  // A refresh after an ephemeral view also needs the states of older messages: the initial pull replaces the list.
  if(initial)setItems(r.items);
  else if(r.items.length)setItems(prev=>{const p=prev??[];const seenIds=new Set(p.map(m=>m.id));return [...p,...r.items.filter(m=>!seenIds.has(m.id))].sort((a,b)=>a.seq-b.seq);});
  else setItems(prev=>prev??[]);
  if(r.items.length){
   last.current=Math.max(last.current,...r.items.map(m=>m.seq));
   call('chat.read',{conversationId:id,upToSeq:last.current},ok,{profileId:meta.side.id}).catch(()=>{});
  }
 },[call,id,meta]);
 useEffect(()=>{if(!meta)return;pull(true).catch(setError);const iv=setInterval(()=>{pull(false).catch(()=>{});},30000);return ()=>clearInterval(iv);},[meta,pull]);
 // The signal names no conversation (S2 §8): any «chat» signal asks this one for what is new after the last seq.
 useRealtime('chat',()=>{pull(false).catch(()=>{});});
 // Private access between the two sides: the pills above the chat and «Отозвать мой доступ» in the menu (V11 UX-16).
 const loadGrants=useCallback(()=>{
  if(!meta)return;const other=meta.other.id;const opts={profileId:meta.side.id};
  Promise.all([call('access.lists',{tab:'byme'},grantList,opts),call('access.lists',{tab:'withme'},grantList,opts)])
   .then(([a,b])=>setGrants({byMe:a.items.some(x=>x.profile.id===other),withMe:b.items.some(x=>x.profile.id===other)})).catch(()=>{});
 },[call,meta]);
 useEffect(()=>{loadGrants();},[loadGrants]);
 // Timers on opened media: redraw now and then so «осталось …» stays true.
 useEffect(()=>{if(!Object.values(eph).some(v=>v.until))return;const iv=setInterval(()=>tick(n=>n+1),20000);return ()=>clearInterval(iv);},[eph]);

 /* ---- scrolling (owner 15.10): to the bottom on open and after own sends; a new message while reading older ones keeps
    the place and counts on the round «down» button ---- */
 const count=(items?.length??0)+pend.length;
 useLayoutEffect(()=>{
  const v=viewRef.current;if(!v||items===null)return;
  if(stick.current){v.scrollTop=v.scrollHeight;stick.current=false;setFresh(0);}
  else if(count>seen.current){if(nearRef.current)v.scrollTop=v.scrollHeight;else setFresh(n=>n+(count-seen.current));}
  seen.current=count;
 },[count,items]);
 const onScroll=()=>{const v=viewRef.current;if(!v)return;const n=v.scrollHeight-v.scrollTop-v.clientHeight<90;nearRef.current=n;setNear(n);if(n)setFresh(0);};
 const toBottom=()=>{const v=viewRef.current;if(!v)return;setFresh(0);v.scrollTo({top:v.scrollHeight,behavior:'smooth'});};
 useEffect(()=>()=>{if(outRef.current)URL.revokeObjectURL(outRef.current.preview);},[]);

 /* ---- text messages: optimistic bubble, retry on failure ---- */
 const deliverText=async(p:Pend)=>{
  if(!meta)return;
  setPend(list=>list.map(x=>x.key===p.key?{...x,status:'sending'}:x));
  try{
   await call('chat.send',{opId:p.opId,conversationId:id,body:p.body,...(p.replyTo?{replyTo:p.replyTo}:{})},ok,{profileId:meta.side.id});
   await pull(false).catch(()=>{});
   setPend(list=>list.filter(x=>x.key!==p.key));
  }catch(e){setPend(list=>list.map(x=>x.key===p.key?{...x,status:'failed'}:x));toast(e instanceof FeError&&e.code!=='network'?feErrorMessage(e,t):t('fe.chx.msgFailed'),{type:'err'});}
 };
 const send=()=>{
  const body=text.trim();if(!body||!meta)return;
  if(body.length>2000){toast(t('fe.chx.tooLong'),{type:'err'});return;}
  const p:Pend={key:newOpId(),body,opId:newOpId(),at:new Date().toISOString(),status:'sending',...(replyTo?{replyTo}:{})};
  setPend(list=>[...list,p]);setText('');setReplyTo(null);stick.current=true;
  if(input.current)input.current.style.height='';
  void deliverText(p);
 };
 const grow=(el:HTMLTextAreaElement)=>{el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px';};
 const coarse=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches;

 /* ---- media ---- */
 const openMedia=async(m:Msg)=>{
  if(!meta)return;
  const md=m.media;if(!md)return;
  try{
   const r=await call('chat.openMedia',{opId:newOpId(),messageId:m.id},opened,{profileId:meta.side.id});
   const src=r.media?.src?.full??r.media?.src?.card;
   if(!md.ephemeral){if(src)setOpen(o=>({...o,[m.id]:src}));if(src&&!md.blurred)setViewer({src});return;}
   if(r.gone||!src){setEph(e=>({...e,[m.id]:{state:'done'}}));return;}
   if(m.mine){setViewer({src});return;}
   const once=md.mode==='once';const until=r.until?Date.parse(r.until):undefined;
   setEph(e=>({...e,[m.id]:once?{state:'done'}:{state:'open',...(until?{until}:{})}}));
   setViewer({src,label:once?t('fe.chx.viewerOnce'):until?t('fe.chx.viewerLeft',{left:left(until)}):undefined,wm:acting?.handle?'@'+acting.handle:undefined});
  }catch(e){toast(feErrorMessage(e,t),{type:'err'});}
 };
 const left=(until:number)=>{const min=Math.max(1,Math.ceil((until-Date.now())/60e3));const h=Math.floor(min/60),r=min%60;
  return min>=60?(r?t('fe.chx.hm',{h:String(h),m:String(r)}):t('fe.chx.hours',{h:String(h)})):t('fe.chx.min',{n:String(min)});};
 const modeLabel=(mode:string)=>t('fe.chx.eph.'+(['once','t15','t120','t1440'].includes(mode)?mode:'once'));
 /** A photo with nothing to show: still being checked (the recipient waits for the moderator) or removed. */
 const photoNote=(m:Msg,why:'review'|'gone')=><div className="eph-gone" role="note"><span className="eg-ic">{why==='gone'?<EyeOff/>:<Clock/>}</span>
  <span className="eg-tx"><b>{why==='gone'?t('fe.chx.photoGone'):t('fe.chx.photoReview')}</b><small>{why==='gone'?t('fe.chx.photoGoneSub'):m.mine?t('fe.chx.photoReviewMine'):t('fe.chx.photoReviewSub')}</small></span></div>;
 const mediaTile=(m:Msg):ReactNode=>{
  const md=m.media!;const kind=t('fe.chats.photo');
  if(!md.ephemeral){
   const revealed=open[m.id];const hidden=!!md.blurred&&!revealed;
   const src=revealed??(hidden?md.src?.blur:md.src?.card??md.src?.full);
   if(!src)return photoNote(m,md.gone?'gone':'review');
   return <><button type="button" className={'mtile'+(hidden?' blur':'')} aria-label={hidden?t('fe.chx.hiddenAria'):t('fe.chx.openAria')}
    onClick={()=>{if(hidden)void openMedia(m);else setViewer({src:revealed??md.src?.full??src});}}>
    <img src={src} alt="" draggable={false} style={md.w&&md.h?{aspectRatio:`${md.w}/${md.h}`}:undefined}/>{hidden&&<span className="mcover"><EyeOff/><b>{t('fe.chx.tapView')}</b></span>}
   </button>{m.mine&&md.pending&&<small className="mpend"><Clock/>{t('fe.chx.photoReviewMine')}</small>}</>;
  }
  const mode=md.mode??'once';const once=mode==='once';const local=eph[m.id];
  const st=local?.state==='done'||md.state==='done'?'expired':local?.state==='open'||md.state==='open'?'counting':'unopened';
  if(st==='expired')return <div className="eph-gone" role="note"><span className="eg-ic"><EyeOff/></span><span className="eg-tx"><b>{kind} · {once?t('fe.chx.ephGoneOnce'):t('fe.chx.ephGoneTimer')}</b><small>{once?t('fe.chx.ephViewed'):t('fe.chx.ephTimeUp')}</small></span></div>;
  const line=`${kind} · ${modeLabel(mode)}`;
  const until=local?.until;
  const sub=m.mine?`${t('fe.chx.ephSent')} · ${t('fe.chx.ephCheck')}`
   :st==='unopened'?(once?t('fe.chx.ephOpenOnce'):t('fe.chx.ephOpenTimer'))
   :until?t('fe.chx.ephAgainLeft',{left:left(until)}):t('fe.chx.ephAgain');
  const frac=st==='counting'&&until&&TTL[mode]?Math.max(.08,(until-Date.now())/TTL[mode]!):1;
  return <button type="button" className={'mtile eph2 '+st} aria-label={`${line}. ${sub}`} onClick={()=>void openMedia(m)}>
   <span className="eph-ash"/><span className="eph-veil"/><span className="eph-c"><MatchRing frac={frac} lit/><b>{line}</b><small>{sub}</small></span>
  </button>;
 };
 const closeSheet=useCallback(()=>{setSheet(null);setSheetErr('');},[]);

 /* ---- photos: uploadIntent → PUT → commit → chat.sendMedia ---- */
 const pick=(f:File|undefined)=>{
  if(gallery.current)gallery.current.value='';if(camera.current)camera.current.value='';
  if(!f)return;setSheetErr('');
  if(!PHOTO_TYPES.includes(f.type)){toast(t('fe.chx.photoType'),{type:'err'});setSheet(null);return;}
  if(f.size>20*1024*1024){toast(t('fe.chx.photoSize'),{type:'err'});setSheet(null);return;}
  if(outRef.current)URL.revokeObjectURL(outRef.current.preview);
  setFailure('');setOut({file:f,preview:URL.createObjectURL(f),mode:'normal',opId:newOpId()});setSheet('send');
 };
 const dropOut=(o:Outgoing|null)=>{
  if(!o)return;URL.revokeObjectURL(o.preview);setOut(null);
  // The uploaded file is not needed any more; best effort.
  if(o.assetId&&profileId)call('media.remove',{opId:newOpId(),assetId:o.assetId},ok,{profileId}).catch(()=>{});
 };
 /** One attempt; resolves to 'sent' or 'pending', throws other errors. */
 const deliver=useCallback(async(o:Outgoing):Promise<'sent'|'pending'>=>{
  if(!profileId)throw new FeError('unavailable');
  // «Не отправлять» may be tapped while an attempt is on its way: its answer must not bring the photo back.
  const live=()=>outRef.current?.preview===o.preview;
  let cur=o;
  if(!cur.assetId||cur.assetMode!==cur.mode){
   // The view rule is fixed at upload: a new mode means a new upload.
   if(cur.assetId)call('media.remove',{opId:newOpId(),assetId:cur.assetId},ok,{profileId}).catch(()=>{});
   const rule=cur.mode==='normal'?{}:cur.mode==='once'?{viewRule:'once'}:{viewRule:'timer',viewSeconds:60};
   const i=await call('media.uploadIntent',{opId:newOpId(),purpose:'chat',kind:'image',mime:cur.file.type,bytes:cur.file.size,...rule},uploadIntent,{profileId});
   const put=await fetch(i.upload.url,{method:i.upload.method,headers:i.upload.headers,body:cur.file}).catch(()=>null);
   if(!put?.ok)throw new Error('upload');
   await call('media.commit',{assetId:i.assetId},ok,{profileId});
   if(!live()){call('media.remove',{opId:newOpId(),assetId:i.assetId},ok,{profileId}).catch(()=>{});return 'pending';}
   cur={...cur,assetId:i.assetId,assetMode:cur.mode,opId:newOpId()};setOut(cur);
  }
  try{await call('chat.sendMedia',{opId:cur.opId,conversationId:id,assetId:cur.assetId,mode:cur.mode},ok,{profileId});}
  catch(e){if(e instanceof FeError&&e.code==='conflict'&&e.rule==='pending'){if(live())setOut({...cur,pending:true});return 'pending';}throw e;}
  if(live()){URL.revokeObjectURL(cur.preview);setOut(null);}
  return 'sent';
 },[call,id,profileId]);
 const photoError=(e:unknown)=>e instanceof FeError?(e.code==='rule_violation'&&e.rule==='age_required'?t('fe.chx.ageRequired'):feErrorMessage(e,t)):e instanceof Error&&e.message==='upload'?t('fe.chx.uploadFailed'):feErrorMessage(e,t);
 const sendPhoto=async()=>{
  const o=outRef.current;if(!o||sheetBusy)return;setSheetBusy(true);setSheetErr('');
  try{const r=await deliver(o);setSheet(null);stick.current=true;if(r==='sent')await pull(false);}
  catch(e){setSheetErr(photoError(e));}finally{setSheetBusy(false);}
 };
 const retryPending=async(silent:boolean)=>{
  const o=outRef.current;if(!o||busy)return;if(!silent){setBusy(true);setFailure('');}
  try{if(await deliver(o)==='sent')await pull(false);}
  catch(e){if(!silent&&outRef.current?.preview===o.preview)setFailure(photoError(e));}finally{if(!silent)setBusy(false);}
 };
 // «отправится, когда модератор посмотрит»: while the chat is open, try again now and then.
 const pendingNow=!!out?.pending;
 const retryRef=useRef(retryPending);retryRef.current=retryPending;
 useEffect(()=>{if(!pendingNow)return;const iv=setInterval(()=>{void retryRef.current(true);},20000);return ()=>clearInterval(iv);},[pendingNow]);

 /* ---- message actions (long press / right click / Enter on a bubble) ---- */
 const press=useRef<{timer:ReturnType<typeof setTimeout>,x:number,y:number}|null>(null);const suppress=useRef(0);
 const openMsgMenu=(m:Msg)=>{if(sheet)return;const canReply=state==='active';if(!canReply&&!(m.mine&&m.body))return;setMsgFor(m);setSheetErr('');setSheet('msg');};
 const bubbleProps=(m:Msg)=>({
  'data-msg-id':m.id,tabIndex:0,'aria-haspopup':'dialog' as const,'aria-label':t('fe.chx.msgActions'),
  onPointerDown:(e:React.PointerEvent)=>{if(e.button!==0||(e.target as HTMLElement).closest('button:not(.mtile),a,input,textarea'))return;
   const p={x:e.clientX,y:e.clientY,timer:setTimeout(()=>{press.current=null;suppress.current=Date.now()+800;openMsgMenu(m);},500)};press.current=p;},
  onPointerMove:(e:React.PointerEvent)=>{const p=press.current;if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>10){clearTimeout(p.timer);press.current=null;}},
  onPointerUp:()=>{if(press.current){clearTimeout(press.current.timer);press.current=null;}},
  onPointerCancel:()=>{if(press.current){clearTimeout(press.current.timer);press.current=null;}},
  onClickCapture:(e:React.MouseEvent)=>{if(Date.now()<suppress.current){e.preventDefault();e.stopPropagation();}},
  onContextMenu:(e:React.MouseEvent)=>{e.preventDefault();openMsgMenu(m);},
  onKeyDown:(e:React.KeyboardEvent)=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openMsgMenu(m);}},
 });
 const copyMsg=async()=>{const m=msgFor;if(!m?.body)return;
  try{await navigator.clipboard.writeText(m.body);setSheet(null);toast(t('fe.chx.copied'),{type:'ok'});}catch{setSheet('copy');}};
 const quoteOf=(rid:string)=>{const q=(items??[]).find(x=>x.id===rid);if(!q||!meta)return null;
  return {who:q.mine?(acting?nameOf(acting):t('fe.chats.you')):nameOf(meta.other),text:q.body||(q.media?t('fe.chats.photo'):t('fe.chx.message'))};};
 const jump=(rid:string)=>{document.querySelector(`[data-msg-id="${rid}"]`)?.scrollIntoView({block:'center',behavior:'smooth'});};

 /* ---- the chat menu ---- */
 const run=async(fn:()=>Promise<void>)=>{setSheetBusy(true);setSheetErr('');try{await fn();}catch(e){setSheetErr(feErrorMessage(e,t));}finally{setSheetBusy(false);}};
 const toggleMute=()=>meta&&run(async()=>{const on=!meta.muted;await call('chat.mute',{conversationId:id,on},ok,{profileId:meta.side.id});setMeta({...meta,muted:on});toast(on?t('fe.chx.muted'):t('fe.chx.unmuted'));});
 const setArchive=(on:boolean)=>meta?call('chat.archive',{conversationId:id,on},ok,{profileId:meta.side.id}):Promise.resolve(null);
 const toggleArchive=()=>meta&&run(async()=>{const on=!meta.archived;await setArchive(on);setSheet(null);
  if(on){toast(t('fe.chx.archived'),{type:'ok',action:{label:t('fe.chx.undo'),fn:()=>{void setArchive(false).then(()=>dispatchEvent(new Event(RELOAD)),()=>{});}}});navigate('/n/chats');}
  else{setMeta({...meta,archived:false});toast(t('fe.chx.restored'),{type:'ok',action:{label:t('fe.chx.undo'),fn:()=>{void setArchive(true).then(()=>setMeta(m=>m&&{...m,archived:true}));}}});}});
 const revoke=()=>meta&&run(async()=>{await call('access.revoke',{opId:newOpId(),profileId:meta.other.id},ok,{profileId:meta.side.id});setGrants(g=>({...g,byMe:false}));setSheet(null);toast(t('fe.chx.revoked'),{type:'ok'});});
 const endConn=()=>meta&&run(async()=>{await call('match.end',{opId:newOpId(),profileId:meta.other.id},ok,{profileId:meta.side.id});
  if(grants.byMe&&ecRevoke){await call('access.revoke',{opId:newOpId(),profileId:meta.other.id},ok,{profileId:meta.side.id}).catch(()=>{});setGrants(g=>({...g,byMe:false}));}
  setState('ended');setSheet(null);toast(t('fe.chx.endDone'),{type:'ok'});dropOut(outRef.current);});
 const block=()=>meta&&run(async()=>{await call('block.set',{opId:newOpId(),profileId:meta.other.id,on:true},ok,{profileId:meta.side.id});navigate('/n/chats');});
 const theirs=(items??[]).filter(m=>!m.mine).slice(-20).reverse();
 const openReport=()=>{setRp({why:null,details:'',block:true,sel:[]});setSheetErr('');setSheet('report');};
 const sendReport=()=>{
  if(!meta)return;
  if(!rp.why){setSheetErr(t('fe.chx.needWhy'));return;}
  if(theirs.length&&!rp.sel.length){setSheetErr(t('fe.chx.needMsg'));return;}
  void run(async()=>{
   const base={opId:newOpId(),reason:rp.why,details:rp.details.trim().slice(0,500),alsoBlock:rp.block};
   // A chat is reported as its conversation with the selected messages; with nothing of theirs to show, the profile is.
   const inp=theirs.length?{...base,targetType:'conversation',targetId:id,messageIds:rp.sel}:{...base,targetType:'profile',targetId:meta.other.id};
   await call('report.create',inp,ok,{profileId:meta.side.id});
   if(rp.block)navigate('/n/chats');else{setSheet(null);toast(t('fe.chx.reportDone'),{type:'ok'});}
  });
 };

 const day=(iso:string)=>{const d=new Date(iso),n=new Date();return d.toDateString()===n.toDateString()?t('fe.chats.today'):d.toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'});};
 const time=(iso:string)=>new Date(iso).toLocaleTimeString(locale==='en'?'en':'ru',{hour:'2-digit',minute:'2-digit'});
 const fill=(s:string)=>s.replace('{name}',meta?nameOf(meta.other):'');
 const back=()=>navigate(meta?.archived?'/n/chats?archived=1':'/n/chats');
 if(error)return <><Bar title={t('fe.nav.chats')} back="/n/chats"/><div className="view nodock"><div className="wrap"><Empty icon={X} title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}>
  {!(error instanceof FeError&&error.code==='not_found')&&<Btn onClick={()=>{setError(null);if(meta)pull(true).catch(setError);else setTries(n=>n+1);}}>{t('fe.retry')}</Btn>}
  <Btn kind="soft" onClick={()=>navigate('/n/chats')}>{t('fe.chats.back')}</Btn></Empty></div></div></>;
 const ended=state!=='active';
 const sheetAlert=sheetErr?<div className="alert err mt12" role="alert"><span>{sheetErr}{sheetErr===t('fe.chx.ageRequired')&&<><br/><AgeCheckLink/></>}</span></div>:null;
 const all=items??[];
 // Read receipts: the other side's avatar under the last own message they have read.
 const lastRead=[...all].reverse().find(m=>m.mine&&m.seq<=otherRead)?.id;
 const otherName=meta?nameOf(meta.other):'';
 const couple=meta?.side.kind==='couple';
 const quote=(rid:string|null|undefined,preview=false)=>{if(!rid)return null;const q=quoteOf(rid);if(!q)return null;
  return preview?<div className="chat-quote"><b>{q.who}</b><span>{q.text}</span></div>
   :<button type="button" className="chat-quote" onClick={()=>jump(rid)}><b>{q.who}</b><span>{q.text}</span></button>;};
 let lastDay='';
 const sep=(iso:string)=>{const d=day(iso);if(d===lastDay)return null;lastDay=d;return <div className="daysep">{d}</div>;};
 return <>
  <header className="bar solid">
   <button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={back}><ChevronLeft/></button>
   {meta?<button type="button" className="row grow" style={{gap:10,textAlign:'left',minWidth:0}} onClick={()=>navigate('/n/people/'+meta.other.id)}>
    <Av name={otherName} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/>
    <span style={{display:'grid',minWidth:0}}><b style={{fontSize:16,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{otherName}</b>
     {couple&&<small style={{fontSize:12,color:'var(--mute)'}}><span className="ct-us"><Users/>{t('fe.chx.coupleChat')}</span> · {t('fe.chx.coupleSees')}</small>}</span>
   </button>:<span className="row grow" style={{gap:10,minWidth:0}}><i className="sk sk-av" style={{width:36,height:36}}/><i className="sk sk-l w40"/></span>}
   <button type="button" className="ibtn ghost" aria-label={t('fe.chx.menu')} disabled={!meta} onClick={()=>{setSheetErr('');setSheet('menu');}}><Ellipsis/></button>
  </header>
  <div ref={viewRef} className={'view nodock'+(ended?'':' cta1')} onScroll={onScroll}><div className="wrap">
   {meta&&state==='active'&&(grants.byMe||grants.withMe)&&<div className="chat-ctx">
    {grants.byMe&&grants.withMe?<button type="button" className="pill ok" onClick={()=>navigate('/n/people/'+meta.other.id)}><LockOpen/>{t('fe.chx.pillBoth')}</button>
     :grants.withMe?<button type="button" className="pill ok" onClick={()=>navigate('/n/people/'+meta.other.id)}><LockOpen/>{t('fe.chx.pillTheirs')}</button>
     :<button type="button" className="pill v" onClick={()=>navigate('/n/me?layer=priv')}><Eye/>{t('fe.chx.pillMine')}</button>}
   </div>}
   {items===null?<Skel kind="list" rows={4}/>:<>
    <div className="msgs" id="msgs">
     <div className="msg sys">{t('fe.chx.matchSys')}</div>
     {all.map(m=>{
      return <div key={m.id} style={{display:'contents'}}>
       {sep(m.at)}
       <div {...bubbleProps(m)} className={'msg'+(m.mine?' me':'')+(m.media?' has-media':'')}>
        {quote(m.replyTo)}
        {m.media?mediaTile(m):!m.body&&photoNote(m,'review')}
        {m.body&&<span className="mtx">{m.body}</span>}
        {m.mine&&<div className="st">{time(m.at)}<span aria-label={t('fe.chx.stDelivered')}><Check/></span></div>}
       </div>
       {m.id===lastRead&&meta&&<button type="button" className="msg-readers" aria-label={t('fe.chx.readByAria',{names:otherName})} onClick={()=>setSheet('readers')}>
        <span title={otherName}><Av name={otherName} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/></span></button>}
      </div>;})}
     {pend.map(p=><div key={p.key} style={{display:'contents'}}>
      {sep(p.at)}
      <div className={'msg me '+p.status}>{quote(p.replyTo)}<span className="mtx">{p.body}</span>
       <div className="st">{time(p.at)}<span aria-label={p.status==='sending'?t('fe.chx.stSending'):t('fe.chx.stFailed')}>{p.status==='sending'?<Clock/>:<CircleAlert/>}</span></div></div>
      {p.status==='failed'&&!ended&&<button type="button" className="msg-retry" onClick={()=>void deliverText(p)}><Undo2/>{t('fe.chx.retryMsg')}</button>}
     </div>)}
     {out?.pending&&<div className="msg me has-media sending"><span className="mtile"><img src={out.preview} alt="" draggable={false}/></span></div>}
    </div>
    {!ended&&all.length===0&&pend.length===0&&<><div className="sec">{t('fe.chx.starters')}</div><div className="chips">
     {[t('fe.chx.ice1'),t('fe.chx.ice2')].map(s=><button key={s} type="button" className="chip wrap" onClick={()=>{setText(s);requestAnimationFrame(()=>{if(input.current){grow(input.current);input.current.focus();}});}}>{s}</button>)}
    </div></>}
    {ended&&<div className="alert mt16"><Ban/><span><b>{t('fe.chx.endedTitle')}</b>{t('fe.chx.endedText')}</span></div>}
    {out?.pending&&<div className="alert info" role="status"><Clock/><div><b>{t('fe.chx.pending')}</b>
     <div className="row" style={{gap:8,flexWrap:'wrap'}}><Btn kind="soft" size="sm" auto busy={busy} disabled={busy} onClick={()=>void retryPending(false)}>{t('fe.chx.retry')}</Btn><Btn kind="text" size="sm" auto onClick={()=>dropOut(out)}>{t('fe.chx.drop')}</Btn></div></div></div>}
    {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
   </>}
  </div></div>
  <button type="button" className={'chat-down'+(ended?' low':'')+(!near?' on':'')} aria-label={t('fe.chx.toLatest')} onClick={toBottom}><ChevronDown/>{fresh>0&&<em>{fresh>99?'99+':fresh}</em>}</button>
  {!ended&&<div className="inputbar">
   {replyTo&&quoteOf(replyTo)&&<div className="reply-target chat-reply">{quote(replyTo,true)}<button type="button" className="ibtn sm" aria-label={t('fe.chx.cancelReply')} onClick={()=>{setReplyTo(null);input.current?.focus({preventScroll:true});}}><X/></button></div>}
   <button type="button" className="ibtn ghost" aria-label={t('fe.chx.attach')} disabled={!meta||!!out?.pending} onClick={()=>{setSheetErr('');setSheet('attach');}}><Plus/></button>
   <textarea ref={input} rows={1} maxLength={2000} value={text} onChange={e=>{setText(e.target.value);grow(e.target);}}
    placeholder={couple?t('fe.chx.messagePhCouple'):t('fe.chx.messagePh')} aria-label={t('fe.chx.message')} title={t('fe.chx.enterHint')} enterKeyHint="enter"
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!coarse&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
   <button type="button" className="ibtn send" onClick={send} disabled={!meta||!text.trim()} aria-label={t('fe.feed.send')}><SendHorizontal/></button>
  </div>}
  <input ref={gallery} type="file" accept={PHOTO_TYPES.join(',')} hidden onChange={e=>pick(e.target.files?.[0])}/>
  <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e=>pick(e.target.files?.[0])}/>
  {viewer&&<Viewer src={viewer.src} label={viewer.label} wm={viewer.wm} onClose={()=>{setViewer(null);pull(true).catch(()=>{});}}/>}

  {sheet==='msg'&&msgFor&&<Sheet title={t('fe.chx.msgTitle')} onClose={closeSheet}>
   <div className="card list">
    {!ended&&<Li icon={Undo2} title={t('fe.chx.reply')} onClick={()=>{setReplyTo(msgFor.id);setSheet(null);requestAnimationFrame(()=>input.current?.focus({preventScroll:true}));}}/>}
    {msgFor.mine&&msgFor.body&&<Li icon={Copy} title={t('fe.chx.copy')} onClick={()=>void copyMsg()}/>}
   </div>
  </Sheet>}
  {sheet==='copy'&&msgFor&&<Sheet title={t('fe.chx.copyTitle')} onClose={closeSheet}><textarea className="inp" readOnly aria-label={t('fe.chx.msgText')} value={msgFor.body}/></Sheet>}
  {sheet==='readers'&&meta&&<Sheet title={t('fe.chx.readBy')} onClose={closeSheet}>
   <div className="card list"><div className="li"><Av name={otherName} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/><span className="tx"><b>{otherName}</b><small>{t('fe.chx.readState')}</small></span></div></div>
  </Sheet>}

  {sheet==='attach'&&<Sheet title={t('fe.chx.attachTitle')} onClose={closeSheet}>
   <div className="card list">
    <Li icon={ImageIcon} tone="v" title={t('fe.chx.gallery')} sub={t('fe.chx.gallerySub')} onClick={()=>gallery.current?.click()}/>
    <Li icon={Camera} title={t('fe.chx.camera')} onClick={()=>camera.current?.click()}/>
   </div>
  </Sheet>}

  {sheet==='send'&&out&&<Sheet title={t('fe.chx.sendTitle')} onClose={()=>{if(sheetBusy)return;dropOut(out);closeSheet();}}
   foot={<Btn icon={SendHorizontal} onClick={sendPhoto} busy={sheetBusy} disabled={sheetBusy}>{t('fe.chx.send')}</Btn>}>
   <div className="cm-prev"><img src={out.preview} alt=""/></div>
   <section className="grp"><div className="grp-t"><span>{t('fe.chx.howView')}</span></div><div className="card">
    <label className="selrow solo"><span className="selv" aria-hidden="true">{t('fe.chx.mode.'+out.mode)}</span>
     <select value={out.mode} disabled={sheetBusy} aria-label={t('fe.chx.howView')} onChange={e=>{setSheetErr('');setOut({...out,mode:e.target.value as Mode});}}>
      {MODES.map(m=><option key={m} value={m}>{t('fe.chx.mode.'+m)}</option>)}
     </select></label>
   </div><p className="grp-n">{t('fe.chx.modeSub.'+(out.mode==='normal'||out.mode==='once'?out.mode:'timer'))}{out.mode!=='normal'?' · '+t('fe.chx.ephNote'):''}</p></section>
   <p className="note">{t('fe.chx.shotNote')}</p>
   {sheetAlert}
  </Sheet>}

  {sheet==='menu'&&meta&&<Sheet title={otherName} lead={<Av name={otherName} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/>} onClose={closeSheet}>
   <div className="card list">
    <Li icon={User} title={t('fe.chx.profile')} chev onClick={()=>navigate('/n/people/'+meta.other.id)}/>
    <Li icon={Sparkles} tone="l" title={t('fe.chx.shared')} chev onClick={()=>navigate('/n/people/'+meta.other.id+'/compat')}/>
    {grants.byMe&&<Li icon={Lock} tone="v" title={t('fe.chx.revoke')} sub={t('fe.chx.revokeSub')} onClick={()=>{if(!sheetBusy)void revoke();}}/>}
   </div>
   <div className="card list mt12">
    <Toggle title={t('fe.chx.mute')} sub={t('fe.chx.muteSub')} on={meta.muted} onClick={()=>{if(!sheetBusy)void toggleMute();}}/>
    <Li icon={meta.archived?ArchiveRestore:Archive} title={meta.archived?t('fe.chx.unarchive'):t('fe.chx.archive')} sub={t('fe.chx.archiveSub')} onClick={()=>{if(!sheetBusy)void toggleArchive();}}/>
   </div>
   <div className="card list mt12">
    {!ended&&<Li icon={X} danger title={t('fe.chx.end')} sub={t('fe.chx.endSub')} onClick={()=>{setSheetErr('');setSheet('end');}}/>}
    <Li icon={Flag} danger title={t('fe.chx.report')} onClick={openReport}/>
    <Li icon={Ban} danger title={t('fe.chx.block')} onClick={()=>{setSheetErr('');setSheet('block');}}/>
   </div>
   {sheetAlert}
  </Sheet>}

  {sheet==='end'&&meta&&<Sheet title={t('fe.chx.endTitle')} lead={<span className="ico l"><X/></span>} onClose={closeSheet}
   foot={<><Btn kind="danger" onClick={()=>void endConn()} busy={sheetBusy} disabled={sheetBusy}>{t('fe.chx.end')}</Btn><Btn kind="soft" onClick={closeSheet}>{t('fe.chx.cancel')}</Btn></>}>
   <p className="lead">{fill(t('fe.chx.endLead'))}</p>
   <div className="card flat">
    {(['endFact1','endFact2','endFact3'] as const).map(k=><div key={k} className="fact"><i className="g"><Check/></i><span>{t('fe.chx.'+k)}</span></div>)}
    <div className="fact"><i className="v"><Info/></i><span>{t('fe.chx.endFact4')}</span></div>
   </div>
   {grants.byMe&&<div className="card list mt12"><Toggle title={t('fe.chx.ecRevoke')} sub={t('fe.chx.ecRevokeSub')} on={ecRevoke} onClick={()=>setEcRevoke(v=>!v)}/></div>}
   <p className="note mt12">{t('fe.chx.endNote')}</p>
   {sheetAlert}
  </Sheet>}

  {sheet==='report'&&meta&&<Sheet title={t('fe.chx.report')} onClose={closeSheet}
   foot={<Btn kind="danger" onClick={sendReport} busy={sheetBusy} disabled={sheetBusy}>{t('fe.chx.reportSend')}</Btn>}>
   {theirs.length?<section className="grp bare"><div className="grp-t"><span>{t('fe.chx.reportPick')}</span></div><div className="card">
    {theirs.map(m=>{const on=rp.sel.includes(m.id);
     return <button key={m.id} type="button" className={'check'+(on?' on':'')} role="checkbox" aria-checked={on}
      onClick={()=>setRp(r=>({...r,sel:on?r.sel.filter(x=>x!==m.id):r.sel.length>=20?r.sel:[...r.sel,m.id]}))}>
      <i><Check/></i><span>{m.body||(m.media?t('fe.chats.photo'):'')}<small style={{display:'block',color:'var(--mute)'}}>{day(m.at)} · {time(m.at)}</small></span></button>;})}
   </div><p className="grp-n">{t('fe.chx.reportPickNote')}</p></section>
   :<p className="note">{t('fe.chx.reportNoMsgs')}</p>}
   <section className="grp bare" role="radiogroup" aria-label={t('fe.chx.reason')}><div className="grp-t"><span>{t('fe.chx.reason')}</span></div>
    {REASONS.map(k=><button key={k} type="button" className={'radio'+(rp.why===k?' on':'')} role="radio" aria-checked={rp.why===k} onClick={()=>setRp(r=>({...r,why:k}))}><i/><span className="tx">{t('fe.chx.reason.'+k)}</span></button>)}
   </section>
   <label className="field mt16"><span>{t('fe.chx.details')}<i>{t('fe.chx.optional')}</i></span>
    <textarea className="inp" rows={3} maxLength={500} value={rp.details} onChange={e=>setRp(r=>({...r,details:e.target.value}))}/></label>
   <div className="card list"><Toggle title={t('fe.chx.alsoBlock')} sub={t('fe.chx.alsoBlockSub')} on={rp.block} onClick={()=>setRp(r=>({...r,block:!r.block}))}/></div>
   {sheetAlert}
  </Sheet>}

  {sheet==='block'&&meta&&<Sheet title={fill(t('fe.chx.blockTitle'))} lead={<span className="ico l"><Ban/></span>} onClose={closeSheet}
   foot={<><Btn kind="danger" onClick={()=>void block()} busy={sheetBusy} disabled={sheetBusy}>{t('fe.chx.block')}</Btn><Btn kind="soft" onClick={closeSheet}>{t('fe.chx.cancel')}</Btn></>}>
   <p className="lead">{t('fe.chx.blockText')}</p>
   {sheetAlert}
  </Sheet>}
 </>;
}
