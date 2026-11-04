import {evParts} from './event-time';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Calendar,Check,Clock,MapPin,Pencil,Video,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Actions,ActorCard,ActorCards,Alert,ApprovalSheet as ApprovalSheetKit,Av,Btn,Card,Counter,EventTile,Field,Group,KeyValues,Note,PersonLine,ReviewPost,Row,Sheet,TextArea,Who} from './kit';
import {NamedPlate} from './comm-kit';
import {useFe,useLive} from './session';
import {useToast} from './toast';
import {FIELD,textLength,useChecks} from './kit/validate';

/** Couple approvals (docs/notifications.md «Согласования пары и задачи»): the couple's open changes
 * (`decide.approvals`) and any one by id in any state (`approval.get`) in the one kit `ApprovalSheet` — whom it concerns,
 * before → after, the content as it would go, what follows, the kind's button pair; the result card once closed, with
 * «Изменить и отправить снова» for the author of a refused or outdated one. No «на доработку». The «Действовать как»
 * sheet of the dock «Я» lives here too. */
const member=z.object({me:z.boolean(),profileId:z.uuid(),handle:z.string().nullable(),name:z.string().nullable()}).passthrough();
const coupleRes=z.object({ok:z.literal(true),couple:z.object({id:z.uuid(),members:z.array(member)}).passthrough()});
const who=z.object({id:z.uuid(),kind:z.string().optional(),handle:z.string().nullable().optional(),name:z.string().nullable().optional()}).passthrough();
const row=z.object({field:z.string(),before:z.unknown(),after:z.unknown()});
const preview=z.object({
 object:z.object({type:z.string(),id:z.string().nullable(),title:z.string().nullable(),state:z.string().optional()}).passthrough().nullable().optional(),
 subject:who.nullable().optional(),rows:z.array(row).optional(),
 post:z.object({title:z.string().nullable().optional(),body:z.string().nullable().optional(),audience:z.string().nullable().optional(),media:z.number().optional(),changed:z.boolean().optional(),
  community:z.object({id:z.string(),name:z.string()}).nullable().optional()}).passthrough().optional(),
 before:z.object({title:z.string().nullable().optional(),body:z.string().nullable().optional()}).passthrough().nullable().optional(),
 event:z.object({id:z.uuid(),title:z.string().nullable(),format:z.string().nullable().optional(),startsAt:z.string().nullable().optional(),tz:z.string().nullable().optional(),
  city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable().optional()}).passthrough().optional(),
 application:z.object({answers:z.array(z.object({question:z.string(),answer:z.string()})),note:z.string()}).optional(),
 community:z.object({name:z.string(),description:z.string().optional(),privacy:z.string(),rules:z.array(z.string()),question:z.string().nullable(),answer:z.string().nullable().optional(),
  direct:z.boolean().optional()}).passthrough().optional(),
 access:z.object({scopes:z.array(z.string()),term:z.string(),until:z.string().nullable()}).passthrough().optional(),
 link:z.object({kind:z.string(),side:z.string().nullable().optional(),vis:z.string().optional()}).passthrough().nullable().optional(),
 photos:z.object({now:z.number(),after:z.number(),adds:z.number()}).optional(),
 location:z.object({near:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable()}).optional(),
 message:z.object({body:z.string(),photo:z.boolean()}).optional(),
 /** A reply waiting for the partner (audit item 20). */ reply:z.object({body:z.string()}).optional(),
}).passthrough().nullable();
const person=z.object({id:z.uuid(),name:z.string().nullable()}).nullable();
const STATES=['pending','approved','rejected','cancelled','expired','superseded','stale'] as const;
const approval=z.object({id:z.uuid(),kind:z.string(),state:z.enum(STATES).catch('pending'),mine:z.boolean(),initiator:person.optional(),decidedBy:person.optional(),
 addressee:z.object({id:z.uuid(),name:z.string().nullable()}).optional(),objectState:z.string().optional(),preview:preview.optional().catch(null),
 change:z.record(z.string(),z.unknown()).nullable(),comment:z.string().nullable().optional(),version:z.number().optional(),outcome:z.record(z.string(),z.unknown()).nullable().optional(),
 targetId:z.uuid().nullable().optional(),object:z.object({type:z.string(),id:z.string().nullable()}).passthrough().nullable().optional(),createdAt:z.string(),expiresAt:z.string(),decidedAt:z.string().nullable().optional()}).passthrough();
const approvalsRes=z.object({ok:z.literal(true),items:z.array(approval)});
const oneRes=z.object({ok:z.literal(true),approval});
const decided=z.object({ok:z.literal(true),state:z.string().optional()}).passthrough();
type Member=z.infer<typeof member>;
export type Approval=z.infer<typeof approval>;
/** What the Me tab passes in (kept for its call; the server now sends before → after itself). */
export type CoupleBase={name:string|null,bio:string,photos:{id:string}[]};

const KINDS=['profile.update','profile.photos','profile.setVisibility','interests.set','post.publish','post.edit','event.submit','event.update','event.rsvp','event.apply','access.grant','private.on','community.create','community.join','link.propose','link.accept','link.visibility','location.set','chat.request',
 'reply.create','like.send','follow.set','link.change','link.changeAnswer','community.update'];
const FIELDS=['name','bio','handle','cityId','showAge','detailsVis','photos','discoverMode','acceptProfileLikes','requestsFrom','linksFrom','mentionsFrom','activityVis','showLikes','messagesFrom'];
const VALUES=['visible','hidden','all','matches','follow','followers','none','known'];
const nameOf=(m:{name?:string|null|undefined,handle?:string|null|undefined}|undefined|null)=>m?(m.name||(m.handle?'@'+m.handle:'?')):'?';
const kindTitle=(a:Approval,t:(k:string)=>string)=>t('fe.cw.kind.'+(KINDS.includes(a.kind)?a.kind:'other'));

/** The couple's members, from `couple.get` (as the couple, whoever is acting). */
function useCoupleMembers(coupleId?:string){
 const {call,acting}=useFe();const [members,setMembers]=useState<Member[]|null>(null);
 const id=coupleId??(acting?.kind==='couple'?acting.id:undefined);
 const [n,setN]=useState(0);
 useEffect(()=>{
  if(!id)return;
  const ctl=new AbortController();
  call('couple.get',{},coupleRes,{profileId:id,signal:ctl.signal}).then(r=>setMembers(r.couple.members)).catch(()=>{});
  return ()=>ctl.abort();
 },[call,id,n]);
 // A partner's change of approvals, a stop or a restore: `changed:couple`.
 useLive('couple',()=>setN(x=>x+1));
 return members;
}

/** The couple's open changes, both directions; reloads when either side proposes, decides or withdraws (`decide`,
 * `couple`, `notify`) and when `tick` changes. A failed read is kept (and shown) instead of an empty list. */
function useApprovals(coupleId:string|undefined,tick=0){
 const {call}=useFe();const [items,setItems]=useState<Approval[]|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{
  if(!coupleId)return;
  call('decide.approvals',{},approvalsRes,{profileId:coupleId,fresh:true}).then(r=>{setItems(r.items);setError(null);}).catch(setError);
 },[call,coupleId]);
 useEffect(()=>{load();},[load,tick]);
 useLive(['decide','couple','notify'],load);
 return {items,error,load};
}

/** One approval by id in any state (`approval.get`), for the sheet and the result card. Re-read on every live change
 * of decisions, so a decision on the other device closes this one at once. */
function useApproval(id:string){
 const {call}=useFe();const [a,setA]=useState<Approval|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{
  call('approval.get',{id},oneRes,{asAccount:true,fresh:true}).then(r=>{setA(r.approval);setError(null);}).catch(setError);
 },[call,id]);
 useEffect(()=>{setA(null);setError(null);load();},[load]);
 useLive(['decide','couple','notify'],load);
 return {a,error,load};
}

/** «Участники» — both partners. */
export function CoupleMembers(){
 const {t}=useI18n();const members=useCoupleMembers();
 if(!members?.length)return null;
 return <Group title={t('fe.cw.members')}><Card list>
  {members.map(m=><Row key={m.profileId} av={<Av name={nameOf(m)} seed={m.profileId} size="sm"/>} title={<Who name={nameOf(m)} nick={m.handle}/>}/>)}
 </Card></Group>;
}

/** Banners of the couple's open changes on the Me tab; `tick` changes after every own write so a new `pending` shows
 * at once. */
export function CouplePending({tick,onDecided}:{base:CoupleBase,tick:number,onDecided:(msg:string)=>void}){
 const {acting}=useFe();const {t}=useI18n();const members=useCoupleMembers();
 const coupleId=acting?.kind==='couple'?acting.id:undefined;
 const {items,load}=useApprovals(coupleId,tick);const [open,setOpen]=useState<string|null>(null);
 if(!coupleId||!items?.length)return null;
 const other=nameOf(members?.find(m=>!m.me));
 return <>
  {items.map(a=><Alert key={a.id} kind={a.mine?'plain':'warn'} icon={Clock} className="me18-ban" onClick={()=>setOpen(a.id)}>
   <b>{a.mine?t('fe.cw.mineTitle',{name:other}):t('fe.cw.theirsTitle',{name:other})}</b>
   {kindTitle(a,t)} · {a.mine?t('fe.cw.mineSub'):t('fe.cw.theirsSub')}
  </Alert>)}
  {open&&<ApprovalView key={open} id={open} onClose={()=>setOpen(null)} onDone={msg=>{setOpen(null);load();onDecided(msg);}}/>}
 </>;
}

/** Q01 «Ждёт подтверждения» (V21 jointWorkHTML): every open change of the couple as a row. A failed read says so with
 * «Повторить». The sheet itself is opened by id (`?approval=`), so it works for any state, on a cold start and when
 * another id comes while one is open. */
export function CoupleWork({coupleId,onOpen}:{coupleId:string,onOpen:(id:string)=>void}){
 const {t,locale}=useI18n();const members=useCoupleMembers(coupleId);
 const {items,error,load}=useApprovals(coupleId);
 if(error&&!items)return <Group title={t('fe.c6.work')}><Alert kind="err" action={<Btn kind="text" size="sm" auto onClick={load}>{t('fe.ap.retry')}</Btn>}>{feErrorMessage(error,t)}</Alert></Group>;
 if(!items?.length)return null;
 const other=nameOf(members?.find(m=>!m.me));const me=nameOf(members?.find(m=>m.me));
 const date=(iso:string)=>new Date(iso).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'});
 return <Group title={t('fe.c6.work')}><Card list>
  {items.map(a=><Row key={a.id} icon={Clock} tone={!a.mine?'l':undefined} title={kindTitle(a,t)}
   sub={[a.mine?me:other,date(a.createdAt)].filter(Boolean).join(' · ')} onClick={()=>onOpen(a.id)}/>)}
 </Card></Group>;
}

/** Where the author changes a refused or outdated proposal and sends it again (owner decision 1): the editor of that
 * kind, filled with what was proposed (`state.resend`); null — nothing to edit. */
function resendRoute(a:Approval):{to:string,state?:unknown}|null{
 const id=a.targetId??a.object?.id??null;const c=a.change??{};
 switch(a.kind){
  case 'post.publish':return id?{to:`/n/feed/post/${id}/edit`}:null;
  case 'post.edit':return id?{to:`/n/feed/post/${id}/edit`,state:{resend:c.post}}:null;
  case 'event.submit':{const d=a.outcome?.eventDraftId;return typeof d==='string'?{to:'/n/events/new?draft='+d}:{to:'/n/me/events'};}
  case 'event.update':return id?{to:`/n/events/${id}/edit`}:null;
  case 'event.rsvp':case 'event.apply':return id?{to:`/n/events/${id}`}:null;
  case 'access.grant':return {to:'/n/me/access?tab=byme'};
  case 'private.on':return {to:'/n/me?layer=priv'};
  case 'profile.update':return {to:'/n/me/edit?only=basics',state:{resend:c}};
  case 'profile.photos':return {to:'/n/me/edit?only=media'};
  case 'profile.setVisibility':return {to:'/n/me?layer=vis'};
  case 'interests.set':return {to:'/n/me/interests'};
  case 'community.create':return {to:'/n/communities/new',state:{resend:c}};
  case 'community.join':return typeof c.communityId==='string'?{to:'/n/communities/'+c.communityId}:null;
  case 'link.propose':case 'link.accept':case 'link.visibility':return {to:'/n/me/links'};
  case 'chat.request':return typeof c.profileId==='string'?{to:'/n/people/'+c.profileId}:null;
  default:return null;
 }
}

/** A person or profile the change concerns, as a line. */
function Subject({p,label}:{p:{id:string,handle?:string|null|undefined,name?:string|null|undefined},label:string}){
 return <PersonLine av={<Av name={nameOf(p)} seed={p.id} size="sm"/>} name={nameOf(p)} sub={<>{label}{p.handle?' · @'+p.handle:''}</>}/>;
}

/** Everything the kit sheet shows for one approval, by kind: whom it concerns, before → after, the content as it would
 * go, what follows, the button pair. */
function useSheetParts(a:Approval){
 const {t,locale}=useI18n();const p=a.preview??null;
 const has=(k:string)=>t(k)!==k;
 const date=(iso:string)=>new Date(iso).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long'});
 const label=(f:string)=>has('fe.ap.f.'+f)?t('fe.ap.f.'+f):FIELDS.includes(f)?t('fe.cw.field.'+f):t('fe.ap.f.other');
 const val=(f:string,v:unknown):string=>{
  if(v===null||v===undefined||v===''||(Array.isArray(v)&&!v.length))return t('fe.ap.empty');
  if(f==='location')return v?t('fe.ap.shared'):t('fe.ap.empty');
  if(f==='privateOn')return v?t('fe.cw.on'):t('fe.cw.off');
  if(typeof v==='boolean')return v?t('fe.ap.on'):t('fe.ap.off');
  if(f==='audience'&&typeof v==='string')return has('fe.ap.aud.'+v)?t('fe.ap.aud.'+v):v;
  if(f==='rsvp'&&typeof v==='string')return has('fe.ap.rsvp.'+v)?t('fe.ap.rsvp.'+v):v;
  if(f==='linkVis'&&typeof v==='string')return has('fe.ap.vis.'+v)?t('fe.ap.vis.'+v):v;
  if((f==='startsAt'||f==='endsAt')&&typeof v==='string')return new Date(v).toLocaleString(locale==='en'?'en':'ru',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
  if(f==='interest'&&typeof v==='object'){const x=v as {value?:number|null,mark?:string|null};return x.mark?t('fe.ap.mark.'+x.mark):x.value?t('fe.ap.mark.value',{n:x.value}):t('fe.ap.empty');}
  if(f==='cityId'&&typeof v==='object'){const c=v as {ru?:string|null,en?:string|null};return (locale==='en'?c.en:c.ru)??t('fe.ap.empty');}
  if(Array.isArray(v))return v.map(x=>val(f,x)).join(', ');
  if(f==='messagesFrom'&&typeof v==='string')return t('fe.rq.set.'+v);
  if(typeof v==='string'&&VALUES.includes(v))return t('fe.cw.val.'+v);
  if(typeof v==='object')return t('fe.cw.changed');
  return String(v);
 };
 const skip=a.kind==='post.edit'?['body']:[];
 const changes=(p?.rows??[]).filter(r=>!skip.includes(r.field)).map(r=>({key:r.field,label:label(r.field),
  // Nothing struck through when there was nothing before.
  before:r.field==='exactAddress'||r.before===undefined||r.before===null||r.before===''||(Array.isArray(r.before)&&!r.before.length)||(a.kind==='private.on'||r.field==='location')&&!r.before?undefined:val(r.field,r.before),
  after:r.field==='exactAddress'?t('fe.ap.addressMoves'):val(r.field,r.after)}));
 const direct=a.kind==='community.join'&&p?.community?.direct===true;
 const v=a.kind==='community.join'&&!direct?'.request':'';
 let subject:ReactNode=null;let content:ReactNode=null;
 const sub=p?.subject;
 if(sub)subject=<Subject p={sub} label={t(a.kind.startsWith('event.')?'fe.ap.org':a.kind==='community.join'?'fe.ap.host':'fe.ap.to')}/>;
 if(p?.post){const x=p.post;
  content=<>
   <ReviewPost title={x.title||undefined} meta={[x.audience?t('fe.ap.post.audience',{aud:val('audience',x.audience)}):'',x.media?t('fe.ap.post.media',{n:x.media}):'',x.community?t('fe.ap.post.in',{name:x.community.name}):''].filter(Boolean).join(' · ')||undefined}>
    {x.body?<p>{x.body}</p>:null}</ReviewPost>
   {a.kind==='post.edit'&&p.before?.body&&p.before.body!==x.body&&<ReviewPost title={t('fe.ap.post.before')}><p>{p.before.body}</p></ReviewPost>}
  </>;
 }else if(p?.event){const e=p.event;const pt=e.startsAt?evParts({startsAt:e.startsAt,tz:e.tz??null},locale):null;
  content=<>
   <EventTile row cover={<NamedPlate k={null} icon={Calendar}/>} day={pt?.day} month={pt?.month}
    place={e.format==='online'?t('fe.c6.online'):(locale==='en'?e.city?.en:e.city?.ru)??''} placeIcon={e.format==='online'?Video:MapPin}
    time={pt?pt.time+' · '+pt.zone:undefined} title={e.title??''}/>
   {p.application&&<KeyValues rows={[...p.application.answers.map((x,i):[string,ReactNode]=>[x.question||t('fe.ap.app.question')+' '+(i+1),x.answer]),
    [t('fe.ap.app.note'),p.application.note||t('fe.ap.app.noNote')]]}/>}
  </>;
 }else if(p?.community){const c=p.community;
  content=<>
   <ReviewPost title={c.name}>{c.description?<p>{c.description}</p>:null}</ReviewPost>
   <KeyValues rows={[[t('fe.ap.club.rules'),c.rules.join(' · ')],[t('fe.ap.club.question'),c.question??''],[t('fe.ap.club.answer'),c.answer??''],
    [t('fe.ap.club.kind'),has('fe.ap.club.privacy.'+c.privacy)?t('fe.ap.club.privacy.'+c.privacy):'']]}/>
  </>;
 }else if(p?.access){const x=p.access;
  content=<KeyValues rows={[[t('fe.ap.access.what'),x.scopes.map(s=>has('fe.ap.scope.'+s)?t('fe.ap.scope.'+s):s).join(', ')],
   [t('fe.ap.access.term'),(has('fe.ap.access.term.'+x.term)?t('fe.ap.access.term.'+x.term):x.term)+(x.until?' · '+t('fe.ap.access.until',{date:date(x.until)}):'')]]}/>;
 }else if(p?.reply){content=<ReviewPost title={t('fe.ap.title.reply.create')}><p>{p.reply.body}</p></ReviewPost>;
 }else if(p?.message){content=<ReviewPost title={t('fe.ap.msg')} meta={p.message.photo?t('fe.ap.msgPhoto'):undefined}>{p.message.body?<p>{p.message.body}</p>:null}</ReviewPost>;
 }else if(p?.link){content=<KeyValues rows={[[t('fe.ap.link.kind'),has('fe.lk.kind.'+p.link.kind)?t('fe.lk.kind.'+p.link.kind):p.link.kind]]}/>;
 }else if(p?.photos){content=<Note>{t('fe.ap.photos',{now:p.photos.now,after:p.photos.after,adds:p.photos.adds})}</Note>;
 }else if(p?.location?.near){const c=p.location.near;content=<Note>{t('fe.ap.near',{city:(locale==='en'?c.en:c.ru)??''})}</Note>;}
 const k=KINDS.includes(a.kind)?a.kind:'profile.update';
 return {title:t('fe.ap.title.'+k),subject,changes,content,consequence:t('fe.ap.cons.'+k+v),yes:t('fe.ap.yes.'+k+v),no:t('fe.ap.no.'+k),date};
}

/** One approval by id, in the one kit sheet: the decision for the partner, «Отменить предложение» for the author while
 * it waits, the result card once it is closed (with «Изменить и отправить снова» for the author of a refused or
 * outdated one). Loading, an error with «Повторить» and «больше недоступно» are states of the same sheet. */
export function ApprovalView({id,onClose,onDone}:{id:string,onClose:()=>void,onDone?:(msg:string)=>void}){
 const {t}=useI18n();const {a,error,load}=useApproval(id);
 if(!a){
  const gone=error instanceof FeError&&error.status===404;
  return <ApprovalSheetKit title={t('fe.ap.loading')} state={error?'error':'loading'} error={gone?t('fe.ap.notFound'):error?feErrorMessage(error,t):undefined}
   onRetry={gone?undefined:load} retryLabel={t('fe.ap.retry')} onClose={onClose}/>;
 }
 return <ApprovalLoaded a={a} reload={load} onClose={onClose} onDone={onDone}/>;
}

function ApprovalLoaded({a,reload,onClose,onDone}:{a:Approval,reload:()=>void,onClose:()=>void,onDone?:((msg:string)=>void)|undefined}){
 const {call,setActing}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const members=useCoupleMembers(a.addressee?.id);
 const parts=useSheetParts(a);
 const [busy,setBusy]=useState('');const [failure,setFailure]=useState('');const [refusing,setRefusing]=useState(false);const [note,setNote]=useState('');
 const op=useRef(newOpId());
 const coupleId=a.addressee?.id;
 const checks=useChecks({note:'returnNote'},{note});
 const done=(state:string)=>{const msg=t('fe.ap.done.'+(['approved','rejected','cancelled','expired','stale'].includes(state)?state:'cancelled'));if(onDone)onDone(msg);else{toast(msg,{type:'ok'});reload();}};
 const run=async(kind:'approve'|'reject'|'cancel')=>{
  if(busy||!coupleId)return;if(kind==='reject'&&!checks.submit())return;setBusy(kind);setFailure('');
  try{
   const comment=note.trim();
   const r=kind==='cancel'?await call('decide.cancel',{opId:op.current,approvalId:a.id},decided,{profileId:coupleId})
    :await call('decide.approval',{opId:op.current,approvalId:a.id,choice:kind,...(kind==='reject'&&comment?{comment}:{})},decided,{profileId:coupleId});
   done(r.state??(kind==='cancel'?'cancelled':kind==='approve'?'approved':'rejected'));
  }catch(e){
   // Decided meanwhile on the other device: show how it ended instead of an error.
   if(e instanceof FeError&&e.status===409){reload();}
   else if(!checks.fromServer(e,{comment:'note'}))setFailure(feErrorMessage(e,t));
   op.current=newOpId();
  }finally{setBusy('');}
 };
 const open=a.state==='pending';
 const resend=!open&&a.mine&&(a.state==='rejected'||a.state==='stale')?resendRoute(a):null;
 const go=(r:{to:string,state?:unknown})=>{if(coupleId)setActing(coupleId);onClose();navigate(r.to,r.state?{state:r.state}:undefined);};
 const initiator=nameOf(a.initiator);
 const decider=a.decidedBy?nameOf(a.decidedBy):null;
 const when=a.decidedAt?parts.date(a.decidedAt):'';
 const status=open?undefined:{tone:a.state==='approved'?'ok' as const:a.state==='rejected'||a.state==='stale'?'warn' as const:'plain' as const,
  title:t('fe.ap.st.'+a.state),text:[decider&&(a.state==='approved'||a.state==='rejected')?t('fe.ap.stWho',{name:decider,date:when}):when?t('fe.ap.stDate',{date:when}):'',t('fe.ap.stText.'+a.state)].filter(Boolean).join('. '),
  comment:a.comment??undefined};
 const objectNote=a.objectState==='deleted'?t('fe.ap.gone.deleted'):a.objectState==='unavailable'?t('fe.ap.gone.unavailable'):undefined;
 const foot=open
  ?a.mine?<Btn kind="soft" disabled={!!busy} busy={busy==='cancel'} onClick={()=>void run('cancel')}>{t('fe.ap.cancel')}</Btn>
   :refusing?<Actions stack><Btn kind="danger" disabled={!!busy} busy={busy==='reject'} onClick={()=>void run('reject')}>{parts.no}</Btn><Btn kind="text" disabled={!!busy} onClick={()=>setRefusing(false)}>{t('fe.cancel')}</Btn></Actions>
   :<Actions stack><Btn disabled={!!busy} busy={busy==='approve'} onClick={()=>void run('approve')}>{parts.yes}</Btn><Btn kind="soft" disabled={!!busy} onClick={()=>setRefusing(true)}>{parts.no}</Btn></Actions>
  :resend?<Btn icon={Pencil} onClick={()=>go(resend)}>{t('fe.ap.resend')}</Btn>:undefined;
 return <ApprovalSheetKit title={parts.title} sub={a.addressee?.name??undefined} state={open?'open':'closed'} status={status}
  by={a.mine?t('fe.ap.byMe'):t('fe.ap.by',{name:initiator})}
  subject={parts.subject} changes={parts.changes} consequence={open?parts.consequence:undefined} objectNote={objectNote} foot={foot} onClose={onClose}>
  {parts.content}
  {open&&a.mine&&<Note>{t('fe.ap.waitTheirs',{name:nameOf(members?.find(m=>!m.me))})}</Note>}
  {open&&refusing&&<>
   <Note>{t('fe.ap.refuse')}</Note>
   <Field id={'fe-ap-note-'+a.id} name="note" error={checks.error('note')} label={t('fe.ap.comment')} optional={t('fe.c6.optional')}>
    <TextArea id={'fe-ap-note-'+a.id} name="returnNote" rows={3} {...checks.input('note')} value={note} placeholder={t('fe.ap.commentPh')} onChange={e=>setNote(e.target.value)}/>
   </Field>
   <Counter n={textLength(note)} max={FIELD.returnNote.max}/>
  </>}
  {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
 </ApprovalSheetKit>;
}

/** The «Пара» group of the visibility layer (prototype meVisLayer, owner 'couple'): partner approval and unlinking —
 * both are decided on the pair screen (Q01/Q06), which shows the current setting and the confirmation. */
export function CoupleVisGroup(){
 const {t}=useI18n();const navigate=useNavigate();
 return <Group title={t('fe.cw.pair')}><Card list>
  <Row icon={Check} title={t('fe.mx.cp.approval')} sub={t('fe.mx.cp.approvalSub')} onClick={()=>navigate('/n/me/pair?trust=1')}/>
  {/* `danger` as a class keeps the chevron: this row opens a screen, the decision is made there. */}
  <Row icon={X} className="danger" title={t('fe.mx.cp.unlink')} sub={t('fe.mx.cp.unlinkSub')} onClick={()=>navigate('/n/me/pair?stop=1')}/>
 </Card></Group>;
}

const decideList=z.object({ok:z.literal(true),items:z.array(z.object({kind:z.string(),addressee:z.uuid().nullable().optional()}).passthrough())});

/** V21 dockMe / meSwitch: «Действовать как» — the person and the couple as cards with what waits on each; the card
 * switches to that profile (the chosen one opens it), the end button switches and opens it. */
/** The couple one can act as: only an active one (a paused or stopped couple acts as nobody). The one rule for every
 * «Действовать как» entry — the dock's «Я» and the «Я» header — so they never disagree. */
export function activeCouple<T extends {kind:string,state?:string|undefined}>(profiles:readonly T[]):T|undefined{return profiles.find(p=>p.kind==='couple'&&p.state==='active');}

export function ActAsSheet({onClose}:{onClose:()=>void}){
 const {state,acting,setActing,call}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [waits,setWaits]=useState<Record<string,number>>({});
 useEffect(()=>{call('decide.list',{},decideList,{asAccount:true}).then(r=>{const n:Record<string,number>={};
  for(const d of r.items){const k=d.addressee??'me';n[k]=(n[k]??0)+1;}setWaits(n);}).catch(()=>{});},[call]);
 if(state.status!=='ready'||!acting)return null;
 const profiles=state.boot.profiles.filter(p=>p.state!=='deleted');
 const person=profiles.find(p=>p.kind==='person');const couple=profiles.find(p=>p.kind==='couple'&&!p.ended);const archive=profiles.find(p=>p.kind==='couple'&&p.ended);
 const cards=[person,couple,archive].filter((x):x is NonNullable<typeof x>=>!!x);
 const open=(id:string)=>{setActing(id);onClose();navigate('/n/me');};
 const pick=(id:string)=>{
  if(id===acting.id){open(id);return;}
  setActing(id);onClose();
  const x=cards.find(c=>c.id===id);
  toast(x?.kind==='couple'?t('fe.c6.nowUs',{name:x.name||x.handle||''}):t('fe.c6.nowMe'),{type:'ok'});
 };
 return <Sheet title={t('fe.c6.actAs')} onClose={onClose}>
  <ActorCards label={t('fe.c6.actAs')}>
   {cards.map(x=>{const n=(waits[x.id]??0)+(x.kind==='person'?(waits.me??0):0);const on=x.id===acting.id;
    return <ActorCard key={x.id} selected={on} av={<Av name={x.name||x.handle||'?'} seed={x.id} src={x.avatar}/>} name={x.name||x.handle||'?'}
     dot={n>0} sub={n>0?t('fe.c6.waits',{n}):x.ended?t('fe.me.coupleArchive'):x.kind==='couple'?t('fe.me.coupleProfile'):t('fe.me.personalProfile')}
     onPick={()=>pick(x.id)} onOpen={()=>open(x.id)} openLabel={on?t('fe.c6.openProfile'):x.kind==='couple'?t('fe.c6.openCouple'):t('fe.c6.openMine')}/>;})}
  </ActorCards>
 </Sheet>;
}
