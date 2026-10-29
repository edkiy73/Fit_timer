import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Calendar,Check,ChevronLeft,CircleAlert,Clock,EyeOff,Link as LinkIcon,Lock,MapPin,RefreshCw,Ticket,Unlock,Video} from 'lucide-react';
import {FeError,feErrorMessage} from '../feture/fe-api';
import {Alert,Av,Bar,Btn,Card,Chip,Chips,Empty,EventTile,Group,Note,Row,Seg,SectionLabel,Select,Skel,Steps,ToggleRow,View,useLeaveGuard} from './kit';
import {PickField,PlacePicker} from './kit/Place';
import {useFe} from './session';
import {ONLINE_ZONES,placeZone,zoneLabel} from './event-time';
import {FIELD,lineRule,serverFields,textError,textErrorMessage,type FieldName} from './kit/validate';
import {ChipGroup,CoverField,FErr,Field,PLATE_KEYS,SelectRow,namedPlate,placeName,reviewNotice,shakeFirstErr,useCatalog,useOp,type Cover,type PlateKey} from './create-community';

/** V21 E11 «Новое событие»: four steps (basics, time and place, admission, review), the draft saved on the server at
 * every step and on «В черновик», then `event.submit` (staff review). The client checks the limits of `eventFields`;
 * the server decides. */

type Kind='meetup'|'workshop'|'talk'|'party';
type Price='free'|'door'|'ext';
type Form={title:string,kind:Kind|'',description:string,communityId:string,plate:PlateKey,cover:Cover|null,
 format:'offline'|'online',date:string,date2:string,t1:string,t2:string,tz:string,placeId:string,area:string,exactAddress:string,joinUrl:string,
 requiresApplication:boolean,question:string,price:Price,amount:string,currency:string,ticketUrl:string,requirements:string};
type Key=keyof Form;
type Errors=Partial<Record<Key,string>>;

const KINDS:Kind[]=['meetup','workshop','talk','party'];
const CURRENCIES:[string,string][]=[['€','EUR'],['$','USD'],['£','GBP'],['₽','RUB'],['CHF','CHF']];
const DAY=864e5;
const HTTPS=/^https:\/\/[^\s]+$/;
const userTz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{return 'UTC';}};
const isoDay=(ms:number)=>{const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const knownZone=(tz:string)=>{try{return tz==='UTC'||Intl.supportedValuesOf('timeZone').includes(tz);}catch{return true;}};

/** How far `tz` is from UTC at the instant `ms`. */
function tzOffset(ms:number,tz:string){
 const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(ms));
 const g=(k:string)=>Number(p.find(x=>x.type===k)?.value);
 return Date.UTC(g('year'),g('month')-1,g('day'),g('hour'),g('minute'),g('second'))-ms;
}
/** The instant of a wall-clock date and time in `tz` (prototype zonedTime). */
function zonedTime(date:string,time:string,tz:string){
 const [y,m,d]=date.split('-').map(Number);const [h,mi]=time.split(':').map(Number);
 if(![y,m,d,h,mi].every(Number.isFinite))return NaN;
 try{const guess=Date.UTC(y!,m!-1,d!,h!,mi!);const first=guess-tzOffset(guess,tz);return guess-tzOffset(first,tz);}catch{return NaN;}
}
const times=(f:Form)=>({start:zonedTime(f.date,f.t1,f.tz),end:zonedTime(f.date2||f.date,f.t2,f.tz)});
const amountOf=(s:string)=>Number(s.replace(',','.').replace(/[^\d.]/g,''));
const ticketHref=(s:string)=>{const v=s.trim();return !v||/^https?:\/\//i.test(v)?v:'https://'+v;};
const fresh=():Form=>({title:'',kind:'',description:'',communityId:'',plate:'rose',cover:null,format:'offline',date:isoDay(Date.now()+7*DAY),date2:'',t1:'19:00',t2:'21:00',
 tz:userTz(),placeId:'',area:'',exactAddress:'',joinUrl:'',requiresApplication:false,question:'',price:'free',amount:'',currency:'€',ticketUrl:'',requirements:''});

/** `evfValidate()` for one step, with the server's limits. */
function validate(f:Form,step:number,t:(k:string,v?:Record<string,string|number>)=>string,orig?:{start:number,end:number}):Errors{
 const tx=(rule:FieldName,v:string)=>textError(t,rule,v);
 const e:Errors={};
 if(step===1){
  const ti=f.title.trim(),d=f.description.trim();
  const et=tx('eventTitle',ti);if(et)e.title=et;
  if(!f.kind)e.kind=t('fe.ce.err.type');
  const ed=tx('eventDescription',d);if(ed)e.description=ed;
 }
 if(step===2){
  const {start,end}=times(f);
  // An edit that keeps the time may go on after the start; a new time has to be in the future (as the server checks).
  const kept=!!orig&&start===orig.start&&end===orig.end;
  if(!f.date)e.date=t('fe.ce.err.date');else if(!kept&&Number.isFinite(start)&&start<Date.now())e.date=t('fe.ce.err.past');
  if(!knownZone(f.tz))e.tz=t('fe.ce.err.tz');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)e.t2=t('fe.ce.err.end');else if(end-start>14*DAY)e.t2=t('fe.ce.err.long');
  if(f.format==='offline'){
   if(!f.placeId)e.placeId=t('fe.ce.err.city');
   if(!f.area.trim())e.area=t('fe.ce.err.area');else{const m=tx('eventArea',f.area);if(m)e.area=m;}
   if(!f.exactAddress.trim())e.exactAddress=t('fe.ce.err.addr');else{const m=tx('eventAddress',f.exactAddress);if(m)e.exactAddress=m;}
  }else if(!HTTPS.test(f.joinUrl.trim())||f.joinUrl.trim().length>500)e.joinUrl=t('fe.ce.err.link');
 }
 if(step===3){
  if(f.price!=='free'){const a=amountOf(f.amount);if(!(a>0&&a<=100000))e.amount=t('fe.ce.err.amount');}
  if(f.price==='ext'){const u=ticketHref(f.ticketUrl);if(!HTTPS.test(u)||!/\S+\.\S+/.test(u)||u.length>500)e.ticketUrl=t('fe.ce.err.ticket');}
  if(f.requiresApplication){if(!f.question.trim())e.question=t('fe.ce.err.question');else{const m=tx('eventQuestion',f.question);if(m)e.question=m;}}
  const er=tx('eventRequirements',f.requirements);if(er)e.requirements=er;
 }
 return e;
}
const STEP_OF:Partial<Record<Key,number>>={title:1,kind:1,description:1,communityId:1,cover:1,date:2,t2:2,tz:2,placeId:2,area:2,exactAddress:2,joinUrl:2,amount:3,ticketUrl:3,question:3,requirements:3};

/** The event as `event.submit` takes it (contracts/events.mjs eventFields). */
function eventOf(f:Form){
 const {start,end}=times(f);const off=f.format==='offline';const cur=CURRENCIES.find(([s])=>s===f.currency)?.[1]??'EUR';
 return {title:f.title.trim(),kind:f.kind,description:f.description.trim(),format:f.format,
  placeId:off?f.placeId:null,area:off?f.area.trim():null,exactAddress:off?f.exactAddress.trim():null,joinUrl:off?null:f.joinUrl.trim(),
  tz:f.tz,startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),
  price:f.price==='free'?{kind:'free'}:f.price==='door'?{kind:'door',amount:amountOf(f.amount),currency:cur}:{kind:'external',amount:amountOf(f.amount),currency:cur,ticketUrl:ticketHref(f.ticketUrl)},
  requiresApplication:f.requiresApplication,questions:f.requiresApplication&&f.question.trim()?[f.question.trim()]:[],
  requirements:f.requirements.trim()||null,coverAssetId:f.cover?.id??null,plate:f.plate,communityId:f.communityId||null};
}
/** What a draft keeps: the form as typed (a draft needs only a title), with the instants when they are known. */
function draftOf(f:Form){
 const {cover,...rest}=f;const {start,end}=times(f);
 return {...rest,coverAssetId:cover?.id??null,...(Number.isFinite(start)?{startsAt:new Date(start).toISOString()}:{}),...(Number.isFinite(end)?{endsAt:new Date(end).toISOString()}:{})};
}

const saved=z.object({ok:z.literal(true),id:z.uuid()}).passthrough();
const submitted=z.object({ok:z.literal(true),id:z.uuid().optional(),state:z.string().optional()}).passthrough();
const okRes=z.object({ok:z.literal(true)}).passthrough();
const comms=z.object({ok:z.literal(true),hosting:z.array(z.object({id:z.uuid(),name:z.string(),state:z.string(),role:z.string()}).passthrough())}).passthrough();

const updated=z.object({ok:z.literal(true),rev:z.number().optional(),review:z.array(z.string()).optional(),pending:z.unknown().optional()}).passthrough();
const editable=z.object({ok:z.literal(true),event:z.object({id:z.uuid(),title:z.string(),kind:z.enum(['meetup','workshop','talk','party']),description:z.string(),
 format:z.enum(['offline','online']),placeId:z.uuid().nullable(),area:z.string().nullable(),exactAddress:z.string().nullable(),joinUrl:z.string().nullable(),tz:z.string(),
 startsAt:z.string(),endsAt:z.string(),price:z.object({kind:z.enum(['free','door','external']),amount:z.number().optional(),currency:z.string().optional(),ticketUrl:z.string().optional()}),
 requiresApplication:z.boolean(),questions:z.array(z.string()).nullable(),requirements:z.string().nullable(),plate:z.string().nullable(),
 cover:z.object({id:z.uuid(),src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional(),
 communityId:z.uuid().nullable(),state:z.string(),past:z.boolean(),organizer:z.object({id:z.uuid()}).passthrough().nullable().optional(),
 rev:z.number().optional(),pendingChange:z.unknown().optional()}).passthrough()});
type Loaded=z.infer<typeof editable>['event'];
/** An event being edited: the form it opens with and what must go back unchanged. */
type Edit={id:string,rev:number,state:string,form:Form,questions:string[],requiresApplication:boolean,communityId:string|null,orig:{start:number,end:number},pendingChange:unknown};
/** States in which `event.update` takes an edit. */
const EDITABLE=['pending_partner','in_review','rejected','published'];

/** A wall-clock date and time of an instant in `tz` (the inverse of zonedTime). */
function wall(iso:string,tz:string){
 const ms=Date.parse(iso);
 try{
  const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(ms));
  const g=(k:string)=>p.find(x=>x.type===k)?.value??'';
  return {date:`${g('year')}-${g('month')}-${g('day')}`,time:`${g('hour')}:${g('minute')}`};
 }catch{const d=new Date(ms);return {date:isoDay(ms),time:`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};}
}
/** The form of an event as `event.get` gives it to the organiser. */
function fromEvent(e:Loaded):Form{
 const s=wall(e.startsAt,e.tz),en=wall(e.endsAt,e.tz);const p=e.price;
 const src=e.cover?.src;
 return {title:e.title,kind:e.kind,description:e.description,communityId:e.communityId??'',plate:PLATE_KEYS.find(k=>k===e.plate)??'rose',
  cover:e.cover?{id:e.cover.id,preview:src?.card??src?.full??src?.thumb??''}:null,
  format:e.format,date:s.date,date2:en.date!==s.date?en.date:'',t1:s.time,t2:en.time,tz:e.tz,placeId:e.placeId??'',area:e.area??'',exactAddress:e.exactAddress??'',joinUrl:e.joinUrl??'',
  requiresApplication:e.requiresApplication,question:e.questions?.[0]??'',price:p.kind==='free'?'free':p.kind==='door'?'door':'ext',amount:p.amount!=null?String(p.amount):'',
  currency:CURRENCIES.find(([,c])=>c===p.currency)?.[0]??'€',ticketUrl:p.ticketUrl??'',requirements:e.requirements??''};
}

/** A saved draft as the editor's form: the form as typed (draftOf), or an event's fields for a draft made from a
 * withdrawn event (server formOf: instants, a price object, questions). Unknown or wrong-typed keys keep the defaults. */
function fromDraft(raw:Record<string,unknown>,cover:{id:string,src?:Record<string,string>|null|undefined}|null):Form{
 const base=fresh();const f:Form={...base};
 const str=(k:Key)=>{const v=raw[k];if(typeof v==='string')(f as Record<Key,unknown>)[k]=v;};
 (['title','description','communityId','date','date2','t1','t2','tz','placeId','area','exactAddress','joinUrl','question','amount','currency','ticketUrl','requirements'] as Key[]).forEach(str);
 if(KINDS.includes(raw.kind as Kind))f.kind=raw.kind as Kind;
 if(raw.format==='online'||raw.format==='offline')f.format=raw.format;
 if(typeof raw.requiresApplication==='boolean')f.requiresApplication=raw.requiresApplication;
 const plate=PLATE_KEYS.find(k=>k===raw.plate);if(plate)f.plate=plate;
 if(raw.price==='free'||raw.price==='door'||raw.price==='ext')f.price=raw.price;
 // A withdrawn event's draft: times as instants in its zone, the price as an object, the first question.
 if(typeof raw.date!=='string'&&typeof raw.startsAt==='string'&&typeof raw.endsAt==='string'){
  const s0=wall(raw.startsAt,f.tz),e0=wall(raw.endsAt,f.tz);f.date=s0.date;f.t1=s0.time;f.t2=e0.time;f.date2=e0.date!==s0.date?e0.date:'';}
 const pr=raw.price as {kind?:unknown,amount?:unknown,currency?:unknown,ticketUrl?:unknown}|null|undefined;
 if(pr&&typeof pr==='object'){f.price=pr.kind==='door'?'door':pr.kind==='external'?'ext':'free';
  if(typeof pr.amount==='number')f.amount=String(pr.amount);
  const cur=CURRENCIES.find(([,c])=>c===pr.currency);if(cur)f.currency=cur[0];
  if(typeof pr.ticketUrl==='string')f.ticketUrl=pr.ticketUrl;}
 if(Array.isArray(raw.questions)&&typeof raw.questions[0]==='string')f.question=raw.questions[0];
 for(const k of ['placeId','area','exactAddress','joinUrl','requirements','communityId'] as Key[])if(raw[k]===null)(f as Record<Key,unknown>)[k]='';
 const src=cover?.src;f.cover=cover?{id:cover.id,preview:src?.card??src?.full??src?.thumb??''}:null;
 return f;
}
const draftRes=z.object({ok:z.literal(true),draft:z.object({id:z.uuid(),form:z.record(z.string(),z.unknown()),step:z.number().nullable().optional(),
 cover:z.object({id:z.uuid(),src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional()}).passthrough()});
type Resume={id:string,form:Form,step:number};

/** E11 «Новое событие»; with `?draft=` — «Продолжить» a saved draft at the step it was left on (event.draftGet). */
export function CreateEventScreen(){
 const [params]=useSearchParams();const draft=params.get('draft');const {call}=useFe();const {t}=useI18n();
 const [resume,setResume]=useState<Resume|null>(null);const [error,setError]=useState<unknown>(null);
 useEffect(()=>{if(!draft)return;setResume(null);setError(null);
  call('event.draftGet',{draftId:draft},draftRes).then(r=>setResume({id:r.draft.id,form:fromDraft(r.draft.form,r.draft.cover??null),step:Math.min(4,Math.max(1,r.draft.step??1))})).catch(setError);},[call,draft]);
 // «Событие» from a community's «Создать» (its owner or a host): the event starts linked to that community.
 if(!draft)return <EventEditor community={params.get('community')}/>;
 if(resume)return <EventEditor key={resume.id} resume={resume}/>;
 return <>
  <Bar title={t('fe.ce.titleDraft')} back small/>
  <View className="nodock">{error?<Empty icon={CircleAlert} role="alert" title={t('fe.error.title')} text={error instanceof FeError&&error.code==='not_found'?t('fe.lo.ev.draftGone'):feErrorMessage(error,t)}/>
   :<Skel kind="list"/>}</View>
 </>;
}

/** E11 in edit mode (prototype `evEdit` → E11 with `edit`): the same four steps without drafts, saved with `event.update`. */
export function EditEventScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t}=useI18n();
 const [e,setE]=useState<Loaded|null>(null);const [error,setError]=useState<unknown>(null);const [nonce,setNonce]=useState(0);
 useEffect(()=>{setE(null);setError(null);call('event.get',{eventId:id},editable).then(r=>setE(r.event)).catch(setError);},[call,id,nonce]);
 const reload=()=>setNonce(n=>n+1);
 const mine=!!e&&typeof e.rev==='number'&&e.organizer?.id===acting?.id;
 if(e&&mine&&EDITABLE.includes(e.state)&&!e.past){
  const form=fromEvent(e);
  const edit:Edit={id:e.id,rev:e.rev!,state:e.state,form,questions:e.questions??[],requiresApplication:e.requiresApplication,communityId:e.communityId,orig:times(form),pendingChange:e.pendingChange??null};
  return <EventEditor key={`${e.id}:${e.rev}`} edit={edit} reload={reload}/>;
 }
 return <>
  <Bar title={t('fe.ece.e.title')} back small/>
  <View className="nodock">{error?<Empty icon={CircleAlert} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={reload}>{t('fe.retry')}</Btn></Empty>
   :!e?<Skel kind="list"/>
   :!mine?<Empty icon={Lock} title={t('fe.ece.e.onlyOrganiser')}/>
   :<Empty icon={Lock} title={t('fe.ece.e.closed')} text={t('fe.ece.e.closedText')}/>}</View>
 </>;
}

function EventEditor({edit,reload,resume,community}:{edit?:Edit,reload?:()=>void,resume?:Resume,community?:string|null}){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const catalog=useCatalog();
 const draftOp=useOp(),submitOp=useOp(),deleteOp=useOp(),updateOp=useOp();
 const [f,setF]=useState<Form>(()=>edit?.form??resume?.form??{...fresh(),communityId:community??''});const [stale,setStale]=useState(false);const [step,setStep]=useState(resume?.step??1);const [cityOpen,setCityOpen]=useState(false);const [err,setErr]=useState<Errors>({});
 const [draftId,setDraftId]=useState<string|null>(resume?.id??null);const [busy,setBusy]=useState(false);const [kept,setKept]=useState(false);
 const [notice,setNotice]=useState<{kind:'ok'|'warn'|'err',text:string}|null>(null);const [pv,setPv]=useState<'all'|'ok'>('all');const [asking,setAsking]=useState(false);
 const [hosting,setHosting]=useState<{id:string,name:string}[]>([]);
 const couple=acting?.kind==='couple';
 // What the server has (or the form was opened with): leaving with more than that asks first.
 const savedAs=useRef(JSON.stringify(f));const dirty=JSON.stringify(f)!==savedAs.current;
 useEffect(()=>{if(edit)return;call('community.mine',{},comms).then(r=>setHosting(r.hosting.filter(c=>c.state==='published'&&(c.role==='owner'||c.role==='host')))).catch(()=>{});},[call,edit]);
 // After publication who is admitted stays as it is (the server answers admission_frozen otherwise).
 const frozen=edit?.state==='published';
 // No city is chosen for the organiser: the place is an empty required choice (checked on step 2).
 useEffect(()=>{document.querySelector('.v21 .view')?.scrollTo({top:0});},[step]);

 const placeOf=(id:string)=>catalog?.places.find(p=>p.id===id);
 // An offline event keeps the zone of its city; the zone is never typed in.
 const pickPlace=(id:string)=>setF(x=>({...x,placeId:id,tz:placeZone(placeOf(id))??x.tz}));
 const pickFormat=(k:'offline'|'online')=>setF(x=>({...x,format:k,tz:k==='offline'?(placeZone(placeOf(x.placeId))??x.tz):(ONLINE_ZONES.includes(x.tz)?x.tz:ONLINE_ZONES.includes(userTz())?userTz():ONLINE_ZONES[0]!)}));
 const set=<K extends Key>(k:K,v:Form[K])=>{setF(x=>({...x,[k]:v}));setErr(e=>{if(!e[k])return e;const n={...e};delete n[k];return n;});};
 const saveDraft=async(nextStep:number)=>{
  const payload={...(draftId?{draftId}:{}),step:nextStep,form:draftOf(f)};
  const r=await call('event.draftSave',{opId:draftOp.opFor(payload),...payload},saved);draftOp.done();
  setDraftId(r.id);return r.id;
 };
 const toDraft=async():Promise<boolean>=>{
  if(busy)return false;setNotice(null);
  const dt=f.title.trim()?textError(t,lineRule(80),f.title):t('fe.ce.err.draftTitle');
  if(dt){setErr(e=>({...e,title:dt}));if(step!==1)setStep(1);shakeFirstErr();return false;}
  setBusy(true);
  try{await saveDraft(step);savedAs.current=JSON.stringify(f);setKept(true);setNotice({kind:'ok',text:couple?t('fe.ce.draftSavedCouple'):t('fe.ce.draftSaved')});return true;}
  catch(e){setNotice({kind:'err',text:feErrorMessage(e,t)});return false;}
  finally{setBusy(false);}
 };
 // Leaving a filled form: a new event offers to keep it as a draft; editing a saved event only asks to leave.
 const guard=useLeaveGuard(dirty&&!busy,edit?undefined:{title:t('fe.ce.leave.title'),text:t('fe.ce.leave.text'),label:t('fe.ce.toDraft'),run:toDraft});
 const next=async()=>{
  if(busy)return;setNotice(null);
  const e=validate(f,step,t,edit?.orig);setErr(e);
  if(Object.keys(e).length){shakeFirstErr();return;}
  if(edit){setStep(step+1);return;}
  setBusy(true);
  // The draft follows every step; a failed save does not hold the person back, it only says so.
  try{await saveDraft(step+1);savedAs.current=JSON.stringify(f);}catch(x){setNotice({kind:'warn',text:t('fe.ce.draftFailed').replace('{reason}',feErrorMessage(x,t))});}
  finally{setBusy(false);}
  setStep(step+1);
 };
 const back=()=>{if(step>1){setErr({});setNotice(null);setStep(step-1);}else navigate(-1);};
 const submit=async()=>{
  if(busy)return;setNotice(null);
  setStale(false);
  for(const s of [1,2,3]){const e=validate(f,s,t,edit?.orig);if(Object.keys(e).length){setErr(e);setStep(s);shakeFirstErr();return;}}
  const payload=edit
   // The community link and, once published, the admission rules and questions go back exactly as they were.
   ?{eventId:edit.id,rev:edit.rev,event:{...eventOf(f),communityId:edit.communityId,
     ...(frozen?{requiresApplication:edit.requiresApplication,questions:edit.questions}:{questions:f.requiresApplication&&f.question.trim()?[f.question.trim(),...edit.questions.slice(1)]:[]})}}
   :{...(draftId?{draftId}:{}),event:eventOf(f)};
  setBusy(true);
  try{
   if(edit){
    const r=await call('event.update',{opId:updateOp.opFor(payload),...payload},updated);updateOp.done();
    const notice=r.pending?t('fe.ece.e.pending'):edit.state!=='published'?t('fe.ece.e.savedReview')
     :r.review?.length?reviewNotice(r.review,t):t('fe.ece.e.saved');
    guard.pass(()=>navigate(`/n/events/${edit.id}/manage`,{replace:true,state:{notice}}));
    return;
   }
   const r=await call('event.submit',{opId:submitOp.opFor(payload),...payload},submitted);submitOp.done();
   guard.pass(()=>navigate('/n/me/events',{replace:true,state:{notice:r.state==='pending_partner'?t('fe.ce.donePending'):t('fe.ce.done')}}));
  }catch(x){
   if(edit&&x instanceof FeError&&x.code==='conflict'){setStale(true);setNotice({kind:'err',text:feErrorMessage(x,t)});}
   else if(x instanceof FeError&&x.code==='invalid_input'&&x.fields?.length){
    const map:Record<string,Key>={title:'title',kind:'kind',description:'description',communityId:'communityId',coverAssetId:'cover',startsAt:'date',endsAt:'t2',tz:'tz',placeId:'placeId',
     area:'area',exactAddress:'exactAddress',joinUrl:'joinUrl',price:'amount',questions:'question',requirements:'requirements',format:'t2'};
    const rule:Partial<Record<Key,FieldName>>={title:'eventTitle',description:'eventDescription',area:'eventArea',exactAddress:'eventAddress',question:'eventQuestion',requirements:'eventRequirements'};
    const e:Errors={};for(const {path,code} of serverFields(x)){const k=map[path.split('.')[0]!];if(!k||e[k]||(edit&&k==='communityId'))continue;
     const r=rule[k];e[k]=k==='cover'?t('fe.ce.err.cover'):k==='date'?t('fe.ce.err.past'):k==='tz'?t('fe.ce.err.tz'):r&&code!=='invalid'?textErrorMessage(t,code,FIELD[r]):t('fe.val.invalid');}
    const steps=Object.keys(e).map(k=>STEP_OF[k as Key]??4);
    if(steps.length){setErr(e);setStep(Math.min(...steps));shakeFirstErr();}else setNotice({kind:'err',text:feErrorMessage(x,t)});
   }else setNotice({kind:'err',text:feErrorMessage(x,t)});
  }finally{setBusy(false);}
 };
 // A refusal shows under the long step-4 preview: bring it into view, never leave it below the fold.
 const noticeRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(notice?.kind==='err')noticeRef.current?.scrollIntoView({block:'center',behavior:'smooth'});},[notice]);
 const removeDraft=async()=>{
  if(!draftId||busy)return;setBusy(true);setNotice(null);
  const payload={draftId};
  try{await call('event.draftDelete',{opId:deleteOp.opFor(payload),...payload},okRes);deleteOp.done();guard.pass(()=>navigate('/n/me/events',{replace:true}));}
  catch(e){setNotice({kind:'err',text:feErrorMessage(e,t)});setAsking(false);}
  finally{setBusy(false);}
 };

 const names=[1,2,3,4].map(i=>t('fe.ce.step.'+i));
 const places:[string,string][]=(catalog?.places??[]).map(p=>[p.id,placeName(p,locale)]);
 const tzItems:[string,string][]=[...new Set([f.tz,...ONLINE_ZONES])].map(z=>[z,zoneLabel(z,f.date?new Date(times(f).start||Date.now()).toISOString():new Date().toISOString(),locale)] as [string,string]);
 const chip=(on:boolean,label:string,onClick:()=>void,key:string)=><Chip key={key} on={on} onClick={onClick}>{label}</Chip>;

 let body:ReactNode=null;
 if(step===1)body=<>
  {couple&&acting&&<p className="as-line full"><Av name={acting.name} seed={acting.id} size="xs" src={acting.avatar}/><span>{t('fe.ce.organiser')} <b>{acting.name}</b></span></p>}
  <Field name="title" label={t('fe.ce.name')} ph={t('fe.ce.namePh')} check="eventTitle" value={f.title} onChange={v=>set('title',v)} err={err.title}/>
  <div className={'field'+(err.kind?' err':'')} data-field="type"><span className="flabel">{t('fe.ce.type')}</span>
   <ChipGroup items={KINDS.map(k=>[k,t('fe.ce.kind.'+k)])} selected={f.kind?[f.kind]:[]} onToggle={k=>set('kind',k as Kind)}/>
   {err.kind&&<FErr>{err.kind}</FErr>}</div>
  <Field name="desc" label={t('fe.ce.desc')} ph={t('fe.ce.descPh')} check="eventDescription" textarea rows={6} value={f.description} onChange={v=>set('description',v)} err={err.description}/>
  {!edit&&(hosting.length>0||f.communityId)&&<div className={'field'+(err.communityId?' err':'')}>
   <SelectRow label={t('fe.ce.community')} sub={t('fe.ce.communitySub')} value={f.communityId} onChange={v=>set('communityId',v)} items={[['',t('fe.ce.communityNone')],...hosting.map(c=>[c.id,c.name] as [string,string])]}/>
   {err.communityId&&<FErr>{err.communityId}</FErr>}</div>}
  <CoverField purpose="event" plate={f.plate} setPlate={k=>set('plate',k)} cover={f.cover} setCover={c=>set('cover',c)}/>
  {err.cover&&<FErr>{err.cover}</FErr>}
 </>;
 if(step===2)body=<>
  <div className="field"><span className="flabel">{t('fe.ce.format')}</span><Chips>
   {(['offline','online'] as const).map(k=>chip(f.format===k,t('fe.ce.'+k),()=>pickFormat(k),k))}</Chips></div>
  <Field name="date" label={t('fe.ce.date')} type="date" min={isoDay(Date.now())} value={f.date} onChange={v=>set('date',v)} err={err.date}/>
  <Field name="date2" label={t('fe.ce.date2')} type="date" opt min={f.date} value={f.date2} onChange={v=>{set('date2',v);setErr(e=>({...e,t2:''}));}}/>
  <div className="row g8 k-al-start">
   <div className="grow"><Field name="t1" label={t('fe.ce.t1')} type="time" value={f.t1} onChange={v=>{set('t1',v);setErr(e=>({...e,t2:''}));}}/></div>
   <div className="grow"><Field name="t2" label={t('fe.ce.t2')} type="time" value={f.t2} onChange={v=>set('t2',v)} err={err.t2||undefined}/></div>
  </div>
  {f.format==='online'&&<label className={'field'+(err.tz?' err':'')} data-field="tz"><span>{t('fe.ce.tz')}</span>
   <Select label={t('fe.ce.tz')} value={f.tz} onChange={v=>set('tz',v)} options={tzItems}/>
   {err.tz?<FErr>{err.tz}</FErr>:<div className="fhint">{t('fe.ce.tzHintOnline')}</div>}</label>}
  {f.format==='offline'?<>
   <div data-field="city"><PickField label={t('fe.ce.city')} value={places.find(([id])=>id===f.placeId)?.[1]??null} placeholder={t('fe.ce.cityPh')} error={err.placeId} onClick={()=>setCityOpen(true)}/></div>
   {cityOpen&&<PlacePicker places={catalog?.places??[]} current={f.placeId||null} onPick={x=>{if(x){pickPlace(x.id);setErr(e=>({...e,placeId:''}));}setCityOpen(false);}} onClose={()=>setCityOpen(false)}/>}
   {f.placeId&&<div className="fhint" data-field="tz">{t('fe.ce.tzFromCity',{zone:zoneLabel(f.tz,new Date(times(f).start||Date.now()).toISOString(),locale)})}</div>}
   <Field name="area" label={t('fe.ce.area')} ph={t('fe.ce.areaPh')} check="eventArea" value={f.area} onChange={v=>set('area',v)} err={err.area}/>
   <Field name="addr" label={t('fe.ce.addr')} icon={Lock} ph={t('fe.ce.addrPh')} check="eventAddress" value={f.exactAddress} onChange={v=>set('exactAddress',v)} err={err.exactAddress}/>
  </>:<Field name="link" label={t('fe.ce.link')} icon={LinkIcon} type="url" inputMode="url" ph="https://" value={f.joinUrl} onChange={v=>set('joinUrl',v)} err={err.joinUrl}/>}
 </>;
 if(step===3)body=<>
  <Card list><ToggleRow title={t('fe.ce.approval')} sub={frozen?t('fe.ece.e.frozen'):t(f.format==='online'?'fe.ce.approvalSubOnline':'fe.ce.approvalSub')} on={f.requiresApplication} disabled={frozen} onClick={()=>set('requiresApplication',!f.requiresApplication)}/></Card>
  {frozen&&f.requiresApplication&&f.question.trim()&&<div className="field"><span className="flabel">{t('fe.ce.question')}</span><Note>{f.question.trim()}</Note></div>}
  {!frozen&&f.requiresApplication&&<><Field name="q0" label={t('fe.ce.question')} ph={t('fe.ce.questionPh')} check="eventQuestion" value={f.question} onChange={v=>set('question',v)} err={err.question}/></>}
  <div className="field"><span className="flabel">{t('fe.ce.price')}</span><Chips>
   {(['free','door','ext'] as const).map(k=>chip(f.price===k,t('fe.ce.price.'+k),()=>set('price',k),k))}</Chips></div>
  {f.price!=='free'&&<div className="row g8 ev-price k-al-start">
   <div className="grow"><Field name="amount" label={t('fe.ce.amount')} ph="15" inputMode="decimal" value={f.amount} onChange={v=>set('amount',v)} err={err.amount}/></div>
   <div className="ev-cur"><SelectRow aria={t('fe.ce.currency')} value={f.currency} onChange={v=>set('currency',v)} items={CURRENCIES.map(([s])=>[s,s])}/></div>
  </div>}
  {f.price==='ext'&&<Field name="ext" label={t('fe.ce.ticket')} icon={LinkIcon} ph="tickets.example.org" hint={t('fe.ce.ticketHint')} value={f.ticketUrl} onChange={v=>set('ticketUrl',v)} err={err.ticketUrl}/>}
  <Field name="reqs" label={t('fe.ce.reqs')} opt textarea rows={3} check="eventRequirements" ph={t('fe.ce.reqsPh')} value={f.requirements} onChange={v=>set('requirements',v)} err={err.requirements}/>
  <Alert icon={EyeOff}>{t('fe.ce.listsHidden')}</Alert>
 </>;
 if(step===4){
  const {start,end}=times(f);const ok=Number.isFinite(start)&&Number.isFinite(end);
  const tzView=f.tz;
  const fmt=(ms:number,o:Intl.DateTimeFormatOptions)=>{try{return new Date(ms).toLocaleString(locale==='en'?'en':'ru',{...o,timeZone:tzView});}catch{return new Date(ms).toLocaleString(locale==='en'?'en':'ru',o);}};
  const priceText=f.price==='free'?t('fe.ce.price.free'):`${f.amount.trim()} ${f.currency}`;
  const site=f.price==='ext'?ticketHref(f.ticketUrl).replace(/^https?:\/\//i,'').split('/')[0]??'':'';
  const area=f.format==='online'?t('fe.ce.online'):f.area.trim()||(catalog?placeName(catalog.places.find(p=>p.id===f.placeId)??{ru:'',en:''},locale):'');
  body=<>
   <Seg value={pv} onChange={setPv} options={[{id:'all',label:t('fe.ce.pv.all')},{id:'ok',label:t('fe.ce.pv.ok')}]}/>
   <EventTile cover={f.cover?<img className="evimg" src={f.cover.preview} alt="" draggable={false}/>:<div className="plate" style={namedPlate(f.plate)}><span className="pi"><Calendar/></span></div>}
    {...(ok?{day:fmt(start,{day:'numeric'}),month:fmt(start,{month:'short'})}:{})} place={area} placeIcon={f.format==='online'?Video:MapPin}
    kicker={<>{f.kind?t('fe.ce.kind.'+f.kind):''}{acting?' · '+acting.name:''}</>} title={f.title.trim()} time={ok?fmt(start,{hour:'2-digit',minute:'2-digit'}):''} price={priceText}/>
   <Card list><Row icon={pv==='ok'?Unlock:Lock} tone={pv==='ok'?'g':undefined} title={f.format==='online'?t('fe.ce.pv.link'):t('fe.ce.pv.address')}
    sub={pv==='ok'?(f.format==='online'?f.joinUrl.trim():f.exactAddress.trim()):t(f.format==='online'?'fe.ce.pv.hiddenLink':'fe.ce.pv.hidden')}/></Card>
   <Card list>
    <Row icon={Calendar} tone="l" title={ok?fmt(start,{weekday:'short',day:'numeric',month:'long'}):''}
     sub={ok?`${fmt(start,{hour:'2-digit',minute:'2-digit'})}–${fmt(end,{hour:'2-digit',minute:'2-digit'})} · ${zoneLabel(f.tz,new Date(start).toISOString(),locale)}`:''}/>
    <Row icon={Ticket} tone="a" title={priceText}
     sub={f.price==='ext'?t('fe.ce.pv.ticketOn').replace('{site}',site):f.requiresApplication?t('fe.ce.pv.byApplication'):t(f.format==='online'?'fe.ce.pv.justJoin':'fe.ce.pv.justCome')}/>
   </Card>
   {f.description.trim()&&<><SectionLabel>{t('fe.ce.pv.about')}</SectionLabel><div className="md bio"><p>{f.description.trim()}</p></div></>}
   {f.requirements.trim()&&<><SectionLabel>{t('fe.ce.reqs')}</SectionLabel><Card><div className="fact"><i className="v"><Check/></i><span>{f.requirements.trim()}</span></div></Card></>}
   {f.requiresApplication&&f.question.trim()&&<><SectionLabel>{t('fe.ce.question')}</SectionLabel><Note>{f.question.trim()}</Note></>}
   <Alert kind="warn" icon={Clock}>{edit?(frozen?t('fe.ece.e.reviewPublished'):t('fe.ece.e.reviewBefore')):couple?t('fe.ce.reviewCouple'):t('fe.ce.review')}</Alert>
  </>;
 }

 return <>
  <Bar title={edit?t('fe.ece.e.title'):resume?t('fe.ce.titleDraft'):t('fe.ce.title')} small onBack={back}>
   {!edit&&dirty&&<Btn kind="text" auto onClick={()=>void toDraft()} disabled={busy}>{t('fe.ce.toDraft')}</Btn>}
  </Bar>
  <div className="view nodock cta1"><div className="wrap">
   <Steps step={step} total={4} name={names[step-1]!}/>
   {edit&&edit.pendingChange!=null&&step===1&&<Alert kind="warn" role="none" icon={Clock}>{t('fe.ece.e.pendingChange')}</Alert>}
   {step<4?<Group><Card form>{body}</Card></Group>:body}
   {notice&&<Alert ref={noticeRef} kind={notice.kind} noIcon action={stale&&reload?<Btn kind="text" auto icon={RefreshCw} onClick={reload}>{t('fe.ece.reload')}</Btn>:undefined}>{notice.text}</Alert>}
   {(resume||kept)&&draftId&&(asking
    ?<Alert kind="warn" noIcon role="alertdialog" action={<><Btn kind="danger" size="sm" auto onClick={removeDraft} disabled={busy}>{t('fe.ce.draftDeleteOk')}</Btn><Btn kind="text" size="sm" auto onClick={()=>setAsking(false)}>{t('fe.ce.cancel')}</Btn></>}>{t('fe.ce.draftDeleteAsk')}</Alert>
    :<div className="row"><Btn kind="text" size="sm" auto onClick={()=>setAsking(true)} disabled={busy}>{t('fe.ce.draftDelete')}</Btn></div>)}
  </div></div>
  {guard.node}
  <div className="ctabar"><div className="wrap"><div className="row g8">
   {step>1&&<Btn kind="soft" fit icon={ChevronLeft} onClick={back} disabled={busy}>{t('fe.ce.back')}</Btn>}
   <Btn onClick={step<4?next:submit} disabled={busy}>{busy?(step<4?t('fe.ce.saving'):t('fe.ce.sending')):step<4?t('fe.ce.next'):edit?t('fe.ece.save'):t('fe.ce.submit')}</Btn>
  </div></div></div>
 </>;
}
