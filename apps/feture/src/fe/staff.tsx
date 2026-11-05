import {Children,cloneElement,createContext,Fragment,isValidElement,useCallback,useContext,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {copyLink} from './share';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ArrowUpDown,BadgeCheck,Ban,CalendarDays,Check,ClipboardCheck,Eye,FilePen,Flag,Gavel,IdCard,Image,ImageOff,Inbox,ListFilter,Lock,MapPin,Minus,RefreshCw,Scale,Search,ShieldAlert,ShieldCheck,User,UserPlus,Tags,Plus,EyeOff,Copy,Filter,UserX,Users,X,Film,Mic,Camera,Image as ImageIcon,type LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Actions,Alert,Btn,Swipe,Card,CheckList,ToggleRow,RadioList,Chip,ChoiceChips,MultiChips,Chips,Divider,Empty,Field,Form,Group,IconBtn,Input,KeyValues,LoadMore,MoreInfo,Note,Pill,ReviewBar,ReviewCard,StatCard,ReviewObject,ReviewTiles,ReviewPreview,type Slide,useBackClose,Row,SearchInput,SectionLabel,Seg,Select,Sheet,Skel,Stack,SubBar,Text,TextArea,View,VoiceBubble,useKept} from './kit';
import {askFactor,useFe,useLive,useSeen} from './session';
import {useToast,useFail} from './toast';
import {pullStaffCounts,useStaffCounts} from './staff-counts';
import {Viewer} from './post-parts';
import {FactorPromptHost,FactorReset,StaffEnrol,StaffUnlock,factorSchema,type Factor} from './staff-factor';
import {StaffSupport} from './support';
import {useStaffPage} from './staff-paged';
import {priceText} from './communities';
import {evRange,evTz,inTz} from './event-time';
import {StaffMaintenance} from './maintenance';
import {StaffCities} from './staff-cities';
import {textError,textRule} from './kit/validate';
import {fill} from './comm-kit';
import {RESTRICT_PRESETS,RESTRICT_SCOPES,type RestrictScope} from '../../contracts/_restrict.mjs';

/** Staff area (/n/staff, S4 moderation): review queues with decisions, Premium for dogfooding, the journal.
 * Roles are enforced by the server only; a queue the server refuses (403) is simply not shown. */
const ok=z.object({ok:z.literal(true)}).passthrough();
const meRes=z.object({ok:z.literal(true),roles:z.array(z.string()),factor:factorSchema.optional()});
const ts=z.string().nullable().optional();
const opt=<T extends z.ZodType>(s:T)=>s.nullable().optional();
/** The person behind an item (owner 05.11.2026: «Меры» wherever there is one). */
const person=opt(z.object({id:z.string(),kind:z.string().optional(),handle:z.string().nullable().optional(),name:z.string().nullable().optional()}).passthrough());

const objectDto=z.object({kind:z.string(),title:z.string().nullable().optional(),body:z.string().nullable().optional(),facts:z.record(z.string(),z.unknown()).optional()}).nullable().optional();
type ObjectDto=z.infer<typeof objectDto>;
const mediaItem=z.object({id:z.uuid(),group:opt(z.string()),assets:z.array(z.object({id:z.uuid(),kind:z.string(),blur:opt(z.string())}).passthrough()).optional(),purpose:z.string(),kind:z.string(),usedIn:opt(z.string()),authorLabel:opt(z.string()),reason:opt(z.string()),createdAt:ts,w:opt(z.number()),h:opt(z.number()),blur:opt(z.string()),
 owner:opt(z.object({id:z.string(),kind:z.string().optional(),handle:z.string().nullable().optional(),name:z.string().nullable().optional()}).passthrough())});
const viewRes=z.object({ok:z.literal(true),src:z.object({card:z.string().optional(),full:z.string().optional(),file:z.string().optional()}).nullable()});
const commItem=z.object({person,id:z.uuid(),rev:z.number(),name:z.string(),description:opt(z.string()),topics:opt(z.array(z.string())),privacy:opt(z.string()),join_question:opt(z.string()),
 rules:z.unknown().optional(),state:z.string(),pending_change:z.record(z.string(),z.unknown()).nullable().optional(),created_at:ts,
 resubmits:z.number().optional(),prev_reject_reason:opt(z.string()),cover:z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough().nullable().optional(),newCover:z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough().nullable().optional()}).passthrough();
const eventItem=z.object({id:z.uuid(),rev:z.number(),title:z.string(),kind:opt(z.string()),description:opt(z.string()),format:opt(z.string()),area:opt(z.string()),exact_address:opt(z.string()),
 join_url:opt(z.string()),tz:opt(z.string()),starts_at:ts,ends_at:ts,price:z.unknown().optional(),requirements:opt(z.string()),state:z.string(),pending_change:z.record(z.string(),z.unknown()).nullable().optional(),
 created_at:ts,organizer:opt(z.object({id:z.string(),kind:z.string().optional(),handle:z.string().nullable().optional()}).passthrough())}).passthrough();
const mediaDto=z.object({src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional();
const checkItem=z.object({id:z.uuid(),gesture:z.string(),submittedAt:ts,profile:z.object({id:z.string(),handle:z.string().nullable()}),selfie:mediaDto,photo:mediaDto});
const ageItem=checkItem.extend({method:z.enum(['selfie','document']).optional().default('selfie'),gesture:z.string().nullable(),document:mediaDto});
const photoItem=checkItem.extend({photos:z.array(mediaDto).optional()});
const reportItem=z.object({targetType:z.enum(['profile','post','reply','community','event','conversation','announcement']),targetId:z.uuid(),reports:z.number(),reasons:z.array(z.string()),
 details:opt(z.array(z.string())),firstAt:ts,lastAt:ts,reported:z.unknown().optional(),excerpt:opt(z.string()),state:opt(z.string()),media:opt(z.number()),
 author:opt(z.object({id:z.string(),kind:z.string().optional(),handle:z.string().nullable().optional(),name:z.string().nullable().optional()}).passthrough()),
 evidence:opt(z.array(z.object({assetId:z.uuid(),kind:z.string(),seq:opt(z.number())}))),object:objectDto});
const appealItem=z.object({person,id:z.uuid(),target_type:z.string(),target_id:z.string(),body:z.string(),created_at:ts,handle:opt(z.string()),object:objectDto,onlyReviewer:z.boolean().optional(),
 decision:opt(z.object({action:z.string(),detail:z.unknown().optional(),at:ts,mine:z.boolean().optional()}).passthrough())});
const noticeItem=z.object({id:z.uuid(),target_url:opt(z.string()),reason:z.string(),explanation:opt(z.string()),created_at:ts,answerable:opt(z.boolean()),
 target:opt(z.object({type:z.string(),id:z.string()})),object:objectDto});
const journalItem=z.object({id:z.union([z.string(),z.number()]),person:opt(z.object({id:z.string(),kind:z.string().optional(),handle:z.string().nullable().optional(),name:z.string().nullable().optional()})),staff_account_id:opt(z.string()),staff_name:opt(z.string()),staff_handle:opt(z.string()),action:z.string(),target_type:opt(z.string()),target_id:opt(z.string()),detail:z.unknown().optional(),created_at:ts});
const disputeClaim=z.object({tagged:z.boolean(),hid:z.boolean().optional(),at:ts,trust:z.string(),strikes:z.number()});
const disputeItem=z.object({person,id:z.uuid(),disputed_at:ts,opened_at:ts,excerpt:opt(z.string()),media:opt(z.number()),hidden:z.boolean().optional(),urgent:z.boolean().optional(),
 attack:z.boolean().optional(),tagged:z.boolean().optional(),note:opt(z.string()),claims:z.array(disputeClaim).optional().default([]),
 object:objectDto,evidence:opt(z.array(z.object({assetId:z.uuid(),kind:z.string()})))});
const flaggedRes=z.object({ok:z.literal(true),flagged:z.array(z.object({profileId:z.uuid(),handle:z.string().nullable(),strikes:z.number(),flaggedAt:ts})).optional().default([])}).passthrough();
const revisionItem=z.object({person,id:z.uuid(),postId:z.uuid(),createdAt:ts,live:opt(z.string()),proposed:z.unknown().optional()});
const grantRes=z.object({ok:z.literal(true),id:z.string(),until:z.string()});
const measure=z.object({rule:z.string().nullable(),until:ts}).nullable();
const measuresRes=z.object({ok:z.literal(true),profileId:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),state:z.string().optional(),createdAt:z.string().nullable().optional(),openReports:z.number().optional(),watched:z.object({at:z.string(),note:z.string().nullable(),by:z.string().nullable()}).nullable().optional(),restricted:measure,suspended:measure});

type MediaItem=z.infer<typeof mediaItem>;type CommItem=z.infer<typeof commItem>;type EventItem=z.infer<typeof eventItem>;type AgeItem=z.infer<typeof ageItem>;type PhotoItem=z.infer<typeof photoItem>;
type DisputeItem=z.infer<typeof disputeItem>;type RevisionItem=z.infer<typeof revisionItem>;type ReportItem=z.infer<typeof reportItem>;type AppealItem=z.infer<typeof appealItem>;type NoticeItem=z.infer<typeof noticeItem>;
type Items={dispute:DisputeItem[],report:ReportItem[],revision:RevisionItem[],media:MediaItem[],community:CommItem[],event:EventItem[],age:AgeItem[],photo:PhotoItem[],appeal:AppealItem[],notice:NoticeItem[]};
type QueueId=keyof Items;
/** `locked`: documents and selfies wait for a fresh second-factor code (staff.ageCheckQueue, staff.photoCheckQueue). */
const list=<T extends z.ZodType>(item:T)=>z.object({ok:z.literal(true),items:z.array(item),locked:z.boolean().optional(),next:z.string().nullable().optional(),tail:z.string().nullable().optional(),total:z.number().optional()});
const journalPage=list(journalItem);
const QUEUES:{[K in QueueId]:{action:string,schema:z.ZodType<{items:Items[K],locked?:boolean|undefined}>,key:(x:Items[K][number])=>string}}={
 // V21 M01 puts «это я на фото» disputes and post reports first.
 dispute:{action:'staff.disputeQueue',schema:list(disputeItem),key:x=>x.id},
 report:{action:'staff.reportQueue',schema:list(reportItem),key:x=>x.targetType+':'+x.targetId+':'+(x.author?.id??'')},
 revision:{action:'staff.revisionQueue',schema:list(revisionItem),key:x=>x.id},
 media:{action:'staff.mediaQueue',schema:list(mediaItem),key:x=>x.group??x.id},
 community:{action:'staff.communityQueue',schema:list(commItem),key:x=>x.id},
 event:{action:'staff.eventQueue',schema:list(eventItem),key:x=>x.id},
 age:{action:'staff.ageCheckQueue',schema:list(ageItem),key:x=>x.id},
 photo:{action:'staff.photoCheckQueue',schema:list(photoItem),key:x=>x.id},
 appeal:{action:'staff.appealQueue',schema:list(appealItem),key:x=>x.id},
 notice:{action:'staff.noticeQueue',schema:list(noticeItem),key:x=>x.id},
};
const QUEUE_IDS=Object.keys(QUEUES) as QueueId[];
/** Who may open what (the server's requireStaff lists); the screen only asks for what the roles allow. Queues not
 * listed are open to every staff role that has a queue. */
const QUEUE_ROLES:Partial<Record<QueueId,string[]>>={appeal:['owner','lead']};
const SECTION_ROLES={queues:['owner','lead','moderator','verifier'],support:['owner','lead','moderator','support'],measures:['owner','lead','moderator'],premium:['owner','lead'],maintenance:['owner','lead'],cities:['owner','lead'],journal:['owner','lead','auditor'],access:['owner','lead'],team:['owner'],topics:['owner','lead'],documents:['owner','lead'],transparency:['owner','lead','auditor'],words:['owner','lead']} as const;
const SECTIONS=['queues','measures','journal','support','team','topics','documents','words','transparency','premium','maintenance','cities','access'] as const;
type Section=typeof SECTIONS[number];
const can=(roles:readonly string[],need:readonly string[]|undefined)=>!need||roles.some(r=>need.includes(r));
const LIMIT=50;
type Loaded={[K in QueueId]?:{items:Items[K],locked?:boolean|undefined,next?:string|null|undefined,tail?:string|null|undefined,total?:number|undefined}|{error:unknown}};
const forbidden=(e:unknown)=>e instanceof FeError&&e.code==='forbidden';

/** Staff roles of the signed-in account; [] for everyone else (and while loading: null). */
export function useStaffRoles(){return useStaffMe().roles;}

/** Roles and this sign-in's second-factor state (`reload` after a code). `checked`: the server answered in this visit —
 * the remembered answer may be hours old, so the staff area waits for it before opening anything (`fresh` = true). */
function useStaffMe({fresh=false}:{fresh?:boolean}={}){
 const {call,peek}=useFe();
 const [me,setMe]=useState<{roles:string[]|null,factor:Factor|null,checked:boolean}>(()=>{const p=peek('staff.me',{},meRes,{asAccount:true});return {roles:p?.roles??null,factor:p?.factor??null,checked:false};});
 const [nonce,setNonce]=useState(0);
 useEffect(()=>{const ctl=new AbortController();
  call('staff.me',{},meRes,{asAccount:true,signal:ctl.signal,fresh:fresh||nonce>0}).then(r=>setMe({roles:r.roles,factor:r.factor??null,checked:true})).catch(()=>{if(!ctl.signal.aborted)setMe({roles:[],factor:null,checked:true});});
  return ()=>ctl.abort();},[call,nonce,fresh]);
 // A role granted or revoked (`boot` to the account, server/live.mjs): the staff entry appears or goes without a restart.
 useLive('profile',()=>setNonce(n=>n+1));
 return {...me,reload:useCallback(()=>setNonce(n=>n+1),[])};
}

/** Me header button, shown only to staff. */
export function StaffEntry(){
 const roles=useStaffRoles();const {t}=useI18n();const navigate=useNavigate();
 const waiting=useStaffCounts(!!roles?.length)?.total;
 if(!roles?.length)return null;
 // The number on the shield is what waits for this person in the queues and in support.
 return <IconBtn icon={ShieldCheck} label={waiting?t('fe.staff.entryN',{n:String(waiting)}):t('fe.staff.entry')} title={t('fe.staff.entryText')} badge={waiting||undefined} onClick={()=>navigate('/n/staff')}/>;
}

export function StaffScreen(){
 const {t}=useI18n();const {roles,factor,checked,reload}=useStaffMe({fresh:true});const navigate=useNavigate();
 const [section,setSection]=useKept<Section>('section','queues');
 const ok:Section[]=roles?SECTIONS.filter(id=>can(roles,SECTION_ROLES[id])):[];const cur:Section=ok.includes(section)?section:ok[0]??'queues';
 // The whole cabinet is on the screen (owner 05.11.2026: nothing hidden in a menu): a row of areas, and under it the
 // sections of the area when it has several. An area shows only to who has a role for one of its sections.
 const areas=AREAS.map(a=>({...a,items:a.items.filter(id=>ok.includes(id))})).filter(a=>a.items.length);
 const area=areas.find(a=>a.items.includes(cur))??areas[0];
 const label=(id:Section)=>t(SECTION_LABEL[id]);
 const ready=!!roles?.length&&checked&&!(factor&&(!factor.enrolled||!factor.verified));
 const counts=useStaffCounts(ready);
 const waiting=(id:Section)=>id==='queues'?(counts?counts.total-counts.support:0):id==='support'?(counts?.support??0):0;
 const areaWord=(a:{id:string,items:Section[]})=>t('fe.staff.area.'+a.id)+(a.items.reduce((n,id)=>n+waiting(id),0)>0?' · '+a.items.reduce((n,id)=>n+waiting(id),0):'');
 return <>
  <SubBar title={t('fe.staff.title')} onBack={()=>navigate('/n/me')}/>
  <View className="nodock">
   {roles===null||(!checked&&!!roles.length)?<Skel kind="list"/>
    :!roles.length?<Empty icon={Lock} title={t('fe.staff.unavailable')} text={t('fe.staff.unavailableText')}/>
    // Second factor first (server/commands/staff.mjs): connect the app, then a code in this sign-in.
    :factor&&!factor.enrolled?<StaffEnrol onDone={reload}/>
    :factor&&!factor.verified?<StaffUnlock factor={factor} onDone={reload}/>
    :<>
     <FactorPromptHost onEnrol={reload}/>
     {area&&<>
      <ChoiceChips scroll label={t('fe.staff.title')} value={area.id} options={areas.map(a=>[a.id,areaWord(a)] as [string,string])} onChange={id=>setSection(areas.find(a=>a.id===id)?.items[0]??'queues')}/>
      {area.items.length>1&&<Seg<Section> small={false} value={cur} onChange={setSection}
       options={area.items.map(id=>{const n=waiting(id);return {id,label:label(id),...(n>0?{dot:t('fe.staff.entryN',{n:String(n)})}:{})};})}/>}
     </>}
     {cur==='queues'?<Queues/>:cur==='support'?<StaffSupport/>:cur==='measures'?<People/>:cur==='premium'?<Premium/>:cur==='maintenance'?<StaffMaintenance/>:cur==='cities'?<StaffCities/>:cur==='journal'?<Journal/>:cur==='access'?<FactorReset/>:cur==='team'?<Team/>:cur==='topics'?<Topics/>:cur==='documents'?<Documents/>:cur==='transparency'?<Transparency/>:cur==='words'?<Words/>:null}
    </>}
  </View>
 </>;
}
/** Areas of the cabinet: «Модерация» is the work on reports and people, «Журнал» is its own area (it holds every staff action, not only moderation's). */
const AREAS:{id:string,items:Section[]}[]=[
 {id:'moderation',items:['queues','measures','words','transparency']},
 {id:'support',items:['support']},
 {id:'journal',items:['journal']},
 {id:'content',items:['topics','documents']},
 {id:'team',items:['team','access']},
 {id:'service',items:['premium','maintenance','cities']},
];
/** The system «Назад» closes the sheet it sits in instead of leaving the staff area. */
function BackCloses({onClose}:{onClose:()=>void}){useBackClose(onClose);return null;}
const SECTION_LABEL:Record<Section,string>={queues:'fe.staff.section.queues',measures:'fe.staff.section.measures',support:'fe.w8.staff.support',premium:'fe.staff.section.premium',maintenance:'fe.w8.staff.maint',cities:'fe.staff.section.cities',journal:'fe.staff.section.journal',access:'fe.staff.section.access',team:'fe.staff.section.team',topics:'fe.staff.section.topics',documents:'fe.staff.section.documents',transparency:'fe.staff.section.transparency',words:'fe.staff.section.words'};

type Order='old'|'new';
type PageOf={items:unknown[],locked?:boolean|undefined,next?:string|null|undefined,tail?:string|null|undefined,total?:number|undefined};
/** Live refresh: every 20 s the open queue looks for what is new, while the tab is visible. */
const REFRESH_MS=20000;

/** Merges a live look into the open queue. Newest first: the top page is refreshed and new items land above. Oldest
 * first: what came after the last shown item lands below (the rest comes with «Ещё»). Nothing is repeated. */
function mergeLive(d:Loaded|null,id:QueueId,order:Order,r:PageOf):Loaded|null{
 const cur=d?.[id];if(!d||!cur||!('items' in cur))return d;
 const keyOf=QUEUES[id].key as (x:unknown)=>string;
 const fresh=r.items;
 if(order==='new'){
  const top=new Set(fresh.map(keyOf));
  return {...d,[id]:{...cur,items:[...fresh,...cur.items.filter(x=>!top.has(keyOf(x)))],locked:r.locked??cur.locked}} as Loaded;
 }
 if(!fresh.length)return d;
 const have=new Set(cur.items.map(keyOf));
 return {...d,[id]:{...cur,items:[...cur.items,...fresh.filter(x=>!have.has(keyOf(x)))],next:r.next??null,tail:r.tail??cur.tail,locked:r.locked??cur.locked}} as Loaded;
}

function Queues(){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();const roles=useStaffRoles();
 const [data,setData]=useSeen<Loaded|null>('Queues.data',()=>null);const [tab,setTab]=useKept<QueueId|'all'>('tab','all');const [notice,setNotice]=useState('');
 // One list by the time each item arrived, newest on top (a new arrival is where it is expected); the button turns it round.
 const [order,setOrder]=useState<Order>('new');
 const [only,setOnly]=useState<'all'|'urgent'|'late'>('all');
 const known=useRef(new Set<string>()); // what was in the list when it loaded: later arrivals are «Новое»
 const [focus,setFocus]=useState<number|null>(null);const [picking,setPicking]=useState(false);
 const [pageBusy,setPageBusy]=useState(false);const [pageError,setPageError]=useState<unknown>(null);
 // The live timer reads the screen as it is at each tick, not as it was when the timer was set.
 const live=useRef({data:null as Loaded|null,tab:'all' as QueueId|'all',busy:false,focus:false,order:'old' as Order});
 live.current={data,tab,busy:pageBusy,focus:focus!==null,order};
 const load=useCallback((fresh=false)=>{
  setData(null);setNotice('');setPageError(null);
  const ids=QUEUE_IDS.filter(id=>can(roles??[],QUEUE_ROLES[id]));
  void Promise.allSettled(ids.map(id=>call(QUEUES[id].action,{limit:LIMIT,order},QUEUES[id].schema as z.ZodType<PageOf>,{asAccount:true,fresh}))).then(rs=>{
   const next:Record<string,PageOf|{error:unknown}>={};
   rs.forEach((r,i)=>{const id=ids[i]!;if(r.status==='fulfilled')next[id]={items:r.value.items,locked:r.value.locked,next:r.value.next,tail:r.value.tail,total:r.value.total};else if(!forbidden(r.reason))next[id]={error:r.reason};});
   known.current=new Set(Object.entries(next).flatMap(([id,v])=>'items' in v?(v.items as unknown[]).map(x=>id+':'+(QUEUES[id as QueueId].key as (x:unknown)=>string)(x)):[]));
   setData(next as Loaded);
  });
 },[call,roles,order]);
 useEffect(()=>{if(roles)load();},[load,roles]);
 useEffect(()=>{
  const timer=setInterval(()=>{
   const s=live.current;
   // Not while one item is open: the list would move under the review.
   if(document.hidden||!s.data||s.busy||s.focus)return;
   const ids=s.tab==='all'?(Object.keys(s.data) as QueueId[]):[s.tab];
   for(const id of ids){
    const v=s.data[id];if(!v||!('items' in v)||v.next)continue; // more pages to load: the rest comes with «Ещё»
    const ord=s.order;
    void call(QUEUES[id].action,{limit:LIMIT,order:ord,...(ord==='old'&&v.tail?{after:v.tail}:{})},QUEUES[id].schema as z.ZodType<PageOf>,{asAccount:true})
     .then(r=>{if(live.current.order===ord)setData(d=>mergeLive(d,id,ord,r));}).catch(()=>{});
   }
  },REFRESH_MS);
  return()=>clearInterval(timer);
 },[call]);
 if(!data)return <Skel kind="list"/>;
 const avail=QUEUE_IDS.filter(id=>data[id]);
 if(!avail.length)return <Empty icon={Inbox} title={t('fe.staff.noQueues')}/>;
 const failed=(id:QueueId)=>{const v=data[id];return !!v&&'error' in v;};
 const itemsOf=(id:QueueId)=>{const v=data[id];return v&&'items' in v?v.items as unknown[]:[];};
 const more=(id:QueueId)=>{const v=data[id];return !!v&&'items' in v&&!!v.next;};
 // The whole queue (the server counts it), not just the loaded page.
 const count=(id:QueueId)=>{const v=data[id];const n=itemsOf(id).length;return v&&'items' in v&&v.total!==undefined?Math.max(v.total,n):more(id)?n+'+':n;};
 const totalOf=(id:QueueId)=>{const c=count(id);return typeof c==='number'?c:parseInt(c,10);};
 // The work list: one queue, or every queue together; urgent first, then what is past its time, then the oldest.
 const ids=tab==='all'?avail:[tab];
 const every:Entry[]=ids.flatMap(id=>itemsOf(id).map(item=>({id,item,key:(QUEUES[id].key as (x:unknown)=>string)(item),...urgencyOf(id,item)})));
 every.sort((x,y)=>order==='old'?x.since-y.since:y.since-x.since);
 const urgentN=every.filter(e=>e.level==='urgent').length;const lateN=every.filter(e=>e.level==='late').length;
 // «Срочно» and «Давно ждут» narrow the one list; they do not reorder it.
 const entries=only==='urgent'?every.filter(e=>e.level==='urgent'):only==='late'?every.filter(e=>e.level==='late'):every;
 const allUrgent=avail.reduce((n,id)=>n+itemsOf(id).filter(x=>urgencyOf(id,x).level==='urgent').length,0);
 // Every queue pages: the next page starts after the cursor of the last item shown, appended without repeats.
 const loadMore=(id:QueueId)=>{
  const v=data[id];
  if(!v||!('items' in v)||!v.next||pageBusy)return;
  setPageBusy(true);
  void call(QUEUES[id].action,{limit:LIMIT,order,after:v.next},QUEUES[id].schema as z.ZodType<PageOf>,{asAccount:true}).then(r=>{
   setData(d=>{const cur=d?.[id];if(!d||!cur||!('items' in cur))return d;const keyOf=QUEUES[id].key as (x:unknown)=>string;const have=new Set(cur.items.map(keyOf));
    return {...d,[id]:{...cur,items:[...cur.items,...r.items.filter(x=>!have.has(keyOf(x)))],next:r.next??null,tail:r.tail??cur.tail}} as Loaded;});
   setPageError(null);
  }).catch(e=>setPageError(e)).finally(()=>setPageBusy(false));
 };
 // A decision takes the item out; the review stays open on the one that now has its place (the next), or closes at the end.
 const done=(id:QueueId,key:string)=>{
  setData(d=>{if(!d)return d;const v=d[id];if(!v||!('items' in v))return d;
   const keyOf=QUEUES[id].key as (x:unknown)=>string;return {...d,[id]:{items:(v.items as unknown[]).filter(x=>keyOf(x)!==key),next:v.next,tail:v.tail,locked:v.locked,total:v.total!==undefined?Math.max(0,v.total-1):undefined}} as Loaded;});
  void pullStaffCounts(call,true); // the numbers on the tabs, the dock and the profile follow the decision
  setFocus(f=>f===null?null:entries.length<=1?null:Math.min(f,entries.length-2));
  if(entries.length<=1)setNotice(t('fe.staff.allDone'));
 };
 const locked=ids.some(id=>{const v=data[id];return !!v&&'items' in v&&!!v.locked&&v.items.length>0;});
 const errors=ids.filter(failed);
 const single=tab!=='all'?tab:null;
 const cur=focus!==null?entries[focus]:undefined;
 return <>
  {/* What is shown: everything together, or one queue — picked in a sheet with each queue's count and urgent items. */}
  <SectionLabel>{t('fe.staff.waiting',{n:String(ids.reduce((n,id)=>n+totalOf(id),0))})} · {t(order==='old'?'fe.staff.order.oldTop':'fe.staff.order.newTop')}</SectionLabel>
  <div className="st-filterrow">
   <Btn kind="soft" icon={ListFilter} onClick={()=>setPicking(true)}>{tab==='all'?t('fe.staff.q.all'):queueLabel(tab,t)}</Btn>
   <IconBtn icon={ArrowUpDown} label={t(order==='old'?'fe.staff.sort.toNew':'fe.staff.sort.toOld')} onClick={()=>{setOrder(o=>o==='old'?'new':'old');setNotice('');setFocus(null);}}/>
   <IconBtn icon={RefreshCw} label={t('fe.staff.refresh')} onClick={()=>load(true)}/>
  </div>
  {(urgentN>0||lateN>0)&&<Chips>
   <Chip on={only==='all'} onClick={()=>{setOnly('all');setFocus(null);}}>{t('fe.staff.f.all')}</Chip>
   {urgentN>0&&<Chip on={only==='urgent'} onClick={()=>{setOnly('urgent');setFocus(null);}}>{t('fe.staff.urgentN',{n:String(urgentN)})}</Chip>}
   {lateN>0&&<Chip on={only==='late'} onClick={()=>{setOnly('late');setFocus(null);}}>{t('fe.staff.lateN',{n:String(lateN)})}</Chip>}
  </Chips>}
  {picking&&<Sheet title={t('fe.staff.queuesLabel')} onClose={()=>setPicking(false)}>
   <BackCloses onClose={()=>setPicking(false)}/>
   <Card list>
    {[...(['all'] as const),...avail].map(id=>{const urg=id==='all'?allUrgent:itemsOf(id).filter(x=>urgencyOf(id,x).level==='urgent').length;
     const n=id==='all'?avail.reduce((m,q)=>m+totalOf(q),0):count(id);
     return <Row key={id} icon={id==='all'?Inbox:QUEUE_ICON[id]} title={id==='all'?t('fe.staff.q.all'):queueLabel(id,t)} pressed={tab===id}
      sub={id!=='all'&&failed(id)?t('fe.error.title'):urg?t('fe.staff.urgentN',{n:String(urg)}):undefined} val={String(n)}
      onClick={()=>{setTab(id);setNotice('');setFocus(null);setPicking(false);}}/>;})}
   </Card>
  </Sheet>}
  {notice&&<Alert kind="ok" icon={Check}>{notice}</Alert>}
  {errors.map(id=><Alert key={id} kind="err" action={<Btn kind="soft" size="sm" auto icon={RefreshCw} onClick={()=>load(true)}>{t('fe.retry')}</Btn>}>
   {t('fe.staff.q.'+id)}: {feErrorMessage((data[id] as {error:unknown}).error,t)}</Alert>)}
  {locked&&<Alert kind="info" icon={Lock} action={<Btn kind="soft" size="sm" auto onClick={()=>void askFactor('fresh').then(ok=>{if(ok)load(true);})}>{t('fe.sf.enterCode')}</Btn>}>{t('fe.sf.lockedMedia')}</Alert>}
  {single==='dispute'&&<FlaggedClaimants/>}
  {!entries.length?<Empty compact icon={Inbox} title={t('fe.staff.qEmpty')} text={t('fe.staff.qEmptyText')}/>
   :<Card list>{entries.map((e,i)=><QueueRow key={e.id+':'+e.key} e={e} fresh={!known.current.has(e.id+':'+e.key)} onOpen={()=>{known.current.add(e.id+':'+e.key);setFocus(i);}}/>)}</Card>}
  {/* One «Ещё» for the list: the next page of every queue in it that has more. */}
  <LoadMore more={ids.some(more)} busy={pageBusy} error={pageError} onMore={()=>ids.filter(more).forEach(loadMore)}/>
  {cur&&focus!==null&&<Sheet full className="st-focus" title={titleOf(cur,t)} sub={t('fe.staff.pos',{n:String(focus+1),all:String(entries.length)})+' · '+t('fe.staff.waits',{time:waited(cur.since,t)})}
   onClose={()=>setFocus(null)}>
   <BackCloses onClose={()=>setFocus(null)}/>
   <Claim item={cur.id+':'+cur.key}/>
   {cur.id==='dispute'&&<Note>{t('fe.staff.howText')}</Note>}
   <ReviewNavCtx.Provider value={{prev:focus>0?()=>setFocus(focus-1):undefined,next:focus<entries.length-1?()=>setFocus(focus+1):undefined,prevLabel:t('fe.staff.prev'),nextLabel:t('fe.staff.next')}}>
    {/* On a phone the next and the previous item come with a swipe; ‹ › stay for a mouse (owner 05.11.2026). */}
    <Swipe onLeft={focus<entries.length-1?()=>setFocus(focus+1):undefined} onRight={focus>0?()=>setFocus(focus-1):undefined}>
     <QueueList key={cur.id+':'+cur.key} id={cur.id} items={[cur.item]} onDone={key=>{toast(t('fe.staff.done'),{type:'ok'});done(cur.id,key);}}/>
    </Swipe>
   </ReviewNavCtx.Provider>
  </Sheet>}
 </>;
}

/** «Взять в работу» (owner 05.11.2026): the open item is this moderator's for ten minutes (renewed while it stays open);
 * someone else's item says who has it — a hint, not a lock. */
function Claim({item}:{item:string}){
 const {call}=useFe();const {t}=useI18n();const [by,setBy]=useState<string|null>(null);
 useEffect(()=>{let live=true;const claimRes=z.object({ok:z.literal(true),claimed:z.boolean(),by:z.string().nullable().optional()});
  const take=()=>call('staff.claim',{opId:newOpId(),item,on:true},claimRes,{asAccount:true}).then(r=>{if(live)setBy(r.claimed?null:(r.by??t('fe.staff.noName')));}).catch(()=>{});
  void take();const timer=window.setInterval(()=>void take(),5*60*1000);
  return()=>{live=false;clearInterval(timer);void call('staff.claim',{opId:newOpId(),item,on:false},claimRes,{asAccount:true}).catch(()=>{});};
 },[call,item,t]);
 return by?<Alert kind="warn" icon={Users}>{t('fe.staff.claimedBy',{name:by})}</Alert>:null;
}

type Level='urgent'|'late'|null;
type Entry={id:QueueId,item:unknown,key:string,level:Level,since:number};
const HOUR=3600e3;
/** How long an item may wait before it is late (owner's working rules, pre-launch; one place to change them). */
const SLA:Record<QueueId,number>={dispute:24*HOUR,report:24*HOUR,revision:48*HOUR,media:24*HOUR,community:48*HOUR,event:48*HOUR,age:24*HOUR,photo:24*HOUR,appeal:72*HOUR,notice:24*HOUR};
/** When an item started to wait. */
function sinceOf(id:QueueId,x:unknown):number{
 const o=x as Record<string,unknown>;
 const v=id==='dispute'?o.opened_at??o.disputed_at:id==='report'?o.firstAt:id==='revision'||id==='media'?o.createdAt:id==='age'||id==='photo'?o.submittedAt:o.created_at;
 const n=typeof v==='string'?Date.parse(v):NaN;return Number.isFinite(n)?n:Date.now();
}
/** Urgent: minors, threats, a suspected attack or CSAM — whatever the age; late: past its time. */
function urgencyOf(id:QueueId,x:unknown):{level:Level,since:number}{
 const o=x as Record<string,unknown>;const since=sinceOf(id,x);
 const urgent=id==='report'?(o.reasons as string[]).some(r=>r==='minor'||r==='threat')
  :id==='dispute'?!!o.urgent||!!o.attack
  :id==='media'?/minor|csam/.test(String(o.reason??''))
  :id==='notice'?['csam','minors','threats'].includes(String(o.reason)):false;
 return {level:urgent?'urgent':Date.now()-since>SLA[id]?'late':null,since};
}
const queueLabel=(id:QueueId,t:T)=>id==='photo'?t('fe.pc.staff.tab'):t('fe.staff.q.'+id);
const QUEUE_ICON:Record<QueueId,LucideIcon>={dispute:UserX,report:Flag,revision:FilePen,media:Image,community:Users,event:CalendarDays,age:IdCard,photo:BadgeCheck,appeal:Scale,notice:Gavel};
type T=(k:string,v?:Record<string,string>)=>string;
const nick=(h:unknown)=>typeof h==='string'&&h?'@'+h:'';
function titleOf(e:Entry,t:T):string{
 const o=e.item as Record<string,any>;
 switch(e.id){
  case 'report':return t('fe.staff.what.report.'+o.targetType);
  case 'community':return t(o.state==='in_review'?'fe.staff.what.community.new':'fe.staff.what.community.change');
  case 'event':return t(o.state==='in_review'?'fe.staff.what.event.new':'fe.staff.what.event.change');
  case 'age':return t(o.method==='document'?'fe.staff.what.age.doc':'fe.staff.what.age.selfie');
  default:return t('fe.staff.what.'+e.id);
 }
}
const snip=(v:unknown,n=90)=>{const x=typeof v==='string'?v.replace(/\s+/g,' ').trim():'';return x.length>n?x.slice(0,n)+'…':x;};
/** The two lines under a row's title: who / why, then the thing itself. */
function gistOf(e:Entry,t:T):[string,string]{
 const o=e.item as Record<string,any>;
 const purpose=(p:unknown)=>{const x=t('fe.staff.media.purpose.'+p);return x.startsWith('fe.')?'':x;};
 switch(e.id){
  case 'report':return [[(o.reasons as string[]).map(r=>{const x=t('fe.staff.report.reason.'+r);return x.startsWith('fe.')?t('fe.staff.report.reason.other'):x;}).join(', '),nick(o.author?.handle)].filter(Boolean).join(' · '),snip(o.object?.title?o.object.title+': '+o.object.body:o.excerpt)];
  case 'dispute':return [[t('fe.staff.dispute.claims',{n:String(o.claims?.length??1)}),t(o.hidden?'fe.staff.dispute.hidden':'fe.staff.dispute.urgent')].join(' · '),snip(o.excerpt)];
  case 'revision':return [t('fe.staff.gist.revision'),snip(o.live)];
  case 'media':return [purpose(o.purpose),snip(o.usedIn)];
  case 'community':return [o.name,snip(o.description)];
  case 'event':return [o.title,snip(o.description)];
  case 'age':return [nick(o.profile?.handle),''];
  case 'photo':return [nick(o.profile?.handle),''];
  case 'appeal':return [[nick(o.handle),t('fe.staff.report.type.'+o.target_type)].filter(Boolean).join(' · '),snip(o.body)];
  case 'notice':return [t('fe.staff.notice.reason.'+o.reason).startsWith('fe.')?'':t('fe.staff.notice.reason.'+o.reason),snip(o.target_url)];
  default:return ['',''];
 }
}
/** «3 ч», «2 дн»: how long it waits. */
function waited(since:number,t:T){const m=Math.max(1,Math.round((Date.now()-since)/60000));
 return m<60?t('fe.staff.wait.m',{n:String(m)}):m<48*60?t('fe.staff.wait.h',{n:String(Math.round(m/60))}):t('fe.staff.wait.d',{n:String(Math.round(m/1440))});}
/** One row of the work list: what it is (the kind, in words), who and why, the thing itself in a line, how long it
 * waits; urgent and new marked. */
function QueueRow({e,fresh,onOpen}:{e:Entry,fresh:boolean,onOpen:()=>void}){
 const {t}=useI18n();const [line1,line2]=gistOf(e,t);
 return <Row icon={QUEUE_ICON[e.id]} tone={e.level==='urgent'?'l':undefined} title={<>{e.level==='urgent'&&<><Pill tone="bad">{t('fe.staff.urgent')}</Pill>{' '}</>}{titleOf(e,t)}</>} sub={line1||undefined}
  extra={line2?<small className="st-gist">{line2}</small>:undefined} onClick={onOpen}
  val={fresh?<Pill tone="v">{t('fe.staff.new')}</Pill>:waited(e.since,t)}/>;
}

function QueueList({id,items,onDone}:{id:QueueId,items:unknown[],onDone:(key:string)=>void}){
 const keyOf=QUEUES[id].key as (x:unknown)=>string;
 return <>{items.map(x=>{const k=keyOf(x);const done=()=>onDone(k);
  switch(id){
   case 'dispute':return <DisputeCard key={k} item={x as DisputeItem} onDone={done}/>;
   case 'revision':return <RevisionCard key={k} item={x as RevisionItem} onDone={done}/>;
   case 'media':return <MediaCard key={k} item={x as MediaItem} onDone={done}/>;
   case 'community':return <CommunityCard key={k} item={x as CommItem} onDone={done}/>;
   case 'event':return <EventCard key={k} item={x as EventItem} onDone={done}/>;
   case 'age':return <AgeCard key={k} item={x as AgeItem} onDone={done}/>;
   case 'photo':return <PhotoCard key={k} item={x as PhotoItem} onDone={done}/>;
   case 'report':return <ReportCard key={k} item={x as ReportItem} onDone={done}/>;
   case 'appeal':return <AppealCard key={k} item={x as AppealItem} onDone={done}/>;
   case 'notice':return <NoticeCard key={k} item={x as NoticeItem} onDone={done}/>;
  }
 })}</>;
}

// ——— shared pieces ———

function useDecide(onDone:()=>void,mapError?:(e:unknown)=>string|null){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();const [busy,setBusy]=useState(false);const setFailure=useFail();
 const run=async(action:string,input:Record<string,unknown>)=>{
  setBusy(true);setFailure('');
  try{await call(action,{opId:newOpId(),...input},ok,{asAccount:true});setBusy(false);onDone();}
  catch(e){setBusy(false);
   // The item is no longer waiting (its author deleted it, or it was decided meanwhile): the card leaves the queue.
   if(e instanceof FeError&&e.code==='conflict'&&(e.rule==='gone'||!!e.state)){toast(t('fe.staff.gone'),{type:'info'});onDone();return;}
   setFailure(mapError?.(e)??feErrorMessage(e,t));}
 };
 return {busy,setFailure,run};
}

const useWhen=()=>{const {locale}=useI18n();return (v:string|null|undefined)=>v?new Date(v).toLocaleString(locale==='en'?'en-GB':'ru-RU',{dateStyle:'medium',timeStyle:'short'}):'—';};

/** One queue item as a card: what has to be decided, what happened, the thing itself, the form — and at the bottom, in the
 * same place for every kind of item, the decision bar. A card just lists its blocks; its Actions / Confirm are gathered
 * into the bar here (a failure is a toast, never a block of the card). */
function StCard({title,meta,task,danger,children}:{title:ReactNode,meta?:ReactNode,task?:ReactNode,danger?:boolean|undefined,children:ReactNode}){
 const {t}=useI18n();const nav=useContext(ReviewNavCtx);
 // Fragments are opened up, so a card's Actions inside a condition still go to the bar.
 const flat=(n:ReactNode):ReactNode[]=>Children.toArray(n).flatMap(c=>isValidElement(c)&&c.type===Fragment?flat((c.props as {children?:ReactNode}).children):[c]);
 const kids=flat(children);
 const inBar=(c:ReactNode)=>isValidElement(c)&&(c.type===Actions||c.type===Confirm);
 // The decision bar (owner 05.11.2026): the first button of the card's Actions is the main one, between ‹ and ›; the
 // others are one row of short buttons under it, all of one look (a danger shows in its «Точно?», not in the colour); a question («Точно?») sits above them.
 const acts=kids.find(c=>isValidElement(c)&&c.type===Actions) as React.ReactElement<{children?:ReactNode}>|undefined;
 const buttons=acts?Children.toArray(acts.props.children).filter(isValidElement):[];
 const rest=kids.filter(c=>inBar(c)&&c!==acts);
 const showBar=rest.length>0||buttons.length>0||!!nav;
 return <ReviewCard title={title} meta={meta} danger={danger}>
  {task&&<Alert kind="info" icon={ClipboardCheck}><b>{t('fe.staff.task')}</b> {task}</Alert>}
  {kids.filter(c=>!inBar(c))}
  {showBar&&<ReviewBar main={buttons[0]} more={buttons.length>1?buttons.slice(1).map(b=>b.type===Btn?cloneElement(b as React.ReactElement<{kind?:string}>,{kind:'soft'}):b):undefined}
   nav={nav??undefined}>{rest}</ReviewBar>}
 </ReviewCard>;
}
/** ‹ › of the open queue item: the card puts them in its decision bar (StCard). */
const ReviewNavCtx=createContext<{prev?:(()=>void)|undefined,next?:(()=>void)|undefined,prevLabel:string,nextLabel:string}|null>(null);
const Kv=KeyValues;

/** A raw status / format / scanner word from the server in plain words (`fe.staff.val.<word>`); an unknown word stays as it is. */
const useVal=()=>{const {t}=useI18n();return (v:string|null|undefined)=>{if(!v)return v;const k='fe.staff.val.'+v;const x=t(k);return x===k?v:x;};};
/** `fe.staff.journal.action.<a>` / `.type.<x>` in words; an unknown one reads «Другое действие» / «объект», never the code. */
const useJournalWord=()=>{const {t}=useI18n();return (kind:'action'|'type',v:string)=>{const k='fe.staff.journal.'+kind+'.'+v;const x=t(k);return x===k?t('fe.staff.journal.'+kind+'.other'):x;};};
/** @nick of a profile, or a plain word when it has none — never its id. */
const useWho=()=>{const {t}=useI18n();return (p:{handle?:string|null|undefined}|null|undefined)=>p?.handle?'@'+p.handle:t('fe.staff.noName');};

const show=(v:unknown):string=>v===null||v===undefined?'—':typeof v==='string'?v:Array.isArray(v)?v.map(show).join(', '):JSON.stringify(v);
/** A value that reads as words (text, number, a list of those); anything structured is not shown on the card. */
const plain=(v:unknown):string|null=>{
 if(v===null||v===undefined||v==='')return null;
 if(typeof v==='string')return v;
 if(typeof v==='number')return String(v);
 if(Array.isArray(v)){const parts=v.map(plain);return parts.every(p=>p!==null)?(parts as string[]).join(', '):null;}
 return null;
};

/** Technical details (ids, raw records) only behind «Подробнее» — never in the visible card. */
function Details({data}:{data:unknown}){
 const {t}=useI18n();
 if(data===null||data===undefined||data===''||show(data)==='{}'||show(data)==='[]')return null;
 return <MoreInfo label={t('fe.staff.more')} hideLabel={t('fe.staff.moreHide')}>{show(data)}</MoreInfo>;
}

/** The text of what is judged. A tap opens the post when `to` is given. */
function Quote({label,text}:{label?:string,text:string}){
 return <Text size="sm">{label&&<Text as="span" size="xs" tone="mute">{label}: </Text>}{text}</Text>;
}

/** The plain facts around a reported or appealed thing, as one line under its kind. */
function factsLine(o:ObjectDto,t:(k:string,v?:Record<string,string>)=>string,when:(v:string|null|undefined)=>string,val:(v:string|null|undefined)=>string|null|undefined):string{
 if(!o)return '';const f=o.facts??{};const parts:string[]=[];
 if(typeof f.at==='string')parts.push(when(f.at));
 if(typeof f.state==='string'&&f.state!=='published')parts.push(val(f.state)??f.state);
 const aud=typeof f.audience==='string'?{followers:'fe.fd.aud.followers',granted:'fe.fd.aud.granted',only:'fe.fd.aud.only'}[f.audience]:undefined;
 if(aud)parts.push(t('fe.staff.obj.audience',{who:t(aud)}));
 if(typeof f.privacy==='string'){const x=t('fe.staff.chg.privacy.'+f.privacy);if(!x.startsWith('fe.'))parts.push(x);}
 if(typeof f.format==='string')parts.push(val(f.format)??f.format);
 if(typeof f.area==='string'&&f.area)parts.push(f.area);
 if(Array.isArray(f.topics)&&f.topics.length)parts.push(f.topics.join(', '));
 return parts.join(' · ');
}

/** What waits for a decision, in words: every field reads «Название: было → стало»; a new cover shows as a picture next
 * to the old one. A field with no plain label or value stays out of the card (it is in «Подробнее»). */
type Diff={before:Record<string,unknown>,covers?:{was:string|null,now:string|null,missing:boolean}};
function Changes({change,diff}:{change:Record<string,unknown>|null|undefined,diff:Diff}){
 const {t,locale}=useI18n();const when=useWhen();const val=useVal();
 if(!change||!Object.keys(change).length)return null;
 const word=(k:string,v:unknown):string=>{
  if(v===null||v===undefined||v==='')return t('fe.staff.chg.empty');
  if(k==='privacy'){const w=t('fe.staff.chg.privacy.'+String(v));return w.startsWith('fe.')?String(v):w;}
  if(k==='startsAt'||k==='endsAt')return when(String(v));
  if(k==='format'||k==='kind')return val(String(v))??'';
  if(k==='price'&&v&&typeof v==='object')return priceText(v as {kind:string,amount?:number,currency?:string},t,locale);
  if(typeof v==='boolean')return t(v?'fe.staff.yes':'fe.staff.no');
  return plain(v)??t('fe.staff.chg.changed');
 };
 const label=(k:string)=>{const x=t('fe.staff.chg.'+k);return x.startsWith('fe.')?null:x;};
 const rows:[string,ReactNode][]=Object.entries(change).filter(([k])=>k!=='coverAssetId'&&label(k)).map(([k,v])=>{
  const was=word(k,diff.before[k]);const now=word(k,v);
  return [label(k)!,k==='description'?<><Text as="div" size="sm" tone="mute">{t('fe.staff.chg.was')}: {was}</Text><Text as="div" size="sm">{t('fe.staff.chg.now')}: {now}</Text></>:was+' → '+now];
 });
 const c=diff.covers;
 return <>
  <Alert kind="warn">{t('fe.staff.pendingChange')}</Alert>
  <Kv rows={rows}/>
  {'coverAssetId' in change&&c&&<LookTiles tiles={[{label:t('fe.staff.chg.was'),icon:ImageOff},{label:c.missing?t('fe.staff.comm.noPicture'):t('fe.staff.chg.now'),icon:ImageOff}]}
   shown={{slides:[c.was??null,c.now??null],thumbs:[c.was??null,c.now??null]}}/>}
 </>;
}

/** Inline confirmation for destructive decisions (no window.confirm): a question with its two answers, the danger one last. */
function Confirm({text,danger,busy,onYes,onNo}:{text:string,danger?:boolean,busy:boolean,onYes:()=>void,onNo:()=>void}){
 const {t}=useI18n();
 return <Alert kind={danger?'err':'warn'} role="alertdialog" {...(danger?{icon:ShieldAlert}:{})} action={<Actions>
  <Btn kind="soft" disabled={busy} onClick={onNo}>{t('fe.cancel')}</Btn>
  <Btn kind="danger" disabled={busy} busy={busy} onClick={onYes}>{t('fe.staff.confirm')}</Btn>
 </Actions>}>{text}</Alert>;
}

/** One reason / rule from a set, as a labelled field of the card's form. */
function Choice<T extends string>({label,value,options,onChange,disabled}:{label:string,value:T|'',options:{id:T,label:string}[],onChange:(v:T)=>void,disabled?:boolean}){
 const {t}=useI18n();
 // A long list (rules, reasons) is one line on a phone; two to four options stay chips, one tap each.
 if(options.length>4)return <Field label={label}><Select<string> label={label} value={value} onChange={v=>{if(v)onChange(v as T);}}
  options={[['',t('fe.staff.pick')] as const,...options.map(o=>[o.id,o.label] as const)]}/></Field>;
 return <Field label={label}><ChoiceChips label={label} value={value||null} onChange={onChange} disabled={!!disabled} options={options.map(o=>[o.id,o.label] as const)}/></Field>;
}

function TextField({label,value,onChange,max,rows=2}:{label:string,value:string,onChange:(v:string)=>void,max:number,rows?:number}){
 const id=useId();const {t}=useI18n();
 // Kit validation layer: a staff note follows the same text rules as the server (characters, lines, long runs).
 const err=value.trim()?textError(t,textRule(max),value):undefined;
 return <Field id={id} label={label} error={err}><TextArea id={id} rows={rows} maxLength={max*2} invalid={!!err} value={value} onChange={e=>onChange(e.target.value)}/></Field>;
}

/** A labelled one-line field of the staff forms. */
function LineField({label,value,onChange,max,hint,...rest}:{label:string,value:string,onChange:(v:string)=>void,max:number,hint?:string}&Pick<React.InputHTMLAttributes<HTMLInputElement>,'inputMode'|'autoCapitalize'|'spellCheck'>){
 const id=useId();
 return <Field id={id} label={label} hint={hint}><Input id={id} value={value} maxLength={max} onChange={e=>onChange(e.target.value)} {...rest}/></Field>;
}



const RULES=['minors','threats','private_material','spam','illegal','community_rules'] as const;
/** «Имя @ник» of a profile on a card. */
const personName=(p:{name?:string|null|undefined,handle?:string|null|undefined}|null|undefined)=>p?[p.name,p.handle&&'@'+p.handle].filter(Boolean).join(' ')||null:null;

// ——— photos ———

const MEDIA_REASONS=['minor','not_a_person','violence','private_material','spam','invalid','other'] as const;
const PUBLIC_ONLY=new Set(['avatar','community','event']);
function MediaCard({item,onDone}:{item:MediaItem,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();const val=useVal();const toast=useToast();
 const [src,setSrc]=useState<{card?:string|undefined,full?:string|undefined,file?:string|undefined}|null|undefined>(undefined);
 const [reason,setReason]=useState<typeof MEDIA_REASONS[number]|''>('');const [ask,setAsk]=useState<'reject'|'csam'|null>(null);
 const d=useDecide(onDone);const [busy,setBusy]=useState(false);
 const owner=personName(item.owner);
 // One card per upload (owner 05.11.2026): every file of the post together; one look opens them all.
 const files=item.assets?.length?item.assets:[{id:item.id,kind:item.kind,blur:item.blur}];
 const [off,setOff]=useState<Set<string>>(new Set());
 const marked=files.filter(f=>off.has(f.id)).length;const keep=files.length-marked;
 // The full pictures only through staff.mediaView: short-lived URLs, and each look is journalled.
 const open=async():Promise<Shown>=>{
  const rs=await Promise.all(files.map(f=>call('staff.mediaView',{assetId:f.id},viewRes,{asAccount:true})));setSrc(rs[0]?.src??null);
  return {slides:rs.map((r,i)=>slideOf(files[i]!.kind,r.src)),thumbs:rs.map(r=>thumbOf(r.src))};};
 // The decision for the whole upload: files marked «отклонить» are rejected with the reason, the rest approved.
 const decide=async(approve:boolean,explicit=false)=>{
  setBusy(true);d.setFailure('');
  try{
   for(const f of files){
    const no=!approve||off.has(f.id);
    try{await call('staff.mediaDecide',{opId:newOpId(),assetId:f.id,...(no?{decision:'reject',reason}:{decision:'approve',explicit})},ok,{asAccount:true});}
    catch(e){if(!(e instanceof FeError&&e.code==='conflict'))throw e;} // decided meanwhile or removed by its author
   }
   onDone();
  }catch(e){d.setFailure(feErrorMessage(e,t));toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(false);}
 };
 const purpose=t('fe.staff.media.purpose.'+item.purpose);
 const explicit=!PUBLIC_ONLY.has(item.purpose);
 const tileOf=(kind:string,n:number)=>({label:t(kind==='video'?'fe.staff.tile.video':kind==='audio'?'fe.staff.tile.audio':'fe.staff.tile.photo',{n:String(n)}),icon:tileIcon(kind)});
 const many=files.length>1;
 return <StCard title={purpose.startsWith('fe.')?t('fe.staff.media.purpose.other'):purpose} task={t(many?'fe.staff.task.mediaMany':'fe.staff.task.media',{n:files.length})} meta={when(item.createdAt)}>
  <LookTiles tiles={files.map((f,i)=>({...tileOf(f.kind,i+1),blur:f.blur}))} load={open} note={t(many?'fe.staff.media.openNoteMany':'fe.staff.media.openNote')}
   off={files.map(f=>off.has(f.id))} onToggle={i=>{const id=files[i]!.id;setOff(o=>{const n=new Set(o);if(n.has(id))n.delete(id);else n.add(id);return n;});}}/>
  {src&&item.kind==='audio'&&src.file&&<VoiceBubble src={src.file} durationMs={null} mine/>}
  <Kv rows={[[t('fe.staff.media.purposeLabel'),purpose.startsWith('fe.')?null:purpose],[t('fe.staff.author'),item.owner?<PersonLink who={item.owner}/>:null],[t('fe.staff.media.authorLabel'),val(item.authorLabel)],[t('fe.staff.media.scanner'),val(item.reason)]]}/>
  {item.usedIn&&<ReviewObject kind={t('fe.staff.obj.usedIn')} text={item.usedIn}/>}
  {src!==undefined&&!ask&&<>
   {src&&!explicit&&<Note>{t('fe.staff.media.publicOnly')}</Note>}
   <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={busy} options={MEDIA_REASONS.map(id=>({id,label:t('fe.staff.media.reason.'+id)}))}/>
   <Actions>
    {src&&keep>0&&<Btn icon={Check} disabled={busy||(marked>0&&!reason)} busy={busy} onClick={()=>void decide(true)}>
     {marked?t('fe.staff.media.approveSome',{n:keep,m:marked}):many?t('fe.staff.media.approveAll',{n:files.length}):t('fe.staff.media.approveSafe')}</Btn>}
    {src&&explicit&&keep>0&&<Btn kind="soft" icon={Check} disabled={busy||(marked>0&&!reason)} onClick={()=>void decide(true,true)}>{t('fe.staff.media.approveExplicit')}</Btn>}
    <Btn kind="soft" icon={Ban} disabled={busy||!reason} onClick={()=>setAsk('reject')}>{t('fe.staff.reject')}</Btn>
    <MeasuresBtn who={item.owner}/>
   </Actions>
  </>}
  {ask==='reject'&&<Confirm text={t(many?'fe.staff.media.confirmRejectAll':'fe.staff.media.confirmReject',{n:files.length})} busy={busy} onNo={()=>setAsk(null)} onYes={()=>void decide(false)}/>}
  <Csam busy={busy} asking={ask==='csam'} onAsk={()=>setAsk('csam')} onNo={()=>setAsk(null)} onYes={()=>{setReason('csam_suspected' as typeof MEDIA_REASONS[number]);void (async()=>{setBusy(true);
   try{for(const f of files)await call('staff.mediaDecide',{opId:newOpId(),assetId:f.id,decision:'reject',reason:'csam_suspected'},ok,{asAccount:true}).catch(()=>undefined);onDone();}finally{setBusy(false);}})();}}/>
  
 </StCard>;
}

/** «Меры» for the person behind an item: the same button and sheet on every card. */
function MeasuresBtn({who}:{who:{id:string,handle?:string|null|undefined,name?:string|null|undefined}|null|undefined}){
 const {t}=useI18n();const toast=useToast();const [open,setOpen]=useState(false);
 if(!who)return null;
 const name=personName(who)??'';
 return <>
  <Btn kind="soft" icon={Gavel} onClick={()=>setOpen(true)}>{t('fe.staff.m.open')}</Btn>
  {open&&<Measures profileId={who.id} name={name} onClose={()=>setOpen(false)} onApplied={()=>{setOpen(false);toast(t('fe.staff.m.done'),{type:'ok'});}}/>}
 </>;
}

/** Escalation of suspected CSAM: its own clearly marked danger action, apart from the ordinary reasons. */
function Csam({busy,asking,onAsk,onYes,onNo}:{busy:boolean,asking:boolean,onAsk:()=>void,onYes:()=>void,onNo:()=>void}){
 const {t}=useI18n();
 return <>
  <Divider/>
  {asking?<Confirm danger text={t('fe.staff.csam.confirm')} busy={busy} onYes={onYes} onNo={onNo}/>
   :<Actions><Btn kind="danger" icon={ShieldAlert} disabled={busy} onClick={onAsk}>{t('fe.staff.csam.action')}</Btn></Actions>}
 </>;
}

// ——— communities and events ———

function CommunityCard({item,onDone}:{item:CommItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();
 const d=useDecide(onDone,e=>e instanceof FeError&&e.rule==='name_taken'?t('fe.staff.community.nameTaken'):null);
 const [reason,setReason]=useState('');const [ask,setAsk]=useState(false);
 const decide=(decision:'approve'|'reject')=>d.run('staff.communityDecide',{communityId:item.id,rev:item.rev,decision,reason:reason.trim()});
 const privacy=item.privacy?(t('fe.staff.chg.privacy.'+item.privacy).startsWith('fe.')?item.privacy:t('fe.staff.chg.privacy.'+item.privacy)):null;
 const rules=plain(item.rules);
 return <StCard task={t(item.state==='in_review'?'fe.staff.task.community.new':'fe.staff.task.community.change')} title={item.name} meta={<>{item.state==='in_review'&&<Pill tone="wait">{t('fe.staff.newItem')}</Pill>}{when(item.created_at)}</>}>
  {item.description&&<p className="st-text">{item.description}</p>}
  {!!item.resubmits&&<Alert kind="info">{fill(t('fe.staff.comm.resubmit'),{n:item.resubmits,max:3})}{item.prev_reject_reason&&<> {t('fe.staff.comm.prevReason')}: {item.prev_reject_reason}</>}</Alert>}
  {item.state==='in_review'&&item.cover&&<LookTiles tiles={[{label:t('fe.staff.comm.cover'),icon:ImageOff}]} shown={given([item.cover.src])}/>}
  <Kv rows={[[t('fe.staff.comm.privacy'),privacy],[t('fe.staff.topics'),item.topics?.join(', ')],[t('fe.staff.comm.rules'),rules],[t('fe.staff.comm.question'),item.join_question]]}/>
  <Changes change={item.pending_change} diff={{before:{name:item.name,description:item.description,privacy:item.privacy,joinQuestion:item.join_question,topics:item.topics},
   covers:{was:item.cover?.src?.card??item.cover?.src?.thumb??null,now:item.newCover?.src?.card??item.newCover?.src?.thumb??null,missing:!item.newCover?.src}}}/>
  <TextField label={t('fe.staff.reasonText')} value={reason} onChange={setReason} max={300}/>
  {ask?<Confirm text={t('fe.staff.comm.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide('reject')}/>
   :<Actions><Btn icon={Check} disabled={d.busy} onClick={()=>decide('approve')}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn><MeasuresBtn who={item.person}/></Actions>}
  
 </StCard>;
}

function EventCard({item,onDone}:{item:EventItem,onDone:()=>void}){
 const {t,locale}=useI18n();const when=useWhen();const val=useVal();const who=useWho();const d=useDecide(onDone);
 const [reason,setReason]=useState('');const [ask,setAsk]=useState<'reject'|'hide'|null>(null);
 const decide=(decision:'approve'|'reject'|'hide')=>d.run('staff.eventDecide',{eventId:item.id,rev:item.rev,decision,reason:reason.trim()});
 const hideable=item.state==='published';
 return <StCard task={t(item.state==='in_review'?'fe.staff.task.event.new':'fe.staff.task.event.change')} title={item.title} meta={<>{item.state==='in_review'&&<Pill tone="wait">{t('fe.staff.newItem')}</Pill>}{when(item.created_at)}</>}>
  {item.description&&<p className="st-text">{item.description}</p>}
  <Kv rows={[[t('fe.staff.event.organizer'),item.organizer?<PersonLink who={item.organizer}/>:null],[t('fe.staff.event.when'),item.starts_at?inTz(item.starts_at,evTz(item),locale,{day:'numeric',month:'short'}).replace('.','')+', '+evRange({starts_at:item.starts_at,...(item.ends_at?{ends_at:item.ends_at}:{}),tz:item.tz},locale):null],
   [t('fe.staff.event.where'),[val(item.format),item.area].filter(Boolean).join(' · ')],[t('fe.staff.event.address'),item.exact_address],[t('fe.staff.event.link'),item.join_url],
   [t('fe.staff.event.price'),item.price?priceText(item.price as {kind:string,amount?:number,currency?:string},t,locale):null],[t('fe.staff.event.requirements'),item.requirements]]}/>
  <Changes change={item.pending_change} diff={{before:{title:item.title,description:item.description,kind:item.kind,format:item.format,area:item.area,exactAddress:item.exact_address,joinUrl:item.join_url,tz:item.tz,
   startsAt:item.starts_at,endsAt:item.ends_at,price:item.price,requirements:item.requirements}}}/>
  <TextField label={t('fe.staff.reasonText')} value={reason} onChange={setReason} max={300}/>
  {ask?<Confirm text={t(ask==='hide'?'fe.staff.event.confirmHide':'fe.staff.event.confirmReject')} busy={d.busy} onNo={()=>setAsk(null)} onYes={()=>decide(ask)}/>
   :<Actions stack={hideable}><Btn icon={Check} disabled={d.busy} onClick={()=>decide('approve')}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy} onClick={()=>setAsk('reject')}>{t('fe.staff.reject')}</Btn>
    {hideable&&<Btn kind="danger" icon={Ban} disabled={d.busy} onClick={()=>setAsk('hide')}>{t('fe.staff.event.hide')}</Btn>}<MeasuresBtn who={item.organizer}/></Actions>}
  
 </StCard>;
}

// ——— age checks ———

const AGE_REASONS=['gesture_mismatch','face_hidden','not_same_person','looks_underage','bad_photo'] as const;
// A document is about one thing — the birth date says 18+ — and the image is deleted right after the decision.
const DOC_REASONS=['under_18','date_unreadable','not_a_document','bad_photo'] as const;
function AgeCard({item,onDone}:{item:AgeItem,onDone:()=>void}){
 if(item.method==='document')return <AgeDocCard item={item} onDone={onDone}/>;
 return <AgeSelfieCard item={item} onDone={onDone}/>;
}
const ageOpenRes=z.object({ok:z.literal(true),selfie:mediaDto,document:mediaDto,photo:mediaDto});
type AgeShown=z.infer<typeof ageOpenRes>;
const srcOf=(m:AgeShown['selfie']):Src=>(m?.src??null) as Src;
function AgeDocCard({item,onDone}:{item:AgeItem,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();const who=useWho();
 const d=useDecide(onDone,e=>forbidden(e)?t('fe.staff.age.own'):null);
 const [reason,setReason]=useState<typeof DOC_REASONS[number]|''>('');const [ask,setAsk]=useState(false);
 // The document opens on a tap (staff.ageCheckOpen: a fresh code if needed, one journal line per look).
 const [doc,setDoc]=useState<string|null>(null);
 const load=async():Promise<Shown>=>{const r=await call('staff.ageCheckOpen',{checkId:item.id},ageOpenRes,{asAccount:true});const sh=given([srcOf(r.document)]);setDoc((sh.slides[0] as string|null)??null);return sh;};
 return <StCard task={t('fe.staff.task.age.doc')} title={who(item.profile)} meta={when(item.submittedAt)}>
  <Alert kind="info" icon={IdCard}>{t('fe.staff.age.docTask')}</Alert>
  <LookTiles tiles={[{label:t('fe.staff.age.doc'),icon:IdCard}]} load={load} note={t('fe.staff.age.openNote')}/>
  <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={DOC_REASONS.map(id=>({id,label:t('fe.staff.age.reason.'+id)}))}/>
  {ask?<Confirm text={t('fe.staff.age.confirmRejectDoc')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:false,reason})}/>
   :<Actions><Btn icon={Check} disabled={d.busy||!doc} onClick={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:true})}>{t('fe.staff.age.approveDoc')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></Actions>}
  
 </StCard>;
}
function AgeSelfieCard({item,onDone}:{item:AgeItem,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();const who=useWho();
 // The server never lets staff decide their own check; its refusal is explained in plain words.
 const d=useDecide(onDone,e=>forbidden(e)?t('fe.staff.age.own'):null);
 const [reason,setReason]=useState<typeof AGE_REASONS[number]|''>('');const [ask,setAsk]=useState(false);
 const [selfie,setSelfie]=useState(false);
 const load=async():Promise<Shown>=>{const r=await call('staff.ageCheckOpen',{checkId:item.id},ageOpenRes,{asAccount:true});const sh=given([srcOf(r.selfie),srcOf(r.photo)]);setSelfie(!!sh.slides[0]);return sh;};
 const g=item.gesture??'';const gesture=t('fe.staff.age.gesture.'+g);
 return <StCard task={t('fe.staff.task.age.selfie')} title={who(item.profile)} meta={when(item.submittedAt)}>
  <Alert kind="info" icon={Eye}>{t('fe.staff.age.gesture')}: <b>{gesture.startsWith('fe.')?t('fe.staff.age.gesture.other'):gesture}</b></Alert>
  <LookTiles tiles={[{label:t('fe.staff.age.selfie'),icon:Camera},{label:t('fe.staff.age.photo'),icon:ImageIcon}]} load={load} note={t('fe.staff.age.openNote')}/>
  <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={AGE_REASONS.map(id=>({id,label:t('fe.staff.age.reason.'+id)}))}/>
  {ask?<Confirm text={t('fe.staff.age.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:false,reason})}/>
   :<Actions><Btn icon={Check} disabled={d.busy||!selfie} onClick={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:true})}>{t('fe.staff.age.approve')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></Actions>}
  
 </StCard>;
}

// ——— photo checks (V01 «Фото подтверждено») ———

const PHOTO_REASONS=['gesture_mismatch','face_hidden','not_same_person','bad_photo'] as const;
function PhotoCard({item,onDone}:{item:PhotoItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const who=useWho();
 const d=useDecide(onDone,e=>forbidden(e)?t('fe.pc.staff.own'):null);
 const [reason,setReason]=useState<typeof PHOTO_REASONS[number]|''>('');const [ask,setAsk]=useState(false);
 const selfie=item.selfie?.src?.full??item.selfie?.src?.card??null;
 const gesture=t('fe.staff.age.gesture.'+item.gesture);
 return <StCard task={t('fe.staff.task.photo')} title={who(item.profile)} meta={when(item.submittedAt)}>
  <Alert kind="info" icon={Eye}>{t('fe.staff.age.gesture')}: <b>{gesture.startsWith('fe.')?t('fe.staff.age.gesture.other'):gesture}</b></Alert>
  <Note>{t('fe.pc.staff.compare')}</Note>
  <LookTiles tiles={[{label:t('fe.pc.staff.selfie'),icon:Camera},...(item.photos??[item.photo]).map((_,k,a)=>({label:t('fe.pc.staff.photo')+(a.length>1?' '+(k+1):''),icon:ImageIcon}))]}
   shown={given([item.selfie?.src as Src,...(item.photos??[item.photo]).map(p=>p?.src as Src)])}/>
  {!selfie&&<Note>{t('fe.staff.age.noSelfie')}</Note>}
  <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={PHOTO_REASONS.map(id=>({id,label:t('fe.pc.reason.'+id)}))}/>
  {ask?<Confirm text={t('fe.pc.staff.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.photoCheckDecide',{checkId:item.id,approve:false,reason})}/>
   :<Actions><Btn icon={BadgeCheck} disabled={d.busy||!selfie} onClick={()=>d.run('staff.photoCheckDecide',{checkId:item.id,approve:true})}>{t('fe.pc.staff.approve')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></Actions>}
  
 </StCard>;
}

// ——— «это я на фото» and post edits (V21 M01) ———

/** «Это я на фото — против» (owner decision 28.10.2026): a claim that could not hide the post comes first as urgent;
 * staff see whether each claimant is marked on the photo, their trust level and strikes (never who they are), a possible
 * attack on the author and the author's explanation. «Подтвердилось» removes the post (asks first); «не подтвердилось»
 * restores it at once and gives each unmarked claimant a strike. */
function DisputeCard({item,onDone}:{item:DisputeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const val=useVal();const d=useDecide(onDone);
 const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const decide=(restore:boolean)=>d.run('staff.disputeDecide',{postId:item.id,restore,note:note.trim()});
 const o=item.object;
 return <StCard title={t('fe.staff.what.dispute')} task={t(item.hidden?'fe.staff.task.dispute.hidden':'fe.staff.task.dispute.visible')} danger={!!item.urgent} meta={when(item.opened_at??item.disputed_at)}>
  <Chips>
   {item.urgent?<Pill tone="hot">{t('fe.staff.dispute.urgent')}</Pill>:<Pill tone="wait">{t('fe.staff.dispute.hidden')}</Pill>}
   {item.attack&&<Pill tone="bad">{t('fe.staff.dispute.attack')}</Pill>}
   <Pill>{t('fe.staff.dispute.claims',{n:String(item.claims.length)})}</Pill>
  </Chips>
  <Kv rows={[...item.claims.map((c,i):[string,string]=>[t('fe.staff.dispute.claim',{n:String(i+1)}),
   [c.tagged?t('fe.staff.dispute.tagged'):t('fe.staff.dispute.untagged'),t('fe.staff.dispute.trust.'+c.trust),t('fe.staff.dispute.strikes',{n:String(c.strikes)})].join(' · ')]),
   [t('fe.staff.dispute.authorNote'),item.note]]}/>
  <ReviewObject kind={t('fe.staff.obj.post')} title={o?.title} meta={factsLine(o,t,when,val)} text={o?.body??item.excerpt}>
   {!!item.evidence?.length&&<EvidenceGrid items={item.evidence}/>}
  </ReviewObject>
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.dispute.confirmRemove')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide(false)}/>
   :<Actions><Btn icon={Check} disabled={d.busy} busy={d.busy} onClick={()=>decide(true)}>{t('fe.staff.dispute.restore')}</Btn>
    <Btn kind="danger" icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.dispute.remove')}</Btn><MeasuresBtn who={item.person}/></Actions>}
  
 </StCard>;
}

/** Accounts whose «это я на фото» claims were found false three times: claims are closed for them, staff take a look
 * (the profile opens; «Проверено» takes it off the list). */
function FlaggedClaimants(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [list,setList]=useState<z.infer<typeof flaggedRes>['flagged']>([]);const setFailure=useFail();const [busy,setBusy]=useState('');
 useEffect(()=>{const ctl=new AbortController();
  call('staff.disputeQueue',{limit:1},flaggedRes,{asAccount:true,signal:ctl.signal}).then(r=>setList(r.flagged)).catch(()=>{});
  return ()=>ctl.abort();},[call]);
 if(!list.length)return null;
 const reviewed=async(profileId:string)=>{setBusy(profileId);setFailure('');
  try{await call('staff.disputeClaimantReviewed',{opId:newOpId(),profileId},ok,{asAccount:true});setList(l=>l.filter(x=>x.profileId!==profileId));}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy('');}};
 return <Group title={t('fe.staff.dispute.flagged')}>
  <Card list>{list.map(f=><Row key={f.profileId} icon={ShieldAlert} title={f.handle?'@'+f.handle:t('fe.staff.dispute.noHandle')} sub={t('fe.staff.dispute.flaggedSub',{n:String(f.strikes)})}
   onClick={()=>navigate('/n/people/'+f.profileId)}
   end={<Btn kind="soft" size="sm" auto disabled={!!busy} busy={busy===f.profileId} onClick={()=>void reviewed(f.profileId)}>{t('fe.staff.dispute.reviewed')}</Btn>}/>)}</Card>
  
 </Group>;
}

function RevisionCard({item,onDone}:{item:RevisionItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [rule,setRule]=useState<typeof RULES[number]|''>('');const [ask,setAsk]=useState(false);
 const proposed=item.proposed&&typeof item.proposed==='object'?item.proposed as Record<string,unknown>:null;
 const text=proposed?[proposed.title,proposed.body].filter(v=>typeof v==='string'&&v).join(': '):plain(item.proposed)??'';
 return <StCard title={t('fe.staff.what.revision')} task={t('fe.staff.task.revision')} meta={when(item.createdAt)}>
  {item.live&&<ReviewObject kind={t('fe.staff.revision.live')} text={item.live}/>}
  {text&&<ReviewObject kind={t('fe.staff.revision.proposed')} text={text}/>}
  <Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>
  {ask?<Confirm text={t('fe.staff.revision.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.revisionDecide',{revisionId:item.id,decision:'reject',rule})}/>
   :<Actions><Btn icon={Check} disabled={d.busy} busy={d.busy} onClick={()=>d.run('staff.revisionDecide',{revisionId:item.id,decision:'approve'})}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn><MeasuresBtn who={item.person}/></Actions>}
  
 </StCard>;
}

// ——— reports, appeals, DSA notices, cities ———

/** One reported photo, clip or voice message: opens on request through staff.mediaView (short-lived URLs, a journal line
 * per look), so the queue itself shows nothing private. */
type Shown={slides:(Slide|null)[],thumbs:(string|null)[]};
type Tile={label:string,icon?:LucideIcon|undefined,blur?:string|null|undefined};
/** Media under review, one look everywhere: square tiles with a caption; a tap on a photo shows it large and sharp under
 * the tiles (owner 04.11.2026), a tap on that opens the full-screen viewer; a clip opens it at once (swipe
 * between them, ✕ or «Назад» closes it). Private material comes through `load` only on that tap — one journal line per
 * look; what the queue already carries (public covers, photo checks) is `shown`. */
function LookTiles({tiles,load,shown:given,onShown,note,off,onToggle}:{tiles:Tile[],load?:(()=>Promise<Shown>)|undefined,shown?:Shown|undefined,onShown?:((s:Shown)=>void)|undefined,note?:string|undefined,
 /** An upload's files marked to be rejected; `onToggle` marks or unmarks the open one (owner 05.11.2026). */ off?:boolean[]|undefined,onToggle?:((i:number)=>void)|undefined}){
 const {t}=useI18n();
 const [got,setGot]=useState<Shown|null>(null);const shown=given??got;
 const [busy,setBusy]=useState(false);const setErr=useFail();const [open,setOpen]=useState<number|null>(null);const [big,setBig]=useState<number|null>(null);
 const tap=async(i:number)=>{
  let s=shown;
  if(!s){if(!load)return;setBusy(true);setErr('');
   try{s=await load();setGot(s);onShown?.(s);}catch(e){setErr(feErrorMessage(e,t));return;}finally{setBusy(false);}
   // Several files: the first tap opens them all as sharp tiles; the next tap enlarges one.
   if(tiles.length>1)return;}
  const x=s.slides[i];
  if(!x){setErr(t('fe.staff.media.noCopies'));return;}
  if(typeof x==='string'&&big!==i)setBig(i);else setOpen(i);
 };
 const slides=(shown?.slides??[]).filter((x):x is Slide=>!!x);
 const at=open===null||!shown?0:shown.slides.slice(0,open).filter(Boolean).length;
 return <Stack gap={2}>
  {/* The tapped photo takes the tiles' place (owner 05.11.2026: one picture, not a tile and its copy); ✕ brings them back. */}
  {big===null&&<ReviewTiles tiles={tiles.map((x,i)=>({...x,thumb:shown?.thumbs[i]??null,busy,off:!!off?.[i]}))} onOpen={i=>void tap(i)}/>}
  {load&&!shown&&note&&<Note>{note}</Note>}
  {big!==null&&typeof shown?.slides[big]==='string'&&<ReviewPreview key={big} src={shown.slides[big] as string} label={tiles[big]?.label??''}
   openLabel={t('fe.staff.media.full')} closeLabel={t('fe.staff.media.fold')} onOpen={()=>setOpen(big)} onClose={()=>setBig(null)}
   foot={onToggle&&tiles.length>1?<Btn kind="text" size="sm" auto icon={off?.[big]?Check:Ban} onClick={()=>onToggle(big)}>{off?.[big]?t('fe.staff.media.keepThis'):t('fe.staff.media.rejectThis')}</Btn>:undefined}/>}
  
  {open!==null&&slides.length>0&&<Viewer srcs={slides} index={at} onClose={()=>setOpen(null)}/>}
 </Stack>;
}
type Src={card?:string|undefined,full?:string|undefined,file?:string|undefined,thumb?:string|undefined}|null|undefined;
/** A served media as a viewer slide (a clip plays in the viewer) and its tile picture. */
const slideOf=(kind:string,src:Src):Slide|null=>!src?null:kind==='video'&&src.file?{video:src.file,poster:src.card??null}:kind==='audio'?null:src.full??src.card??null;
const thumbOf=(src:Src)=>src?.card??src?.thumb??null;
const tileIcon=(kind:string)=>kind==='video'?Film:kind==='audio'?Mic:ImageIcon;

/** Reported photos and clips: all open together on the first tap (staff.mediaView each), voice messages play below. */
function EvidenceGrid({items}:{items:{assetId:string,kind:string}[]}){
 const {call}=useFe();const {t}=useI18n();const [audio,setAudio]=useState<string[]>([]);
 const load=async():Promise<Shown>=>{
  const rs=await Promise.all(items.map(e=>call('staff.mediaView',{assetId:e.assetId},viewRes,{asAccount:true})));
  setAudio(items.flatMap((e,i)=>e.kind==='audio'&&rs[i]!.src?.file?[rs[i]!.src!.file!]:[]));
  return {slides:items.map((e,i)=>slideOf(e.kind,rs[i]!.src)),thumbs:items.map((_,i)=>thumbOf(rs[i]!.src))};
 };
 return <>
  <LookTiles tiles={items.map((e,i)=>({label:t(e.kind==='video'?'fe.staff.tile.video':e.kind==='audio'?'fe.staff.tile.audio':'fe.staff.tile.photo',{n:String(i+1)}),icon:tileIcon(e.kind)}))}
   load={load} note={t('fe.staff.media.openNote')}/>
  {audio.map(src=><VoiceBubble key={src} src={src} durationMs={null} mine/>)}
 </>;
}
/** Pictures the queue already carries (covers, photo checks) as tiles. */
const given=(srcs:Src[],full=true):Shown=>({slides:srcs.map(x=>x?(full?x.full??x.card??x.thumb??null:x.card??x.thumb??null):null),thumbs:srcs.map(thumbOf)});

function ReportCard({item,onDone}:{item:ReportItem,onDone:()=>void}){
 const {t}=useI18n();const val=useVal();const when=useWhen();const d=useDecide(onDone);
 const [rule,setRule]=useState<typeof RULES[number]|''>('');const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const people=item.targetType==='profile'||item.targetType==='conversation';
 const base={targetType:item.targetType,targetId:item.targetId,note:note.trim(),...(item.targetType==='conversation'&&item.author?{reportedProfileId:item.author.id}:{})};
 const author=personName(item.author);const toast=useToast();
 // Taken away by its author (or with their account): nothing to remove, the violation is recorded (staff.reportDecide).
 const gone=(item.targetType==='post'&&item.state==='archived')||(item.targetType==='reply'&&item.state==='deleted');
 // Whom a measure is for: the reported profile, or in a chat the side it was reported about.
 // A post, reply, community or event: its author.
 const target=item.targetType==='profile'?{id:item.targetId,name:author??''}:item.author?{id:item.author.id,name:author??''}:null;
 const [measures,setMeasures]=useState(false);
 const messages=Array.isArray((item.reported as {messages?:unknown})?.messages)?(item.reported as {messages:{seq:number,body:string,media:boolean,at:string}[]}).messages:null;
 const o=item.object;const under=typeof o?.facts?.under==='string'?o.facts.under:null;
 const reasons=item.reasons.map(r=>{const x=t('fe.staff.report.reason.'+r);return x.startsWith('fe.')?t('fe.staff.report.reason.other'):x;});
 return <StCard title={t('fe.staff.what.report.'+item.targetType)} task={t('fe.staff.task.report.'+item.targetType)} danger={item.reasons.includes('minor')} meta={when(item.firstAt)}>
  {gone&&<Alert kind="info">{t('fe.staff.report.gone')}</Alert>}
  <Kv rows={[[t('fe.staff.report.why'),<>{item.reasons.map((r,i)=><Pill key={r} tone={r==='minor'?'bad':undefined}>{reasons[i]}</Pill>)}</>],[t('fe.staff.report.times'),String(item.reports)],
   [t('fe.staff.author'),item.author?<PersonLink who={item.author}/>:author],[t('fe.staff.report.under'),under],[t('fe.staff.report.details'),item.details?.length?item.details.join(' · '):null]]}/>
  {(o||item.excerpt)&&<ReviewObject kind={t('fe.staff.report.type.'+item.targetType)} title={o?.title} meta={factsLine(o,t,when,val)} text={o?.body??item.excerpt}>
   {!!item.evidence?.length&&!messages&&<EvidenceGrid items={item.evidence}/>}
  </ReviewObject>}
  {messages&&<ReviewObject kind={t('fe.staff.report.picked')}>
   {messages.map(m=><Text key={m.seq} size="sm">{m.body||t('fe.staff.report.mediaOnly')} <Text as="span" size="xs" tone="mute">· {when(m.at)}</Text></Text>)}
   {!!item.evidence?.length&&<EvidenceGrid items={item.evidence}/>}
  </ReviewObject>}
  {!people&&<Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>}
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t(gone?'fe.staff.report.confirmRecord':'fe.staff.report.confirmRemove')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.reportDecide',{...base,decision:'remove',rule})}/>
   :<Actions><Btn icon={Check} disabled={d.busy} onClick={()=>d.run('staff.reportDecide',{...base,decision:'keep'})}>{t('fe.staff.report.keep')}</Btn>
    {!people&&<Btn kind="danger" icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{gone?t('fe.staff.report.record'):t('fe.staff.report.remove')}</Btn>}
    {target&&<Btn kind={people?'danger':'soft'} icon={Gavel} disabled={d.busy} onClick={()=>setMeasures(true)}>{t('fe.staff.m.open')}</Btn>}</Actions>}
  
  {measures&&target&&<Measures profileId={target.id} name={target.name} onClose={()=>setMeasures(false)}
   // A person or a chat: the measure answers the report. A post and the like still wait for keep / remove.
   onApplied={()=>{setMeasures(false);if(people)void d.run('staff.reportDecide',{...base,decision:'keep',note:(note.trim()||t('fe.staff.m.reportNote')).slice(0,500)});else toast(t('fe.staff.m.done'),{type:'ok'});}}/>}
 </StCard>;
}

const DAYS=[1,3,7,30] as const;
/** Rules whose measure is never timed and is applied and lifted by a lead (server OWNER_ONLY_LIFT). */
const GRAVE=new Set<string>(['minors','illegal']);

/** «Принять меры» on a report about a person or a chat: a restriction or a suspension, for a set time or until lifted
 * (staff.restrict / staff.sanction). Moderators: timed measures and restrictions; until lifted suspension — leads. */
function Measures({profileId,name,onClose,onApplied}:{profileId:string,name:string,onClose:()=>void,onApplied:()=>void}){
 const {t,locale}=useI18n();const roles=useStaffRoles();const lead=(roles??[]).some(r=>r==='owner'||r==='lead');
 const d=useDecide(onApplied);
 const [rule,setRule]=useState<typeof RULES[number]|''>('');const [kind,setKind]=useState<'restrict'|'suspend'>('restrict');
 const [days,setDays]=useState<string>('7');const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 // What a restriction limits (audit item 6): a preset, then the points themselves.
 const [scope,setScope]=useState<RestrictScope[]>([...RESTRICT_PRESETS.standard]);const [own,setOwn]=useState(false);
 const preset=(Object.keys(RESTRICT_PRESETS) as (keyof typeof RESTRICT_PRESETS)[]).find(k=>RESTRICT_PRESETS[k].length===scope.length&&RESTRICT_PRESETS[k].every(x=>scope.includes(x)))??null;
 const grave=!!rule&&GRAVE.has(rule);
 // Until lifted only: grave rules. A moderator's suspension is always timed.
 const forever=grave||days==='0';const blocked=kind==='suspend'&&forever&&!lead;
 const dayOpts=[...(grave?[]:DAYS.map(n=>({id:String(n),label:t('fe.staff.m.days.'+n)}))),...(kind==='restrict'||lead?[{id:'0',label:t('fe.staff.m.forever')}]:[])];
 const until=forever?null:new Date(Date.now()+Number(days)*864e5).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long'});
 const effect=t(kind==='restrict'?'fe.staff.m.effect.restrict':'fe.staff.m.effect.suspend',{name})+' '+(until?t('fe.staff.m.until',{date:until}):t('fe.staff.m.untilLifted'))
  +(kind==='restrict'?' '+t('fe.staff.m.limits',{list:scope.map(x=>t('fe.staff.m.pt.'+x)).join(', ')}):'');
 const apply=()=>{const timed=forever?{}:{days:Number(days)};
  void d.run(kind==='restrict'?'staff.restrict':'staff.sanction',kind==='restrict'
   ?{profileId,on:true,rule,note:note.trim(),scope,...timed}:{profileId,decision:'suspend',rule,note:note.trim(),...timed});};
 // Built like «Пожаловаться» (report.tsx): rows with a short line under each, the action in the sheet's foot.
 return <Sheet className="st-sheet" title={t('fe.staff.m.title',{name})} onClose={onClose} dirty={!!rule||!!note.trim()}
  foot={ask?undefined:<Btn kind="danger" icon={Gavel} disabled={d.busy||!rule||blocked||(kind==='restrict'&&!scope.length)} onClick={()=>setAsk(true)}>{t(kind==='restrict'?'fe.staff.m.doRestrict':'fe.staff.m.doSuspend')}</Btn>}>
  <BackCloses onClose={onClose}/>
  <Stack gap={4}>
   <Field label={t('fe.staff.m.kind')}>
    <RadioList label={t('fe.staff.m.kind')} value={kind} onChange={v=>{setKind(v);setAsk(false);if(v==='suspend'&&!lead&&days==='0')setDays('7');}}
     options={[['restrict',t('fe.staff.m.restrict'),t('fe.staff.m.sub.restrict')],['suspend',t('fe.staff.m.suspend'),t('fe.staff.m.sub.suspend')]] as const}/>
   </Field>
   <Field label={t('fe.staff.rule')}>
    <RadioList label={t('fe.staff.rule')} value={rule||null} onChange={v=>{setRule(v);setAsk(false);if(GRAVE.has(v))setDays('0');}}
     options={RULES.map(id=>[id,t('fe.staff.rule.'+id)] as const)}/>
   </Field>
   {kind==='restrict'&&<Field label={t('fe.staff.m.scope')}>
    {/* A preset is the choice; «Своё» opens the points themselves (owner 05.11.2026). */}
    <Stack gap={3}>
     <Seg label={t('fe.staff.m.scope')} value={own||!preset?'own':preset} onChange={k=>{setAsk(false);
      if(k==='own'){setOwn(true);return;}setOwn(false);setScope([...RESTRICT_PRESETS[k]]);}}
      options={[...(['soft','standard','strict'] as const).map(k=>({id:k,label:t('fe.staff.m.preset.'+k)})),{id:'own' as const,label:t('fe.staff.m.preset.own')}]}/>
     {own||!preset?<MultiChips label={t('fe.staff.m.points')} value={scope} onChange={v=>{setScope(v);setAsk(false);}}
      options={RESTRICT_SCOPES.map(x=>[x,t('fe.staff.m.pt.'+x)] as const)}/>
      :<Note>{t('fe.staff.m.limits',{list:scope.map(x=>t('fe.staff.m.pt.'+x)).join(', ')})}</Note>}
    </Stack>
   </Field>}
   {dayOpts.length>1&&<Choice label={t('fe.staff.m.for')} value={grave?'0':days} onChange={v=>{setDays(v);setAsk(false);}} disabled={d.busy} options={dayOpts}/>}
   {blocked&&<Alert kind="warn">{t('fe.staff.m.leadOnly')}</Alert>}
   <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
   {ask&&<Confirm text={effect} danger busy={d.busy} onNo={()=>setAsk(false)} onYes={apply}/>}
   
  </Stack>
 </Sheet>;
}

function AppealCard({item,onDone}:{item:AppealItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const val=useVal();const jw=useJournalWord();const d=useDecide(onDone);
 const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 // The decision under appeal was this person's own: another reviewer decides — unless there is none (then they do, on record).
 const mine=!!item.decision?.mine&&!item.onlyReviewer;
 const decide=(grant:boolean)=>d.run('staff.appealDecide',{appealId:item.id,grant,note:note.trim()});
 const o=item.object;const kind=t('fe.staff.report.type.'+item.target_type);
 return <StCard title={t('fe.staff.what.appeal')} task={t('fe.staff.task.appeal')} meta={when(item.created_at)}>
  <Kv rows={[[t('fe.staff.appeal.who'),item.handle?'@'+item.handle:null],[t('fe.staff.appeal.what'),kind],
   [t('fe.staff.appeal.decision'),item.decision?jw('action',item.decision.action)+' · '+when(item.decision.at):null]]}/>
  {o&&<ReviewObject kind={kind} title={o.title} meta={factsLine(o,t,when,val)} text={o.body}/>}
  <ReviewObject kind={t('fe.staff.appeal.body')} text={item.body}/>
  {mine&&<Alert kind="warn">{t('fe.staff.appeal.sameStaff')}</Alert>}
  {!!item.decision?.mine&&!!item.onlyReviewer&&<Alert kind="info">{t('fe.staff.appeal.alone')}</Alert>}
  {!mine&&<TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>}
  {!mine&&(ask?<Confirm text={t('fe.staff.appeal.confirmDeny')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide(false)}/>
   :<Actions><Btn icon={Check} disabled={d.busy} onClick={()=>decide(true)}>{t('fe.staff.appeal.grant')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.appeal.deny')}</Btn><MeasuresBtn who={item.person}/></Actions>)}
  
 </StCard>;
}

const NOTICE_RULES=[...RULES,'ip'] as const;
function NoticeCard({item,onDone}:{item:NoticeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const val=useVal();
 const d=useDecide(onDone,e=>e instanceof FeError&&(e.rule==='notice_no_target'||e.rule==='notice_not_live')?t('fe.staff.notice.'+e.rule):null);
 const [rule,setRule]=useState<typeof NOTICE_RULES[number]|''>('');const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const decide=(outcome:'removed'|'kept'|'not_actionable')=>d.run('staff.noticeDecide',{noticeId:item.id,outcome,note:note.trim(),...(outcome==='removed'?{rule}:{})});
 const csam=item.reason==='csam';
 const reason=t('fe.staff.notice.reason.'+item.reason);
 return <StCard task={t('fe.staff.task.notice')} title={reason.startsWith('fe.')?t('fe.staff.notice.reason.other'):reason} danger={csam||item.reason==='minors'} meta={when(item.created_at)}>
  {csam&&<Alert kind="err" icon={ShieldAlert}><b>{t('fe.staff.csam.flag')}</b></Alert>}
  <Kv rows={[[t('fe.staff.notice.url'),item.target_url],[t('fe.staff.notice.explanation'),item.explanation]]}/>
  {item.object?<ReviewObject kind={t('fe.staff.report.type.'+item.target!.type)} title={item.object.title} meta={factsLine(item.object,t,when,val)} text={item.object.body}/>
   :<Alert kind="info">{t('fe.staff.notice.noTarget')}</Alert>}
  <Note>{item.answerable?t('fe.staff.notice.answerable'):t('fe.staff.notice.anonymous')}</Note>
  <Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={NOTICE_RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.notice.confirmRemoved')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide('removed')}/>
   :<Actions stack>
    <Btn icon={Check} disabled={d.busy} onClick={()=>decide('kept')}>{t('fe.staff.notice.kept')}</Btn>
    <Btn kind="soft" icon={Minus} disabled={d.busy} onClick={()=>decide('not_actionable')}>{t('fe.staff.notice.not_actionable')}</Btn>
    <Btn kind="danger" icon={Ban} disabled={d.busy||!rule||!item.object} onClick={()=>setAsk(true)}>{t('fe.staff.notice.removeAnswer')}</Btn></Actions>}
  
 </StCard>;
}


// ——— «Меры»: what is in force for a profile, and lifting it ———

/** A profile found by @nick: its restriction and suspension with rule and end, and «Снять» for each
 * (staff.restrict on:false / staff.sanction lift; the server decides who may lift what). */
/** «Люди» (owner 05.11.2026): find a person by @nick; their page opens over it. */
function People(){
 const {call}=useFe();const {t}=useI18n();
 const [handle,setHandle]=useState('');const [busy,setBusy]=useState(false);const setFailure=useFail();const [open,setOpen]=useState<string|null>(null);
 const h=handle.trim().replace(/^@/,'');
 // «Под наблюдением»: the people staff marked to look at again.
 const [watched,setWatched]=useState<z.infer<typeof watchRes>['items']|null>(null);
 const loadWatched=useCallback(()=>{call('staff.watchList',{},watchRes,{asAccount:true}).then(r=>setWatched(r.items)).catch(()=>setWatched(null));},[call]);
 useEffect(loadWatched,[loadWatched]);
 const find=async()=>{if(!h)return;setBusy(true);setFailure('');
  try{const r=await call('staff.profileMeasures',{handle:h},measuresRes,{asAccount:true});setOpen(r.profileId);}
  catch(e){setFailure(e instanceof FeError&&e.code==='not_found'?t('fe.staff.measures.notFound'):e instanceof FeError&&e.code==='forbidden'?t('fe.staff.measures.forbidden'):feErrorMessage(e,t));}
  finally{setBusy(false);}};
 return <>
  <form className="st-filterrow" onSubmit={e=>{e.preventDefault();void find();}}>
   <SearchInput label={t('fe.staff.people.search')} value={handle} placeholder={t('fe.staff.people.search')} spellCheck={false} autoCapitalize="none" onChange={e=>{setHandle(e.target.value);setFailure('');}}/>
   <Btn icon={Search} disabled={busy||!h} busy={busy} onClick={()=>void find()}>{t('fe.staff.measures.find')}</Btn>
  </form>
  
  {watched&&watched.length>0&&<Group title={t('fe.staff.people.watched')}><Card list>{watched.map(x=><Row key={x.id} title={personName(x)??''} sub={x.note??undefined} onClick={()=>setOpen(x.id)}/>)}</Card></Group>}
  {open&&<PersonSheet profileId={open} onClose={()=>{setOpen(null);loadWatched();}}/>}
 </>;
}

const watchRes=z.object({ok:z.literal(true),items:z.array(z.object({id:z.string(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),note:z.string().nullable()}))});

/** A name in a staff card or the journal that opens the person's page (owner 05.11.2026). */
function PersonLink({who}:{who:{id:string,handle?:string|null|undefined,name?:string|null|undefined}|null|undefined}){
 const [open,setOpen]=useState(false);
 if(!who)return null;
 return <>
  <button type="button" className="st-link" onClick={e=>{e.stopPropagation();setOpen(true);}}>{personName(who)}</button>
  {open&&<PersonSheet profileId={who.id} onClose={()=>setOpen(false)}/>}
 </>;
}

/** A person's page in the staff area: who, the measures in force, what staff did about them, and what can be done. */
function PersonSheet({profileId,onClose}:{profileId:string,onClose:()=>void}){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();const jw=useJournalWord();const toast=useToast();const navigate=useNavigate();
 const [p,setP]=useState<z.infer<typeof measuresRes>|null>(null);const [error,setError]=useState<unknown>(null);
 const [history,setHistory]=useState<JournalRow[]|null|undefined>(undefined);
 const [busy,setBusy]=useState(false);const [ask,setAsk]=useState<'restricted'|'suspended'|'watch'|null>(null);const setFailure=useFail();
 const [note,setNote]=useState('');
 const watch=async(on:boolean)=>{if(!p)return;setBusy(true);setFailure('');
  try{await call('staff.watch',{opId:newOpId(),profileId:p.profileId,on,note:note.trim()},ok,{asAccount:true});setAsk(null);setNote('');
   toast(t(on?'fe.staff.people.watchOn':'fe.staff.people.watchOff'),{type:'ok'});load();}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 const load=useCallback(()=>{
  call('staff.profileMeasures',{profileId},measuresRes,{asAccount:true}).then(setP).catch(setError);
  // The journal is for owners, leads and auditors: anyone else sees the page without the history.
  call('staff.journal',{personId:profileId,limit:20},journalPage,{asAccount:true}).then(r=>setHistory(r.items)).catch(()=>setHistory(null));
 },[call,profileId]);
 useEffect(load,[load]);
 const ruleWord=(r:string|null)=>{const x=r?t('fe.staff.rule.'+r):'';return x&&!x.startsWith('fe.')?x:null;};
 const line=(m:{rule:string|null,until?:string|null|undefined})=>[ruleWord(m.rule),m.until?t('fe.staff.measures.till',{date:when(m.until)}):t('fe.staff.measures.untilLifted')].filter(Boolean).join(' · ');
 const lift=async(which:'restricted'|'suspended')=>{if(!p)return;setBusy(true);setFailure('');
  const rule=p[which]?.rule;const r=rule&&(RULES as readonly string[]).includes(rule)?rule:'community_rules';
  try{await call(which==='restricted'?'staff.restrict':'staff.sanction',which==='restricted'
    ?{opId:newOpId(),profileId:p.profileId,on:false,rule:r,note:''}:{opId:newOpId(),profileId:p.profileId,decision:'lift',rule:r,note:''},ok,{asAccount:true});
   toast(t('fe.staff.measures.lifted'),{type:'ok'});setAsk(null);load();}
  catch(e){setFailure(feErrorMessage(e,t));setAsk(null);}finally{setBusy(false);}};
 const name=p?personName({handle:p.handle,name:p.name})??'':'';
 const staffName=(x:JournalRow)=>x.staff_account_id?(x.staff_name||(x.staff_handle?'@'+x.staff_handle:t('fe.staff.journal.unknownStaff'))):t('fe.staff.journal.auto');
 return <Sheet className="st-sheet" title={name||t('fe.staff.people.title')} onClose={onClose}
  foot={p&&!ask?<ReviewBar main={<MeasuresBtn who={{id:p.profileId,handle:p.handle,name:p.name}}/>}
   more={[...(p.restricted?[<Btn key="r" kind="soft" icon={Check} disabled={busy} onClick={()=>setAsk('restricted')}>{t('fe.staff.people.liftR')}</Btn>]:[]),
    ...(p.suspended?[<Btn key="s" kind="soft" icon={Check} disabled={busy} onClick={()=>setAsk('suspended')}>{t('fe.staff.people.liftS')}</Btn>]:[]),
    p.watched?<Btn key="w" kind="soft" icon={EyeOff} disabled={busy} onClick={()=>void watch(false)}>{t('fe.staff.people.unwatch')}</Btn>
     :<Btn key="w" kind="soft" icon={Eye} disabled={busy} onClick={()=>setAsk('watch')}>{t('fe.staff.people.watch')}</Btn>,
    <Btn key="p" kind="soft" icon={User} onClick={()=>{onClose();navigate('/n/people/'+p.profileId);}}>{t('fe.staff.people.profile')}</Btn>]}/>:undefined}>
  <BackCloses onClose={onClose}/>
  {error&&!p?<Alert kind="err">{feErrorMessage(error,t)}</Alert>:!p?<Skel kind="list"/>:<Stack gap={4}>
   <Kv rows={[[t('fe.staff.people.nick'),p.handle?'@'+p.handle:null],[t('fe.staff.people.kind'),t(p.kind==='couple'?'fe.staff.people.couple':'fe.staff.people.person')],
    [t('fe.staff.people.since'),p.createdAt?when(p.createdAt):null],
    [t('fe.staff.measures.restricted'),p.restricted?line(p.restricted):t('fe.staff.measures.none')],
    [t('fe.staff.measures.suspended'),p.suspended?line(p.suspended):t('fe.staff.measures.none')],
    [t('fe.staff.people.reports'),String(p.openReports??0)],
    [t('fe.staff.people.watched'),p.watched?[p.watched.note,p.watched.by,when(p.watched.at)].filter(Boolean).join(' · '):t('fe.staff.measures.none')]]}/>
   {ask==='watch'&&<Stack gap={3}><TextField label={t('fe.staff.people.watchNote')} value={note} max={300} onChange={setNote}/>
    <Confirm text={t('fe.staff.people.watchQ')} busy={busy} onNo={()=>setAsk(null)} onYes={()=>void watch(true)}/></Stack>}
   {ask&&ask!=='watch'&&<Confirm text={t(ask==='restricted'?'fe.staff.measures.confirmRestricted':'fe.staff.measures.confirmSuspended',{name})} busy={busy} onNo={()=>setAsk(null)} onYes={()=>void lift(ask)}/>}
   
   {history===undefined?<Skel kind="list" rows={2}/>:history&&<Group title={t('fe.staff.people.history')}>
    {history.length?<Card list>{history.map(x=><Row key={String(x.id)} noChev title={jw('action',x.action)} sub={staffName(x)+' · '+when(x.created_at)}/>)}</Card>
     :<Empty compact icon={Inbox} title={t('fe.staff.people.noHistory')}/>}</Group>}
  </Stack>}
 </Sheet>;
}

// ——— Слова ———

const wordsRes=z.object({ok:z.literal(true),items:z.array(z.object({word:z.string(),addedAt:z.string()}))});

/** The word filter (owner 05.11.2026): a post, a comment, a profile or an event update with one of these words goes to
 * the report queue («Автофильтр»); it is not held back. Whole words, any case. */
function Words(){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const [items,setItems]=useSeen<z.infer<typeof wordsRes>['items']|null>('Words.items',()=>null);const [error,setError]=useState<unknown>(null);
 const [word,setWord]=useState('');const [busy,setBusy]=useState(false);
 const load=useCallback(()=>{call('staff.words',{},wordsRes,{asAccount:true}).then(r=>{setItems(r.items);setError(null);}).catch(setError);},[call]);
 useEffect(load,[load]);
 const set=async(w:string,on:boolean)=>{setBusy(true);
  try{await call('staff.wordSet',{opId:newOpId(),word:w,on},ok,{asAccount:true});if(on)setWord('');load();toast(t(on?'fe.staff.words.added':'fe.staff.words.removed'),{type:'ok'});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy(false);}};
 const w=word.trim().toLowerCase();const valid=/^[\p{L}\p{N} -]{2,60}$/u.test(w);
 return <>
  <Note>{t('fe.staff.words.lead')}</Note>
  <form className="st-filterrow" onSubmit={e=>{e.preventDefault();if(valid)void set(w,true);}}>
   <Input aria-label={t('fe.staff.words.new')} placeholder={t('fe.staff.words.new')} value={word} maxLength={60} onChange={e=>setWord(e.target.value)}/>
   <IconBtn icon={Plus} label={t('fe.staff.words.add')} disabled={busy||!valid} onClick={()=>void set(w,true)}/>
  </form>
  {error&&!items?<Alert kind="err">{feErrorMessage(error,t)}</Alert>:!items?<Skel kind="list"/>:!items.length?<Empty compact icon={Filter} title={t('fe.staff.words.empty')}/>
   :<Card list>{items.map(x=><Row key={x.word} noChev title={x.word} end={<IconBtn icon={X} kind="ghost" size="sm" label={t('fe.staff.words.remove',{word:x.word})} disabled={busy} onClick={()=>void set(x.word,false)}/>}/>)}</Card>}
 </>;
}

// ——— Отчёт DSA ———

const numRow=z.object({received:z.number().optional(),removed:z.number().optional(),kept:z.number().optional(),unavailable:z.number().optional(),not_actionable:z.number().optional(),
 granted:z.number().optional(),denied:z.number().optional(),closed:z.number().optional(),median_hours:z.number().nullable().optional()}).passthrough();
const reportRes=z.object({ok:z.literal(true),reports:z.array(numRow.extend({reason:z.string()})),notices:z.array(numRow.extend({reason:z.string()})),
 decisions:z.array(z.object({action:z.string(),n:z.number()})),appeals:z.array(numRow.extend({target_type:z.string()}))});

/** «Отчёт DSA» (owner 05.11.2026): the numbers of the transparency report for a period (at least four weeks): reports
 * and notices by reason with their outcomes and median time, staff decisions, appeals. «Скопировать» gives them as text. */
function Transparency(){
 const {call}=useFe();const {t}=useI18n();const jw=useJournalWord();const toast=useToast();
 const day=(d:Date)=>d.toISOString().slice(0,10);
 const [months,setMonths]=useState<'6'|'12'>('6');
 const to=day(new Date()),from=day(new Date(Date.now()-Number(months)*30.5*864e5));
 const [data,setData]=useSeen<z.infer<typeof reportRes>|null>('Transparency.data',()=>null);const [error,setError]=useState<unknown>(null);
 useEffect(()=>{setData(null);call('staff.transparency',{from,to},reportRes,{asAccount:true}).then(r=>{setData(r);setError(null);}).catch(setError);},[call,from,to]);
 const hours=(h:number|null|undefined)=>h==null?'—':h<48?t('fe.staff.dsa.hours',{n:Math.round(h)}):t('fe.staff.dsa.days',{n:Math.round(h/24)});
 const outcome=(r:z.infer<typeof numRow>)=>[t('fe.staff.dsa.received',{n:r.received??0}),r.removed!=null?t('fe.staff.dsa.removed',{n:r.removed}):null,r.kept!=null?t('fe.staff.dsa.kept',{n:r.kept}):null,
  r.granted!=null?t('fe.staff.dsa.granted',{n:r.granted}):null,r.denied!=null?t('fe.staff.dsa.denied',{n:r.denied}):null].filter(Boolean).join(' · ');
 /** The same numbers as tiles: a figure and its caption each. */
 const stats=(r:z.infer<typeof numRow>):[string,ReactNode][]=>([[t('fe.staff.dsa.c.received'),r.received??0],[t('fe.staff.dsa.c.removed'),r.removed],[t('fe.staff.dsa.c.kept'),r.kept],[t('fe.staff.dsa.c.granted'),r.granted],[t('fe.staff.dsa.c.denied'),r.denied]] as [string,ReactNode][]).filter(([,v])=>v!=null);
 // Report reasons have their own words; notice reasons use the notice queue's.
 const reason=(k:string)=>{for(const p of ['fe.staff.dsa.reason.','fe.staff.notice.reason.']){const x=t(p+k);if(!x.startsWith('fe.'))return x;}return k;};
 const text=()=>!data?'':[t('fe.staff.dsa.title',{from,to}),'',t('fe.staff.dsa.reports'),...data.reports.map(r=>`${reason(r.reason)}: ${outcome(r)} · ${hours(r.median_hours)}`),'',
  t('fe.staff.dsa.notices'),...data.notices.map(r=>`${reason(r.reason)}: ${outcome(r)} · ${hours(r.median_hours)}`),'',
  t('fe.staff.dsa.decisions'),...data.decisions.map(d=>`${jw('action',d.action)}: ${d.n}`),'',t('fe.staff.dsa.appeals'),...data.appeals.map(a=>`${jw('type',a.target_type)}: ${outcome(a)}`)].join('\n');
 const copy=async()=>{const ok=await copyLink(text());toast(t(ok?'fe.staff.dsa.copied':'fe.staff.dsa.copyFail'),{type:ok?'ok':'err'});};
 const block=(title:string,rows:[string,ReactNode][])=><Group title={title}>{rows.length?<Kv rows={rows}/>:<Empty compact icon={Inbox} title={t('fe.staff.dsa.nothing')}/>}</Group>;
 const cards=(title:string,rows:{name:string,r:z.infer<typeof numRow>,median?:boolean}[])=><Group title={title}>{rows.length?<Stack gap={2}>{rows.map(x=><StatCard key={x.name} title={x.name} aside={x.median&&x.r.median_hours!=null?hours(x.r.median_hours):undefined} stats={stats(x.r)}/>)}</Stack>:<Empty compact icon={Inbox} title={t('fe.staff.dsa.nothing')}/>}</Group>;
 return <>
  <Seg<'6'|'12'> value={months} onChange={setMonths} label={t('fe.staff.dsa.period')} options={[{id:'6',label:t('fe.staff.dsa.m6')},{id:'12',label:t('fe.staff.dsa.m12')}]}/>
  {error&&!data?<Alert kind="err">{feErrorMessage(error,t)}</Alert>:!data?<Skel kind="list"/>:<>
   {cards(t('fe.staff.dsa.reports'),data.reports.map(r=>({name:reason(r.reason),r,median:true})))}
   {cards(t('fe.staff.dsa.notices'),data.notices.map(r=>({name:reason(r.reason),r,median:true})))}
   {block(t('fe.staff.dsa.decisions'),data.decisions.map(d=>[jw('action',d.action),String(d.n)]))}
   {cards(t('fe.staff.dsa.appeals'),data.appeals.map(a=>({name:jw('type',a.target_type).replace(/^./,c=>c.toUpperCase()),r:a})))}
   <Btn kind="soft" icon={Copy} onClick={()=>void copy()}>{t('fe.staff.dsa.copy')}</Btn>
  </>}
 </>;
}

// ——— Документы ———

type DocBlock={type:'heading'|'paragraph',text:string}|{type:'list',items:string[]};
const docBlock=z.union([z.object({type:z.enum(['heading','paragraph']),text:z.string()}),z.object({type:z.literal('list'),items:z.array(z.string())})]);
const docRow=z.object({key:z.string(),locale:z.string(),title:z.string(),blocks:z.array(docBlock),requiresAccept:z.boolean()});
const docsRes=z.object({ok:z.literal(true),drafts:z.array(docRow.extend({revision:z.number()})),current:z.array(docRow.extend({version:z.number(),effectiveAt:z.string(),sourceRevision:z.number().nullable()}))});
const DOC_KEYS=['terms','privacy','community','adult-content','complaints','age','retention','cookies','copyright'] as const;
const MUST_ACCEPT=new Set(['terms','privacy','community','adult-content']);
/** A document as plain text for editing: «## » a heading, «- » list items, a blank line between paragraphs. */
const docText=(blocks:DocBlock[])=>blocks.map(b=>b.type==='heading'?'## '+b.text:b.type==='list'?b.items.map(i=>'- '+i).join('\n'):b.text).join('\n\n');
const docBlocks=(text:string):DocBlock[]=>{
 const out:DocBlock[]=[];let para:string[]=[];let list:string[]|null=null;
 const flush=()=>{if(para.length){out.push({type:'paragraph',text:para.join('\n')});para=[];}if(list){out.push({type:'list',items:list});list=null;}};
 for(const raw of text.split('\n')){const l=raw.trimEnd();
  if(!l.trim()){flush();continue;}
  if(l.startsWith('## ')){flush();out.push({type:'heading',text:l.slice(3).trim()});continue;}
  if(/^[-•] /.test(l)){if(para.length){out.push({type:'paragraph',text:para.join('\n')});para=[];}(list??=[]).push(l.slice(2).trim());continue;}
  if(list){out.push({type:'list',items:list});list=null;}para.push(l);
 }
 flush();return out;
};

/** «Документы» (owner 05.11.2026): the legal texts people accept. A draft is saved freely; publishing makes it the
 * version new accounts accept (a fresh code); published versions never change. */
function Documents(){
 const {call}=useFe();const {t,locale}=useI18n();const toast=useToast();const when=useWhen();
 const [data,setData]=useSeen<z.infer<typeof docsRes>|null>('Documents.data',()=>null);const [error,setError]=useState<unknown>(null);
 const [lang,setLang]=useState<'ru'|'en'>(locale==='en'?'en':'ru');const [open,setOpen]=useState<string|null>(null);
 const load=useCallback(()=>{call('staff.documents',{},docsRes,{asAccount:true}).then(r=>{setData(r);setError(null);}).catch(setError);},[call]);
 useEffect(load,[load]);
 return <>
  <Seg<'ru'|'en'> value={lang} onChange={setLang} label={t('fe.staff.docs.lang')} options={[{id:'ru',label:'Русский'},{id:'en',label:'English'}]}/>
  {error&&!data?<Alert kind="err">{feErrorMessage(error,t)}</Alert>:!data?<Skel kind="list"/>:<Card list>{DOC_KEYS.map(k=>{
   const cur=data.current.find(d=>d.key===k&&d.locale===lang);const dr=data.drafts.find(d=>d.key===k&&d.locale===lang);
   const changed=!!dr&&dr.revision!==cur?.sourceRevision;
   return <Row key={k} title={cur?.title??dr?.title??t('fe.staff.docs.key.'+k)}
    sub={[cur?t('fe.staff.docs.version',{n:cur.version,date:when(cur.effectiveAt)}):t('fe.staff.docs.none'),changed?t('fe.staff.docs.draft'):null].filter(Boolean).join(' · ')} onClick={()=>setOpen(k)}/>;})}</Card>}
  {open&&data&&<DocumentSheet docKey={open} locale={lang} data={data} onClose={()=>setOpen(null)} onDone={msg=>{toast(msg,{type:'ok'});load();}}/>}
 </>;
}

function DocumentSheet({docKey,locale,data,onClose,onDone}:{docKey:string,locale:'ru'|'en',data:z.infer<typeof docsRes>,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call}=useFe();const {t}=useI18n();
 const cur=data.current.find(d=>d.key===docKey&&d.locale===locale);const dr=data.drafts.find(d=>d.key===docKey&&d.locale===locale);
 const base=dr??cur;
 const [title,setTitle]=useState(base?.title??'');const [text,setText]=useState(base?docText(base.blocks as DocBlock[]):'');
 const [must,setMust]=useState(base?.requiresAccept??MUST_ACCEPT.has(docKey));
 const [rev,setRev]=useState(dr?.revision??0);const [busy,setBusy]=useState(false);const setFailure=useFail();const [ask,setAsk]=useState(false);
 const dirty=!base||title!==base.title||text!==docText(base.blocks as DocBlock[])||must!==base.requiresAccept;
 const unpublished=rev>0&&rev!==cur?.sourceRevision;
 const save=async()=>{setBusy(true);setFailure('');
  try{const r=await call('staff.documentSave',{opId:newOpId(),key:docKey,locale,expectedRevision:rev,title:title.trim(),requiresAccept:must,blocks:docBlocks(text)},
    z.object({ok:z.literal(true),revision:z.number()}),{asAccount:true});setRev(r.revision);onDone(t('fe.staff.docs.saved'));return r.revision;}
  catch(e){setFailure(e instanceof FeError&&e.rule==='revision_conflict'?t('fe.staff.docs.conflict'):feErrorMessage(e,t));return null;}finally{setBusy(false);}};
 const publish=async()=>{setBusy(true);setFailure('');
  try{const r=await call('staff.documentPublish',{opId:newOpId(),key:docKey,locale,revision:rev,reviewed:true},z.object({ok:z.literal(true),version:z.number()}),{asAccount:true});
   setAsk(false);onDone(t('fe.staff.docs.published',{n:r.version}));onClose();}
  catch(e){setFailure(feErrorMessage(e,t));setAsk(false);}finally{setBusy(false);}};
 return <Sheet full className="st-sheet" title={t('fe.staff.docs.key.'+docKey)} sub={locale==='en'?'English':'Русский'} onClose={onClose} dirty={dirty}
  foot={ask?undefined:<ReviewBar main={dirty?<Btn icon={Check} disabled={busy||!title.trim()||!text.trim()} busy={busy} onClick={()=>void save()}>{t('fe.staff.docs.save')}</Btn>
   :<Btn icon={Check} disabled={busy||!unpublished} onClick={()=>setAsk(true)}>{t('fe.staff.docs.publish')}</Btn>}/>}>
  <BackCloses onClose={onClose}/>
  <Stack gap={4}>
   <LineField label={t('fe.staff.docs.title')} value={title} max={160} onChange={setTitle}/>
   <TextField label={t('fe.staff.docs.text')} value={text} max={60000} rows={14} onChange={setText}/>
   <Note>{t('fe.staff.docs.howTo')}</Note>
   <Card list><ToggleRow title={t('fe.staff.docs.must')} sub={MUST_ACCEPT.has(docKey)?t('fe.staff.docs.mustAlways'):t('fe.staff.docs.mustSub')} on={must} disabled={MUST_ACCEPT.has(docKey)} onClick={()=>setMust(!must)}/></Card>
   {cur&&<Kv rows={[[t('fe.staff.docs.live'),t('fe.staff.docs.liveN',{n:cur.version})]]}/>}
   {ask&&<Confirm text={t('fe.staff.docs.publishQ')} busy={busy} onNo={()=>setAsk(false)} onYes={()=>void publish()}/>}
   
  </Stack>
 </Sheet>;
}

// ——— Темы ———

const topicsRes=z.object({ok:z.literal(true),categories:z.array(z.object({id:z.string(),ru:z.string(),en:z.string(),hidden:z.boolean()})),
 topics:z.array(z.object({id:z.string(),categoryId:z.string(),ru:z.string(),en:z.string(),descRu:z.string().nullable(),descEn:z.string().nullable(),hidden:z.boolean(),used:z.number()}))});
type TopicRow=z.infer<typeof topicsRes>['topics'][number];
type Category=z.infer<typeof topicsRes>['categories'][number];

/** «Темы» (owner 05.11.2026): the interests catalog, by category; a topic is renamed, described, moved or hidden here,
 * and the app shows the change at once. Topics are never deleted (people keep their answers): a hidden one is not offered. */
function Topics(){
 const {call}=useFe();const {t,locale}=useI18n();const toast=useToast();
 const [data,setData]=useSeen<z.infer<typeof topicsRes>|null>('Topics.data',()=>null);const [error,setError]=useState<unknown>(null);
 const [open,setOpen]=useState<TopicRow|'new'|null>(null);const [cat,setCat]=useState<Category|'new'|null>(null);
 const load=useCallback(()=>{call('staff.topics',{},topicsRes,{asAccount:true}).then(r=>{setData(r);setError(null);}).catch(setError);},[call]);
 useEffect(load,[load]);
 const name=(x:{ru:string,en:string})=>locale==='en'?x.en:x.ru;
 return <>
  <Actions><Btn kind="soft" icon={Plus} onClick={()=>setOpen('new')} disabled={!data?.categories.length}>{t('fe.staff.topics.new')}</Btn><Btn kind="soft" icon={Plus} onClick={()=>setCat('new')}>{t('fe.staff.cat.new')}</Btn></Actions>
  {error&&!data?<Alert kind="err">{feErrorMessage(error,t)}</Alert>:!data?<Skel kind="list"/>:data.categories.map(c=>{const rows=data.topics.filter(x=>x.categoryId===c.id);
   return <Group key={c.id} title={name(c)+(c.hidden?' · '+t('fe.staff.cat.hiddenMark'):'')} action={<Btn kind="text" size="sm" onClick={()=>setCat(c)}>{t('fe.staff.cat.edit')}</Btn>}>
    {rows.length?<Card list>{rows.map(x=><Row key={x.id} title={name(x)}
     sub={[x.hidden?t('fe.staff.topics.hidden'):null,t('fe.staff.topics.used',{n:x.used})].filter(Boolean).join(' · ')} onClick={()=>setOpen(x)}/>)}</Card>:<Empty compact icon={Tags} title={t('fe.staff.cat.empty')}/>}
   </Group>;})}
  {open&&data&&<TopicSheet topic={open==='new'?null:open} categories={data.categories} onClose={()=>setOpen(null)} onDone={()=>{setOpen(null);toast(t('fe.staff.topics.saved'),{type:'ok'});load();}}/>}
  {cat&&<CategorySheet category={cat==='new'?null:cat} onClose={()=>setCat(null)} onDone={()=>{setCat(null);toast(t('fe.staff.topics.saved'),{type:'ok'});load();}}/>}
 </>;
}

function CategorySheet({category,onClose,onDone}:{category:Category|null,onClose:()=>void,onDone:()=>void}){
 const {call}=useFe();const {t,locale}=useI18n();
 const [f,setF]=useState({id:category?.id??'',ru:category?.ru??'',en:category?.en??'',hidden:category?.hidden??false});
 const [busy,setBusy]=useState(false);const setFailure=useFail();
 const idOk=/^[a-z][a-z0-9_-]{1,31}$/.test(f.id);
 const save=async()=>{setBusy(true);setFailure('');
  try{await call('staff.categorySave',{opId:newOpId(),id:f.id,create:!category,ru:f.ru.trim(),en:f.en.trim(),hidden:f.hidden},ok,{asAccount:true});onDone();}
  catch(e){setFailure(e instanceof FeError&&e.rule==='category_exists'?t('fe.staff.cat.exists'):feErrorMessage(e,t));}finally{setBusy(false);}};
 return <Sheet className="st-sheet" title={category?(locale==='en'?category.en:category.ru):t('fe.staff.cat.add')} onClose={onClose}
  foot={<Btn icon={Check} disabled={busy||!f.ru.trim()||!f.en.trim()||!idOk} busy={busy} onClick={()=>void save()}>{t('fe.staff.team.save')}</Btn>}>
  <BackCloses onClose={onClose}/>
  <Form>
   {!category&&<LineField label={t('fe.staff.cat.id')} hint={t('fe.staff.cat.idHint')} value={f.id} max={32} autoCapitalize="none" onChange={v=>setF(x=>({...x,id:v.toLowerCase()}))}/>}
   <LineField label={t('fe.staff.topics.ru')} value={f.ru} max={40} onChange={v=>setF(x=>({...x,ru:v}))}/>
   <LineField label={t('fe.staff.topics.en')} value={f.en} max={40} onChange={v=>setF(x=>({...x,en:v}))}/>
   <Card list><ToggleRow title={t('fe.staff.topics.shown')} sub={t('fe.staff.cat.shownSub')} on={!f.hidden} onClick={()=>setF(x=>({...x,hidden:!x.hidden}))}/></Card>
   
  </Form>
 </Sheet>;
}

function TopicSheet({topic,categories,onClose,onDone}:{topic:TopicRow|null,categories:z.infer<typeof topicsRes>['categories'],onClose:()=>void,onDone:()=>void}){
 const {call}=useFe();const {t,locale}=useI18n();
 const [f,setF]=useState({id:topic?.id??'',categoryId:topic?.categoryId??categories[0]?.id??'',ru:topic?.ru??'',en:topic?.en??'',descRu:topic?.descRu??'',descEn:topic?.descEn??'',hidden:topic?.hidden??false});
 const [busy,setBusy]=useState(false);const setFailure=useFail();
 const set=<K extends keyof typeof f>(k:K,v:(typeof f)[K])=>setF(x=>({...x,[k]:v}));
 const idOk=/^[a-z][a-z0-9_-]{1,31}$/.test(f.id);
 const save=async()=>{setBusy(true);setFailure('');
  try{await call('staff.topicSave',{opId:newOpId(),id:f.id,create:!topic,categoryId:f.categoryId,ru:f.ru.trim(),en:f.en.trim(),descRu:f.descRu.trim()||null,descEn:f.descEn.trim()||null,hidden:f.hidden},ok,{asAccount:true});onDone();}
  catch(e){setFailure(e instanceof FeError&&e.rule==='topic_exists'?t('fe.staff.topics.exists'):feErrorMessage(e,t));}finally{setBusy(false);}};
 return <Sheet className="st-sheet" title={topic?(locale==='en'?topic.en:topic.ru):t('fe.staff.topics.add')} onClose={onClose}
  foot={<Btn icon={Check} disabled={busy||!f.ru.trim()||!f.en.trim()||!idOk} busy={busy} onClick={()=>void save()}>{t('fe.staff.team.save')}</Btn>}>
  <BackCloses onClose={onClose}/>
  <Form>
   {!topic&&<LineField label={t('fe.staff.topics.id')} hint={t('fe.staff.topics.idHint')} value={f.id} max={32} autoCapitalize="none" onChange={v=>set('id',v.toLowerCase())}/>}
   <LineField label={t('fe.staff.topics.ru')} value={f.ru} max={40} onChange={v=>set('ru',v)}/>
   <LineField label={t('fe.staff.topics.en')} value={f.en} max={40} onChange={v=>set('en',v)}/>
   <TextField label={t('fe.staff.topics.descRu')} value={f.descRu} max={300} onChange={v=>set('descRu',v)}/>
   <TextField label={t('fe.staff.topics.descEn')} value={f.descEn} max={300} onChange={v=>set('descEn',v)}/>
   <Field id="st-topic-cat" label={t('fe.staff.topics.category')}><Select id="st-topic-cat" label={t('fe.staff.topics.category')} value={f.categoryId}
    options={categories.map(c=>[c.id,locale==='en'?c.en:c.ru] as [string,string])} onChange={v=>set('categoryId',v)}/></Field>
   <Card list><ToggleRow title={t('fe.staff.topics.shown')} sub={t('fe.staff.topics.shownSub')} on={!f.hidden} onClick={()=>set('hidden',!f.hidden)}/></Card>
   
  </Form>
 </Sheet>;
}

// ——— Сотрудники ———

const ROLES_GIVEN=['lead','moderator','verifier','auditor','support'] as const;
const teamRes=z.object({ok:z.literal(true),items:z.array(z.object({accountId:z.string(),profileId:z.string().nullable(),handle:z.string().nullable(),name:z.string().nullable(),roles:z.array(z.string())})),
 waived:z.array(z.object({accountId:z.string(),handle:z.string().nullable(),name:z.string().nullable()}))});
type Member=z.infer<typeof teamRes>['items'][number];
type Waived=z.infer<typeof teamRes>['waived'][number];

/** «Сотрудники» (owner 05.11.2026): who has which role; the owner gives and takes roles by @nick (a fresh code, journalled). */
function Team(){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const [items,setItems]=useSeen<Member[]|null>('Team.items',()=>null);const [waived,setWaived]=useSeen<Waived[]>('Team.waived',()=>[]);const [error,setError]=useState<unknown>(null);
 const [open,setOpen]=useState<Member|'new'|null>(null);const [free,setFree]=useState<Waived|'new'|null>(null);
 const load=useCallback(()=>{call('staff.team',{},teamRes,{asAccount:true}).then(r=>{setItems(r.items);setWaived(r.waived);setError(null);}).catch(setError);},[call]);
 useEffect(load,[load]);
 const roleWord=(r:string)=>t('fe.staff.role.'+r);
 return <>
  {error&&!items?<Alert kind="err">{feErrorMessage(error,t)}</Alert>:!items?<Skel kind="list"/>:<>
   <Card list>{items.map(m=><Row key={m.accountId} title={personName({handle:m.handle,name:m.name})??t('fe.staff.noName')} sub={m.roles.map(roleWord).join(', ')}
    onClick={m.roles.includes('owner')?undefined:()=>setOpen(m)} noChev={m.roles.includes('owner')}/>)}</Card>
   <Btn kind="soft" icon={UserPlus} onClick={()=>setOpen('new')}>{t('fe.staff.team.add')}</Btn>
   <Group title={t('fe.staff.waiver.title')} foot={t('fe.staff.waiver.note')}>
    {waived.length>0&&<Card list>{waived.map(w=><Row key={w.accountId} title={personName({handle:w.handle,name:w.name})??t('fe.staff.noName')} onClick={()=>setFree(w)}/>)}</Card>}
    <Btn kind="soft" icon={ShieldCheck} onClick={()=>setFree('new')}>{t('fe.staff.waiver.add')}</Btn>
   </Group>
  </>}
  {free&&<WaiverSheet member={free==='new'?null:free} onClose={()=>setFree(null)} onDone={()=>{setFree(null);toast(t('fe.staff.waiver.saved'),{type:'ok'});load();}}/>}
  {open&&<TeamSheet member={open==='new'?null:open} onClose={()=>setOpen(null)} onDone={()=>{setOpen(null);toast(t('fe.staff.team.saved'),{type:'ok'});load();}}/>}
 </>;
}

function TeamSheet({member,onClose,onDone}:{member:Member|null,onClose:()=>void,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [handle,setHandle]=useState('');const [roles,setRoles]=useState<string[]>(member?.roles??[]);
 const [busy,setBusy]=useState(false);const setFailure=useFail();
 const nick=(member?.handle??handle.trim()).replace(/^@/,'');
 const save=async()=>{setBusy(true);setFailure('');
  try{
   for(const r of ROLES_GIVEN){const was=!!member?.roles.includes(r),now=roles.includes(r);
    if(was!==now)await call('staff.grant',{opId:newOpId(),handle:nick,role:r,grant:now},ok,{asAccount:true});}
   onDone();
  }catch(e){setFailure(e instanceof FeError&&e.code==='not_found'?t('fe.staff.measures.notFound'):feErrorMessage(e,t));}finally{setBusy(false);}};
 return <Sheet className="st-sheet" title={member?personName({handle:member.handle,name:member.name})??'':t('fe.staff.team.add')} onClose={onClose}
  foot={<Btn icon={Check} disabled={busy||!nick} busy={busy} onClick={()=>void save()}>{t('fe.staff.team.save')}</Btn>}>
  <BackCloses onClose={onClose}/>
  <Form>
   {!member&&<LineField label={t('fe.staff.premium.handle')} value={handle} max={41} autoCapitalize="none" onChange={setHandle}/>}
   <Field label={t('fe.staff.team.roles')} hint={t('fe.staff.team.note')}>
    <CheckList label={t('fe.staff.team.roles')} value={roles.filter(r=>(ROLES_GIVEN as readonly string[]).includes(r)) as typeof ROLES_GIVEN[number][]} onChange={v=>setRoles(v)}
     options={ROLES_GIVEN.map(r=>[r,t('fe.staff.role.'+r).replace(/^./,c=>c.toUpperCase()),t('fe.staff.team.sub.'+r)] as const)}/>
   </Field>
   
  </Form>
 </Sheet>;
}

/** «Без проверок»: free an account from the manual checks, or bring them back (owner, a fresh code, journalled). */
function WaiverSheet({member,onClose,onDone}:{member:Waived|null,onClose:()=>void,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [handle,setHandle]=useState('');const [busy,setBusy]=useState(false);const setFailure=useFail();
 const nick=(member?.handle??handle.trim()).replace(/^@/,'');
 const save=async()=>{setBusy(true);setFailure('');
  try{await call('staff.checksWaiver',{opId:newOpId(),handle:nick,on:!member},z.object({ok:z.literal(true)}).passthrough(),{asAccount:true});onDone();}
  catch(e){setFailure(e instanceof FeError&&e.code==='not_found'?t('fe.staff.measures.notFound'):e instanceof FeError&&e.rule==='owner_always_freed'?t('fe.staff.waiver.owner'):feErrorMessage(e,t));}finally{setBusy(false);}};
 return <Sheet className="st-sheet" title={member?personName({handle:member.handle,name:member.name})??'':t('fe.staff.waiver.add')} onClose={onClose}
  foot={<Btn icon={Check} disabled={busy||!nick} busy={busy} onClick={()=>void save()}>{t(member?'fe.staff.waiver.off':'fe.staff.waiver.on')}</Btn>}>
  <BackCloses onClose={onClose}/>
  <Form>
   {!member&&<LineField label={t('fe.staff.premium.handle')} value={handle} max={41} autoCapitalize="none" onChange={setHandle}/>}
   
  </Form>
 </Sheet>;
}

// ——— Premium for dogfooding ———

function Premium(){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();
 const [handle,setHandle]=useState('');const [days,setDays]=useState('30');const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);const setFailure=useFail();const [granted,setGranted]=useState<{id:string,until:string}|null>(null);
 const [entitlement,setEntitlement]=useState('');const [revokeReason,setRevokeReason]=useState('');const [ask,setAsk]=useState(false);const [revoked,setRevoked]=useState('');
 const err=(e:unknown)=>setFailure(forbidden(e)?t((e as FeError).rule==='self'?'fe.staff.premium.self':'fe.staff.premium.forbidden'):feErrorMessage(e,t));
 const n=Number(days);const h=handle.trim().replace(/^@/,'');
 const canGrant=h.length>=3&&Number.isInteger(n)&&n>=1&&n<=400&&reason.trim().length>=3;
 const grant=async()=>{setBusy(true);setFailure('');setRevoked('');
  try{const r=await call('staff.premiumGrant',{opId:newOpId(),handle:h,days:n,reason:reason.trim()},grantRes,{asAccount:true});setGranted({id:r.id,until:r.until});setEntitlement(r.id);}
  catch(e){err(e);}finally{setBusy(false);}};
 const revoke=async()=>{setBusy(true);setFailure('');
  try{await call('staff.premiumRevoke',{opId:newOpId(),entitlementId:entitlement.trim(),reason:revokeReason.trim()},ok,{asAccount:true});
   setRevoked(t('fe.staff.premium.revoked'));setAsk(false);if(granted?.id===entitlement.trim())setGranted(null);setEntitlement('');setRevokeReason('');}
  catch(e){err(e);}finally{setBusy(false);}};
 const uuid=/^[0-9a-f-]{36}$/i.test(entitlement.trim());
 return <>
  <Group title={t('fe.staff.premium.grantTitle')} foot={t('fe.staff.premium.grantNote')}>
   <Form>
    <LineField label={t('fe.staff.premium.handle')} value={handle} max={21} autoCapitalize="none" onChange={setHandle}/>
    <LineField label={t('fe.staff.premium.days')} inputMode="numeric" value={days} max={3} onChange={v=>setDays(v.replace(/\D/g,''))}/>
    <TextField label={t('fe.staff.premium.reason')} value={reason} onChange={setReason} max={300}/>
    <Btn icon={Check} disabled={busy||!canGrant} onClick={grant} busy={busy}>{t('fe.staff.premium.grant')}</Btn>
    {granted&&<Alert kind="ok" icon={Check} action={<Actions><Btn kind="soft" size="sm" onClick={()=>setEntitlement(granted.id)}>{t('fe.staff.premium.revokeThis')}</Btn></Actions>}>{t('fe.staff.premium.granted',{until:when(granted.until)})}</Alert>}
    {granted&&<Details data={granted.id}/>}
   </Form>
  </Group>
  <Group title={t('fe.staff.premium.revokeTitle')} foot={t('fe.staff.premium.revokeNote')}>
   <Form>
    <LineField label={t('fe.staff.premium.entitlement')} value={entitlement} max={36} autoCapitalize="none" spellCheck={false} onChange={setEntitlement}/>
    <TextField label={t('fe.staff.premium.reason')} value={revokeReason} onChange={setRevokeReason} max={300}/>
    {ask?<Confirm text={t('fe.staff.premium.confirmRevoke')} busy={busy} onNo={()=>setAsk(false)} onYes={revoke}/>
     :<Btn kind="danger" disabled={busy||!uuid||revokeReason.trim().length<3} onClick={()=>setAsk(true)}>{t('fe.staff.premium.revoke')}</Btn>}
    {revoked&&<Alert kind="ok" icon={Check}>{revoked}</Alert>}
   </Form>
  </Group>
  
 </>;
}

// ——— journal ———

const JOURNAL_ACTIONS=['words.add','words.remove','person.watch','person.unwatch','topic.create','topic.save','document.save','document.publish','age.view','age.approve','age.reject','photo.view','photo.approve','photo.reject','community.approve','community.reject','event.approve','event.reject','event.hide',
 'media.view','media.approve','media.reject','notice.removed','notice.kept','notice.not_actionable','place.approve','place.reject','premium.grant','premium.revoke','report.keep','report.remove',
 'revision.approve','revision.reject','sanction.suspend','sanction.lift','sanction.expired','restrict.on','restrict.off','restrict.expired','staff.grant','staff.revoke','staff.factorOn','staff.factorLocked',
 'staff.factorReset','staff.recoveryUsed','support.reply','support.close','appeal.grant','appeal.deny','dating.on','dating.off','maintenance.on','maintenance.off','place.limit',
 'dispute.restore','dispute.remove','dispute.claimantReviewed','dispute.claimantRestricted'] as const;
type JournalRow=z.infer<typeof journalItem>;

function Journal(){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();const jw=useJournalWord();
 // The object the list is narrowed to: its code (sent to the server) and a plain name of it for the reader.
 const [applied,setApplied]=useState<{id:string,label:string}|null>(null);
 const [open,setOpen]=useState<JournalRow|null>(null);const [code,setCode]=useState('');
 const [who,setWho]=useState('');const [what,setWhat]=useState('');
 // Staff for the «Кто» filter: everyone seen in the journal so far (the journal is the only place that names them).
 const [staffSeen,setStaffSeen]=useState<Record<string,string>>({});
 const name=(x:JournalRow)=>x.staff_account_id?(x.staff_name||(x.staff_handle?'@'+x.staff_handle:t('fe.staff.journal.unknownStaff'))):t('fe.staff.journal.auto');
 const targetId=applied?.id;const [person,setPerson]=useState<{id:string,label:string}|null>(null);const personId=person?.id;
 const fetchPage=useCallback((after?:string)=>call('staff.journal',{limit:50,...(targetId?{targetId}:{}),...(personId?{personId}:{}),...(who?{staffAccountId:who}:{}),...(what?{what}:{}),...(after?{after}:{})},journalPage,{asAccount:true})
  .then(r=>{setStaffSeen(m=>{const n={...m};for(const x of r.items)if(x.staff_account_id)n[x.staff_account_id]=x.staff_name||(x.staff_handle?'@'+x.staff_handle:t('fe.staff.journal.unknownStaff'));return n;});return r;}),[call,targetId,personId,who,what,t]);
 const {items,error,reload:load,moreProps}=useStaffPage(fetchPage,x=>String(x.id));
 const staffOptions:[string,string][]=[['',t('fe.staff.journal.anyone')],...Object.entries(staffSeen).map(([id,n])=>[id,n] as [string,string])];
 if(who&&!staffSeen[who])staffOptions.push([who,t('fe.staff.journal.unknownStaff')]);
 // What the decision said, in words: the rule, the note, the term. Anything else stays in «Подробнее».
 const facts=(x:JournalRow):[string,ReactNode][]=>{
  const d=x.detail&&typeof x.detail==='object'?x.detail as Record<string,unknown>:{};const rows:[string,ReactNode][]=[];
  if(typeof d.rule==='string'){const w=t('fe.staff.rule.'+d.rule);rows.push([t('fe.staff.journal.d.rule'),w.startsWith('fe.')?d.rule:w]);}
  if(typeof d.note==='string'&&d.note)rows.push([t('fe.staff.journal.d.note'),d.note]);
  if(typeof d.days==='number'){const w=t('fe.staff.m.days.'+d.days);rows.push([t('fe.staff.journal.d.days'),w.startsWith('fe.')?String(d.days):w]);}
  if(typeof d.until==='string')rows.push([t('fe.staff.journal.d.until'),when(d.until)]);
  if(d.selfReview===true)rows.push([t('fe.staff.journal.d.self'),t('fe.staff.journal.d.selfText')]);
  return rows;
 };
 return <>
  <SearchInput label={t('fe.staff.journal.byCode')} value={code} placeholder={t('fe.staff.journal.byCode')} spellCheck={false}
   onChange={e=>{const v=e.target.value.trim();if(/^[0-9a-f-]{36}$/i.test(v)){setApplied({id:v,label:t('fe.staff.journal.thatCode')});setCode('');}else setCode(e.target.value);}}/>
  <Form>
   <Field id="st-j-who" label={t('fe.staff.journal.who')}><Select id="st-j-who" label={t('fe.staff.journal.who')} value={who} options={staffOptions} onChange={setWho}/></Field>
   <Field id="st-j-what" label={t('fe.staff.journal.what')}><Select id="st-j-what" label={t('fe.staff.journal.what')} value={what} options={[['',t('fe.staff.journal.anything')],...JOURNAL_ACTIONS.map(a=>[a,jw('action',a)] as [string,string])]} onChange={setWhat}/></Field>
  </Form>
  {(applied||person)&&<Alert kind="info" icon={ListFilter} action={<Btn kind="soft" size="sm" auto onClick={()=>{setApplied(null);setPerson(null);}}>{t('fe.staff.journal.showAll')}</Btn>}>{t('fe.staff.journal.onlyThis',{what:(person??applied)!.label})}</Alert>}
  {error?(forbidden(error)?<Empty compact icon={Lock} title={t('fe.staff.unavailable')} text={t('fe.staff.journal.forbidden')}/>
    :<Alert kind="err" action={<Btn kind="soft" size="sm" auto icon={RefreshCw} onClick={load}>{t('fe.retry')}</Btn>}>{feErrorMessage(error,t)}</Alert>)
   :items===null?<Skel kind="list"/>
   :!items.length?<Empty compact icon={Inbox} title={t('fe.staff.journal.empty')}/>
   :<><Card list>{items.map(x=><Row key={String(x.id)} title={name(x)+' · '+jw('action',x.action)}
     sub={[x.person?personName(x.person):x.target_type?jw('type',x.target_type):null,when(x.created_at)].filter(Boolean).join(' · ')} onClick={()=>setOpen(x)}/>)}</Card>
    <LoadMore {...moreProps}/></>}
  {open&&<Sheet title={jw('action',open.action)} sub={when(open.created_at)} onClose={()=>setOpen(null)}>
   <BackCloses onClose={()=>setOpen(null)}/>
   <Stack gap={4}>
    <Kv rows={[[t('fe.staff.journal.who'),name(open)],[t('fe.staff.journal.what'),jw('action',open.action)],[t('fe.staff.journal.whom'),open.person?<PersonLink who={open.person}/>:null],
     [t('fe.staff.journal.object'),open.target_type?jw('type',open.target_type):null],...facts(open)]}/>
    {open.person?<Btn kind="soft" icon={ListFilter} onClick={()=>{setPerson({id:open.person!.id,label:personName(open.person)??''});setOpen(null);}}>{t('fe.staff.journal.aboutPerson')}</Btn>
     :open.target_id&&<Btn kind="soft" icon={ListFilter} onClick={()=>{setApplied({id:open.target_id!,label:open.target_type?jw('type',open.target_type):t('fe.staff.journal.thatCode')});setOpen(null);}}>{t('fe.staff.journal.sameObject')}</Btn>}
   </Stack>
  </Sheet>}
 </>;
}
