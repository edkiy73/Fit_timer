import {useCallback,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {BadgeCheck,Ban,CalendarDays,Check,ChevronLeft,ChevronRight,Eye,FilePen,Flag,Gavel,IdCard,Image,ImageOff,Inbox,ListFilter,Lock,MapPin,Minus,RefreshCw,Scale,Search,ShieldAlert,ShieldCheck,UserX,Users,X,Ellipsis,LifeBuoy,Crown,Wrench,ScrollText,KeyRound,type LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Actions,Alert,Btn,Card,ChoiceChips,Chips,Divider,Empty,ExpandRow,Field,Form,Group,IconBtn,Input,KeyValues,LoadMore,MoreInfo,Note,Pill,ReviewCard,ReviewMedia,ReviewPair,Row,SectionLabel,Seg,Select,Sheet,Skel,Stack,SubBar,Text,TextArea,VideoPlayer,View,VoiceBubble} from './kit';
import {askFactor,useFe} from './session';
import {useToast} from './toast';
import {FactorPromptHost,FactorReset,StaffEnrol,StaffUnlock,factorSchema,type Factor} from './staff-factor';
import {StaffSupport} from './support';
import {useStaffPage} from './staff-paged';
import {priceText} from './communities';
import {evRange,evTz,inTz} from './event-time';
import {StaffMaintenance} from './maintenance';
import {textError,textRule} from './kit/validate';
import {fill} from './comm-kit';

/** Staff area (/n/staff, S4 moderation): review queues with decisions, Premium for dogfooding, the journal.
 * Roles are enforced by the server only; a queue the server refuses (403) is simply not shown. */
const ok=z.object({ok:z.literal(true)}).passthrough();
const meRes=z.object({ok:z.literal(true),roles:z.array(z.string()),factor:factorSchema.optional()});
const ts=z.string().nullable().optional();
const opt=<T extends z.ZodType>(s:T)=>s.nullable().optional();

const mediaItem=z.object({id:z.uuid(),purpose:z.string(),kind:z.string(),authorLabel:opt(z.string()),reason:opt(z.string()),createdAt:ts,w:opt(z.number()),h:opt(z.number()),blur:opt(z.string())});
const viewRes=z.object({ok:z.literal(true),src:z.object({card:z.string().optional(),full:z.string().optional(),file:z.string().optional()}).nullable()});
const commItem=z.object({id:z.uuid(),rev:z.number(),name:z.string(),description:opt(z.string()),topics:opt(z.array(z.string())),privacy:opt(z.string()),join_question:opt(z.string()),
 rules:z.unknown().optional(),state:z.string(),pending_change:z.record(z.string(),z.unknown()).nullable().optional(),created_at:ts,
 resubmits:z.number().optional(),prev_reject_reason:opt(z.string()),cover:z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough().nullable().optional(),newCover:z.object({src:z.record(z.string(),z.string()).nullable()}).passthrough().nullable().optional()}).passthrough();
const eventItem=z.object({id:z.uuid(),rev:z.number(),title:z.string(),kind:opt(z.string()),description:opt(z.string()),format:opt(z.string()),area:opt(z.string()),exact_address:opt(z.string()),
 join_url:opt(z.string()),tz:opt(z.string()),starts_at:ts,ends_at:ts,price:z.unknown().optional(),requirements:opt(z.string()),state:z.string(),pending_change:z.record(z.string(),z.unknown()).nullable().optional(),
 created_at:ts,organizer:opt(z.object({id:z.string(),kind:z.string().optional(),handle:z.string().nullable().optional()}).passthrough())}).passthrough();
const mediaDto=z.object({src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional();
const checkItem=z.object({id:z.uuid(),gesture:z.string(),submittedAt:ts,profile:z.object({id:z.string(),handle:z.string().nullable()}),selfie:mediaDto,photo:mediaDto});
const ageItem=checkItem.extend({method:z.enum(['selfie','document']).optional().default('selfie'),gesture:z.string().nullable(),document:mediaDto});
const photoItem=checkItem.extend({photos:z.array(mediaDto).optional()});
const reportItem=z.object({targetType:z.enum(['profile','post','reply','community','event','conversation']),targetId:z.uuid(),reports:z.number(),reasons:z.array(z.string()),
 details:opt(z.array(z.string())),firstAt:ts,lastAt:ts,reported:z.unknown().optional(),excerpt:opt(z.string()),state:opt(z.string()),media:opt(z.number()),
 author:opt(z.object({id:z.string(),kind:z.string().optional(),handle:z.string().nullable().optional(),name:z.string().nullable().optional()}).passthrough()),
 evidence:opt(z.array(z.object({assetId:z.uuid(),kind:z.string(),seq:opt(z.number())})))});
const appealItem=z.object({id:z.uuid(),target_type:z.string(),target_id:z.string(),body:z.string(),created_at:ts,handle:opt(z.string()),
 decision:opt(z.object({action:z.string(),detail:z.unknown().optional(),at:ts,mine:z.boolean().optional()}).passthrough())});
const noticeItem=z.object({id:z.uuid(),target_url:opt(z.string()),reason:z.string(),explanation:opt(z.string()),created_at:ts,answerable:opt(z.boolean())});
const placeItem=z.object({id:z.uuid(),country:opt(z.string()),name_ru:opt(z.string()),name_en:opt(z.string()),created_at:ts,used:opt(z.number())});
const journalItem=z.object({id:z.union([z.string(),z.number()]),staff_account_id:opt(z.string()),staff_name:opt(z.string()),staff_handle:opt(z.string()),action:z.string(),target_type:opt(z.string()),target_id:opt(z.string()),detail:z.unknown().optional(),created_at:ts});
const disputeClaim=z.object({tagged:z.boolean(),hid:z.boolean().optional(),at:ts,trust:z.string(),strikes:z.number()});
const disputeItem=z.object({id:z.uuid(),disputed_at:ts,opened_at:ts,excerpt:opt(z.string()),media:opt(z.number()),hidden:z.boolean().optional(),urgent:z.boolean().optional(),
 attack:z.boolean().optional(),tagged:z.boolean().optional(),note:opt(z.string()),claims:z.array(disputeClaim).optional().default([])});
const flaggedRes=z.object({ok:z.literal(true),flagged:z.array(z.object({profileId:z.uuid(),handle:z.string().nullable(),strikes:z.number(),flaggedAt:ts})).optional().default([])}).passthrough();
const revisionItem=z.object({id:z.uuid(),postId:z.uuid(),createdAt:ts,live:opt(z.string()),proposed:z.unknown().optional()});
const grantRes=z.object({ok:z.literal(true),id:z.string(),until:z.string()});

type MediaItem=z.infer<typeof mediaItem>;type CommItem=z.infer<typeof commItem>;type EventItem=z.infer<typeof eventItem>;type AgeItem=z.infer<typeof ageItem>;type PhotoItem=z.infer<typeof photoItem>;
type DisputeItem=z.infer<typeof disputeItem>;type RevisionItem=z.infer<typeof revisionItem>;type ReportItem=z.infer<typeof reportItem>;type AppealItem=z.infer<typeof appealItem>;type NoticeItem=z.infer<typeof noticeItem>;type PlaceItem=z.infer<typeof placeItem>;
type Items={dispute:DisputeItem[],report:ReportItem[],revision:RevisionItem[],media:MediaItem[],community:CommItem[],event:EventItem[],age:AgeItem[],photo:PhotoItem[],appeal:AppealItem[],notice:NoticeItem[],place:PlaceItem[]};
type QueueId=keyof Items;
/** `locked`: documents and selfies wait for a fresh second-factor code (staff.ageCheckQueue, staff.photoCheckQueue). */
const list=<T extends z.ZodType>(item:T)=>z.object({ok:z.literal(true),items:z.array(item),locked:z.boolean().optional(),next:z.string().nullable().optional(),tail:z.string().nullable().optional(),total:z.number().optional()});
const journalPage=list(journalItem);
const QUEUES:{[K in QueueId]:{action:string,schema:z.ZodType<{items:Items[K],locked?:boolean|undefined}>,key:(x:Items[K][number])=>string}}={
 // V21 M01 puts «это я на фото» disputes and post reports first.
 dispute:{action:'staff.disputeQueue',schema:list(disputeItem),key:x=>x.id},
 report:{action:'staff.reportQueue',schema:list(reportItem),key:x=>x.targetType+':'+x.targetId+':'+(x.author?.id??'')},
 revision:{action:'staff.revisionQueue',schema:list(revisionItem),key:x=>x.id},
 media:{action:'staff.mediaQueue',schema:list(mediaItem),key:x=>x.id},
 community:{action:'staff.communityQueue',schema:list(commItem),key:x=>x.id},
 event:{action:'staff.eventQueue',schema:list(eventItem),key:x=>x.id},
 age:{action:'staff.ageCheckQueue',schema:list(ageItem),key:x=>x.id},
 photo:{action:'staff.photoCheckQueue',schema:list(photoItem),key:x=>x.id},
 appeal:{action:'staff.appealQueue',schema:list(appealItem),key:x=>x.id},
 notice:{action:'staff.noticeQueue',schema:list(noticeItem),key:x=>x.id},
 place:{action:'staff.placeQueue',schema:list(placeItem),key:x=>x.id},
};
const QUEUE_IDS=Object.keys(QUEUES) as QueueId[];
/** Who may open what (the server's requireStaff lists); the screen only asks for what the roles allow. Queues not
 * listed are open to every staff role that has a queue. */
const QUEUE_ROLES:Partial<Record<QueueId,string[]>>={appeal:['owner','lead']};
const SECTION_ROLES={queues:['owner','lead','moderator','verifier'],support:['owner','lead','moderator','support'],premium:['owner','lead'],maintenance:['owner','lead'],journal:['owner','lead','auditor'],access:['owner','lead']} as const;
const SECTIONS=['queues','support','premium','maintenance','journal','access'] as const;
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
 return {...me,reload:useCallback(()=>setNonce(n=>n+1),[])};
}

/** Me header button, shown only to staff. */
export function StaffEntry(){
 const roles=useStaffRoles();const {t}=useI18n();const navigate=useNavigate();
 if(!roles?.length)return null;
 return <IconBtn icon={ShieldCheck} label={t('fe.staff.entry')} title={t('fe.staff.entryText')} onClick={()=>navigate('/n/staff')}/>;
}

export function StaffScreen(){
 const {t}=useI18n();const {roles,factor,checked,reload}=useStaffMe({fresh:true});const navigate=useNavigate();
 const [section,setSection]=useState<Section>('queues');const [menu,setMenu]=useState(false);
 const ok:Section[]=roles?SECTIONS.filter(id=>can(roles,SECTION_ROLES[id])):[];const cur:Section=ok.includes(section)?section:ok[0]??'queues';
 // Daily work (queues, support) is on the switch; the rarer tools (Premium, maintenance, journal, access) in the menu.
 const daily:Section[]=ok.filter(id=>id==='queues'||id==='support');const tools:Section[]=ok.filter(id=>!daily.includes(id));
 const label=(id:Section)=>t(SECTION_LABEL[id]);
 const ready=!!roles?.length&&checked&&!(factor&&(!factor.enrolled||!factor.verified));
 return <>
  <SubBar title={tools.includes(cur)?label(cur):t('fe.staff.title')} onBack={()=>tools.includes(cur)?setSection(daily[0]??'queues'):navigate('/n/me')}>
   {ready&&tools.length>0&&<IconBtn icon={Ellipsis} kind="ghost" label={t('fe.staff.tools')} onClick={()=>setMenu(true)}/>}
  </SubBar>
  <View className="nodock">
   {roles===null||(!checked&&!!roles.length)?<Skel kind="list"/>
    :!roles.length?<Empty icon={Lock} title={t('fe.staff.unavailable')} text={t('fe.staff.unavailableText')}/>
    // Second factor first (server/commands/staff.mjs): connect the app, then a code in this sign-in.
    :factor&&!factor.enrolled?<StaffEnrol onDone={reload}/>
    :factor&&!factor.verified?<StaffUnlock factor={factor} onDone={reload}/>
    :<>
     <FactorPromptHost onEnrol={reload}/>
     {daily.length>1&&daily.includes(cur)&&<Seg<Section> small={false} value={cur} onChange={setSection} options={daily.map(id=>({id,label:label(id)}))}/>}
     {cur==='queues'?<Queues/>:cur==='support'?<StaffSupport/>:cur==='premium'?<Premium/>:cur==='maintenance'?<StaffMaintenance/>:cur==='journal'?<Journal/>:cur==='access'?<FactorReset/>:null}
    </>}
  </View>
  {menu&&<Sheet title={t('fe.staff.tools')} sub={roles?.length?t('fe.staff.roles')+': '+roles.map(r=>t('fe.staff.role.'+r)).join(', '):undefined} onClose={()=>setMenu(false)}>
   <Card list>{tools.map(id=><Row key={id} icon={SECTION_ICON[id]} title={label(id)} onClick={()=>{setSection(id);setMenu(false);}}/>)}</Card>
  </Sheet>}
 </>;
}
const SECTION_LABEL:Record<Section,string>={queues:'fe.staff.section.queues',support:'fe.w8.staff.support',premium:'fe.staff.section.premium',maintenance:'fe.w8.staff.maint',journal:'fe.staff.section.journal',access:'fe.staff.section.access'};
const SECTION_ICON:Record<Section,LucideIcon>={queues:Inbox,support:LifeBuoy,premium:Crown,maintenance:Wrench,journal:ScrollText,access:KeyRound};

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
 const [data,setData]=useState<Loaded|null>(null);const [tab,setTab]=useState<QueueId|'all'>('all');const [notice,setNotice]=useState('');
 // Oldest first: what waits longest is decided first; urgent items are lifted to the top of the list (see `sorted`).
 const order:Order='old';
 const [focus,setFocus]=useState<number|null>(null);const [picking,setPicking]=useState(false);
 const [pageBusy,setPageBusy]=useState(false);const [pageError,setPageError]=useState<unknown>(null);
 // The live timer reads the screen as it is at each tick, not as it was when the timer was set.
 const live=useRef({data:null as Loaded|null,tab:'all' as QueueId|'all',busy:false,focus:false});
 live.current={data,tab,busy:pageBusy,focus:focus!==null};
 const load=useCallback((fresh=false)=>{
  setData(null);setNotice('');setPageError(null);
  const ids=QUEUE_IDS.filter(id=>can(roles??[],QUEUE_ROLES[id]));
  void Promise.allSettled(ids.map(id=>call(QUEUES[id].action,{limit:LIMIT,order},QUEUES[id].schema as z.ZodType<PageOf>,{asAccount:true,fresh}))).then(rs=>{
   const next:Record<string,PageOf|{error:unknown}>={};
   rs.forEach((r,i)=>{const id=ids[i]!;if(r.status==='fulfilled')next[id]={items:r.value.items,locked:r.value.locked,next:r.value.next,tail:r.value.tail,total:r.value.total};else if(!forbidden(r.reason))next[id]={error:r.reason};});
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
    void call(QUEUES[id].action,{limit:LIMIT,order:'old',...(v.tail?{after:v.tail}:{})},QUEUES[id].schema as z.ZodType<PageOf>,{asAccount:true})
     .then(r=>setData(d=>mergeLive(d,id,'old',r))).catch(()=>{});
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
 const entries:Entry[]=ids.flatMap(id=>itemsOf(id).map(item=>({id,item,key:(QUEUES[id].key as (x:unknown)=>string)(item),...urgencyOf(id,item)})));
 entries.sort((x,y)=>rank(x)-rank(y)||x.since-y.since);
 const urgentN=entries.filter(e=>e.level==='urgent').length;const lateN=entries.filter(e=>e.level==='late').length;
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
  setFocus(f=>f===null?null:entries.length<=1?null:Math.min(f,entries.length-2));
  if(entries.length<=1)setNotice(t('fe.staff.allDone'));
 };
 const locked=ids.some(id=>{const v=data[id];return !!v&&'items' in v&&!!v.locked&&v.items.length>0;});
 const errors=ids.filter(failed);
 const single=tab!=='all'?tab:null;
 const cur=focus!==null?entries[focus]:undefined;
 return <>
  {/* What is shown: everything together, or one queue — picked in a sheet with each queue's count and urgent items. */}
  <SectionLabel action={<Btn kind="text" size="sm" auto icon={RefreshCw} onClick={()=>load(true)}>{t('fe.staff.refresh')}</Btn>}>
   {t('fe.staff.waiting',{n:String(ids.reduce((n,id)=>n+totalOf(id),0))})}
  </SectionLabel>
  <Actions><Btn kind="soft" icon={ListFilter} onClick={()=>setPicking(true)}>{tab==='all'?t('fe.staff.q.all'):queueLabel(tab,t)}</Btn></Actions>
  {(urgentN>0||lateN>0)&&<Chips>{urgentN>0&&<Pill tone="bad">{t('fe.staff.urgentN',{n:String(urgentN)})}</Pill>}{lateN>0&&<Pill tone="wait">{t('fe.staff.lateN',{n:String(lateN)})}</Pill>}</Chips>}
  {picking&&<Sheet title={t('fe.staff.queuesLabel')} onClose={()=>setPicking(false)}>
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
   :<Card list>{entries.map((e,i)=><QueueRow key={e.id+':'+e.key} e={e} onOpen={()=>setFocus(i)}/>)}</Card>}
  {/* One «Ещё» for the list: the next page of every queue in it that has more. */}
  <LoadMore more={ids.some(more)} busy={pageBusy} error={pageError} onMore={()=>ids.filter(more).forEach(loadMore)}/>
  {cur&&focus!==null&&<Sheet full className="st-focus" title={titleOf(cur,t)} sub={t('fe.staff.pos',{n:String(focus+1),all:String(entries.length)})+' · '+t('fe.staff.waits',{time:waited(cur.since,t)})}
   head={<><IconBtn icon={ChevronLeft} kind="ghost" size="sm" label={t('fe.staff.prev')} disabled={focus===0} onClick={()=>setFocus(focus-1)}/>
    <IconBtn icon={ChevronRight} kind="ghost" size="sm" label={t('fe.staff.next')} disabled={focus>=entries.length-1} onClick={()=>setFocus(focus+1)}/></>}
   onClose={()=>setFocus(null)}>
   {cur.id==='dispute'&&<Note>{t('fe.staff.howText')}</Note>}
   <QueueList key={cur.id+':'+cur.key} id={cur.id} items={[cur.item]} onDone={key=>{toast(t('fe.staff.done'),{type:'ok'});done(cur.id,key);}}/>
  </Sheet>}
 </>;
}

type Level='urgent'|'late'|null;
type Entry={id:QueueId,item:unknown,key:string,level:Level,since:number};
const HOUR=3600e3;
/** How long an item may wait before it is late (owner's working rules, pre-launch; one place to change them). */
const SLA:Record<QueueId,number>={dispute:24*HOUR,report:24*HOUR,revision:48*HOUR,media:24*HOUR,community:48*HOUR,event:48*HOUR,age:24*HOUR,photo:24*HOUR,appeal:72*HOUR,notice:24*HOUR,place:7*24*HOUR};
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
  :id==='notice'?o.reason==='minors':false;
 return {level:urgent?'urgent':Date.now()-since>SLA[id]?'late':null,since};
}
const queueLabel=(id:QueueId,t:T)=>id==='photo'?t('fe.pc.staff.tab'):t('fe.staff.q.'+id);
const rank=(e:Entry)=>e.level==='urgent'?0:e.level==='late'?1:2;
const QUEUE_ICON:Record<QueueId,LucideIcon>={dispute:UserX,report:Flag,revision:FilePen,media:Image,community:Users,event:CalendarDays,age:IdCard,photo:BadgeCheck,appeal:Scale,notice:Gavel,place:MapPin};
type T=(k:string,v?:Record<string,string>)=>string;
const nick=(h:unknown)=>typeof h==='string'&&h?'@'+h:'';
function titleOf(e:Entry,t:T):string{
 const o=e.item as Record<string,any>;
 switch(e.id){
  case 'report':return t('fe.staff.reportOn',{what:t('fe.staff.report.type.'+o.targetType).toLowerCase()});
  case 'media':{const p=t('fe.staff.media.purpose.'+o.purpose);return p.startsWith('fe.')?t('fe.staff.q.media'):p;}
  case 'community':return o.name;case 'event':return o.title;
  case 'place':return [o.name_ru,o.name_en].filter(Boolean).join(' / ')||t('fe.staff.q.place');
  case 'photo':return t('fe.pc.staff.tab');
  default:return t('fe.staff.q.'+e.id);
 }
}
function subOf(e:Entry,t:T):string{
 const o=e.item as Record<string,any>;
 switch(e.id){
  case 'report':return [(o.reasons as string[]).map(r=>t('fe.staff.report.reason.'+r)).join(', '),nick(o.author?.handle)].filter(Boolean).join(' · ');
  case 'dispute':return o.excerpt??'';
  case 'revision':return o.live??'';
  case 'media':return o.authorLabel??'';
  case 'community':case 'event':return o.state==='in_review'?t('fe.staff.newItem'):t('fe.staff.changed');
  case 'age':case 'photo':return nick(o.profile?.handle);
  case 'appeal':return [nick(o.handle),o.body].filter(Boolean).join(' · ');
  case 'notice':return t('fe.staff.rule.'+o.reason)+(o.target_url?' · '+o.target_url:'');
  case 'place':return o.country??'';
  default:return '';
 }
}
/** «3 ч», «2 дн»: how long it waits. */
function waited(since:number,t:T){const m=Math.max(1,Math.round((Date.now()-since)/60000));
 return m<60?t('fe.staff.wait.m',{n:String(m)}):m<48*60?t('fe.staff.wait.h',{n:String(Math.round(m/60))}):t('fe.staff.wait.d',{n:String(Math.round(m/1440))});}
/** One line of the work list: what it is, why, how long it waits; urgent / late marked. */
function QueueRow({e,onOpen}:{e:Entry,onOpen:()=>void}){
 const {t}=useI18n();
 return <Row icon={QUEUE_ICON[e.id]} tone={e.level==='urgent'?'l':undefined} title={titleOf(e,t)} sub={subOf(e,t)||undefined} onClick={onOpen}
  val={e.level?<Pill tone={e.level==='urgent'?'bad':'wait'}>{e.level==='urgent'?t('fe.staff.urgent'):waited(e.since,t)}</Pill>:waited(e.since,t)}/>;
}

function QueueList({id,items,onDone}:{id:QueueId,items:unknown[],onDone:(key:string)=>void}){
 const keyOf=QUEUES[id].key as (x:unknown)=>string;
 return <Stack gap={3}>{items.map(x=>{const k=keyOf(x);const done=()=>onDone(k);
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
   case 'place':return <PlaceCard key={k} item={x as PlaceItem} onDone={done}/>;
  }
 })}</Stack>;
}

// ——— shared pieces ———

function useDecide(onDone:()=>void,mapError?:(e:unknown)=>string|null){
 const {call}=useFe();const {t}=useI18n();const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const run=async(action:string,input:Record<string,unknown>)=>{
  setBusy(true);setFailure('');
  try{await call(action,{opId:newOpId(),...input},ok,{asAccount:true});setBusy(false);onDone();}
  catch(e){setFailure(mapError?.(e)??feErrorMessage(e,t));setBusy(false);}
 };
 return {busy,failure,setFailure,run};
}

const useWhen=()=>{const {locale}=useI18n();return (v:string|null|undefined)=>v?new Date(v).toLocaleString(locale==='en'?'en-GB':'ru-RU',{dateStyle:'medium',timeStyle:'short'}):'—';};

const StCard=ReviewCard;
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
function Quote({label,text,to}:{label?:string,text:string,to?:string}){
 const {t}=useI18n();const navigate=useNavigate();
 return <Stack gap={1}>
  <Text size="sm">{label&&<Text as="span" size="xs" tone="mute">{label}: </Text>}{text.slice(0,600)}</Text>
  {to&&<Btn kind="text" size="sm" auto onClick={()=>navigate(to)}>{t('fe.staff.openPost')}</Btn>}
 </Stack>;
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
  {'coverAssetId' in change&&c&&<ReviewPair>
   <ReviewMedia icon={ImageOff} caption={<Note>{t('fe.staff.chg.was')}</Note>}>{c.was?<img src={c.was} alt="" draggable={false}/>:undefined}</ReviewMedia>
   <ReviewMedia icon={ImageOff} caption={<Note>{c.missing?t('fe.staff.comm.noPicture'):t('fe.staff.chg.now')}</Note>}>{c.now?<img src={c.now} alt="" draggable={false}/>:undefined}</ReviewMedia>
  </ReviewPair>}
  <Details data={change}/>
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
function LineField({label,value,onChange,max,...rest}:{label:string,value:string,onChange:(v:string)=>void,max:number}&Pick<React.InputHTMLAttributes<HTMLInputElement>,'inputMode'|'autoCapitalize'|'spellCheck'>){
 const id=useId();
 return <Field id={id} label={label}><Input id={id} value={value} maxLength={max} onChange={e=>onChange(e.target.value)} {...rest}/></Field>;
}

function Failure({text}:{text:string}){return text?<Alert kind="err">{text}</Alert>:null;}

/** The button that opens a private picture on request, with the line saying every look is journaled. */
function OpenLook({label,busy,onClick,err,note}:{label:string,busy:boolean,onClick:()=>void,err?:string,note:string}){
 return <Stack gap={2}><Btn kind="soft" icon={Eye} busy={busy} disabled={busy} onClick={onClick}>{label}</Btn><Note>{note}</Note>{err&&<Failure text={err}/>}</Stack>;
}

const RULES=['minors','threats','private_material','spam','illegal','community_rules'] as const;

// ——— photos ———

const MEDIA_REASONS=['minor','not_a_person','violence','private_material','spam','invalid','other'] as const;
const PUBLIC_ONLY=new Set(['avatar','community','event']);
function MediaCard({item,onDone}:{item:MediaItem,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();const val=useVal();
 const [src,setSrc]=useState<{card?:string|undefined,full?:string|undefined,file?:string|undefined}|null|undefined>(undefined);const [viewing,setViewing]=useState(false);
 const [reason,setReason]=useState<typeof MEDIA_REASONS[number]|''>('');const [ask,setAsk]=useState<'reject'|'csam'|null>(null);
 const d=useDecide(onDone);
 // The full picture only through staff.mediaView: it returns short-lived URLs and journals the look.
 const open=async()=>{setViewing(true);d.setFailure('');
  try{const r=await call('staff.mediaView',{assetId:item.id},viewRes,{asAccount:true});setSrc(r.src);}catch(e){d.setFailure(feErrorMessage(e,t));}finally{setViewing(false);}};
 const purpose=t('fe.staff.media.purpose.'+item.purpose);
 const explicit=!PUBLIC_ONLY.has(item.purpose);
 return <StCard title={purpose.startsWith('fe.')?t('fe.staff.media.purpose.other'):purpose} meta={when(item.createdAt)}>
  <ReviewMedia blur={item.blur} icon={Eye}>
   {src?(item.kind==='video'?<VideoPlayer src={src.file} poster={src.card} w={item.w} h={item.h} label={t('fe.kit.av.video')}/>
    :item.kind==='audio'?<VoiceBubble src={src.file} durationMs={null} mine/>
    :<a href={src.full} target="_blank" rel="noreferrer noopener"><img src={src.card} alt="" draggable={false}/></a>):undefined}
  </ReviewMedia>
  <Kv rows={[[t('fe.staff.media.authorLabel'),item.authorLabel],[t('fe.staff.media.scanner'),val(item.reason)]]}/>
  {src===undefined?<OpenLook label={t('fe.staff.media.open')} busy={viewing} onClick={open} note={t('fe.staff.media.openNote')}/>
   :src===null?<Alert kind="warn">{t('fe.staff.media.noCopies')}</Alert>:null}
  {src!==undefined&&!ask&&<>
   {src&&!explicit&&<Note>{t('fe.staff.media.publicOnly')}</Note>}
   <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={MEDIA_REASONS.map(id=>({id,label:t('fe.staff.media.reason.'+id)}))}/>
   <Actions stack={!!src&&explicit}>
    {src&&<Btn icon={Check} disabled={d.busy} onClick={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'approve',explicit:false})}>{t('fe.staff.media.approveSafe')}</Btn>}
    {src&&explicit&&<Btn kind="soft" icon={Check} disabled={d.busy} onClick={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'approve',explicit:true})}>{t('fe.staff.media.approveExplicit')}</Btn>}
    <Btn kind="soft" icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk('reject')}>{t('fe.staff.reject')}</Btn>
   </Actions>
  </>}
  {ask==='reject'&&<Confirm text={t('fe.staff.media.confirmReject')} busy={d.busy} onNo={()=>setAsk(null)} onYes={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'reject',reason})}/>}
  <Csam busy={d.busy} asking={ask==='csam'} onAsk={()=>setAsk('csam')} onNo={()=>setAsk(null)} onYes={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'reject',reason:'csam_suspected'})}/>
  <Failure text={d.failure}/>
 </StCard>;
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
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [reason,setReason]=useState('');const [ask,setAsk]=useState(false);
 const decide=(decision:'approve'|'reject')=>d.run('staff.communityDecide',{communityId:item.id,rev:item.rev,decision,reason:reason.trim()});
 const privacy=item.privacy?(t('fe.staff.chg.privacy.'+item.privacy).startsWith('fe.')?item.privacy:t('fe.staff.chg.privacy.'+item.privacy)):null;
 const rules=plain(item.rules);
 return <StCard title={item.name} meta={<>{item.state==='in_review'&&<Pill tone="wait">{t('fe.staff.newItem')}</Pill>}{when(item.created_at)}</>}>
  {item.description&&<p className="st-text">{item.description}</p>}
  {!!item.resubmits&&<Alert kind="info">{fill(t('fe.staff.comm.resubmit'),{n:item.resubmits,max:3})}{item.prev_reject_reason&&<> {t('fe.staff.comm.prevReason')}: {item.prev_reject_reason}</>}</Alert>}
  {item.state==='in_review'&&item.cover&&<ReviewMedia icon={ImageOff}>{(item.cover.src?.card??item.cover.src?.thumb)?<img src={item.cover.src.card??item.cover.src.thumb} alt="" draggable={false}/>:undefined}</ReviewMedia>}
  <Kv rows={[[t('fe.staff.comm.privacy'),privacy],[t('fe.staff.topics'),item.topics?.join(', ')],[t('fe.staff.comm.rules'),rules],[t('fe.staff.comm.question'),item.join_question]]}/>
  {rules===null&&<Details data={item.rules}/>}
  <Changes change={item.pending_change} diff={{before:{name:item.name,description:item.description,privacy:item.privacy,joinQuestion:item.join_question,topics:item.topics},
   covers:{was:item.cover?.src?.card??item.cover?.src?.thumb??null,now:item.newCover?.src?.card??item.newCover?.src?.thumb??null,missing:!item.newCover?.src}}}/>
  <TextField label={t('fe.staff.reasonText')} value={reason} onChange={setReason} max={300}/>
  {ask?<Confirm text={t('fe.staff.comm.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide('reject')}/>
   :<Actions><Btn icon={Check} disabled={d.busy} onClick={()=>decide('approve')}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></Actions>}
  <Failure text={d.failure}/>
 </StCard>;
}

function EventCard({item,onDone}:{item:EventItem,onDone:()=>void}){
 const {t,locale}=useI18n();const when=useWhen();const val=useVal();const who=useWho();const d=useDecide(onDone);
 const [reason,setReason]=useState('');const [ask,setAsk]=useState<'reject'|'hide'|null>(null);
 const decide=(decision:'approve'|'reject'|'hide')=>d.run('staff.eventDecide',{eventId:item.id,rev:item.rev,decision,reason:reason.trim()});
 const hideable=item.state==='published';
 return <StCard title={item.title} meta={<>{item.state==='in_review'&&<Pill tone="wait">{t('fe.staff.newItem')}</Pill>}{when(item.created_at)}</>}>
  {item.description&&<p className="st-text">{item.description}</p>}
  <Kv rows={[[t('fe.staff.event.organizer'),item.organizer?.handle?who(item.organizer):null],[t('fe.staff.event.when'),item.starts_at?inTz(item.starts_at,evTz(item),locale,{day:'numeric',month:'short'}).replace('.','')+', '+evRange({starts_at:item.starts_at,...(item.ends_at?{ends_at:item.ends_at}:{}),tz:item.tz},locale):null],
   [t('fe.staff.event.where'),[val(item.format),item.area].filter(Boolean).join(' · ')],[t('fe.staff.event.address'),item.exact_address],[t('fe.staff.event.link'),item.join_url],
   [t('fe.staff.event.price'),item.price?priceText(item.price as {kind:string,amount?:number,currency?:string},t,locale):null],[t('fe.staff.event.requirements'),item.requirements]]}/>
  <Changes change={item.pending_change} diff={{before:{title:item.title,description:item.description,kind:item.kind,format:item.format,area:item.area,exactAddress:item.exact_address,joinUrl:item.join_url,tz:item.tz,
   startsAt:item.starts_at,endsAt:item.ends_at,price:item.price,requirements:item.requirements}}}/>
  <TextField label={t('fe.staff.reasonText')} value={reason} onChange={setReason} max={300}/>
  {ask?<Confirm text={t(ask==='hide'?'fe.staff.event.confirmHide':'fe.staff.event.confirmReject')} busy={d.busy} onNo={()=>setAsk(null)} onYes={()=>decide(ask)}/>
   :<Actions stack={hideable}><Btn icon={Check} disabled={d.busy} onClick={()=>decide('approve')}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy} onClick={()=>setAsk('reject')}>{t('fe.staff.reject')}</Btn>
    {hideable&&<Btn kind="danger" icon={Ban} disabled={d.busy} onClick={()=>setAsk('hide')}>{t('fe.staff.event.hide')}</Btn>}</Actions>}
  <Failure text={d.failure}/>
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
/** A selfie or a document opens on request (staff.ageCheckOpen): a fresh code if needed, one journal line per look. */
function useAgeOpen(checkId:string){
 const {call}=useFe();const {t}=useI18n();
 const [shown,setShown]=useState<z.infer<typeof ageOpenRes>|null>(null);const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const open=async()=>{setBusy(true);setErr('');
  try{setShown(await call('staff.ageCheckOpen',{checkId},ageOpenRes,{asAccount:true}));}catch(e){setErr(feErrorMessage(e,t));}finally{setBusy(false);}};
 const button=(label:string)=><OpenLook label={label} busy={busy} onClick={open} note={t('fe.staff.age.openNote')} err={err}/>;
 return {shown,button};
}
function AgeDocCard({item,onDone}:{item:AgeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const who=useWho();
 const d=useDecide(onDone,e=>forbidden(e)?t('fe.staff.age.own'):null);
 const [reason,setReason]=useState<typeof DOC_REASONS[number]|''>('');const [ask,setAsk]=useState(false);
 const look=useAgeOpen(item.id);const doc=look.shown?.document?.src?.full??look.shown?.document?.src?.card??null;
 return <StCard title={who(item.profile)} meta={when(item.submittedAt)}>
  <Alert kind="info" icon={IdCard}>{t('fe.staff.age.docTask')}</Alert>
  {look.shown?<><ReviewMedia icon={X}>{doc?<img src={doc} alt="" draggable={false}/>:undefined}</ReviewMedia>
  <Note>{doc?t('fe.staff.age.docPrivacy'):t('fe.staff.age.noDoc')}</Note></>:look.button(t('fe.staff.age.openDoc'))}
  <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={DOC_REASONS.map(id=>({id,label:t('fe.staff.age.reason.'+id)}))}/>
  {ask?<Confirm text={t('fe.staff.age.confirmRejectDoc')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:false,reason})}/>
   :<Actions><Btn icon={Check} disabled={d.busy||!doc} onClick={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:true})}>{t('fe.staff.age.approveDoc')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></Actions>}
  <Failure text={d.failure}/>
 </StCard>;
}
function AgeSelfieCard({item,onDone}:{item:AgeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const who=useWho();
 // The server never lets staff decide their own check; its refusal is explained in plain words.
 const d=useDecide(onDone,e=>forbidden(e)?t('fe.staff.age.own'):null);
 const [reason,setReason]=useState<typeof AGE_REASONS[number]|''>('');const [ask,setAsk]=useState(false);
 const look=useAgeOpen(item.id);const selfie=look.shown?.selfie?.src?.full??look.shown?.selfie?.src?.card??null;const photo=look.shown?.photo?.src?.card??look.shown?.photo?.src?.thumb??null;
 const g=item.gesture??'';const gesture=t('fe.staff.age.gesture.'+g);
 return <StCard title={who(item.profile)} meta={when(item.submittedAt)}>
  <Alert kind="info" icon={Eye}>{t('fe.staff.age.gesture')}: <b>{gesture.startsWith('fe.')?t('fe.staff.age.gesture.other'):gesture}</b></Alert>
  {!look.shown?look.button(t('fe.staff.age.openSelfie')):<ReviewPair>
   <ReviewMedia icon={X} caption={<Note>{t('fe.staff.age.selfie')}</Note>}>{selfie?<img src={selfie} alt="" draggable={false}/>:undefined}</ReviewMedia>
   <ReviewMedia icon={Eye} caption={<Note>{t('fe.staff.age.photo')}</Note>}>{photo?<img src={photo} alt="" draggable={false}/>:undefined}</ReviewMedia>
  </ReviewPair>}
  {look.shown&&!selfie&&<Note>{t('fe.staff.age.noSelfie')}</Note>}
  <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={AGE_REASONS.map(id=>({id,label:t('fe.staff.age.reason.'+id)}))}/>
  {ask?<Confirm text={t('fe.staff.age.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:false,reason})}/>
   :<Actions><Btn icon={Check} disabled={d.busy||!selfie} onClick={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:true})}>{t('fe.staff.age.approve')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></Actions>}
  <Failure text={d.failure}/>
 </StCard>;
}

// ——— photo checks (V01 «Фото подтверждено») ———

const PHOTO_REASONS=['gesture_mismatch','face_hidden','not_same_person','bad_photo'] as const;
function PhotoCard({item,onDone}:{item:PhotoItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const who=useWho();
 const d=useDecide(onDone,e=>forbidden(e)?t('fe.pc.staff.own'):null);
 const [reason,setReason]=useState<typeof PHOTO_REASONS[number]|''>('');const [ask,setAsk]=useState(false);
 const selfie=item.selfie?.src?.full??item.selfie?.src?.card??null;
 const photos=(item.photos??[item.photo]).map(p=>p?.src?.card??p?.src?.thumb??null).filter((v):v is string=>!!v);
 const gesture=t('fe.staff.age.gesture.'+item.gesture);
 return <StCard title={who(item.profile)} meta={when(item.submittedAt)}>
  <Alert kind="info" icon={Eye}>{t('fe.staff.age.gesture')}: <b>{gesture.startsWith('fe.')?t('fe.staff.age.gesture.other'):gesture}</b></Alert>
  <Note>{t('fe.pc.staff.compare')}</Note>
  <ReviewPair>
   <ReviewMedia icon={X} caption={<Note>{t('fe.pc.staff.selfie')}</Note>}>{selfie?<img src={selfie} alt="" draggable={false}/>:undefined}</ReviewMedia>
   {(photos.length?photos:[null]).map((src,i)=><ReviewMedia key={i} icon={Eye} caption={<Note>{t('fe.pc.staff.photo')}{photos.length>1?' '+(i+1):''}</Note>}>{src?<img src={src} alt="" draggable={false}/>:undefined}</ReviewMedia>)}
  </ReviewPair>
  {!selfie&&<Note>{t('fe.staff.age.noSelfie')}</Note>}
  <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={PHOTO_REASONS.map(id=>({id,label:t('fe.pc.reason.'+id)}))}/>
  {ask?<Confirm text={t('fe.pc.staff.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.photoCheckDecide',{checkId:item.id,approve:false,reason})}/>
   :<Actions><Btn icon={BadgeCheck} disabled={d.busy||!selfie} onClick={()=>d.run('staff.photoCheckDecide',{checkId:item.id,approve:true})}>{t('fe.pc.staff.approve')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></Actions>}
  <Failure text={d.failure}/>
 </StCard>;
}

// ——— «это я на фото» and post edits (V21 M01) ———

/** «Это я на фото — против» (owner decision 28.10.2026): a claim that could not hide the post comes first as urgent;
 * staff see whether each claimant is marked on the photo, their trust level and strikes (never who they are), a possible
 * attack on the author and the author's explanation. «Подтвердилось» removes the post (asks first); «не подтвердилось»
 * restores it at once and gives each unmarked claimant a strike. */
function DisputeCard({item,onDone}:{item:DisputeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const decide=(restore:boolean)=>d.run('staff.disputeDecide',{postId:item.id,restore,note:note.trim()});
 return <StCard title={t('fe.staff.dispute.title')} danger={!!item.urgent} meta={when(item.opened_at??item.disputed_at)+(item.media?' · '+t('fe.staff.dispute.media',{n:String(item.media)}):'')}>
  <Chips>
   {item.urgent?<Pill tone="hot">{t('fe.staff.dispute.urgent')}</Pill>:<Pill tone="wait">{t('fe.staff.dispute.hidden')}</Pill>}
   {item.attack&&<Pill tone="bad">{t('fe.staff.dispute.attack')}</Pill>}
   <Pill>{t('fe.staff.dispute.claims',{n:String(item.claims.length)})}</Pill>
  </Chips>
  {item.excerpt&&<Quote text={item.excerpt.slice(0,160)} to={'/n/feed/post/'+item.id}/>}
  <Kv rows={[...item.claims.map((c,i):[string,string]=>[t('fe.staff.dispute.claim',{n:String(i+1)}),
   [c.tagged?t('fe.staff.dispute.tagged'):t('fe.staff.dispute.untagged'),t('fe.staff.dispute.trust.'+c.trust),t('fe.staff.dispute.strikes',{n:String(c.strikes)})].join(' · ')]),
   [t('fe.staff.dispute.authorNote'),item.note]]}/>
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.dispute.confirmRemove')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide(false)}/>
   :<Actions><Btn icon={Check} disabled={d.busy} busy={d.busy} onClick={()=>decide(true)}>{t('fe.staff.dispute.restore')}</Btn>
    <Btn kind="danger" icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.dispute.remove')}</Btn></Actions>}
  <Failure text={d.failure}/>
 </StCard>;
}

/** Accounts whose «это я на фото» claims were found false three times: claims are closed for them, staff take a look
 * (the profile opens; «Проверено» takes it off the list). */
function FlaggedClaimants(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [list,setList]=useState<z.infer<typeof flaggedRes>['flagged']>([]);const [failure,setFailure]=useState('');const [busy,setBusy]=useState('');
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
  <Failure text={failure}/>
 </Group>;
}

function RevisionCard({item,onDone}:{item:RevisionItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [rule,setRule]=useState<typeof RULES[number]|''>('');const [ask,setAsk]=useState(false);
 const proposed=item.proposed&&typeof item.proposed==='object'?item.proposed as Record<string,unknown>:null;
 const text=proposed?[proposed.title,proposed.body].filter(v=>typeof v==='string'&&v).join(': '):plain(item.proposed)??'';
 return <StCard title={t('fe.staff.revision.title')} meta={when(item.createdAt)}>
  {item.live&&<Quote label={t('fe.staff.revision.live')} text={item.live.slice(0,160)} to={'/n/feed/post/'+item.postId}/>}
  {text&&<p className="st-text">{text.slice(0,600)}</p>}
  {!text&&<Details data={item.proposed}/>}
  <Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>
  {ask?<Confirm text={t('fe.staff.revision.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.revisionDecide',{revisionId:item.id,decision:'reject',rule})}/>
   :<Actions><Btn icon={Check} disabled={d.busy} busy={d.busy} onClick={()=>d.run('staff.revisionDecide',{revisionId:item.id,decision:'approve'})}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></Actions>}
  <Failure text={d.failure}/>
 </StCard>;
}

// ——— reports, appeals, DSA notices, cities ———

/** One reported photo, clip or voice message: opens on request through staff.mediaView (short-lived URLs, a journal line
 * per look), so the queue itself shows nothing private. */
function Evidence({assetId,kind,label}:{assetId:string,kind:string,label:string}){
 const {call}=useFe();const {t}=useI18n();
 const [src,setSrc]=useState<{card?:string|undefined,full?:string|undefined,file?:string|undefined}|null|undefined>(undefined);
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');
 const open=async()=>{setBusy(true);setErr('');
  try{const r=await call('staff.mediaView',{assetId},viewRes,{asAccount:true});setSrc(r.src);}catch(e){setErr(feErrorMessage(e,t));}finally{setBusy(false);}};
 if(src===undefined)return <OpenLook label={label} busy={busy} onClick={open} note={t('fe.staff.media.openNote')} err={err}/>;
 if(src===null)return <Alert kind="warn">{t('fe.staff.media.noCopies')}</Alert>;
 return <ReviewMedia icon={Eye}>
  {kind==='video'?<VideoPlayer src={src.file} poster={src.card} label={t('fe.kit.av.video')}/>
   :kind==='audio'?<VoiceBubble src={src.file} durationMs={null} mine/>
   :<a href={src.full} target="_blank" rel="noreferrer noopener"><img src={src.card} alt="" draggable={false}/></a>}
 </ReviewMedia>;
}

function ReportCard({item,onDone}:{item:ReportItem,onDone:()=>void}){
 const {t}=useI18n();const val=useVal();const when=useWhen();const d=useDecide(onDone);
 const [rule,setRule]=useState<typeof RULES[number]|''>('');const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const people=item.targetType==='profile'||item.targetType==='conversation';
 const base={targetType:item.targetType,targetId:item.targetId,note:note.trim(),...(item.targetType==='conversation'&&item.author?{reportedProfileId:item.author.id}:{})};
 const author=item.author?[item.author.name,item.author.handle&&'@'+item.author.handle].filter(Boolean).join(' '):null;
 // Whom a measure is for: the reported profile, or in a chat the side it was reported about.
 const target=item.targetType==='profile'?{id:item.targetId,name:author??''}:item.targetType==='conversation'&&item.author?{id:item.author.id,name:author??''}:null;
 const [measures,setMeasures]=useState(false);
 const messages=Array.isArray((item.reported as {messages?:unknown})?.messages)?(item.reported as {messages:{seq:number,body:string,media:boolean,at:string}[]}).messages:null;
 return <StCard title={t('fe.staff.report.type.'+item.targetType)} danger={item.reasons.includes('minor')} meta={when(item.firstAt)}>
  <Chips>{item.reasons.map(r=><Pill key={r} tone={r==='minor'?'bad':undefined}>{(x=>x.startsWith('fe.')?t('fe.staff.report.reason.other'):x)(t('fe.staff.report.reason.'+r))}</Pill>)}
   <Pill>{t('fe.staff.report.count')}: {item.reports}</Pill></Chips>
  {item.excerpt&&<Quote label={t('fe.staff.report.now')} text={item.excerpt}/>}
  <Kv rows={[[t('fe.staff.author'),author],[t('fe.staff.state'),val(item.state)],[t('fe.staff.report.media'),item.media?String(item.media):null],
   [t('fe.staff.report.details'),item.details?.length?item.details.join(' · '):null]]}/>
  {messages&&<Card list>{messages.map(m=><Row key={m.seq} title={m.body||t('fe.staff.report.mediaOnly')} sub={when(m.at)}/>)}</Card>}
  {item.evidence?.map((e,i)=><Evidence key={e.assetId} assetId={e.assetId} kind={e.kind} label={t('fe.staff.report.openMedia',{n:String(i+1),all:String(item.evidence!.length)})}/>)}
  <Details data={item.reported}/>
  {!people&&<Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>}
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.report.confirmRemove')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.reportDecide',{...base,decision:'remove',rule})}/>
   :<Actions><Btn icon={Check} disabled={d.busy} onClick={()=>d.run('staff.reportDecide',{...base,decision:'keep'})}>{t('fe.staff.report.keep')}</Btn>
    {!people&&<Btn kind="danger" icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{t('fe.staff.report.remove')}</Btn>}
    {people&&target&&<Btn kind="danger" icon={Gavel} disabled={d.busy} onClick={()=>setMeasures(true)}>{t('fe.staff.m.open')}</Btn>}</Actions>}
  <Failure text={d.failure}/>
  {measures&&target&&<Measures profileId={target.id} name={target.name} onClose={()=>setMeasures(false)}
   onApplied={()=>{setMeasures(false);void d.run('staff.reportDecide',{...base,decision:'keep',note:(note.trim()||t('fe.staff.m.reportNote')).slice(0,500)});}}/>}
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
 const grave=!!rule&&GRAVE.has(rule);
 // Until lifted only: grave rules. A moderator's suspension is always timed.
 const forever=grave||days==='0';const blocked=kind==='suspend'&&forever&&!lead;
 const dayOpts=[...(grave?[]:DAYS.map(n=>({id:String(n),label:t('fe.staff.m.days.'+n)}))),...(kind==='restrict'||lead?[{id:'0',label:t('fe.staff.m.forever')}]:[])];
 const until=forever?null:new Date(Date.now()+Number(days)*864e5).toLocaleDateString(locale==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long'});
 const effect=t(kind==='restrict'?'fe.staff.m.effect.restrict':'fe.staff.m.effect.suspend',{name})+' '+(until?t('fe.staff.m.until',{date:until}):t('fe.staff.m.untilLifted'));
 const apply=()=>{const timed=forever?{}:{days:Number(days)};
  void d.run(kind==='restrict'?'staff.restrict':'staff.sanction',kind==='restrict'
   ?{profileId,on:true,rule,note:note.trim(),...timed}:{profileId,decision:'suspend',rule,note:note.trim(),...timed});};
 return <Sheet title={t('fe.staff.m.title',{name})} onClose={onClose}>
  <Form>
   <Choice label={t('fe.staff.rule')} value={rule} onChange={v=>{setRule(v);if(GRAVE.has(v))setDays('0');}} disabled={d.busy} options={RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>
   <Choice label={t('fe.staff.m.kind')} value={kind} onChange={v=>{setKind(v);if(v==='suspend'&&!lead&&days==='0')setDays('7');}} disabled={d.busy}
    options={[{id:'restrict' as const,label:t('fe.staff.m.restrict')},{id:'suspend' as const,label:t('fe.staff.m.suspend')}]}/>
   {dayOpts.length>1&&<Choice label={t('fe.staff.m.for')} value={grave?'0':days} onChange={setDays} disabled={d.busy} options={dayOpts}/>}
   {blocked?<Alert kind="warn">{t('fe.staff.m.leadOnly')}</Alert>:rule&&<Note>{effect}</Note>}
   <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
   {ask?<Confirm text={effect} danger busy={d.busy} onNo={()=>setAsk(false)} onYes={apply}/>
    :<Btn kind="danger" icon={Gavel} disabled={d.busy||!rule||blocked} onClick={()=>setAsk(true)}>{t(kind==='restrict'?'fe.staff.m.doRestrict':'fe.staff.m.doSuspend')}</Btn>}
   <Failure text={d.failure}/>
  </Form>
 </Sheet>;
}

function AppealCard({item,onDone}:{item:AppealItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const jw=useJournalWord();const d=useDecide(onDone);
 const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const mine=!!item.decision?.mine;
 const decide=(grant:boolean)=>d.run('staff.appealDecide',{appealId:item.id,grant,note:note.trim()});
 return <StCard title={(item.handle?'@'+item.handle+' · ':'')+t('fe.staff.report.type.'+item.target_type)} meta={when(item.created_at)}>
  <Quote label={t('fe.staff.appeal.body')} text={item.body}/>
  {item.decision&&<Kv rows={[[t('fe.staff.appeal.decision'),jw('action',item.decision.action)+' · '+when(item.decision.at)]]}/>}
  {item.decision&&<Details data={item.decision.detail}/>}
  {mine?<Alert kind="warn">{t('fe.staff.appeal.sameStaff')}</Alert>:<>
   <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
   {ask?<Confirm text={t('fe.staff.appeal.confirmDeny')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide(false)}/>
    :<Actions><Btn icon={Check} disabled={d.busy} onClick={()=>decide(true)}>{t('fe.staff.appeal.grant')}</Btn>
     <Btn kind="soft" icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.appeal.deny')}</Btn></Actions>}
  </>}
  <Failure text={d.failure}/>
 </StCard>;
}

const NOTICE_RULES=[...RULES,'ip'] as const;
function NoticeCard({item,onDone}:{item:NoticeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [rule,setRule]=useState<typeof NOTICE_RULES[number]|''>('');const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const decide=(outcome:'removed'|'kept'|'not_actionable')=>d.run('staff.noticeDecide',{noticeId:item.id,outcome,note:note.trim(),...(outcome==='removed'?{rule}:{})});
 const csam=item.reason==='csam';
 const reason=t('fe.staff.notice.reason.'+item.reason);
 return <StCard title={reason.startsWith('fe.')?t('fe.staff.notice.reason.other'):reason} danger={csam||item.reason==='minors'} meta={when(item.created_at)}>
  {csam&&<Alert kind="err" icon={ShieldAlert}><b>{t('fe.staff.csam.flag')}</b></Alert>}
  <Kv rows={[[t('fe.staff.notice.url'),item.target_url],[t('fe.staff.notice.explanation'),item.explanation]]}/>
  <Note>{item.answerable?t('fe.staff.notice.answerable'):t('fe.staff.notice.anonymous')}</Note>
  <Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={NOTICE_RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.notice.confirmRemoved')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide('removed')}/>
   :<Actions stack>
    <Btn icon={Check} disabled={d.busy} onClick={()=>decide('kept')}>{t('fe.staff.notice.kept')}</Btn>
    <Btn kind="soft" icon={Minus} disabled={d.busy} onClick={()=>decide('not_actionable')}>{t('fe.staff.notice.not_actionable')}</Btn>
    <Btn kind="danger" icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{t('fe.staff.notice.removed')}</Btn></Actions>}
  <Failure text={d.failure}/>
 </StCard>;
}

function PlaceCard({item,onDone}:{item:PlaceItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [ru,setRu]=useState(item.name_ru??'');const [en,setEn]=useState(item.name_en??'');const [ask,setAsk]=useState(false);
 return <StCard title={[item.name_ru,item.name_en].filter(Boolean).join(' / ')||t('fe.staff.place.unnamed')} meta={when(item.created_at)}>
  <Kv rows={[[t('fe.staff.place.country'),item.country],[t('fe.staff.place.used'),String(item.used??0)]]}/>
  <LineField label={t('fe.staff.place.nameRu')} value={ru} max={80} onChange={setRu}/>
  <LineField label={t('fe.staff.place.nameEn')} value={en} max={80} onChange={setEn}/>
  {ask?<Confirm text={t('fe.staff.place.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.placeDecide',{placeId:item.id,decision:'reject'})}/>
   :<Actions><Btn icon={Check} disabled={d.busy} onClick={()=>d.run('staff.placeDecide',{placeId:item.id,decision:'approve',
     ...(ru.trim()?{nameRu:ru.trim()}:{}),...(en.trim()?{nameEn:en.trim()}:{})})}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></Actions>}
  <Failure text={d.failure}/>
 </StCard>;
}

// ——— Premium for dogfooding ———

function Premium(){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();
 const [handle,setHandle]=useState('');const [days,setDays]=useState('30');const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [granted,setGranted]=useState<{id:string,until:string}|null>(null);
 const [entitlement,setEntitlement]=useState('');const [revokeReason,setRevokeReason]=useState('');const [ask,setAsk]=useState(false);const [revoked,setRevoked]=useState('');
 const err=(e:unknown)=>setFailure(forbidden(e)?t('fe.staff.premium.forbidden'):feErrorMessage(e,t));
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
  <Failure text={failure}/>
 </>;
}

// ——— journal ———

const JOURNAL_ACTIONS=['age.view','age.approve','age.reject','photo.view','photo.approve','photo.reject','community.approve','community.reject','event.approve','event.reject','event.hide',
 'media.view','media.approve','media.reject','notice.removed','notice.kept','notice.not_actionable','place.approve','place.reject','premium.grant','premium.revoke','report.keep','report.remove',
 'revision.approve','revision.reject','sanction.suspend','sanction.lift','sanction.expired','restrict.on','restrict.off','restrict.expired','staff.grant','staff.revoke','staff.factorOn','staff.factorLocked',
 'staff.factorReset','staff.recoveryUsed','support.reply','support.close','appeal.grant','appeal.deny','dating.on','dating.off','maintenance.on','maintenance.off',
 'dispute.restore','dispute.remove','dispute.claimantReviewed','dispute.claimantRestricted'] as const;
type JournalRow=z.infer<typeof journalItem>;

function Journal(){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();const jw=useJournalWord();
 // The object the list is narrowed to: its code (sent to the server) and a plain name of it for the reader.
 const [applied,setApplied]=useState<{id:string,label:string}|null>(null);const [code,setCode]=useState('');const [codeOpen,setCodeOpen]=useState(false);
 const [who,setWho]=useState('');const [what,setWhat]=useState('');
 // Staff for the «Кто» filter: everyone seen in the journal so far (the journal is the only place that names them).
 const [staffSeen,setStaffSeen]=useState<Record<string,string>>({});
 const name=(x:JournalRow)=>x.staff_name||(x.staff_handle?'@'+x.staff_handle:t('fe.staff.journal.unknownStaff'));
 const targetId=applied?.id;
 const fetchPage=useCallback((after?:string)=>call('staff.journal',{limit:50,...(targetId?{targetId}:{}),...(who?{staffAccountId:who}:{}),...(what?{what}:{}),...(after?{after}:{})},journalPage,{asAccount:true})
  .then(r=>{setStaffSeen(m=>{const n={...m};for(const x of r.items)if(x.staff_account_id)n[x.staff_account_id]=x.staff_name||(x.staff_handle?'@'+x.staff_handle:t('fe.staff.journal.unknownStaff'));return n;});return r;}),[call,targetId,who,what,t]);
 const {items,error,reload:load,moreProps}=useStaffPage(fetchPage,x=>String(x.id));
 const valid=/^[0-9a-f-]{36}$/i.test(code.trim());
 const staffOptions:[string,string][]=[['',t('fe.staff.journal.anyone')],...Object.entries(staffSeen).map(([id,n])=>[id,n] as [string,string])];
 if(who&&!staffSeen[who])staffOptions.push([who,t('fe.staff.journal.unknownStaff')]);
 return <>
  <Form>
   <Field id="st-j-who" label={t('fe.staff.journal.who')}><Select id="st-j-who" label={t('fe.staff.journal.who')} value={who} options={staffOptions} onChange={setWho}/></Field>
   <Field id="st-j-what" label={t('fe.staff.journal.what')}><Select id="st-j-what" label={t('fe.staff.journal.what')} value={what} options={[['',t('fe.staff.journal.anything')],...JOURNAL_ACTIONS.map(a=>[a,jw('action',a)] as [string,string])]} onChange={setWhat}/></Field>
  </Form>
  {applied?<Alert kind="info" icon={ListFilter} action={<Btn kind="soft" size="sm" auto onClick={()=>setApplied(null)}>{t('fe.staff.journal.showAll')}</Btn>}>{t('fe.staff.journal.onlyThis',{what:applied.label})}</Alert>
   :<Card list><ExpandRow icon={Search} title={t('fe.staff.journal.byCode')} open={codeOpen} onToggle={()=>setCodeOpen(o=>!o)}>
    <Form>
     <LineField label={t('fe.staff.journal.filter')} value={code} max={36} spellCheck={false} onChange={setCode}/>
     <Btn kind="soft" disabled={!valid} onClick={()=>{setApplied({id:code.trim(),label:t('fe.staff.journal.thatCode')});setCode('');setCodeOpen(false);}}>{t('fe.staff.journal.apply')}</Btn>
    </Form>
   </ExpandRow></Card>}
  {error?(forbidden(error)?<Empty compact icon={Lock} title={t('fe.staff.unavailable')} text={t('fe.staff.journal.forbidden')}/>
    :<Alert kind="err" action={<Btn kind="soft" size="sm" auto icon={RefreshCw} onClick={load}>{t('fe.retry')}</Btn>}>{feErrorMessage(error,t)}</Alert>)
   :items===null?<Skel kind="list"/>
   :!items.length?<Empty compact icon={Inbox} title={t('fe.staff.journal.empty')}/>
   :<><Card list>{items.map(x=>{
     const typeWord=x.target_type?jw('type',x.target_type):null;
     const raw=x.target_id||(x.detail!==undefined&&x.detail!==null&&show(x.detail)!=='{}')?{...(x.target_id?{target:x.target_id}:{}),...(x.detail!==undefined&&x.detail!==null?{detail:x.detail}:{})}:null;
     return <Row key={String(x.id)}
      title={(x.staff_account_id?name(x):t('fe.staff.journal.auto'))+' · '+jw('action',x.action)}
      sub={when(x.created_at)+(typeWord?' · '+typeWord:'')}
      extra={raw?<Details data={raw}/>:undefined}
      end={x.target_id?<IconBtn icon={ListFilter} kind="ghost" label={t('fe.staff.journal.sameObject')} onClick={()=>setApplied({id:x.target_id!,label:typeWord??t('fe.staff.journal.thatCode')})}/>:undefined}/>;})}</Card>
    <LoadMore {...moreProps}/></>}
 </>;
}
