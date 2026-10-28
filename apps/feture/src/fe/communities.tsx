import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,ChartColumn,Bell,BellOff,Bookmark,BookmarkCheck,Calendar,CalendarPlus,Check,ChevronLeft,Clock,Ellipsis,Eye,ExternalLink,FileText,Flag,Globe,Image as ImageIcon,Link as LinkIcon,Lock,Map as MapIcon,MapPin,MessageCircle,Plus,Search,Settings,Share,SlidersHorizontal,Ticket,TriangleAlert,Users,Video,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {ActingAv,Alert,Announcement,Ask,Av,Bar,Btn,Card,Chip,Chips,ChoiceChips,CommunityHead,CoverBar,Discussion,Empty,EventHero,EventTile,Group,IconBtn,LinkBtn,Note,Pill,Row,Rsvp,SectionLabel,Seg,Sheet,Skel,Spacer,StatusCard,Text,ToggleRow,Veil} from './kit';
import {useFe} from './session';
import {when} from './feed';
import {BellButton} from './inbox';
import {useToast} from './toast';
import {placeName,useCatalog} from './create-community';
import {CommPlate,NamedPlate,ReportSheet,appUrl,copyLink,fill,okRes,pl} from './comm-kit';
import {faceFields} from './faces';
import {CommunityHostEntry,DiscussionHostSheet,EventApplicationLines,JoinSheet,MembersList,isCommunityHost} from './host';

/** «Сообщества» (V21 C01 catalogue with interests and filters, C03 community page with discussions, events, members
 * and rules, E03 event page) with the prototype's markup. Everything shown comes from the server; details the server
 * does not give (photos of communities, activity lines) are left out rather than made up. */

const media=z.object({src:z.object({thumb:z.string().optional(),card:z.string().optional(),full:z.string().optional()}).passthrough().nullable()}).passthrough();
/** The cover photo URL of a community (signed, public place), or null: then the named plate stands in. */
const coverSrc=(m:z.infer<typeof media>|null|undefined,size:'card'|'full'='card')=>m?.src?(size==='full'?m.src.full??m.src.card:m.src.card??m.src.full)??m.src.thumb??null:null;
const card=z.object({id:z.uuid(),name:z.string(),description:z.string().optional(),cover:media.nullable().optional(),lastTalkAt:z.string().nullable().optional(),nextEventAt:z.string().nullable().optional(),topics:z.array(z.string()),privacy:z.string(),members:z.number(),joined:z.boolean(),plate:z.string().nullable().optional(),place_id:z.string().nullable().optional()});
type Card=z.infer<typeof card>;
const catalog=z.object({ok:z.literal(true),items:z.array(card),next:z.string().nullable()});
const prof=z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),...faceFields}).passthrough();
const community=z.object({id:z.uuid(),name:z.string(),description:z.string(),topics:z.array(z.string()),privacy:z.string(),rules:z.array(z.string()),members:z.number(),
 plate:z.string().nullable().optional(),cover:media.nullable().optional(),placeId:z.string().nullable().optional(),hosts:z.array(prof.extend({role:z.string()})).optional(),
 me:z.object({role:z.string(),state:z.string(),muted:z.boolean().optional(),readOnly:z.boolean().optional()}).passthrough().nullable(),request:z.object({id:z.uuid(),at:z.string().nullable().optional()}).nullable(),joinQuestion:z.string().nullable(),
 declined:z.object({until:z.string()}).nullable().optional(),waiting:z.object({id:z.uuid()}).nullable().optional(),
 pendingRequests:z.number().optional(),state:z.string().optional()}).passthrough();
export type Community=z.infer<typeof community>;
const commRes=z.object({ok:z.literal(true),community});
const disc=z.object({id:z.uuid(),title:z.string().nullable(),excerpt:z.string(),pinned:z.boolean(),published_at:z.string().nullable(),replies:z.number(),owner_profile_id:z.string().nullable().optional(),popularExcluded:z.boolean().optional()});
const discRes=z.object({ok:z.literal(true),locked:z.boolean(),items:z.array(disc)});
const memItem=prof.extend({role:z.string(),read_only:z.boolean()});
const memList=z.object({ok:z.literal(true),count:z.number(),items:z.array(memItem).nullable(),next:z.string().nullable().optional()});
const priceSchema=z.object({kind:z.string(),amount:z.number().optional(),currency:z.string().optional(),ticketUrl:z.string().optional()}).passthrough();
const ev=z.object({id:z.uuid(),title:z.string(),kind:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),tz:z.string().nullable().optional(),starts_at:z.string(),ends_at:z.string(),
 price:priceSchema,requires_application:z.boolean(),state:z.string(),plate:z.string().nullable().optional(),place_id:z.string().nullable().optional(),community_id:z.string().nullable().optional()});
type Ev=z.infer<typeof ev>;
/** An event in a list (catalog, «Скоро» in the feed). */
export const eventRow=ev;
const evList=z.object({ok:z.literal(true),items:z.array(ev),next:z.string().nullable()});
const rsvpObj=z.object({status:z.string().nullable().optional(),showInList:z.boolean().nullable().optional(),ticketMarked:z.boolean().nullable().optional()}).passthrough();
const announcement=z.object({id:z.uuid(),body:z.string(),automatic:z.boolean(),created_at:z.string()}).passthrough();
const event=z.object({id:z.uuid(),title:z.string(),kind:z.string(),description:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),tz:z.string(),placeId:z.string().nullable().optional(),
 startsAt:z.string(),endsAt:z.string(),price:priceSchema,requiresApplication:z.boolean(),questions:z.array(z.string()).nullable().optional(),
 requirements:z.string().nullable(),state:z.string(),past:z.boolean(),going:z.number(),interested:z.number(),exactAddress:z.string().nullable(),joinUrl:z.string().nullable(),locked:z.boolean(),
 plate:z.string().nullable().optional(),communityId:z.string().nullable().optional(),cancelReason:z.string().nullable().optional(),
 organizer:prof.nullable().optional(),announcements:z.array(announcement).optional(),
 me:z.object({rsvp:rsvpObj.nullable().optional(),application:z.object({id:z.uuid(),state:z.string(),rev:z.number()}).nullable().optional(),waiting:z.object({id:z.uuid(),kind:z.string()}).passthrough().nullable().optional()}).passthrough()}).passthrough();
export type EventFull=z.infer<typeof event>;
const evRes=z.object({ok:z.literal(true),event});
const mineComm=z.object({ok:z.literal(true),hosting:z.array(z.object({id:z.uuid()}).passthrough()),member:z.array(z.object({id:z.uuid()}).passthrough()),requests:z.array(z.object({community_id:z.uuid()}).passthrough())});
const mineEvRow=z.object({id:z.uuid(),ends_at:z.string(),state:z.string()}).passthrough();
const mineEv=z.object({ok:z.literal(true),going:z.array(mineEvRow),waiting:z.array(mineEvRow),applications:z.array(mineEvRow),interested:z.array(mineEvRow),organizing:z.array(mineEvRow)}).passthrough();
const attList=z.object({ok:z.literal(true),count:z.number(),hidden:z.number(),items:z.array(prof)});
const savedRes=z.object({ok:z.literal(true),items:z.array(z.object({kind:z.string(),target_id:z.string()}))});
const rsvpRes=z.object({ok:z.literal(true),pending:z.unknown().optional()}).passthrough();

const pname=(p:{name?:string|null,handle?:string|null}|null|undefined)=>p?.name||(p?.handle?'@'+p.handle:'?');
const loc=(locale:string)=>locale==='en'?'en-GB':'ru-RU';
export const USER_TZ=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{return 'UTC';}})();
/** In-person events are shown in the venue's time, online ones in the viewer's (V21 evTz). */
export const evTz=(e:{format:string,tz?:string|null|undefined})=>e.format==='online'?USER_TZ:(e.tz||USER_TZ);
export const inTz=(iso:string,tz:string,locale:string,o:Intl.DateTimeFormatOptions)=>{try{return new Date(iso).toLocaleString(loc(locale),{...o,timeZone:tz});}catch{return new Date(iso).toLocaleString(loc(locale),o);}};
const timeOf=(iso:string,tz:string,locale:string)=>inTz(iso,tz,locale,{hour:'2-digit',minute:'2-digit'});
const CUR:Record<string,string>={EUR:'€',USD:'$',GBP:'£',RUB:'₽',CHF:'CHF'};
export function priceText(p:{kind:string,amount?:number|undefined,currency?:string|undefined},t:(k:string)=>string,locale:string){
 if(p.kind==='free'||p.amount==null)return t('fe.ev.free');
 const s=CUR[p.currency??'']??p.currency??'';
 return locale==='en'&&s!=='CHF'?`${s}${p.amount}`:`${p.amount} ${s}`;
}

/* ---------------- C01: the tab ---------------- */

export function CommunitiesTab(){
 const {t}=useI18n();const navigate=useNavigate();const [sp,setSp]=useSearchParams();
 const tab=sp.get('sub')==='events'?'events':'discover';
 return <>
  <Bar title={t('fe.nav.communities')}>
   <IconBtn icon={Search} label={t('fe.cm.search')} onClick={()=>navigate('/n/search'+(tab==='events'?'?scope=events':'?scope=groups'))}/><BellButton/>
  </Bar>
  <div className="view"><div className="wrap">
   <Seg small={false} value={tab} onChange={v=>setSp(v==='events'?{sub:'events'}:{},{replace:true})} options={[{id:'discover',label:t('fe.comm.catalog')},{id:'events',label:t('fe.comm.events')}]}/>
   {tab==='discover'?<Catalog/>:<EventList/>}
  </div></div>
 </>;
}

/** «Мои сообщества / Мои события» with how many there are, and the «+» that creates one (V21 collectionShortcut). */
function MyShortcut({kind,count}:{kind:'communities'|'events',count:number}){
 const {t}=useI18n();const navigate=useNavigate();const {acting}=useFe();const couple=acting?.kind==='couple';
 const k=kind==='communities'?'fe.cc':'fe.ce';const Icon=kind==='communities'?Users:Calendar;
 return <div className="myev">
  <button type="button" className="myev-main" onClick={()=>navigate('/n/me?layer=mine&part='+kind)}><span className="ico g"><Icon/></span><span className="tx"><b>{t(k+(couple?'.mineCouple':'.mine'))}{count?<em>{count}</em>:null}</b></span></button>
  <IconBtn icon={Plus} kind="add" label={t(k+'.create')} onClick={()=>navigate(kind==='communities'?'/n/communities/new':'/n/events/new')}/>
 </div>;
}

/** What the acting profile has to do with communities: hosted, joined, waiting (community.mine). */
function useMyCommunities(){
 const {call,acting}=useFe();const [m,setM]=useState<z.infer<typeof mineComm>|null>(null);
 useEffect(()=>{setM(null);call('community.mine',{},mineComm).then(setM).catch(()=>{});},[call,acting?.id]);
 return useMemo(()=>{
  const hosting=new Set(m?.hosting.map(x=>x.id)??[]);const member=new Set(m?.member.map(x=>x.id)??[]);const pending=new Set(m?.requests.map(x=>x.community_id)??[]);
  return {hosting,member,pending,count:new Set([...hosting,...member,...pending]).size};
 },[m]);
}

type CommFilter={topics:string[],privacy:'all'|'open'|'closed',online:boolean};
const CF0:CommFilter={topics:[],privacy:'all',online:false};
const passes=(c:Card,f:CommFilter)=>(!f.topics.length||f.topics.some(x=>c.topics.includes(x)))&&(f.privacy==='all'||c.privacy===f.privacy)&&(!f.online||!c.place_id);

function Catalog(){
 const {call}=useFe();const {t,locale}=useI18n();const cat=useCatalog();const mine=useMyCommunities();
 const [all,setAll]=useState<Card[]|null>(null);const [error,setError]=useState<unknown>(null);
 const [f,setF]=useState<CommFilter>(CF0);const [sheet,setSheet]=useState(false);
 // The whole catalogue (it is small) so that the interest chips, the filter counts and the list agree.
 const load=useCallback(async()=>{
  setError(null);setAll(null);
  try{const out:Card[]=[];let cursor:string|null=null;for(let i=0;i<10;i++){const r:z.infer<typeof catalog>=await call('community.catalog',cursor?{cursor}:{},catalog);out.push(...r.items);cursor=r.next;if(!cursor)break;}setAll(out);}
  catch(e){setError(e);}
 },[call]);
 useEffect(()=>{void load();},[load]);
 const tname=(id:string)=>{const x=cat?.topics.find(v=>v.id===id);return x?(locale==='en'?x.en:x.ru):id;};
 const used=useMemo(()=>[...new Set((all??[]).flatMap(c=>c.topics))],[all]);
 const items=(all??[]).filter(c=>passes(c,f));
 const badge=(f.privacy!=='all'?1:0)+(f.online?1:0)+f.topics.filter(x=>!used.includes(x)).length;
 const toggle=(v:string)=>setF(x=>({...x,topics:!v?[]:x.topics.includes(v)?x.topics.filter(y=>y!==v):[...x.topics,v]}));
 return <>
  <MyShortcut kind="communities" count={mine.count}/>
  <div className="filterline"><Chips scroll>
   <Chip filter on={!f.topics.length} onClick={()=>toggle('')}>{t('fe.comm.allTopics')}</Chip>
   {used.map(x=><Chip key={x} filter on={f.topics.includes(x)} onClick={()=>toggle(x)}>{tname(x)}</Chip>)}
  </Chips><Chip filter lit={!!badge} badge={badge||undefined} popup icon={SlidersHorizontal} onClick={()=>setSheet(true)}>{t('fe.cm.filters')}</Chip></div>
  {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>void load()}>{t('fe.retry')}</Btn></Empty>
   :all===null?<Skel kind="card" rows={4}/>
   :!items.length?<Empty icon={Users} title={t('fe.cm.nothing')} text={t('fe.cm.nothingText')}>{(f.topics.length>0||f.privacy!=='all'||f.online)&&<Btn kind="soft" onClick={()=>setF(CF0)}>{t('fe.cm.resetFilters')}</Btn>}</Empty>
   :items.map(c=><CommCard key={c.id} c={c} tname={tname} place={c.place_id?placeName(cat?.places.find(p=>p.id===c.place_id)??{ru:null,en:null},locale):''} mine={mine}/>)}
  {sheet&&all&&<CommFilterSheet all={all} used={used} tname={tname} value={f} onApply={v=>{setF(v);setSheet(false);}} onClose={()=>setSheet(false)}/>}
 </>;
}

/** The community picture: its cover photo, or the plate with the group icon (V21 commAv / evCover). */
function CommCover({cover,k,size,hero}:{cover?:z.infer<typeof media>|null|undefined,k:string|null|undefined,size?:'card'|'full',hero?:boolean}){
 const src=coverSrc(cover,size);
 return src?<img className="evimg" src={src} alt="" draggable={false}/>:hero?<NamedPlate k={k}/>:<CommPlate k={k}/>;
}
/** Markdown marks off, for one-line previews (V21 mdPlain). */
const plainText=(s:string)=>s.replace(/[*_~`#>]+/g,'').replace(/\s+/g,' ').trim();
/** V21 F.rel: «только что», «5 мин назад», «вчера», «3 дня назад», then the date. */
function relDay(iso:string,locale:string){
 const d=(Date.now()-Date.parse(iso))/1000;const en=locale==='en';
 if(d<60)return en?'just now':'только что';
 if(d<3600){const m=Math.round(d/60);return en?`${m} min ago`:`${m} мин назад`;}
 if(d<86400){const h=Math.round(d/3600);return en?`${h} h ago`:`${h} ч назад`;}
 const days=Math.round(d/86400);if(days===1)return en?'yesterday':'вчера';
 if(days<7)return en?`${days} days ago`:`${pl(days,'день|дня|дней',locale)} назад`;
 return shortDate(iso,locale);
}
const shortDate=(iso:string,locale:string)=>new Intl.DateTimeFormat(locale==='en'?'en':'ru',{day:'numeric',month:'short'}).format(new Date(iso)).replace('.','');

function CommCard({c,tname,place,mine}:{c:Card,tname:(id:string)=>string,place:string,mine:ReturnType<typeof useMyCommunities>}){
 const {t,locale}=useI18n();const navigate=useNavigate();const {acting}=useFe();const couple=acting?.kind==='couple';
 const state=mine.hosting.has(c.id)?<Pill tone="ok" icon={Settings}>{t(couple?'fe.cm.youHostCouple':'fe.cm.youHost')}</Pill>
  :c.joined||mine.member.has(c.id)?<Pill tone="ok" icon={Check}>{t(couple?'fe.cm.memberCouple':'fe.comm.member')}</Pill>
  :mine.pending.has(c.id)?<Pill tone="wait">{t('fe.cm.underReview')}</Pill>
  :c.privacy!=='open'?<Pill icon={Lock}>{t('fe.cm.byRequest')}</Pill>:null;
 // V21 commPulse: when people last talked (only where the viewer may read) and the next meeting.
 const pulse=[c.lastTalkAt?fill(t('fe.cm.lastTalk'),{when:relDay(c.lastTalkAt,locale)}):'',c.nextEventAt?fill(t('fe.cm.nextMeet'),{date:shortDate(c.nextEventAt,locale)}):''].filter(Boolean);
 return <button type="button" className="cmc" onClick={()=>navigate('/n/communities/'+c.id)}>
  <div className="cv"><CommCover cover={c.cover} k={c.plate}/></div>
  <div className="tx"><b>{c.name}</b><small>{c.description?plainText(c.description):c.topics.map(x=>'#'+tname(x)).join(' ')}</small>
   <div className="meta"><span>{pl(c.members,t('fe.cm.members'),locale)}</span><span>·</span><span>{place||t('fe.cm.online')}</span>{state&&<> {state}</>}</div>
   {pulse.length>0&&<div className="pulse"><Clock/><span>{pulse.join(' · ')}</span></div>}
  </div>
 </button>;
}

/** «Фильтры сообществ» — interests, joining, where; the button shows how many communities match. */
function CommFilterSheet({all,used,tname,value,onApply,onClose}:{all:Card[],used:string[],tname:(id:string)=>string,value:CommFilter,onApply:(f:CommFilter)=>void,onClose:()=>void}){
 const {t,locale}=useI18n();const [d,setD]=useState<CommFilter>({...value,topics:[...value.topics]});
 const n=all.filter(c=>passes(c,d)).length;
 const clr=(fn:()=>void)=><button type="button" className="fclr" aria-label={t('fe.cm.clear')} onClick={fn}><X/></button>;
 return <Sheet full title={t('fe.cm.filtersTitle')} onClose={onClose} dirty={JSON.stringify(d)!==JSON.stringify(value)} head={<Btn kind="text" auto onClick={()=>setD(CF0)}>{t('fe.cm.reset')}</Btn>}
  foot={n?<Btn onClick={()=>onApply(d)}>{fill(t('fe.cm.showN'),{n:pl(n,t('fe.cm.communities'),locale)})}</Btn>:<Btn kind="soft" disabled aria-disabled="true">{t('fe.cm.nothingMatches')}</Btn>}>
  <section className="fin"><div className="fin-t"><b>{t('fe.cm.interests')}</b><span>{t('fe.cm.pickAny')}</span>{d.topics.length>0&&clr(()=>setD(x=>({...x,topics:[]})))}</div>
   <div className="fin-b"><Chips>{used.map(x=><Chip key={x} on={d.topics.includes(x)} onClick={()=>setD(v=>({...v,topics:v.topics.includes(x)?v.topics.filter(y=>y!==x):[...v.topics,x]}))}>{tname(x)}</Chip>)}</Chips></div></section>
  <section className="fin"><div className="fin-t"><b>{t('fe.cm.joining')}</b>{d.privacy!=='all'&&clr(()=>setD(x=>({...x,privacy:'all'})))}</div>
   <div className="fin-b"><ChoiceChips label={t('fe.cm.joining')} value={d.privacy} onChange={k=>setD(x=>({...x,privacy:k}))} options={(['all','open','closed'] as const).map(k=>[k,t('fe.cm.priv.'+k)] as const)}/></div></section>
  <section className="fin"><div className="fin-t"><b>{t('fe.cm.where')}</b>{d.online&&clr(()=>setD(x=>({...x,online:false})))}</div>
   <div className="fin-b"><ChoiceChips label={t('fe.cm.where')} value={String(d.online) as 'true'|'false'} onChange={k=>setD(x=>({...x,online:k==='true'}))} options={[['false',t('fe.cm.anywhere')],['true',t('fe.cm.onlineOnly')]] as const}/></div></section>
  <p className="grp-n">{t('fe.cm.hiddenNote')}</p>
 </Sheet>;
}

/* ---------------- Events list (C01 «События», C03 «События») ---------------- */

type EvFilter={format:'all'|'offline'|'online',when:'any'|'week'|'weekend'|'month',kinds:string[],price:'any'|'free'|'paid',openOnly:boolean};
const EF0:EvFilter={format:'all',when:'any',kinds:[],price:'any',openOnly:false};
const KINDS=['meetup','workshop','talk','party'] as const;
const evInput=(f:EvFilter,communityId?:string)=>({format:f.format,when:f.when,price:f.price,openOnly:f.openOnly,...(f.kinds.length?{kinds:f.kinds}:{}),...(communityId?{communityId}:{})});

/** My answer to each event (event.mine) — the status pill on cards — and how many upcoming events are mine. */
type MyStatus='organizer'|'going'|'pending'|'interested'|'waiting';
function useMyEvents(){
 const {call,acting}=useFe();const [m,setM]=useState<z.infer<typeof mineEv>|null>(null);
 useEffect(()=>{setM(null);call('event.mine',{},mineEv).then(setM).catch(()=>{});},[call,acting?.id]);
 return useMemo(()=>{
  const st=new Map<string,MyStatus>();const now=Date.now();const up=(r:{ends_at:string})=>Date.parse(r.ends_at)>now;
  m?.interested.forEach(r=>st.set(r.id,'interested'));m?.waiting.forEach(r=>st.set(r.id,'waiting'));m?.applications.forEach(r=>st.set(r.id,'pending'));
  m?.going.forEach(r=>st.set(r.id,'going'));m?.organizing.forEach(r=>st.set(r.id,'organizer'));
  const ids=new Set([...(m?.going??[]),...(m?.waiting??[]),...(m?.applications??[]),...(m?.interested??[]),...(m?.organizing??[])].filter(r=>up(r)&&r.state!=='cancelled').map(r=>r.id));
  return {st,count:ids.size};
 },[m]);
}
function StatusPill({s}:{s:MyStatus|undefined}){
 const {t}=useI18n();const {acting}=useFe();const couple=acting?.kind==='couple';
 if(!s)return null;
 return s==='organizer'?<Pill tone="v">{t(couple?'fe.cm.st.organizerCouple':'fe.cm.st.organizer')}</Pill>
  :s==='going'?<Pill tone="ok">{t('fe.cm.st.going')}</Pill>:s==='pending'?<Pill tone="wait">{t('fe.cm.st.pending')}</Pill>
  :s==='waiting'?<Pill tone="wait" icon={Clock}>{t('fe.cm.st.waiting')}</Pill>:<Pill tone="v">{t('fe.cm.st.interested')}</Pill>;
}

/** `eventCard()` — the big card, or the row (`row`) used for «Ближайшая встреча» and cancelled events. */
export function EventCard({e,row,status,org}:{e:Ev,row?:boolean,status?:MyStatus|undefined,org?:string|undefined}){
 const {t,locale}=useI18n();const navigate=useNavigate();const tz=evTz(e);
 const day=inTz(e.starts_at,tz,locale,{day:'numeric'});const mon=inTz(e.starts_at,tz,locale,{month:'short'}).replace('.','');
 const cancelled=e.state==='cancelled';
 const pill=cancelled?<Pill tone="bad">{t('fe.cm.st.cancelled')}</Pill>:<StatusPill s={status}/>;
 const place=e.format==='online'?t('fe.ev.online'):e.area??t('fe.ev.offline');
 return <EventTile row={row} cover={<NamedPlate k={e.plate} icon={Calendar}/>} day={day} month={mon} place={place} placeIcon={e.format==='online'?Video:MapPin}
  status={row?pill:cancelled||status?pill:undefined} kicker={t('fe.ev.kind.'+e.kind)} title={e.title} time={timeOf(e.starts_at,tz,locale)} {...(row?{org}:{price:priceText(e.price,t,locale)})}
  onClick={()=>navigate('/n/events/'+e.id)}/>;
}

function EventList(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const mine=useMyEvents();
 const [f,setF]=useState<EvFilter>(EF0);const [sheet,setSheet]=useState(false);
 const [items,setItems]=useState<Ev[]|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);setItems(null);call('event.catalog',evInput(f),evList).then(r=>setItems(r.items)).catch(setError);},[call,f]);
 useEffect(()=>{load();},[load]);
 const badge=(f.when!=='any'?1:0)+(f.kinds.length?1:0)+(f.price!=='any'?1:0)+(f.openOnly?1:0);
 const week=Date.now()+7*864e5;const live=(items??[]).filter(e=>e.state!=='cancelled');
 const soon=live.filter(e=>Date.parse(e.starts_at)<week),later=live.filter(e=>Date.parse(e.starts_at)>=week),canc=(items??[]).filter(e=>e.state==='cancelled');
 return <>
  <MyShortcut kind="events" count={mine.count}/>
  <div className="filterline"><Chips scroll>{(['all','offline','online'] as const).map(k=><Chip key={k} filter on={f.format===k} onClick={()=>setF(x=>({...x,format:k}))} {...(k==='online'?{icon:Video}:k==='offline'?{icon:MapPin}:{})}>
   {t('fe.ev.format.'+k)}</Chip>)}</Chips>
   <Chip filter lit={!!badge} badge={badge||undefined} popup icon={SlidersHorizontal} onClick={()=>setSheet(true)}>{t('fe.cm.filters')}</Chip></div>
  {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
   :items===null?<Skel kind="event" rows={2}/>
   :!items.length?<Empty icon={Calendar} title={t('fe.cm.evNothing')} text={t('fe.cm.evNothingText')}>{(f.format!=='all'||badge>0)&&<Btn kind="soft" onClick={()=>setF(EF0)}>{t('fe.cm.resetFilters')}</Btn>}<Btn kind="text" onClick={()=>navigate('/n/events/new')}>{t('fe.ce.create')}</Btn></Empty>
   :<>
    {soon.length>0&&<><SectionLabel>{t('fe.cm.next7')}</SectionLabel><div className="evgrid">{soon.map(e=><EventCard key={e.id} e={e} status={mine.st.get(e.id)}/>)}</div></>}
    {later.length>0&&<><SectionLabel>{t('fe.cm.later')}</SectionLabel><div className="evgrid">{later.map(e=><EventCard key={e.id} e={e} status={mine.st.get(e.id)}/>)}</div></>}
    {canc.length>0&&<><SectionLabel>{t('fe.cm.cancelledSec')}</SectionLabel>{canc.map(e=><EventCard key={e.id} e={e} row/>)}</>}
   </>}
  {sheet&&<EvFilterSheet value={f} onApply={v=>{setF(v);setSheet(false);}} onClose={()=>setSheet(false)}/>}
 </>;
}

/** «Фильтры событий» — format, when, type, price, admission; the button counts what the server finds. */
function EvFilterSheet({value,onApply,onClose}:{value:EvFilter,onApply:(f:EvFilter)=>void,onClose:()=>void}){
 const {call}=useFe();const {t,locale}=useI18n();const [d,setD]=useState<EvFilter>({...value,kinds:[...value.kinds]});const [n,setN]=useState<{n:number,more:boolean}|null>(null);
 useEffect(()=>{let live=true;setN(null);const tm=setTimeout(()=>{call('event.catalog',evInput(d),evList).then(r=>{if(live)setN({n:r.items.length,more:!!r.next});}).catch(()=>{});},250);return ()=>{live=false;clearTimeout(tm);};},[call,d]);
 const clr=(fn:()=>void)=><button type="button" className="fclr" aria-label={t('fe.cm.clear')} onClick={fn}><X/></button>;
 const one=<K extends 'format'|'when'|'price'>(k:K,opts:readonly EvFilter[K][],label:string,lk:string,extra?:ReactNode)=><section className="fin"><div className="fin-t"><b>{label}</b>{d[k]!==opts[0]&&clr(()=>setD(x=>({...x,[k]:opts[0]})))}</div>
  <div className="fin-b"><ChoiceChips label={label} value={d[k]} onChange={o=>setD(x=>({...x,[k]:o}))} options={opts.map(o=>[o,t(lk+o)] as const)}/>{extra}</div></section>;
 return <Sheet full title={t('fe.cm.evFiltersTitle')} onClose={onClose} dirty={JSON.stringify(d)!==JSON.stringify(value)} head={<Btn kind="text" auto onClick={()=>setD(EF0)}>{t('fe.cm.reset')}</Btn>}
  foot={n&&!n.n?<Btn kind="soft" disabled aria-disabled="true">{t('fe.cm.evNoneMatch')}</Btn>:<Btn onClick={()=>onApply(d)}>{n?fill(t('fe.cm.showN'),{n:(n.more?'20+ ':'')+pl(n.n,t('fe.cm.events'),locale).replace(n.more?/^\d+ /:/^$/,'')}):t('fe.cm.applyFilters')}</Btn>}>
  {one('format',['all','offline','online'] as const,t('fe.cm.format'),'fe.ev.format.',<Note className="mt8">{t('fe.cm.cityNote')}</Note>)}
  {one('when',['any','week','weekend','month'] as const,t('fe.cm.when'),'fe.cm.when.')}
  <section className="fin"><div className="fin-t"><b>{t('fe.cm.type')}</b><span>{t('fe.cm.pickAny')}</span>{d.kinds.length>0&&clr(()=>setD(x=>({...x,kinds:[]})))}</div>
   <div className="fin-b"><Chips>{KINDS.map(k=><Chip key={k} on={d.kinds.includes(k)} onClick={()=>setD(x=>({...x,kinds:x.kinds.includes(k)?x.kinds.filter(y=>y!==k):[...x.kinds,k]}))}>{t('fe.ev.kind.'+k)}</Chip>)}</Chips></div></section>
  {one('price',['any','free','paid'] as const,t('fe.cm.price'),'fe.cm.price.')}
  <section className="fin"><div className="fin-t"><b>{t('fe.cm.admission')}</b>{d.openOnly&&clr(()=>setD(x=>({...x,openOnly:false})))}</div>
   <div className="fin-b"><ChoiceChips label={t('fe.cm.admission')} value={String(d.openOnly) as 'true'|'false'} onChange={k=>setD(x=>({...x,openOnly:k==='true'}))} options={[['false',t('fe.cm.admAny')],['true',t('fe.cm.openOnly')]] as const}/></div></section>
 </Sheet>;
}

/* ---------------- C03: the community page ---------------- */

type CTab='disc'|'events'|'members'|'rules';
export function CommunityScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();const cat=useCatalog();
 const [sp,setSp]=useSearchParams();const invite=sp.get('invite')??undefined;
 const tab=((['disc','events','members','rules'] as const).find(x=>x===sp.get('t'))??'disc') as CTab;
 const setTab=(v:CTab)=>{const n=new URLSearchParams(sp);if(v==='disc')n.delete('t');else n.set('t',v);setSp(n,{replace:true});};
 const [c,setC]=useState<Community|null>(null);const [discs,setDiscs]=useState<z.infer<typeof discRes>|null>(null);const [mem,setMem]=useState<z.infer<typeof memList>|null>(null);
 const [evs,setEvs]=useState<Ev[]>([]);const [error,setError]=useState<unknown>(null);
 const [layer,setLayer]=useState<''|'menu'|'join'|'leave'|'withdraw'|'unwait'|'report'>('');const [busy,setBusy]=useState(false);const [hostTools,setHostTools]=useState<z.infer<typeof disc>|null>(null);
 const [reportPost,setReportPost]=useState<string|null>(null);
 const load=useCallback(()=>{setError(null);
  // A hidden community seen through an invite link (or a pending request) shows only its card: its discussions,
  // members and events are for members, so they are not asked for (they would only answer 404).
  call('community.get',{communityId:id,...(invite?{invite}:{})},commRes).then(async a=>{
   const outside=a.community.privacy==='hidden'&&a.community.me?.state!=='active'&&!a.community.state;
   const locked:z.infer<typeof discRes>={ok:true,locked:true,items:[]};
   const [b,m,e]=outside?[locked,null,[] as Ev[]] as const:await Promise.all([
    call('community.discussions',{communityId:id},discRes),
    call('community.members',{communityId:id},memList).catch(()=>null),
    call('event.catalog',{communityId:id},evList).then(r=>r.items.filter(e=>e.state==='published')).catch(()=>[] as Ev[])]);
   setC(a.community);setDiscs(b);setMem(m);setEvs(e);
  }).catch(setError);},[call,id,invite]);
 useEffect(()=>{load();},[load]);
 const couple=acting?.kind==='couple';
 const tname=(x:string)=>{const v=cat?.topics.find(o=>o.id===x);return v?(locale==='en'?v.en:v.ru):x;};
 const member=c?.me?.state==='active';const host=isCommunityHost(c);const owner=member&&c?.me?.role==='owner';
 const place=c?.placeId?placeName(cat?.places.find(p=>p.id===c.placeId)??{ru:null,en:null},locale):'';
 const names=useMemo(()=>new Map((mem?.items??[]).map(m=>[m.id,m])),[mem]);
 const act=async(fn:()=>Promise<unknown>,ok:string)=>{setBusy(true);try{await fn();setLayer('');toast(ok,{type:'ok'});load();}catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(false);}};
 const mute=()=>{if(!c)return;const on=!c.me?.muted;void act(()=>call('community.self',{opId:newOpId(),communityId:c.id,muted:on},okRes),t(on?'fe.cm.muted':'fe.cm.unmuted'));};
 const share=async()=>{setLayer('');const okc=await copyLink(appUrl('/n/communities/'+id));toast(t(okc?'fe.cm.linkCopied':'fe.cm.copyFailed'),{type:okc?'ok':'warn'});};
 const sorted=[...evs].sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));const next=sorted[0];
 // Removed once (a ban): even an open community takes a request now (the server answers the same way).
 const banned=c?.me?.state==='removed';
 const day=(iso:string)=>new Date(iso).toLocaleDateString(loc(locale),{day:'numeric',month:'long'});
 // My request as one block (owner 28.10.2026): the state, when it went and what comes next, «Отозвать» on the right.
 const status=!c||host||member?null
  :c.request?<StatusCard tone="wait" icon={Clock} title={t(couple?'fe.host.join.pendingUs':'fe.host.join.pending')}
   sub={[c.request.at?fill(t('fe.cm.req.sent'),{date:day(c.request.at)}):'',t('fe.cm.req.next')].filter(Boolean).join(' · ')}
   action={<Btn kind="soft" size="sm" auto fit onClick={()=>setLayer('withdraw')}>{t('fe.host.join.withdraw')}</Btn>}/>
  :c.waiting?<StatusCard tone="wait" icon={Users} title={t('fe.host.app.st.waiting')} sub={t('fe.cm.req.partnerSub')}
   action={<Btn kind="soft" size="sm" auto fit onClick={()=>setLayer('unwait')}>{t('fe.host.join.withdraw')}</Btn>}/>
  :c.declined?<StatusCard tone="bad" icon={X} title={t('fe.cm.req.declined')} sub={fill(t('fe.cm.req.declinedSub'),{date:day(c.declined.until)})}/>
  :null;
 return <>
  <CoverBar title={c?.name}>
   {c&&<IconBtn icon={Ellipsis} kind="glass" label={t('fe.cm.more')} onClick={()=>setLayer('menu')}/>}
  </CoverBar>
  <div className="view nodock top0"><div className="wrap">
   {error?<Empty icon={Lock} title={t('fe.cm.unavailable')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!c?<><CommunityHead/><Skel kind="list"/></>
    :<>
     <CommunityHead cover={<CommCover cover={c.cover} k={c.plate} size="full" hero/>} pic={<CommCover cover={c.cover} k={c.plate}/>} name={c.name}
      meta={<><span><Users/><b>{pl(c.members,t('fe.cm.members'),locale)}</b></span>
       <span>{c.privacy==='open'?<Globe/>:<Lock/>}{t('fe.cm.privacyMeta.'+c.privacy)}</span>
       <span>{place?<MapPin/>:<Video/>}{place||t('fe.cm.online')}</span>
       {c.me?.muted&&<span><BellOff/>{t('fe.cm.mutedMeta')}</span>}</>}/>
     {c.state==='in_review'&&<Alert kind="warn" icon={Clock} className="mt12"><b>{t('fe.cm.inReview')}</b>{t(couple?'fe.cm.inReviewTextCouple':'fe.cm.inReviewText')}</Alert>}
     {c.state==='rejected'&&<Alert kind="err" icon={Ban} className="mt12"><b>{t('fe.cm.rejected')}</b>{String((c as {rejectReason?:unknown}).rejectReason??'')}</Alert>}
     <div className="md bio cdesc"><p>{c.description}</p></div>
     <Chips className="mt12">{c.topics.map(x=><Chip key={x} className="tag" onClick={()=>navigate('/n/topics/'+x)}>#{tname(x)}</Chip>)}</Chips>
     {status?<><Spacer size={4}/>{status}</>:<div className="row g8 mt16 cm-act">
      {host?<CommunityHostEntry c={c}/>
       :member?<Pill tone="ok" icon={Check}>{t(couple?'fe.cm.memberCouple':'fe.comm.member')}</Pill>
       :(!c.state||c.state==='published')?<Btn size="md" onClick={()=>setLayer('join')}>{c.privacy!=='open'||banned?t(couple?'fe.host.join.requestCouple':'fe.host.join.request'):t(couple?'fe.host.join.joinCouple':'fe.host.join.join')}</Btn>:null}
     </div>}
     {next&&tab!=='events'&&<Group className="cm-next" title={t('fe.cm.nextMeetup')} action={evs.length>1&&<button type="button" onClick={()=>setTab('events')}>{fill(t('fe.cm.allN'),{n:evs.length})}</button>}><EventCard e={next} row/></Group>}
     <Spacer size={3}/>
     <Seg value={tab} onChange={setTab} options={[{id:'disc',label:t('fe.comm.tab.disc')},{id:'events',label:t('fe.comm.tab.events'),n:evs.length},{id:'members',label:t('fe.cm.tab.members')},{id:'rules',label:t('fe.comm.tab.rules')}]}/>
     {tab==='disc'?(discs?.locked?<Veil tall title={t('fe.cm.discForMembers')} text={c.request?t('fe.cm.discPending'):t('fe.cm.discRequest')}/>:<>
      {member&&!c.me?.readOnly&&<div className="composer c-composer">
       <button type="button" className="cmp-main" onClick={()=>navigate('/n/feed/new?community='+c.id)}>{acting&&<ActingAv p={acting}/>}<span>{t(couple?'fe.cm.topicCouple':'fe.comm.newTopic')}</span></button>
       <IconBtn icon={ImageIcon} kind="ghost" size="sm" label={t('fe.cm.media')} onClick={()=>navigate('/n/feed/new?community='+c.id+'&x=media')}/>
       <IconBtn icon={ChartColumn} kind="ghost" size="sm" label={t('fe.cm.poll')} onClick={()=>navigate('/n/feed/new?community='+c.id+'&x=poll')}/>
       <IconBtn icon={Plus} kind="add" label={t('fe.cm.startDisc')} onClick={()=>navigate('/n/feed/new?community='+c.id)}/>
      </div>}
      {!discs?<Skel kind="list"/>:discs.items.length===0?<Empty icon={MessageCircle} title={t('fe.comm.noDisc')} text={member?t('fe.cm.noDiscMember'):t('fe.cm.noDiscGuest')}/>
       :<Card list>{discs.items.map(d=>{const a=d.owner_profile_id?names.get(d.owner_profile_id):undefined;
        return <Discussion key={d.id} onClick={()=>navigate('/n/feed/post/'+d.id)} pinned={d.pinned?t('fe.comm.pinned'):undefined} title={d.title} excerpt={d.excerpt}
         meta={<>{a&&<><Av name={pname(a)} seed={a.id} size="xs" src={a.avatar}/><span>{pname(a)}</span><span>·</span></>}<span>{when(d.published_at,locale)}</span><span><MessageCircle/>{d.replies}</span></>}
         tools={<IconBtn icon={Ellipsis} kind="ghost" size="sm" aria-haspopup="dialog" label={t(host?'fe.cm.hostTools':'fe.cm.more')} onClick={()=>setHostTools(d)}/>}/>;})}</Card>}
     </>)
     :tab==='events'?(evs.length?<div className="evgrid">{sorted.map(e=><EventCard key={e.id} e={e}/>)}</div>
      :<Empty icon={Calendar} title={t('fe.cm.noEvents')}>{host?<Btn onClick={()=>navigate('/n/events/new?community='+c.id)}>{t('fe.ce.create')}</Btn>
       :<Btn kind="soft" onClick={()=>navigate('/n/communities?sub=events')}>{t('fe.w7.toEvents.btn')}</Btn>}</Empty>)
     :tab==='members'?<MembersList c={c} data={mem} onChange={load}/>
     :<Card><ol className="rules">{c.rules.map((r,i)=><li key={i}>{r}</li>)}</ol></Card>}
    </>}
  </div></div>
  {c&&layer==='menu'&&<Sheet title={c.name} onClose={()=>setLayer('')}><Card list>
   <Row icon={LinkIcon} title={t('fe.cm.copyLink')} noChev onClick={()=>void share()}/>
   {member&&<Row icon={c.me?.muted?Bell:BellOff} title={t(c.me?.muted?'fe.cm.unmute':'fe.cm.mute')} noChev disabled={busy} onClick={mute}/>}
   {member&&!owner&&<Row icon={X} danger title={t('fe.cm.leave')} noChev onClick={()=>setLayer('leave')}/>}
   {!owner&&<Row icon={Flag} danger title={t('fe.cm.report')} noChev onClick={()=>setLayer('report')}/>}
  </Card></Sheet>}
  {c&&layer==='join'&&<JoinSheet c={banned&&c.privacy==='open'?{...c,privacy:'closed',joinQuestion:null}:c} invite={invite} onClose={()=>setLayer('')} onDone={msg=>{setLayer('');toast(msg,{type:'ok'});load();}}/>}
  {c&&layer==='leave'&&<Ask icon={Users} danger title={fill(t(couple?'fe.cm.leaveQUs':'fe.cm.leaveQ'),{name:c.name})} text={t(c.privacy==='open'?'fe.cm.leaveTextOpen':'fe.cm.leaveTextClosed')} ok={t(couple?'fe.cm.leaveUs':'fe.comm.leave')} busy={busy}
   onOk={()=>void act(()=>call('community.leave',{opId:newOpId(),communityId:c.id},okRes),t(couple?'fe.cm.leftUs':'fe.cm.left'))} onCancel={()=>setLayer('')}/>}
  {c&&layer==='withdraw'&&<Ask icon={FileText} danger title={t('fe.host.join.withdrawQ')} ok={t('fe.host.join.withdraw')} busy={busy}
   onOk={()=>void act(()=>call('community.requestWithdraw',{opId:newOpId(),requestId:c.request!.id},okRes),t('fe.host.join.withdrawn'))} onCancel={()=>setLayer('')}/>}
  {c&&layer==='unwait'&&c.waiting&&<Ask icon={FileText} danger title={t('fe.host.join.withdrawQ')} text={t('fe.cm.req.unwaitText')} ok={t('fe.host.join.withdraw')} busy={busy}
   onOk={()=>void act(()=>call('decide.cancel',{opId:newOpId(),approvalId:c.waiting!.id},okRes),t('fe.host.join.withdrawn'))} onCancel={()=>setLayer('')}/>}
  {c&&layer==='report'&&<ReportSheet targetType="community" targetId={c.id} onClose={()=>setLayer('')} onDone={msg=>{setLayer('');toast(msg,{type:'ok'});}}/>}
  {hostTools&&<DiscussionHostSheet d={hostTools} host={host} onClose={()=>setHostTools(null)} onDone={msg=>{setHostTools(null);toast(msg,{type:'ok'});load();}}
   onReport={acting&&hostTools.owner_profile_id!==acting.id?()=>{setReportPost(hostTools.id);setHostTools(null);}:undefined}/>}
  {reportPost&&<ReportSheet targetType="post" targetId={reportPost} onClose={()=>setReportPost(null)} onDone={msg=>{setReportPost(null);toast(msg,{type:'ok'});}}/>}
 </>;
}

/* ---------------- E03: the event page ---------------- */

/** An .ics file for «Добавить в календарь» — the time and, for admitted people, the place or link. */
function downloadIcs(e:EventFull){
 const z2=(iso:string)=>new Date(iso).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const esc=(s:string)=>s.replace(/[\\;,]/g,m=>'\\'+m).replace(/\n/g,'\\n');
 const where=e.joinUrl??e.exactAddress??e.area??'';
 const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FetUre//EN','BEGIN:VEVENT',`UID:${e.id}@feture`,`DTSTAMP:${z2(new Date().toISOString())}`,`DTSTART:${z2(e.startsAt)}`,`DTEND:${z2(e.endsAt)}`,
  `SUMMARY:${esc(e.title)}`,...(where?[`LOCATION:${esc(where)}`]:[]),`URL:${appUrl('/n/events/'+e.id)}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));a.download='event.ics';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

export function EventScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [e,setE]=useState<EventFull|null>(null);const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);
 const [comm,setComm]=useState<{id:string,name:string,plate?:string|null|undefined,cover?:z.infer<typeof media>|null|undefined}|null>(null);const [saved,setSaved]=useState(false);const [faces,setFaces]=useState<z.infer<typeof prof>[]>([]);
 const [layer,setLayer]=useState<''|'menu'|'venue'|'report'|'withdraw'|'unwait'|'ticket'>('');
 const op=useRef(newOpId());
 const load=useCallback(()=>{setError(null);call('event.get',{eventId:id},evRes).then(r=>{setE(r.event);
  const cid=r.event.communityId;if(cid)call('community.get',{communityId:cid},commRes).then(x=>setComm(x.community)).catch(()=>setComm(null));
  Promise.all([call('event.attendees',{eventId:id,kind:'going'},attList).catch(()=>null),call('event.attendees',{eventId:id,kind:'interested'},attList).catch(()=>null)])
   .then(([g,i])=>setFaces([...(g?.items??[]),...(i?.items??[])].slice(0,5)));
 }).catch(setError);},[call,id]);
 useEffect(()=>{load();call('saved.list',{kind:'event'},savedRes).then(r=>setSaved(r.items.some(x=>x.target_id===id))).catch(()=>{});},[load,call,id]);
 const couple=acting?.kind==='couple';
 const orgMe=!!e&&e.organizer?.id===acting?.id;
 const st=e?.me.rsvp?.status??null;
 // A withdrawn (or closed) application is history: the person may apply again.
 const rawApp=e?.me.application??null;const app=rawApp&&['pending','approved','declined'].includes(rawApp.state)?rawApp:null;const waiting=!!e?.me.waiting;
 type Status='interested'|'going'|'not_going';
 /** One event.rsvp call; `msg` overrides the toast, `undo` adds «Отменить» to it. */
 const send=async(input:{status:Status|null,showInList?:boolean,ticketMarked?:boolean},msg?:string,undo?:()=>void)=>{
  if(!e)return false;setBusy(true);const {status,showInList}=input;
  try{const r=await call('event.rsvp',{opId:op.current,eventId:id,...input},rsvpRes);op.current=newOpId();
   toast(r.pending?t('fe.cm.rsvpT.waitsPartner'):msg??(showInList!==undefined?t('fe.cm.visSaved'):status===null?t('fe.cm.rsvpT.cleared'):status==='going'?t(e.format==='online'?(couple?'fe.cm.rsvpT.goingOnlineCouple':'fe.cm.rsvpT.goingOnline'):(couple?'fe.cm.rsvpT.goingOfflineCouple':'fe.cm.rsvpT.goingOffline'))
    :status==='interested'?t(couple?'fe.cm.rsvpT.interestedCouple':'fe.cm.rsvpT.interested'):t(couple?'fe.cm.rsvpT.notCouple':'fe.cm.rsvpT.not')),
    {type:'ok',...(undo&&!r.pending?{action:{label:t('fe.mx.undo'),fn:undo}}:{})});load();return true;}
  catch(x){toast(feErrorMessage(x,t),{type:'err'});op.current=newOpId();return false;}finally{setBusy(false);}
 };
 // The answer as it is now, to put back from «Отменить».
 const restore=(was:z.infer<typeof rsvpObj>|null|undefined)=>()=>{const s=was?.status as Status|null|undefined;if(!s)return;
  void send({status:s,...(was?.showInList!=null?{showInList:was.showInList}:{}),...(was?.ticketMarked?{ticketMarked:true}:{})},t('fe.w7.ev.restored'));};
 const rsvp=(status:Status|null,showInList?:boolean)=>send({status,...(showInList!==undefined?{showInList}:{})},undefined,
  // «Снять ответ» (V21 rsvpClear): the ticket mark goes with it; «Отменить» puts both back.
  status===null&&showInList===undefined?restore(e?.me.rsvp):undefined);
 // E09 «Билет у организатора»: the ticket is bought on the organizer's site; «Билет уже куплен» answers «Иду» with
 // the mark, «Снять отметку» takes the mark off (with «Отменить»).
 const ticketed=!!e?.me.rsvp?.ticketMarked;
 const markTicket=async()=>{if(await send({status:'going',ticketMarked:true},t(couple?'fe.w7.tk.markedUs':'fe.w7.tk.marked')))setLayer('');};
 const unmarkTicket=async()=>{if(await send({status:(st as Status|null)??'going',ticketMarked:false},t('fe.w7.tk.unmarked'),()=>void send({status:'going',ticketMarked:true},t('fe.w7.tk.marked'))))setLayer('');};
 const save=async()=>{const on=!saved;setSaved(on);try{await call('saved.set',{opId:newOpId(),kind:'event',targetId:id,on},okRes);toast(t((on?'fe.cm.saved':'fe.cm.unsaved')+(couple?'Us':'')),on?{type:'ok'}:{});}catch(x){setSaved(!on);toast(feErrorMessage(x,t),{type:'err'});}};
 const share=async()=>{setLayer('');const okc=await copyLink(appUrl('/n/events/'+id));toast(t(okc?'fe.cm.evLinkCopied':'fe.cm.copyFailed'),{type:okc?'ok':'warn'});};
 const withdraw=async()=>{if(!app)return;setBusy(true);try{await call('event.applicationWithdraw',{opId:newOpId(),applicationId:app.id},okRes);setLayer('');toast(t(couple?'fe.cm.appWithdrawnUs':'fe.cm.appWithdrawn'),{type:'ok'});load();}catch(x){toast(feErrorMessage(x,t),{type:'err'});}finally{setBusy(false);}};
 // A couple's application the partner has not approved yet is taken back as that approval (decide.cancel).
 const unwait=async()=>{const w=e?.me.waiting;if(!w)return;setBusy(true);try{await call('decide.cancel',{opId:newOpId(),approvalId:w.id},okRes);setLayer('');toast(t(couple?'fe.cm.appWithdrawnUs':'fe.cm.appWithdrawn'),{type:'ok'});load();}catch(x){toast(feErrorMessage(x,t),{type:'err'});}finally{setBusy(false);}};
 const tz=e?evTz(e):USER_TZ;const away=!!e&&e.format==='online'&&e.tz!==USER_TZ;
 const open=!!e&&e.state==='published'&&!e.past;const cancelled=e?.state==='cancelled';
 const admitted=!!e&&(orgMe||(!!e.joinUrl||!!e.exactAddress));
 const statusPill=!e?null:cancelled?<Pill tone="bad">{t('fe.cm.st.cancelled')}</Pill>:orgMe?<Pill tone="v">{t(couple?'fe.cm.st.organizerCouple':'fe.cm.st.organizer')}</Pill>
  :e.past?null:app?.state==='pending'?<Pill tone="wait">{t('fe.cm.st.pending')}</Pill>:app?.state==='approved'?<Pill tone="ok">{t('fe.cm.st.approved')}</Pill>
  :app?.state==='declined'?<Pill tone="bad">{t('fe.cm.st.declined')}</Pill>:st==='going'?<Pill tone="ok">{t('fe.cm.st.going')}</Pill>:st==='interested'?<Pill tone="v">{t('fe.cm.st.interested')}</Pill>:null;
 const showRsvp=!!e&&open&&!orgMe&&(!e.requiresApplication||app?.state==='approved');
 const ticketUrl=e?.price.kind==='external'&&typeof e.price.ticketUrl==='string'&&/^https?:\/\//i.test(e.price.ticketUrl)?e.price.ticketUrl:null;
 const external=!!ticketUrl&&open&&!orgMe;
 const site=ticketUrl?(()=>{try{return new URL(ticketUrl).hostname.replace(/^www\./,'');}catch{return '';}})():'';
 let cta:ReactNode=null;
 if(e&&!orgMe){
  if(cancelled)cta=<Btn kind="soft" onClick={()=>navigate('/n/communities?sub=events')}>{t('fe.cm.similar')}</Btn>;
  else if(e.past)cta=<Btn kind="soft" className="off" disabled>{t('fe.cm.ended')}</Btn>;
  else if(e.requiresApplication&&!app&&!waiting)cta=<Btn icon={FileText} onClick={()=>navigate(`/n/events/${id}/apply`)}>{couple?t('fe.host.app.applyCouple'):t('fe.host.app.apply')}</Btn>;
  // Pending / declined: the «Участие» card says it and holds «Отозвать»; a declined one cannot be sent again.
  else if(e.requiresApplication&&(app?.state==='pending'||app?.state==='declined'))cta=null;
  else if(external&&!ticketed&&(!e.requiresApplication||app?.state==='approved'))cta=<Btn icon={Ticket} onClick={()=>setLayer('ticket')}>{t('fe.w7.tk.cta')}</Btn>;
  else if(admitted)cta=<Btn icon={e.format==='online'?Video:MapPin} onClick={()=>setLayer('venue')}>{t(e.format==='online'?'fe.cm.howJoin':'fe.cm.address')}</Btn>;
 }
 const venueHint=!e?'':orgMe?(e.format==='online'?e.joinUrl??'':e.exactAddress??'')
  :admitted?(e.format==='online'?t('fe.cm.linkReady'):e.exactAddress??'')
  :cancelled||e.past?'':e.format==='online'?(e.requiresApplication?t('fe.cm.linkAfterApp'):t(couple?'fe.cm.linkAfterGoingCouple':'fe.cm.linkAfterGoing'))
  :e.requiresApplication?t('fe.cm.addrAfterApp'):t(couple?'fe.cm.addrAfterGoingCouple':'fe.cm.addrAfterGoing');
 const priceSub=!e?'':e.price.kind==='external'?fill(t('fe.cm.extTicket'),{site:(()=>{try{return new URL(String(e.price.ticketUrl)).hostname;}catch{return '';}})()})
  :[e.price.kind==='door'?t('fe.cm.payDoor'):'',e.requiresApplication?t('fe.cm.byApp'):e.price.kind==='free'?t('fe.cm.justCome'):''].filter(Boolean).join(' · ').replace(/^./,x=>x.toUpperCase());
 const going=e?.going??0,interested=e?.interested??0;
 return <>
  <CoverBar title={e?.title}>
   {e&&<><IconBtn icon={saved?BookmarkCheck:Bookmark} kind="glass" aria-pressed={saved} label={t(saved?'fe.cm.unsave':'fe.cm.save')} onClick={()=>void save()}/>
    <IconBtn icon={Share} kind="glass" label={t('fe.cm.share')} onClick={()=>void share()}/>
    <IconBtn icon={Ellipsis} kind="glass" label={t('fe.cm.more')} onClick={()=>setLayer('menu')}/></>}
  </CoverBar>
  <div className={'view nodock top0'+(cta?' cta1':'')}><div className="wrap">
   {error?<Empty icon={Lock} title={t('fe.cm.evUnavailable')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!e?<><EventHero/><Skel kind="list" rows={4}/></>
    :<>
     <EventHero cover={<NamedPlate k={e.plate} icon={Calendar}/>} title={e.title} status={statusPill}
      tags={[<>{e.format==='online'?<Video/>:<MapPin/>}{e.format==='online'?t('fe.ev.online'):e.area??t('fe.ev.offline')}</>,t('fe.ev.kind.'+e.kind)]}/>
     {orgMe&&<div className="entity-manage"><Btn kind="soft" size="md" className="manage-entry" icon={Settings} onClick={()=>navigate(`/n/events/${e.id}/manage`)}>{t('fe.host.manage')}</Btn></div>}
     {cancelled&&<Alert kind="err" icon={TriangleAlert} className="mt16"><b>{t('fe.cm.evCancelled')}</b>{e.cancelReason??''}</Alert>}
     {e.state==='pending_partner'?<Alert kind="warn" icon={Clock} className="mt16"><b>{t('fe.cm.waitsPartnerT')}</b>{t('fe.cm.waitsPartnerText')}</Alert>
      :e.state==='in_review'?<Alert kind="warn" icon={Clock} className="mt16"><b>{t('fe.cm.inReview')}</b>{t(couple?'fe.cm.evReviewTextCouple':'fe.cm.evReviewText')}</Alert>
      :e.state==='rejected'?<Alert kind="err" icon={Ban} className="mt16"><b>{t('fe.cm.rejected')}</b>{String((e as {rejectReason?:unknown}).rejectReason??'')}</Alert>:null}
     <Card list className="mt16">
      {e.organizer&&<Row av={<Av name={pname(e.organizer)} seed={e.organizer.id} size="sm" src={e.organizer.avatar}/>} title={pname(e.organizer)} sub={t('fe.ev.organizer')} onClick={()=>navigate(orgMe?'/n/me':'/n/people/'+e.organizer!.id)}/>}
      {comm&&<Row av={<span className="av sm">{coverSrc(comm.cover)?<img src={coverSrc(comm.cover)!} alt="" draggable={false}/>:<NamedPlate k={comm.plate}/>}</span>} title={comm.name} sub={t('fe.cm.community')} onClick={()=>navigate('/n/communities/'+comm.id)}/>}
     </Card>
     {showRsvp&&<section className="rsvp-box"><div className="rsvp-h"><b>{t(couple?'fe.cm.rsvpQCouple':'fe.ev.question')}</b>
       {waiting?<Pill tone="wait" icon={Clock}>{t('fe.cm.st.waiting')}</Pill>:st?<Btn kind="text" auto onClick={()=>void rsvp(null)} disabled={busy}>{t('fe.cm.clearAnswer')}</Btn>:<Note as="span">{t('fe.cm.noAnswer')}</Note>}</div>
      <Rsvp<'interested'|'going'|'not_going'> label={t('fe.cm.yourAnswer')} value={st as 'interested'|'going'|'not_going'|null} couple={couple} disabled={busy} onChange={v=>void rsvp(st===v?null:v)}
       options={([['interested',Eye,'interested'],['going',Check,'going'],['not_going',X,'not']] as const).map(([v,Ic,tone])=>[v,t((couple?'fe.cm.rsvpC.':'fe.cm.rsvp.')+v),Ic,tone] as const)}/></section>}
     {!orgMe&&open&&<EventApplicationLines e={e} busy={busy} onWithdraw={()=>setLayer('withdraw')} onCancelWait={()=>setLayer('unwait')}/>}
     <Card list className="mt12">
      <Row icon={Calendar} tone="l" title={inTz(e.startsAt,tz,locale,{weekday:'short',day:'numeric',month:'long'})}
       sub={<>{timeOf(e.startsAt,tz,locale)}–{timeOf(e.endsAt,tz,locale)} {t(e.format==='online'?'fe.ev.yourTime':'fe.cm.localTime')}{away&&<><br/>{t('fe.cm.forOrganizer')}: {timeOf(e.startsAt,e.tz,locale)}–{timeOf(e.endsAt,e.tz,locale)} {e.tz}</>}</>}/>
      {orgMe&&!cancelled&&(e.joinUrl||e.exactAddress)
       ?<Row icon={e.format==='online'?Video:MapPin} tone="v" title={e.format==='online'?t('fe.ev.online'):e.area} sub={venueHint||undefined} wrap onClick={()=>setLayer('venue')}/>
       :<Row icon={e.format==='online'?Video:MapPin} tone="v" title={e.format==='online'?t('fe.ev.online'):e.area} sub={venueHint||undefined} end={!admitted&&!cancelled&&!e.past&&<span className="lockpill"><Lock/></span>}/>}
      {!cancelled&&<Row icon={Ticket} tone="a" title={priceText(e.price,t,locale)} sub={[ticketed?t('fe.w7.tk.mine'):'',priceSub].filter(Boolean).join(' · ')||undefined}
       onClick={external?()=>setLayer('ticket'):undefined}/>}
     </Card>
     <SectionLabel>{t('fe.ev.about')}</SectionLabel><div className="md bio"><p>{e.description}</p></div>
     {e.requirements&&<><SectionLabel>{t('fe.ev.requirements')}</SectionLabel><Card>{e.requirements.split('\n').filter(Boolean).map((r,i)=><div key={i} className="fact"><i className="v"><Check/></i><span>{r}</span></div>)}<Note className="mt8">{t('fe.cm.reqNote')}</Note></Card></>}
     {going+interested===0?(orgMe&&!cancelled&&!e.past&&<><SectionLabel>{t('fe.cm.crowd')}</SectionLabel><Note>{t('fe.cm.nobodyYet')}</Note></>)
      :<><SectionLabel>{e.past?t('fe.cm.whoWas'):t('fe.cm.crowd')}</SectionLabel><Card list>
       <Row av={faces.length?<span className="av-stack">{faces.map(f=><Av key={f.id} name={pname(f)} seed={f.id} size="sm" src={f.avatar}/>)}</span>:undefined}
        title={fill(t(e.past?'fe.cm.attendedN':'fe.cm.goingN'),{n:going})} sub={e.past?undefined:fill(t('fe.cm.interestedN'),{n:interested})} onClick={()=>navigate(`/n/events/${id}/attendees`)}/></Card></>}
     {!orgMe&&open&&(st==='going'||st==='interested')&&<><SectionLabel>{t('fe.cm.visibility')}</SectionLabel><Card list>
      <ToggleRow title={t(couple?'fe.cm.showOurs':'fe.cm.showMine')} sub={t(couple?'fe.cm.showOursSub':'fe.cm.showMineSub')} on={!!e.me.rsvp?.showInList} disabled={busy} onClick={()=>void rsvp(st as 'going'|'interested',!e.me.rsvp?.showInList)}/></Card></>}
     {!!e.announcements?.length&&<><SectionLabel>{t('fe.cm.orgUpdates')}</SectionLabel>{e.announcements.map(a=><Announcement key={a.id} icon={Bell} body={a.body} meta={<>{a.automatic?t('fe.cm.auto'):''}{when(a.created_at,locale)}</>}/>)}</>}
    </>}
  </div></div>
  {cta&&<div className="ctabar"><div className="wrap">{cta}</div></div>}
  {e&&layer==='menu'&&<Sheet title={t('fe.cm.event')} onClose={()=>setLayer('')}><Card list>
   <Row icon={CalendarPlus} title={t('fe.cm.addCal')} noChev onClick={()=>{setLayer('');downloadIcs(e);toast(t('fe.cm.calDone'),{type:'ok'});}}/>
   {!orgMe&&<Row icon={Flag} danger title={t('fe.cm.report')} noChev onClick={()=>setLayer('report')}/>}
  </Card></Sheet>}
  {e&&layer==='venue'&&<Sheet title={t(e.format==='online'?'fe.cm.joinT':'fe.cm.addressT')} onClose={()=>setLayer('')}
   foot={<>{e.format==='online'?(e.joinUrl&&<LinkBtn kind="primary" icon={ExternalLink} href={e.joinUrl}>{t('fe.cm.openLink')}</LinkBtn>)
    :(e.exactAddress&&<LinkBtn kind="primary" icon={MapIcon} href={'https://www.openstreetmap.org/search?query='+encodeURIComponent(e.exactAddress)}>{t('fe.cm.openMaps')}</LinkBtn>)}
    <Btn kind="soft" icon={CalendarPlus} onClick={()=>{downloadIcs(e);toast(t('fe.cm.calDone'),{type:'ok'});}}>{t('fe.cm.toCal')}</Btn></>}>
   {e.format==='online'?<Card className="flat"><div className="flabel">{t('fe.cm.link')}</div><Text as="b" size="md" bold breakAll>{e.joinUrl}</Text></Card>
    :<><Card className="flat"><Text as="b" size="md" bold>{e.exactAddress}</Text><Note className="mt8">{e.area} · {inTz(e.startsAt,tz,locale,{weekday:'short',day:'numeric',month:'long'})}, {timeOf(e.startsAt,tz,locale)}</Note></Card><Note className="mt12">{t('fe.cm.addrNote')}</Note></>}
  </Sheet>}
  {e&&layer==='ticket'&&ticketUrl&&<Sheet title={t('fe.w7.tk.title')} sub={site} onClose={()=>setLayer('')}
   foot={<>{<LinkBtn kind="primary" icon={ExternalLink} href={ticketUrl}>{t('fe.w7.tk.go')}</LinkBtn>}
    {ticketed?<Btn kind="soft" busy={busy} disabled={busy} onClick={()=>void unmarkTicket()}>{t('fe.w7.tk.unmark')}</Btn>
     :<Btn kind="soft" icon={Check} busy={busy} disabled={busy} onClick={()=>void markTicket()}>{t(couple?'fe.w7.tk.boughtUs':'fe.w7.tk.bought')}</Btn>}</>}>
   <Card list>
    {e.organizer&&<Row av={<Av name={pname(e.organizer)} seed={e.organizer.id} size="sm" src={e.organizer.avatar}/>} title={pname(e.organizer)} sub={t('fe.ev.organizer')}/>}
    <Row icon={Globe} tone="v" title={site||ticketUrl} sub={t('fe.w7.tk.site')} wrap/>
    <Row icon={Ticket} tone="a" title={priceText(e.price,t,locale)} sub={ticketed?t('fe.w7.tk.mine'):t('fe.w7.tk.price')}/>
   </Card>
   <Alert kind="warn" className="mt12">{t('fe.w7.tk.outside')}</Alert>
   <Note className="mt12">{ticketed?t('fe.w7.tk.showAtDoor'):t(couple?'fe.w7.tk.boughtHintCouple':'fe.w7.tk.boughtHint')}</Note>
  </Sheet>}
  {e&&layer==='withdraw'&&<Ask icon={FileText} danger title={t('fe.host.app.withdrawQ')} text={t('fe.host.app.withdrawText')} ok={t('fe.host.app.withdrawOk')} busy={busy} onOk={()=>void withdraw()} onCancel={()=>setLayer('')}/>}
  {e&&layer==='unwait'&&<Ask icon={FileText} danger title={t('fe.host.app.withdrawQ')} text={t('fe.cm.req.unwaitText')} ok={t('fe.host.app.withdrawOk')} busy={busy} onOk={()=>void unwait()} onCancel={()=>setLayer('')}/>}
  {e&&layer==='report'&&<ReportSheet targetType="event" targetId={e.id} onClose={()=>setLayer('')} onDone={msg=>{setLayer('');toast(msg,{type:'ok'});}}/>}
 </>;
}
