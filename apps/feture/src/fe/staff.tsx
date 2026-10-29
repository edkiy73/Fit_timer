import {useCallback,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {BadgeCheck,Ban,Check,ChevronRight,Eye,Gavel,IdCard,Image,ImageOff,Inbox,Lock,RefreshCw,ShieldAlert,ShieldCheck,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Btn,Card,ChoiceChips,Chips,Empty,Field,Group,IconBtn,Input,KeyValues,LoadMore,MoreInfo,Note,Pill,ReviewCard,ReviewMedia,ReviewPair,Row,SectionLabel,Seg,Select,Sheet,Skel,Stack,SubBar,Text,TextArea,VideoPlayer,View,VoiceBubble} from './kit';
import {askFactor,useFe} from './session';
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
 author:opt(z.object({id:z.string(),kind:z.string().optional(),handle:z.string().nullable().optional(),name:z.string().nullable().optional()}).passthrough())});
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
const list=<T extends z.ZodType>(item:T)=>z.object({ok:z.literal(true),items:z.array(item),locked:z.boolean().optional(),next:z.string().nullable().optional(),tail:z.string().nullable().optional()});
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
type Loaded={[K in QueueId]?:{items:Items[K],locked?:boolean|undefined,next?:string|null|undefined,tail?:string|null|undefined}|{error:unknown}};
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
 const [section,setSection]=useState<Section>('queues');
 return <>
  <SubBar title={t('fe.staff.title')} sub={t('fe.staff.sub')} onBack={()=>navigate('/n/me')}/>
  <View className="st nodock">
   {roles===null||(!checked&&!!roles.length)?<Skel kind="list"/>
    :!roles.length?<Empty icon={Lock} title={t('fe.staff.unavailable')} text={t('fe.staff.unavailableText')}/>
    // Second factor first (server/commands/staff.mjs): connect the app, then a code in this sign-in.
    :factor&&!factor.enrolled?<StaffEnrol onDone={reload}/>
    :factor&&!factor.verified?<StaffUnlock factor={factor} onDone={reload}/>
    :<>
     <FactorPromptHost onEnrol={reload}/>
     <Note className="mb12">{t('fe.staff.roles')}: {roles.map(r=>t('fe.staff.role.'+r)).join(', ')}</Note>
     {SECTIONS.filter(id=>can(roles,SECTION_ROLES[id])).length>1&&<Seg small={false} value={section} onChange={setSection} options={SECTIONS.filter(id=>can(roles,SECTION_ROLES[id])).map(id=>({id,label:id==='support'?t('fe.w8.staff.support'):id==='maintenance'?t('fe.w8.staff.maint'):t('fe.staff.section.'+id)}))}/>}
     {(()=>{const ok=SECTIONS.filter(id=>can(roles,SECTION_ROLES[id]));const cur=ok.includes(section)?section:ok[0];
      return cur==='queues'?<Queues/>:cur==='support'?<StaffSupport/>:cur==='premium'?<Premium/>:cur==='maintenance'?<StaffMaintenance/>:cur==='journal'?<Journal/>:cur==='access'?<FactorReset/>:null;})()}
    </>}
  </View>
 </>;
}

type Order='old'|'new';
type PageOf={items:unknown[],locked?:boolean|undefined,next?:string|null|undefined,tail?:string|null|undefined};
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
 const {call}=useFe();const {t}=useI18n();const roles=useStaffRoles();
 const [data,setData]=useState<Loaded|null>(null);const [tab,setTab]=useState<QueueId|null>(null);const [notice,setNotice]=useState('');
 const [order,setOrder]=useState<Order>('old');
 const [pageBusy,setPageBusy]=useState(false);const [pageError,setPageError]=useState<unknown>(null);
 // The live timer reads the screen as it is at each tick, not as it was when the timer was set.
 const live=useRef({data:null as Loaded|null,tab:null as QueueId|null,order:'old' as Order,busy:false});
 live.current={data,tab,order,busy:pageBusy};
 const load=useCallback((fresh=false)=>{
  setData(null);setNotice('');setPageError(null);
  const ids=QUEUE_IDS.filter(id=>can(roles??[],QUEUE_ROLES[id]));
  void Promise.allSettled(ids.map(id=>call(QUEUES[id].action,{limit:LIMIT,order},QUEUES[id].schema as z.ZodType<PageOf>,{asAccount:true,fresh}))).then(rs=>{
   const next:Record<string,PageOf|{error:unknown}>={};
   rs.forEach((r,i)=>{const id=ids[i]!;if(r.status==='fulfilled')next[id]={items:r.value.items,locked:r.value.locked,next:r.value.next,tail:r.value.tail};else if(!forbidden(r.reason))next[id]={error:r.reason};});
   setData(next as Loaded);
   setTab(cur=>cur&&next[cur]?cur:QUEUE_IDS.find(id=>{const v=next[id];return v&&'items' in v&&v.items.length;})??QUEUE_IDS.find(id=>next[id])??null);
  });
 },[call,roles,order]);
 useEffect(()=>{if(roles)load();},[load,roles]);
 useEffect(()=>{
  const timer=setInterval(()=>{
   const s=live.current;
   if(document.hidden||!s.data||!s.tab||s.busy)return;
   const id=s.tab;const v=s.data[id];if(!v||!('items' in v))return;
   const ord=s.order;
   // Oldest first with more pages to load: the rest comes with «Ещё». Otherwise ask for what is new.
   if(ord==='old'&&v.next)return;
   const after=ord==='old'&&v.tail?v.tail:undefined;
   void call(QUEUES[id].action,{limit:LIMIT,order:ord,...(after?{after}:{})},QUEUES[id].schema as z.ZodType<PageOf>,{asAccount:true})
    .then(r=>{if(live.current.order===ord)setData(d=>mergeLive(d,id,ord,r));})
    .catch(()=>{});
  },REFRESH_MS);
  return()=>clearInterval(timer);
 },[call]);
 if(!data)return <Skel kind="list"/>;
 const avail=QUEUE_IDS.filter(id=>data[id]);
 if(!avail.length||!tab)return <Empty icon={Inbox} title={t('fe.staff.noQueues')}/>;
 const count=(id:QueueId)=>{const v=data[id];return v&&'items' in v?(v.items.length>=LIMIT||v.next?v.items.length+'+':String(v.items.length)):'!';};
 // Every queue pages: the next page starts after the cursor of the last item shown, appended without repeats.
 const loadMore=()=>{
  if(!tab)return;const id=tab;const v=data[id];
  if(!v||!('items' in v)||!v.next||pageBusy)return;
  setPageBusy(true);
  void call(QUEUES[id].action,{limit:LIMIT,order,after:v.next},QUEUES[id].schema as z.ZodType<PageOf>,{asAccount:true}).then(r=>{
   setData(d=>{const cur=d?.[id];if(!d||!cur||!('items' in cur))return d;const keyOf=QUEUES[id].key as (x:unknown)=>string;const have=new Set(cur.items.map(keyOf));
    return {...d,[id]:{...cur,items:[...cur.items,...r.items.filter(x=>!have.has(keyOf(x)))],next:r.next??null,tail:r.tail??cur.tail}} as Loaded;});
   setPageError(null);
  }).catch(e=>setPageError(e)).finally(()=>setPageBusy(false));
 };
 const done=(id:QueueId,key:string)=>{
  setNotice(t('fe.staff.done'));
  setData(d=>{if(!d)return d;const v=d[id];if(!v||!('items' in v))return d;
   const keyOf=QUEUES[id].key as (x:unknown)=>string;return {...d,[id]:{items:(v.items as unknown[]).filter(x=>keyOf(x)!==key),next:v.next,tail:v.tail}} as Loaded;});
 };
 const current=data[tab];
 return <>
  {/* The queue switch on the one tab control: more than four queues scroll sideways, each with its count. */}
  <Seg value={tab} onChange={id=>{setTab(id);setNotice('');}} label={t('fe.staff.queuesLabel')} options={avail.map(id=>({id,label:id==='photo'?t('fe.pc.staff.tab'):t('fe.staff.q.'+id),n:count(id)}))}/>
  {(tab==='dispute'||tab==='report')&&<Alert kind="info" icon={ShieldCheck} className="mt12"><b>{t('fe.staff.howTitle')}</b>{t('fe.staff.howText')}</Alert>}
  {tab==='dispute'&&<FlaggedClaimants/>}
  <div className="st-tools">
   <Seg value={order} onChange={o=>setOrder(o)} label={t('fe.staff.order.label')} options={[{id:'old',label:t('fe.staff.order.old')},{id:'new',label:t('fe.staff.order.new')}]}/>
   <Btn kind="text" size="sm" auto icon={RefreshCw} onClick={()=>load(true)}>{t('fe.staff.refresh')}</Btn>
  </div>
  {notice&&<Alert kind="ok" icon={Check} className="mb12">{notice}</Alert>}
  {!current?null:'error' in current?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(current.error,t)}><Btn kind="soft" onClick={()=>load(true)}>{t('fe.retry')}</Btn></Empty>
   :!current.items.length?<Empty icon={Inbox} title={t('fe.staff.qEmpty')} text={t('fe.staff.qEmptyText')}/>
   :current.locked?<Alert kind="info" icon={Lock} action={<Btn kind="soft" size="sm" auto onClick={()=>void askFactor('fresh').then(ok=>{if(ok)load(true);})}>{t('fe.sf.enterCode')}</Btn>}>{t('fe.sf.lockedMedia')}</Alert>
   :<><SectionLabel>{t('fe.staff.inQueue',{n:count(tab)})}</SectionLabel><QueueList id={tab} items={current.items} onDone={key=>done(tab,key)}/>
    <LoadMore more={!!current.next} busy={pageBusy} error={pageError} onMore={loadMore}/></>}
 </>;
}

function QueueList({id,items,onDone}:{id:QueueId,items:unknown[],onDone:(key:string)=>void}){
 const keyOf=QUEUES[id].key as (x:unknown)=>string;
 return <div className="st-list">{items.map(x=>{const k=keyOf(x);const done=()=>onDone(k);
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
 })}</div>;
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

const show=(v:unknown):string=>v===null||v===undefined?'—':typeof v==='string'?v:Array.isArray(v)?v.map(show).join(', '):JSON.stringify(v);

/** What waits for a decision. With `diff` (a community) every field reads «Название: было → стало» in words, and a new
 * cover shows as a picture next to the old one; without it the raw fields are listed. */
function Changes({change,diff}:{change:Record<string,unknown>|null|undefined,diff?:{before:Record<string,unknown>,covers:{was:string|null,now:string|null,missing:boolean}}}){
 const {t}=useI18n();
 if(!change||!Object.keys(change).length)return null;
 if(!diff)return <Alert kind="warn" className="st-block"><b>{t('fe.staff.pendingChange')}</b><br/>
  {Object.entries(change).map(([k,v])=><span key={k} className="st-change"><code>{k}</code>: {show(v)}<br/></span>)}</Alert>;
 const word=(k:string,v:unknown)=>v===null||v===undefined||v===''?t('fe.staff.chg.empty'):k==='privacy'?t('fe.staff.chg.privacy.'+String(v)):show(v);
 return <Alert kind="warn" className="st-block"><b>{t('fe.staff.pendingChange')}</b><br/>
  {Object.entries(change).map(([k,v])=>{
   if(k==='coverAssetId')return <div key={k} className="st-change"><b>{t('fe.staff.chg.coverAssetId')}</b>
    <ReviewPair>
     <ReviewMedia icon={ImageOff} caption={<Note>{t('fe.staff.chg.was')}</Note>}>{diff.covers.was?<img src={diff.covers.was} alt="" draggable={false}/>:undefined}</ReviewMedia>
     <ReviewMedia icon={ImageOff} caption={<Note>{diff.covers.missing?t('fe.staff.comm.noPicture'):t('fe.staff.chg.now')}</Note>}>{diff.covers.now?<img src={diff.covers.now} alt="" draggable={false}/>:undefined}</ReviewMedia>
    </ReviewPair></div>;
   const label=t('fe.staff.chg.'+k);const long=k==='description';
   return <div key={k} className="st-change"><b>{label}</b>{long?<><br/>{t('fe.staff.chg.was')}: {word(k,diff.before[k])}<br/>{t('fe.staff.chg.now')}: {word(k,v)}</>
    :<>: {word(k,diff.before[k])} → {word(k,v)}</>}</div>;
  })}</Alert>;
}

/** Inline confirmation for destructive decisions (no window.confirm). */
function Confirm({text,danger,busy,onYes,onNo}:{text:string,danger?:boolean,busy:boolean,onYes:()=>void,onNo:()=>void}){
 const {t}=useI18n();
 return <div className="st-confirm" role="alertdialog" aria-label={text}>
  {danger?<Alert kind="err" icon={ShieldAlert}>{text}</Alert>:<Alert kind="warn">{text}</Alert>}
  <div className="st-row">
   <Btn kind="danger" size="sm" auto disabled={busy} onClick={onYes} busy={busy}>{t('fe.staff.confirm')}</Btn>
   <Btn kind="text" size="sm" auto disabled={busy} onClick={onNo}>{t('fe.cancel')}</Btn>
  </div>
 </div>;
}

/** One reason / rule from a set. A disabled fieldset turns every chip off while a decision is being saved
 * (the kit's ChoiceChips has no `disabled` of its own). */
function Choice<T extends string>({label,value,options,onChange,disabled}:{label:string,value:T|'',options:{id:T,label:string}[],onChange:(v:T)=>void,disabled?:boolean}){
 return <fieldset className="st-block st-fs" disabled={disabled}><Note>{label}</Note>
  <div className="mt8"><ChoiceChips label={label} value={value||null} onChange={onChange} options={options.map(o=>[o.id,o.label] as const)}/></div></fieldset>;
}

function TextField({label,value,onChange,max,rows=2}:{label:string,value:string,onChange:(v:string)=>void,max:number,rows?:number}){
 const id=useId();const {t}=useI18n();
 // Kit validation layer: a staff note follows the same text rules as the server (characters, lines, long runs).
 const err=value.trim()?textError(t,textRule(max),value):undefined;
 return <div className="st-block st-field"><Field id={id} label={label} error={err}><TextArea id={id} rows={rows} maxLength={max*2} invalid={!!err} value={value} onChange={e=>onChange(e.target.value)}/></Field></div>;
}

/** A labelled one-line field of the staff forms. */
function LineField({label,value,onChange,max,className,...rest}:{label:string,value:string,onChange:(v:string)=>void,max:number,className?:string}&Pick<React.InputHTMLAttributes<HTMLInputElement>,'inputMode'|'autoCapitalize'|'spellCheck'>){
 const id=useId();
 const field=<Field id={id} label={label}><Input id={id} value={value} maxLength={max} onChange={e=>onChange(e.target.value)} {...rest}/></Field>;
 return className?<div className={className}>{field}</div>:field;
}

function Failure({text}:{text:string}){return text?<Alert kind="err" icon={X} className="st-block">{text}</Alert>:null;}

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
 return <StCard title={purpose.startsWith('fe.')?item.purpose:purpose} meta={when(item.createdAt)}>
  <ReviewMedia blur={item.blur} icon={Eye}>
   {src?(item.kind==='video'?<VideoPlayer src={src.file} poster={src.card} w={item.w} h={item.h} label={t('fe.kit.av.video')}/>
    :item.kind==='audio'?<VoiceBubble src={src.file} durationMs={null} mine/>
    :<a href={src.full} target="_blank" rel="noreferrer noopener"><img src={src.card} alt="" draggable={false}/></a>):undefined}
  </ReviewMedia>
  <Kv rows={[[t('fe.staff.media.authorLabel'),item.authorLabel],[t('fe.staff.media.scanner'),val(item.reason)]]}/>
  {src===undefined?<div className="st-block">
    <Btn kind="soft" size="md" icon={Eye} disabled={viewing} busy={viewing} onClick={open}>{t('fe.staff.media.open')}</Btn>
    <Note className="mt8">{t('fe.staff.media.openNote')}</Note></div>
   :src===null?<Note className="st-block">{t('fe.staff.media.noCopies')}</Note>:null}
  {src!==undefined&&!ask&&<>
   {src&&<div className="st-row st-block">
    <Btn size="sm" auto icon={Check} disabled={d.busy} onClick={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'approve',explicit:false})}>{t('fe.staff.media.approveSafe')}</Btn>
    {!PUBLIC_ONLY.has(item.purpose)&&<Btn kind="soft" size="sm" auto disabled={d.busy} onClick={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'approve',explicit:true})}>{t('fe.staff.media.approveExplicit')}</Btn>}
   </div>}
   {src&&PUBLIC_ONLY.has(item.purpose)&&<Note>{t('fe.staff.media.publicOnly')}</Note>}
   <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={MEDIA_REASONS.map(id=>({id,label:t('fe.staff.media.reason.'+id)}))}/>
   <div className="st-row st-block"><Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk('reject')}>{t('fe.staff.reject')}</Btn></div>
  </>}
  {ask==='reject'&&<Confirm text={t('fe.staff.media.confirmReject')} busy={d.busy} onNo={()=>setAsk(null)} onYes={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'reject',reason})}/>}
  <Csam busy={d.busy} asking={ask==='csam'} onAsk={()=>setAsk('csam')} onNo={()=>setAsk(null)} onYes={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'reject',reason:'csam_suspected'})}/>
  <Failure text={d.failure}/>
 </StCard>;
}

/** Escalation of suspected CSAM: its own clearly marked danger action, apart from the ordinary reasons. */
function Csam({busy,asking,onAsk,onYes,onNo}:{busy:boolean,asking:boolean,onAsk:()=>void,onYes:()=>void,onNo:()=>void}){
 const {t}=useI18n();
 return <div className="st-csam">
  {asking?<Confirm danger text={t('fe.staff.csam.confirm')} busy={busy} onYes={onYes} onNo={onNo}/>
   :<Btn kind="danger" size="sm" auto icon={ShieldAlert} disabled={busy} onClick={onAsk}>{t('fe.staff.csam.action')}</Btn>}
 </div>;
}

// ——— communities and events ———

function CommunityCard({item,onDone}:{item:CommItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [reason,setReason]=useState('');const [ask,setAsk]=useState(false);
 const decide=(decision:'approve'|'reject')=>d.run('staff.communityDecide',{communityId:item.id,rev:item.rev,decision,reason:reason.trim()});
 return <StCard title={item.name} meta={<>{item.state==='in_review'&&<Pill tone="wait">{t('fe.staff.newItem')}</Pill>} {when(item.created_at)}</>}>
  {item.description&&<p className="st-text">{item.description}</p>}
  {!!item.resubmits&&<Alert kind="info" className="st-block"><b>{fill(t('fe.staff.comm.resubmit'),{n:item.resubmits,max:3})}</b>
   {item.prev_reject_reason&&<><br/>{t('fe.staff.comm.prevReason')}: {item.prev_reject_reason}</>}</Alert>}
  {item.state==='in_review'&&item.cover&&<ReviewMedia icon={ImageOff}>{(item.cover.src?.card??item.cover.src?.thumb)?<img src={item.cover.src.card??item.cover.src.thumb} alt="" draggable={false}/>:undefined}</ReviewMedia>}
  <Kv rows={[[t('fe.staff.comm.privacy'),item.privacy],['#',item.topics?.join(', ')],[t('fe.staff.comm.rules'),item.rules?show(item.rules):null],[t('fe.staff.comm.question'),item.join_question]]}/>
  <Changes change={item.pending_change} diff={{before:{name:item.name,description:item.description,privacy:item.privacy,joinQuestion:item.join_question},
   covers:{was:item.cover?.src?.card??item.cover?.src?.thumb??null,now:item.newCover?.src?.card??item.newCover?.src?.thumb??null,missing:!item.newCover?.src}}}/>
  <TextField label={t('fe.staff.reasonText')} value={reason} onChange={setReason} max={300}/>
  {ask?<Confirm text={t('fe.staff.comm.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide('reject')}/>
   :<div className="st-row st-block"><Btn size="sm" auto icon={Check} disabled={d.busy} onClick={()=>decide('approve')}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
  <Failure text={d.failure}/>
 </StCard>;
}

function EventCard({item,onDone}:{item:EventItem,onDone:()=>void}){
 const {t,locale}=useI18n();const when=useWhen();const val=useVal();const d=useDecide(onDone);
 const [reason,setReason]=useState('');const [ask,setAsk]=useState<'reject'|'hide'|null>(null);
 const decide=(decision:'approve'|'reject'|'hide')=>d.run('staff.eventDecide',{eventId:item.id,rev:item.rev,decision,reason:reason.trim()});
 return <StCard title={item.title} meta={<>{item.state==='in_review'&&<Pill tone="wait">{t('fe.staff.newItem')}</Pill>} {when(item.created_at)}</>}>
  {item.description&&<p className="st-text">{item.description}</p>}
  <Kv rows={[[t('fe.staff.event.organizer'),item.organizer?.handle?'@'+item.organizer.handle:null],[t('fe.staff.event.when'),item.starts_at?inTz(item.starts_at,evTz(item),locale,{day:'numeric',month:'short'}).replace('.','')+', '+evRange({starts_at:item.starts_at,...(item.ends_at?{ends_at:item.ends_at}:{}),tz:item.tz},locale):null],
   [t('fe.staff.event.where'),[val(item.format),item.area].filter(Boolean).join(' · ')],[t('fe.staff.event.address'),item.exact_address],[t('fe.staff.event.link'),item.join_url],
   [t('fe.staff.event.price'),item.price?priceText(item.price as {kind:string,amount?:number,currency?:string},t,locale):null],[t('fe.staff.event.requirements'),item.requirements]]}/>
  <Changes change={item.pending_change}/>
  <TextField label={t('fe.staff.reasonText')} value={reason} onChange={setReason} max={300}/>
  {ask?<Confirm text={t(ask==='hide'?'fe.staff.event.confirmHide':'fe.staff.event.confirmReject')} busy={d.busy} onNo={()=>setAsk(null)} onYes={()=>decide(ask)}/>
   :<div className="st-row st-block"><Btn size="sm" auto icon={Check} disabled={d.busy} onClick={()=>decide('approve')}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy} onClick={()=>setAsk('reject')}>{t('fe.staff.reject')}</Btn>
    {item.state==='published'&&<Btn kind="danger" size="sm" auto disabled={d.busy} onClick={()=>setAsk('hide')}>{t('fe.staff.event.hide')}</Btn>}</div>}
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
function AgeDocCard({item,onDone}:{item:AgeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();
 const d=useDecide(onDone,e=>forbidden(e)?t('fe.staff.age.own'):null);
 const [reason,setReason]=useState<typeof DOC_REASONS[number]|''>('');const [ask,setAsk]=useState(false);
 const doc=item.document?.src?.full??item.document?.src?.card??null;
 return <StCard title={item.profile.handle?'@'+item.profile.handle:item.profile.id} meta={when(item.submittedAt)}>
  <Alert kind="info" icon={IdCard} className="st-block">{t('fe.staff.age.docTask')}</Alert>
  <div className="st-media st-block">{doc?<img src={doc} alt="" draggable={false}/>:<div className="st-ph"><X/></div>}</div>
  <Note>{doc?t('fe.staff.age.docPrivacy'):t('fe.staff.age.noDoc')}</Note>
  <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={DOC_REASONS.map(id=>({id,label:t('fe.staff.age.reason.'+id)}))}/>
  {ask?<Confirm text={t('fe.staff.age.confirmRejectDoc')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:false,reason})}/>
   :<div className="st-row st-block"><Btn size="sm" auto icon={Check} disabled={d.busy||!doc} onClick={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:true})}>{t('fe.staff.age.approveDoc')}</Btn>
    <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
  <Failure text={d.failure}/>
 </StCard>;
}
function AgeSelfieCard({item,onDone}:{item:AgeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();
 // The server never lets staff decide their own check; its refusal is explained in plain words.
 const d=useDecide(onDone,e=>forbidden(e)?t('fe.staff.age.own'):null);
 const [reason,setReason]=useState<typeof AGE_REASONS[number]|''>('');const [ask,setAsk]=useState(false);
 const selfie=item.selfie?.src?.full??item.selfie?.src?.card??null;const photo=item.photo?.src?.card??item.photo?.src?.thumb??null;
 const g=item.gesture??'';const gesture=t('fe.staff.age.gesture.'+g);
 return <StCard title={item.profile.handle?'@'+item.profile.handle:item.profile.id} meta={when(item.submittedAt)}>
  <Alert kind="info" icon={Eye} className="st-block">{t('fe.staff.age.gesture')}: <b>{gesture.startsWith('fe.')?g:gesture}</b></Alert>
  <div className="st-pair st-block">
   <figure><div className="st-media">{selfie?<img src={selfie} alt="" draggable={false}/>:<div className="st-ph"><X/></div>}</div><figcaption><Note>{t('fe.staff.age.selfie')}</Note></figcaption></figure>
   <figure><div className="st-media">{photo?<img src={photo} alt="" draggable={false}/>:<div className="st-ph"><Eye/></div>}</div><figcaption><Note>{t('fe.staff.age.photo')}</Note></figcaption></figure>
  </div>
  {!selfie&&<Note>{t('fe.staff.age.noSelfie')}</Note>}
  <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={AGE_REASONS.map(id=>({id,label:t('fe.staff.age.reason.'+id)}))}/>
  {ask?<Confirm text={t('fe.staff.age.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:false,reason})}/>
   :<div className="st-row st-block"><Btn size="sm" auto icon={Check} disabled={d.busy||!selfie} onClick={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:true})}>{t('fe.staff.age.approve')}</Btn>
    <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
  <Failure text={d.failure}/>
 </StCard>;
}

// ——— photo checks (V01 «Фото подтверждено») ———

const PHOTO_REASONS=['gesture_mismatch','face_hidden','not_same_person','bad_photo'] as const;
function PhotoCard({item,onDone}:{item:PhotoItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();
 const d=useDecide(onDone,e=>forbidden(e)?t('fe.pc.staff.own'):null);
 const [reason,setReason]=useState<typeof PHOTO_REASONS[number]|''>('');const [ask,setAsk]=useState(false);
 const selfie=item.selfie?.src?.full??item.selfie?.src?.card??null;
 const photos=(item.photos??[item.photo]).map(p=>p?.src?.card??p?.src?.thumb??null).filter((v):v is string=>!!v);
 const gesture=t('fe.staff.age.gesture.'+item.gesture);
 return <StCard title={item.profile.handle?'@'+item.profile.handle:item.profile.id} meta={when(item.submittedAt)}>
  <Alert kind="info" icon={Eye} className="st-block">{t('fe.staff.age.gesture')}: <b>{gesture.startsWith('fe.')?item.gesture:gesture}</b></Alert>
  <Note>{t('fe.pc.staff.compare')}</Note>
  <ReviewPair>
   <ReviewMedia icon={X} caption={<Note>{t('fe.pc.staff.selfie')}</Note>}>{selfie?<img src={selfie} alt="" draggable={false}/>:undefined}</ReviewMedia>
   {(photos.length?photos:[null]).map((src,i)=><ReviewMedia key={i} icon={Eye} caption={<Note>{t('fe.pc.staff.photo')}{photos.length>1?' '+(i+1):''}</Note>}>{src?<img src={src} alt="" draggable={false}/>:undefined}</ReviewMedia>)}
  </ReviewPair>
  {!selfie&&<Note>{t('fe.staff.age.noSelfie')}</Note>}
  <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={PHOTO_REASONS.map(id=>({id,label:t('fe.pc.reason.'+id)}))}/>
  {ask?<Confirm text={t('fe.pc.staff.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.photoCheckDecide',{checkId:item.id,approve:false,reason})}/>
   :<div className="st-row st-block"><Btn size="sm" auto icon={BadgeCheck} disabled={d.busy||!selfie} onClick={()=>d.run('staff.photoCheckDecide',{checkId:item.id,approve:true})}>{t('fe.pc.staff.approve')}</Btn>
    <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
  <Failure text={d.failure}/>
 </StCard>;
}

// ——— «это я на фото» and post edits (V21 M01) ———

/** «Это я на фото — против» (owner decision 28.10.2026): a claim that could not hide the post comes first as urgent;
 * staff see whether each claimant is marked on the photo, their trust level and strikes (never who they are), a possible
 * attack on the author and the author's explanation. «Подтвердилось» removes the post (asks first); «не подтвердилось»
 * restores it at once and gives each unmarked claimant a strike. */
function DisputeCard({item,onDone}:{item:DisputeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const navigate=useNavigate();const d=useDecide(onDone);
 const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const decide=(restore:boolean)=>d.run('staff.disputeDecide',{postId:item.id,restore,note:note.trim()});
 return <Card className="rqcard mod-card">
  <div className="row"><span className="rq-av"><span className="av ini"><ShieldAlert/></span></span><div className="grow"><Text as="b" size="strong">{t('fe.staff.dispute.title')}</Text>
   <Note>{when(item.opened_at??item.disputed_at)}{item.media?' · '+t('fe.staff.dispute.media',{n:String(item.media)}):''}</Note></div>
   {!!item.media&&<span className="ico v" aria-hidden="true"><Image/></span>}</div>
  <Chips className="st-block">
   {item.urgent?<Pill tone="hot">{t('fe.staff.dispute.urgent')}</Pill>:<Pill tone="wait">{t('fe.staff.dispute.hidden')}</Pill>}
   {item.attack&&<Pill tone="bad">{t('fe.staff.dispute.attack')}</Pill>}
   <Pill>{t('fe.staff.dispute.claims',{n:String(item.claims.length)})}</Pill>
  </Chips>
  {item.excerpt&&<button type="button" className="mod-x" onClick={()=>navigate('/n/feed/post/'+item.id)}>{item.excerpt.slice(0,160)}</button>}
  <div className="st-block"><KeyValues rows={item.claims.map((c,i)=>[t('fe.staff.dispute.claim',{n:String(i+1)}),
   [c.tagged?t('fe.staff.dispute.tagged'):t('fe.staff.dispute.untagged'),t('fe.staff.dispute.trust.'+c.trust),t('fe.staff.dispute.strikes',{n:String(c.strikes)})].join(' · ')])}/></div>
  {item.note&&<div className="st-block"><KeyValues rows={[[t('fe.staff.dispute.authorNote'),item.note]]}/></div>}
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.dispute.confirmRemove')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide(false)}/>
   :<div className="row g8 mt12"><Btn kind="danger" size="md" disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.dispute.remove')}</Btn>
    <Btn kind="soft" size="md" disabled={d.busy} busy={d.busy} onClick={()=>decide(true)}>{t('fe.staff.dispute.restore')}</Btn></div>}
  <Failure text={d.failure}/>
 </Card>;
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
 const {t}=useI18n();const when=useWhen();const navigate=useNavigate();const d=useDecide(onDone);
 const [rule,setRule]=useState<typeof RULES[number]|''>('');const [ask,setAsk]=useState(false);
 const proposed=item.proposed&&typeof item.proposed==='object'?item.proposed as Record<string,unknown>:null;
 const text=proposed?[proposed.title,proposed.body].filter(v=>typeof v==='string'&&v).join(': '):show(item.proposed);
 return <Card className="rqcard mod-card">
  <div className="row"><div className="grow"><Text as="b" size="strong">{t('fe.staff.revision.title')}</Text><Note>{when(item.createdAt)}</Note></div></div>
  {item.live&&<button type="button" className="mod-x" onClick={()=>navigate('/n/feed/post/'+item.postId)}><Text as="span" size="xs" tone="mute">{t('fe.staff.revision.live')}: </Text>{item.live.slice(0,160)}</button>}
  {text&&<p className="mod-r">{text.slice(0,600)}</p>}
  <Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>
  {ask?<Confirm text={t('fe.staff.revision.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.revisionDecide',{revisionId:item.id,decision:'reject',rule})}/>
   :<div className="row g8 mt12"><Btn size="md" icon={Check} disabled={d.busy} busy={d.busy} onClick={()=>d.run('staff.revisionDecide',{revisionId:item.id,decision:'approve'})}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" size="md" icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
  <Failure text={d.failure}/>
 </Card>;
}

// ——— reports, appeals, DSA notices, cities ———

function ReportCard({item,onDone}:{item:ReportItem,onDone:()=>void}){
 const {t}=useI18n();const val=useVal();const when=useWhen();const d=useDecide(onDone);
 const [rule,setRule]=useState<typeof RULES[number]|''>('');const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const people=item.targetType==='profile'||item.targetType==='conversation';
 const base={targetType:item.targetType,targetId:item.targetId,note:note.trim(),...(item.targetType==='conversation'&&item.author?{reportedProfileId:item.author.id}:{})};
 const author=item.author?[item.author.name,item.author.handle&&'@'+item.author.handle].filter(Boolean).join(' '):null;
 // Whom a measure is for: the reported profile, or in a chat the side it was reported about.
 const target=item.targetType==='profile'?{id:item.targetId,name:author??''}:item.targetType==='conversation'&&item.author?{id:item.author.id,name:author??''}:null;
 const [measures,setMeasures]=useState(false);
 return <StCard title={t('fe.staff.report.type.'+item.targetType)} danger={item.reasons.includes('minor')} meta={when(item.firstAt)}>
  <Chips className="st-block">{item.reasons.map(r=><Pill key={r} tone={r==='minor'?'bad':undefined}>{t('fe.staff.report.reason.'+r)}</Pill>)}
   <Pill>{t('fe.staff.report.count')}: {item.reports}</Pill></Chips>
  {item.excerpt&&<p className="st-text"><Text as="span" size="xs" tone="mute">{t('fe.staff.report.now')}: </Text>{item.excerpt}</p>}
  <Kv rows={[[t('fe.staff.author'),author],[t('fe.staff.state'),val(item.state)],[t('fe.staff.report.media'),item.media?String(item.media):null],
   [t('fe.staff.report.details'),item.details?.length?item.details.join(' · '):null],[t('fe.staff.report.snapshot'),item.reported?<MoreInfo label={t('fe.staff.more')} hideLabel={t('fe.staff.moreHide')}>{show(item.reported)}</MoreInfo>:null]]}/>
  {!people&&<Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>}
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.report.confirmRemove')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.reportDecide',{...base,decision:'remove',rule})}/>
   :<div className="st-row st-block"><Btn kind="soft" size="sm" auto icon={Check} disabled={d.busy} onClick={()=>d.run('staff.reportDecide',{...base,decision:'keep'})}>{t('fe.staff.report.keep')}</Btn>
    {!people&&<Btn kind="danger" size="sm" auto icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{t('fe.staff.report.remove')}</Btn>}
    {people&&target&&<Btn kind="danger" size="sm" auto icon={Gavel} disabled={d.busy} onClick={()=>setMeasures(true)}>{t('fe.staff.m.open')}</Btn>}</div>}
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
  <Stack gap={4}>
   <Choice label={t('fe.staff.rule')} value={rule} onChange={v=>{setRule(v);if(GRAVE.has(v))setDays('0');}} disabled={d.busy} options={RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>
   <Choice label={t('fe.staff.m.kind')} value={kind} onChange={v=>{setKind(v);if(v==='suspend'&&!lead&&days==='0')setDays('7');}} disabled={d.busy}
    options={[{id:'restrict' as const,label:t('fe.staff.m.restrict')},{id:'suspend' as const,label:t('fe.staff.m.suspend')}]}/>
   {dayOpts.length>1&&<Choice label={t('fe.staff.m.for')} value={grave?'0':days} onChange={setDays} disabled={d.busy} options={dayOpts}/>}
   {blocked?<Alert kind="warn">{t('fe.staff.m.leadOnly')}</Alert>:rule&&<Note>{effect}</Note>}
   <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
   {ask?<Confirm text={effect} danger busy={d.busy} onNo={()=>setAsk(false)} onYes={apply}/>
    :<Btn kind="danger" icon={Gavel} disabled={d.busy||!rule||blocked} onClick={()=>setAsk(true)}>{t(kind==='restrict'?'fe.staff.m.doRestrict':'fe.staff.m.doSuspend')}</Btn>}
   <Failure text={d.failure}/>
  </Stack>
 </Sheet>;
}

function AppealCard({item,onDone}:{item:AppealItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const mine=!!item.decision?.mine;
 const decide=(grant:boolean)=>d.run('staff.appealDecide',{appealId:item.id,grant,note:note.trim()});
 return <StCard title={(item.handle?'@'+item.handle+' · ':'')+t('fe.staff.report.type.'+item.target_type)} meta={when(item.created_at)}>
  <p className="st-text"><Text as="span" size="xs" tone="mute">{t('fe.staff.appeal.body')}: </Text>{item.body}</p>
  {item.decision&&<Kv rows={[[t('fe.staff.appeal.decision'),item.decision.action+' · '+when(item.decision.at)],['',item.decision.detail?show(item.decision.detail):null]]}/>}
  {mine?<Alert kind="warn" className="st-block">{t('fe.staff.appeal.sameStaff')}</Alert>:<>
   <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
   {ask?<Confirm text={t('fe.staff.appeal.confirmDeny')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide(false)}/>
    :<div className="st-row st-block"><Btn size="sm" auto icon={Check} disabled={d.busy} onClick={()=>decide(true)}>{t('fe.staff.appeal.grant')}</Btn>
     <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.appeal.deny')}</Btn></div>}
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
 return <StCard title={t('fe.staff.notice.reason.'+item.reason)} danger={csam||item.reason==='minors'} meta={when(item.created_at)}>
  {csam&&<Alert kind="err" icon={ShieldAlert} className="st-block"><b>{t('fe.staff.csam.flag')}</b></Alert>}
  <Kv rows={[[t('fe.staff.notice.url'),item.target_url],[t('fe.staff.notice.explanation'),item.explanation]]}/>
  <Note className="st-block">{item.answerable?t('fe.staff.notice.answerable'):t('fe.staff.notice.anonymous')}</Note>
  <Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={NOTICE_RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.notice.confirmRemoved')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide('removed')}/>
   :<div className="st-row st-block">
    <Btn kind="danger" size="sm" auto icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{t('fe.staff.notice.removed')}</Btn>
    <Btn kind="soft" size="sm" auto disabled={d.busy} onClick={()=>decide('kept')}>{t('fe.staff.notice.kept')}</Btn>
    <Btn kind="text" size="sm" auto disabled={d.busy} onClick={()=>decide('not_actionable')}>{t('fe.staff.notice.not_actionable')}</Btn></div>}
  <Failure text={d.failure}/>
 </StCard>;
}

function PlaceCard({item,onDone}:{item:PlaceItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [ru,setRu]=useState(item.name_ru??'');const [en,setEn]=useState(item.name_en??'');const [ask,setAsk]=useState(false);
 return <StCard title={[item.name_ru,item.name_en].filter(Boolean).join(' / ')||'—'} meta={when(item.created_at)}>
  <Kv rows={[[t('fe.staff.place.country'),item.country],[t('fe.staff.place.used'),String(item.used??0)]]}/>
  <div className="st-row st-block">
   <LineField label={t('fe.staff.place.nameRu')} value={ru} max={80} onChange={setRu}/>
   <LineField label={t('fe.staff.place.nameEn')} value={en} max={80} onChange={setEn}/>
  </div>
  {ask?<Confirm text={t('fe.staff.place.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.placeDecide',{placeId:item.id,decision:'reject'})}/>
   :<div className="st-row st-block"><Btn size="sm" auto icon={Check} disabled={d.busy} onClick={()=>d.run('staff.placeDecide',{placeId:item.id,decision:'approve',
     ...(ru.trim()?{nameRu:ru.trim()}:{}),...(en.trim()?{nameEn:en.trim()}:{})})}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
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
  <Group title={t('fe.staff.premium.grantTitle')}>
   <Card form>
    <Note>{t('fe.staff.premium.grantNote')}</Note>
    <div className="st-row st-block">
     <LineField label={t('fe.staff.premium.handle')} value={handle} max={21} autoCapitalize="none" onChange={setHandle}/>
     <LineField className="st-days" label={t('fe.staff.premium.days')} inputMode="numeric" value={days} max={3} onChange={v=>setDays(v.replace(/\D/g,''))}/>
    </div>
    <TextField label={t('fe.staff.premium.reason')} value={reason} onChange={setReason} max={300}/>
    <div className="st-row st-block"><Btn size="md" auto disabled={busy||!canGrant} onClick={grant} busy={busy}>{t('fe.staff.premium.grant')}</Btn></div>
    {granted&&<Alert kind="ok" icon={Check} className="st-block">{t('fe.staff.premium.granted',{until:when(granted.until)})}<br/><code>{granted.id}</code></Alert>}
   </Card>
  </Group>
  <Group title={t('fe.staff.premium.revokeTitle')}>
   <Card form>
    <Note>{t('fe.staff.premium.revokeNote')}</Note>
    <LineField className="st-block st-field" label={t('fe.staff.premium.entitlement')} value={entitlement} max={36} autoCapitalize="none" spellCheck={false} onChange={setEntitlement}/>
    <TextField label={t('fe.staff.premium.reason')} value={revokeReason} onChange={setRevokeReason} max={300}/>
    {ask?<Confirm text={t('fe.staff.premium.confirmRevoke')} busy={busy} onNo={()=>setAsk(false)} onYes={revoke}/>
     :<div className="st-row st-block"><Btn kind="danger" size="md" auto disabled={busy||!uuid||revokeReason.trim().length<3} onClick={()=>setAsk(true)}>{t('fe.staff.premium.revoke')}</Btn></div>}
    {revoked&&<Alert kind="ok" icon={Check} className="st-block">{revoked}</Alert>}
   </Card>
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
 const {call}=useFe();const {t}=useI18n();const when=useWhen();
 const [filter,setFilter]=useState('');const [applied,setApplied]=useState('');
 const [who,setWho]=useState('');const [what,setWhat]=useState('');
 // Staff for the «Кто» filter: everyone seen in the journal so far (the journal is the only place that names them).
 const [staffSeen,setStaffSeen]=useState<Record<string,string>>({});
 const word=(v:string,k:string)=>{const x=t(k+v);return x===k+v?v:x;};
 const fetchPage=useCallback((after?:string)=>call('staff.journal',{limit:50,...(applied?{targetId:applied}:{}),...(who?{staffAccountId:who}:{}),...(what?{what}:{}),...(after?{after}:{})},journalPage,{asAccount:true})
  .then(r=>{setStaffSeen(m=>{const n={...m};for(const x of r.items)if(x.staff_account_id)n[x.staff_account_id]=name(x);return n;});return r;}),[call,applied,who,what]);
 const {items,error,reload:load,moreProps}=useStaffPage(fetchPage,x=>String(x.id));
 const name=(x:JournalRow)=>x.staff_name||(x.staff_handle?'@'+x.staff_handle:t('fe.staff.journal.unknownStaff'));
 const valid=!filter.trim()||/^[0-9a-f-]{36}$/i.test(filter.trim());
 const staffOptions:[string,string][]=[['',t('fe.staff.journal.anyone')],...Object.entries(staffSeen).map(([id,n])=>[id,n] as [string,string])];
 if(who&&!staffSeen[who])staffOptions.push([who,who.slice(0,8)]);
 return <>
  <div className="st-row mt8">
   <LineField label={t('fe.staff.journal.filter')} value={filter} max={36} spellCheck={false} onChange={setFilter}/>
   <Btn kind="soft" size="md" auto disabled={!valid} onClick={()=>{const v=filter.trim();if(v===applied)load();else setApplied(v);}}>{t('fe.staff.journal.apply')}</Btn>
  </div>
  <div className="st-row">
   <Field id="st-j-who" label={t('fe.staff.journal.who')}><Select id="st-j-who" label={t('fe.staff.journal.who')} value={who} options={staffOptions} onChange={setWho}/></Field>
   <Field id="st-j-what" label={t('fe.staff.journal.what')}><Select id="st-j-what" label={t('fe.staff.journal.what')} value={what} options={[['',t('fe.staff.journal.anything')],...JOURNAL_ACTIONS.map(a=>[a,word(a,'fe.staff.journal.action.')] as [string,string])]} onChange={setWhat}/></Field>
  </div>
  {error?(forbidden(error)?<Empty icon={Lock} title={t('fe.staff.unavailable')} text={t('fe.staff.journal.forbidden')}/>
    :<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>)
   :items===null?<Skel kind="list"/>
   :!items.length?<Empty icon={Inbox} title={t('fe.staff.journal.empty')}/>
   :<><Card list className="mt8">{items.map(x=><Row key={String(x.id)}
     title={<>{x.staff_account_id?name(x):t('fe.staff.journal.auto')} · {word(x.action,'fe.staff.journal.action.')}{x.target_type?' · '+word(x.target_type,'fe.staff.journal.type.'):''}</>}
     sub={<>{when(x.created_at)}{x.target_id?' · '+x.target_id:''}</>}
     extra={x.detail!==undefined&&x.detail!==null&&show(x.detail)!=='{}'?<MoreInfo label={t('fe.staff.more')} hideLabel={t('fe.staff.moreHide')}>{show(x.detail)}</MoreInfo>:undefined}
     end={<IconBtn icon={ChevronRight} kind="ghost" label={t('fe.staff.journal.apply')} disabled={!x.target_id} onClick={()=>{if(x.target_id){setFilter(x.target_id);setApplied(x.target_id);}}}/>}/>)}</Card>
    <LoadMore {...moreProps}/></>}
 </>;
}
