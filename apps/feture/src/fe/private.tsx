import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {KeyRound,Camera,ChevronRight,Clock,Eye,Lock,LockOpen,MoreHorizontal,PenLine,Pencil,Send,Sparkles,Trash2,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {AddCard,Alert,Av,Btn,Card,CheckList,Chips,ChoiceChips,Counter,Empty,Field,FilePick,Group,IconBtn,Note,PersonLine,PhotoAdd,PhotoSlot,PhotoSlots,Pill,Quota,RequestCard,Row,SectionLabel,SelectRow,Sheet,Skel,Stack,TextArea,VaultHead,Veil} from './kit';
import {Uploader} from './kit/Uploader';
import {FIELD,textLength,useChecks} from './kit/validate';
import {useSendPhoto} from './media-upload';
import {InterestSheet,Jars,TopicPicker,sortJars,useInterests} from './interests';
import {AgeCheckLink,useAgeResume} from './age-check';
import {useFe} from './session';
import {when} from './feed';
import {useToast} from './toast';
import {Ask,AudTag} from './me-parts';
import {faceFields,NameBadges,withAge} from './faces';
import {PhotoViewer,mediaSrc} from './profile-extras';

/** Wave 4 «Приватное и доступы» (V21 X01, P06–P09, P11). Before access the server sends nothing real — only whether a
 * private part exists and what can be asked for; access is per profile, per part and for a term. Everything a person
 * decides here is read back from the server; nothing is assumed locally. */
export type Scope='info'|'photos'|'video';
const SCOPES:Scope[]=['info','photos','video'];
const scopes=z.array(z.string()).transform(a=>SCOPES.filter(s=>a.includes(s)));
const who=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),...faceFields}).nullable();
type Who=z.infer<typeof who>;
const quotaShape=z.object({left:z.number(),max:z.number(),resetsAt:z.string().nullable()});
type QuotaT=z.infer<typeof quotaShape>;
const quotaRes=quotaShape.passthrough();
const open=z.object({scopes,until:z.string().nullable()});
const incomingItem=z.object({id:z.uuid(),scopes,created_at:z.string(),alreadyOpen:open.nullable().optional(),profile:who});
type Incoming=z.infer<typeof incomingItem>;
const incoming=z.object({ok:z.literal(true),items:z.array(incomingItem),next:z.string().nullable().optional(),available:scopes.optional()});
const grantItem=z.object({scopes,until:z.string().nullable(),granted_at:z.string(),profile:who});
export type GrantItem=z.infer<typeof grantItem>;
export const grantsRes=z.object({ok:z.literal(true),items:z.array(grantItem),next:z.string().nullable().optional()});
const outItem=z.object({id:z.uuid(),scopes,state:z.string(),created_at:z.string(),decidedAt:z.string().nullable().optional(),reaskAt:z.string().nullable().optional(),
 granted:open.nullable().optional(),profile:who});
export type OutItem=z.infer<typeof outItem>;
export const outRes=z.object({ok:z.literal(true),items:z.array(outItem),next:z.string().nullable().optional(),quota:quotaShape.optional()});
const privMedia=z.object({id:z.uuid().optional(),src:z.record(z.string(),z.string()).nullable(),pending:z.boolean().optional(),kind:z.string().optional(),watermark:z.string().nullable().optional()}).passthrough();
const priv=z.object({ok:z.literal(true),exists:z.boolean(),own:z.boolean().optional(),on:z.boolean().optional(),scopes:scopes.optional(),until:z.string().nullable().optional(),
 text:z.string().nullable().optional(),media:z.array(privMedia).optional(),
 interests:z.array(z.object({topicId:z.string(),value:z.number().nullable().optional(),mark:z.enum(['discuss','hard']).nullable().optional(),dir:z.array(z.string()).nullable().optional(),vis:z.enum(['public','granted','only']).nullable().optional()})).optional(),available:scopes.optional(),canRequest:z.boolean().optional(),reason:z.string().nullable().optional()}).passthrough();
type Priv=z.infer<typeof priv>;
const ok=z.object({ok:z.literal(true)}).passthrough();
const requestRes=z.object({ok:z.literal(true),quota:quotaShape}).passthrough();
const declineRes=z.object({ok:z.literal(true),reaskDays:z.number(),undoUntil:z.string()}).passthrough();
const grantRes=z.object({ok:z.literal(true),pending:z.unknown().optional()}).passthrough();
type CallOpts={profileId?:string,asAccount?:boolean};

export const nameOf=(p:Who)=>p?(p.name||(p.handle?'@'+p.handle:'?')):'—';

/** Scope names, dates and error texts shared by every access screen. */
export function useAccessWords(){
 const {t,locale}=useI18n();const lc=locale==='en'?'en':'ru';
 const what=(l:readonly string[])=>l.map(s=>t('fe.priv.scope.'+s)).join(', ');
 const until=(u:string|null|undefined)=>u?t('fe.priv.until',{date:new Date(u).toLocaleDateString(lc,{day:'numeric',month:'short'})}):t('fe.priv.noTerm');
 const at=(u:string)=>new Date(u).toLocaleString(lc,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 const days=(u:string)=>Math.max(1,Math.ceil((new Date(u).getTime()-Date.now())/864e5));
 const err=(e:unknown)=>{
  if(e instanceof FeError&&e.rule)for(const k of ['fe.ac.rule.'+e.rule,'fe.priv.reason.'+e.rule]){const m=t(k);if(m!==k)return m;}
  return feErrorMessage(e,t);
 };
 return {what,until,at,days,err,when:(u:string)=>when(u,locale)};
}

/* ---------------- what a permission does (V21 accessSummary) ---------------- */

/** Who sees which parts and for how long, what stays closed, and what it never does. */
function AccessSummary({name,sel,all,until,couple}:{name:string,sel:Scope[],all:Scope[],until:string,couple?:boolean}){
 const {t}=useI18n();
 const low=(l:Scope[])=>l.map(s=>t('fe.priv.scope.'+s).toLowerCase()).join(', ');
 if(!sel.length)return <Alert kind="warn" noIcon>{t('fe.ac.sum.none')}</Alert>;
 const closed=all.filter(s=>!sel.includes(s));const rest=low(closed);
 return <Alert kind="info" noIcon><Stack gap={2}>
  <span aria-live="polite">{t('fe.ac.sum.sees',{name,what:low(sel),until})}{closed.length?' '+t(closed.length>1?'fe.ac.sum.closedN':'fe.ac.sum.closed1',{what:rest.charAt(0).toUpperCase()+rest.slice(1)}):''}</span>
  <Note as="ul"><li>{t('fe.ac.sum.noChat')}</li><li>{t('fe.ac.sum.revoke')}</li>{couple&&<li>{t('fe.ac.sum.couple')}</li>}</Note>
 </Stack></Alert>;
}

/* ---------------- asking (P06) ---------------- */

/** reqAccess: which parts to ask for, how many requests are left today; when none are left, when the next comes back. */
export function RequestSheet({profileId,available,onClose,onSent}:{profileId:string,available:Scope[],onClose:()=>void,onSent:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();const w=useAccessWords();
 const [q,setQ]=useState<QuotaT|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState<unknown>(null);
 const [sel,setSel]=useState<Scope[]>(()=>available.includes('info')?['info']:available.slice(0,1));
 const op=useRef(newOpId());
 const loadQuota=useCallback(()=>{call('access.quota',{},quotaRes,{fresh:true}).then(setQ).catch(()=>{});},[call]);
 useEffect(()=>{loadQuota();},[loadQuota]);
 const send=async()=>{setBusy(true);setError(null);
  try{const r=await call('access.request',{opId:op.current,profileId,scopes:sel},requestRes);toast(t('fe.ac.rq.sent'+(acting?.kind==='couple'?'Us':''),{left:r.quota.left,max:r.quota.max}),{type:'ok'});onSent();}
  catch(e){setError(e);op.current=newOpId();if(e instanceof FeError&&e.code==='rate_limited')loadQuota();}finally{setBusy(false);}};
 if(q&&q.left<=0)return <Sheet title={t('fe.ac.lim.title')} onClose={onClose} foot={<Btn onClick={onClose}>{t('fe.ac.ok')}</Btn>}>
  <Stack gap={3}>
   <Note>{t('fe.ac.lim.text',{max:q.max,at:q.resetsAt?w.at(q.resetsAt):'—'})}</Note>
   <Quota left={0} max={q.max} label={t('fe.ac.rq.leftLabel',{left:0,max:q.max})}/>
   <Note>{t('fe.ac.lim.wait')}</Note>
  </Stack>
 </Sheet>;
 const age=error instanceof FeError&&error.rule==='age_check_required';
 return <Sheet title={t('fe.ac.rq.title')} onClose={onClose} foot={<Btn icon={Send} disabled={!sel.length||busy} busy={busy} onClick={()=>void send()}>{t('fe.ac.rq.send'+(acting?.kind==='couple'?'Us':''))}</Btn>}>
  {acting?.kind==='couple'&&<Note>{t('fe.ac.rq.forUs')}</Note>}
  <CheckList bare label={t('fe.ac.rq.what')} value={sel} onChange={setSel} options={available.map(s=>[s,t('fe.priv.scope.'+s)] as const)}/>
  <SectionLabel action={q&&<b>{t('fe.ac.rq.leftN',{left:q.left,max:q.max})}</b>}>{t('fe.ac.rq.left')}</SectionLabel>
  {q?<Quota left={q.left} max={q.max} label={t('fe.ac.rq.leftLabel',{left:q.left,max:q.max})}/>:<Skel kind="line" rows={1}/>}
  <Alert kind="info">{t('fe.ac.rq.info')}</Alert>
  {!!error&&<Alert kind="err" noIcon>{w.err(error)}{age&&<><br/><AgeCheckLink intent={'access:'+profileId}/></>}</Alert>}
 </Sheet>;
}

/** Cancels my waiting request; the day's attempt is not given back. */
export function useCancelRequest(){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();const w=useAccessWords();
 return async(requestId:string)=>{
  try{await call('access.cancel',{opId:newOpId(),requestId},ok);toast(t('fe.ac.cancelled'+(acting?.kind==='couple'?'Us':'')),{type:'ok'});return true;}
  catch(e){toast(w.err(e),{type:'err'});return false;}
 };
}

/** «Запрос уже отправлен»: what was asked and when, cancel it, or go to all my requests (P07 «Мои запросы»). */
export function PendingSheet({profileId,name,onClose,onCancelled}:{profileId:string,name:string,onClose:()=>void,onCancelled:()=>void}){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const w=useAccessWords();const cancel=useCancelRequest();
 const [req,setReq]=useState<OutItem|null|undefined>(undefined);const [busy,setBusy]=useState(false);
 useEffect(()=>{call('access.lists',{tab:'out',filter:'pending'},outRes,{fresh:true}).then(r=>setReq(r.items.find(x=>x.profile?.id===profileId)??null)).catch(()=>setReq(null));},[call,profileId]);
 return <Sheet title={t('fe.ac.pd.title')} onClose={onClose} lead={<span className="ico a"><Clock/></span>} foot={<>
  {req&&<Btn kind="soft" busy={busy} disabled={busy} onClick={async()=>{setBusy(true);if(await cancel(req.id))onCancelled();setBusy(false);}}>{t('fe.ac.pd.cancel')}</Btn>}
  <Btn kind="text" onClick={()=>navigate('/n/me/access?tab=out')}>{t('fe.ac.pd.all')}</Btn></>}>
  <Stack gap={3}>
   <Note>{t('fe.ac.pd.lead',{name})}</Note>
   {req===undefined?<Skel kind="list" rows={1}/>:req?<Card list><Row icon={Lock} title={w.what(req.scopes)} sub={t('fe.ac.pd.sent',{when:w.when(req.created_at)})}/></Card>
    :<Alert kind="warn" noIcon>{t('fe.ac.pd.gone')}</Alert>}
  </Stack>
 </Sheet>;
}

/* ---------------- deciding (P09, decline with undo) ---------------- */

/** Declines a request with a toast that says what the person will see and offers «Отменить» for the server's window. */
export function useDecline(){
 const {call,acting,state}=useFe();const {t}=useI18n();const toast=useToast();const w=useAccessWords();
 return async(requestId:string,name:string,after:()=>void,opts?:CallOpts)=>{
  try{
   const r=await call('access.decline',{opId:newOpId(),requestId},declineRes,opts);after();
   const ms=Math.max(1500,new Date(r.undoUntil).getTime()-Date.now()-800);
   // From the inbox the decision may be the couple's while acting as oneself: the addressee decides the words.
   const who=opts?.profileId&&state.status==='ready'?state.boot.profiles.find(p=>p.id===opts.profileId):acting;
   toast(t(who?.kind==='couple'?'fe.ac.dec.doneUs':'fe.ac.dec.done',{name,d:r.reaskDays}),{type:'ok',ms,action:{label:t('fe.ac.undo'),fn:()=>{
    call('access.undoDecline',{opId:newOpId(),requestId},ok,opts).then(()=>{toast(t('fe.ac.dec.undone'),{type:'ok'});after();}).catch(e=>toast(w.err(e),{type:'err'}));}}});
   return true;
  }catch(e){toast(w.err(e),{type:'err'});return false;}
 };
}

/** `grantSheet()` — every part the owner has (asked ones preselected, «не запрошено» / «уже открыто» marked), the term,
 * the summary of what it opens; «Отказать» from the same sheet. */
function GrantSheet({r,available,onClose,onDone,onDecline}:{r:Incoming,available:Scope[],onClose:()=>void,onDone:()=>void,onDecline:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();const w=useAccessWords();
 const had=r.alreadyOpen??null;const all=available.length?available:r.scopes;const name=nameOf(r.profile);
 const [sel,setSel]=useState<Scope[]>(()=>all.filter(s=>r.scopes.includes(s)||had?.scopes.includes(s)));
 const [term,setTerm]=useState<'1d'|'7d'|'none'>('7d');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const op=useRef(newOpId());const couple=acting?.kind==='couple';
 const grant=async()=>{setBusy(true);setFailure('');
  try{const res=await call('access.grant',{opId:op.current,requestId:r.id,scopes:sel,term},grantRes);
   toast(res.pending?t('fe.ac.gr.partner'):t(couple?'fe.ac.gr.doneUs':'fe.ac.gr.done',{name}),{type:'ok'});onDone();}
  catch(e){setFailure(w.err(e));op.current=newOpId();}finally{setBusy(false);}};
 return <Sheet title={t('fe.mx.pr.grantTitle',{name})} sub={t('fe.ac.gr.asks',{what:w.what(r.scopes).toLowerCase()})} onClose={onClose} foot={<>
  <Btn icon={LockOpen} disabled={!sel.length||busy} busy={busy} onClick={()=>void grant()}>{couple?t('fe.ca.toPartner'):t('fe.mx.pr.grantOk.'+term)}</Btn>
  <Btn kind="soft" disabled={busy} onClick={onDecline}>{t(couple?'fe.priv.declineUs':'fe.priv.decline')}</Btn></>}>
  {had&&<Note>{t('fe.ac.gr.had',{what:w.what(had.scopes),until:w.until(had.until)})}</Note>}
  <CheckList bare label={t('fe.mx.pr.what')} value={sel} onChange={setSel}
   options={all.map(s=>[s,t('fe.priv.scope.'+s),had?.scopes.includes(s)?t('fe.ac.gr.open'):!r.scopes.includes(s)?t('fe.ac.gr.notAsked'):undefined] as const)}/>
  <SectionLabel>{t('fe.priv.term')}</SectionLabel>
  <ChoiceChips label={t('fe.priv.term')} value={term} onChange={setTerm} options={(['1d','7d','none'] as const).map(v=>[v,t('fe.mx.pr.term.'+v)] as const)}/>
  <AccessSummary name={name} sel={sel} all={all} until={t('fe.ac.term.'+term)} couple={couple}/>
  {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
 </Sheet>;
}

/* ---------------- what is open (P07 «Открыто мной», P11) ---------------- */

/** «Отозвать доступ у X?» — new views stop now; what was seen cannot be recalled. `narrow` revokes by an empty
 * narrowing (the sheet's «пусто → отзыв»). */
function RevokeAsk({g,narrow,onCancel,onDone}:{g:GrantItem,narrow:boolean,onCancel:()=>void,onDone:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();const w=useAccessWords();
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const id=g.profile?.id;
 const run=async()=>{if(!id)return;setBusy(true);setError('');
  try{if(narrow)await call('access.narrow',{opId:newOpId(),profileId:id,scopes:[]},ok);else await call('access.revoke',{opId:newOpId(),profileId:id},ok);
   toast(t('fe.mx.pr.revoked'+(acting?.kind==='couple'?'Us':'')),{type:'ok'});onDone();}catch(e){setError(w.err(e));}finally{setBusy(false);}};
 return <Ask icon={Lock} danger title={t('fe.ac.rv.title',{name:nameOf(g.profile)})} text={t('fe.ac.rv.text')} ok={t('fe.ac.rv.ok'+(acting?.kind==='couple'?'Us':''))} busy={busy} error={error||undefined}
  onCancel={onCancel} onOk={()=>void run()}/>;
}

/** «Изменить» — uncheck parts; nothing left is a revoke; «Отозвать доступ полностью» from here too. Only narrowing. */
function NarrowSheet({g,onClose,onRevoke,onDone}:{g:GrantItem,onClose:()=>void,onRevoke:(viaNarrow:boolean)=>void,onDone:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const toast=useToast();const w=useAccessWords();
 const [sel,setSel]=useState<Scope[]>(g.scopes);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const save=async()=>{if(!sel.length){onRevoke(true);return;}if(!g.profile)return;setBusy(true);setFailure('');
  try{await call('access.narrow',{opId:newOpId(),profileId:g.profile.id,scopes:sel},ok);toast(t('fe.ac.nw.done'+(acting?.kind==='couple'?'Us':'')),{type:'ok'});onDone();}
  catch(e){setFailure(w.err(e));}finally{setBusy(false);}};
 const same=sel.length===g.scopes.length;
 return <Sheet title={t('fe.ac.nw.title',{name:nameOf(g.profile)})} onClose={onClose} foot={
  <Btn kind={sel.length?'primary':'danger'} disabled={busy||same} busy={busy} onClick={()=>void save()}>{sel.length?t('fe.ac.nw.save'):t('fe.ac.nw.empty')}</Btn>}>
  <SectionLabel>{t('fe.ac.nw.what')}</SectionLabel>
  <Stack gap={3}>
   <CheckList bare label={t('fe.ac.nw.what')} value={sel} onChange={setSel} options={g.scopes.map(s=>[s,t('fe.priv.scope.'+s)] as const)}/>
   <Note>{t('fe.ac.nw.only')}</Note>
   <AccessSummary name={nameOf(g.profile)} sel={sel} all={g.scopes} until={w.until(g.until)}/>
   <Btn kind="text" auto className="danger" onClick={()=>onRevoke(false)}>{t('fe.ac.nw.revoke')}</Btn>
   {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
  </Stack>
 </Sheet>;
}

/** The narrow sheet and the revoke question for one grant at a time; `node` goes once into the screen. */
export function useGrantActions(reload:()=>void){
 const [narrow,setNarrow]=useState<GrantItem|null>(null);const [revoke,setRevoke]=useState<{g:GrantItem,narrow:boolean}|null>(null);
 const node=<>
  {narrow&&<NarrowSheet g={narrow} onClose={()=>setNarrow(null)} onDone={()=>{setNarrow(null);reload();}}
   onRevoke={via=>{setRevoke({g:narrow,narrow:via});setNarrow(null);}}/>}
  {revoke&&<RevokeAsk g={revoke.g} narrow={revoke.narrow} onCancel={()=>setRevoke(null)} onDone={()=>{setRevoke(null);reload();}}/>}
 </>;
 return {node,edit:(g:GrantItem)=>setNarrow(g),revoke:(g:GrantItem)=>setRevoke({g,narrow:false})};
}

/** One person I opened my private part to: what, until when, «Изменить» / «Отозвать». */
export function GrantCard({g,onEdit,onRevoke}:{g:GrantItem,onEdit:()=>void,onRevoke:()=>void}){
 const {t}=useI18n();const navigate=useNavigate();const w=useAccessWords();const name=nameOf(g.profile);
 return <RequestCard person={<PersonLine av={<Av name={name} seed={g.profile?.id??name} src={g.profile?.avatar}/>} label={name}
   onOpen={()=>g.profile&&navigate('/n/people/'+g.profile.id)} name={<>{name}<NameBadges p={g.profile}/></>} sub={w.what(g.scopes)}/>}
  actions={<><Btn size="md" kind="soft" onClick={onEdit}>{t('fe.ac.edit')}</Btn><Btn size="md" kind="danger" onClick={onRevoke}>{t('fe.mx.pr.revoke')}</Btn></>}>
  <Chips><Pill tone="v" icon={Clock}>{w.until(g.until)}</Pill></Chips>
 </RequestCard>;
}

/* ---------------- «Я → Приватное» (X01) ---------------- */

const PRIV_MAX=18;
const ownSrc=(m:{src:Record<string,string>|null})=>m.src?(m.src.thumb??m.src.card??m.src.full??null):null;

/** `mePrivLayer()` — the tab IS the private part (owner, 29.10.2026): its switch and «Кто может просить доступ» on top,
 * then what it opens as it will be seen — «Описание», «Фото и видео», «Интересы» (each empty one is the kit's «add»
 * card; an interest is added right here with «По доступу» preset) — then «Доступ»: who has it, «⋯» to change or revoke,
 * and the access center. Requests waiting for an answer come first. A couple's part holds interests only. */
export function PrivateLayer({profileId,on,requestsFrom,onChanged}:{profileId:string,on:boolean,requestsFrom:'all'|'matches'|'none',onChanged:()=>void}){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();const w=useAccessWords();const decline=useDecline();
 const [mine,setMine]=useState<Priv|null>(null);const [reqs,setReqs]=useState<z.infer<typeof incoming>|null>(null);const [given,setGiven]=useState<GrantItem[]>([]);
 const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);
 const [grantFor,setGrantFor]=useState<Incoming|null>(null);const [asking,setAsking]=useState<'off'|null>(null);
 const [sheet,setSheet]=useState<{k:'desc'}|{k:'media',i:number}|{k:'grant',g:GrantItem}|{k:'jar',id:string}|{k:'pick'}|null>(null);
 const [viewing,setViewing]=useState<number|null>(null);const [picked,setPicked]=useState<File[]|null>(null);
 const file=useRef<HTMLInputElement>(null);const sendPrivate=useSendPhoto('private');
 const jars=useInterests();
 const cp=acting?.kind==='couple';
 const load=useCallback(()=>{setError(null);Promise.all([call('private.get',{profileId},priv,{fresh:true}),call('access.lists',{tab:'incoming'},incoming,{fresh:true}),call('access.lists',{tab:'byme'},grantsRes,{fresh:true})])
  .then(([a,b,c])=>{setMine(a);setReqs(b);setGiven(c.items);}).catch(setError);},[call,profileId]);
 useEffect(()=>{load();},[load]);
 // A fresh upload has no served copy for a few seconds (it is being checked): ask again until the picture is there.
 const waiting=!!mine?.media?.some(m=>!m.src);
 useEffect(()=>{if(!waiting)return;let n=0,id=0,live=true;
  const poll=()=>{id=window.setTimeout(()=>{n++;call('private.get',{profileId},priv,{fresh:true}).then(r=>{if(!live)return;setMine(r);if(r.media?.some(m=>!m.src)&&n<20)poll();}).catch(()=>{if(live&&n<20)poll();});},4000);};
  poll();return ()=>{live=false;window.clearTimeout(id);};},[waiting,call,profileId]);
 const changed=()=>{load();onChanged();};
 const grants=useGrantActions(changed);
 // A widening change of the couple (switching the private part on, wider «who may ask») may wait for the partner.
 const act=async(fn:()=>Promise<Record<string,unknown>>,msg:string)=>{setBusy(true);try{const r=await fn();toast(r.pending?t('fe.ca.waitPartner'):msg,{type:'ok'});changed();return true;}catch(e){toast(w.err(e),{type:'err'});return false;}finally{setBusy(false);}};
 if(error)return <Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>;
 if(!mine||!reqs)return <Skel kind="card" rows={2}/>;
 // `interests` is the private part's own list (private.get); the profile's «По доступу» ones while a server without it answers.
 const media=mine.media??[];const txt=mine.text??'';const privJars=mine.interests??(jars.items??[]).filter(j=>j.vis==='granted');
 const empty=!txt&&!media.length&&!privJars.length;
 // Adding the first thing to a switched-off part switches it on: an empty part has nothing to switch.
 const ensureOn=async()=>{if(on)return;try{await call('private.setOn',{opId:newOpId(),on:true},ok);}catch{/* the content is saved either way */}};
 const saveMedia=async(ids:string[],msg:string)=>{setBusy(true);
  try{await call('private.setMedia',{opId:newOpId(),assetIds:ids},ok);await ensureOn();toast(msg,{type:'ok'});changed();}
  catch(e){toast(w.err(e),{type:'err'});}finally{setBusy(false);}};
 const ids=media.map(m=>m.id).filter((x):x is string=>!!x);
 const sub=empty?t(cp?'fe.mp.sub.emptyUs':'fe.mp.sub.empty'):on?t(cp?'fe.mp.sub.onUs':'fe.mp.sub.on'):t('fe.mp.sub.off');
 const toggle=()=>{if(on)setAsking('off');else void act(()=>call('private.setOn',{opId:newOpId(),on:true},ok),t(cp?'fe.mx.pr.onDoneUs':'fe.mx.pr.onDone'));};
 const name=(id:string)=>{const x=jars.topics.find(o=>o.id===id);return x?(locale==='en'?x.en:x.ru):id;};
 const addJar=()=>setSheet({k:'pick'});
 const available=reqs.available??[];
 const cur=sheet?.k==='media'?media[sheet.i]:undefined;
 return <>
  <section className={'vault'+(on&&!empty?'':' off')} id="privHead">
   <VaultHead title={t('fe.priv.title')} label={t('fe.priv.title')} sub={sub} on={on&&!empty} disabled={empty||busy} onToggle={toggle}/>
   <Card list><SelectRow row label={t('fe.mx.pr.reqFrom')} value={requestsFrom} options={(['all','matches','none'] as const).map(v=>[v,t('fe.mx.pr.from.'+v)] as const)}
    onChange={v=>void act(()=>call('profile.setVisibility',{opId:newOpId(),setting:'requestsFrom',value:v},ok),t('fe.mx.saved'))}/></Card>
  </section>
  {reqs.items.length>0&&<Group title={<>{t('fe.priv.requests')} · {reqs.items.length}</>}><Stack gap={2}>
   {reqs.items.map(r=><RequestCard key={r.id}
    person={<PersonLine av={<Av name={nameOf(r.profile)} seed={r.profile?.id??r.id} src={r.profile?.avatar}/>} label={nameOf(r.profile)} onOpen={()=>r.profile&&navigate('/n/people/'+r.profile.id)}
     name={<>{withAge(nameOf(r.profile),r.profile)}<NameBadges p={r.profile}/></>} sub={<>{cp?t('fe.mx.pr.asksUs'):t('fe.priv.asks')} · {when(r.created_at,locale)}</>}/>}
    actions={<><Btn size="md" onClick={()=>setGrantFor(r)} disabled={busy}>{t('fe.priv.grant')}</Btn>
     <Btn size="md" kind="soft" onClick={()=>void decline(r.id,nameOf(r.profile),changed)} disabled={busy}>{t('fe.priv.decline')}</Btn></>}>
    <Chips>{r.scopes.map(s=><Pill key={s}>{t('fe.priv.scope.'+s)}{r.alreadyOpen?.scopes.includes(s)?' · '+t('fe.ac.gr.open'):''}</Pill>)}</Chips>
   </RequestCard>)}
  </Stack></Group>}
  {!cp&&<Group id="privDesc" title={t('fe.mp.desc')}>
   {txt?<Card className="blk-btn" label={t('fe.mx.editOf',{title:t('fe.mp.desc')})} onClick={()=>setSheet({k:'desc'})}><span className="blk-bio">{txt}</span><span className="chv"><ChevronRight/></span></Card>
    :<AddCard icon={PenLine} title={t('fe.mp.descAdd')} sub={t('fe.mp.descAddSub')} onClick={()=>setSheet({k:'desc'})}/>}
  </Group>}
  {!cp&&<Group id="privMedia" title={<>{t('fe.mp.media')}{media.length?' · '+media.length:''}</>}>
   {media.length?<PhotoSlots priv>{[...media.map((m,i)=><PhotoSlot key={m.id??i} id={m.id??String(i)} src={ownSrc(m)} waiting={!m.src} review={m.pending?t('fe.mx.ph.review'):undefined}
     openLabel={t('fe.mx.ph.nOf',{n:i+1,total:media.length})} onOpen={()=>setSheet({k:'media',i})}/>),
     ...(media.length<PRIV_MAX?[<PhotoAdd key="add" disabled={busy} busy={busy} onClick={()=>file.current?.click()} label={t('fe.mp.mediaAdd')}/>]:[])]}</PhotoSlots>
    :<AddCard icon={Camera} title={t('fe.mp.mediaAdd')} sub={t('fe.mp.mediaAddSub')} disabled={busy} busy={busy} onClick={()=>file.current?.click()}/>}
  </Group>}
  <Group id="privJars" title={<>{t('fe.mp.jars')}{privJars.length?' · '+privJars.length:''}</>} action={privJars.length?<button type="button" onClick={addJar}>{t('fe.mx.ed.add')}</button>:null}>
   {privJars.length?<Jars list={sortJars(privJars)} topics={jars.topics} onOpen={id=>setSheet({k:'jar',id})}/>
    :<AddCard icon={Sparkles} title={t('fe.mp.jarsAdd')} sub={t(cp?'fe.mp.jarsAddSubUs':'fe.mp.jarsAddSub')} disabled={!jars.items} onClick={addJar}/>}
  </Group>
  <Group id="privWho" title={<>{t('fe.mp.access')}{given.length?' · '+given.length:''}</>}>
   {given.length===0?<Empty compact icon={KeyRound} title={t('fe.mp.accessNone')}/>
    :<Card list>{given.slice(0,5).map((g,i)=>{const n=nameOf(g.profile);
     return <Row key={g.profile?.id??i} av={<Av name={n} seed={g.profile?.id??n} size="sm" src={g.profile?.avatar}/>} title={<>{n}<NameBadges p={g.profile}/></>} sub={w.what(g.scopes)+' · '+w.until(g.until)}
      onClick={()=>g.profile&&navigate('/n/people/'+g.profile.id)} end={<IconBtn icon={MoreHorizontal} kind="ghost" size="sm" label={t('fe.mp.more',{name:n})} onClick={()=>setSheet({k:'grant',g})}/>}/>;})}</Card>}
   <Card list><Row icon={LockOpen} title={t('fe.mp.accessAll')} val={given.length>5?given.length:undefined} onClick={()=>navigate('/n/me/access')}/></Card>
  </Group>
  {asking==='off'&&<Ask icon={Lock} danger title={t('fe.mx.pr.offTitle')} busy={busy}
   text={[given.length||reqs.items.length?t('fe.mx.pr.offWhat',{g:given.length,q:reqs.items.length}):t('fe.mx.pr.offAll'),t('fe.mx.pr.offRest')].join(' ')} ok={t('fe.mx.pr.offOk')}
   onCancel={()=>setAsking(null)} onOk={async()=>{if(await act(()=>call('private.setOn',{opId:newOpId(),on:false,confirm:true},ok),t(cp?'fe.mx.pr.offDoneUs':'fe.mx.pr.offDone')))setAsking(null);}}/>}
  {grantFor&&<GrantSheet r={grantFor} available={available} onClose={()=>setGrantFor(null)} onDone={()=>{setGrantFor(null);changed();}}
   onDecline={()=>{const r=grantFor;setGrantFor(null);void decline(r.id,nameOf(r.profile),changed);}}/>}
  {sheet?.k==='grant'&&<Sheet title={nameOf(sheet.g.profile)} sub={w.what(sheet.g.scopes)+' · '+w.until(sheet.g.until)} onClose={()=>setSheet(null)}><Card list>
   <Row icon={Pencil} title={t('fe.mp.edit')} noChev onClick={()=>{const g=sheet.g;setSheet(null);grants.edit(g);}}/>
   <Row icon={Lock} title={t('fe.mx.pr.revoke')} danger onClick={()=>{const g=sheet.g;setSheet(null);grants.revoke(g);}}/>
  </Card></Sheet>}
  {sheet?.k==='desc'&&<DescSheet text={txt} onClose={()=>setSheet(null)} onSaved={async()=>{setSheet(null);await ensureOn();toast(t('fe.mp.descSaved'),{type:'ok'});changed();}}/>}
  {sheet?.k==='media'&&cur&&<Sheet title={t('fe.mx.ph.nOf',{n:sheet.i+1,total:media.length})} onClose={()=>setSheet(null)}>
   <div className="ph-sheet-prev">{ownSrc(cur)&&<img src={cur.src?.card??ownSrc(cur)!} alt="" draggable={false}/>}</div>
   <Card list>
    {!!cur.src&&<Row icon={Eye} title={t('fe.mx.ph.view')} noChev onClick={()=>{const i=sheet.i;setSheet(null);setViewing(i);}}/>}
    <Row icon={Trash2} title={t('fe.mx.ph.remove')} danger disabled={busy} onClick={()=>{const id=cur.id;setSheet(null);void saveMedia(ids.filter(x=>x!==id),t('fe.mp.mediaRemoved'));}}/>
   </Card>
  </Sheet>}
  {viewing!==null&&<PhotoViewer srcs={media.map(m=>m.src?.full??m.src?.card??ownSrc(m)).filter((x):x is string=>!!x)} index={viewing} onClose={()=>setViewing(null)}/>}
  {sheet?.k==='pick'&&jars.items&&<TopicPicker cats={jars.cats} topics={jars.topics} have={new Set(jars.items.map(j=>j.topicId))} presetVis="granted"
   onClose={()=>setSheet(null)} onDone={msg=>{setSheet(null);void ensureOn().then(()=>{toast(msg,{type:'ok'});jars.load();changed();});}}/>}
  {sheet?.k==='jar'&&<InterestSheet key={sheet.id} topicId={sheet.id} topics={jars.topics} cats={jars.cats} current={jars.items?.find(j=>j.topicId===sheet.id)??privJars.find(j=>j.topicId===sheet.id)} defaultVis="granted"
   onClose={()=>setSheet(null)} onDone={msg=>{setSheet(null);toast(msg,{type:'ok'});jars.load();changed();}}/>}
  <FilePick ref={file} accept="image/*" multiple onFiles={f=>setPicked([...f])}/>
  {picked&&<Uploader files={picked} aspects={['orig','4:5','1:1']} max={PRIV_MAX-media.length} send={sendPrivate} onClose={()=>setPicked(null)}
   onDone={got=>{setPicked(null);if(got.length)void saveMedia([...ids,...got.map(g=>g.id)],t('fe.mp.mediaSaved'));}}/>}
  {grants.node}
 </>;
}

/** «Описание» of the private part, edited in place: the server's own text rules, saved on «Сохранить». */
function DescSheet({text,onClose,onSaved}:{text:string,onClose:()=>void,onSaved:()=>void}){
 const {call}=useFe();const {t}=useI18n();const [v,setV]=useState(text);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const checks=useChecks({privText:'privateText'},{privText:v});
 const save=async()=>{if(!checks.submit())return;setBusy(true);setFailure('');
  try{await call('private.setText',{opId:newOpId(),text:v.trim()},ok);onSaved();}
  catch(e){if(!checks.fromServer(e,{text:'privText'}))setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 return <Sheet title={t('fe.mp.desc')} onClose={onClose} dirty={!busy&&v!==text} foot={<Btn busy={busy} disabled={busy||v.trim()===text.trim()} onClick={()=>void save()}>{t('fe.me.save')}</Btn>}>
  <Field name="privText" error={checks.error('privText')}><TextArea rows={6} {...checks.input('privText')} value={v} placeholder={t('fe.mx.ed.privPh')} aria-label={t('fe.mp.desc')} onChange={e=>setV(e.target.value)}/>
   <Counter n={textLength(v)} max={FIELD.privateText.max}/></Field>
  {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
 </Sheet>;
}

/* ---------------- someone's private part from the outside (P01 vault, P08) ---------------- */

/** vaultHTML + veilBlock / privOpenHTML. Before access nothing real is sent — the veil hides placeholders only. Photos
 * opened to me carry my own handle (the server's `watermark`). `preview` («Как видят») draws it as a viewer would see
 * it: buttons inert, but my own photos still open in the viewer. */
export function PrivateVault({profileId,name,preview,pre}:{profileId:string,name:string,preview?:'all'|'granted'|undefined,
 /** The `private.get` answer already read (a Discover card's `discover.card`): shown at once, not asked again. */ pre?:unknown}){
 const {call,acting}=useFe();const us=acting?.kind==='couple'&&!preview;const {t}=useI18n();const w=useAccessWords();
 const [p,setP]=useState<Priv|null>(()=>{const r=pre?priv.safeParse(pre):null;return r?.success?r.data:null;});const [view,setView]=useState<number|null>(null);
 const [sheet,setSheet]=useState<'request'|'pending'|null>(null);const [reaskAt,setReaskAt]=useState<string|null>(null);
 const load=useCallback(()=>{call('private.get',{profileId},priv,{fresh:true}).then(setP).catch(()=>setP(null));},[call,profileId]);
 const given=pre!=null;
 useEffect(()=>{if(!given)load();},[load,given]);
 // Back from the age check this request sent the person to: open the request sheet again.
 useAgeResume(v=>v==='access:'+profileId,()=>setSheet('request'),!!p?.canRequest);
 const reason=preview?null:p?.reason??null;
 useEffect(()=>{if(reason!=='cooldown')return;
  call('access.lists',{tab:'out'},outRes).then(r=>setReaskAt(r.items.find(x=>x.profile?.id===profileId&&x.reaskAt)?.reaskAt??null)).catch(()=>{});},[call,profileId,reason]);
 if(!p||!p.exists)return null;
 if(preview&&(!p.on||!(p.available??[]).length))return null;
 const available=p.available??[];const scopesOpen=preview==='granted'?available:preview?[]:(p.scopes??[]);
 const done=()=>{setSheet(null);load();};
 const sheets=<>
  {sheet==='request'&&<RequestSheet profileId={profileId} available={scopesOpen.length?available.filter(s=>!scopesOpen.includes(s)):available} onClose={()=>setSheet(null)} onSent={done}/>}
  {sheet==='pending'&&<PendingSheet profileId={profileId} name={name} onClose={()=>setSheet(null)} onCancelled={done}/>}
 </>;
 const head=(isOpen:boolean,badge?:ReactNode)=><div className="vault-h"><span className="vi">{isOpen?<LockOpen/>:<Lock/>}</span><div><b>{t('fe.px.pr.title')}</b></div>{badge&&<span className="vst">{badge}</span>}</div>;
 if(scopesOpen.length){
  const photos=(p.media??[]).filter(m=>m.kind!=='video'&&mediaSrc(m)&&(preview||scopesOpen.includes('photos')));
  const wm=preview||p.own?null:photos.find(m=>m.watermark)?.watermark??null;
  const until=!preview&&p.until?<Pill tone="v">{w.until(p.until)}</Pill>:undefined;
  const desc=scopesOpen.includes('info')&&p.text?<Group title={t('fe.px.pr.desc')}><Card><div className="md bio">{p.text.split(/\n{2,}/).map((x,i)=><p key={i}>{x}</p>)}</div></Card></Group>:null;
  const more=!preview&&(reason==='pending'?<Btn kind="text" auto icon={Clock} onClick={()=>setSheet('pending')}>{t(us?'fe.ac.rq.waitingUs':'fe.ac.rq.waiting')}</Btn>
   :p.canRequest&&available.some(s=>!scopesOpen.includes(s))?<Btn kind="soft" size="sm" auto icon={LockOpen} onClick={()=>setSheet('request')}>{t(us?'fe.ac.rq.askMoreUs':'fe.ac.rq.askMore')}</Btn>:null);
  return <section className="vault open" id="priv">{head(true,until)}<div className="vault-b">
   {desc}
   {photos.length>0&&<Group bare title={<>{t('fe.px.pr.photos')} · {photos.length}</>} foot={preview?t('fe.px.pr.wmPreview'):t('fe.px.pr.wm')}>
    <div className="ggrid">{photos.map((m,i)=><button key={i} type="button" className="gtile" onClick={()=>setView(i)}><img src={mediaSrc(m)!} alt="" loading="lazy" draggable={false}/></button>)}</div>
   </Group>}
   {!desc&&!photos.length&&<Empty compact icon={Lock} title={t('fe.px.pr.nothing')}/>}
   {more}
  </div>
  {view!==null&&<PhotoViewer srcs={photos.map(m=>m.src?.full??mediaSrc(m)!)} index={view} wm={wm} onClose={()=>setView(null)}/>}
  {sheets}</section>;
 }
 const action=preview?<Btn kind="dark" disabled aria-disabled="true">{t('fe.px.pr.ask')}</Btn>
  :reason==='pending'?<Btn kind="dark" icon={Clock} onClick={()=>setSheet('pending')}>{t(us?'fe.ac.rq.waitingUs':'fe.ac.rq.waiting')}</Btn>
  :reason==='not_accepting'?<Pill icon={Lock}>{t('fe.px.pr.notAccepting')}</Pill>
  :reason==='cooldown'?<Pill icon={Clock}>{reaskAt?t('fe.ac.rq.again',{n:w.days(reaskAt)}):t('fe.px.pr.cooldown')}</Pill>
  :reason?<Pill icon={Lock}>{t('fe.px.pr.r.'+reason)}</Pill>
  :p.canRequest?<Btn kind="dark" icon={LockOpen} onClick={()=>setSheet('request')}>{t(us?'fe.px.pr.askUs':'fe.px.pr.ask')}</Btn>:null;
 return <section className="vault closed" id="priv">{head(false)}<div className="vault-b">
  <Veil lock={false} toggles title={t('fe.px.pr.decides').replace('{name}',name)} text={t('fe.px.pr.decidesText')} action={action}/>
 </div>{sheets}</section>;
}
