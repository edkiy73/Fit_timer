import {useCallback,useEffect,useId,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {BadgeCheck,Ban,Check,ChevronRight,Eye,IdCard,Image,Inbox,Lock,RefreshCw,ShieldAlert,ShieldCheck,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Btn,Card,ChoiceChips,Chips,Empty,Field,Group,IconBtn,Input,KeyValues,Note,Pill,ReviewCard,ReviewMedia,ReviewPair,Row,SectionLabel,Seg,Skel,SubBar,Text,TextArea,VideoPlayer,View,VoiceBubble} from './kit';
import {useFe} from './session';
import {StaffSupport} from './support';
import {StaffMaintenance} from './maintenance';

/** Staff area (/n/staff, S4 moderation): review queues with decisions, Premium for dogfooding, the journal.
 * Roles are enforced by the server only; a queue the server refuses (403) is simply not shown. */
const ok=z.object({ok:z.literal(true)}).passthrough();
const meRes=z.object({ok:z.literal(true),roles:z.array(z.string())});
const ts=z.string().nullable().optional();
const opt=<T extends z.ZodType>(s:T)=>s.nullable().optional();

const mediaItem=z.object({id:z.uuid(),purpose:z.string(),kind:z.string(),authorLabel:opt(z.string()),reason:opt(z.string()),createdAt:ts,w:opt(z.number()),h:opt(z.number()),blur:opt(z.string())});
const viewRes=z.object({ok:z.literal(true),src:z.object({card:z.string().optional(),full:z.string().optional(),file:z.string().optional()}).nullable()});
const commItem=z.object({id:z.uuid(),rev:z.number(),name:z.string(),description:opt(z.string()),topics:opt(z.array(z.string())),privacy:opt(z.string()),join_question:opt(z.string()),
 rules:z.unknown().optional(),state:z.string(),pending_change:z.record(z.string(),z.unknown()).nullable().optional(),created_at:ts}).passthrough();
const eventItem=z.object({id:z.uuid(),rev:z.number(),title:z.string(),kind:opt(z.string()),description:opt(z.string()),format:opt(z.string()),area:opt(z.string()),exact_address:opt(z.string()),
 join_url:opt(z.string()),starts_at:ts,ends_at:ts,price:z.unknown().optional(),requirements:opt(z.string()),state:z.string(),pending_change:z.record(z.string(),z.unknown()).nullable().optional(),
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
const journalItem=z.object({id:z.union([z.string(),z.number()]),staff_account_id:z.string(),action:z.string(),target_type:opt(z.string()),target_id:opt(z.string()),detail:z.unknown().optional(),created_at:ts});
const disputeItem=z.object({id:z.uuid(),disputed_at:ts,excerpt:opt(z.string()),media:opt(z.number())});
const revisionItem=z.object({id:z.uuid(),postId:z.uuid(),createdAt:ts,live:opt(z.string()),proposed:z.unknown().optional()});
const grantRes=z.object({ok:z.literal(true),id:z.string(),until:z.string()});

type MediaItem=z.infer<typeof mediaItem>;type CommItem=z.infer<typeof commItem>;type EventItem=z.infer<typeof eventItem>;type AgeItem=z.infer<typeof ageItem>;type PhotoItem=z.infer<typeof photoItem>;
type DisputeItem=z.infer<typeof disputeItem>;type RevisionItem=z.infer<typeof revisionItem>;type ReportItem=z.infer<typeof reportItem>;type AppealItem=z.infer<typeof appealItem>;type NoticeItem=z.infer<typeof noticeItem>;type PlaceItem=z.infer<typeof placeItem>;
type Items={dispute:DisputeItem[],report:ReportItem[],revision:RevisionItem[],media:MediaItem[],community:CommItem[],event:EventItem[],age:AgeItem[],photo:PhotoItem[],appeal:AppealItem[],notice:NoticeItem[],place:PlaceItem[]};
type QueueId=keyof Items;
const list=<T extends z.ZodType>(item:T)=>z.object({ok:z.literal(true),items:z.array(item)});
const QUEUES:{[K in QueueId]:{action:string,schema:z.ZodType<{items:Items[K]}>,key:(x:Items[K][number])=>string}}={
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
const SECTION_ROLES={queues:['owner','lead','moderator','verifier'],support:['owner','lead','moderator','support'],premium:['owner','lead'],maintenance:['owner','lead'],journal:['owner','lead','auditor']} as const;
const SECTIONS=['queues','support','premium','maintenance','journal'] as const;
type Section=typeof SECTIONS[number];
const can=(roles:readonly string[],need:readonly string[]|undefined)=>!need||roles.some(r=>need.includes(r));
const LIMIT=50;
type Loaded={[K in QueueId]?:{items:Items[K]}|{error:unknown}};
const forbidden=(e:unknown)=>e instanceof FeError&&e.code==='forbidden';

/** Staff roles of the signed-in account; [] for everyone else (and while loading: null). */
export function useStaffRoles(){
 const {call}=useFe();const [roles,setRoles]=useState<string[]|null>(null);
 useEffect(()=>{const ctl=new AbortController();
  call('staff.me',{},meRes,{asAccount:true,signal:ctl.signal}).then(r=>setRoles(r.roles)).catch(()=>{if(!ctl.signal.aborted)setRoles([]);});
  return ()=>ctl.abort();},[call]);
 return roles;
}

/** Me header button, shown only to staff. */
export function StaffEntry(){
 const roles=useStaffRoles();const {t}=useI18n();const navigate=useNavigate();
 if(!roles?.length)return null;
 return <IconBtn icon={ShieldCheck} label={t('fe.staff.entry')} title={t('fe.staff.entryText')} onClick={()=>navigate('/n/staff')}/>;
}

export function StaffScreen(){
 const {t}=useI18n();const roles=useStaffRoles();const navigate=useNavigate();
 const [section,setSection]=useState<Section>('queues');
 return <>
  <SubBar title={t('fe.staff.title')} sub={t('fe.staff.sub')} onBack={()=>navigate('/n/me')}/>
  <View className="st nodock">
   {roles===null?<Skel kind="list"/>
    :!roles.length?<Empty icon={Lock} title={t('fe.staff.unavailable')} text={t('fe.staff.unavailableText')}/>
    :<>
     <Note className="mb12">{t('fe.staff.roles')}: {roles.map(r=>t('fe.staff.role.'+r)).join(', ')}</Note>
     {SECTIONS.filter(id=>can(roles,SECTION_ROLES[id])).length>1&&<Seg small={false} value={section} onChange={setSection} options={SECTIONS.filter(id=>can(roles,SECTION_ROLES[id])).map(id=>({id,label:id==='support'?t('fe.w8.staff.support'):id==='maintenance'?t('fe.w8.staff.maint'):t('fe.staff.section.'+id)}))}/>}
     {(()=>{const ok=SECTIONS.filter(id=>can(roles,SECTION_ROLES[id]));const cur=ok.includes(section)?section:ok[0];
      return cur==='queues'?<Queues/>:cur==='support'?<StaffSupport/>:cur==='premium'?<Premium/>:cur==='maintenance'?<StaffMaintenance/>:cur==='journal'?<Journal/>:null;})()}
    </>}
  </View>
 </>;
}

function Queues(){
 const {call}=useFe();const {t}=useI18n();const roles=useStaffRoles();
 const [data,setData]=useState<Loaded|null>(null);const [tab,setTab]=useState<QueueId|null>(null);const [notice,setNotice]=useState('');
 const load=useCallback((fresh=false)=>{
  setData(null);setNotice('');
  const ids=QUEUE_IDS.filter(id=>can(roles??[],QUEUE_ROLES[id]));
  void Promise.allSettled(ids.map(id=>call(QUEUES[id].action,{limit:LIMIT},QUEUES[id].schema as z.ZodType<{items:unknown[]}>,{asAccount:true,fresh}))).then(rs=>{
   const next:Record<string,{items:unknown[]}|{error:unknown}>={};
   rs.forEach((r,i)=>{const id=ids[i]!;if(r.status==='fulfilled')next[id]={items:r.value.items};else if(!forbidden(r.reason))next[id]={error:r.reason};});
   setData(next as Loaded);
   setTab(cur=>cur&&next[cur]?cur:QUEUE_IDS.find(id=>{const v=next[id];return v&&'items' in v&&v.items.length;})??QUEUE_IDS.find(id=>next[id])??null);
  });
 },[call,roles]);
 useEffect(()=>{if(roles)load();},[load,roles]);
 if(!data)return <Skel kind="list"/>;
 const avail=QUEUE_IDS.filter(id=>data[id]);
 if(!avail.length||!tab)return <Empty icon={Inbox} title={t('fe.staff.noQueues')}/>;
 const count=(id:QueueId)=>{const v=data[id];return v&&'items' in v?(v.items.length>=LIMIT?LIMIT+'+':String(v.items.length)):'!';};
 const done=(id:QueueId,key:string)=>{
  setNotice(t('fe.staff.done'));
  setData(d=>{if(!d)return d;const v=d[id];if(!v||!('items' in v))return d;
   const keyOf=QUEUES[id].key as (x:unknown)=>string;return {...d,[id]:{items:(v.items as unknown[]).filter(x=>keyOf(x)!==key)}};});
 };
 const current=data[tab];
 return <>
  {/* The queue switch on the one tab control: more than four queues scroll sideways, each with its count. */}
  <Seg value={tab} onChange={id=>{setTab(id);setNotice('');}} label={t('fe.staff.queuesLabel')} options={avail.map(id=>({id,label:id==='photo'?t('fe.pc.staff.tab'):t('fe.staff.q.'+id),n:count(id)}))}/>
  {(tab==='dispute'||tab==='report')&&<Alert kind="info" icon={ShieldCheck} className="mt12"><b>{t('fe.staff.howTitle')}</b>{t('fe.staff.howText')}</Alert>}
  <div className="st-tools"><Btn kind="text" size="sm" auto icon={RefreshCw} onClick={()=>load(true)}>{t('fe.staff.refresh')}</Btn></div>
  {notice&&<Alert kind="ok" icon={Check} className="mb12">{notice}</Alert>}
  {!current?null:'error' in current?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(current.error,t)}><Btn kind="soft" onClick={()=>load(true)}>{t('fe.retry')}</Btn></Empty>
   :!current.items.length?<Empty icon={Inbox} title={t('fe.staff.qEmpty')} text={t('fe.staff.qEmptyText')}/>
   :<><SectionLabel>{t('fe.staff.inQueue',{n:count(tab)})}</SectionLabel><QueueList id={tab} items={current.items} onDone={key=>done(tab,key)}/></>}
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

const show=(v:unknown):string=>v===null||v===undefined?'—':typeof v==='string'?v:Array.isArray(v)?v.map(show).join(', '):JSON.stringify(v);

function Changes({change}:{change:Record<string,unknown>|null|undefined}){
 const {t}=useI18n();
 if(!change||!Object.keys(change).length)return null;
 return <Alert kind="warn" className="st-block"><b>{t('fe.staff.pendingChange')}</b><br/>
  {Object.entries(change).map(([k,v])=><span key={k} className="st-change"><code>{k}</code>: {show(v)}<br/></span>)}</Alert>;
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
 const id=useId();
 return <div className="st-block st-field"><Field id={id} label={label}><TextArea id={id} rows={rows} maxLength={max} value={value} onChange={e=>onChange(e.target.value)}/></Field></div>;
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
 const {call}=useFe();const {t}=useI18n();const when=useWhen();
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
  <Kv rows={[[t('fe.staff.media.authorLabel'),item.authorLabel],[t('fe.staff.media.scanner'),item.reason]]}/>
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
  <Kv rows={[[t('fe.staff.comm.privacy'),item.privacy],['#',item.topics?.join(', ')],[t('fe.staff.comm.rules'),item.rules?show(item.rules):null],[t('fe.staff.comm.question'),item.join_question]]}/>
  <Changes change={item.pending_change}/>
  <TextField label={t('fe.staff.reasonText')} value={reason} onChange={setReason} max={300}/>
  {ask?<Confirm text={t('fe.staff.comm.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide('reject')}/>
   :<div className="st-row st-block"><Btn size="sm" auto icon={Check} disabled={d.busy} onClick={()=>decide('approve')}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
  <Failure text={d.failure}/>
 </StCard>;
}

function EventCard({item,onDone}:{item:EventItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [reason,setReason]=useState('');const [ask,setAsk]=useState<'reject'|'hide'|null>(null);
 const decide=(decision:'approve'|'reject'|'hide')=>d.run('staff.eventDecide',{eventId:item.id,rev:item.rev,decision,reason:reason.trim()});
 return <StCard title={item.title} meta={<>{item.state==='in_review'&&<Pill tone="wait">{t('fe.staff.newItem')}</Pill>} {when(item.created_at)}</>}>
  {item.description&&<p className="st-text">{item.description}</p>}
  <Kv rows={[[t('fe.staff.event.organizer'),item.organizer?.handle?'@'+item.organizer.handle:null],[t('fe.staff.event.when'),item.starts_at?when(item.starts_at)+' – '+when(item.ends_at):null],
   [t('fe.staff.event.where'),[item.format,item.area].filter(Boolean).join(' · ')],[t('fe.staff.event.address'),item.exact_address],[t('fe.staff.event.link'),item.join_url],
   [t('fe.staff.event.price'),item.price?show(item.price):null],[t('fe.staff.event.requirements'),item.requirements]]}/>
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

/** The post's text opens the post; removing asks first; both sides are told the decision by the server. */
function DisputeCard({item,onDone}:{item:DisputeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const navigate=useNavigate();const d=useDecide(onDone);
 const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const decide=(restore:boolean)=>d.run('staff.disputeDecide',{postId:item.id,restore,note:note.trim()});
 return <Card className="rqcard mod-card">
  <div className="row"><span className="rq-av"><span className="av ini"><ShieldAlert/></span></span><div className="grow"><Text as="b" size="strong">{t('fe.staff.dispute.title')}</Text>
   <Note>{when(item.disputed_at)}{item.media?' · '+t('fe.staff.dispute.media',{n:String(item.media)}):''}</Note></div>
   {!!item.media&&<span className="ico v" aria-hidden="true"><Image/></span>}</div>
  {item.excerpt&&<button type="button" className="mod-x" onClick={()=>navigate('/n/feed/post/'+item.id)}>{item.excerpt.slice(0,160)}</button>}
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.dispute.confirmRemove')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide(false)}/>
   :<div className="row g8 mt12"><Btn kind="danger" size="md" disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.dispute.remove')}</Btn>
    <Btn kind="soft" size="md" disabled={d.busy} busy={d.busy} onClick={()=>decide(true)}>{t('fe.staff.dispute.restore')}</Btn></div>}
  <Failure text={d.failure}/>
 </Card>;
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
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [rule,setRule]=useState<typeof RULES[number]|''>('');const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const people=item.targetType==='profile'||item.targetType==='conversation';
 const base={targetType:item.targetType,targetId:item.targetId,note:note.trim(),...(item.targetType==='conversation'&&item.author?{reportedProfileId:item.author.id}:{})};
 const author=item.author?[item.author.name,item.author.handle&&'@'+item.author.handle].filter(Boolean).join(' '):null;
 return <StCard title={t('fe.staff.report.type.'+item.targetType)} danger={item.reasons.includes('minor')} meta={when(item.firstAt)}>
  <Chips className="st-block">{item.reasons.map(r=><Pill key={r} tone={r==='minor'?'bad':undefined}>{t('fe.staff.report.reason.'+r)}</Pill>)}
   <Pill>{t('fe.staff.report.count')}: {item.reports}</Pill></Chips>
  {item.excerpt&&<p className="st-text"><Text as="span" size="xs" tone="mute">{t('fe.staff.report.now')}: </Text>{item.excerpt}</p>}
  <Kv rows={[[t('fe.staff.author'),author],[t('fe.staff.state'),item.state],[t('fe.staff.report.media'),item.media?String(item.media):null],
   [t('fe.staff.report.details'),item.details?.length?item.details.join(' · '):null],[t('fe.staff.report.snapshot'),item.reported?show(item.reported):null]]}/>
  {!people&&<Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>}
  {people&&<Note className="st-block">{t('fe.staff.report.peopleNote')}</Note>}
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.report.confirmRemove')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.reportDecide',{...base,decision:'remove',rule})}/>
   :<div className="st-row st-block"><Btn kind="soft" size="sm" auto icon={Check} disabled={d.busy} onClick={()=>d.run('staff.reportDecide',{...base,decision:'keep'})}>{t('fe.staff.report.keep')}</Btn>
    {!people&&<Btn kind="danger" size="sm" auto icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{t('fe.staff.report.remove')}</Btn>}</div>}
  <Failure text={d.failure}/>
 </StCard>;
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

function Journal(){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();
 const [items,setItems]=useState<z.infer<typeof journalItem>[]|null>(null);const [error,setError]=useState<unknown>(null);
 const [filter,setFilter]=useState('');const [applied,setApplied]=useState('');
 const load=useCallback(()=>{setItems(null);setError(null);
  call('staff.journal',{limit:100,...(applied?{targetId:applied}:{})},list(journalItem),{asAccount:true}).then(r=>setItems(r.items)).catch(setError);},[call,applied]);
 useEffect(()=>{load();},[load]);
 const valid=!filter.trim()||/^[0-9a-f-]{36}$/i.test(filter.trim());
 return <>
  <div className="st-row mt8">
   <LineField label={t('fe.staff.journal.filter')} value={filter} max={36} spellCheck={false} onChange={setFilter}/>
   <Btn kind="soft" size="md" auto disabled={!valid} onClick={()=>{const v=filter.trim();if(v===applied)load();else setApplied(v);}}>{t('fe.staff.journal.apply')}</Btn>
  </div>
  {error?(forbidden(error)?<Empty icon={Lock} title={t('fe.staff.unavailable')} text={t('fe.staff.journal.forbidden')}/>
    :<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>)
   :items===null?<Skel kind="list"/>
   :!items.length?<Empty icon={Inbox} title={t('fe.staff.journal.empty')}/>
   :<Card list className="mt8">{items.map(x=><Row key={String(x.id)} title={<>{x.action}{x.target_type?' · '+x.target_type:''}</>}
     sub={<>{when(x.created_at)}{x.target_id?' · '+x.target_id:''}</>}
     extra={x.detail!==undefined&&x.detail!==null&&show(x.detail)!=='{}'?<small className="st-detail"><code>{show(x.detail)}</code></small>:undefined}
     end={<IconBtn icon={ChevronRight} kind="ghost" label={t('fe.staff.journal.apply')} disabled={!x.target_id} onClick={()=>{if(x.target_id){setFilter(x.target_id);setApplied(x.target_id);}}}/>}/>)}</Card>}
 </>;
}
