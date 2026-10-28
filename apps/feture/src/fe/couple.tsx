import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Calendar,Check,Clock,Eye,MapPin,Pencil,Video,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {ActorCard,ActorCards,Alert,Av,Btn,Card,Counter,EventTile,Field,Group,Note,ReturnNote,ReviewMeta,ReviewPost,Row,Sheet,TextArea} from './kit';
import {NamedPlate} from './comm-kit';
import {useFe,useRealtime} from './session';
import {useToast} from './toast';
import {FIELD,textLength,useChecks} from './kit/validate';

/** V21 couple approvals (Q03 profile of the couple, Q01 «Ждёт подтверждения», N01 joint items): everything a partner
 * proposed for the couple (`decide.approvals`) — profile changes, posts, events, private access — with what would
 * change (diff, post, event card, version), «Одобрить / Вернуть на доработку» (with an optional note) for the partner,
 * and for the author «Изменить / Отменить», also after it came back «на доработку» with the partner's note.
 * The «Действовать как» sheet of the dock «Я» lives here too. */
const member=z.object({me:z.boolean(),profileId:z.uuid(),handle:z.string().nullable(),name:z.string().nullable()}).passthrough();
const coupleRes=z.object({ok:z.literal(true),couple:z.object({id:z.uuid(),members:z.array(member)}).passthrough()});
const evCard=z.object({id:z.uuid(),title:z.string().nullable(),format:z.string().nullable().optional(),startsAt:z.string().nullable().optional(),
 city:z.object({ru:z.string().nullable(),en:z.string().nullable()}).nullable().optional()}).passthrough();
const preview=z.object({
 post:z.object({title:z.string().nullable().optional(),body:z.string().nullable().optional(),media:z.number().optional(),changed:z.boolean().optional()}).passthrough().optional(),
 event:evCard.optional(),rsvp:z.string().nullable().optional(),
 profile:z.object({id:z.uuid(),handle:z.string().nullable(),name:z.string().nullable()}).passthrough().nullable().optional(),scopes:z.array(z.string()).optional(),
}).passthrough().nullable();
const approval=z.object({id:z.uuid(),kind:z.string(),targetId:z.uuid().nullable().optional(),change:z.record(z.string(),z.unknown()).nullable(),summary:z.array(z.unknown()).nullable(),
 mine:z.boolean(),state:z.enum(['pending','returned']).catch('pending'),comment:z.string().nullable().optional(),version:z.number().optional(),preview:preview.optional().catch(null),
 createdAt:z.string(),expiresAt:z.string(),returnedAt:z.string().nullable().optional()});
const approvalsRes=z.object({ok:z.literal(true),items:z.array(approval)});
const decided=z.object({ok:z.literal(true),state:z.string().optional()}).passthrough();
type Member=z.infer<typeof member>;
export type Approval=z.infer<typeof approval>;
/** What the sheet compares against: the couple's current public basics (the Me tab has them; Q01 does not). */
export type CoupleBase={name:string|null,bio:string,photos:{id:string}[]};

const PROFILE_KINDS=['profile.update','profile.photos','profile.setVisibility','interests.set'];
const KINDS=[...PROFILE_KINDS,'post.publish','post.edit','event.submit','event.update','event.rsvp','event.apply','access.grant','private.on','community.create','community.join','link.propose','link.accept','link.visibility','location.set'];
const FIELDS=['name','bio','handle','cityId','showAge','detailsVis','photos','discoverMode','acceptProfileLikes','requestsFrom','linksFrom','mentionsFrom','activityVis','showLikes'];
const VALUES=['visible','hidden','all','matches','follow','followers','none'];
const nameOf=(m:{name?:string|null,handle?:string|null}|undefined|null)=>m?(m.name||(m.handle?'@'+m.handle:'?')):'?';
const kindTitle=(a:Approval,t:(k:string)=>string)=>t('fe.cw.kind.'+(KINDS.includes(a.kind)?a.kind:'other'));

/** The couple's members, from `couple.get` (as the couple, whoever is acting). */
function useCoupleMembers(coupleId?:string){
 const {call,acting}=useFe();const [members,setMembers]=useState<Member[]|null>(null);
 const id=coupleId??(acting?.kind==='couple'?acting.id:undefined);
 useEffect(()=>{
  if(!id)return;
  const ctl=new AbortController();
  call('couple.get',{},coupleRes,{profileId:id,signal:ctl.signal}).then(r=>setMembers(r.couple.members)).catch(()=>{});
  return ()=>ctl.abort();
 },[call,id]);
 return members;
}

/** The couple's open changes, both directions; reloads on realtime «decide» signals and when `tick` changes. */
function useApprovals(coupleId:string|undefined,tick=0){
 const {call}=useFe();const [items,setItems]=useState<Approval[]|null>(null);
 const load=useCallback(()=>{
  if(!coupleId)return;
  call('decide.approvals',{},approvalsRes,{profileId:coupleId,fresh:true}).then(r=>setItems(r.items)).catch(()=>{});
 },[call,coupleId]);
 useEffect(()=>{load();},[load,tick]);
 useRealtime(['decide'],load);
 return {items,load};
}

/** «Участники» — both partners. */
export function CoupleMembers(){
 const {t}=useI18n();const members=useCoupleMembers();
 if(!members?.length)return null;
 return <Group title={t('fe.cw.members')}><Card list>
  {members.map(m=><Row key={m.profileId} av={<Av name={nameOf(m)} seed={m.profileId} size="sm"/>} title={nameOf(m)} sub={m.handle&&m.name?'@'+m.handle:undefined}/>)}
 </Card></Group>;
}

/** Banners of the couple's open changes on the Me tab; `tick` changes after every own write so a new `pending` shows
 * at once. A returned one shows the partner's note right on the banner (V21 pairReturned). */
export function CouplePending({base,tick,onDecided}:{base:CoupleBase,tick:number,onDecided:(msg:string)=>void}){
 const {acting}=useFe();const {t}=useI18n();const members=useCoupleMembers();
 const coupleId=acting?.kind==='couple'?acting.id:undefined;
 const {items,load}=useApprovals(coupleId,tick);const [open,setOpen]=useState<Approval|null>(null);
 if(!coupleId||!items?.length)return null;
 const other=nameOf(members?.find(m=>!m.me));
 return <>
  {items.map(a=>{const back=a.state==='returned';
   return <Alert key={a.id} kind={back&&a.mine||!a.mine&&!back?'warn':'plain'} icon={back?Pencil:Clock} className="me18-ban" onClick={()=>setOpen(a)}>
    <b>{back?(a.mine?t('fe.c6.backMine'):t('fe.c6.backTheirs')):a.mine?t('fe.cw.mineTitle',{name:other}):t('fe.cw.theirsTitle',{name:other})}</b>
    {kindTitle(a,t)} · {back?(a.comment?'«'+a.comment+'»':t('fe.c6.noComment')):a.mine?t('fe.cw.mineSub'):t('fe.cw.theirsSub')}
   </Alert>;})}
  {open&&<ApprovalSheet a={open} base={base} coupleId={coupleId} partner={other} onClose={()=>setOpen(null)} onDone={msg=>{setOpen(null);load();onDecided(msg);}}/>}
 </>;
}

/** Q01 «Ждёт подтверждения» (V21 jointWorkHTML): every open change of the couple as a row; `openId` opens one at once
 * (a «Нужно решить» item links here). */
export function CoupleWork({coupleId,openId,onChanged}:{coupleId:string,openId?:string|null|undefined,onChanged?:()=>void}){
 const {t,locale}=useI18n();const toast=useToast();const members=useCoupleMembers(coupleId);
 const {items,load}=useApprovals(coupleId);const [open,setOpen]=useState<Approval|null>(null);
 const opened=useRef(false);
 useEffect(()=>{if(opened.current||!openId||!items)return;opened.current=true;const a=items.find(x=>x.id===openId);if(a)setOpen(a);},[items,openId]);
 if(!items?.length)return null;
 const other=nameOf(members?.find(m=>!m.me));const me=nameOf(members?.find(m=>m.me));
 const date=(iso:string)=>new Date(iso).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'});
 return <Group title={t('fe.c6.work')}><Card list>
  {items.map(a=>{const back=a.state==='returned';
   const sub=[a.mine?me:other,a.version?t('fe.c6.version',{n:a.version}):'',back?t('fe.c6.onRework')+(a.comment?' · «'+a.comment+'»':''):date(a.createdAt)].filter(Boolean).join(' · ');
   return <Row key={a.id} icon={back?Pencil:Clock} tone={!a.mine&&!back||a.mine&&back?'l':undefined} title={kindTitle(a,t)} sub={sub} onClick={()=>setOpen(a)}/>;})}
 </Card>
  {open&&<ApprovalSheet a={open} coupleId={coupleId} partner={other} onClose={()=>setOpen(null)} onDone={msg=>{setOpen(null);load();toast(msg,{type:'ok'});onChanged?.();}}/>}
 </Group>;
}

/** Where the author reworks a change (V21 jointEdit / «Изменить профиль» / «Изменить событие»); null — nothing to edit. */
function editRoute(a:Approval):string|null{
 const id=a.targetId;
 switch(a.kind){
  case 'post.publish':case 'post.edit':return id?`/n/feed/post/${id}/edit`:null;
  case 'event.submit':case 'event.update':return id?`/n/events/${id}/edit`:null;
  case 'event.rsvp':case 'event.apply':return id?`/n/events/${id}`:null;
  case 'access.grant':case 'private.on':return '/n/me?layer=priv';
  case 'profile.update':return '/n/me/edit';
  case 'profile.photos':return '/n/me/edit?only=media';
  case 'profile.setVisibility':return '/n/me?layer=vis';
  case 'interests.set':return '/n/me/interests';
  default:return null;
 }
}

/** `ACT.pairReview` / `ACT.jointReview` / `ACT.pairReturned` in one sheet: who and which version, what would change,
 * then the decision (partner) or «Изменить / Отменить» (author). */
export function ApprovalSheet({a,base,coupleId,partner,onClose,onDone}:{a:Approval,base?:CoupleBase|undefined,coupleId:string,partner:string,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call,setActing}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [returning,setReturning]=useState(false);
 const op=useRef(newOpId());
 const back=a.state==='returned';
 const run=async(action:'approve'|'cancel')=>{
  if(busy)return;setBusy(true);setFailure('');
  try{
   const r=action==='cancel'?await call('decide.cancel',{opId:op.current,approvalId:a.id},decided,{profileId:coupleId})
    :await call('decide.approval',{opId:op.current,approvalId:a.id,choice:'approve'},decided,{profileId:coupleId});
   const state=r.state??(action==='cancel'?'cancelled':'approved');
   onDone(t('fe.cw.done.'+(['approved','returned','cancelled','expired'].includes(state)?state:'cancelled')));
  }catch(e){setFailure(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}
 };
 // Editing happens as the couple: the editor and the profile preview read the acting profile.
 const go=(to:string,state?:unknown)=>{setActing(coupleId);onClose();navigate(to,state?{state}:undefined);};
 const edit=a.mine?editRoute(a):null;
 const ev=a.preview?.event;
 if(returning)return <ReturnSheet a={a} coupleId={coupleId} onClose={()=>setReturning(false)} onDone={onDone}/>;
 const foot=a.mine
  ?<>{edit&&<Btn kind={back?'primary':'soft'} icon={Pencil} disabled={busy} onClick={()=>go(edit)}>{t('fe.c6.edit.'+(a.kind.startsWith('event.')?(a.kind==='event.rsvp'||a.kind==='event.apply'?'answer':'event'):a.kind.startsWith('post.')?'post':'other'))}</Btn>}
   <Btn kind="soft" className={edit?'mt8':undefined} disabled={busy} busy={busy} onClick={()=>run('cancel')}>{t('fe.cw.cancel')}</Btn></>
  :back?undefined
  :<><Btn disabled={busy} busy={busy} onClick={()=>run('approve')}>{t('fe.cw.approve')}</Btn><Btn kind="soft" className="mt8" disabled={busy} onClick={()=>setReturning(true)}>{t('fe.cw.return')}</Btn></>;
 return <Sheet title={t('fe.c6.sheet.'+(a.kind.startsWith('post.')?'post':a.kind.startsWith('event.')?'event':a.kind==='access.grant'?'access':PROFILE_KINDS.includes(a.kind)?'profile':'other'))} sub={kindTitle(a,t)} onClose={onClose} foot={foot}>
  <ReviewMeta by={a.mine?t('fe.c6.byMe'):t('fe.c6.by',{name:partner})} version={a.version?t('fe.c6.version',{n:a.version}):undefined}/>
  {back?<><p className="lead">{a.mine?t('fe.c6.backLeadMine',{name:partner}):t('fe.c6.backLeadTheirs',{name:partner})}</p>{a.comment?<ReturnNote>{a.comment}</ReturnNote>:<Note>{t('fe.c6.noComment')}</Note>}</>
   :<p className="lead">{a.mine?t('fe.c6.leadMine',{name:partner}):t('fe.c6.leadTheirs',{name:partner})}</p>}
  <div className="mt12"><Preview a={a} base={base}/></div>
  {PROFILE_KINDS.includes(a.kind)&&a.kind!=='interests.set'&&<Btn kind="text" auto icon={Eye} className="mt12" onClick={()=>go('/n/me/preview',{proposal:a.change??{}})}>{back?t('fe.c6.sentVersion'):t('fe.c6.whole')}</Btn>}
  {ev&&<Btn kind="soft" size="md" icon={Calendar} className="mt12" onClick={()=>go('/n/events/'+ev.id)}>{t('fe.c6.openEvent')}</Btn>}
  {failure&&<Alert kind="err" noIcon className="mt12">{failure}</Alert>}
 </Sheet>;
}

/** What would change: the profile diff, the post, the event card, the access to open. */
function Preview({a,base}:{a:Approval,base?:CoupleBase|undefined}){
 const {t,locale}=useI18n();const p=a.preview;
 if(p?.post)return <>
  <ReviewPost title={p.post.title||undefined} meta={p.post.media?t('fe.c6.media',{n:p.post.media}):undefined}>{p.post.body?<p>{p.post.body}</p>:null}</ReviewPost>
  {p.post.changed&&<Alert kind="warn" className="mt12">{t('fe.c6.changed')}</Alert>}
 </>;
 if(p?.event){const e=p.event;const d=e.startsAt?new Date(e.startsAt):null;const lc=locale==='en'?'en':'ru';
  return <>
   <EventTile row cover={<NamedPlate k={null} icon={Calendar}/>} day={d?d.getDate():undefined} month={d?d.toLocaleDateString(lc,{month:'short'}):undefined}
    place={e.format==='online'?t('fe.c6.online'):(locale==='en'?e.city?.en:e.city?.ru)??''} placeIcon={e.format==='online'?Video:MapPin}
    time={d?d.toLocaleTimeString(lc,{hour:'2-digit',minute:'2-digit'}):undefined} title={e.title??''}/>
   {a.kind==='event.rsvp'&&p.rsvp&&<Note className="mt8">{t('fe.c6.rsvp.'+(['going','interested','not_going'].includes(p.rsvp)?p.rsvp:'other'))}</Note>}
  </>;}
 if(a.kind==='access.grant'&&p)return <ReviewPost byline={p.profile?<><Av name={nameOf(p.profile)} seed={p.profile.id} size="sm"/><div><b>{nameOf(p.profile)}</b>{p.profile.handle&&<small>@{p.profile.handle}</small>}</div></>:undefined}
  meta={t('fe.c6.accessNote')}><p>{(p.scopes??[]).map(s=>t('fe.c6.scope.'+s)!=='fe.c6.scope.'+s?t('fe.c6.scope.'+s):s).join(', ')||t('fe.c6.accessAll')}</p></ReviewPost>;
 return <Diff a={a} base={base}/>;
}

/** `proposalDiff()` — field by field, the old value struck through where the screen knows it. */
function Diff({a,base}:{a:Approval,base?:CoupleBase|undefined}){
 const {t}=useI18n();const c=a.change??{};
 const label=(f:string)=>t('fe.cw.field.'+(FIELDS.includes(f)?f:'other'));
 const word=(v:unknown):string=>{
  if(v===null||v===undefined||v==='')return t('fe.cw.empty');
  if(typeof v==='boolean')return v?t('fe.cw.on'):t('fe.cw.off');
  if(Array.isArray(v))return v.map(word).join(', ');
  if(typeof v==='string'&&VALUES.includes(v))return t('fe.cw.val.'+v);
  if(typeof v==='string'&&['only','granted'].includes(v))return t('fe.reg.vis.'+v);
  if(typeof v==='object')return t('fe.cw.changed');
  return String(v).slice(0,300);
 };
 const rows:{k:string,label:string,was?:string,now:string}[]=[];
 if(a.kind==='profile.update'){
  for(const [k,v] of Object.entries(c)){if(k==='rev')continue;
   const was=!base?undefined:k==='name'?base.name??'':k==='bio'?base.bio:undefined;
   rows.push({k,label:label(k),now:word(v),...(was!==undefined&&was!==v?{was:was||t('fe.cw.empty')}:{})});}
 }else if(a.kind==='profile.photos'){
  const ids=Array.isArray(c.assetIds)?c.assetIds:[];const adds=Array.isArray(c.adds)?c.adds:[];
  rows.push({k:'photos',label:label('photos'),...(base?{was:String(base.photos.length)}:{}),now:t('fe.cw.photosNow',{n:ids.length})+' · '+t('fe.cw.photosAdd',{n:adds.length})});
 }else if(a.kind==='profile.setVisibility'&&typeof c.setting==='string'){
  rows.push({k:c.setting,label:label(c.setting),now:word(c.value)});
 }else for(const s of a.summary??[])if(typeof s==='string')rows.push({k:s,label:label(s),now:word(c[s])});
 if(!rows.length)return <Note>{t('fe.cw.noDiff')}</Note>;
 return <dl className="diff">{rows.map(r=><div key={r.k}><dt>{r.label}</dt><dd>{r.was!==undefined&&<div className="was">{r.was}</div>}<div className="now">{r.now}</div></dd></div>)}</dl>;
}

/** V21 returnAsk → returnSend: «Вернуть на доработку» with an optional note (≤ 300) the author reads. */
function ReturnSheet({a,coupleId,onClose,onDone}:{a:Approval,coupleId:string,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [note,setNote]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const op=useRef(newOpId());const rsvp=a.kind==='event.rsvp';
 const checks=useChecks({note:'returnNote'},{note});
 const send=async()=>{
  if(busy||!checks.submit())return;setBusy(true);setFailure('');
  try{const comment=note.trim();
   const r=await call('decide.approval',{opId:op.current,approvalId:a.id,choice:'return',...(comment?{comment}:{})},decided,{profileId:coupleId});
   const state=r.state??'returned';onDone(t('fe.cw.done.'+(['returned','expired','cancelled'].includes(state)?state:'returned')));}
  catch(e){if(!checks.fromServer(e,{comment:'note'}))setFailure(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}
 };
 return <Sheet title={rsvp?t('fe.c6.ret.titleRsvp'):t('fe.c6.ret.title')} sub={kindTitle(a,t)} onClose={onClose}
  foot={<Btn disabled={busy} busy={busy} onClick={()=>void send()}>{rsvp?t('fe.c6.ret.sendRsvp'):t('fe.c6.ret.send')}</Btn>}>
  <Field id="fe-ret-note" name="note" error={checks.error('note')} label={rsvp?t('fe.c6.ret.labelRsvp'):t('fe.c6.ret.label')} optional={t('fe.c6.optional')}>
   <TextArea id="fe-ret-note" name="returnNote" rows={3} {...checks.input('note')} value={note} placeholder={rsvp?t('fe.c6.ret.phRsvp'):t('fe.c6.ret.ph')} onChange={e=>setNote(e.target.value)}/>
  </Field>
  <Counter n={textLength(note)} max={FIELD.returnNote.max}/>
  {failure&&<Alert kind="err" noIcon className="mt12">{failure}</Alert>}
 </Sheet>;
}

/** The «Пара» group of the visibility layer (prototype meVisLayer, owner 'couple'): partner approval and unlinking —
 * both are decided on the pair screen (Q01/Q06), which shows the current setting and the confirmation. */
export function CoupleVisGroup(){
 const {t}=useI18n();const navigate=useNavigate();
 return <Group title={t('fe.cw.pair')}><Card list>
  <Row icon={Check} title={t('fe.mx.cp.approval')} sub={t('fe.mx.cp.approvalSub')} onClick={()=>navigate('/n/me/pair?trust=1')}/>
  {/* `danger` as a class keeps the chevron: this row opens a screen, the decision is made there. */}
  <Row icon={X} className="danger" title={t('fe.mx.cp.unlink')} onClick={()=>navigate('/n/me/pair?stop=1')}/>
 </Card></Group>;
}

const decideList=z.object({ok:z.literal(true),items:z.array(z.object({kind:z.string(),addressee:z.uuid().nullable().optional()}).passthrough())});

/** V21 dockMe / meSwitch: «Действовать как» — the person and the couple as cards with what waits on each; the card
 * switches to that profile (the chosen one opens it), the end button switches and opens it. */
export function ActAsSheet({onClose}:{onClose:()=>void}){
 const {state,acting,setActing,call}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [waits,setWaits]=useState<Record<string,number>>({});
 useEffect(()=>{call('decide.list',{},decideList,{asAccount:true}).then(r=>{const n:Record<string,number>={};
  for(const d of r.items){const k=d.addressee??'me';n[k]=(n[k]??0)+1;}setWaits(n);}).catch(()=>{});},[call]);
 if(state.status!=='ready'||!acting)return null;
 const profiles=state.boot.profiles.filter(p=>p.state!=='deleted');
 const person=profiles.find(p=>p.kind==='person');const couple=profiles.find(p=>p.kind==='couple');
 const cards=[person,couple].filter((x):x is NonNullable<typeof x>=>!!x);
 const open=(id:string)=>{setActing(id);onClose();navigate('/n/me');};
 const pick=(id:string)=>{
  if(id===acting.id){open(id);return;}
  setActing(id);onClose();
  const x=cards.find(c=>c.id===id);
  toast(x?.kind==='couple'?t('fe.c6.nowUs',{name:x.name||x.handle||''}):t('fe.c6.nowMe'),{type:'ok'});
 };
 return <Sheet title={t('fe.c6.actAs')} onClose={onClose}>
  <ActorCards label={t('fe.c6.actAs')} foot={t('fe.c6.actAsFoot')}>
   {cards.map(x=>{const n=(waits[x.id]??0)+(x.kind==='person'?(waits.me??0):0);const on=x.id===acting.id;
    return <ActorCard key={x.id} selected={on} av={<Av name={x.name||x.handle||'?'} seed={x.id} src={x.avatar}/>} name={x.name||x.handle||'?'}
     dot={n>0} sub={n>0?t('fe.c6.waits',{n}):x.kind==='couple'?t('fe.me.coupleProfile'):t('fe.me.personalProfile')}
     onPick={()=>pick(x.id)} onOpen={()=>open(x.id)} openLabel={on?t('fe.c6.openProfile'):x.kind==='couple'?t('fe.c6.openCouple'):t('fe.c6.openMine')}/>;})}
  </ActorCards>
 </Sheet>;
}
