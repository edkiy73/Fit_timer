import {Fragment,useCallback,useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Archive,ArchiveRestore,Ban,Camera,Check,ChevronDown,ChevronLeft,CircleAlert,Clock,Copy,Ellipsis,Eye,EyeOff,Film,Flag,Image as ImageIcon,Inbox,Info,Lock,LockOpen,MessageCircle,Plus,Search,SendHorizontal,Sparkles,Undo2,User,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {ActingAv,Actions,Alert,ChatList,ChatPane,ChatPick,ChatRow,CoupleTag,NewMatch,NewMatches,Av,Bar,Btn,Card,Check as CheckBox,Chip,Chips,Empty,Field,FilePick,Group,IconBtn,Layer,Note,PersonBar,Pill,RadioList,Row,SearchInput,SectionLabel,SelectRow,Sheet,Skel,Spacer,Text,TextArea,ToggleRow,Typing,VideoBadge,VideoPlayer,View,type Voice,VoiceBubble,VoiceRecorder} from './kit';
import {VIDEO_TYPES} from './kit/media';
import {Uploader,type SendPhoto,type SendVideo,type Uploaded} from './kit/Uploader';
import {useSendPhoto,useSendVideo,useSendVoice} from './media-upload';
import {AgeCheckLink,useAgeResume} from './age-check';
import {useFe,useRealtime,useTypingSignal} from './session';
import {ReportSheet} from './report';
import {useToast} from './toast';
import {limitCounter,overMax,softMax,textError} from './kit/validate';
import {BellButton,SegN} from './inbox';

/** Slice G (V21 H01, H02, H05) with the prototype's markup. A conversation comes with a mutual like or, since the owner's
 * decision of 29.10.2026, with a message request: «Написать» without a chat opens this screen as a request composer
 * (`/n/chats/new/:to`), the recipient finds it in «Запросы» and answers, hides or reports it (server rules).
 * New messages and receipts arrive on a realtime «chat» signal (S2 §8); a slow poll stays as the fallback. */
const media=z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough();
// Where the two know each other from (server: requestContext).
const ctxItem=z.object({kind:z.string(),name:z.string().optional(),title:z.string().optional(),startsAt:z.string().optional()}).passthrough();
type Ctx=z.infer<typeof ctxItem>;
// A request to this side: its sender waits (`renewAt`: when one more may go), its recipient decides.
const reqView=z.object({role:z.enum(['sender','recipient']),renewAt:z.string().optional(),context:z.array(ctxItem).optional(),at:z.string().nullable().optional()}).nullable().optional();
type Req=NonNullable<z.infer<typeof reqView>>;
const chat=z.object({request:reqView,origin:z.string().optional(),id:z.uuid(),state:z.string(),side:z.object({id:z.uuid(),kind:z.enum(['person','couple'])}),newMatch:z.boolean(),
 other:z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),avatar:media.nullable()}),
 unread:z.number(),muted:z.boolean(),archived:z.boolean().optional(),last:z.object({body:z.string(),media:z.boolean(),mode:z.string(),mine:z.boolean(),kind:z.string().nullable().optional()}).nullable(),at:z.string()});
type Chat=z.infer<typeof chat>;
const list=z.object({ok:z.literal(true),items:z.array(chat),requests:z.array(chat).optional()});
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
const msgs=z.object({ok:z.literal(true),state:z.string(),items:z.array(msg),otherRead:z.number(),lastSeq:z.number(),typingTag:z.string().optional(),request:reqView});
const withRes=z.object({ok:z.literal(true),conversationId:z.uuid().nullable(),canRequest:z.boolean().optional(),rule:z.string().optional(),answers:z.boolean().optional(),
 context:z.array(ctxItem).optional(),left:z.number().optional(),max:z.number().optional()}).passthrough();
const profileRes=z.object({ok:z.literal(true),profile:z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),avatar:media.nullable()}).passthrough()});
const requestRes=z.object({ok:z.literal(true),conversationId:z.uuid().optional(),state:z.string().optional(),pending:z.object({approvalId:z.uuid()}).optional()}).passthrough();
const ok=z.object({ok:z.literal(true)}).passthrough();
const opened=z.object({ok:z.literal(true),media:z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough().nullable(),until:z.string().nullable().optional(),gone:z.boolean().optional(),startBy:z.string().optional()}).passthrough();
/** A disappearing clip began to play: the timer (or the closed single view) is now real. */
const startedRes=z.object({ok:z.literal(true),started:z.boolean(),until:z.string().nullable().optional(),gone:z.boolean().optional()}).passthrough();
const grantList=z.object({ok:z.literal(true),items:z.array(z.object({profile:z.object({id:z.uuid()}).passthrough()}).passthrough())});

const nameOf=(o:{name?:string|null,handle?:string|null})=>o.name||(o.handle?'@'+o.handle:'?');
type T=(k:string,v?:Record<string,string>)=>string;
/** A request's sender as its recipient sees it: a couple shows as «Пара …». */
const senderName=(o:{kind?:string,name?:string|null,handle?:string|null},t:T)=>o.kind==='couple'?t('fe.rq.couple',{name:nameOf(o)}):nameOf(o);
/** «Участник сообщества «…» · Идёт на «…» 19.11 · Твой подписчик» — or «Пока не знакомы». */
function contextLine(ctx:Ctx[]|undefined,t:T,locale:string,us:boolean){
 const parts=(ctx??[]).map(c=>c.kind==='follows'?t(us?'fe.rq.ctx.followsUs':'fe.rq.ctx.follows')
  :c.kind==='community'?t('fe.rq.ctx.community',{name:c.name??''})
  :c.kind==='event'?t('fe.rq.ctx.event',{title:c.title??'',date:c.startsAt?new Date(c.startsAt).toLocaleDateString(locale==='en'?'en-GB':'ru',{day:'2-digit',month:'2-digit'}):''}).trim():'').filter(Boolean);
 return parts.length?parts.join(' · '):t('fe.rq.ctx.none');
}
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
/** The last line of a chat in a list: the message, «Фото», «Голосовое»… or why there is none. */
const previewOf=(c:Chat,t:T)=>c.state==='ended'?t('fe.chx.endedRow'):!c.last?t('fe.chx.sayFirst'):c.last.media&&!c.last.body?(c.last.mode!=='normal'?t('fe.chats.ephemeral'):c.last.kind==='audio'?t('fe.av.voice'):c.last.kind==='video'?t('fe.av.video'):t('fe.chats.photo')):c.last.body;
/** The list read last: the desktop list next to a conversation draws it at once while it asks again. */
let lastList:{items:Chat[],requests:Chat[]}|null=null;
const WIDE='(min-width:1100px)';
/** Desktop, where chats are a list and a conversation side by side (kit `ChatPane` / `ChatPick`). */
function useWide(){
 const [w,setW]=useState(()=>typeof matchMedia==='function'&&matchMedia(WIDE).matches);
 useEffect(()=>{if(typeof matchMedia!=='function')return;const m=matchMedia(WIDE);const on=()=>setW(m.matches);m.addEventListener('change',on);return ()=>m.removeEventListener('change',on);},[]);
 return w;
}
/** The chats list beside an open conversation on desktop. */
function ChatsSide({current}:{current:string}){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [data,setData]=useState(lastList);
 const load=useCallback(()=>{call('chats.list',{filter:'all',archived:false},list,{asAccount:true}).then(r=>{lastList={items:r.items,requests:r.requests??[]};setData(lastList);}).catch(()=>{});},[call]);
 useEffect(()=>{load();},[load]);
 useRealtime(['chat','notify'],load);
 return <ChatPane title={t('fe.nav.chats')}>
  {data===null?<Skel kind="list" rows={6}/>:<>
   {data.requests.length>0&&<Card list><Row icon={Inbox} tone="v" title={t('fe.rq.folder')} badge={data.requests.length} onClick={()=>navigate('/n/chats/requests')}/></Card>}
   <ChatList>{data.items.map(c=><ChatRow key={c.id} on={c.id===current} av={<Av name={nameOf(c.other)} seed={c.other.id} size="lg" src={c.other.avatar?.src?.thumb}/>} name={nameOf(c.other)}
    tag={c.side.kind==='couple'&&<CoupleTag>{t('fe.chx.coupleChat')}</CoupleTag>} line={previewOf(c,t)} time={ago(c.at,locale)} unread={c.id===current?0:c.unread} ended={c.state==='ended'}
    onClick={()=>navigate('/n/chats/'+c.id,{replace:true})}/>)}</ChatList>
  </>}
 </ChatPane>;
}
export function ChatsTab(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const couple=useCouple();
 const [params]=useSearchParams();const archived=params.get('archived')==='1';
 useScreenTag(archived?'H05':'H01');
 const [kind,setKind]=useState<'all'|'me'|'couple'>('all');const [items,setItems]=useState<Chat[]|null>(null);const [error,setError]=useState<unknown>(null);
 // «Запросы» (message requests to my profiles, not answered yet): a folder at the top with their count.
 const [requests,setRequests]=useState<Chat[]>([]);
 const [searching,setSearching]=useState(false);const [q,setQ]=useState('');const qRef=useRef<HTMLInputElement>(null);
 // One list for every split: the counters on «Личные» / «Чаты пары» come from the same rows.
 const load=useCallback(()=>{setError(null);call('chats.list',{filter:'all',archived},list,{asAccount:true}).then(r=>{setItems(r.items);setRequests(r.requests??[]);if(!archived)lastList={items:r.items,requests:r.requests??[]};}).catch(setError);},[call,archived]);
 useEffect(()=>{setItems(null);},[archived]);
 useEffect(()=>{load();const id=setInterval(load,30000);return ()=>clearInterval(id);},[load]);
 useRealtime(['chat','notify'],load);
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
 const preview=(c:Chat)=>previewOf(c,t);const wide=useWide();
 const row=(c:Chat)=><ChatRow key={c.id} av={<Av name={nameOf(c.other)} seed={c.other.id} size="lg" src={c.other.avatar?.src?.thumb}/>} name={nameOf(c.other)}
  tag={c.side.kind==='couple'&&<CoupleTag>{t('fe.chx.coupleChat')}</CoupleTag>} line={preview(c)} time={ago(c.at,locale)} unread={c.unread} ended={c.state==='ended'} onClick={()=>navigate('/n/chats/'+c.id)}/>;
 const toggleSearch=()=>{setSearching(s=>!s);setQ('');};

 if(archived)return <>
  <Bar title={t('fe.chx.archiveTitle')} back="/n/chats" small/>
  <View className="nodock" refresh={load}>
   {error&&!items?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<Skel kind="list"/>
    :rows.length?<ChatList>{rows.map(row)}</ChatList>:<Empty icon={Archive} title={t('fe.chx.archiveEmpty')}/>}
  </View>
 </>;
 return <>
  <Bar title={t('fe.nav.chats')}>
   <IconBtn icon={Search} label={t('fe.chx.search')} aria-pressed={searching} onClick={toggleSearch}/>
   <IconBtn icon={Archive} label={t('fe.chx.archiveTitle')} onClick={()=>navigate('/n/chats?archived=1')}/>
   <BellButton/>
  </Bar>
  <View refresh={load}>
   {couple&&<SegN value={kind} onChange={setKind} options={[{id:'all',label:t('fe.chats.all')},{id:'me',label:t('fe.chats.personal'),n:unreadFor('me')},{id:'couple',label:t('fe.chats.couple'),n:unreadFor('couple')}]}/>}
   {couple&&kind==='couple'&&<Note>{t('fe.chx.coupleNote',{name:couple.name})}</Note>}
   {requests.length>0&&<Card list><Row icon={Inbox} tone="v" title={t('fe.rq.folder')} sub={t('fe.rq.folderSub')} badge={requests.length} onClick={()=>navigate('/n/chats/requests')}/></Card>}
   {searching&&<div className="chat-q"><SearchInput ref={qRef} label={t('fe.chx.search')} placeholder={t('fe.chx.searchPh')} value={q} onChange={e=>setQ(e.target.value)}/>
    <IconBtn icon={X} kind="ghost" size="sm" label={t('fe.chx.searchClose')} onClick={toggleSearch}/></div>}
   {error&&!items?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<Skel kind="list" rows={4}/>
    :<>
     {fresh.length>0&&<div><SectionLabel>{t('fe.chats.newMatches')}</SectionLabel>
      <NewMatches>{fresh.map(c=><NewMatch key={c.id} av={<Av name={nameOf(c.other)} seed={c.other.id} src={c.other.avatar?.src?.thumb}/>} name={nameOf(c.other)}
       us={c.side.kind==='couple'?t('fe.chx.coupleChatSr'):undefined} onClick={()=>navigate('/n/chats/'+c.id)}/>)}</NewMatches></div>}
     {rows.length>0&&<ChatList>{rows.map(row)}</ChatList>}
     {!rows.length&&!fresh.length&&(needle?<Empty icon={Search} title={t('fe.chx.notFound',{q:q.trim()})}><Btn kind="text" auto onClick={()=>setQ('')}>{t('fe.chx.clear')}</Btn></Empty>
      :<Empty icon={MessageCircle} title={t('fe.chx.noChats')} text={t('fe.chx.noChatsText')}/>)}
    </>}
  </View>
  {wide&&(items?.length??0)>0&&<ChatPick><Empty compact icon={MessageCircle} title={t('fe.chx.pick')}/></ChatPick>}
 </>;
}

/* ================= «Запросы» (message requests, owner 29.10.2026) ================= */
/** Requests to the account's profiles nobody answered yet: who, where they know each other from, the first message.
 * Opening one reads it without telling its sender; the answer is given in the conversation. */
export function RequestsScreen(){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 useScreenTag('H01');
 const [items,setItems]=useState<Chat[]|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);call('chats.list',{filter:'all'},list,{asAccount:true}).then(r=>setItems(r.requests??[])).catch(setError);},[call]);
 useEffect(()=>{load();const id=setInterval(load,30000);return ()=>clearInterval(id);},[load]);
 useRealtime(['chat','notify'],load);
 const preview=(c:Chat)=>!c.last?'':c.last.media&&!c.last.body?t('fe.chats.photo'):c.last.body;
 return <>
  <Bar title={t('fe.rq.title')} back="/n/chats" small/>
  <View className="nodock" refresh={load}>
   {error&&!items?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :items===null?<Skel kind="list" rows={3}/>
    :items.length?<ChatList>{items.map(c=><ChatRow key={c.id} av={<Av name={nameOf(c.other)} seed={c.other.id} size="lg" src={c.other.avatar?.src?.thumb}/>} name={senderName(c.other,t)}
      tag={c.side.kind==='couple'&&<CoupleTag>{t('fe.chx.coupleChat')}</CoupleTag>} line={preview(c)} note={contextLine(c.request?.context,t,locale,c.side.kind==='couple')}
      time={ago(c.at,locale)} onClick={()=>navigate('/n/chats/'+c.id)}/>)}</ChatList>
    :<Empty icon={Inbox} title={t('fe.rq.empty')} text={t('fe.rq.emptyText')}/>}
  </View>
 </>;
}

/* ================= shared sheet bits ================= */
/** `openViewer()` for one chat photo: optional label («Один просмотр…») and the viewer's handle as a watermark. */
function Viewer({src,video,label,wm,onPlaying,onClose}:{src:string,/** A clip: it plays over its poster `src`. */ video?:string|undefined,label?:string|undefined,wm?:string|undefined,/** The clip really began to play. */ onPlaying?:(()=>void)|undefined,onClose:()=>void}){
 const {t}=useI18n();const [on,setOn]=useState(false);const close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const r=requestAnimationFrame(()=>{setOn(true);close.current?.focus({preventScroll:true});});return ()=>cancelAnimationFrame(r);},[]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};addEventListener('keydown',k);return ()=>removeEventListener('keydown',k);},[onClose]);
 return <Layer><div className={'viewer'+(on?' on':'')} role="dialog" aria-modal="true" aria-label={t('fe.chx.viewer')}>
  <div className="vw-track"><figure>{video?<VideoPlayer src={video} poster={src} fill autoPlay onPlaying={onPlaying}/>:<img src={src} alt="" draggable={false}/>}{wm&&<div className="vw-wm" aria-hidden="true">{Array.from({length:18},(_,i)=><span key={i}>{wm}</span>)}</div>}</figure></div>
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
/** A photo or clip on its way: uploaded by the kit Uploader (prepared on the device), so a retry after review only sends
 * the message. `preview` is the photo / the clip's poster; `durationMs` marks a clip. */
type Outgoing={preview:string,mode:Mode,assetId:string,opId:string,pending?:boolean,video?:{durationMs:number}|undefined};
/** A text on its way (the prototype's optimistic bubble with «Отправляется» / «Не отправлено · Повторить»). */
type Pend={key:string,body:string,replyTo?:string,opId:string,at:string,status:'sending'|'failed'};
type SheetKind='attach'|'menu'|'end'|'report'|'block'|'msg'|'readers'|'copy';
/** The message box stops growing at this height (px) and scrolls. */
const GROW=120;

/* ================= H02 conversation ================= */
/** An unsent message is kept per conversation while the app is open (tab switch, back, another chat): it is in memory and in
 * sessionStorage, and goes away when the message is sent or the box is emptied. */
const chatDrafts=new Map<string,string>();
function readChatDraft(key:string){
 const m=chatDrafts.get(key);if(m!==undefined)return m;
 try{return sessionStorage.getItem('fe.chatdraft.'+key)??'';}catch{return '';}
}
function writeChatDraft(key:string,text:string){
 if(text)chatDrafts.set(key,text);else chatDrafts.delete(key);
 try{if(text)sessionStorage.setItem('fe.chatdraft.'+key,text);else sessionStorage.removeItem('fe.chatdraft.'+key);}catch{/* private mode */}
}

/** `/n/chats/:id` — a conversation; `/n/chats/new/:to` — «Написать» someone without a chat yet: the same screen as a
 * request composer (one first message, text and / or one photo). Keyed, so a sent request opens as a fresh screen. */
export function ChatScreen(){
 const {id='',to=''}=useParams();
 return <ChatView key={id||'new:'+to} id={id} to={to}/>;
}

/** The draft of a request: whether it may go out, why not, where they know each other from, how many are left today. */
type Draft={canRequest:boolean,rule?:string|undefined,context:Ctx[],left?:number|undefined,max?:number|undefined};

function ChatView({id,to}:{id:string,to:string}){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();const wide=useWide();
 useScreenTag('H02');
 const [draft,setDraft]=useState<Draft|null>(null);const [req,setReq]=useState<Req|null>(null);const [reqBusy,setReqBusy]=useState('');
 const [meta,setMeta]=useState<Chat|null>(null);const [items,setItems]=useState<Msg[]|null>(null);const [state,setState]=useState('active');const [otherRead,setOtherRead]=useState(0);const [tag,setTag]=useState<string|null>(null);
 const [error,setError]=useState<unknown>(null);const [text,setText]=useState(()=>readChatDraft(id||'new:'+to));const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 useEffect(()=>{writeChatDraft(id||'new:'+to,text);},[id,to,text]);
 const [pend,setPend]=useState<Pend[]>([]);const [tries,setTries]=useState(0);const [replyTo,setReplyTo]=useState<string|null>(null);
 const [open,setOpen]=useState<Record<string,string>>({});
 // The «down» button sits above the input bar (`--ctah`); the bar grows with a reply quote or a long message.
 const bar=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const el=bar.current,m=document.querySelector<HTMLElement>('.fe-v21 main.main');if(!el||!m)return;
  const ro=new ResizeObserver(()=>m.style.setProperty('--ctah',el.offsetHeight+'px'));ro.observe(el);
  return ()=>{ro.disconnect();m.style.removeProperty('--ctah');};},[state,items===null]);
 const [eph,setEph]=useState<Record<string,{state:'open'|'done',until?:number}>>({});
 const [viewer,setViewer]=useState<{src:string,video?:string|undefined,label?:string|undefined,wm?:string|undefined,onPlaying?:(()=>void)|undefined}|null>(null);
 // A covered clip opened by a tap plays in its bubble (the photo goes to the viewer).
 const [openVid,setOpenVid]=useState<Record<string,{file:string,poster?:string|undefined}>>({});
 // A voice message on its way (an optimistic bubble), and the ones this account has just played.
 const [voiceOut,setVoiceOut]=useState<{v:Voice,status:'sending'|'failed'}|null>(null);const [heard,setHeard]=useState<Record<string,true>>({});
 const videoPick=useRef<HTMLInputElement>(null);
 const [sheet,setSheet]=useState<SheetKind|null>(null);const [sheetErr,setSheetErr]=useState('');const [sheetBusy,setSheetBusy]=useState(false);
 const [msgFor,setMsgFor]=useState<Msg|null>(null);
 const [out,setOut]=useState<Outgoing|null>(null);const outRef=useRef<Outgoing|null>(null);outRef.current=out;
 const [rpSel,setRpSel]=useState<string[]>([]);
 const [grants,setGrants]=useState<{byMe:boolean,withMe:boolean}>({byMe:false,withMe:false});const [ecRevoke,setEcRevoke]=useState(true);
 const [near,setNear]=useState(true);const [fresh,setFresh]=useState(0);const [,tick]=useState(0);
 const viewRef=useRef<HTMLDivElement>(null);const last=useRef(0);const input=useRef<HTMLTextAreaElement>(null);
 const gallery=useRef<HTMLInputElement>(null);const camera=useRef<HTMLInputElement>(null);
 const stick=useRef(true);const nearRef=useRef(true);const seen=useRef(0);
 const profileId=meta?.side.id;
 // Media goes through the kit Uploader (owner, 28.10.2026: the same preview, crop, trim and compression as everywhere):
 // the view rule is chosen in it before anything is sent (it is fixed at upload).
 const [picked,setPicked]=useState<File[]|null>(null);const [mode,setMode]=useState<Mode>('normal');
 const rule=mode==='normal'?{}:mode==='once'?{viewRule:'once'}:{viewRule:'timer',viewSeconds:60};
 const sendChatPhoto=useSendPhoto('chat',rule,profileId);const sendChatVideo=useSendVideo('chat',rule,profileId);const sendVoice=useSendVoice(profileId);
 useEffect(()=>{
  if(to){
   // «Написать» without a chat: their chat after all (opened elsewhere meanwhile), or the request composer.
   if(!acting)return;
   Promise.all([call('chat.with',{profileId:to},withRes),call('profile.get',{profileId:to},profileRes)]).then(([w,p])=>{
    if(w.conversationId){navigate('/n/chats/'+w.conversationId,{replace:true});return;}
    setDraft({canRequest:!!w.canRequest,rule:w.rule,context:w.context??[],left:w.left,max:w.max});
    setMeta({id:'',state:'active',side:{id:acting.id,kind:acting.kind},newMatch:false,other:{id:p.profile.id,kind:p.profile.kind,handle:p.profile.handle,name:p.profile.name,avatar:p.profile.avatar},
     unread:0,muted:false,last:null,at:new Date().toISOString(),request:null});
    setItems([]);
   }).catch(setError);
   return;
  }
  // An archived conversation is opened from «Архив» too, so both lists are asked; a request to me from «Запросы».
  Promise.all([call('chats.list',{filter:'all'},list,{asAccount:true}),call('chats.list',{filter:'all',archived:true},list,{asAccount:true})])
   .then(([a,b])=>{const c=[...a.items,...(a.requests??[]),...b.items].find(x=>x.id===id);if(c){setMeta(c);setState(c.state);setReq(c.request??null);}else setError(new FeError('not_found',404));}).catch(setError);
 },[call,id,to,tries,acting,navigate]);
 const pull=useCallback(async(initial:boolean)=>{
  if(!meta||!id)return;
  const r=await call('chat.messages',initial?{conversationId:id}:{conversationId:id,afterSeq:last.current},msgs,{profileId:meta.side.id});
  setState(r.state);setOtherRead(r.otherRead);if(r.typingTag)setTag(r.typingTag);setReq(r.request??null);
  // A refresh after an ephemeral view also needs the states of older messages: the initial pull replaces the list.
  if(initial)setItems(r.items);
  else if(r.items.length)setItems(prev=>{const p=prev??[];const seenIds=new Set(p.map(m=>m.id));return [...p,...r.items.filter(m=>!seenIds.has(m.id))].sort((a,b)=>a.seq-b.seq);});
  else setItems(prev=>prev??[]);
  if(r.items.length){
   last.current=Math.max(last.current,...r.items.map(m=>m.seq));
   // A request to me is read without telling its sender (the server keeps it unread until I answer).
   if(r.request?.role!=='recipient')call('chat.read',{conversationId:id,upToSeq:last.current},ok,{profileId:meta.side.id}).catch(()=>{});
  }
 },[call,id,meta]);
 useEffect(()=>{if(!meta||!id)return;pull(true).catch(setError);const iv=setInterval(()=>{pull(false).catch(()=>{});},30000);return ()=>clearInterval(iv);},[meta,pull,id]);
 // The signal names no conversation (S2 §8): any «chat» signal asks this one for what is new after the last seq.
 useRealtime('chat',()=>{pull(false).catch(()=>{});setTyping(false);});
 // «печатает…» (owner, 28.10): the other side's typing signal shows a line under the messages for ~5 s; mine goes out
 // at most every 4 s while I type. Nothing is stored anywhere.
 const [typing,setTyping]=useState(false);const typingTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const lastTyping=useRef(0);
 useTypingSignal(tag,()=>{setTyping(true);clearTimeout(typingTimer.current);typingTimer.current=setTimeout(()=>setTyping(false),5000);});
 useEffect(()=>()=>clearTimeout(typingTimer.current),[]);
 const typed=()=>{if(!meta||!id||req||state!=='active'||Date.now()-lastTyping.current<4000)return;lastTyping.current=Date.now();
  call('chat.typing',{conversationId:id},ok,{profileId:meta.side.id}).catch(()=>{});};
 // Private access between the two sides: the pills above the chat and «Отозвать мой доступ» in the menu (V11 UX-16).
 const loadGrants=useCallback(()=>{
  if(!meta||!id)return;const other=meta.other.id;const opts={profileId:meta.side.id};
  Promise.all([call('access.lists',{tab:'byme'},grantList,opts),call('access.lists',{tab:'withme'},grantList,opts)])
   .then(([a,b])=>setGrants({byMe:a.items.some(x=>x.profile.id===other),withMe:b.items.some(x=>x.profile.id===other)})).catch(()=>{});
 },[call,meta]);
 useEffect(()=>{loadGrants();},[loadGrants]);
 // «С чего начать» (V21 ice): questions about interests both sides show publicly, before the two general ones.
 const [starters,setStarters]=useState<string[]>([]);
 const empty=items!==null&&items.length===0&&state==='active';
 useEffect(()=>{if(!meta||!empty||!id)return;let live=true;
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
 /* ---- message requests: the first message goes with chat.request (also one more after a month without an answer) ---- */
 const canRenew=req?.role==='sender'&&!!req.renewAt&&Date.parse(req.renewAt)<=Date.now();
 const asRequest=!!draft||canRenew;
 const reqOp=useRef(newOpId());
 const ruleText=(rule:string|undefined)=>{
  if(rule==='requests_day'){const max=draft?.max??10;return t(max<10?'fe.rq.no.requests_dayLow':'fe.rq.no.requests_day',{max:String(max)});}
  if(rule==='request_pending')return t('fe.rq.waitText',{name:meta?nameOf(meta.other):''});
  const k='fe.rq.no.'+(rule??'other');const m=t(k,{name:meta?nameOf(meta.other):''});return m===k?t('fe.rq.no.other'):m;
 };
 const requestError=(e:unknown)=>e instanceof FeError&&e.rule?ruleText(e.rule):feErrorMessage(e,t);
 const sendRequest=async(body:string,assetId?:string)=>{
  if(!meta||reqBusy)return;setReqBusy('send');setFailure('');
  try{
   const r=await call('chat.request',{opId:reqOp.current,profileId:meta.other.id,body,...(assetId?{assetId}:{})},requestRes,{profileId:meta.side.id});
   reqOp.current=newOpId();setText('');if(input.current)input.current.style.height='';
   // A couple whose partner approves first contacts: it goes once the partner agrees (Q01 «Ждёт подтверждения»).
   if(r.pending){toast(t('fe.ca.waitPartner'),{type:'ok'});navigate('/n/chats',{replace:true});return;}
   if(r.state==='request')toast(t(meta.side.kind==='couple'?'fe.rq.sentUs':'fe.rq.sent'),{type:'ok'});
   stick.current=true;
   if(r.conversationId&&r.conversationId!==id)navigate('/n/chats/'+r.conversationId,{replace:true});else await pull(false).catch(()=>{});
  }catch(e){reqOp.current=newOpId();setFailure(requestError(e));}
  finally{setReqBusy('');}
 };
 const send=()=>{
  const body=text.trim();if(!body||!meta)return;
  // Kit validation layer: the server's rule for a message (length, characters, lines, long runs) before it leaves.
  const bad=textError(t,'chatMessage',body);if(bad){toast(bad,{type:'err'});return;}
  if(asRequest){void sendRequest(body);return;}
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
   const wm=acting?.handle?'@'+acting.handle:undefined;
   if(r.startBy&&video){
    // A disappearing clip: nothing is used up until it really plays (a slow network must not burn the view); the first
    // `playing` tells the server, which then starts the timer / closes the single view.
    let told=false;
    const started=()=>{if(told)return;told=true;
     call('chat.mediaStarted',{opId:newOpId(),messageId:m.id},startedRes,{profileId:meta.side.id}).then(s=>{
      if(s.gone){setEph(e=>({...e,[m.id]:{state:'done'}}));setViewer(null);return;}
      const u=s.until?Date.parse(s.until):undefined;
      setEph(e=>({...e,[m.id]:once?{state:'done'}:{state:'open',...(u?{until:u}:{})}}));
      if(!once&&u)setViewer(v=>v&&{...v,label:t('fe.chx.viewerLeft',{left:left(u)})});
     }).catch(()=>{told=false;});};
    setViewer({src,video,onPlaying:started,wm,...(once?{label:t('fe.chx.viewerOnce')}:{})});return;
   }
   setEph(e=>({...e,[m.id]:once?{state:'done'}:{state:'open',...(until?{until}:{})}}));
   setViewer({src,video,label:once?t('fe.chx.viewerOnce'):until?t('fe.chx.viewerLeft',{left:left(until)}):undefined,wm});
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

 /* ---- photos and clips: kit Uploader (prepare on the device → upload) → chat.sendMedia ---- */
 const pick=(files:File[])=>{
  if(gallery.current)gallery.current.value='';if(camera.current)camera.current.value='';if(videoPick.current)videoPick.current.value='';
  if(!files.length)return;setSheetErr('');setSheet(null);setMode('normal');setPicked(files.slice(0,1));
 };
 const photoError=(e:unknown)=>e instanceof FeError?(e.code==='rule_violation'&&e.rule==='age_required'?t('fe.chx.ageRequired'):feErrorMessage(e,t)):e instanceof Error&&e.message==='upload'?(outRef.current?.video?t('fe.av.videoFailed'):t('fe.chx.uploadFailed')):feErrorMessage(e,t);
 // The Uploader shows an error's message on the row: a readable one (and the age link under the list).
 const readable=async<T,>(f:()=>Promise<T>)=>{try{setSheetErr('');return await f();}catch(e){if(e instanceof Error&&e.message==='upload')throw e;const m=photoError(e);setSheetErr(m);throw new Error(m);}};
 const sendPhotoUp:SendPhoto=(blob,on)=>readable(()=>sendChatPhoto(blob,on));
 const sendVideoUp:SendVideo=(v,on)=>readable(()=>sendChatVideo(v,on));
 const dropOut=(o:Outgoing|null)=>{
  if(!o)return;URL.revokeObjectURL(o.preview);setOut(null);
  // The uploaded file is not needed any more; best effort.
  if(profileId)call('media.remove',{opId:newOpId(),assetId:o.assetId},ok,{profileId}).catch(()=>{});
 };
 /** One attempt to post the uploaded media; resolves to 'sent' or 'pending' (waits for review), throws other errors. */
 const deliver=useCallback(async(o:Outgoing):Promise<'sent'|'pending'>=>{
  if(!profileId)throw new FeError('unavailable');
  // «Не отправлять» may be tapped while an attempt is on its way: its answer must not bring the photo back.
  const live=()=>outRef.current?.preview===o.preview;
  try{await call('chat.sendMedia',{opId:o.opId,conversationId:id,assetId:o.assetId,mode:o.mode},ok,{profileId});}
  catch(e){if(e instanceof FeError&&e.code==='conflict'&&e.rule==='pending'){if(live())setOut({...o,pending:true});return 'pending';}throw e;}
  if(live()){URL.revokeObjectURL(o.preview);setOut(null);}
  return 'sent';
 },[call,id,profileId]);
 const uploaded=async(got:Uploaded[])=>{
  const g=got[0];setPicked(null);if(!g)return;
  // A request's photo goes with the typed text as its one first message.
  if(asRequest){if(g.file)URL.revokeObjectURL(g.file);URL.revokeObjectURL(g.url);await sendRequest(text.trim(),g.id);return;}
  const o:Outgoing={preview:g.url,mode,assetId:g.id,opId:newOpId(),...(g.kind==='video'?{video:{durationMs:g.durationMs??0}}:{})};
  if(g.file)URL.revokeObjectURL(g.file);
  setOut(o);outRef.current=o;setFailure('');stick.current=true;
  try{if(await deliver(o)==='sent')await pull(false);}
  catch(e){setFailure(photoError(e));}
 };
 /* ---- voice messages: record → upload (purpose voice) → chat.sendMedia; an optimistic bubble meanwhile ---- */
 const deliverVoice=async(v:Voice)=>{
  if(!profileId)return;setVoiceOut({v,status:'sending'});stick.current=true;
  try{const assetId=await sendVoice(v);await call('chat.sendMedia',{opId:newOpId(),conversationId:id,assetId,mode:'normal'},ok,{profileId});
   await pull(false).catch(()=>{});setVoiceOut(null);}
  catch(e){setVoiceOut({v,status:'failed'});toast(e instanceof FeError?feErrorMessage(e,t):t('fe.av.voiceNotSent'),{type:'err'});}
 };
 const voiceError=(why:'denied'|'unsupported'|'short'|'failed')=>toast(t(why==='denied'?'fe.av.voiceDenied':why==='unsupported'?'fe.av.voiceUnsupported':why==='short'?'fe.av.voiceShort':'fe.av.voiceFailed'),{type:why==='short'?'warn':'err'});
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
 const toggleMute=()=>meta&&run(async()=>{const on=!meta.muted;await call('chat.mute',{conversationId:id,on},ok,{profileId:meta.side.id});setMeta({...meta,muted:on});toast(on?t(meta.side.kind==='couple'?'fe.chx.mutedUs':'fe.chx.muted'):t('fe.chx.unmuted'));});
 const setArchive=(on:boolean)=>meta?call('chat.archive',{conversationId:id,on},ok,{profileId:meta.side.id}):Promise.resolve(null);
 const toggleArchive=()=>meta&&run(async()=>{const on=!meta.archived;await setArchive(on);setSheet(null);
  if(on){toast(t('fe.chx.archived'),{type:'ok',action:{label:t('fe.chx.undo'),fn:()=>{void setArchive(false).then(()=>dispatchEvent(new Event(RELOAD)),()=>{});}}});navigate('/n/chats');}
  else{setMeta({...meta,archived:false});toast(t('fe.chx.restored'),{type:'ok',action:{label:t('fe.chx.undo'),fn:()=>{void setArchive(true).then(()=>setMeta(m=>m&&{...m,archived:true}));}}});}});
 const revoke=()=>meta&&run(async()=>{await call('access.revoke',{opId:newOpId(),profileId:meta.other.id},ok,{profileId:meta.side.id});setGrants(g=>({...g,byMe:false}));setSheet(null);toast(t(meta.side.kind==='couple'?'fe.chx.revokedUs':'fe.chx.revoked'),{type:'ok'});});
 const endConn=()=>meta&&run(async()=>{await call('match.end',{opId:newOpId(),profileId:meta.other.id},ok,{profileId:meta.side.id});
  if(grants.byMe&&ecRevoke){await call('access.revoke',{opId:newOpId(),profileId:meta.other.id},ok,{profileId:meta.side.id}).catch(()=>{});setGrants(g=>({...g,byMe:false}));}
  setState('ended');setSheet(null);toast(t(meta.side.kind==='couple'?'fe.chx.endDoneUs':'fe.chx.endDone'),{type:'ok'});dropOut(outRef.current);});
 const block=()=>meta&&run(async()=>{await call('block.set',{opId:newOpId(),profileId:meta.other.id,on:true},ok,{profileId:meta.side.id});navigate('/n/chats');});
 const theirs=(items??[]).filter(m=>!m.mine).slice(-20).reverse();
 const openReport=()=>{setRpSel([]);setSheetErr('');setSheet('report');};
 // A chat is reported as its conversation with the selected messages; with nothing of theirs to show, the profile is.
 const reportDone=(blocked:boolean)=>{if(blocked){if(req?.role==='recipient')toast(t('fe.rq.reported'),{type:'ok'});navigate('/n/chats');}else{setSheet(null);toast(t(meta?.side.kind==='couple'?'fe.ca.reported':'fe.chx.reportDone'),{type:'ok'});}};
 /* ---- a request to me: «Ответить» (a normal chat from now on), «Скрыть» (its sender is not told), «Пожаловаться и
    заблокировать» (the report sheet with its messages picked and «Также заблокировать» on) ---- */
 const answerReq=async(answer:'accept'|'hide')=>{
  if(!meta||reqBusy)return;setReqBusy(answer);
  try{await call('chat.requestAnswer',{opId:newOpId(),conversationId:id,answer},ok,{profileId:meta.side.id});
   if(answer==='hide'){toast(t('fe.rq.hidden',{name:otherName}),{type:'ok'});navigate('/n/chats/requests',{replace:true});return;}
   setReq(null);toast(t('fe.rq.answered'),{type:'ok'});requestAnimationFrame(()=>input.current?.focus({preventScroll:true}));}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setReqBusy('');}
 };
 const reportReq=()=>{setRpSel(theirs.map(m=>m.id).slice(0,20));setSheetErr('');setSheet('report');};

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
 // The input shows in a chat, in a request composer that may send, and for a waiting sender once a month passed.
 const canWrite=draft?draft.canRequest:!req||canRenew;
 const sheetAlert=sheetErr?<Alert kind="err" noIcon>{sheetErr}{sheetErr===t('fe.chx.ageRequired')&&<><br/><AgeCheckLink intent={'attach:'+id}/></>}</Alert>:null;
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
   sub={couple?<><CoupleTag>{t('fe.chx.coupleChat')}</CoupleTag>{t('fe.chx.coupleSees')}</>:undefined}>
   <IconBtn icon={Ellipsis} kind="ghost" label={t('fe.chx.menu')} disabled={!meta||!!draft} onClick={()=>{setSheetErr('');setSheet('menu');}}/>
  </PersonBar>
  <div ref={viewRef} className={'view nodock'+(ended||!canWrite?'':' cta1')} onScroll={onScroll}><div className="wrap">
   {meta&&state==='active'&&(grants.byMe||grants.withMe)&&<div className="chat-ctx">
    {grants.byMe&&grants.withMe?<Pill tone="ok" icon={LockOpen} onClick={()=>navigate('/n/people/'+meta.other.id)}>{t('fe.chx.pillBoth')}</Pill>
     :grants.withMe?<Pill tone="ok" icon={LockOpen} onClick={()=>navigate('/n/people/'+meta.other.id)}>{t('fe.chx.pillTheirs')}</Pill>
     :<Pill tone="v" icon={Eye} onClick={()=>navigate('/n/me?layer=priv')}>{t('fe.chx.pillMine')}</Pill>}
   </div>}
   {items===null?<Skel kind="list" rows={4}/>:<>
    <div className="msgs" id="msgs">
     {!draft&&meta?.origin!=='request'&&<div className="msg sys">{t('fe.chx.matchSys')}</div>}
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
     {out&&<div className="msg me has-media sending"><span className="mtile"><img src={out.preview} alt="" draggable={false}/>{out.video&&<VideoBadge durationMs={out.video.durationMs}/>}</span></div>}
     {voiceOut&&<><div className={'msg me has-media '+voiceOut.status}><VoiceBubble durationMs={voiceOut.v.durationMs} peaks={voiceOut.v.peaks} mine/>
      <div className="st"><span aria-label={voiceOut.status==='sending'?t('fe.chx.stSending'):t('fe.chx.stFailed')}>{voiceOut.status==='sending'?<Clock/>:<CircleAlert/>}</span></div></div>
      {voiceOut.status==='failed'&&!ended&&<><button type="button" className="msg-retry" onClick={()=>void deliverVoice(voiceOut.v)}><Undo2/>{t('fe.chx.retryMsg')}</button>
       <button type="button" className="msg-retry" onClick={()=>setVoiceOut(null)}><X/>{t('fe.chx.drop')}</button></>}</>}
     {typing&&!ended&&<Typing>{t('fe.w7.typing',{name:otherName})}</Typing>}
    </div>
    {draft&&meta&&(draft.canRequest
     ?<Alert kind="info" icon={MessageCircle}><b>{t('fe.rq.draft',{name:otherName})}</b>{t('fe.rq.draftOne')}
      {draft.left!==undefined&&draft.max!==undefined&&draft.left<=3?' '+t('fe.rq.left',{n:String(draft.left),max:String(draft.max)}):''}</Alert>
     :<Alert kind="warn"><b>{t('fe.rq.no.title')}</b>{ruleText(draft.rule)}</Alert>)}
    {req?.role==='sender'&&!ended&&<Alert kind="info" icon={Clock}><b>{t('fe.rq.wait')}</b>{canRenew?t('fe.rq.renew'):t('fe.rq.waitText',{name:otherName})}</Alert>}
    {req?.role==='recipient'&&!ended&&meta&&<Alert kind="info" icon={MessageCircle} action={<><Actions>
      <Btn busy={reqBusy==='accept'} disabled={!!reqBusy} onClick={()=>void answerReq('accept')}>{t('fe.rq.answer')}</Btn>
      <Btn kind="soft" busy={reqBusy==='hide'} disabled={!!reqBusy} onClick={()=>void answerReq('hide')}>{t('fe.rq.hide')}</Btn></Actions>
      <Btn kind="text" size="sm" auto icon={Flag} disabled={!!reqBusy} onClick={reportReq}>{t('fe.rq.reportBlock')}</Btn></>}>
     <b>{t('fe.rq.in',{name:senderName(meta.other,t)})}</b>{contextLine(req.context,t,locale,meta.side.kind==='couple')}. {t('fe.rq.inText',{name:otherName})}</Alert>}
    {!ended&&canWrite&&!req&&all.length===0&&pend.length===0&&<><SectionLabel>{t('fe.chx.starters')}</SectionLabel><Chips className="ice">
     {[...starters.slice(0,2).map(n=>t('fe.w7.ice.topic',{topic:n})),t('fe.chx.ice1'),t('fe.chx.ice2')].map(s=><Chip key={s} onClick={()=>{setText(s);requestAnimationFrame(()=>{if(input.current){grow(input.current);input.current.focus();}});}}>{s}</Chip>)}
    </Chips></>}
    {ended&&<Alert kind="info" icon={Ban}><b>{t('fe.chx.endedTitle')}</b>{t(couple?'fe.chx.endedTextUs':'fe.chx.endedText')}</Alert>}
    {out?.pending&&<Alert kind="info" icon={Clock} action={<Actions><Btn kind="soft" size="sm" busy={busy} disabled={busy} onClick={()=>void retryPending(false)}>{t('fe.chx.retry')}</Btn>
     <Btn kind="text" size="sm" onClick={()=>dropOut(out)}>{t('fe.chx.drop')}</Btn></Actions>}><b>{out.video?t('fe.av.videoPending'):t('fe.chx.pending')}</b></Alert>}
    {failure&&<Alert kind="err" noIcon action={out&&!out.pending?<Actions><Btn kind="soft" size="sm" busy={busy} disabled={busy} onClick={()=>void retryPending(false)}>{t('fe.chx.retry')}</Btn>
     <Btn kind="text" size="sm" onClick={()=>{dropOut(out);setFailure('');}}>{t('fe.chx.drop')}</Btn></Actions>:undefined}>{failure}{failure===t('fe.chx.ageRequired')&&<><br/><AgeCheckLink intent={'attach:'+id}/></>}</Alert>}
   </>}
  </div></div>
  <button type="button" className={'chat-down'+(ended?' low':'')+(!near?' on':'')} aria-label={t('fe.chx.toLatest')} onClick={toBottom}><ChevronDown/>{fresh>0&&<em>{fresh>99?'99+':fresh}</em>}</button>
  {!ended&&canWrite&&<div className="inputbar" ref={bar}>
   {limitCounter('chatMessage',text)}
   {replyTo&&quoteOf(replyTo)&&<div className="reply-target chat-reply">{quote(replyTo,true)}<IconBtn icon={X} size="sm" label={t('fe.chx.cancelReply')} onClick={()=>{setReplyTo(null);input.current?.focus({preventScroll:true});}}/></div>}
   <IconBtn icon={Plus} kind="ghost" label={t('fe.chx.attach')} disabled={!meta||!!out?.pending||!!reqBusy} onClick={()=>{setSheetErr('');setSheet('attach');}}/>
   {couple&&acting?.kind==='couple'&&<ActingAv p={acting} size="xs"/>}
   <TextArea ref={input} bare grow={GROW} rows={1} maxLength={softMax('chatMessage')} value={text} onChange={e=>{setText(e.target.value);if(e.target.value.trim())typed();}}
    placeholder={couple?t('fe.chx.messagePhCouple'):t('fe.chx.messagePh')} aria-label={couple?t('fe.chx.messagePhCouple'):t('fe.chx.message')} title={t('fe.chx.enterHint')} enterKeyHint="enter"
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!coarse&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
   {/* An empty box offers a voice message instead of «Отправить» (hold to record). */}
   {/* A request has no voice message: its one first message is text and / or a photo. */}
   {text.trim()||!meta||asRequest?<IconBtn icon={SendHorizontal} kind="send" onClick={send} disabled={!meta||!text.trim()||overMax('chatMessage',text)||!!reqBusy} label={couple?t('fe.fd.sendUs'):t('fe.feed.send')}/>
    :<VoiceRecorder onSend={v=>void deliverVoice(v)} onError={voiceError} disabled={voiceOut?.status==='sending'}/>}
  </div>}
  {wide&&<ChatsSide current={id}/>}
  <FilePick ref={gallery} accept={'image/*,'+VIDEO_TYPES.join(',')} onFiles={f=>pick([...f])}/>
  <FilePick ref={camera} accept="image/*" capture="environment" onFiles={f=>pick([...f])}/>
  <FilePick ref={videoPick} accept={VIDEO_TYPES.join(',')} onFiles={f=>pick([...f])}/>
  {viewer&&<Viewer src={viewer.src} video={viewer.video} label={viewer.label} wm={viewer.wm} onPlaying={viewer.onPlaying} onClose={()=>{setViewer(null);pull(true).catch(()=>{});}}/>}

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

  {/* Preview before sending (owner, 28.10.2026): format and crop for photos, trim + frame for clips, compression on
     the device, the view rule — the kit Uploader, as everywhere; «Отправить» uploads and posts it. */}
  {picked&&<Uploader files={picked} max={1} aspects={['orig','4:5','1:1','16:9']} send={sendPhotoUp} sendVideo={sendVideoUp} title={t('fe.av.attachTitle')}
   doneLabel={t('fe.chx.send')} onDone={got=>void uploaded(got)} onClose={()=>{setPicked(null);setSheetErr('');}}>
   {/* A request's photo is an ordinary one: disappearing photos need a chat both answered. */}
   {!asRequest&&<Group title={t('fe.chx.howView')} foot={<>{t('fe.chx.modeSub.'+(mode==='normal'||mode==='once'?mode:'timer'))}{mode!=='normal'?' · '+t('fe.chx.ephNote'):''}</>}><Card>
    <SelectRow<Mode> solo label={t('fe.chx.howView')} value={mode} onChange={v=>setMode(v)} options={MODES.map(m=>[m,t('fe.chx.mode.'+m)] as const)}/>
   </Card></Group>}
   <Note>{t('fe.chx.shotNote')}</Note>
   {sheetAlert}
  </Uploader>}

  {sheet==='menu'&&meta&&<Sheet title={otherName} lead={<Av name={otherName} seed={meta.other.id} size="sm" src={meta.other.avatar?.src?.thumb}/>} onClose={closeSheet}>
   <Card list>
    <Row icon={User} title={t('fe.chx.profile')} onClick={()=>navigate('/n/people/'+meta.other.id)}/>
    <Row icon={Sparkles} tone="l" title={t('fe.chx.shared')} onClick={()=>navigate('/n/people/'+meta.other.id+'/compat')}/>
    {grants.byMe&&<Row noChev icon={Lock} tone="v" title={t(couple?'fe.chx.revokeUs':'fe.chx.revoke')} sub={t('fe.chx.revokeSub')} onClick={()=>{if(!sheetBusy)void revoke();}}/>}
   </Card>
   <Card list>
    <ToggleRow title={t('fe.chx.mute')} sub={t('fe.chx.muteSub')} on={meta.muted} onClick={()=>{if(!sheetBusy)void toggleMute();}}/>
    <Row noChev icon={meta.archived?ArchiveRestore:Archive} title={meta.archived?t('fe.chx.unarchive'):t('fe.chx.archive')} sub={t('fe.chx.archiveSub')} onClick={()=>{if(!sheetBusy)void toggleArchive();}}/>
   </Card>
   <Card list>
    {!ended&&<Row noChev icon={X} danger title={t('fe.chx.end')} sub={t('fe.chx.endSub')} onClick={()=>{setSheetErr('');setSheet('end');}}/>}
    <Row noChev icon={Flag} danger title={t('fe.chx.report')} onClick={openReport}/>
    <Row noChev icon={Ban} danger title={t('fe.chx.block')} onClick={()=>{setSheetErr('');setSheet('block');}}/>
   </Card>
   {sheetAlert}
  </Sheet>}

  {sheet==='end'&&meta&&<Sheet title={t('fe.chx.endTitle')} lead={<span className="ico l"><X/></span>} onClose={closeSheet}
   foot={<><Btn kind="danger" onClick={()=>void endConn()} busy={sheetBusy} disabled={sheetBusy}>{t('fe.chx.end')}</Btn><Btn kind="soft" onClick={closeSheet}>{t('fe.chx.cancel')}</Btn></>}>
   <p className="lead">{fill(t(couple?'fe.chx.endLeadUs':'fe.chx.endLead'))}</p>
   <Card className="flat">
    {(['endFact1','endFact2','endFact3'] as const).map(k=><div key={k} className="fact"><i className="g"><Check/></i><span>{t('fe.chx.'+k+(couple&&k==='endFact2'?'Us':''))}</span></div>)}
    <div className="fact"><i className="v"><Info/></i><span>{t('fe.chx.endFact4')}</span></div>
   </Card>
   {grants.byMe&&<Card list><ToggleRow title={t(couple?'fe.chx.ecRevokeUs':'fe.chx.ecRevoke')} sub={t('fe.chx.ecRevokeSub')} on={ecRevoke} onClick={()=>setEcRevoke(v=>!v)}/></Card>}
   <Spacer/><Note>{t(couple?'fe.chx.endNoteUs':'fe.chx.endNote')}</Note>
   {sheetAlert}
  </Sheet>}

  {sheet==='report'&&meta&&<ReportSheet block profileId={meta.side.id} onClose={closeSheet} onDone={reportDone}
   targetType={theirs.length?'conversation':'profile'} targetId={theirs.length?id:meta.other.id} extra={theirs.length?{messageIds:rpSel}:undefined}
   check={()=>theirs.length&&!rpSel.length?t('fe.chx.needMsg'):''}
   before={theirs.length?<Group bare title={t('fe.chx.reportPick')} foot={t('fe.chx.reportPickNote')}><Card>
    {theirs.map(m=>{const on=rpSel.includes(m.id);
     return <CheckBox key={m.id} on={on} onChange={()=>setRpSel(r=>on?r.filter(x=>x!==m.id):r.length>=20?r:[...r,m.id])}>
      {m.body||(m.media?mediaWord(m):'')}<Text as="div" size="cap" tone="mute">{day(m.at)} · {time(m.at)}</Text></CheckBox>;})}
   </Card></Group>:<Note>{t('fe.chx.reportNoMsgs')}</Note>}/>}

  {sheet==='block'&&meta&&<Sheet title={fill(t('fe.chx.blockTitle'))} lead={<span className="ico l"><Ban/></span>} onClose={closeSheet}
   foot={<><Btn kind="danger" onClick={()=>void block()} busy={sheetBusy} disabled={sheetBusy}>{t(couple?'fe.ca.block':'fe.chx.block')}</Btn><Btn kind="soft" onClick={closeSheet}>{t('fe.chx.cancel')}</Btn></>}>
   <p className="lead">{t(couple?'fe.ca.blockText':'fe.chx.blockText')}</p>
   {sheetAlert}
  </Sheet>}
 </>;
}
