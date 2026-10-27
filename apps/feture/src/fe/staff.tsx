import {useCallback,useEffect,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {BadgeCheck,Ban,Check,ChevronLeft,ChevronRight,Eye,Image,Inbox,Lock,RefreshCw,ShieldAlert,ShieldCheck,TriangleAlert,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Btn,Empty,Seg,View,Skel} from './ui';
import {useFe} from './session';
import './staff.css';

/** Staff area (/n/staff, S4 moderation): review queues with decisions, Premium for dogfooding, the journal.
 * Roles are enforced by the server only; a queue the server refuses (403) is simply not shown. */
const ok=z.object({ok:z.literal(true)}).passthrough();
const meRes=z.object({ok:z.literal(true),roles:z.array(z.string())});
const ts=z.string().nullable().optional();
const opt=<T extends z.ZodType>(s:T)=>s.nullable().optional();

const mediaItem=z.object({id:z.uuid(),purpose:z.string(),kind:z.string(),authorLabel:opt(z.string()),reason:opt(z.string()),createdAt:ts,w:opt(z.number()),h:opt(z.number()),blur:opt(z.string())});
const viewRes=z.object({ok:z.literal(true),src:z.object({card:z.string(),full:z.string()}).nullable()});
const commItem=z.object({id:z.uuid(),rev:z.number(),name:z.string(),description:opt(z.string()),topics:opt(z.array(z.string())),privacy:opt(z.string()),join_question:opt(z.string()),
 rules:z.unknown().optional(),state:z.string(),pending_change:z.record(z.string(),z.unknown()).nullable().optional(),created_at:ts}).passthrough();
const eventItem=z.object({id:z.uuid(),rev:z.number(),title:z.string(),kind:opt(z.string()),description:opt(z.string()),format:opt(z.string()),area:opt(z.string()),exact_address:opt(z.string()),
 join_url:opt(z.string()),starts_at:ts,ends_at:ts,price:z.unknown().optional(),requirements:opt(z.string()),state:z.string(),pending_change:z.record(z.string(),z.unknown()).nullable().optional(),
 created_at:ts,organizer:opt(z.object({id:z.string(),kind:z.string().optional(),handle:z.string().nullable().optional()}).passthrough())}).passthrough();
const mediaDto=z.object({src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional();
const ageItem=z.object({id:z.uuid(),gesture:z.string(),submittedAt:ts,profile:z.object({id:z.string(),handle:z.string().nullable()}),selfie:mediaDto,photo:mediaDto});
const photoItem=ageItem.extend({photos:z.array(mediaDto).optional()});
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
 return <button type="button" className="ibtn" aria-label={t('fe.staff.entry')} title={t('fe.staff.entryText')} onClick={()=>navigate('/n/staff')}><ShieldCheck/></button>;
}

export function StaffScreen(){
 const {t}=useI18n();const roles=useStaffRoles();const navigate=useNavigate();
 const [section,setSection]=useState<'queues'|'premium'|'journal'>('queues');
 return <>
  <header className="bar"><button type="button" className="ibtn ghost" aria-label={t('fe.back')} onClick={()=>navigate('/n/me')}><ChevronLeft/></button>
   <h1 className="sm" tabIndex={-1}>{t('fe.staff.title')}<span className="sub">{t('fe.staff.sub')}</span></h1></header>
  <View className="st nodock">
   {roles===null?<Skel kind="list"/>
    :!roles.length?<Empty icon={Lock} title={t('fe.staff.unavailable')} text={t('fe.staff.unavailableText')}/>
    :<>
     <p className="note mb12">{t('fe.staff.roles')}: {roles.map(r=>t('fe.staff.role.'+r)).join(', ')}</p>
     <Seg small={false} value={section} onChange={setSection} options={(['queues','premium','journal'] as const).map(id=>({id,label:t('fe.staff.section.'+id)}))}/>
     {section==='queues'?<Queues/>:section==='premium'?<Premium/>:<Journal/>}
    </>}
  </View>
 </>;
}

function Queues(){
 const {call}=useFe();const {t}=useI18n();
 const [data,setData]=useState<Loaded|null>(null);const [tab,setTab]=useState<QueueId|null>(null);const [notice,setNotice]=useState('');
 const load=useCallback(()=>{
  setData(null);setNotice('');
  void Promise.allSettled(QUEUE_IDS.map(id=>call(QUEUES[id].action,{limit:LIMIT},QUEUES[id].schema as z.ZodType<{items:unknown[]}>,{asAccount:true}))).then(rs=>{
   const next:Record<string,{items:unknown[]}|{error:unknown}>={};
   rs.forEach((r,i)=>{const id=QUEUE_IDS[i]!;if(r.status==='fulfilled')next[id]={items:r.value.items};else if(!forbidden(r.reason))next[id]={error:r.reason};});
   setData(next as Loaded);
   setTab(cur=>cur&&next[cur]?cur:QUEUE_IDS.find(id=>{const v=next[id];return v&&'items' in v&&v.items.length;})??QUEUE_IDS.find(id=>next[id])??null);
  });
 },[call]);
 useEffect(()=>{load();},[load]);
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
  {(tab==='dispute'||tab==='report')&&<div className="alert info mt12"><ShieldCheck/><span><b>{t('fe.staff.howTitle')}</b>{t('fe.staff.howText')}</span></div>}
  <div className="st-tools"><Btn kind="text" size="sm" auto icon={RefreshCw} onClick={load}>{t('fe.staff.refresh')}</Btn></div>
  {notice&&<div className="alert ok mb12" role="status"><Check/><span>{notice}</span></div>}
  {!current?null:'error' in current?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(current.error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
   :!current.items.length?<Empty icon={Inbox} title={t('fe.staff.qEmpty')} text={t('fe.staff.qEmptyText')}/>
   :<><div className="sec">{t('fe.staff.inQueue',{n:count(tab)})}</div><QueueList id={tab} items={current.items} onDone={key=>done(tab,key)}/></>}
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

function Card({title,meta,children,danger}:{title:ReactNode,meta?:ReactNode,children:ReactNode,danger?:boolean}){
 return <article className={'card st-card'+(danger?' st-danger':'')}>
  <header className="st-head"><b>{title}</b>{meta&&<span className="st-meta">{meta}</span>}</header>
  {children}
 </article>;
}

function Kv({rows}:{rows:[string,ReactNode][]}){
 const shown=rows.filter(([,v])=>v!==null&&v!==undefined&&v!=='');
 if(!shown.length)return null;
 return <dl className="kv st-kv">{shown.map(([k,v])=><div key={k} className="st-kv-row"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

const show=(v:unknown):string=>v===null||v===undefined?'—':typeof v==='string'?v:Array.isArray(v)?v.map(show).join(', '):JSON.stringify(v);

function Changes({change}:{change:Record<string,unknown>|null|undefined}){
 const {t}=useI18n();
 if(!change||!Object.keys(change).length)return null;
 return <div className="alert warn st-block"><TriangleAlert/><span><b>{t('fe.staff.pendingChange')}</b><br/>
  {Object.entries(change).map(([k,v])=><span key={k} className="st-change"><code>{k}</code>: {show(v)}<br/></span>)}</span></div>;
}

/** Inline confirmation for destructive decisions (no window.confirm). */
function Confirm({text,danger,busy,onYes,onNo}:{text:string,danger?:boolean,busy:boolean,onYes:()=>void,onNo:()=>void}){
 const {t}=useI18n();
 return <div className="st-confirm" role="alertdialog" aria-label={text}>
  <div className={'alert '+(danger?'err':'warn')}>{danger?<ShieldAlert/>:<TriangleAlert/>}<span>{text}</span></div>
  <div className="st-row">
   <Btn kind="danger" size="sm" auto disabled={busy} onClick={onYes} busy={busy}>{t('fe.staff.confirm')}</Btn>
   <Btn kind="text" size="sm" auto disabled={busy} onClick={onNo}>{t('fe.cancel')}</Btn>
  </div>
 </div>;
}

function Choice<T extends string>({label,value,options,onChange,disabled}:{label:string,value:T|'',options:{id:T,label:string}[],onChange:(v:T)=>void,disabled?:boolean}){
 return <div className="st-block"><p className="note">{label}</p>
  <div className="chips mt8" role="radiogroup" aria-label={label}>{options.map(o=><button key={o.id} type="button" role="radio" aria-checked={value===o.id} disabled={disabled}
   className={'chip'+(value===o.id?' on':'')} onClick={()=>onChange(o.id)}>{o.label}</button>)}</div></div>;
}

function TextField({label,value,onChange,max,rows=2}:{label:string,value:string,onChange:(v:string)=>void,max:number,rows?:number}){
 return <label className="field st-block"><span>{label}</span><textarea className="inp" rows={rows} maxLength={max} value={value} onChange={e=>onChange(e.target.value)}/></label>;
}

function Failure({text}:{text:string}){return text?<div className="alert err st-block" role="alert"><X/><span>{text}</span></div>:null;}

const RULES=['minors','threats','private_material','spam','illegal','community_rules'] as const;

// ——— photos ———

const MEDIA_REASONS=['minor','not_a_person','violence','private_material','spam','invalid','other'] as const;
const PUBLIC_ONLY=new Set(['avatar','community','event']);
function MediaCard({item,onDone}:{item:MediaItem,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const when=useWhen();
 const [src,setSrc]=useState<{card:string,full:string}|null|undefined>(undefined);const [viewing,setViewing]=useState(false);
 const [reason,setReason]=useState<typeof MEDIA_REASONS[number]|''>('');const [ask,setAsk]=useState<'reject'|'csam'|null>(null);
 const d=useDecide(onDone);
 // The full picture only through staff.mediaView: it returns short-lived URLs and journals the look.
 const open=async()=>{setViewing(true);d.setFailure('');
  try{const r=await call('staff.mediaView',{assetId:item.id},viewRes,{asAccount:true});setSrc(r.src);}catch(e){d.setFailure(feErrorMessage(e,t));}finally{setViewing(false);}};
 const purpose=t('fe.staff.media.purpose.'+item.purpose);
 return <Card title={purpose.startsWith('fe.')?item.purpose:purpose} meta={when(item.createdAt)}>
  <div className="st-media">
   {src?(item.kind==='video'?<video src={src.full} controls playsInline/>:<a href={src.full} target="_blank" rel="noreferrer noopener"><img src={src.card} alt="" draggable={false}/></a>)
    :item.blur?<img className="st-blur" src={item.blur} alt="" draggable={false}/>:<div className="st-ph"><Eye/></div>}
  </div>
  <Kv rows={[[t('fe.staff.media.authorLabel'),item.authorLabel],[t('fe.staff.media.scanner'),item.reason]]}/>
  {src===undefined?<div className="st-block">
    <Btn kind="soft" size="md" icon={Eye} disabled={viewing} busy={viewing} onClick={open}>{t('fe.staff.media.open')}</Btn>
    <p className="note mt8">{t('fe.staff.media.openNote')}</p></div>
   :src===null?<p className="note st-block">{t('fe.staff.media.noCopies')}</p>:null}
  {src!==undefined&&!ask&&<>
   {src&&<div className="st-row st-block">
    <Btn size="sm" auto icon={Check} disabled={d.busy} onClick={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'approve',explicit:false})}>{t('fe.staff.media.approveSafe')}</Btn>
    {!PUBLIC_ONLY.has(item.purpose)&&<Btn kind="soft" size="sm" auto disabled={d.busy} onClick={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'approve',explicit:true})}>{t('fe.staff.media.approveExplicit')}</Btn>}
   </div>}
   {src&&PUBLIC_ONLY.has(item.purpose)&&<p className="note">{t('fe.staff.media.publicOnly')}</p>}
   <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={MEDIA_REASONS.map(id=>({id,label:t('fe.staff.media.reason.'+id)}))}/>
   <div className="st-row st-block"><Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk('reject')}>{t('fe.staff.reject')}</Btn></div>
  </>}
  {ask==='reject'&&<Confirm text={t('fe.staff.media.confirmReject')} busy={d.busy} onNo={()=>setAsk(null)} onYes={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'reject',reason})}/>}
  <Csam busy={d.busy} asking={ask==='csam'} onAsk={()=>setAsk('csam')} onNo={()=>setAsk(null)} onYes={()=>d.run('staff.mediaDecide',{assetId:item.id,decision:'reject',reason:'csam_suspected'})}/>
  <Failure text={d.failure}/>
 </Card>;
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
 return <Card title={item.name} meta={<>{item.state==='in_review'&&<span className="pill wait">{t('fe.staff.newItem')}</span>} {when(item.created_at)}</>}>
  {item.description&&<p className="st-text">{item.description}</p>}
  <Kv rows={[[t('fe.staff.comm.privacy'),item.privacy],['#',item.topics?.join(', ')],[t('fe.staff.comm.rules'),item.rules?show(item.rules):null],[t('fe.staff.comm.question'),item.join_question]]}/>
  <Changes change={item.pending_change}/>
  <TextField label={t('fe.staff.reasonText')} value={reason} onChange={setReason} max={300}/>
  {ask?<Confirm text={t('fe.staff.comm.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide('reject')}/>
   :<div className="st-row st-block"><Btn size="sm" auto icon={Check} disabled={d.busy} onClick={()=>decide('approve')}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
  <Failure text={d.failure}/>
 </Card>;
}

function EventCard({item,onDone}:{item:EventItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [reason,setReason]=useState('');const [ask,setAsk]=useState<'reject'|'hide'|null>(null);
 const decide=(decision:'approve'|'reject'|'hide')=>d.run('staff.eventDecide',{eventId:item.id,rev:item.rev,decision,reason:reason.trim()});
 return <Card title={item.title} meta={<>{item.state==='in_review'&&<span className="pill wait">{t('fe.staff.newItem')}</span>} {when(item.created_at)}</>}>
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
 </Card>;
}

// ——— age checks ———

const AGE_REASONS=['gesture_mismatch','face_hidden','not_same_person','looks_underage','bad_photo'] as const;
function AgeCard({item,onDone}:{item:AgeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();
 // The server never lets staff decide their own check; its refusal is explained in plain words.
 const d=useDecide(onDone,e=>forbidden(e)?t('fe.staff.age.own'):null);
 const [reason,setReason]=useState<typeof AGE_REASONS[number]|''>('');const [ask,setAsk]=useState(false);
 const selfie=item.selfie?.src?.full??item.selfie?.src?.card??null;const photo=item.photo?.src?.card??item.photo?.src?.thumb??null;
 const gesture=t('fe.staff.age.gesture.'+item.gesture);
 return <Card title={item.profile.handle?'@'+item.profile.handle:item.profile.id} meta={when(item.submittedAt)}>
  <div className="alert info st-block"><Eye/><span>{t('fe.staff.age.gesture')}: <b>{gesture.startsWith('fe.')?item.gesture:gesture}</b></span></div>
  <div className="st-pair st-block">
   <figure><div className="st-media">{selfie?<img src={selfie} alt="" draggable={false}/>:<div className="st-ph"><X/></div>}</div><figcaption className="note">{t('fe.staff.age.selfie')}</figcaption></figure>
   <figure><div className="st-media">{photo?<img src={photo} alt="" draggable={false}/>:<div className="st-ph"><Eye/></div>}</div><figcaption className="note">{t('fe.staff.age.photo')}</figcaption></figure>
  </div>
  {!selfie&&<p className="note">{t('fe.staff.age.noSelfie')}</p>}
  <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={AGE_REASONS.map(id=>({id,label:t('fe.staff.age.reason.'+id)}))}/>
  {ask?<Confirm text={t('fe.staff.age.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:false,reason})}/>
   :<div className="st-row st-block"><Btn size="sm" auto icon={Check} disabled={d.busy||!selfie} onClick={()=>d.run('staff.ageCheckDecide',{checkId:item.id,approve:true})}>{t('fe.staff.age.approve')}</Btn>
    <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
  <Failure text={d.failure}/>
 </Card>;
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
 return <Card title={item.profile.handle?'@'+item.profile.handle:item.profile.id} meta={when(item.submittedAt)}>
  <div className="alert info st-block"><Eye/><span>{t('fe.staff.age.gesture')}: <b>{gesture.startsWith('fe.')?item.gesture:gesture}</b></span></div>
  <p className="note">{t('fe.pc.staff.compare')}</p>
  <div className="st-pair st-block">
   <figure><div className="st-media">{selfie?<img src={selfie} alt="" draggable={false}/>:<div className="st-ph"><X/></div>}</div><figcaption className="note">{t('fe.pc.staff.selfie')}</figcaption></figure>
   {(photos.length?photos:[null]).map((src,i)=><figure key={i}><div className="st-media">{src?<img src={src} alt="" draggable={false}/>:<div className="st-ph"><Eye/></div>}</div><figcaption className="note">{t('fe.pc.staff.photo')}{photos.length>1?' '+(i+1):''}</figcaption></figure>)}
  </div>
  {!selfie&&<p className="note">{t('fe.staff.age.noSelfie')}</p>}
  <Choice label={t('fe.staff.reason')} value={reason} onChange={setReason} disabled={d.busy} options={PHOTO_REASONS.map(id=>({id,label:t('fe.pc.reason.'+id)}))}/>
  {ask?<Confirm text={t('fe.pc.staff.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.photoCheckDecide',{checkId:item.id,approve:false,reason})}/>
   :<div className="st-row st-block"><Btn size="sm" auto icon={BadgeCheck} disabled={d.busy||!selfie} onClick={()=>d.run('staff.photoCheckDecide',{checkId:item.id,approve:true})}>{t('fe.pc.staff.approve')}</Btn>
    <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy||!reason} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
  <Failure text={d.failure}/>
 </Card>;
}

// ——— «это я на фото» and post edits (V21 M01) ———

/** The post's text opens the post; removing asks first; both sides are told the decision by the server. */
function DisputeCard({item,onDone}:{item:DisputeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const navigate=useNavigate();const d=useDecide(onDone);
 const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const decide=(restore:boolean)=>d.run('staff.disputeDecide',{postId:item.id,restore,note:note.trim()});
 return <article className="card rqcard mod-card">
  <div className="row"><span className="rq-av"><span className="av ini"><ShieldAlert/></span></span><div className="grow"><b style={{fontSize:15}}>{t('fe.staff.dispute.title')}</b>
   <div className="note">{when(item.disputed_at)}{item.media?' · '+t('fe.staff.dispute.media',{n:String(item.media)}):''}</div></div>
   {!!item.media&&<span className="ico v" aria-hidden="true"><Image/></span>}</div>
  {item.excerpt&&<button type="button" className="mod-x" onClick={()=>navigate('/n/feed/post/'+item.id)}>{item.excerpt.slice(0,160)}</button>}
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.dispute.confirmRemove')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide(false)}/>
   :<div className="row g8 mt12"><Btn kind="danger" size="md" disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.dispute.remove')}</Btn>
    <Btn kind="soft" size="md" disabled={d.busy} busy={d.busy} onClick={()=>decide(true)}>{t('fe.staff.dispute.restore')}</Btn></div>}
  <Failure text={d.failure}/>
 </article>;
}

function RevisionCard({item,onDone}:{item:RevisionItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const navigate=useNavigate();const d=useDecide(onDone);
 const [rule,setRule]=useState<typeof RULES[number]|''>('');const [ask,setAsk]=useState(false);
 const proposed=item.proposed&&typeof item.proposed==='object'?item.proposed as Record<string,unknown>:null;
 const text=proposed?[proposed.title,proposed.body].filter(v=>typeof v==='string'&&v).join(': '):show(item.proposed);
 return <article className="card rqcard mod-card">
  <div className="row"><div className="grow"><b style={{fontSize:15}}>{t('fe.staff.revision.title')}</b><div className="note">{when(item.createdAt)}</div></div></div>
  {item.live&&<button type="button" className="mod-x" onClick={()=>navigate('/n/feed/post/'+item.postId)}><span className="note">{t('fe.staff.revision.live')}: </span>{item.live.slice(0,160)}</button>}
  {text&&<p className="mod-r">{text.slice(0,600)}</p>}
  <Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>
  {ask?<Confirm text={t('fe.staff.revision.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.revisionDecide',{revisionId:item.id,decision:'reject',rule})}/>
   :<div className="row g8 mt12"><Btn size="md" icon={Check} disabled={d.busy} busy={d.busy} onClick={()=>d.run('staff.revisionDecide',{revisionId:item.id,decision:'approve'})}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" size="md" icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
  <Failure text={d.failure}/>
 </article>;
}

// ——— reports, appeals, DSA notices, cities ———

function ReportCard({item,onDone}:{item:ReportItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [rule,setRule]=useState<typeof RULES[number]|''>('');const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const people=item.targetType==='profile'||item.targetType==='conversation';
 const base={targetType:item.targetType,targetId:item.targetId,note:note.trim(),...(item.targetType==='conversation'&&item.author?{reportedProfileId:item.author.id}:{})};
 const author=item.author?[item.author.name,item.author.handle&&'@'+item.author.handle].filter(Boolean).join(' '):null;
 return <Card title={t('fe.staff.report.type.'+item.targetType)} danger={item.reasons.includes('minor')} meta={when(item.firstAt)}>
  <div className="chips st-block">{item.reasons.map(r=><span key={r} className={'pill'+(r==='minor'?' bad':'')}>{t('fe.staff.report.reason.'+r)}</span>)}
   <span className="pill">{t('fe.staff.report.count')}: {item.reports}</span></div>
  {item.excerpt&&<p className="st-text"><span className="note">{t('fe.staff.report.now')}: </span>{item.excerpt}</p>}
  <Kv rows={[[t('fe.staff.author'),author],[t('fe.staff.state'),item.state],[t('fe.staff.report.media'),item.media?String(item.media):null],
   [t('fe.staff.report.details'),item.details?.length?item.details.join(' · '):null],[t('fe.staff.report.snapshot'),item.reported?show(item.reported):null]]}/>
  {!people&&<Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>}
  {people&&<p className="note st-block">{t('fe.staff.report.peopleNote')}</p>}
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.report.confirmRemove')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.reportDecide',{...base,decision:'remove',rule})}/>
   :<div className="st-row st-block"><Btn kind="soft" size="sm" auto icon={Check} disabled={d.busy} onClick={()=>d.run('staff.reportDecide',{...base,decision:'keep'})}>{t('fe.staff.report.keep')}</Btn>
    {!people&&<Btn kind="danger" size="sm" auto icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{t('fe.staff.report.remove')}</Btn>}</div>}
  <Failure text={d.failure}/>
 </Card>;
}

function AppealCard({item,onDone}:{item:AppealItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const mine=!!item.decision?.mine;
 const decide=(grant:boolean)=>d.run('staff.appealDecide',{appealId:item.id,grant,note:note.trim()});
 return <Card title={(item.handle?'@'+item.handle+' · ':'')+t('fe.staff.report.type.'+item.target_type)} meta={when(item.created_at)}>
  <p className="st-text"><span className="note">{t('fe.staff.appeal.body')}: </span>{item.body}</p>
  {item.decision&&<Kv rows={[[t('fe.staff.appeal.decision'),item.decision.action+' · '+when(item.decision.at)],['',item.decision.detail?show(item.decision.detail):null]]}/>}
  {mine?<div className="alert warn st-block"><TriangleAlert/><span>{t('fe.staff.appeal.sameStaff')}</span></div>:<>
   <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
   {ask?<Confirm text={t('fe.staff.appeal.confirmDeny')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide(false)}/>
    :<div className="st-row st-block"><Btn size="sm" auto icon={Check} disabled={d.busy} onClick={()=>decide(true)}>{t('fe.staff.appeal.grant')}</Btn>
     <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.appeal.deny')}</Btn></div>}
  </>}
  <Failure text={d.failure}/>
 </Card>;
}

const NOTICE_RULES=[...RULES,'ip'] as const;
function NoticeCard({item,onDone}:{item:NoticeItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [rule,setRule]=useState<typeof NOTICE_RULES[number]|''>('');const [note,setNote]=useState('');const [ask,setAsk]=useState(false);
 const decide=(outcome:'removed'|'kept'|'not_actionable')=>d.run('staff.noticeDecide',{noticeId:item.id,outcome,note:note.trim(),...(outcome==='removed'?{rule}:{})});
 const csam=item.reason==='csam';
 return <Card title={t('fe.staff.notice.reason.'+item.reason)} danger={csam||item.reason==='minors'} meta={when(item.created_at)}>
  {csam&&<div className="alert err st-block"><ShieldAlert/><span><b>{t('fe.staff.csam.flag')}</b></span></div>}
  <Kv rows={[[t('fe.staff.notice.url'),item.target_url],[t('fe.staff.notice.explanation'),item.explanation]]}/>
  <p className="note st-block">{item.answerable?t('fe.staff.notice.answerable'):t('fe.staff.notice.anonymous')}</p>
  <Choice label={t('fe.staff.rule')} value={rule} onChange={setRule} disabled={d.busy} options={NOTICE_RULES.map(id=>({id,label:t('fe.staff.rule.'+id)}))}/>
  <TextField label={t('fe.staff.note')} value={note} onChange={setNote} max={500}/>
  {ask?<Confirm text={t('fe.staff.notice.confirmRemoved')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>decide('removed')}/>
   :<div className="st-row st-block">
    <Btn kind="danger" size="sm" auto icon={Ban} disabled={d.busy||!rule} onClick={()=>setAsk(true)}>{t('fe.staff.notice.removed')}</Btn>
    <Btn kind="soft" size="sm" auto disabled={d.busy} onClick={()=>decide('kept')}>{t('fe.staff.notice.kept')}</Btn>
    <Btn kind="text" size="sm" auto disabled={d.busy} onClick={()=>decide('not_actionable')}>{t('fe.staff.notice.not_actionable')}</Btn></div>}
  <Failure text={d.failure}/>
 </Card>;
}

function PlaceCard({item,onDone}:{item:PlaceItem,onDone:()=>void}){
 const {t}=useI18n();const when=useWhen();const d=useDecide(onDone);
 const [ru,setRu]=useState(item.name_ru??'');const [en,setEn]=useState(item.name_en??'');const [ask,setAsk]=useState(false);
 return <Card title={[item.name_ru,item.name_en].filter(Boolean).join(' / ')||'—'} meta={when(item.created_at)}>
  <Kv rows={[[t('fe.staff.place.country'),item.country],[t('fe.staff.place.used'),String(item.used??0)]]}/>
  <div className="st-row st-block">
   <label className="field"><span>{t('fe.staff.place.nameRu')}</span><input className="inp" value={ru} maxLength={80} onChange={e=>setRu(e.target.value)}/></label>
   <label className="field"><span>{t('fe.staff.place.nameEn')}</span><input className="inp" value={en} maxLength={80} onChange={e=>setEn(e.target.value)}/></label>
  </div>
  {ask?<Confirm text={t('fe.staff.place.confirmReject')} busy={d.busy} onNo={()=>setAsk(false)} onYes={()=>d.run('staff.placeDecide',{placeId:item.id,decision:'reject'})}/>
   :<div className="st-row st-block"><Btn size="sm" auto icon={Check} disabled={d.busy} onClick={()=>d.run('staff.placeDecide',{placeId:item.id,decision:'approve',
     ...(ru.trim()?{nameRu:ru.trim()}:{}),...(en.trim()?{nameEn:en.trim()}:{})})}>{t('fe.staff.approve')}</Btn>
    <Btn kind="soft" size="sm" auto icon={Ban} disabled={d.busy} onClick={()=>setAsk(true)}>{t('fe.staff.reject')}</Btn></div>}
  <Failure text={d.failure}/>
 </Card>;
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
  <section className="grp"><div className="grp-t"><span>{t('fe.staff.premium.grantTitle')}</span></div>
   <div className="card form-card">
    <p className="note">{t('fe.staff.premium.grantNote')}</p>
    <div className="st-row st-block">
     <label className="field"><span>{t('fe.staff.premium.handle')}</span><input className="inp" value={handle} maxLength={21} autoCapitalize="none" onChange={e=>setHandle(e.target.value)}/></label>
     <label className="field st-days"><span>{t('fe.staff.premium.days')}</span><input className="inp" inputMode="numeric" value={days} maxLength={3} onChange={e=>setDays(e.target.value.replace(/\D/g,''))}/></label>
    </div>
    <TextField label={t('fe.staff.premium.reason')} value={reason} onChange={setReason} max={300}/>
    <div className="st-row st-block"><Btn size="md" auto disabled={busy||!canGrant} onClick={grant} busy={busy}>{t('fe.staff.premium.grant')}</Btn></div>
    {granted&&<div className="alert ok st-block" role="status"><Check/><span>{t('fe.staff.premium.granted',{until:when(granted.until)})}<br/><code>{granted.id}</code></span></div>}
   </div>
  </section>
  <section className="grp"><div className="grp-t"><span>{t('fe.staff.premium.revokeTitle')}</span></div>
   <div className="card form-card">
    <p className="note">{t('fe.staff.premium.revokeNote')}</p>
    <label className="field st-block"><span>{t('fe.staff.premium.entitlement')}</span><input className="inp" value={entitlement} maxLength={36} autoCapitalize="none" spellCheck={false} onChange={e=>setEntitlement(e.target.value)}/></label>
    <TextField label={t('fe.staff.premium.reason')} value={revokeReason} onChange={setRevokeReason} max={300}/>
    {ask?<Confirm text={t('fe.staff.premium.confirmRevoke')} busy={busy} onNo={()=>setAsk(false)} onYes={revoke}/>
     :<div className="st-row st-block"><Btn kind="danger" size="md" auto disabled={busy||!uuid||revokeReason.trim().length<3} onClick={()=>setAsk(true)}>{t('fe.staff.premium.revoke')}</Btn></div>}
    {revoked&&<div className="alert ok st-block" role="status"><Check/><span>{revoked}</span></div>}
   </div>
  </section>
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
   <label className="field"><span>{t('fe.staff.journal.filter')}</span><input className="inp" value={filter} maxLength={36} spellCheck={false} onChange={e=>setFilter(e.target.value)}/></label>
   <Btn kind="soft" size="md" auto disabled={!valid} onClick={()=>{const v=filter.trim();if(v===applied)load();else setApplied(v);}}>{t('fe.staff.journal.apply')}</Btn>
  </div>
  {error?(forbidden(error)?<Empty icon={Lock} title={t('fe.staff.unavailable')} text={t('fe.staff.journal.forbidden')}/>
    :<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>)
   :items===null?<Skel kind="list"/>
   :!items.length?<Empty icon={Inbox} title={t('fe.staff.journal.empty')}/>
   :<div className="card list mt8">{items.map(x=><div key={String(x.id)} className="li static">
     <div className="tx"><b>{x.action}{x.target_type?' · '+x.target_type:''}</b>
      <small>{when(x.created_at)}{x.target_id?' · '+x.target_id:''}</small>
      {x.detail!==undefined&&x.detail!==null&&show(x.detail)!=='{}'&&<small className="st-detail">{show(x.detail)}</small>}</div>
     <button type="button" className="ibtn ghost" aria-label={t('fe.staff.journal.apply')} disabled={!x.target_id} onClick={()=>{if(x.target_id){setFilter(x.target_id);setApplied(x.target_id);}}}><ChevronRight/></button>
    </div>)}</div>}
 </>;
}
