import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,ChartColumn,Bell,BellOff,Bookmark,BookmarkCheck,Calendar,CalendarPlus,Check,ChevronLeft,ChevronRight,Clock,Ellipsis,Eye,ExternalLink,FileText,Flag,Globe,Image as ImageIcon,Link as LinkIcon,Lock,Map as MapIcon,MapPin,MessageCircle,Plus,Search,Settings,Share,SlidersHorizontal,Ticket,TriangleAlert,Users,Video,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,Seg,Skel} from './ui';
import {useFe} from './session';
import {when} from './feed';
import {BellButton} from './inbox';
import {useToast} from './toast';
import {placeName,useCatalog} from './create-community';
import {Ask,CSheet,CommPlate,LinkRow,NamedPlate,ReportSheet,TabStrip,appUrl,copyLink,fill,okRes,pl} from './comm-kit';
import {CommunityHostEntry,DiscussionHostSheet,EventApplicationLines,JoinSheet,MembersList,isCommunityHost} from './host';

/** «Сообщества» (V21 C01 catalogue with interests and filters, C03 community page with discussions, events, members
 * and rules, E03 event page) with the prototype's markup. Everything shown comes from the server; details the server
 * does not give (photos of communities, activity lines) are left out rather than made up. */

const card=z.object({id:z.uuid(),name:z.string(),topics:z.array(z.string()),privacy:z.string(),members:z.number(),joined:z.boolean(),plate:z.string().nullable().optional(),place_id:z.string().nullable().optional()});
type Card=z.infer<typeof card>;
const catalog=z.object({ok:z.literal(true),items:z.array(card),next:z.string().nullable()});
const prof=z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable()}).passthrough();
const community=z.object({id:z.uuid(),name:z.string(),description:z.string(),topics:z.array(z.string()),privacy:z.string(),rules:z.array(z.string()),members:z.number(),
 plate:z.string().nullable().optional(),placeId:z.string().nullable().optional(),hosts:z.array(prof.extend({role:z.string()})).optional(),
 me:z.object({role:z.string(),state:z.string(),muted:z.boolean().optional(),readOnly:z.boolean().optional()}).passthrough().nullable(),request:z.object({id:z.uuid()}).nullable(),joinQuestion:z.string().nullable(),
 pendingRequests:z.number().optional(),state:z.string().optional()}).passthrough();
export type Community=z.infer<typeof community>;
const commRes=z.object({ok:z.literal(true),community});
const disc=z.object({id:z.uuid(),title:z.string().nullable(),excerpt:z.string(),pinned:z.boolean(),published_at:z.string().nullable(),replies:z.number(),owner_profile_id:z.string().nullable().optional()});
const discRes=z.object({ok:z.literal(true),locked:z.boolean(),items:z.array(disc)});
const memItem=prof.extend({role:z.string(),read_only:z.boolean()});
const memList=z.object({ok:z.literal(true),count:z.number(),items:z.array(memItem).nullable()});
const priceSchema=z.object({kind:z.string(),amount:z.number().optional(),currency:z.string().optional(),ticketUrl:z.string().optional()}).passthrough();
const ev=z.object({id:z.uuid(),title:z.string(),kind:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),tz:z.string().nullable().optional(),starts_at:z.string(),ends_at:z.string(),
 price:priceSchema,requires_application:z.boolean(),state:z.string(),plate:z.string().nullable().optional(),place_id:z.string().nullable().optional(),community_id:z.string().nullable().optional()});
type Ev=z.infer<typeof ev>;
const evList=z.object({ok:z.literal(true),items:z.array(ev),next:z.string().nullable()});
const rsvpObj=z.object({status:z.string().nullable().optional(),showInList:z.boolean().nullable().optional(),ticketMarked:z.boolean().nullable().optional()}).passthrough();
const announcement=z.object({id:z.uuid(),body:z.string(),automatic:z.boolean(),created_at:z.string()}).passthrough();
const event=z.object({id:z.uuid(),title:z.string(),kind:z.string(),description:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),tz:z.string(),placeId:z.string().nullable().optional(),
 startsAt:z.string(),endsAt:z.string(),price:priceSchema,requiresApplication:z.boolean(),questions:z.array(z.string()).nullable().optional(),
 requirements:z.string().nullable(),state:z.string(),past:z.boolean(),going:z.number(),interested:z.number(),exactAddress:z.string().nullable(),joinUrl:z.string().nullable(),locked:z.boolean(),
 plate:z.string().nullable().optional(),communityId:z.string().nullable().optional(),cancelReason:z.string().nullable().optional(),
 organizer:prof.nullable().optional(),announcements:z.array(announcement).optional(),
 me:z.object({rsvp:rsvpObj.nullable().optional(),application:z.object({id:z.uuid(),state:z.string(),rev:z.number()}).nullable().optional(),waiting:z.unknown().optional()}).passthrough()}).passthrough();
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
   <button type="button" className="ibtn" aria-label={t('fe.cm.search')} onClick={()=>navigate('/n/search'+(tab==='events'?'?scope=events':'?scope=groups'))}><Search/></button><BellButton/>
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
  <button type="button" className="ibtn add" aria-label={t(k+'.create')} onClick={()=>navigate(kind==='communities'?'/n/communities/new':'/n/events/new')}><Plus/></button>
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
  <div className="filterline"><div className="chips scroll">
   <button type="button" className={'chip filter'+(!f.topics.length?' on':'')} aria-pressed={!f.topics.length} onClick={()=>toggle('')}>{t('fe.comm.allTopics')}</button>
   {used.map(x=><button key={x} type="button" className={'chip filter'+(f.topics.includes(x)?' on':'')} aria-pressed={f.topics.includes(x)} onClick={()=>toggle(x)}>{tname(x)}</button>)}
  </div><button type="button" className={'chip filter'+(badge?' on':'')} onClick={()=>setSheet(true)}><SlidersHorizontal/>{t('fe.cm.filters')}{badge?<em className="badge-abs">{badge}</em>:null}</button></div>
  {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>void load()}>{t('fe.retry')}</Btn></Empty>
   :all===null?<Skel kind="card" rows={4}/>
   :!items.length?<Empty icon={Users} title={t('fe.cm.nothing')} text={t('fe.cm.nothingText')}>{f!==CF0&&<Btn kind="soft" onClick={()=>setF(CF0)}>{t('fe.cm.resetFilters')}</Btn>}</Empty>
   :items.map((c,i)=><CommCard key={c.id} c={c} i={i} tname={tname} place={c.place_id?placeName(cat?.places.find(p=>p.id===c.place_id)??{ru:null,en:null},locale):''} mine={mine}/>)}
  {sheet&&all&&<CommFilterSheet all={all} used={used} tname={tname} value={f} onApply={v=>{setF(v);setSheet(false);}} onClose={()=>setSheet(false)}/>}
 </>;
}

function CommCard({c,i,tname,place,mine}:{c:Card,i:number,tname:(id:string)=>string,place:string,mine:ReturnType<typeof useMyCommunities>}){
 const {t,locale}=useI18n();const navigate=useNavigate();const {acting}=useFe();const couple=acting?.kind==='couple';
 const state=mine.hosting.has(c.id)?<span className="pill ok"><Settings/>{t(couple?'fe.cm.youHostCouple':'fe.cm.youHost')}</span>
  :c.joined||mine.member.has(c.id)?<span className="pill ok"><Check/>{t(couple?'fe.cm.memberCouple':'fe.comm.member')}</span>
  :mine.pending.has(c.id)?<span className="pill wait">{t('fe.cm.underReview')}</span>
  :c.privacy!=='open'?<span className="pill"><Lock/>{t('fe.cm.byRequest')}</span>:null;
 return <button type="button" className="cmc" style={{animationDelay:`${i*40}ms`}} onClick={()=>navigate('/n/communities/'+c.id)}>
  <div className="cv" style={{position:'relative'}}><CommPlate k={c.plate}/></div>
  <div className="tx"><b>{c.name}</b><small>{c.topics.map(x=>'#'+tname(x)).join(' ')}</small>
   <div className="meta"><span>{pl(c.members,t('fe.cm.members'),locale)}</span><span>·</span><span>{place||t('fe.cm.online')}</span>{state&&<> {state}</>}</div>
  </div>
 </button>;
}

/** «Фильтры сообществ» — interests, joining, where; the button shows how many communities match. */
function CommFilterSheet({all,used,tname,value,onApply,onClose}:{all:Card[],used:string[],tname:(id:string)=>string,value:CommFilter,onApply:(f:CommFilter)=>void,onClose:()=>void}){
 const {t,locale}=useI18n();const [d,setD]=useState<CommFilter>({...value,topics:[...value.topics]});
 const n=all.filter(c=>passes(c,d)).length;
 const clr=(fn:()=>void)=><button type="button" className="fclr" onClick={fn}>{t('fe.cm.clear')}</button>;
 return <CSheet full title={t('fe.cm.filtersTitle')} onClose={onClose} head={<button type="button" className="btn text auto" onClick={()=>setD(CF0)}>{t('fe.cm.reset')}</button>}
  foot={n?<Btn onClick={()=>onApply(d)}>{fill(t('fe.cm.showN'),{n:pl(n,t('fe.cm.communities'),locale)})}</Btn>:<Btn kind="soft" disabled aria-disabled="true">{t('fe.cm.nothingMatches')}</Btn>}>
  <section className="fin"><div className="fin-t"><b>{t('fe.cm.interests')}</b><span>{t('fe.cm.pickAny')}</span>{d.topics.length>0&&clr(()=>setD(x=>({...x,topics:[]})))}</div>
   <div className="fin-b"><div className="chips">{used.map(x=><button key={x} type="button" className={'chip'+(d.topics.includes(x)?' on':'')} aria-pressed={d.topics.includes(x)} onClick={()=>setD(v=>({...v,topics:v.topics.includes(x)?v.topics.filter(y=>y!==x):[...v.topics,x]}))}>{tname(x)}</button>)}</div></div></section>
  <section className="fin"><div className="fin-t"><b>{t('fe.cm.joining')}</b>{d.privacy!=='all'&&clr(()=>setD(x=>({...x,privacy:'all'})))}</div>
   <div className="fin-b"><div className="chips" role="radiogroup">{(['all','open','closed'] as const).map(k=><button key={k} type="button" className={'chip'+(d.privacy===k?' on':'')} role="radio" aria-checked={d.privacy===k} onClick={()=>setD(x=>({...x,privacy:k}))}>{t('fe.cm.priv.'+k)}</button>)}</div></div></section>
  <section className="fin"><div className="fin-t"><b>{t('fe.cm.where')}</b>{d.online&&clr(()=>setD(x=>({...x,online:false})))}</div>
   <div className="fin-b"><div className="chips" role="radiogroup">{([false,true] as const).map(k=><button key={String(k)} type="button" className={'chip'+(d.online===k?' on':'')} role="radio" aria-checked={d.online===k} onClick={()=>setD(x=>({...x,online:k}))}>{t(k?'fe.cm.onlineOnly':'fe.cm.anywhere')}</button>)}</div></div></section>
  <p className="grp-n">{t('fe.cm.hiddenNote')}</p>
 </CSheet>;
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
 return s==='organizer'?<span className="pill v">{t(couple?'fe.cm.st.organizerCouple':'fe.cm.st.organizer')}</span>
  :s==='going'?<span className="pill ok">{t('fe.cm.st.going')}</span>:s==='pending'?<span className="pill wait">{t('fe.cm.st.pending')}</span>
  :s==='waiting'?<span className="pill wait"><Clock/>{t('fe.cm.st.waiting')}</span>:<span className="pill v">{t('fe.cm.st.interested')}</span>;
}

/** `eventCard()` — the big card, or the row (`row`) used for «Ближайшая встреча» and cancelled events. */
export function EventCard({e,i=0,row,status,org}:{e:Ev,i?:number,row?:boolean,status?:MyStatus|undefined,org?:string|undefined}){
 const {t,locale}=useI18n();const navigate=useNavigate();const tz=evTz(e);
 const day=inTz(e.starts_at,tz,locale,{day:'numeric'});const mon=inTz(e.starts_at,tz,locale,{month:'short'}).replace('.','');
 const cancelled=e.state==='cancelled';
 const pill=cancelled?<span className="pill bad">{t('fe.cm.st.cancelled')}</span>:<StatusPill s={status}/>;
 if(row)return <button type="button" className="evc row" onClick={()=>navigate('/n/events/'+e.id)}>
  <div className="cv"><NamedPlate k={e.plate} icon={Calendar}/><div className="date"><b>{day}</b><small>{mon}</small></div></div>
  <div className="bd"><small>{e.format==='online'?t('fe.ev.online'):e.area??t('fe.ev.offline')} · {timeOf(e.starts_at,tz,locale)}</small><b>{e.title}</b>{org&&<span className="note">{org}</span>}{pill}</div>
 </button>;
 return <button type="button" className="evc" style={{animationDelay:`${i*50}ms`}} onClick={()=>navigate('/n/events/'+e.id)}>
  <div className="cv"><NamedPlate k={e.plate} icon={Calendar}/><div className="date"><b>{day}</b><small>{mon}</small></div>
   <div className="fmt"><span>{e.format==='online'?<Video/>:<MapPin/>}{e.format==='online'?t('fe.ev.online'):e.area??t('fe.ev.offline')}</span></div>
   {cancelled||status?<div className="my">{pill}</div>:null}</div>
  <div className="bd"><small>{t('fe.ev.kind.'+e.kind)}</small><b>{e.title}</b>
   <div className="meta"><span><Clock/>{timeOf(e.starts_at,tz,locale)}</span><span><Ticket/>{priceText(e.price,t,locale)}</span></div></div>
 </button>;
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
  <div className="filterline"><div className="chips scroll">{(['all','offline','online'] as const).map(k=><button key={k} type="button" className={'chip filter'+(f.format===k?' on':'')} aria-pressed={f.format===k} onClick={()=>setF(x=>({...x,format:k}))}>
   {k==='online'?<Video/>:k==='offline'?<MapPin/>:null}{t('fe.ev.format.'+k)}</button>)}</div>
   <button type="button" className={'chip filter'+(badge?' on':'')} onClick={()=>setSheet(true)}><SlidersHorizontal/>{t('fe.cm.filters')}{badge?<em className="badge-abs">{badge}</em>:null}</button></div>
  {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
   :items===null?<div className="skel" role="status" aria-busy="true" aria-label={t('fe.loading')}><i className="sk" style={{display:'block',height:250,borderRadius:24,marginTop:20}}/><i className="sk" style={{display:'block',height:250,borderRadius:24,marginTop:12}}/></div>
   :!items.length?<Empty icon={Calendar} title={t('fe.cm.evNothing')} text={t('fe.cm.evNothingText')}>{(f.format!=='all'||badge>0)&&<Btn kind="soft" onClick={()=>setF(EF0)}>{t('fe.cm.resetFilters')}</Btn>}<Btn kind="text" onClick={()=>navigate('/n/events/new')}>{t('fe.ce.create')}</Btn></Empty>
   :<>
    {soon.length>0&&<><div className="sec">{t('fe.cm.next7')}</div><div className="evgrid">{soon.map((e,i)=><EventCard key={e.id} e={e} i={i} status={mine.st.get(e.id)}/>)}</div></>}
    {later.length>0&&<><div className="sec">{t('fe.cm.later')}</div><div className="evgrid">{later.map((e,i)=><EventCard key={e.id} e={e} i={i} status={mine.st.get(e.id)}/>)}</div></>}
    {canc.length>0&&<><div className="sec">{t('fe.cm.cancelledSec')}</div>{canc.map(e=><EventCard key={e.id} e={e} row/>)}</>}
   </>}
  {sheet&&<EvFilterSheet value={f} onApply={v=>{setF(v);setSheet(false);}} onClose={()=>setSheet(false)}/>}
 </>;
}

/** «Фильтры событий» — format, when, type, price, admission; the button counts what the server finds. */
function EvFilterSheet({value,onApply,onClose}:{value:EvFilter,onApply:(f:EvFilter)=>void,onClose:()=>void}){
 const {call}=useFe();const {t,locale}=useI18n();const [d,setD]=useState<EvFilter>({...value,kinds:[...value.kinds]});const [n,setN]=useState<{n:number,more:boolean}|null>(null);
 useEffect(()=>{let live=true;setN(null);const tm=setTimeout(()=>{call('event.catalog',evInput(d),evList).then(r=>{if(live)setN({n:r.items.length,more:!!r.next});}).catch(()=>{});},250);return ()=>{live=false;clearTimeout(tm);};},[call,d]);
 const clr=(fn:()=>void)=><button type="button" className="fclr" onClick={fn}>{t('fe.cm.clear')}</button>;
 const one=<K extends 'format'|'when'|'price'>(k:K,opts:readonly EvFilter[K][],label:string,lk:string,extra?:ReactNode)=><section className="fin"><div className="fin-t"><b>{label}</b>{d[k]!==opts[0]&&clr(()=>setD(x=>({...x,[k]:opts[0]})))}</div>
  <div className="fin-b"><div className="chips" role="radiogroup">{opts.map(o=><button key={o} type="button" className={'chip'+(d[k]===o?' on':'')} role="radio" aria-checked={d[k]===o} onClick={()=>setD(x=>({...x,[k]:o}))}>{t(lk+o)}</button>)}</div>{extra}</div></section>;
 return <CSheet full title={t('fe.cm.evFiltersTitle')} onClose={onClose} head={<button type="button" className="btn text auto" onClick={()=>setD(EF0)}>{t('fe.cm.reset')}</button>}
  foot={n&&!n.n?<Btn kind="soft" disabled aria-disabled="true">{t('fe.cm.evNoneMatch')}</Btn>:<Btn onClick={()=>onApply(d)}>{n?fill(t('fe.cm.showN'),{n:(n.more?'20+ ':'')+pl(n.n,t('fe.cm.events'),locale).replace(n.more?/^\d+ /:/^$/,'')}):t('fe.cm.applyFilters')}</Btn>}>
  {one('format',['all','offline','online'] as const,t('fe.cm.format'),'fe.ev.format.',<p className="note mt8">{t('fe.cm.cityNote')}</p>)}
  {one('when',['any','week','weekend','month'] as const,t('fe.cm.when'),'fe.cm.when.')}
  <section className="fin"><div className="fin-t"><b>{t('fe.cm.type')}</b><span>{t('fe.cm.pickAny')}</span>{d.kinds.length>0&&clr(()=>setD(x=>({...x,kinds:[]})))}</div>
   <div className="fin-b"><div className="chips">{KINDS.map(k=><button key={k} type="button" className={'chip'+(d.kinds.includes(k)?' on':'')} aria-pressed={d.kinds.includes(k)} onClick={()=>setD(x=>({...x,kinds:x.kinds.includes(k)?x.kinds.filter(y=>y!==k):[...x.kinds,k]}))}>{t('fe.ev.kind.'+k)}</button>)}</div></div></section>
  {one('price',['any','free','paid'] as const,t('fe.cm.price'),'fe.cm.price.')}
  <section className="fin"><div className="fin-t"><b>{t('fe.cm.admission')}</b>{d.openOnly&&clr(()=>setD(x=>({...x,openOnly:false})))}</div>
   <div className="fin-b"><div className="chips" role="radiogroup">{([false,true] as const).map(k=><button key={String(k)} type="button" className={'chip'+(d.openOnly===k?' on':'')} role="radio" aria-checked={d.openOnly===k} onClick={()=>setD(x=>({...x,openOnly:k}))}>{t(k?'fe.cm.openOnly':'fe.cm.admAny')}</button>)}</div></div></section>
 </CSheet>;
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
 const [layer,setLayer]=useState<''|'menu'|'join'|'leave'|'withdraw'|'report'>('');const [busy,setBusy]=useState(false);const [hostTools,setHostTools]=useState<z.infer<typeof disc>|null>(null);
 const load=useCallback(()=>{setError(null);
  Promise.all([call('community.get',{communityId:id,...(invite?{invite}:{})},commRes),
   call('community.discussions',{communityId:id},discRes).catch(e=>{if(invite)return {ok:true as const,locked:true,items:[]};throw e;}),
   call('community.members',{communityId:id},memList).catch(()=>null),
   call('event.catalog',{communityId:id},evList).then(r=>r.items.filter(e=>e.state==='published')).catch(()=>[] as Ev[])])
  .then(([a,b,m,e])=>{setC(a.community);setDiscs(b);setMem(m);setEvs(e);}).catch(setError);},[call,id,invite]);
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
 return <>
  <header className="bar overlay ev-bar">
   <button type="button" className="ibtn glass" aria-label={t('fe.back')} onClick={()=>navigate(-1)}><ChevronLeft/></button>
   <b className="ev-bar-t" aria-hidden="true">{c?.name}</b><span style={{flex:1}}/>
   {c&&<button type="button" className="ibtn glass" aria-label={t('fe.cm.more')} onClick={()=>setLayer('menu')}><Ellipsis/></button>}
  </header>
  <div className="view nodock top0"><div className="wrap">
   {error?<Empty icon={Lock} title={t('fe.cm.unavailable')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!c?<><div className="cm-hero"><i className="sk" style={{position:'absolute',inset:0}}/></div><div className="cm-head"><div className="cv"><i className="sk" style={{position:'absolute',inset:0}}/></div><i className="sk sk-l w70" style={{display:'block',height:28,margin:'8px 0'}}/><i className="sk sk-l w50" style={{display:'block'}}/></div><Skel kind="list"/></>
    :<>
     <div className="cm-hero"><NamedPlate k={c.plate}/></div>
     <div className="cm-head"><div className="cv" style={{position:'relative'}}><CommPlate k={c.plate}/></div><h2 tabIndex={-1}>{c.name}</h2>
      <div className="cm-meta"><span><Users/><b>{pl(c.members,t('fe.cm.members'),locale)}</b></span>
       <span>{c.privacy==='open'?<Globe/>:<Lock/>}{t('fe.cm.privacyMeta.'+c.privacy)}</span>
       <span>{place?<MapPin/>:<Video/>}{place||t('fe.cm.online')}</span>
       {c.me?.muted&&<span><BellOff/>{t('fe.cm.mutedMeta')}</span>}</div></div>
     {c.state==='in_review'&&<div className="alert warn mt12"><Clock/><span><b>{t('fe.cm.inReview')}</b>{t(couple?'fe.cm.inReviewTextCouple':'fe.cm.inReviewText')}</span></div>}
     {c.state==='rejected'&&<div className="alert err mt12"><Ban/><span><b>{t('fe.cm.rejected')}</b>{String((c as {rejectReason?:unknown}).rejectReason??'')}</span></div>}
     <div className="md bio cdesc"><p>{c.description}</p></div>
     <div className="chips mt12">{c.topics.map(x=><button key={x} type="button" className="chip tag" onClick={()=>navigate('/n/topics/'+x)}>#{tname(x)}</button>)}</div>
     <div className="row g8 mt16 cm-act">
      {host?<CommunityHostEntry c={c}/>
       :member?<span className="pill ok"><Check/>{t(couple?'fe.cm.memberCouple':'fe.comm.member')}</span>
       :c.request?<><span className="pill wait"><Clock/>{t('fe.host.join.pending')}</span><Btn kind="soft" size="md" auto style={{flex:'0 0 auto',marginLeft:'auto'}} onClick={()=>setLayer('withdraw')}>{t('fe.host.join.withdraw')}</Btn></>
       :(!c.state||c.state==='published')?<Btn size="md" onClick={()=>setLayer('join')}>{c.privacy!=='open'?t(couple?'fe.host.join.requestCouple':'fe.host.join.request'):t(couple?'fe.host.join.joinCouple':'fe.host.join.join')}</Btn>:null}
     </div>
     {next&&tab!=='events'&&<section className="grp cm-next"><div className="grp-t"><span>{t('fe.cm.nextMeetup')}</span>{evs.length>1&&<button type="button" onClick={()=>setTab('events')}>{fill(t('fe.cm.allN'),{n:evs.length})}</button>}</div><EventCard e={next} row/></section>}
     <div style={{height:14}}/>
     <TabStrip value={tab} onChange={setTab} items={[['disc',t('fe.comm.tab.disc')],['events',t('fe.comm.tab.events'),evs.length],['members',t('fe.cm.tab.members')],['rules',t('fe.comm.tab.rules')]]}/>
     {tab==='disc'?(discs?.locked?<div className="veil" style={{minHeight:200}}><div className="veil-content"><div className="bar-sk" style={{width:'70%'}}/><div className="bar-sk"/><div className="bar-sk" style={{width:'50%'}}/><div className="bar-sk"/></div>
       <div className="veil-glass"><div className="lockdot"><Lock/></div><b>{t('fe.cm.discForMembers')}</b><p>{c.request?t('fe.cm.discPending'):t('fe.cm.discRequest')}</p></div></div>:<>
      {member&&!c.me?.readOnly&&<div className="composer c-composer">
       <button type="button" className="cmp-main" onClick={()=>navigate('/n/feed/new?community='+c.id)}>{acting&&<Av name={pname(acting)} seed={acting.id} src={acting.avatar} size="sm"/>}<span>{t(couple?'fe.cm.topicCouple':'fe.comm.newTopic')}</span></button>
       <button type="button" className="ibtn ghost sm" aria-label={t('fe.cm.media')} onClick={()=>navigate('/n/feed/new?community='+c.id+'&x=media')}><ImageIcon/></button>
       <button type="button" className="ibtn ghost sm" aria-label={t('fe.cm.poll')} onClick={()=>navigate('/n/feed/new?community='+c.id+'&x=poll')}><ChartColumn/></button>
       <button type="button" className="ibtn add" aria-label={t('fe.cm.startDisc')} onClick={()=>navigate('/n/feed/new?community='+c.id)}><Plus/></button>
      </div>}
      {!discs?<Skel kind="list"/>:discs.items.length===0?<Empty icon={MessageCircle} title={t('fe.comm.noDisc')} text={member?t('fe.cm.noDiscMember'):t('fe.cm.noDiscGuest')}/>
       :<div className="card list">{discs.items.map(d=>{const a=d.owner_profile_id?names.get(d.owner_profile_id):undefined;
        return <div key={d.id} style={{position:'relative'}}><button type="button" className="disc" onClick={()=>navigate('/n/feed/post/'+d.id)} style={host?{paddingRight:48}:undefined}>
         {d.pinned&&<span className="pill v" style={{marginBottom:6}}>{t('fe.comm.pinned')}</span>}
         {d.title&&<b>{d.title}</b>}<p>{d.excerpt}</p>
         <span className="meta">{a&&<><Av name={pname(a)} seed={a.id} size="xs"/><span>{pname(a)}</span><span>·</span></>}<span>{when(d.published_at,locale)}</span><span><MessageCircle/>{d.replies}</span></span>
        </button>{host&&<button type="button" className="ibtn ghost sm" style={{position:'absolute',top:10,right:8}} aria-label={t('fe.cm.hostTools')} onClick={()=>setHostTools(d)}><Ellipsis/></button>}</div>;})}</div>}
     </>)
     :tab==='events'?(evs.length?<div className="evgrid">{sorted.map((e,i)=><EventCard key={e.id} e={e} i={i}/>)}</div>
      :<Empty icon={Calendar} title={t('fe.cm.noEvents')}>{host&&<Btn onClick={()=>navigate('/n/events/new?community='+c.id)}>{t('fe.ce.create')}</Btn>}</Empty>)
     :tab==='members'?<MembersList c={c} data={mem} onChange={load}/>
     :<div className="card"><ol className="rules">{c.rules.map((r,i)=><li key={i}>{r}</li>)}</ol></div>}
    </>}
  </div></div>
  {c&&layer==='menu'&&<CSheet title={c.name} onClose={()=>setLayer('')}><div className="card list">
   <LinkRow icon={LinkIcon} title={t('fe.cm.copyLink')} noChev onClick={()=>void share()}/>
   {member&&<LinkRow icon={c.me?.muted?Bell:BellOff} title={t(c.me?.muted?'fe.cm.unmute':'fe.cm.mute')} noChev disabled={busy} onClick={mute}/>}
   {member&&!owner&&<LinkRow icon={X} danger title={t('fe.cm.leave')} noChev onClick={()=>setLayer('leave')}/>}
   {!owner&&<LinkRow icon={Flag} danger title={t('fe.cm.report')} noChev onClick={()=>setLayer('report')}/>}
  </div></CSheet>}
  {c&&layer==='join'&&<JoinSheet c={c} invite={invite} onClose={()=>setLayer('')} onDone={msg=>{setLayer('');toast(msg,{type:'ok'});load();}}/>}
  {c&&layer==='leave'&&<Ask icon={Users} danger title={fill(t('fe.cm.leaveQ'),{name:c.name})} text={t(c.privacy==='open'?'fe.cm.leaveTextOpen':'fe.cm.leaveTextClosed')} ok={t('fe.comm.leave')} busy={busy}
   onOk={()=>void act(()=>call('community.leave',{opId:newOpId(),communityId:c.id},okRes),t('fe.cm.left'))} onCancel={()=>setLayer('')}/>}
  {c&&layer==='withdraw'&&<Ask icon={FileText} danger title={t('fe.host.join.withdrawQ')} ok={t('fe.host.join.withdraw')} busy={busy}
   onOk={()=>void act(()=>call('community.requestWithdraw',{opId:newOpId(),requestId:c.request!.id},okRes),t('fe.host.join.withdrawn'))} onCancel={()=>setLayer('')}/>}
  {c&&layer==='report'&&<ReportSheet targetType="community" targetId={c.id} onClose={()=>setLayer('')} onDone={msg=>{setLayer('');toast(msg,{type:'ok'});}}/>}
  {hostTools&&<DiscussionHostSheet d={hostTools} onClose={()=>setHostTools(null)} onDone={msg=>{setHostTools(null);toast(msg,{type:'ok'});load();}}/>}
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
 const [comm,setComm]=useState<{id:string,name:string,plate?:string|null|undefined}|null>(null);const [saved,setSaved]=useState(false);const [faces,setFaces]=useState<z.infer<typeof prof>[]>([]);
 const [layer,setLayer]=useState<''|'menu'|'venue'|'report'|'withdraw'>('');
 const op=useRef(newOpId());
 const load=useCallback(()=>{setError(null);call('event.get',{eventId:id},evRes).then(r=>{setE(r.event);
  const cid=r.event.communityId;if(cid)call('community.get',{communityId:cid},commRes).then(x=>setComm(x.community)).catch(()=>setComm(null));
  Promise.all([call('event.attendees',{eventId:id,kind:'going'},attList).catch(()=>null),call('event.attendees',{eventId:id,kind:'interested'},attList).catch(()=>null)])
   .then(([g,i])=>setFaces([...(g?.items??[]),...(i?.items??[])].slice(0,5)));
 }).catch(setError);},[call,id]);
 useEffect(()=>{load();call('saved.list',{kind:'event'},savedRes).then(r=>setSaved(r.items.some(x=>x.target_id===id))).catch(()=>{});},[load,call,id]);
 const couple=acting?.kind==='couple';
 const orgMe=!!e&&e.organizer?.id===acting?.id;
 const st=e?.me.rsvp?.status??null;const app=e?.me.application??null;const waiting=!!e?.me.waiting;
 const rsvp=async(status:'interested'|'going'|'not_going'|null,showInList?:boolean)=>{
  if(!e)return;setBusy(true);
  try{const r=await call('event.rsvp',{opId:op.current,eventId:id,status,...(showInList!==undefined?{showInList}:{})},rsvpRes);op.current=newOpId();
   toast(r.pending?t('fe.cm.rsvpT.waitsPartner'):showInList!==undefined?t('fe.cm.visSaved'):status===null?t('fe.cm.rsvpT.cleared'):status==='going'?t(e.format==='online'?(couple?'fe.cm.rsvpT.goingOnlineCouple':'fe.cm.rsvpT.goingOnline'):(couple?'fe.cm.rsvpT.goingOfflineCouple':'fe.cm.rsvpT.goingOffline'))
    :status==='interested'?t(couple?'fe.cm.rsvpT.interestedCouple':'fe.cm.rsvpT.interested'):t(couple?'fe.cm.rsvpT.notCouple':'fe.cm.rsvpT.not'),{type:'ok'});load();}
  catch(x){toast(feErrorMessage(x,t),{type:'err'});op.current=newOpId();}finally{setBusy(false);}
 };
 const save=async()=>{const on=!saved;setSaved(on);try{await call('saved.set',{opId:newOpId(),kind:'event',targetId:id,on},okRes);toast(t(on?'fe.cm.saved':'fe.cm.unsaved'),on?{type:'ok'}:{});}catch(x){setSaved(!on);toast(feErrorMessage(x,t),{type:'err'});}};
 const share=async()=>{setLayer('');const okc=await copyLink(appUrl('/n/events/'+id));toast(t(okc?'fe.cm.evLinkCopied':'fe.cm.copyFailed'),{type:okc?'ok':'warn'});};
 const withdraw=async()=>{if(!app)return;setBusy(true);try{await call('event.applicationWithdraw',{opId:newOpId(),applicationId:app.id},okRes);setLayer('');toast(t('fe.cm.appWithdrawn'),{type:'ok'});load();}catch(x){toast(feErrorMessage(x,t),{type:'err'});}finally{setBusy(false);}};
 const tz=e?evTz(e):USER_TZ;const away=!!e&&e.format==='online'&&e.tz!==USER_TZ;
 const open=!!e&&e.state==='published'&&!e.past;const cancelled=e?.state==='cancelled';
 const admitted=!!e&&(orgMe||(!!e.joinUrl||!!e.exactAddress));
 const statusPill=!e?null:cancelled?<span className="pill bad">{t('fe.cm.st.cancelled')}</span>:orgMe?<span className="pill v">{t(couple?'fe.cm.st.organizerCouple':'fe.cm.st.organizer')}</span>
  :e.past?null:app?.state==='pending'?<span className="pill wait">{t('fe.cm.st.pending')}</span>:app?.state==='approved'?<span className="pill ok">{t('fe.cm.st.approved')}</span>
  :app?.state==='declined'?<span className="pill bad">{t('fe.cm.st.declined')}</span>:st==='going'?<span className="pill ok">{t('fe.cm.st.going')}</span>:st==='interested'?<span className="pill v">{t('fe.cm.st.interested')}</span>:null;
 const showRsvp=!!e&&open&&!orgMe&&(!e.requiresApplication||app?.state==='approved');
 let cta:ReactNode=null;
 if(e&&!orgMe){
  if(cancelled)cta=<Btn kind="soft" onClick={()=>navigate('/n/communities?sub=events')}>{t('fe.cm.similar')}</Btn>;
  else if(e.past)cta=<Btn kind="soft" className="off" disabled>{t('fe.cm.ended')}</Btn>;
  else if(e.requiresApplication&&!app&&!waiting)cta=<Btn icon={FileText} onClick={()=>navigate(`/n/events/${id}/apply`)}>{couple?t('fe.host.app.applyCouple'):t('fe.host.app.apply')}</Btn>;
  else if(e.requiresApplication&&app?.state==='pending')cta=<Btn kind="soft" onClick={()=>setLayer('withdraw')}>{t('fe.host.app.withdraw')}</Btn>;
  else if(e.requiresApplication&&app?.state==='declined')cta=<Btn kind="soft" className="off" disabled>{t('fe.cm.appDeclined')}</Btn>;
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
  <header className="bar overlay ev-bar">
   <button type="button" className="ibtn glass" aria-label={t('fe.back')} onClick={()=>navigate(-1)}><ChevronLeft/></button>
   <b className="ev-bar-t" aria-hidden="true">{e?.title}</b><span style={{flex:1}}/>
   {e&&<><button type="button" className="ibtn glass" aria-pressed={saved} aria-label={t(saved?'fe.cm.unsave':'fe.cm.save')} onClick={()=>void save()}>{saved?<BookmarkCheck/>:<Bookmark/>}</button>
    <button type="button" className="ibtn glass" aria-label={t('fe.cm.share')} onClick={()=>void share()}><Share/></button>
    <button type="button" className="ibtn glass" aria-label={t('fe.cm.more')} onClick={()=>setLayer('menu')}><Ellipsis/></button></>}
  </header>
  <div className={'view nodock top0'+(cta?' cta1':'')}><div className="wrap">
   {error?<Empty icon={Lock} title={t('fe.cm.evUnavailable')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :!e?<><div className="ev-hero"><i className="sk" style={{position:'absolute',inset:0}}/></div><Skel kind="list" rows={4}/></>
    :<>
     <div className="ev-hero"><NamedPlate k={e.plate} icon={Calendar}/><div className="pc-info">
      <div className="row g8" style={{marginBottom:10}}><span className="pill" style={{background:'rgba(255,255,255,.2)',color:'#fff'}}>{e.format==='online'?<Video/>:<MapPin/>}{e.format==='online'?t('fe.ev.online'):e.area??t('fe.ev.offline')}</span><span className="pill" style={{background:'rgba(255,255,255,.2)',color:'#fff'}}>{t('fe.ev.kind.'+e.kind)}</span></div>
      <h2 className="ev-title" tabIndex={-1}>{e.title}</h2>
      {statusPill&&<div className="ev-hero-st">{statusPill}</div>}
     </div></div>
     {orgMe&&<div className="entity-manage"><button type="button" className="btn md soft manage-entry" onClick={()=>navigate(`/n/events/${e.id}/manage`)}><Settings/>{t('fe.host.manage')}</button></div>}
     {cancelled&&<div className="alert err mt16"><TriangleAlert/><span><b>{t('fe.cm.evCancelled')}</b>{e.cancelReason??''}</span></div>}
     {e.state==='pending_partner'?<div className="alert warn mt16"><Clock/><span><b>{t('fe.cm.waitsPartnerT')}</b>{t('fe.cm.waitsPartnerText')}</span></div>
      :e.state==='in_review'?<div className="alert warn mt16"><Clock/><span><b>{t('fe.cm.inReview')}</b>{t(couple?'fe.cm.evReviewTextCouple':'fe.cm.evReviewText')}</span></div>
      :e.state==='rejected'?<div className="alert err mt16"><Ban/><span><b>{t('fe.cm.rejected')}</b>{String((e as {rejectReason?:unknown}).rejectReason??'')}</span></div>:null}
     <div className="card list mt16">
      {e.organizer&&<button type="button" className="li" onClick={()=>navigate(orgMe?'/n/me':'/n/people/'+e.organizer!.id)}><Av name={pname(e.organizer)} seed={e.organizer.id} size="sm"/><span className="tx"><b>{pname(e.organizer)}</b><small>{t('fe.ev.organizer')}</small></span><ChevronRight/></button>}
      {comm&&<button type="button" className="li" onClick={()=>navigate('/n/communities/'+comm.id)}><span className="av sm" style={{position:'relative'}}><NamedPlate k={comm.plate}/></span><span className="tx"><b>{comm.name}</b><small>{t('fe.cm.community')}</small></span><ChevronRight/></button>}
     </div>
     {showRsvp&&<section className="rsvp-box"><div className="rsvp-h"><b>{t(couple?'fe.cm.rsvpQCouple':'fe.ev.question')}</b>
       {waiting?<span className="pill wait"><Clock/>{t('fe.cm.st.waiting')}</span>:st?<Btn kind="text" auto onClick={()=>void rsvp(null)} disabled={busy}>{t('fe.cm.clearAnswer')}</Btn>:<span className="note">{t('fe.cm.noAnswer')}</span>}</div>
      <div className={'rsvp'+(st?' has':'')+(couple?' us':'')} role="radiogroup" aria-label={t('fe.cm.yourAnswer')}>
       {([['interested','r-interested',Eye],['going','r-going',Check],['not_going','r-not',X]] as const).map(([v,cls,Ic])=>
        <button key={v} type="button" className={cls+(st===v?' on':'')} role="radio" aria-checked={st===v} onClick={()=>void rsvp(st===v?null:v)} disabled={busy}><Ic/><span>{t((couple?'fe.cm.rsvpC.':'fe.cm.rsvp.')+v)}</span></button>)}
      </div></section>}
     {!orgMe&&open&&<EventApplicationLines e={e}/>}
     <div className="card list mt12">
      <div className="li"><span className="ico l"><Calendar/></span><span className="tx"><b>{inTz(e.startsAt,tz,locale,{weekday:'short',day:'numeric',month:'long'})}</b>
       <small>{timeOf(e.startsAt,tz,locale)}–{timeOf(e.endsAt,tz,locale)} {t(e.format==='online'?'fe.ev.yourTime':'fe.cm.localTime')}{away&&<><br/>{t('fe.cm.forOrganizer')}: {timeOf(e.startsAt,e.tz,locale)}–{timeOf(e.endsAt,e.tz,locale)} {e.tz}</>}</small></span></div>
      {orgMe&&!cancelled&&(e.joinUrl||e.exactAddress)
       ?<button type="button" className="li" onClick={()=>setLayer('venue')}><span className="ico v">{e.format==='online'?<Video/>:<MapPin/>}</span><span className="tx"><b>{e.format==='online'?t('fe.ev.online'):e.area}</b>{venueHint&&<small style={{wordBreak:'break-all'}}>{venueHint}</small>}</span><ChevronRight/></button>
       :<div className="li"><span className="ico v">{e.format==='online'?<Video/>:<MapPin/>}</span><span className="tx"><b>{e.format==='online'?t('fe.ev.online'):e.area}</b>{venueHint&&<small>{venueHint}</small>}</span>{!admitted&&!cancelled&&!e.past&&<span className="lockpill"><Lock/></span>}</div>}
      {!cancelled&&<div className="li"><span className="ico a"><Ticket/></span><span className="tx"><b>{priceText(e.price,t,locale)}</b>{priceSub&&<small>{priceSub}</small>}</span></div>}
     </div>
     <div className="sec">{t('fe.ev.about')}</div><div className="md bio"><p>{e.description}</p></div>
     {e.requirements&&<><div className="sec">{t('fe.ev.requirements')}</div><div className="card">{e.requirements.split('\n').filter(Boolean).map((r,i)=><div key={i} className="fact"><i className="v"><Check/></i><span>{r}</span></div>)}<p className="note mt8">{t('fe.cm.reqNote')}</p></div></>}
     {going+interested===0?(orgMe&&!cancelled&&!e.past&&<><div className="sec">{t('fe.cm.crowd')}</div><p className="note">{t('fe.cm.nobodyYet')}</p></>)
      :<><div className="sec">{e.past?t('fe.cm.whoWas'):t('fe.cm.crowd')}</div><div className="card list">
       <LinkRow av={faces.length?<span className="av-stack">{faces.map(f=><Av key={f.id} name={pname(f)} seed={f.id} size="sm"/>)}</span>:undefined}
        title={fill(t(e.past?'fe.cm.attendedN':'fe.cm.goingN'),{n:going})} sub={e.past?undefined:fill(t('fe.cm.interestedN'),{n:interested})} onClick={()=>navigate(`/n/events/${id}/attendees`)}/></div></>}
     {!orgMe&&open&&(st==='going'||st==='interested')&&<><div className="sec">{t('fe.cm.visibility')}</div><div className="card list">
      <button type="button" className="li" role="switch" aria-checked={!!e.me.rsvp?.showInList} disabled={busy} onClick={()=>void rsvp(st as 'going'|'interested',!e.me.rsvp?.showInList)}>
       <span className="tx"><b>{t(couple?'fe.cm.showOurs':'fe.cm.showMine')}</b><small>{t(couple?'fe.cm.showOursSub':'fe.cm.showMineSub')}</small></span><span className={'sw'+(e.me.rsvp?.showInList?' on':'')} aria-hidden="true"/></button></div></>}
     {!!e.announcements?.length&&<><div className="sec">{t('fe.cm.orgUpdates')}</div>{e.announcements.map(a=><div key={a.id} className="upd"><span className="ico l"><Bell/></span><span className="tx">
      <p style={{color:'var(--ink)',margin:0}}>{a.body}</p><small>{a.automatic?t('fe.cm.auto'):''}{when(a.created_at,locale)}</small></span></div>)}</>}
    </>}
  </div></div>
  {cta&&<div className="ctabar"><div className="wrap">{cta}</div></div>}
  {e&&layer==='menu'&&<CSheet title={t('fe.cm.event')} onClose={()=>setLayer('')}><div className="card list">
   <LinkRow icon={CalendarPlus} title={t('fe.cm.addCal')} noChev onClick={()=>{setLayer('');downloadIcs(e);toast(t('fe.cm.calDone'),{type:'ok'});}}/>
   {!orgMe&&<LinkRow icon={Flag} danger title={t('fe.cm.report')} noChev onClick={()=>setLayer('report')}/>}
  </div></CSheet>}
  {e&&layer==='venue'&&<CSheet title={t(e.format==='online'?'fe.cm.joinT':'fe.cm.addressT')} onClose={()=>setLayer('')}
   foot={<>{e.format==='online'?(e.joinUrl&&<a className="btn primary" style={{textDecoration:'none'}} href={e.joinUrl} target="_blank" rel="noreferrer noopener"><ExternalLink/>{t('fe.cm.openLink')}</a>)
    :(e.exactAddress&&<a className="btn primary" style={{textDecoration:'none'}} href={'https://www.openstreetmap.org/search?query='+encodeURIComponent(e.exactAddress)} target="_blank" rel="noreferrer noopener"><MapIcon/>{t('fe.cm.openMaps')}</a>)}
    <Btn kind="soft" icon={CalendarPlus} onClick={()=>{downloadIcs(e);toast(t('fe.cm.calDone'),{type:'ok'});}}>{t('fe.cm.toCal')}</Btn></>}>
   {e.format==='online'?<div className="card flat"><div className="flabel">{t('fe.cm.link')}</div><b style={{fontSize:16,wordBreak:'break-all'}}>{e.joinUrl}</b></div>
    :<><div className="card flat"><b style={{fontSize:16}}>{e.exactAddress}</b><p className="note mt8">{e.area} · {inTz(e.startsAt,tz,locale,{weekday:'short',day:'numeric',month:'long'})}, {timeOf(e.startsAt,tz,locale)}</p></div><p className="note mt12">{t('fe.cm.addrNote')}</p></>}
  </CSheet>}
  {e&&layer==='withdraw'&&<Ask icon={FileText} danger title={t('fe.host.app.withdrawQ')} text={t('fe.host.app.withdrawText')} ok={t('fe.host.app.withdrawOk')} busy={busy} onOk={()=>void withdraw()} onCancel={()=>setLayer('')}/>}
  {e&&layer==='report'&&<ReportSheet targetType="event" targetId={e.id} onClose={()=>setLayer('')} onDone={msg=>{setLayer('');toast(msg,{type:'ok'});}}/>}
 </>;
}
