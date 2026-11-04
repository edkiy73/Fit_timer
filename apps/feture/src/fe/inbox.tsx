import {Fragment,useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AlarmClock,AtSign,Bell,Calendar,CalendarClock,CalendarX,Check,CircleCheck,Clock,Crown,EyeOff,Filter,Heart,Image as ImageIcon,LifeBuoy,Link2,LockOpen,MapPin,Megaphone,MessageCircle,Pencil,Shield,ShieldAlert,ShieldCheck,Trash2,TriangleAlert,UserCheck,UserMinus,Users,X,type LucideIcon} from 'lucide-react';
import {DECIDE_KINDS,FILTERS as KINDS,actOf,destination,entryFor,noteLine,textOf,type Entry} from '../../contracts/notifications.mjs';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {ActingAv,Actions,Answer,Av,Bar,Btn,Card,Chip,Chips,Empty,IconBtn,LoadMore,NoteDecision,NoteEvent,NoteNews,NoteResult,NoteSafety,NoteSummary,PersonLine,Pill,Row,SafetyDecision,SectionLabel,Seg,Sheet,Skel,type NoteTone,useScrollTo,View} from './kit';
import {useFe,useLive,useRealtime} from './session';
import {useSideNav} from './wide';
import {useToast} from './toast';
import {when} from './feed';
import {statusText} from './note-status';
import {faceFields,NameBadges,withAge} from './faces';
import {useDecline} from './private';
import {evParts,evWhen} from './event-time';
import {AppealSheet} from './appeal';
import {plural} from './post-parts';
import {StatusDecision,onStatusAnswered,useStatusTodo} from './status-todo';
import {groupRows,inboxScrollKey,inboxSearch,mergeRows,readInboxUrl,type InboxFilter,type InboxTab} from './inbox-url';

/** The notification center (docs/notifications.md, stage 5): «Нужно решить» (tasks of every profile of the account,
 * grouped «Тебе» / «Паре» with an active couple) and «Все уведомления» (the whole history, paged, «Новые» / «Ранее»,
 * filter chips, «Прочитать все»). Every row and every task is drawn by one of the kit's six card templates, picked by
 * the catalog's `card`; every word comes from the catalog. The tab and the filter live in the address, the scroll is
 * kept per address. A moderation decision opens its own card (`InboxNoteScreen`). */
const actor=z.object({id:z.uuid(),kind:z.enum(['person','couple']).optional(),handle:z.string().nullable().optional(),name:z.string().nullable().optional(),...faceFields}).passthrough().nullable();
type Actor=z.infer<typeof actor>;
const objRef=z.object({type:z.string(),id:z.uuid().nullable(),title:z.string().nullable().optional(),startsAt:z.string().optional(),tz:z.string().nullable().optional(),
 state:z.string().optional(),gone:z.boolean().optional()}).passthrough();
const decision=z.object({kind:z.string(),id:z.uuid(),objectId:z.uuid().nullable().optional(),actor:actor.optional(),at:z.string(),label:z.string().default('me'),addressee:z.uuid().nullable().optional(),
 object:objRef.nullable().optional(),rev:z.number().optional(),answers:z.array(z.object({q:z.string().nullable(),a:z.string()})).optional(),scopes:z.array(z.string()).optional(),
 link:z.object({kind:z.string(),to:z.string().nullable()}).optional(),
 // A couple approval's own fields (couple approvals, another PR): optional, the card falls back without them.
 approvalId:z.uuid().optional(),approvalKind:z.string().optional(),summary:z.union([z.string(),z.array(z.string())]).optional()}).passthrough();
type Decision=z.infer<typeof decision>;
const decideRes=z.object({ok:z.literal(true),items:z.array(decision)});
const decideOne=z.object({ok:z.literal(true),item:decision});
const ref=z.object({type:z.string(),id:z.uuid().nullable()});
const note=z.object({id:z.uuid(),type:z.string(),actor,data:z.record(z.string(),z.unknown()),label:z.string(),addressee:z.uuid().nullable().optional(),object:objRef.nullable(),
 sub:ref.nullable().optional(),couple:z.uuid().nullable().optional(),coupleName:z.string().nullable().optional(),collapse:z.string().nullable().optional(),at:z.string(),read:z.boolean()});
type Note=z.infer<typeof note>;
const notesRes=z.object({ok:z.literal(true),items:z.array(note),next:z.string().nullable()});
const noteRes=z.object({ok:z.literal(true),item:note,appeal:z.enum(['available','open','granted','denied','none']).nullable(),material:z.object({excerpt:z.string(),at:z.string().nullable()}).nullable().optional()});
export const countsRes=z.object({ok:z.literal(true),decide:z.number(),notifications:z.number(),bell:z.number(),chats:z.number(),newMatches:z.number(),requests:z.number().default(0),likes:z.number(),staff:z.boolean().default(false)});
type Counts=z.infer<typeof countsRes>;
const ok=z.object({ok:z.literal(true)}).passthrough();
/** The people of a summary card, newest first, each once (one person may like twice); with the row they did it in. */
const peopleOf=(group:Note[])=>{const seen=new Set<string>();const out:{a:NonNullable<Actor>,n:Note}[]=[];
 for(const n of group)if(n.actor&&!seen.has(n.actor.id)){seen.add(n.actor.id);out.push({a:n.actor,n});}return out;};
const nameOf=(a:Actor|undefined)=>a?(a.name||(a.handle?'@'+a.handle:'?')):'KINHAZE';

/** The one tab control under its older name here. */
export const SegN=Seg;

/** Bell with the shared count, for screen headers: tasks and unread notifications, each named in its label. Where the
 * side menu is on screen its «Уведомления» item carries the same count, so the headers drop the bell (owner 04.11.2026). */
export function BellButton(){return useSideNav()?null:<HeaderBell/>;}
function HeaderBell(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const [c,setC]=useState<{decide:number,notifications:number}>({decide:0,notifications:0});
 const live=useRef(true);
 const pull=useCallback(()=>{call('inbox.counts',{},countsRes,{asAccount:true}).then(r=>{if(live.current)setC({decide:r.decide,notifications:r.notifications});}).catch(()=>{});},[call]);
 useEffect(()=>onStatusAnswered(pull),[pull]);
 // Realtime signals refresh the count at once; the 30 s poll stays as the fallback.
 useEffect(()=>{live.current=true;pull();const id=setInterval(pull,30000);return ()=>{live.current=false;clearInterval(id);};},[pull]);
 useRealtime(['notify','decide','chat'],pull);
 const n=c.decide+c.notifications;
 return <IconBtn icon={Bell} label={n?t('fe.ibx.bellBoth',{d:String(c.decide),n:String(c.notifications)}):t('fe.inbox.title')} badge={n>0?n:undefined} onClick={()=>navigate('/n/inbox')}/>;
}

/* ---- the catalog's icons and filters (contracts/notifications.mjs) ---- */
type Kind=Exclude<InboxFilter,'all'>;
const FILTERS:InboxFilter[]=['all',...KINDS];
/** Lucide icons by the catalog's names. */
const ICONS:Record<string,LucideIcon>={AlarmClock,AtSign,Bell,Calendar,CalendarClock,CalendarX,Check,Clock,Crown,EyeOff,Heart,Image:ImageIcon,LifeBuoy,LockOpen,MapPin,Megaphone,MessageCircle,Pencil,Shield,ShieldAlert,ShieldCheck,Trash2,TriangleAlert,UserCheck,UserMinus,Users};
const noteKind=(n:Note):Kind=>entryFor(n.type,n.data)?.filter??'other';
/** A couple approval: by its kind, or by the fields the approvals PR adds. */
const isJoint=(d:Decision)=>d.kind==='joint'||d.kind==='jointReturned'||!!d.approvalId||!(DECIDE_KINDS as readonly string[]).includes(d.kind);
const jointBase=(d:Decision)=>d.kind==='jointReturned'?'jointReturned':'joint';
/** The kind of change a couple approval is about (`decide.joint.<kind>` in the catalog, when it has its own words). */
const approvalKind=(d:Decision)=>d.approvalKind??(!(DECIDE_KINDS as readonly string[]).includes(d.kind)?d.kind:undefined);
const decideEntry=(d:Decision):Entry|null=>isJoint(d)?entryFor('decide.'+jointBase(d),{kind:approvalKind(d)}):entryFor('decide.'+d.kind,{label:d.label});
const decideKind=(d:Decision):Kind=>decideEntry(d)?.filter??'other';
const MODERATION=['contentRemoved','reportResolved','profileSuspended','profileRestricted','profileRestored','profileUnrestricted','appealDecided','revisionRejected','mediaDecided'];

/** A reason code as a label people read («Спам», «Угрозы и шантаж»): sentence case from the dictionary; a code this
 * app does not know yet says «Нарушение правил», never the raw value. */
const reasonLabel=(t:(k:string)=>string,code:unknown)=>{
 if(typeof code!=='string'||!code)return null;
 const k='fe.ibx.why.'+code;const s=t(k);return s===k?t('fe.ibx.why.other'):s;
};

/** «{name} …» / «{couple} · …» with the name in bold, as the prototype's NTXT. */
function rich(text:string,names:Record<'name'|'couple',string>):ReactNode{
 return text.split(/(\{name\}|\{couple\})/).map((p,i)=>p==='{name}'?<b key={i}>{names.name}</b>:p==='{couple}'?<b key={i}>{names.couple}</b>:<Fragment key={i}>{p}</Fragment>);
}

/** Pages of the history kept for this tab's life, per filter: going back shows what was loaded, then the first page is
 * read again and merged in (no duplicates, the server's order). */
const PAGES=new Map<InboxFilter,{items:Note[],next:string|null}>();

export function InboxScreen(){
 const {call,state,acting,reload}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();const sideNav=useSideNav();
 const [params,setParams]=useSearchParams();const url=readInboxUrl(params);
 const [chosen,setChosen]=useState<InboxTab|null>(url.tab);
 const filter=url.filter;
 const [decide,setDecide]=useState<Decision[]|null>(null);
 const [page,setPage]=useState<{items:Note[],next:string|null}|null>(()=>PAGES.get(filter)??null);
 const [counts,setCounts]=useState<Counts|null>(null);
 const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState('');const [readAllBusy,setReadAllBusy]=useState(false);
 const [who,setWho]=useState<Note[]|null>(null);
 const [moreBusy,setMoreBusy]=useState(false);const [moreErr,setMoreErr]=useState<unknown>(null);

 const keep=(f:InboxFilter,p:{items:Note[],next:string|null})=>{PAGES.set(f,p);return p;};
 const loadNotes=useCallback((fresh=false)=>call('notifications.list',filter==='all'?{}:{filter},notesRes,{asAccount:true,fresh}).then(r=>{
  setPage(cur=>{const had=fresh?null:(cur??PAGES.get(filter)??null);
   // The kept pages go on past the first one: their cursor still holds; a refresh starts over.
   const next=had&&had.items.length>r.items.length?had.next:r.next;
   return keep(filter,{items:mergeRows(had?.items??[],r.items),next});});
 }),[call,filter]);
 const load=useCallback((fresh=false)=>{setError(null);
  Promise.all([call('decide.list',{},decideRes,{asAccount:true,fresh}).then(r=>setDecide(r.items.filter(d=>d.kind!=='status'))),loadNotes(fresh),
   call('inbox.counts',{},countsRes,{asAccount:true,fresh}).then(setCounts)]).catch(setError);},[call,loadNotes]);
 useEffect(()=>{setPage(PAGES.get(filter)??null);setMoreErr(null);load();},[load,filter]);
 // Live data: another device, the partner or staff changed something (live.ts).
 useLive(['notify','decide'],()=>load());
 const more=async()=>{
  if(!page?.next||moreBusy)return;setMoreBusy(true);setMoreErr(null);
  try{const r=await call('notifications.list',{...(filter==='all'?{}:{filter}),cursor:page.next},notesRes,{asAccount:true});
   setPage(cur=>keep(filter,{items:mergeRows(cur?.items??[],r.items),next:r.next}));}
  catch(e){setMoreErr(e);}finally{setMoreBusy(false);}
 };

 const profiles=state.status==='ready'?state.boot.profiles.filter(p=>p.state!=='deleted'):[];
 const couple=profiles.find(p=>p.kind==='couple'&&p.state==='active')??null;
 const person=profiles.find(p=>p.kind==='person')??null;
 // V21 `inboxTab`: opens on «Нужно решить» when something waits, else on all notifications — chosen once, on the
 // first read; deciding the last card keeps «Нужно решить» (its own empty state) instead of jumping away.
 const st=useStatusTodo().show;
 useEffect(()=>{if(chosen===null&&decide!==null)setChosen(decide.length||st?'todo':'all');},[chosen,decide,st]);
 const k:InboxTab=chosen??(decide&&decide.length===0&&!st?'all':'todo');
 const go=(tab:InboxTab,f:InboxFilter)=>{setChosen(tab);setParams(inboxSearch(params,{tab,filter:f}),{replace:true});};
 const pickTab=(v:InboxTab)=>go(v,'all');
 const pickFilter=(f:InboxFilter)=>go(k,f);

 /** One decision at a time: the card's buttons blink, the list reloads after. */
 const act=async(key:string,fn:()=>Promise<unknown>,done?:string)=>{
  if(busy)return;setBusy(key);
  // A failure reloads too: the item may have been answered elsewhere (another device, the partner).
  // A couple's answer may wait for the partner (`pending`): the toast says so instead of «Готово».
  try{const r=await fn();const waits=!!r&&typeof r==='object'&&'pending' in r&&!!(r as {pending?:unknown}).pending;
   if(waits)toast(t('fe.ln.t.pending'),{type:'ok'});else if(done)toast(done,{type:'ok'});load(true);}catch(e){toast(feErrorMessage(e,t),{type:'err'});load(true);}finally{setBusy('');}
 };
 const asProfile=(d:Decision)=>d.addressee?{profileId:d.addressee}:{};
 const declineAccess=useDecline();
 const decideApp=(d:Decision,approve:boolean)=>act(d.id+(approve?'y':'n'),async()=>{
  // The request read by ID with its revision: a decision never depends on a list page.
  const x=(await call('decide.get',{kind:d.kind,id:d.id},decideOne,{asAccount:true,fresh:true})).item;
  if(x.rev===undefined)throw new FeError('not_found',404);
  if(d.kind==='capp')await call('community.requestDecide',{opId:newOpId(),requestId:d.id,rev:x.rev,approve},ok,asProfile(d));
  else await call('event.applicationDecide',{opId:newOpId(),applicationId:d.id,rev:x.rev,approve},ok,asProfile(d));
 },approve?t('fe.ibx.approved'):t('fe.ibx.declined'));
 /** Where a task opens: the catalog's destination, as the profile it is addressed to. */
 const decideObject=(d:Decision)=>isJoint(d)?{type:'approval',id:d.approvalId??d.id}:d.kind==='tag'?{type:'post',id:d.objectId??d.id}:d.kind==='capp'?{type:'community',id:d.objectId??null}
  :d.kind==='eapp'?{type:'event',id:d.objectId??null}:d.kind==='req'?{type:'accessRequest',id:d.id}:d.kind==='pinv'?{type:'invite',id:d.id}:{type:'link',id:d.id};
 const goDecide=(d:Decision)=>navigate(destination({type:isJoint(d)?'decide.'+jointBase(d):'decide.'+d.kind,data:{label:d.label,kind:approvalKind(d)},object:decideObject(d),addressee:d.addressee??null}));

 /** Marks rows read at once on the screen; a failed write is retried, and if it still fails the rows are unread again
  * and a toast offers to try once more — never a silent loss. */
 const markRead=useCallback((ids:string[],attempt=0)=>{
  if(!ids.length)return;
  const flip=(read:boolean)=>{setPage(cur=>cur?keep(filter,{...cur,items:cur.items.map(x=>ids.includes(x.id)?{...x,read}:x)}):cur);
   setCounts(c=>c?{...c,notifications:Math.max(0,c.notifications+(read?-ids.length:ids.length))}:c);};
  if(attempt===0)flip(true);
  call('notifications.read',ids.length===1?{id:ids[0]}:{ids},ok,{asAccount:true}).catch(()=>{
   if(attempt===0){setTimeout(()=>markRead(ids,1),1500);return;}
   flip(false);toast(t('fe.ibx.readFail'),{type:'err',action:{label:t('fe.retry'),fn:()=>markRead(ids)}});
  });
 },[call,filter,t,toast]);
 /** One way to a screen: the catalog's destination (also what a push opens); `as=` there switches to the profile it
  * is addressed to (shell.tsx ActAs). */
 const open=(group:Note[])=>{
  const n=group[0]!;
  markRead(group.filter(x=>!x.read).map(x=>x.id));
  navigate(destination({type:n.type,id:n.id,data:n.data,object:n.object,sub:n.sub??null,actor:n.actor?.id??null,addressee:n.addressee??null,couple:n.couple??null}));
 };
 const readAll=async()=>{
  if(readAllBusy)return;setReadAllBusy(true);
  try{await call('notifications.readAll',{},ok,{asAccount:true});
   for(const [f,p] of PAGES)PAGES.set(f,{...p,items:p.items.map(x=>({...x,read:true}))});
   setPage(cur=>cur?{...cur,items:cur.items.map(x=>({...x,read:true}))}:cur);setCounts(c=>c?{...c,notifications:0}:c);toast(t('fe.ibx.allRead'),{type:'ok'});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setReadAllBusy(false);}
 };

 /* ---- rows: the catalog's words, laid out by its card template ---- */
 const day=(v:unknown)=>{try{return new Date(String(v)).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long'});}catch{return '';}};
 const known=(key:string,vars?:Record<string,string>)=>{const s=t(key,vars);return s===key?null:s;};
 const whyOf=(code:unknown)=>reasonLabel(t,code);
 const coupleNameOf=(n:Note)=>n.coupleName||profiles.find(p=>p.id===(n.couple??n.addressee)&&p.kind==='couple')?.name||couple?.name||t('fe.inbox.whom.couple');
 const noteText=(n:Note,e:Entry|null):ReactNode=>{
  // A type this app does not know yet (a newer server): its generic line, never a blank row.
  if(!e)return n.actor?<><b>{nameOf(n.actor)}</b> · {t('fe.inbox.type.other')}</>:t('fe.inbox.type.other');
  if(n.type==='signinNew'){
   // «Вход с нового устройства: Android, Лиссабон, Португалия» — Core's device family and the edge network's place.
   const [city='',cc='']=String(n.data.place??'').split('|');let country=cc;
   try{if(cc)country=new Intl.DisplayNames([locale],{type:'region'}).of(cc)??cc;}catch{/* the code then */}
   const what=[typeof n.data.device==='string'&&n.data.device?n.data.device:t('fe.w8.sec.unknownDevice'),[city,country].filter(Boolean).join(', ')].filter(Boolean).join(', ');
   return <><b>{textOf(e.text,locale)}</b>: {what}</>;
  }
  // A moderation decision: the catalog's line alone; the reason and the term go under it.
  if(MODERATION.includes(n.type))return noteLine(e,locale,{vars:{date:day(n.data.until)}});
  const status=statusText(n,t,locale);if(status!==null)return status;
  const text=textOf(e.text,locale,n.actor?.kind==='couple');
  if(text.includes('{name}')&&!n.actor)return e.alone?textOf(e.alone,locale):actOf(e.text,locale);
  return rich(text,{name:nameOf(n.actor),couple:coupleNameOf(n)});
 };
 const tagOf=(label:string)=>couple?{text:label==='couple'?t('fe.ibx.tagCouple'):t('fe.ibx.tagMe'),us:label==='couple'}:null;
 const rowOf=(group:Note[])=>{
  const n=group[0]!;const e=entryFor(n.type,n.data);
  const icon=e?ICONS[e.icon]??Bell:Bell;const tone=(e?.tone??'') as NoteTone;
  const base={key:n.id,id:'note-'+n.id,icon,tone,time:when(n.at,locale),tag:tagOf(n.label),unread:!n.read,onClick:()=>open(group),
   gone:n.object?.gone&&e?textOf(e.gone,locale):undefined};
  const av=n.actor?<Av name={nameOf(n.actor)} seed={n.actor.id} src={n.actor.avatar}/>:undefined;
  if(group.length>1){
   // «Алиса и ещё 3 ставят лайк твоей публикации»: the plural verb of the catalog's line. Several people: the card
   // opens the list of all of them (owner 04.11.2026: «и ещё N» must say who); one person many times opens the place.
   const people=peopleOf(group);const first=people[0]?.a;
   const verb=e?textOf(e.text,locale,true):'';
   const many=people.length>1&&verb.includes('{name}');
   const text=many&&first?rich(verb,{name:t('fe.ibx.andMore',{name:nameOf(first),n:String(people.length-1)}),couple:coupleNameOf(n)})
    :<>{noteText(n,e)} · {t('fe.ibx.times',{n:String(group.length)})}</>;
   return <NoteSummary {...base} {...(many?{onClick:()=>{markRead(group.filter(x=>!x.read).map(x=>x.id));setWho(group);}}:{})}
    avs={people.slice(0,3).map(({a})=><Av key={a.id} name={nameOf(a)} seed={a.id} src={a.avatar}/>)} text={text}/>;
  }
  const text=noteText(n,e);
  switch(e?.card??'news'){
   case 'safety':{
    const rule=whyOf(n.data.rule);
    const term=['profileSuspended','profileRestricted'].includes(n.type)?(n.data.until?null:t('fe.ibx.untilLifted')):null;
    return <NoteSafety {...base} text={text} reason={rule?t('fe.ibx.reason',{rule}):null} term={term} appeal={MODERATION.includes(n.type)?t('fe.ibx.details'):null}/>;
   }
   case 'event':{
    const o=n.object;const timed=o&&!o.gone&&o.startsAt?{startsAt:o.startsAt,tz:o.tz}:null;const p=timed?evParts(timed,locale):null;
    return <NoteEvent {...base} text={text} day={p?.day} month={p?.month} title={o?.title} when={timed?evWhen(timed,locale):null}
     cancelled={o?.state==='cancelled'&&n.type!=='eventCancelled'?t('fe.ibx.cancelled'):null}/>;
   }
   case 'result':return <NoteResult {...base} av={av} text={text}/>;
   case 'summary':return <NoteSummary {...base} avs={av?[av]:[]} text={text}/>;
   default:return <NoteNews {...base} av={av} text={text}/>;
  }
 };

 /* ---- «Нужно решить»: who asks, what, about what; the name opens the person, the card opens the request ---- */
 // A couple approval's summary names the changed fields by key («bio»): the same words as the approval sheet.
 const fieldLabel=(f:string)=>{for(const k of [`fe.ap.f.${f}`,`fe.cw.field.${f}`]){const s=t(k);if(s!==k)return s;}return t('fe.ap.f.other');};
 const decisionCard=(d:Decision)=>{
  const e=decideEntry(d);const joint=isJoint(d);
  // A couple approval without its initiator yet (the approvals PR adds it): the couple it is addressed to.
  const who:Actor|undefined=d.actor??(joint?(()=>{const c=profiles.find(p=>p.id===d.addressee);return c?{id:c.id,kind:'couple' as const,name:c.name}:undefined;})():undefined);
  const name=nameOf(who);
  // The name heads the card; the line under it is the catalog's words without it («Подаёт заявку в сообщество»).
  const action=e?actOf(e.text,locale,who?.kind==='couple'):t('fe.inbox.type.other');
  const obj=d.object;
  const objLine=d.kind==='eapp'&&obj?.title?<>{obj.title}{obj.startsAt?<> · {evWhen({startsAt:obj.startsAt,tz:obj.tz},locale)}</>:null}</>
   :d.kind==='link'||d.kind==='linkChange'?(d.link?t('fe.px.lk.k.'+(d.kind==='linkChange'&&d.link.to?d.link.to:d.link.kind)):null)
   :joint?(d.summary!=null?[d.summary].flat().map(fieldLabel).join(', '):obj?.title??null)
   :obj?.title??null;
  const objIcon=d.kind==='capp'?Users:d.kind==='eapp'?Calendar:d.kind==='link'||d.kind==='linkChange'?Link2:d.kind==='tag'?ImageIcon:undefined;
  const two=(yes:{label:string,fn:()=>void},no?:{label:string,fn:()=>void})=><>
   <Btn size="md" busy={busy===d.id+'y'} disabled={!!busy} onClick={yes.fn}>{yes.label}</Btn>
   {no&&<Btn size="md" kind="soft" busy={busy===d.id+'n'} disabled={!!busy} onClick={no.fn}>{no.label}</Btn>}
  </>;
  let actions:ReactNode=null;
  if(joint)actions=two({label:t('fe.ibx.review'),fn:()=>goDecide(d)});
  else switch(d.kind){
   case 'pinv':actions=two({label:t('fe.ibx.accept'),fn:()=>void act(d.id+'y',async()=>{await call('couple.inviteAnswer',{opId:newOpId(),inviteId:d.id,accept:true},ok,{asAccount:true});reload();navigate('/n/me/pair?created=1');},t('fe.ibx.done'))},
    {label:t('fe.ibx.decline'),fn:()=>void act(d.id+'n',()=>call('couple.inviteAnswer',{opId:newOpId(),inviteId:d.id,accept:false},ok,{asAccount:true}),t('fe.ibx.declined'))});break;
   // Declining says what the person will see and offers «Отменить» while the server still allows it.
   case 'req':actions=two({label:t('fe.ibx.review'),fn:()=>goDecide(d)},
    {label:t('fe.ibx.decline'),fn:()=>{if(busy)return;setBusy(d.id+'n');void declineAccess(d.id,name,()=>load(true),asProfile(d)).finally(()=>setBusy(''));}});break;
   case 'capp':case 'eapp':actions=two({label:t('fe.ibx.approve'),fn:()=>void decideApp(d,true)},{label:t('fe.ibx.decline'),fn:()=>void decideApp(d,false)});break;
   // A change is answered with the kind seen here (audit item 21): changed since, the server asks to look again.
   case 'link':case 'linkChange':{const cmd=d.kind==='link'?'link.answer':'link.answerChange';const extra=d.kind==='link'?{vis:'all'}:{kind:d.link?.kind};
    actions=two({label:t('fe.ibx.confirm'),fn:()=>void act(d.id+'y',()=>call(cmd,{opId:newOpId(),linkId:d.id,accept:true,...extra},ok,asProfile(d)),t('fe.ibx.done'))},
     {label:t('fe.ibx.decline'),fn:()=>void act(d.id+'n',()=>call(cmd,{opId:newOpId(),linkId:d.id,accept:false,...extra},ok,asProfile(d)),t('fe.ibx.declined'))});break;}
   case 'tag':actions=two({label:t('fe.ibx.review'),fn:()=>goDecide(d)},
    {label:t('fe.ibx.against'),fn:()=>void act(d.id+'n',()=>call('tag.answer',{opId:newOpId(),postId:d.objectId??d.id,answer:'no'},ok,asProfile(d)),t('fe.ibx.declined'))});break;
  }
  const avEl=who?<Av name={name} seed={who.id} src={who.avatar}/>:<Av name={name} seed={d.id}/>;
  return <NoteDecision key={d.kind+d.id} id={'item-'+d.id} openLabel={t('fe.ibx.openRequest')} onOpen={()=>goDecide(d)}
   person={<PersonLine av={avEl} label={name} onOpen={d.actor?()=>navigate('/n/people/'+d.actor!.id):undefined}
    name={<>{d.kind==='tag'||joint?name:withAge(name,who)}<NameBadges p={who}/></>} sub={when(d.at,locale)}/>}
   action={action} object={objLine} objectIcon={objIcon} gone={obj?.gone&&e?textOf(e.gone,locale):undefined} actions={actions}>
   {d.answers&&d.answers.length>0&&d.answers.map((x,i)=><Answer key={i} q={x.q}>{x.a||t('fe.ibx.noAnswer')}</Answer>)}
   {d.kind==='req'&&d.scopes&&d.scopes.length>0&&<Chips>{d.scopes.map(s=><Pill key={s}>{t('fe.priv.scope.'+s)}</Pill>)}</Chips>}
  </NoteDecision>;
 };
 const ORDER=['pinv','link','linkChange','tag'];
 const group=(items:Decision[])=>{
  const first=items.filter(d=>ORDER.includes(d.kind)).sort((a,b)=>ORDER.indexOf(a.kind)-ORDER.indexOf(b.kind));
  return <>{first.map(decisionCard)}{items.filter(d=>!ORDER.includes(d.kind)).map(decisionCard)}</>;
 };
 const whomHead=(w:'me'|'couple',n:number)=><div className={'sec whom-sec'+(w==='couple'?' us':'')}>
  {w==='couple'?(couple?<ActingAv p={couple} size="xs"/>:null):<Av name={person?.name??'?'} seed={person?.id} size="xs" src={person?.avatar}/>}
  <span>{w==='couple'?t('fe.ibx.whomCouple').replace('{name}',couple?.name??''):t('fe.ibx.whomMe')}</span><b>{n}</b>
 </div>;
 const filteredEmpty=<Empty icon={Filter} title={t('fe.ibx.filteredEmpty')}><Btn kind="text" auto onClick={()=>pickFilter('all')}>{t('fe.ibx.resetFilter')}</Btn></Empty>;
 const todo=()=>{
  const all=decide??[];const items=all.filter(d=>filter==='all'||decideKind(d)===filter);
  // The relationship status (status-todo.tsx) is the person's own task: first, under «Мне», whatever the filter.
  const own=st&&filter==='all'?<StatusDecision/>:null;
  if(!items.length)return own??(all.length?filteredEmpty:<Empty icon={CircleCheck} title={t('fe.ibx.allDone')} text={t('fe.ibx.allDoneText')}/>);
  if(!couple)return <>{own}{group(items)}</>;
  const mine=items.filter(d=>d.label!=='couple'),ours=items.filter(d=>d.label==='couple');
  const me=mine.length||own?<>{whomHead('me',mine.length+(own?1:0))}{own}{group(mine)}</>:null,us=ours.length?<>{whomHead('couple',ours.length)}{group(ours)}</>:null;
  return acting?.kind==='couple'?<>{us}{me}</>:<>{me}{us}</>;
 };
 const everything=()=>{
  const list=page?.items??[];
  if(!list.length)return filter!=='all'?filteredEmpty:<Empty icon={Bell} title={t('fe.ibx.none')} text={t('fe.ibx.noneText')}/>;
  const neu=groupRows(list.filter(n=>!n.read)),old=groupRows(list.filter(n=>n.read));
  // «Новые» opens its own block, so its label takes the kit's first-label spacing (`.sec:first-child`).
  const readAllBtn=filter==='all'&&<Btn kind="text" size="sm" auto icon={Check} busy={readAllBusy} disabled={readAllBusy} onClick={()=>void readAll()}>{t('fe.ibx.readAll')}</Btn>;
  // Rows sit in their own block under the label, so the first one has no divider glued to the label.
  return <>{neu.length>0&&<div><SectionLabel action={readAllBtn}>{t('fe.ibx.new')}</SectionLabel><div>{neu.map(rowOf)}</div></div>}
   {old.length>0&&<div><SectionLabel>{t('fe.ibx.earlier')}</SectionLabel><div>{old.map(rowOf)}</div></div>}
   <LoadMore more={!!page?.next} busy={moreBusy} error={moreErr} onMore={()=>void more()} label={t('fe.ibx.loadingMore')}/></>;
 };
 /** «Кто это»: every person of a summary card — name, age, badges; a row opens the profile, the foot the place. */
 const whoSheet=(group:Note[])=>{
  const n=group[0]!;const e=entryFor(n.type,n.data);const people=peopleOf(group);
  const dest=destination({type:n.type,id:n.id,data:n.data,object:n.object,sub:n.sub??null,actor:n.actor?.id??null,addressee:n.addressee??null,couple:n.couple??null});
  const toPlace=!dest.startsWith('/n/people/')&&!n.object?.gone;
  const placeLabel=known('fe.ibx.who.open.'+(n.object?.type??''))??t('fe.ibx.who.open.other');
  const close=()=>setWho(null);
  return <Sheet title={e?actOf(e.text,locale,true):t('fe.ibx.who.title')} sub={plural(people.length,['человек','человека','человек'],['person','people'],locale)} onClose={close}
   foot={toPlace?<Btn kind="soft" onClick={()=>{close();open(group);}}>{placeLabel}</Btn>:undefined}>
   <Card list>{people.map(({a,n:x})=><Row key={a.id} av={<Av name={nameOf(a)} seed={a.id} src={a.avatar}/>}
    title={<>{withAge(nameOf(a),a)}<NameBadges p={a}/></>} sub={when(x.at,locale)}
    onClick={()=>{close();navigate('/n/people/'+a.id);}}/>)}</Card>
  </Sheet>;
 };
 const kinds=new Set<Kind>(k==='todo'?(decide??[]).map(decideKind):(page?.items??[]).map(noteKind));
 const loading=decide===null||(k==='all'?page===null:false);
 // A link to one task (`?item=`, an invitation from a push): scrolled to and lit; gone already — said once.
 useScrollTo(url.item?'item-'+url.item:null,k==='todo'&&decide!==null);
 const told=useRef('');
 useEffect(()=>{if(url.item&&decide&&told.current!==url.item&&!decide.some(d=>d.id===url.item)){told.current=url.item;toast(t('fe.ibx.itemGone'));}},[url.item,decide,toast,t]);
 const nTodo=counts?.decide??(decide?.length??0)+(st?1:0);/* the server's number holds the status card too */const nAll=counts?.notifications??(page?.items??[]).filter(n=>!n.read).length;
 return <>
  {/* With the side menu «Уведомления» is a section of its own there: no «‹», like every other section. */}
  <Bar title={t('fe.inbox.title')} {...(sideNav?{}:{back:true as const})}/>
  <View className="nodock" refresh={()=>load(true)} keep={loading?null:inboxScrollKey({tab:k,filter})}>
   <SegN small value={k} onChange={pickTab} options={[{id:'todo',label:t('fe.inbox.todo'),n:nTodo},{id:'all',label:t('fe.inbox.all'),n:nAll}]}/>
   {!loading&&!error&&<Chips scroll className="inbox-filters">{FILTERS.filter(v=>v==='all'||v===filter||kinds.has(v)).map(v=>
    <Chip key={v} on={filter===v} onClick={()=>pickFilter(v)}>{t('fe.ibx.f.'+v)}</Chip>)}</Chips>}
   {error&&loading?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={()=>load(true)}>{t('fe.retry')}</Btn></Empty>
    :loading?<Skel kind="list" rows={5}/>
    :k==='todo'?todo():everything()}
  </View>
  {who&&whoSheet(who)}
 </>;
}

/** A moderation decision's own card (`/n/inbox/:id`): what was decided, why, until when, the appeal — «Обжаловать»
 * while it can be appealed (the one `AppealSheet`). Never other reporters, never the closed material: a resolved
 * report says only its outcome. */
export function InboxNoteScreen(){
 const {id=''}=useParams();const {call,state}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [r,setR]=useState<z.infer<typeof noteRes>|null>(null);const [error,setError]=useState<unknown>(null);const [appealing,setAppealing]=useState(false);
 const load=useCallback(()=>{setError(null);call('notifications.get',{id},noteRes,{asAccount:true,fresh:true}).then(x=>{setR(x);
  if(!x.item.read)call('notifications.read',{id},ok,{asAccount:true}).catch(()=>{/* the inbox row stays unread; nothing else depends on it */});}).catch(setError);},[call,id]);
 useEffect(()=>{load();},[load]);
 useLive('notify',load);
 const day=(v:unknown)=>{try{return new Date(String(v)).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long',year:'numeric'});}catch{return '';}};
 const known=(key:string)=>{const s=t(key);return s===key?null:s;};
 const whyOf=(code:unknown)=>reasonLabel(t,code);
 const body=()=>{
  if(error)return <Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>;
  if(!r)return <Skel kind="card" rows={1}/>;
  const n=r.item;const d=n.data;const e=entryFor(n.type,d);
  const title=e?noteLine(e,locale,{vars:{date:new Date(String(d.until)).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long'})}}):t('fe.inbox.type.other');
  const rule=d.rule!=='expired'?whyOf(d.rule):null;
  const what=typeof d.targetType==='string'&&n.type!=='reportResolved'?known('fe.ibx.target.'+d.targetType):null;
  const term=n.type==='profileSuspended'||n.type==='profileRestricted'?(d.until?t('fe.ibx.termUntil',{date:day(d.until)}):t('fe.ibx.untilLifted'))
   :(n.type==='profileRestored'||n.type==='profileUnrestricted')?(d.rule==='expired'?t('fe.ibx.termEnded'):t('fe.ibx.termLifted')):null;
  const effect=n.type==='profileRestricted'?t('fe.ibx.restrictedEffectLong'):n.type==='profileSuspended'?t('fe.ibx.suspendedEffect'):null;
  const outcome=n.type==='reportResolved'?(d.resolution==='removed'?t('fe.ibx.report.removed'):d.resolution==='kept'?t('fe.ibx.report.kept'):d.resolution==='unavailable'?t('fe.ibx.report.unavailable'):null):null;
  const appeal=r.appeal&&r.appeal!=='none'&&r.appeal!=='available'?t('fe.ibx.appeal.'+r.appeal):null;
  const material=r.material?(r.material.excerpt?'«'+r.material.excerpt+'»':'')+(r.material.at?' · '+day(r.material.at):''):null;
  // What a restriction limits (audit item 6), in the notice's words.
  const limits=n.type==='profileRestricted'&&Array.isArray(d.scope)?(d.scope as unknown[]).filter((x):x is string=>typeof x==='string').map(x=>t('fe.rst.pt.'+x)).join(', '):null;
  const facts:[string,ReactNode][]=[[t('fe.ibx.f2.what'),what],[t('fe.ibx.f2.material'),material||null],[t('fe.ibx.f2.limits'),limits||null],[t('fe.ibx.f2.reason'),rule],[t('fe.ibx.f2.term'),term],[t('fe.ibx.f2.effect'),effect],
   [t('fe.ibx.f2.outcome'),outcome],[t('fe.ibx.f2.appeal'),appeal],[t('fe.ibx.f2.when'),when(n.at,locale)]];
  const profile=n.addressee??(state.status==='ready'?state.boot.profiles.find(p=>p.kind==='person')?.id:null)??null;
  const target=n.type==='profileRestricted'?{type:'profile' as const,id:profile}:typeof d.targetType==='string'&&typeof d.targetId==='string'&&['post','reply','community','event','media','revision'].includes(d.targetType)
   ?{type:d.targetType as 'post'|'reply'|'community'|'event'|'media'|'revision',id:d.targetId}:null;
  const icon=e?ICONS[e.icon]??Shield:Shield;
  return <>
   <SafetyDecision icon={icon} tone={(e?.tone??'l') as NoteTone} title={title} facts={facts}>
    <Actions stack>
     {r.appeal==='available'&&target?.id&&<Btn onClick={()=>setAppealing(true)}>{t('fe.cm.appeal')}</Btn>}
     {n.type==='profileSuspended'&&<Btn kind="soft" onClick={()=>navigate('/n/help')}>{t('fe.ibx.toSupport')}</Btn>}
     <Btn kind="ghost" onClick={()=>navigate('/n/inbox?tab=all')}>{t('fe.ibx.toInbox')}</Btn>
    </Actions>
   </SafetyDecision>
   {appealing&&target?.id&&<AppealSheet targetType={target.type} id={target.id} profileId={profile} onClose={()=>setAppealing(false)}
    onDone={msg=>{setAppealing(false);toast(msg,{type:'ok'});load();}}/>}
  </>;
 };
 return <>
  <Bar title={t('fe.ibx.decisionTitle')} back/>
  <View className="nodock">{body()}</View>
 </>;
}
