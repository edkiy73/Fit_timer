import {Fragment,useCallback,useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Archive,ArchiveRestore,Ban,Camera,Check,ChevronDown,ChevronLeft,CircleAlert,Clock,Copy,Ellipsis,Eye,EyeOff,Film,Flag,Image as ImageIcon,Info,Lock,LockOpen,MessageCircle,Plus,Search,SendHorizontal,Sparkles,Undo2,User,Users,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Av,Bar,Btn,Card,Check as CheckBox,Chip,Chips,Empty,Field,FilePick,Group,IconBtn,Layer,Note,PersonBar,Pill,RadioList,Row,SearchInput,SectionLabel,SelectRow,Sheet,Skel,Stack,Text,TextArea,ToggleRow,Typing,VideoBadge,VideoPlayer,View,VoiceBubble,VoiceRecorder,type Voice} from './kit';
import {VIDEO_MAX_BYTES,VIDEO_MAX_MS,VIDEO_TYPES,isVideo,prepareVideo,type PreparedVideo} from './kit/media';
import {useSendVideo,useSendVoice} from './media-upload';
import {AgeCheckLink,useAgeResume} from './age-check';
import {useFe,useRealtime,useTypingSignal} from './session';
import {useToast} from './toast';
import {softMax,textError} from './kit/validate';
import {BellButton,SegN} from './inbox';

/** Slice G (V21 H01, H02, H05) with the prototype's markup. A conversation exists only after a mutual like (server).
 * New messages and receipts arrive on a realtime «chat» signal (S2 §8); a slow poll stays as the fallback. */
const media=z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough();
const chat=z.object({id:z.uuid(),state:z.string(),side:z.object({id:z.uuid(),kind:z.enum(['person','couple'])}),newMatch:z.boolean(),
 other:z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),avatar:media.nullable()}),
 unread:z.number(),muted:z.boolean(),archived:z.boolean().optional(),last:z.object({body:z.string(),media:z.boolean(),mode:z.string(),mine:z.boolean(),kind:z.string().nullable().optional()}).nullable(),at:z.string()});
type Chat=z.infer<typeof chat>;
const list=z.object({ok:z.literal(true),items:z.array(chat)});
// Own messages carry when each member of the other side read them (`readBy`, a couple has two) and, for a
// disappearing photo, how each of them handled it (`views`); never whose account it was (V21 chatReadInfo / chatMedia).
const msg=z.object({id:z.uuid(),seq:z.number(),mine:z.boolean(),body:z.string(),at:z.string(),replyTo:z.uuid().nullable().optional(),
 readBy:z.array(z.object({read:z.boolean(),readAt:z.string().nullable(),reader:z.object({id:z.uuid(),handle:z.string().nullable(),name:z.string().nullable(),avatar:z.string().nullable().optional()}).nullable().optional()})).optional(),
 media:z.object({ephemeral:z.boolean().optional(),mode:z.string().optional(),state:z.string().optional(),blurred:z.boolean().optional(),pending:z.boolean().optional(),gone:z.boolean().optional(),w:z.number().nullable().optional(),h:z.number().nullable().optional(),src:z.record(z.string(),z.string()).nullable().optional(),
  views:z.array(z.object({state:z.string(),openedAt:z.string().nullable()})).optional(),
  // Video and voice: the kind, the length, a voice note's waveform and whether it was played («прослушано»).
  kind:z.string().optional(),durationMs:z.number().nullable().optional(),peaks:z.array(z.number()).nullable().optional(),listened:z.boolean().optional()}).passthrough().nullable().optional()});
const startersRes=z.object({ok:z.literal(true),topics:z.array(z.string())});
const topicsRes=z.object({ok:z.literal(true),topics:z.array(z.object({id:z.string(),ru:z.string().nullable(),en:z.string().nullable()}).passthrough())}).passthrough();
type Msg=z.infer<typeof msg>;
const msgs=z.object({ok:z.literal(true),state:z.string(),items:z.array(msg),otherRead:z.number(),lastSeq:z.number(),typingTag:z.string().optional()});
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
 const preview=(c:Chat)=>c.state==='ended'?t('fe.chx.endedRow'):!c.last?t('fe.chx.sayFirst'):c.last.media&&!c.last.body?(c.last.mode!=='normal'?t('fe.chats.ephemeral'):c.last.kind==='audio'?t('fe.av.voice'):c.last.kind==='video'?t('fe.av.video'):t('fe.chats.photo')):c.last.body;
 const row=(c:Chat)=><button key={c.id} type="button" className={'chat-row'+(c.unread?' unread':'')+(c.state==='ended'?' ended':'')} onClick={()=>navigate('/n/chats/'+c.id)}>
  <Av name={nameOf(c.other)} seed={c.other.id} size="lg" src={c.other.avatar?.src?.thumb}/>
  <span className="tx"><b>{nameOf(c.other)}</b><small>{c.side.kind==='couple'&&<span className="ct-us"><Users/>{t('fe.chx.coupleChat')}</span>}{preview(c)}</small></span>
  <span className="side2">{c.unread>0&&<span className="unr">{c.unread>99?'99+':c.unread}</span>}<time>{ago(c.at,locale)}</time></span>
 </button>;
 const toggleSearch=()=>{setSearching(s=>!s);setQ('');};

 if(archived)return <>
  <Bar title={t('fe.chx.archiveTitle')} back="/n/chats" small/>
  <View className="nodock">
   {error&&!items?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<Skel kind="list"/>
    :rows.length?rows.map(row):<Empty icon={Archive} title={t('fe.chx.archiveEmpty')}/>}
  </View>
 </>;
 return <>
  <Bar title={t('fe.nav.chats')}>
   <IconBtn icon={Search} label={t('fe.chx.search')} aria-pressed={searching} onClick={toggleSearch}/>
   <IconBtn icon={Archive} label={t('fe.chx.archiveTitle')} onClick={()=>navigate('/n/chats?archived=1')}/>
   <BellButton/>
  </Bar>
  <View>
   {couple&&<SegN value={kind} onChange={setKind} options={[{id:'all',label:t('fe.chats.all')},{id:'me',label:t('fe.chats.personal'),n:unreadFor('me')},{id:'couple',label:t('fe.chats.couple'),n:unreadFor('couple')}]}/>}
   {couple&&kind==='couple'&&<Note className="mt8">{t('fe.chx.coupleNote',{name:couple.name})}</Note>}
   {searching&&<div className="chat-q mt12"><SearchInput ref={qRef} label={t('fe.chx.search')} placeholder={t('fe.chx.searchPh')} value={q} onChange={e=>setQ(e.target.value)}/>
    <IconBtn icon={X} kind="ghost" size="sm" label={t('fe.chx.searchClose')} onClick={toggleSearch}/></div>}
   {error&&!items?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<Skel kind="list" rows={4}/>
    :<>
     {fresh.length>0&&<><SectionLabel>{t('fe.chats.newMatches')}</SectionLabel>
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

/* ================= shared sheet bits ================= */
/** `openViewer()` for one chat photo: optional label («Один просмотр…») and the viewer's handle as a watermark. */
function Viewer({src,video,label,wm,onClose}:{src:string,/** A clip: it plays over its poster `src`. */ video?:string|undefined,label?:string|undefined,wm?:string|undefined,onClose:()=>void}){
 const {t}=useI18n();const [on,setOn]=useState(false);const close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const r=requestAnimationFrame(()=>{setOn(true);close.current?.focus({preventScroll:true});});return ()=>cancelAnimationFrame(r);},[]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose]);
 return <Layer><div className={'viewer'+(on?' on':'')} role="dialog" aria-modal="true" aria-label={t('fe.chx.viewer')}>
  <div className="vw-track"><figure>{video?<VideoPlayer src={video} poster={src} fill autoPlay/>:<img src={src} alt="" draggable={false}/>}{wm&&<div className="vw-wm" aria-hidden="true">{Array.from({length:18},(_,i)=><span key={i}>{wm}</span>)}</div>}</figure></div>
  <div className="vw-top"><span className="vw-n"/>{label&&<span className="vw-label">{label}</span>}<IconBtn ref={close} icon={X} kind="glass" label={t('fe.chx.close')} onClick={onClose}/></div>
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
type Outgoing={file:File,preview:string,mode:Mode,assetId?:string,assetMode?:Mode,opId:string,pending?:boolean,/** A clip (preview = its poster). */ video?:PreparedVideo};
/** A text on its way (the prototype's optimistic bubble with «Отправляется» / «Не отправлено · Повторить»). */
type Pend={key:string,body:string,replyTo?:string,opId:string,at:string,status:'sending'|'failed'};
type SheetKind='attach'|'send'|'menu'|'end'|'report'|'block'|'msg'|'readers'|'copy';
const PHOTO_TYPES=['image/jpeg','image/png','image/webp'];
/** The message box stops growing at this height (px) and scrolls. */
const GROW=120;

/* ================= H02 conversation ================= */
export function ChatScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 useScreenTag('H02');
 const [meta,setMeta]=useState<Chat|null>(null);const [items,setItems]=useState<Msg[]|null>(null);const [state,setState]=useState('active');const [otherRead,setOtherRead]=useState(0);const [tag,setTag]=useState<string|null>(null);
 const [error,setError]=useState<unknown>(null);const [text,setText]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const [pend,setPend]=useState<Pend[]>([]);const [tries,setTries]=useState(0);const [replyTo,setReplyTo]=useState<string|null>(null);
 const [open,setOpen]=useState<Record<string,string>>({});
 // The «down» button sits above the input bar (`--ctah`); the bar grows with a reply quote or a long message.
 const bar=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const el=bar.current,m=document.querySelector<HTMLElement>('.fe-v21 main.main');if(!el||!m)return;
  const ro=new ResizeObserver(()=>m.style.setProperty('--ctah',el.offsetHeight+'px'));ro.observe(el);
  return ()=>{ro.disconnect();m.style.removeProperty('--ctah');};},[state,items===null]);
 const [eph,setEph]=useState<Record<string,{state:'open'|'done',until?:number}>>({});
 const [viewer,setViewer]=useState<{src:string,video?:string|undefined,label?:string|undefined,wm?:string|undefined}|null>(null);
 // A covered clip opened by a tap plays in its bubble (the photo goes to the viewer).
 const [openVid,setOpenVid]=useState<Record<string,{file:string,poster?:string|undefined}>>({});
 // A voice message on its way (an optimistic bubble), and the ones this account has just played.
 const [voiceOut,setVoiceOut]=useState<{v:Voice,status:'sending'|'failed'}|null>(null);const [heard,setHeard]=useState<Record<string,true>>({});
 const videoPick=useRef<HTMLInputElement>(null);
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
 const sendClip=useSendVideo('chat',{},profileId);const sendVoice=useSendVoice(profileId);
 useEffect(()=>{
  // An archived conversation is opened from «Архив» too, so both lists are asked.
  Promise.all([call('chats.list',{filter:'all'},list,{asAccount:true}),call('chats.list',{filter:'all',archived:true},list,{asAccount:true})])
   .then(([a,b])=>{const c=[...a.items,...b.items].find(x=>x.id===id);if(c){setMeta(c);setState(c.state);}else setError(new FeError('not_found',404));}).catch(setError);
 },[call,id,tries]);
 const pull=useCallback(async(initial:boolean)=>{
  if(!meta)return;
  const r=await call('chat.messages',initial?{conversationId:id}:{conversationId:id,afterSeq:last.current},msgs,{profileId:meta.side.id});
  setState(r.state);setOtherRead(r.otherRead);if(r.typingTag)setTag(r.typingTag);
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
 useRealtime('chat',()=>{pull(false).catch(()=>{});setTyping(false);});
 // «печатает…» (owner, 28.10): the other side's typing signal shows a line under the messages for ~5 s; mine goes out
 // at most every 4 s while I type. Nothing is stored anywhere.
 const [typing,setTyping]=useState(false);const typingTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const lastTyping=useRef(0);
 useTypingSignal(tag,()=>{setTyping(true);clearTimeout(typingTimer.current);typingTimer.current=setTimeout(()=>setTyping(false),5000);});
 useEffect(()=>()=>clearTimeout(typingTimer.current),[]);
 const typed=()=>{if(!meta||state!=='active'||Date.now()-lastTyping.current<4000)return;lastTyping.current=Date.now();
  call('chat.typing',{conversationId:id},ok,{profileId:meta.side.id}).catch(()=>{});};
 // Private access between the two sides: the pills above the chat and «Отозвать мой доступ» in the menu (V11 UX-16).
 const loadGrants=useCallback(()=>{
  if(!meta)return;const other=meta.other.id;const opts={profileId:meta.side.id};
  Promise.all([call('access.lists',{tab:'byme'},grantList,opts),call('access.lists',{tab:'withme'},grantList,opts)])
   .then(([a,b])=>setGrants({byMe:a.items.some(x=>x.profile.id===other),withMe:b.items.some(x=>x.profile.id===other)})).catch(()=>{});
 },[call,meta]);
 useEffect(()=>{loadGrants();},[loadGrants]);
 // «С чего начать» (V21 ice): questions about interests both sides show publicly, before the two general ones.
 const [starters,setStarters]=useState<string[]>([]);
 const empty=items!==null&&items.length===0&&state==='active';
 useEffect(()=>{if(!meta||!empty)return;let live=true;
  Promise.all([call('chat.starters',{conversationId:id},startersRes,{profileId:meta.side.id}),call('catalog.get',{},topicsRes,{asAccount:true})])
   .then(([s,c])=>{if(!live)return;const name=new Map(c.topics.map(x=>[x.id,(locale==='en'?x.en||x.ru:x.ru||x.en)??'']));setStarters(s.topics.map(id=>name.get(id)??'').filter(Boolean));}).catch(()=>{});
  return ()=>{live=false;};},[call,id,meta,empty,locale]);
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
  // Kit validation layer: the server's rule for a message (length, characters, lines, long runs) before it leaves.
  const bad=textError(t,'chatMessage',body);if(bad){toast(bad,{type:'err'});return;}
  const p:Pend={key:newOpId(),body,opId:newOpId(),at:new Date().toISOString(),status:'sending',...(replyTo?{replyTo}:{})};
  setPend(list=>[...list,p]);setText('');setReplyTo(null);stick.current=true;
  if(input.current)input.current.style.height='';
  void deliverText(p);
 };
 // The message box grows with its text (TextArea `grow`); a starter put in by a tap is measured the same way.
 const grow=(el:HTMLTextAreaElement)=>{el.style.height='auto';const h=el.scrollHeight+2;el.style.height=Math.min(GROW,h)+'px';el.style.overflowY=h>GROW?'auto':'hidden';};
 const coarse=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches;

 /* ---- media ---- */
 const openMedia=async(m:Msg)=>{
  if(!meta)return;
  const md=m.media;if(!md)return;
  try{
   const r=await call('chat.openMedia',{opId:newOpId(),messageId:m.id},opened,{profileId:meta.side.id});
   const src=r.media?.src?.full??r.media?.src?.card;const video=r.media?.src?.file;
   if(!md.ephemeral){
    if(video){setOpenVid(o=>({...o,[m.id]:{file:video,poster:src}}));return;}
    if(src)setOpen(o=>({...o,[m.id]:src}));if(src&&!md.blurred)setViewer({src});return;}
   if(r.gone||!src){setEph(e=>({...e,[m.id]:{state:'done'}}));return;}
   if(m.mine){setViewer({src,video});return;}
   const once=md.mode==='once';const until=r.until?Date.parse(r.until):undefined;
   setEph(e=>({...e,[m.id]:once?{state:'done'}:{state:'open',...(until?{until}:{})}}));
   setViewer({src,video,label:once?t('fe.chx.viewerOnce'):until?t('fe.chx.viewerLeft',{left:left(until)}):undefined,wm:acting?.handle?'@'+acting.handle:undefined});
  }catch(e){toast(feErrorMessage(e,t),{type:'err'});}
 };
 const left=(until:number)=>{const min=Math.max(1,Math.ceil((until-Date.now())/60e3));const h=Math.floor(min/60),r=min%60;
  return min>=60?(r?t('fe.chx.hm',{h:String(h),m:String(r)}):t('fe.chx.hours',{h:String(h)})):t('fe.chx.min',{n:String(min)});};
 /** What the sender sees on their own disappearing photo: not opened yet, being looked at now, or opened (and when). */
 const ownEph=(views:{state:string,openedAt:string|null}[]|undefined)=>{
  const v=views??[];const open=v.find(x=>x.state==='open');const seen=v.filter(x=>x.openedAt).sort((a,b)=>Date.parse(b.openedAt!)-Date.parse(a.openedAt!))[0];
  if(open)return t('fe.w7.eph.openNow');
  if(seen)return t('fe.w7.eph.seen',{time:time(seen.openedAt!)})+(v.length>1&&v.some(x=>x.state==='unopened')?' · '+t('fe.w7.eph.oneLeft'):'');
  return `${t('fe.chx.ephSent')} · ${t('fe.w7.eph.notYet')}`;};
 const modeLabel=(mode:string)=>t('fe.chx.eph.'+(['once','t15','t120','t1440'].includes(mode)?mode:'once'));
 /** A photo with nothing to show: still being checked (the recipient waits for the moderator) or removed. */
 const photoNote=(m:Msg,why:'review'|'gone')=>{const k=m.media?.kind;
  const title=k==='audio'?(why==='gone'?t('fe.av.voiceGone'):t('fe.av.voiceReview')):k==='video'?(why==='gone'?t('fe.av.videoGone'):t('fe.av.videoReview')):why==='gone'?t('fe.chx.photoGone'):t('fe.chx.photoReview');
  return <div className="eph-gone" role="note"><span className="eg-ic">{why==='gone'?<EyeOff/>:<Clock/>}</span>
  <span className="eg-tx"><b>{title}</b><small>{why==='gone'?t('fe.chx.photoGoneSub'):m.mine?(k==='video'?t('fe.av.videoReviewMine'):t('fe.chx.photoReviewMine')):t('fe.chx.photoReviewSub')}</small></span></div>;};
 /** «Прослушано»: told once per voice message, the first time this account plays most of it. */
 const markHeard=(m:Msg)=>{if(m.mine||m.media?.listened||heard[m.id]||!meta)return;setHeard(h=>({...h,[m.id]:true}));
  call('chat.listened',{messageId:m.id},ok,{profileId:meta.side.id}).catch(()=>{});};
 const mediaTile=(m:Msg):ReactNode=>{
  const md=m.media!;const vid=md.kind==='video';const kind=vid?t('fe.av.video'):t('fe.chats.photo');
  if(md.kind==='audio'){
   if(md.gone)return photoNote(m,'gone');
   return <VoiceBubble src={md.src?.file} durationMs={md.durationMs} peaks={md.peaks} mine={m.mine} listened={!!md.listened||!!heard[m.id]}
    onPlayed={()=>markHeard(m)} onExpired={()=>{pull(true).catch(()=>{});}}/>;
  }
  if(!md.ephemeral&&vid){
   const opened=openVid[m.id];
   if(opened)return <div className="mtile"><VideoPlayer src={opened.file} poster={opened.poster} w={md.w} h={md.h} durationMs={md.durationMs} autoPlay/></div>;
   if(!md.blurred){
    if(!md.src?.file)return photoNote(m,md.gone?'gone':'review');
    return <><div className="mtile"><VideoPlayer src={md.src.file} poster={md.src.card??md.src.full} w={md.w} h={md.h} durationMs={md.durationMs} onExpired={()=>{pull(true).catch(()=>{});}}/></div>
     {m.mine&&md.pending&&<small className="mpend"><Clock/>{t('fe.av.videoReviewMine')}</small>}</>;
   }
  }
  if(!md.ephemeral){
   const revealed=open[m.id];const hidden=!!md.blurred&&!revealed;
   const src=revealed??(hidden?md.src?.blur:md.src?.card??md.src?.full);
   if(!src)return photoNote(m,md.gone?'gone':'review');
   return <><button type="button" className={'mtile'+(hidden?' blur':'')} aria-label={hidden?(vid?t('fe.av.videoHidden'):t('fe.chx.hiddenAria')):t('fe.chx.openAria')}
    onClick={()=>{if(hidden)void openMedia(m);else setViewer({src:revealed??md.src?.full??src});}}>
    <img src={src} alt="" draggable={false} style={md.w&&md.h?{'--ar':`${md.w}/${md.h}`} as CSSProperties:undefined}/>{hidden&&<span className="mcover"><EyeOff/><b>{t('fe.chx.tapView')}</b></span>}
    {vid&&<VideoBadge durationMs={md.durationMs}/>}
   </button>{m.mine&&md.pending&&<small className="mpend"><Clock/>{t('fe.chx.photoReviewMine')}</small>}</>;
  }
  const mode=md.mode??'once';const once=mode==='once';const local=eph[m.id];
  const st=local?.state==='done'||md.state==='done'?'expired':local?.state==='open'||md.state==='open'?'counting':'unopened';
  if(st==='expired')return <div className="eph-gone" role="note"><span className="eg-ic"><EyeOff/></span><span className="eg-tx"><b>{kind} · {once?t('fe.chx.ephGoneOnce'):t('fe.chx.ephGoneTimer')}</b><small>{once?t('fe.chx.ephViewed'):t('fe.chx.ephTimeUp')}</small></span></div>;
  const line=`${kind} · ${modeLabel(mode)}`;
  const until=local?.until;
  const sub=m.mine?ownEph(md.views)
   :st==='unopened'?(once?t('fe.chx.ephOpenOnce'):t('fe.chx.ephOpenTimer'))
   :until?t('fe.chx.ephAgainLeft',{left:left(until)}):t('fe.chx.ephAgain');
  const frac=st==='counting'&&until&&TTL[mode]?Math.max(.08,(until-Date.now())/TTL[mode]!):1;
  return <button type="button" className={'mtile eph2 '+st} aria-label={`${line}. ${sub}`} onClick={()=>void openMedia(m)}>
   <span className="eph-ash"/><span className="eph-veil"/><span className="eph-c"><MatchRing frac={frac} lit/><b>{line}</b><small>{sub}</small></span>
  </button>;
 };
 const closeSheet=useCallback(()=>{setSheet(null);setSheetErr('');},[]);

 /* ---- photos: uploadIntent → PUT → commit → chat.sendMedia ---- */
 /** A clip: up to a minute and 100 MB; its poster frame is cut here and shown while it goes (no crop). */
 const pickVideo=async(f:File|undefined)=>{
  if(videoPick.current)videoPick.current.value='';
  if(!f)return;setSheetErr('');
  if(!isVideo(f)){toast(t('fe.kit.up.videoRead',{name:f.name}),{type:'err'});setSheet(null);return;}
  if(f.size>VIDEO_MAX_BYTES){toast(t('fe.kit.up.videoBig'),{type:'err'});setSheet(null);return;}
  let video:PreparedVideo;
  try{video=await prepareVideo(f);}catch{toast(t('fe.kit.up.videoRead',{name:f.name}),{type:'err'});setSheet(null);return;}
  if(video.durationMs>VIDEO_MAX_MS+500){URL.revokeObjectURL(video.url);toast(t('fe.kit.up.videoLong'),{type:'err'});setSheet(null);return;}
  if(outRef.current)URL.revokeObjectURL(outRef.current.preview);
  setFailure('');setOut({file:f,preview:video.url,mode:'normal',opId:newOpId(),video});setSheet('send');
 };
 const pick=(f:File|undefined)=>{
  if(gallery.current)gallery.current.value='';if(camera.current)camera.current.value='';
  if(!f)return;setSheetErr('');
  if(isVideo(f)){void pickVideo(f);return;}
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
   let assetId:string;
   if(cur.video)assetId=await sendClip(cur.video,()=>{},rule);
   else{
    const i=await call('media.uploadIntent',{opId:newOpId(),purpose:'chat',kind:'image',mime:cur.file.type,bytes:cur.file.size,...rule},uploadIntent,{profileId});
    const put=await fetch(i.upload.url,{method:i.upload.method,headers:i.upload.headers,body:cur.file}).catch(()=>null);
    if(!put?.ok)throw new Error('upload');
    await call('media.commit',{assetId:i.assetId},ok,{profileId});
    assetId=i.assetId;
   }
   if(!live()){call('media.remove',{opId:newOpId(),assetId},ok,{profileId}).catch(()=>{});return 'pending';}
   cur={...cur,assetId,assetMode:cur.mode,opId:newOpId()};setOut(cur);
  }
  try{await call('chat.sendMedia',{opId:cur.opId,conversationId:id,assetId:cur.assetId,mode:cur.mode},ok,{profileId});}
  catch(e){if(e instanceof FeError&&e.code==='conflict'&&e.rule==='pending'){if(live())setOut({...cur,pending:true});return 'pending';}throw e;}
  if(live()){URL.revokeObjectURL(cur.preview);setOut(null);}
  return 'sent';
 },[call,id,profileId,sendClip]);
 const photoError=(e:unknown)=>e instanceof FeError?(e.code==='rule_violation'&&e.rule==='age_required'?t('fe.chx.ageRequired'):feErrorMessage(e,t)):e instanceof Error&&e.message==='upload'?(outRef.current?.video?t('fe.av.videoFailed'):t('fe.chx.uploadFailed')):feErrorMessage(e,t);
 /* ---- voice messages: record → upload (purpose voice) → chat.sendMedia; an optimistic bubble meanwhile ---- */
 const deliverVoice=async(v:Voice)=>{
  if(!profileId)return;setVoiceOut({v,status:'sending'});stick.current=true;
  try{const assetId=await sendVoice(v);await call('chat.sendMedia',{opId:newOpId(),conversationId:id,assetId,mode:'normal'},ok,{profileId});
   await pull(false).catch(()=>{});setVoiceOut(null);}
  catch(e){setVoiceOut({v,status:'failed'});toast(e instanceof FeError?feErrorMessage(e,t):t('fe.av.voiceNotSent'),{type:'err'});}
 };
 const voiceError=(why:'denied'|'unsupported'|'short'|'failed')=>toast(t(why==='denied'?'fe.av.voiceDenied':why==='unsupported'?'fe.av.voiceUnsupported':why==='short'?'fe.av.voiceShort':'fe.av.voiceFailed'),{type:why==='short'?'warn':'err'});
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
 const mediaWord=(m:Msg)=>m.media?.kind==='audio'?t('fe.av.voice'):m.media?.kind==='video'?t('fe.av.video'):t('fe.chats.photo');
 const quoteOf=(rid:string)=>{const q=(items??[]).find(x=>x.id===rid);if(!q||!meta)return null;
  return {who:q.mine?(acting?nameOf(acting):t('fe.chats.you')):nameOf(meta.other),text:q.body||(q.media?mediaWord(q):t('fe.chx.message'))};};
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
  const bad=textError(t,'reportDetails',rp.details);if(bad){setSheetErr(bad);return;}
  void run(async()=>{
   const base={opId:newOpId(),reason:rp.why,details:rp.details.trim().slice(0,500),alsoBlock:rp.block};
   // A chat is reported as its conversation with the selected messages; with nothing of theirs to show, the profile is.
   const inp=theirs.length?{...base,targetType:'conversation',targetId:id,messageIds:rp.sel}:{...base,targetType:'profile',targetId:meta.other.id};
   await call('report.create',inp,ok,{profileId:meta.side.id});
   if(rp.block)navigate('/n/chats');else{setSheet(null);toast(t('fe.chx.reportDone'),{type:'ok'});}
  });
 };

 // Back from the age check a photo sent us to: the attach sheet opens again (the photo itself is picked anew).
 useAgeResume(v=>v==='attach:'+id,()=>{setSheetErr('');setSheet('attach');},!!meta&&state==='active');
 const day=(iso:string)=>{const d=new Date(iso),n=new Date();return d.toDateString()===n.toDateString()?t('fe.chats.today'):d.toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'});};
 const time=(iso:string)=>new Date(iso).toLocaleTimeString(locale==='en'?'en':'ru',{hour:'2-digit',minute:'2-digit'});
 const fill=(s:string)=>s.replace('{name}',meta?nameOf(meta.other):'');
 const back=()=>navigate(meta?.archived?'/n/chats?archived=1':'/n/chats');
 if(error)return <><Bar title={t('fe.nav.chats')} back="/n/chats"/><View className="nodock"><Empty icon={X} title={t('fe.feed.unavailable')} text={feErrorMessage(error,t)}>
  {!(error instanceof FeError&&error.code==='not_found')&&<Btn onClick={()=>{setError(null);if(meta)pull(true).catch(setError);else setTries(n=>n+1);}}>{t('fe.retry')}</Btn>}
  <Btn kind="soft" onClick={()=>navigate('/n/chats')}>{t('fe.chats.back')}</Btn></Empty></View></>;
 const ended=state!=='active';
 const sheetAlert=sheetErr?<Alert kind="err" noIcon className="mt12">{sheetErr}{sheetErr===t('fe.chx.ageRequired')&&<><br/><AgeCheckLink intent={'attach:'+id}/></>}</Alert>:null;
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
  <PersonBar onBack={back} {...(meta?{name:otherName,onOpen:()=>navigate('/n/people/'+meta.other.id),av:<Av name={otherName} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/>}:{})}
   sub={couple?<><span className="ct-us"><Users/>{t('fe.chx.coupleChat')}</span> · {t('fe.chx.coupleSees')}</>:undefined}>
   <IconBtn icon={Ellipsis} kind="ghost" label={t('fe.chx.menu')} disabled={!meta} onClick={()=>{setSheetErr('');setSheet('menu');}}/>
  </PersonBar>
  <div ref={viewRef} className={'view nodock'+(ended?'':' cta1')} onScroll={onScroll}><div className="wrap">
   {meta&&state==='active'&&(grants.byMe||grants.withMe)&&<div className="chat-ctx">
    {grants.byMe&&grants.withMe?<Pill tone="ok" icon={LockOpen} onClick={()=>navigate('/n/people/'+meta.other.id)}>{t('fe.chx.pillBoth')}</Pill>
     :grants.withMe?<Pill tone="ok" icon={LockOpen} onClick={()=>navigate('/n/people/'+meta.other.id)}>{t('fe.chx.pillTheirs')}</Pill>
     :<Pill tone="v" icon={Eye} onClick={()=>navigate('/n/me?layer=priv')}>{t('fe.chx.pillMine')}</Pill>}
   </div>}
   {items===null?<Skel kind="list" rows={4}/>:<>
    <div className="msgs" id="msgs">
     <div className="msg sys">{t('fe.chx.matchSys')}</div>
     {all.map(m=>{
      return <Fragment key={m.id}>
       {sep(m.at)}
       <div {...bubbleProps(m)} className={'msg'+(m.mine?' me':'')+(m.media?' has-media':'')}>
        {quote(m.replyTo)}
        {m.media?mediaTile(m):!m.body&&photoNote(m,'review')}
        {m.body&&<span className="mtx">{m.body}</span>}
        {m.mine&&<div className="st">{time(m.at)}<span aria-label={t('fe.chx.stDelivered')}><Check/></span></div>}
       </div>
       {m.id===lastRead&&meta&&<button type="button" className="msg-readers" aria-label={t('fe.chx.readByAria',{names:otherName})} onClick={()=>{setMsgFor(m);setSheet('readers');}}>
        <span title={otherName}><Av name={otherName} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/></span></button>}
      </Fragment>;})}
     {pend.map(p=><Fragment key={p.key}>
      {sep(p.at)}
      <div className={'msg me '+p.status}>{quote(p.replyTo)}<span className="mtx">{p.body}</span>
       <div className="st">{time(p.at)}<span aria-label={p.status==='sending'?t('fe.chx.stSending'):t('fe.chx.stFailed')}>{p.status==='sending'?<Clock/>:<CircleAlert/>}</span></div></div>
      {p.status==='failed'&&!ended&&<button type="button" className="msg-retry" onClick={()=>void deliverText(p)}><Undo2/>{t('fe.chx.retryMsg')}</button>}
     </Fragment>)}
     {out?.pending&&<div className="msg me has-media sending"><span className="mtile"><img src={out.preview} alt="" draggable={false}/>{out.video&&<VideoBadge durationMs={out.video.durationMs}/>}</span></div>}
     {voiceOut&&<><div className={'msg me has-media '+voiceOut.status}><VoiceBubble durationMs={voiceOut.v.durationMs} peaks={voiceOut.v.peaks} mine/>
      <div className="st"><span aria-label={voiceOut.status==='sending'?t('fe.chx.stSending'):t('fe.chx.stFailed')}>{voiceOut.status==='sending'?<Clock/>:<CircleAlert/>}</span></div></div>
      {voiceOut.status==='failed'&&!ended&&<Stack row gap={2}><Btn kind="text" size="sm" auto icon={Undo2} onClick={()=>void deliverVoice(voiceOut.v)}>{t('fe.chx.retryMsg')}</Btn>
       <Btn kind="text" size="sm" auto icon={X} onClick={()=>setVoiceOut(null)}>{t('fe.chx.drop')}</Btn></Stack>}</>}
     {typing&&!ended&&<Typing>{t('fe.w7.typing',{name:otherName})}</Typing>}
    </div>
    {!ended&&all.length===0&&pend.length===0&&<><SectionLabel>{t('fe.chx.starters')}</SectionLabel><Chips className="ice">
     {[...starters.slice(0,2).map(n=>t('fe.w7.ice.topic',{topic:n})),t('fe.chx.ice1'),t('fe.chx.ice2')].map(s=><Chip key={s} onClick={()=>{setText(s);requestAnimationFrame(()=>{if(input.current){grow(input.current);input.current.focus();}});}}>{s}</Chip>)}
    </Chips></>}
    {ended&&<Alert kind="info" icon={Ban} className="mt16"><b>{t('fe.chx.endedTitle')}</b>{t('fe.chx.endedText')}</Alert>}
    {out?.pending&&<Alert kind="info" icon={Clock}><b>{out.video?t('fe.av.videoPending'):t('fe.chx.pending')}</b>
     <Stack row gap={2}><Btn kind="soft" size="sm" auto busy={busy} disabled={busy} onClick={()=>void retryPending(false)}>{t('fe.chx.retry')}</Btn><Btn kind="text" size="sm" auto onClick={()=>dropOut(out)}>{t('fe.chx.drop')}</Btn></Stack></Alert>}
    {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
   </>}
  </div></div>
  <button type="button" className={'chat-down'+(ended?' low':'')+(!near?' on':'')} aria-label={t('fe.chx.toLatest')} onClick={toBottom}><ChevronDown/>{fresh>0&&<em>{fresh>99?'99+':fresh}</em>}</button>
  {!ended&&<div className="inputbar" ref={bar}>
   {replyTo&&quoteOf(replyTo)&&<div className="reply-target chat-reply">{quote(replyTo,true)}<IconBtn icon={X} size="sm" label={t('fe.chx.cancelReply')} onClick={()=>{setReplyTo(null);input.current?.focus({preventScroll:true});}}/></div>}
   <IconBtn icon={Plus} kind="ghost" label={t('fe.chx.attach')} disabled={!meta||!!out?.pending} onClick={()=>{setSheetErr('');setSheet('attach');}}/>
   <TextArea ref={input} bare grow={GROW} rows={1} maxLength={softMax('chatMessage')} value={text} onChange={e=>{setText(e.target.value);if(e.target.value.trim())typed();}}
    placeholder={couple?t('fe.chx.messagePhCouple'):t('fe.chx.messagePh')} aria-label={t('fe.chx.message')} title={t('fe.chx.enterHint')} enterKeyHint="enter"
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!coarse&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
   {/* An empty box offers a voice message instead of «Отправить» (hold to record). */}
   {text.trim()||!meta?<IconBtn icon={SendHorizontal} kind="send" onClick={send} disabled={!meta||!text.trim()} label={t('fe.feed.send')}/>
    :<VoiceRecorder onSend={v=>void deliverVoice(v)} onError={voiceError} disabled={voiceOut?.status==='sending'}/>}
  </div>}
  <FilePick ref={gallery} accept={PHOTO_TYPES.join(',')} onFiles={f=>pick(f[0])}/>
  <FilePick ref={camera} accept="image/*" capture="environment" onFiles={f=>pick(f[0])}/>
  <FilePick ref={videoPick} accept={VIDEO_TYPES.join(',')} onFiles={f=>void pickVideo(f[0])}/>
  {viewer&&<Viewer src={viewer.src} label={viewer.label} wm={viewer.wm} onClose={()=>{setViewer(null);pull(true).catch(()=>{});}}/>}

  {sheet==='msg'&&msgFor&&<Sheet title={t('fe.chx.msgTitle')} onClose={closeSheet}>
   <Card list>
    {!ended&&<Row noChev icon={Undo2} title={t('fe.chx.reply')} onClick={()=>{setReplyTo(msgFor.id);setSheet(null);requestAnimationFrame(()=>input.current?.focus({preventScroll:true}));}}/>}
    {msgFor.mine&&msgFor.body&&<Row noChev icon={Copy} title={t('fe.chx.copy')} onClick={()=>void copyMsg()}/>}
    {msgFor.mine&&<Row noChev icon={Eye} title={t('fe.chx.readBy')} sub={msgFor.readBy?.some(r=>r.read)?undefined:t('fe.w7.read.notYet')} onClick={()=>setSheet('readers')}/>}
   </Card>
  </Sheet>}
  {sheet==='copy'&&msgFor&&<Sheet title={t('fe.chx.copyTitle')} onClose={closeSheet}><TextArea readOnly aria-label={t('fe.chx.msgText')} value={msgFor.body}/></Sheet>}
  {sheet==='readers'&&meta&&<Sheet title={t('fe.chx.readBy')} sub={msgFor?t('fe.w7.read.sentAt',{time:time(msgFor.at)}):undefined} onClose={closeSheet}>
   {/* Who read it and when (V21 chatReadInfo): one line per member of the other side — a couple has two, never named. */}
   <Card list>{(msgFor?.readBy?.length?msgFor.readBy:[{read:true,readAt:null,reader:null}]).map((r,i,l)=>{const who=r.reader?nameOf(r.reader):l.length>1?t('fe.w7.read.member',{name:otherName,n:String(i+1)}):otherName;
    return <Row key={i} av={r.reader?<Av name={who} seed={r.reader.id} size="sm" src={r.reader.avatar}/>:<Av name={otherName} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/>}
    title={who}
    sub={r.read?(r.readAt?t('fe.w7.read.at',{when:day(r.readAt)+', '+time(r.readAt)}):t('fe.chx.readState')):t('fe.w7.read.notYet')}/>;})}</Card>
  </Sheet>}

  {sheet==='attach'&&<Sheet title={t('fe.av.attachTitle')} onClose={closeSheet}>
   <Card list>
    <Row noChev icon={ImageIcon} tone="v" title={t('fe.chx.gallery')} sub={t('fe.chx.gallerySub')} onClick={()=>gallery.current?.click()}/>
    <Row noChev icon={Film} title={t('fe.av.video')} sub={t('fe.av.videoSub')} onClick={()=>videoPick.current?.click()}/>
    <Row noChev icon={Camera} title={t('fe.chx.camera')} onClick={()=>camera.current?.click()}/>
   </Card>
  </Sheet>}

  {sheet==='send'&&out&&<Sheet title={out.video?t('fe.av.sendVideo'):t('fe.chx.sendTitle')} onClose={()=>{if(sheetBusy)return;dropOut(out);closeSheet();}}
   foot={<Btn icon={SendHorizontal} onClick={sendPhoto} busy={sheetBusy} disabled={sheetBusy}>{t('fe.chx.send')}</Btn>}>
   <div className="cm-prev"><img src={out.preview} alt=""/>{out.video&&<VideoBadge durationMs={out.video.durationMs}/>}</div>
   <Group title={t('fe.chx.howView')} foot={<>{t('fe.chx.modeSub.'+(out.mode==='normal'||out.mode==='once'?out.mode:'timer'))}{out.mode!=='normal'?' · '+t('fe.chx.ephNote'):''}</>}><Card>
    <SelectRow<Mode> solo label={t('fe.chx.howView')} value={out.mode} disabled={sheetBusy} onChange={v=>{setSheetErr('');setOut({...out,mode:v});}}
     options={MODES.map(m=>[m,t('fe.chx.mode.'+m)] as const)}/>
   </Card></Group>
   <Note>{t('fe.chx.shotNote')}</Note>
   {sheetAlert}
  </Sheet>}

  {sheet==='menu'&&meta&&<Sheet title={otherName} lead={<Av name={otherName} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/>} onClose={closeSheet}>
   <Card list>
    <Row icon={User} title={t('fe.chx.profile')} onClick={()=>navigate('/n/people/'+meta.other.id)}/>
    <Row icon={Sparkles} tone="l" title={t('fe.chx.shared')} onClick={()=>navigate('/n/people/'+meta.other.id+'/compat')}/>
    {grants.byMe&&<Row noChev icon={Lock} tone="v" title={t('fe.chx.revoke')} sub={t('fe.chx.revokeSub')} onClick={()=>{if(!sheetBusy)void revoke();}}/>}
   </Card>
   <Card list className="mt12">
    <ToggleRow title={t('fe.chx.mute')} sub={t('fe.chx.muteSub')} on={meta.muted} onClick={()=>{if(!sheetBusy)void toggleMute();}}/>
    <Row noChev icon={meta.archived?ArchiveRestore:Archive} title={meta.archived?t('fe.chx.unarchive'):t('fe.chx.archive')} sub={t('fe.chx.archiveSub')} onClick={()=>{if(!sheetBusy)void toggleArchive();}}/>
   </Card>
   <Card list className="mt12">
    {!ended&&<Row noChev icon={X} danger title={t('fe.chx.end')} sub={t('fe.chx.endSub')} onClick={()=>{setSheetErr('');setSheet('end');}}/>}
    <Row noChev icon={Flag} danger title={t('fe.chx.report')} onClick={openReport}/>
    <Row noChev icon={Ban} danger title={t('fe.chx.block')} onClick={()=>{setSheetErr('');setSheet('block');}}/>
   </Card>
   {sheetAlert}
  </Sheet>}

  {sheet==='end'&&meta&&<Sheet title={t('fe.chx.endTitle')} lead={<span className="ico l"><X/></span>} onClose={closeSheet}
   foot={<><Btn kind="danger" onClick={()=>void endConn()} busy={sheetBusy} disabled={sheetBusy}>{t('fe.chx.end')}</Btn><Btn kind="soft" onClick={closeSheet}>{t('fe.chx.cancel')}</Btn></>}>
   <p className="lead">{fill(t('fe.chx.endLead'))}</p>
   <Card className="flat">
    {(['endFact1','endFact2','endFact3'] as const).map(k=><div key={k} className="fact"><i className="g"><Check/></i><span>{t('fe.chx.'+k)}</span></div>)}
    <div className="fact"><i className="v"><Info/></i><span>{t('fe.chx.endFact4')}</span></div>
   </Card>
   {grants.byMe&&<Card list className="mt12"><ToggleRow title={t('fe.chx.ecRevoke')} sub={t('fe.chx.ecRevokeSub')} on={ecRevoke} onClick={()=>setEcRevoke(v=>!v)}/></Card>}
   <Note className="mt12">{t('fe.chx.endNote')}</Note>
   {sheetAlert}
  </Sheet>}

  {sheet==='report'&&meta&&<Sheet title={t('fe.chx.report')} onClose={closeSheet}
   foot={<Btn kind="danger" onClick={sendReport} busy={sheetBusy} disabled={sheetBusy}>{t('fe.chx.reportSend')}</Btn>}>
   {theirs.length?<Group bare title={t('fe.chx.reportPick')} foot={t('fe.chx.reportPickNote')}><Card>
    {theirs.map(m=>{const on=rp.sel.includes(m.id);
     return <CheckBox key={m.id} on={on} onChange={()=>setRp(r=>({...r,sel:on?r.sel.filter(x=>x!==m.id):r.sel.length>=20?r.sel:[...r.sel,m.id]}))}>
      {m.body||(m.media?mediaWord(m):'')}<Text as="div" size="cap" tone="mute">{day(m.at)} · {time(m.at)}</Text></CheckBox>;})}
   </Card></Group>
   :<Note>{t('fe.chx.reportNoMsgs')}</Note>}
   <Group bare title={t('fe.chx.reason')}>
    <RadioList label={t('fe.chx.reason')} value={rp.why} onChange={k=>setRp(r=>({...r,why:k}))} options={REASONS.map(k=>[k,t('fe.chx.reason.'+k)] as const)}/>
   </Group>
   <div className="mt16"><Field id="chat-report-details" label={<>{t('fe.chx.details')}<i>{t('fe.chx.optional')}</i></>}>
    <TextArea id="chat-report-details" rows={3} maxLength={softMax('reportDetails')} invalid={!!textError(t,'reportDetails',rp.details)} value={rp.details} onChange={e=>setRp(r=>({...r,details:e.target.value}))}/></Field></div>
   <Card list><ToggleRow title={t('fe.chx.alsoBlock')} sub={t('fe.chx.alsoBlockSub')} on={rp.block} onClick={()=>setRp(r=>({...r,block:!r.block}))}/></Card>
   {sheetAlert}
  </Sheet>}

  {sheet==='block'&&meta&&<Sheet title={fill(t('fe.chx.blockTitle'))} lead={<span className="ico l"><Ban/></span>} onClose={closeSheet}
   foot={<><Btn kind="danger" onClick={()=>void block()} busy={sheetBusy} disabled={sheetBusy}>{t('fe.chx.block')}</Btn><Btn kind="soft" onClick={closeSheet}>{t('fe.chx.cancel')}</Btn></>}>
   <p className="lead">{t('fe.chx.blockText')}</p>
   {sheetAlert}
  </Sheet>}
 </>;
}
