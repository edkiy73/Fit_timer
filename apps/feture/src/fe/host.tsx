import {useCallback,useEffect,useState,type ReactNode} from 'react';
import {useLocation,useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,Bell,Check,ChevronRight,CircleCheck,Clock,Copy,Eye,FileText,Link as LinkIcon,Lock,MoreHorizontal,Pencil,Pin,PinOff,Send,Settings,Trash2,TriangleAlert,User,UserMinus,UserPlus,Users,X,type LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,Seg,View,Skel} from './ui';
import {useFe} from './session';
import {FErr,Field,SelectRow,shakeFirstErr} from './create-community';

/** Tools for community hosts and event organisers (V21 C05 join with the question, C09/C10 members and manage,
 * C11 requests; E06 apply, E15 organiser panel, E16 applications, E17/E18 attendees). The server decides who may
 * do what; the screens only offer what the role allows. */

const ok=z.object({ok:z.literal(true)}).passthrough();
const prof=z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable()}).passthrough();
type Prof=z.infer<typeof prof>;
const pname=(p:{name?:string|null,handle?:string|null})=>p.name||(p.handle?'@'+p.handle:'?');

const updateRes=z.object({ok:z.literal(true),rev:z.number(),review:z.array(z.string()).default([])}).passthrough();
const commSchema=z.object({ok:z.literal(true),community:z.object({id:z.uuid(),name:z.string(),privacy:z.string(),members:z.number(),rules:z.array(z.string()),rev:z.number().optional(),pendingChange:z.unknown().optional(),
 joinQuestion:z.string().nullable(),me:z.object({role:z.string(),state:z.string()}).passthrough().nullable(),request:z.object({id:z.uuid()}).nullable(),
 pendingRequests:z.number().optional()}).passthrough()});
type Comm=z.infer<typeof commSchema>['community'];
const isHost=(c:{me?:{role:string,state:string}|null}|null|undefined)=>!!c?.me&&c.me.state==='active'&&(c.me.role==='owner'||c.me.role==='host');

const reqItem=z.object({id:z.uuid(),state:z.string(),answer:z.string().nullable(),created_at:z.string(),decided_at:z.string().nullable(),rev:z.number(),profile:prof});
const reqList=z.object({ok:z.literal(true),items:z.array(reqItem)});
const memItem=prof.extend({role:z.string(),read_only:z.boolean()});
const memList=z.object({ok:z.literal(true),count:z.number(),items:z.array(memItem).nullable()});
const inviteRes=z.object({ok:z.literal(true),token:z.string().optional(),expiresAt:z.string().optional(),revoked:z.boolean().optional()});
const joinRes=z.object({ok:z.literal(true),state:z.string().optional(),pending:z.unknown().optional()}).passthrough();

const announcement=z.object({id:z.uuid(),body:z.string(),automatic:z.boolean(),created_at:z.string()}).passthrough();
const application=z.object({id:z.uuid(),state:z.string(),rev:z.number()});
const evSchema=z.object({ok:z.literal(true),event:z.object({id:z.uuid(),title:z.string(),state:z.string(),past:z.boolean(),requiresApplication:z.boolean(),
 questions:z.array(z.string()).nullable().optional(),requirements:z.string().nullable(),going:z.number(),interested:z.number(),cancelReason:z.string().nullable().optional(),
 organizer:z.object({id:z.uuid()}).passthrough().nullable().optional(),announcements:z.array(announcement).optional(),pendingApplications:z.number().optional(),
 me:z.object({application:application.nullable().optional(),waiting:z.unknown().optional()}).passthrough()}).passthrough()});
type Ev=z.infer<typeof evSchema>['event'];
const appItem=z.object({id:z.uuid(),state:z.string(),answers:z.array(z.string()),note:z.string().nullable(),rev:z.number(),created_at:z.string(),profile:prof,
 people:z.array(z.object({handle:z.string().nullable(),age:z.number().nullable()}))});
const appList=z.object({ok:z.literal(true),items:z.array(appItem)});
const attList=z.object({ok:z.literal(true),count:z.number(),hidden:z.number(),items:z.array(prof)});

const rel=(iso:string|null|undefined,locale:string)=>iso?new Date(iso).toLocaleString(locale==='en'?'en':'ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';

/** `linkRow()` — icon, title, optional sub, badge and chevron. */
function LinkRow({icon:Icon,tone='',title,sub,badge,danger,noChev,onClick,disabled}:{icon:LucideIcon,tone?:string,title:string,sub?:string|undefined,badge?:string|number|undefined,danger?:boolean,noChev?:boolean,onClick:()=>void,disabled?:boolean}){
 return <button type="button" className={'li'+(danger?' danger':'')} onClick={onClick} disabled={disabled}>
  <span className={'ico '+tone}><Icon/></span><span className="tx"><b>{title}</b>{sub&&<small>{sub}</small>}</span>
  {badge?<span className="pill hot">{badge}</span>:null}{!noChev&&<ChevronRight/>}
 </button>;
}

/** The inline confirmation that stands in for the prototype's `ask()` dialog. */
function Confirm({title,text,okLabel,onOk,onCancel,busy,children}:{title:string,text?:string,okLabel:string,onOk:()=>void,onCancel:()=>void,busy?:boolean,children?:ReactNode}){
 const {t}=useI18n();
 return <div className="alert warn mt12" role="alertdialog" aria-label={title}><TriangleAlert/><span><b>{title}</b>{text}
  {children}
  <span className="row g8 mt12" style={{display:'flex'}}><Btn kind="danger" size="md" auto onClick={onOk} disabled={busy}>{okLabel}</Btn><Btn kind="soft" size="md" auto onClick={onCancel} disabled={busy}>{t('fe.host.keep')}</Btn></span>
 </span></div>;
}

function Failure({text}:{text:string}){return text?<div className="alert err mt12" role="alert"><X/><span>{text}</span></div>:null;}
function Done({text}:{text:string}){return text?<p className="note mt12" role="status">{text}</p>:null;}

/** Loads a screen's data with the usual loading / error / retry states. */
function useLoad<T>(fn:()=>Promise<T>){
 const [data,setData]=useState<T|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);fn().then(setData).catch(setError);},[fn]);
 useEffect(()=>{load();},[load]);
 return {data,error,load};
}
function Loading({error,retry}:{error:unknown,retry:()=>void}){
 const {t}=useI18n();
 return error?<Empty icon={Lock} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={retry}>{t('fe.retry')}</Btn></Empty>
  :<Skel kind="list"/>;
}

/* ---------------- Communities ---------------- */

/** On the community page for owners and hosts: «Управление» and the waiting requests (V21 COMM-012). */
export function CommunityHostEntry({c}:{c:{id:string,me?:{role:string,state:string}|null,pendingRequests?:unknown}}){
 const {t}=useI18n();const navigate=useNavigate();
 if(!isHost(c))return null;
 const n=typeof c.pendingRequests==='number'?c.pendingRequests:0;
 return <>
  <button type="button" className="btn md soft manage-entry" onClick={()=>navigate(`/n/communities/${c.id}/manage`)}><Settings/>{t('fe.host.manage')}</button>
  {n>0&&<button type="button" className="btn text auto" style={{marginLeft:'auto',whiteSpace:'nowrap'}} onClick={()=>navigate(`/n/communities/${c.id}/requests`)}>{t('fe.host.newRequests').replace('{n}',String(n))} <ChevronRight/></button>}
 </>;
}

/** C04/C05 — join an open community (rules) or request a closed one (rules + the join question), and withdraw a
 * waiting request. Renders the page's action row and, when opened, the form under it. */
export function CommunityJoin({c,invite,onChange}:{c:{id:string,privacy:string,rules:string[],joinQuestion?:string|null,request:{id:string}|null},invite?:string|undefined,onChange:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();
 const [open,setOpen]=useState(false);const [answer,setAnswer]=useState('');const [accepted,setAccepted]=useState(false);
 const [err,setErr]=useState<{answer?:string|undefined,ok?:string|undefined}>({});const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [done,setDone]=useState('');
 const [confirm,setConfirm]=useState(false);
 const couple=acting?.kind==='couple';const closed=c.privacy!=='open';const q=closed?c.joinQuestion??null:null;
 const send=async()=>{
  const e:{answer?:string|undefined,ok?:string|undefined}={};
  if(q&&answer.trim().length<10)e.answer=t('fe.host.join.answerShort');
  if(!accepted)e.ok=t('fe.host.join.acceptNeeded');
  setErr(e);if(Object.keys(e).length){shakeFirstErr();return;}
  setBusy(true);setFailure('');
  try{
   const r=await call('community.join',{opId:newOpId(),communityId:c.id,rulesAccepted:true,answer:closed?answer.trim():'',...(invite?{invite}:{})},joinRes);
   setOpen(false);setDone(r.pending?t('fe.host.join.waitingPartner'):r.state==='member'?t('fe.host.join.joined'):t('fe.host.join.sent'));onChange();
  }catch(x){setFailure(feErrorMessage(x,t));}finally{setBusy(false);}
 };
 const withdraw=async()=>{
  if(!c.request)return;setBusy(true);setFailure('');
  try{await call('community.requestWithdraw',{opId:newOpId(),requestId:c.request.id},ok);setConfirm(false);setDone(t('fe.host.join.withdrawn'));onChange();}
  catch(x){setFailure(feErrorMessage(x,t));}finally{setBusy(false);}
 };
 return <>
  <div className="row g8 mt16 cm-act">
   {c.request?<><span className="pill wait"><Clock/>{t('fe.host.join.pending')}</span>
     <Btn kind="soft" size="md" auto style={{flex:'0 0 auto',marginLeft:'auto'}} onClick={()=>setConfirm(true)} disabled={busy}>{t('fe.host.join.withdraw')}</Btn></>
    :<Btn size="md" onClick={()=>{setOpen(true);setDone('');}} disabled={busy||open}>{closed?t(couple?'fe.host.join.requestCouple':'fe.host.join.request'):t(couple?'fe.host.join.joinCouple':'fe.host.join.join')}</Btn>}
  </div>
  {confirm&&<Confirm title={t('fe.host.join.withdrawQ')} okLabel={t('fe.host.join.withdraw')} onOk={withdraw} onCancel={()=>setConfirm(false)} busy={busy}/>}
  {open&&!c.request&&<section className="grp"><div className="grp-t"><span>{closed?t('fe.host.join.requestTitle'):t('fe.host.join.rulesTitle')}</span></div>
   <div className="card flat"><ol className="rules">{c.rules.map((r,i)=><li key={i}>{r}</li>)}</ol></div>
   {q&&<Field name="answer" label={q} value={answer} onChange={v=>{setAnswer(v);if(err.answer)setErr({...err,answer:undefined});}} err={err.answer} textarea rows={3} max={300}
    ph={t('fe.host.join.answerPh')} hint={t('fe.host.join.answerHint')}/>}
   <div className={'field'+(err.ok?' err':'')} style={{marginTop:16}}>
    <button type="button" className={'check'+(accepted?' on':'')+(err.ok?' err':'')} aria-pressed={accepted} onClick={()=>{setAccepted(v=>!v);setErr({...err,ok:undefined});}}>
     <i><Check/></i><span>{t('fe.host.join.accept')}{err.ok&&<FErr>{err.ok}</FErr>}</span></button>
   </div>
   <div className="btns mt12"><Btn onClick={send} disabled={busy}>{closed?t('fe.host.join.send'):t('fe.host.join.join')}</Btn><Btn kind="text" onClick={()=>setOpen(false)} disabled={busy}>{t('fe.cancel')}</Btn></div>
  </section>}
  <Failure text={failure}/><Done text={done}/>
 </>;
}

/** Host tools under a discussion in the list: pin / unpin and remove (with a confirmation). */
export function DiscussionHostTools({postId,pinned,onDone}:{postId:string,pinned:boolean,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [confirm,setConfirm]=useState(false);
 const act=async(change:'pin'|'unpin'|'remove')=>{
  setBusy(true);setFailure('');
  try{await call('discussion.host',{opId:newOpId(),postId,change},ok);setConfirm(false);onDone();}catch(x){setFailure(feErrorMessage(x,t));}finally{setBusy(false);}
 };
 return <div style={{padding:'0 16px 12px'}}>
  <div className="row g8">
   <Btn kind="text" size="sm" auto icon={pinned?PinOff:Pin} onClick={()=>act(pinned?'unpin':'pin')} disabled={busy}>{pinned?t('fe.host.disc.unpin'):t('fe.host.disc.pin')}</Btn>
   <Btn kind="text" size="sm" auto icon={Trash2} onClick={()=>setConfirm(true)} disabled={busy}>{t('fe.host.disc.remove')}</Btn>
  </div>
  {confirm&&<Confirm title={t('fe.host.disc.removeQ')} text={t('fe.host.disc.removeText')} okLabel={t('fe.host.disc.remove')} onOk={()=>act('remove')} onCancel={()=>setConfirm(false)} busy={busy}/>}
  <Failure text={failure}/>
 </div>;
}

/** C10 — community manage: counts, requests, members, invite link. */
export function CommunityManageScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const location=useLocation();
 const fetch=useCallback(()=>call('community.get',{communityId:id},commSchema).then(r=>r.community),[call,id]);
 const {data:c,error,load}=useLoad(fetch);
 // The edit screen comes back with what happened to the edit (saved, or waiting for staff).
 const [done,setDone]=useState(()=>{const n=(location.state as {notice?:unknown}|null)?.notice;return typeof n==='string'?n:'';});
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const owner=!!c&&c.me?.role==='owner'&&c.me.state==='active'&&typeof c.rev==='number';
 const pendingPrivacy=(()=>{const p=c?.pendingChange;return p&&typeof p==='object'&&'privacy' in p&&typeof (p as {privacy?:unknown}).privacy==='string'?(p as {privacy:string}).privacy:'';})();
 const setPrivacy=async(privacy:'open'|'closed'|'hidden')=>{
  if(!c||busy||privacy===c.privacy||typeof c.rev!=='number')return;
  setBusy(true);setFailure('');setDone('');
  try{
   const r=await call('community.update',{opId:newOpId(),communityId:id,rev:c.rev,privacy},updateRes);
   setDone(r.review.includes('privacy')?t('fe.ece.priv.review'):t('fe.ece.priv.now.'+privacy));load();
  }catch(x){setFailure(feErrorMessage(x,t));if(x instanceof FeError&&x.code==='conflict')load();}finally{setBusy(false);}
 };
 return <>
  <Bar title={t('fe.host.manage')} back={`/n/communities/${id}`}/>
  <View className="nodock">
   {!c?<Loading error={error} retry={load}/>:!isHost(c)?<Empty icon={Lock} title={t('fe.host.onlyHosts')} text={t('fe.host.onlyHostsText')}/>:<>
    <p className="note" style={{margin:'0 0 12px'}}>{c.name}</p>
    <div className="stat3 two">
     <button type="button" onClick={()=>navigate(`/n/communities/${id}/members`)}><b>{c.members}</b><small>{t('fe.host.members')}</small></button>
     <button type="button" onClick={()=>navigate(`/n/communities/${id}/requests`)}><b>{c.pendingRequests??0}</b><small>{t('fe.host.requestsWaiting')}</small></button>
    </div>
    <div className="card list">
     <LinkRow icon={FileText} tone="v" title={t('fe.host.requests')} badge={c.pendingRequests||undefined} onClick={()=>navigate(`/n/communities/${id}/requests`)}/>
     <LinkRow icon={Users} title={t('fe.host.membersTitle')} sub={t('fe.host.membersSub')} onClick={()=>navigate(`/n/communities/${id}/members`)}/>
     {owner&&<LinkRow icon={Pencil} title={t('fe.ece.edit')} sub={t('fe.ece.c.editSub')} onClick={()=>navigate(`/n/communities/${id}/edit`)}/>}
    </div>
    <Failure text={failure}/><Done text={done}/>
    <div className="sec">{t('fe.host.access')}</div>
    {owner&&<div className="card list" style={{marginBottom:12}}><div className="li"><span className="ico"><Lock/></span>
     <SelectRow label={t('fe.cc.privacy')} value={c.privacy as 'open'|'closed'|'hidden'} onChange={v=>{void setPrivacy(v);}}
      sub={pendingPrivacy?t('fe.ece.priv.pending').replace('{p}',t('fe.cc.privacy.'+pendingPrivacy)):t('fe.ece.priv.sub.'+c.privacy)}
      items={(['open','closed','hidden'] as const).map(k=>[k,t('fe.cc.privacy.'+k)])}/></div></div>}
    <InviteBox communityId={id}/>
   </>}
  </View>
 </>;
}

/** `commInvite` — a new invitation link, copied to the clipboard; all links can be revoked. */
function InviteBox({communityId}:{communityId:string}){
 const {call}=useFe();const {t,locale}=useI18n();
 const [link,setLink]=useState<{url:string,expires?:string|undefined}|null>(null);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [done,setDone]=useState('');const [confirm,setConfirm]=useState(false);
 const copy=async(url:string)=>{try{await navigator.clipboard.writeText(url);setDone(t('fe.host.invite.copied'));}catch{setDone(t('fe.host.invite.copyManually'));}};
 const create=async()=>{
  setBusy(true);setFailure('');setDone('');
  try{
   const r=await call('community.invite',{opId:newOpId(),communityId},inviteRes);
   if(!r.token)throw new Error('no token');
   const url=`${location.origin}/#/n/communities/${communityId}?invite=${encodeURIComponent(r.token)}`;
   setLink({url,expires:r.expiresAt});await copy(url);
  }catch(x){setFailure(feErrorMessage(x,t));}finally{setBusy(false);}
 };
 const revoke=async()=>{
  setBusy(true);setFailure('');
  try{await call('community.invite',{opId:newOpId(),communityId,revokeAll:true},inviteRes);setLink(null);setConfirm(false);setDone(t('fe.host.invite.revoked'));}
  catch(x){setFailure(feErrorMessage(x,t));}finally{setBusy(false);}
 };
 return <>
  <div className="card list">
   <LinkRow icon={LinkIcon} title={t('fe.host.invite.title')} sub={t('fe.host.invite.sub')} noChev onClick={create} disabled={busy}/>
   {link&&<button type="button" className="li" onClick={()=>copy(link.url)}><span className="ico"><Copy/></span><span className="tx"><b style={{wordBreak:'break-all'}}>{link.url}</b>
    {link.expires&&<small>{t('fe.host.invite.expires').replace('{d}',rel(link.expires,locale))}</small>}</span></button>}
   <LinkRow icon={Ban} danger title={t('fe.host.invite.revokeAll')} noChev onClick={()=>setConfirm(true)} disabled={busy}/>
  </div>
  {confirm&&<Confirm title={t('fe.host.invite.revokeQ')} text={t('fe.host.invite.revokeText')} okLabel={t('fe.host.invite.revoke')} onOk={revoke} onCancel={()=>setConfirm(false)} busy={busy}/>}
  <Failure text={failure}/><Done text={done}/>
 </>;
}

/** C11 — join requests: new ones with approve / decline, and the decisions. */
export function CommunityRequestsScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [tab,setTab]=useState<'pending'|'history'>('pending');
 const fetch=useCallback(()=>call('community.requests',{communityId:id,tab},reqList).then(r=>r.items),[call,id,tab]);
 const {data:items,error,load}=useLoad(fetch);
 const [busy,setBusy]=useState('');const [failure,setFailure]=useState('');const [done,setDone]=useState('');
 const decide=async(r:z.infer<typeof reqItem>,approve:boolean)=>{
  setBusy(r.id);setFailure('');setDone('');
  try{await call('community.requestDecide',{opId:newOpId(),requestId:r.id,rev:r.rev,approve},ok);setDone(approve?t('fe.host.req.approved'):t('fe.host.req.declined'));load();}
  catch(x){setFailure(feErrorMessage(x,t));load();}finally{setBusy('');}
 };
 return <>
  <Bar title={t('fe.host.requests')} back={`/n/communities/${id}`}/>
  <View className="nodock">
   <Seg value={tab} onChange={v=>{setTab(v);setDone('');setFailure('');}} label={t('fe.host.requests')} options={[{id:'pending',label:t('fe.host.req.tabNew')},{id:'history',label:t('fe.host.req.tabHistory')}]}/>
   <Failure text={failure}/><Done text={done}/>
   {!items?<Loading error={error} retry={load}/>
    :!items.length?<Empty icon={FileText} title={tab==='history'?t('fe.host.req.noHistory'):t('fe.host.req.none')} text={t('fe.host.req.privacy')}/>
    :items.map(r=><section key={r.id} className="card application-card mt12">
     <button type="button" className="li" onClick={()=>navigate('/n/people/'+r.profile.id)}><Av name={pname(r.profile)} seed={r.profile.id}/><span className="tx"><b>{pname(r.profile)}</b>{r.profile.handle&&<small>@{r.profile.handle}</small>}</span><ChevronRight/></button>
     <p className="note">{rel(r.decided_at??r.created_at,locale)}{r.state!=='pending'?' · '+t('fe.host.req.state.'+r.state):''}</p>
     {r.answer&&<p className="application-answer">{r.answer}</p>}
     {r.state==='pending'&&<div className="row g8"><Btn onClick={()=>decide(r,true)} disabled={busy===r.id}>{t('fe.host.approve')}</Btn><Btn kind="soft" onClick={()=>decide(r,false)} disabled={busy===r.id}>{t('fe.host.decline')}</Btn></div>}
    </section>)}
  </View>
 </>;
}

/** C09 — hosts and members; owners and hosts manage people from here (host, read only, remove). */
export function CommunityMembersScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const fetch=useCallback(()=>Promise.all([call('community.get',{communityId:id},commSchema),call('community.members',{communityId:id},memList)]).then(([a,b])=>({c:a.community,m:b})),[call,id]);
 const {data,error,load}=useLoad(fetch);
 const [open,setOpen]=useState('');const [confirm,setConfirm]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [done,setDone]=useState('');
 const change=async(m:Prof,ch:'host'|'unhost'|'readOnly'|'canWrite'|'remove')=>{
  setBusy(true);setFailure('');setDone('');
  try{await call('community.member',{opId:newOpId(),communityId:id,profileId:m.id,change:ch},ok);setDone(t('fe.host.mem.done.'+ch).replace('{name}',pname(m)));setOpen('');setConfirm('');load();}
  catch(x){setFailure(feErrorMessage(x,t));}finally{setBusy(false);}
 };
 const c=data?.c;const host=isHost(c);const owner=host&&c?.me?.role==='owner';
 const items=data?.m.items??null;
 const hosts=items?.filter(m=>m.role!=='member')??[];const members=items?.filter(m=>m.role==='member')??[];
 const sub=(m:z.infer<typeof memItem>)=>m.id===acting?.id?t('fe.host.mem.you'):m.role==='owner'?t('fe.host.mem.owner'):m.role==='host'?t('fe.host.mem.host'):m.read_only?t('fe.host.mem.readOnly'):t('fe.host.mem.member');
 const canManage=(m:z.infer<typeof memItem>)=>host&&m.id!==acting?.id&&m.role!=='owner'&&(m.role!=='host'||owner);
 const row=(m:z.infer<typeof memItem>)=><div key={m.id}>
  {canManage(m)
   ?<button type="button" className="li" aria-expanded={open===m.id} onClick={()=>{setOpen(open===m.id?'':m.id);setConfirm('');}}><Av name={pname(m)} seed={m.id}/><span className="tx"><b>{pname(m)}</b><small>{sub(m)}</small></span><MoreHorizontal/></button>
   :<button type="button" className="li" onClick={()=>navigate('/n/people/'+m.id)}><Av name={pname(m)} seed={m.id}/><span className="tx"><b>{pname(m)}</b><small>{sub(m)}</small></span><ChevronRight/></button>}
  {open===m.id&&<div style={{padding:'0 12px 12px'}}>
   <div className="card list">
    <LinkRow icon={User} title={t('fe.host.mem.profile')} onClick={()=>navigate('/n/people/'+m.id)}/>
    {owner&&<LinkRow icon={m.role==='host'?UserMinus:UserPlus} tone="v" noChev disabled={busy} title={m.role==='host'?t('fe.host.mem.unhost'):t('fe.host.mem.makeHost')}
     sub={m.role==='host'?t('fe.host.mem.unhostSub'):t('fe.host.mem.makeHostSub')} onClick={()=>change(m,m.role==='host'?'unhost':'host')}/>}
    {m.role==='member'&&<LinkRow icon={Lock} noChev disabled={busy} title={m.read_only?t('fe.host.mem.canWrite'):t('fe.host.mem.makeReadOnly')} sub={m.read_only?undefined:t('fe.host.mem.readOnlySub')}
     onClick={()=>change(m,m.read_only?'canWrite':'readOnly')}/>}
    {m.role==='member'&&<LinkRow icon={X} danger noChev disabled={busy} title={t('fe.host.mem.remove')} onClick={()=>setConfirm(m.id)}/>}
   </div>
   {confirm===m.id&&<Confirm title={t('fe.host.mem.removeQ').replace('{name}',pname(m))} text={t('fe.host.mem.removeText')} okLabel={t('fe.host.mem.removeOk')} onOk={()=>change(m,'remove')} onCancel={()=>setConfirm('')} busy={busy}/>}
  </div>}
 </div>;
 return <>
  <Bar title={t('fe.host.membersTitle')} back={`/n/communities/${id}`}/>
  <View className="nodock">
   {!data?<Loading error={error} retry={load}/>:<>
    {host&&<p className="note" style={{margin:'4px 0 12px'}}>{t('fe.host.mem.hint')}</p>}
    <Failure text={failure}/><Done text={done}/>
    {items===null?<p className="note">{t('fe.host.mem.afterJoin')}</p>:<>
     <div className="sec" style={{marginTop:4}}>{t('fe.host.mem.hosts')}</div>
     <div className="card list">{hosts.map(row)}</div>
     <div className="sec">{t('fe.host.mem.count').replace('{n}',String(data.m.count))}</div>
     <div className="card list">{members.length?members.map(row):<p className="note">{t('fe.host.mem.none')}</p>}</div>
    </>}
   </>}
  </View>
 </>;
}

/* ---------------- Events ---------------- */

/** On the event page for its organiser: «Управление» opens the organiser panel (E15). */
export function EventHostEntry({e}:{e:{id:string,organizer?:{id:string}|null|undefined}}){
 const {acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 if(!e.organizer||e.organizer.id!==acting?.id)return null;
 return <div className="entity-manage"><button type="button" className="btn md soft manage-entry" onClick={()=>navigate(`/n/events/${e.id}/manage`)}><Settings/>{t('fe.host.manage')}</button></div>;
}

/** The organiser's announcements on the event page (sent to admitted people, V21 EVT-016). */
export function EventAnnouncements({items}:{items:unknown}){
 const {t,locale}=useI18n();const list=z.array(announcement).safeParse(items);
 if(!list.success||!list.data.length)return null;
 return <><div className="sec">{t('fe.host.ev.updates')}</div>{list.data.map(a=><div key={a.id} className="upd"><span className="ico l"><Bell/></span><span className="tx">
  <p style={{color:'var(--ink)',margin:0}}>{a.body}</p><small>{a.automatic?t('fe.host.ev.auto'):''}{rel(a.created_at,locale)}</small></span></div>)}</>;
}

/** E03 «Участие» for events by application: the state of my application and its action (apply / withdraw). */
export function EventApplication({e,onChange}:{e:{id:string,requiresApplication:boolean,state:string,past:boolean,organizer?:{id:string}|null|undefined,me:Record<string,unknown>},onChange:()=>void}){
 const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [confirm,setConfirm]=useState(false);
 if(!e.requiresApplication||e.state!=='published'||e.past||e.organizer?.id===acting?.id)return null;
 const parsed=application.nullable().optional().safeParse(e.me.application);const app=parsed.success?parsed.data??null:null;
 const waiting=!!e.me.waiting;const couple=acting?.kind==='couple';
 const st=waiting?'waiting':app&&['pending','approved','declined'].includes(app.state)?app.state:'none';
 const Icon=({none:FileText,pending:Clock,approved:CircleCheck,declined:X,waiting:Clock} as Record<string,LucideIcon>)[st]!;
 const withdraw=async()=>{
  if(!app)return;setBusy(true);setFailure('');
  try{await call('event.applicationWithdraw',{opId:newOpId(),applicationId:app.id},ok);setConfirm(false);onChange();}catch(x){setFailure(feErrorMessage(x,t));}finally{setBusy(false);}
 };
 return <>
  <div className="sec">{t('fe.host.ev.attendance')}</div>
  <div className="card list"><div className="statusline"><span className="ico"><Icon/></span><span className="tx"><b>{t('fe.host.app.st.'+st)}</b><small>{t('fe.host.app.stText.'+st)}</small></span></div></div>
  {st==='none'&&<Btn className="mt12" icon={FileText} onClick={()=>navigate(`/n/events/${e.id}/apply`)}>{couple?t('fe.host.app.applyCouple'):t('fe.host.app.apply')}</Btn>}
  {(st==='pending'||st==='approved')&&!confirm&&<Btn kind="soft" className="mt12" onClick={()=>setConfirm(true)} disabled={busy}>{t('fe.host.app.withdraw')}</Btn>}
  {confirm&&<Confirm title={t('fe.host.app.withdrawQ')} text={t('fe.host.app.withdrawText')} okLabel={t('fe.host.app.withdrawOk')} onOk={withdraw} onCancel={()=>setConfirm(false)} busy={busy}/>}
  <Failure text={failure}/>
 </>;
}

/** E06 — the application: answers to the organiser's questions, a note and the requirements. */
export function EventApplyScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const fetch=useCallback(()=>call('event.get',{eventId:id},evSchema).then(r=>r.event),[call,id]);
 const {data:e,error,load}=useLoad(fetch);
 const [answers,setAnswers]=useState<string[]>([]);const [note,setNote]=useState('');const [accepted,setAccepted]=useState(false);
 const [err,setErr]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [sent,setSent]=useState('');
 const couple=acting?.kind==='couple';const qs=e?.questions??[];
 const send=async()=>{
  if(!e)return;const x:Record<string,string>={};
  qs.forEach((_,i)=>{if((answers[i]??'').trim().length<3)x['q'+i]=t('fe.host.app.answerShort');});
  if(!accepted)x.ok=t('fe.host.app.acceptNeeded');
  setErr(x);if(Object.keys(x).length){shakeFirstErr();return;}
  setBusy(true);setFailure('');
  try{
   const r=await call('event.apply',{opId:newOpId(),eventId:id,answers:qs.map((_,i)=>(answers[i]??'').trim()),note:note.trim(),requirementsAccepted:true},joinRes);
   setSent(r.pending?t('fe.host.app.sentPartner'):t('fe.host.app.sent'));
  }catch(y){setFailure(feErrorMessage(y,t));}finally{setBusy(false);}
 };
 return <>
  <Bar title={t('fe.host.app.title')} back={`/n/events/${id}`}/>
  <div className="view nodock cta1"><div className="wrap">
   {!e?<Loading error={error} retry={load}/>
    :sent?<Empty icon={CircleCheck} role="status" title={sent} text={t('fe.host.app.sentText')}><Btn kind="soft" onClick={()=>navigate(`/n/events/${id}`,{replace:true})}>{t('fe.host.app.toEvent')}</Btn></Empty>
    :!e.requiresApplication||e.state!=='published'||e.past?<Empty icon={Lock} title={t('fe.host.app.closed')}/>
    :<>
     <p className="note" style={{margin:'0 0 12px'}}>{e.title}</p>
     <div className="alert info"><Eye/><span>{couple?t('fe.host.app.infoCouple'):t('fe.host.app.info')}</span></div>
     <section className="grp"><div className="grp-t"><span>{t('fe.host.app.answers')}</span></div><div className="card form-card">
      {qs.map((q,i)=><Field key={i} name={'q'+i} label={q} value={answers[i]??''} textarea rows={3} max={300} err={err['q'+i]}
       onChange={v=>{const a=[...answers];a[i]=v;setAnswers(a);if(err['q'+i]){const n={...err};delete n['q'+i];setErr(n);}}}/>)}
      <Field name="note" label={t('fe.host.app.note')} value={note} onChange={setNote} opt ph={t('fe.host.app.notePh')} textarea rows={2} max={300}/>
     </div></section>
     {e.requirements&&<><div className="sec">{t('fe.host.app.requirements')}</div><div className="card"><p className="note">{e.requirements}</p></div></>}
     <div className={'field'+(err.ok?' err':'')} style={{marginTop:16}}>
      <button type="button" className={'check'+(accepted?' on':'')+(err.ok?' err':'')} aria-pressed={accepted} onClick={()=>{setAccepted(v=>!v);const n={...err};delete n.ok;setErr(n);}}>
       <i><Check/></i><span>{t('fe.host.app.accept')}{err.ok&&<FErr>{err.ok}</FErr>}</span></button>
     </div>
     <Failure text={failure}/>
    </>}
  </div></div>
  {e&&!sent&&e.requiresApplication&&e.state==='published'&&!e.past&&<div className="ctabar"><div className="wrap"><Btn onClick={send} disabled={busy}>{couple?t('fe.host.app.sendCouple'):t('fe.host.app.send')}</Btn></div></div>}
 </>;
}

/** E15 — the organiser panel: counts, applications, an announcement, cancelling. */
export function EventManageScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const location=useLocation();
 const fetch=useCallback(()=>call('event.get',{eventId:id},evSchema).then(r=>r.event),[call,id]);
 const {data:e,error,load}=useLoad(fetch);
 const [mode,setMode]=useState<''|'announce'|'cancel'>('');const [body,setBody]=useState('');const [reason,setReason]=useState('');
 const [err,setErr]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const [done,setDone]=useState(()=>{const n=(location.state as {notice?:unknown}|null)?.notice;return typeof n==='string'?n:'';});
 const announce=async()=>{
  const b=body.trim();if(b.length<5){setErr(t('fe.host.ev.announceShort'));shakeFirstErr();return;}
  setBusy(true);setFailure('');
  try{await call('event.announce',{opId:newOpId(),eventId:id,body:b},ok);setBody('');setMode('');setDone(t('fe.host.ev.announceSent'));load();}catch(x){setFailure(feErrorMessage(x,t));}finally{setBusy(false);}
 };
 const cancel=async()=>{
  setBusy(true);setFailure('');
  try{await call('event.cancel',{opId:newOpId(),eventId:id,reason:reason.trim()},ok);setMode('');setDone(t('fe.host.ev.cancelled'));load();}catch(x){setFailure(feErrorMessage(x,t));}finally{setBusy(false);}
 };
 const mine=!!e&&e.organizer?.id===acting?.id;
 const open=!!e&&e.state==='published'&&!e.past;
 const st=(ev:Ev)=>ev.state==='cancelled'?<span className="pill bad">{t('fe.host.ev.st.cancelled')}</span>:ev.state==='published'?<span className="pill ok">{ev.past?t('fe.host.ev.st.past'):t('fe.host.ev.st.published')}</span>
  :<span className="pill wait">{t('fe.host.ev.st.review')}</span>;
 const tiles:[number,string,string][]=!e?[]:e.requiresApplication
  ?[[e.pendingApplications??0,t('fe.host.ev.tile.pending'),`/n/events/${id}/applications`],[e.going,t('fe.host.ev.tile.approved'),`/n/events/${id}/applications?k=approved`],[e.interested,t('fe.host.ev.tile.interested'),`/n/events/${id}/attendees?k=interested`]]
  :[[e.going,t('fe.host.ev.tile.going'),`/n/events/${id}/attendees?k=going`],[e.interested,t('fe.host.ev.tile.interested'),`/n/events/${id}/attendees?k=interested`]];
 return <>
  <Bar title={t('fe.host.ev.title')} back={`/n/events/${id}`}/>
  <View className="nodock">
   {!e?<Loading error={error} retry={load}/>:!mine?<Empty icon={Lock} title={t('fe.host.ev.onlyOrganizer')}/>:<>
    <p className="note" style={{margin:'0 0 8px'}}><b style={{color:'var(--ink)'}}>{e.title}</b></p>
    <div className="row mt12" style={{justifyContent:'space-between'}}>{st(e)}<Btn kind="text" auto onClick={()=>navigate(`/n/events/${id}`)}>{t('fe.host.ev.viewPage')} <ChevronRight/></Btn></div>
    {e.state==='cancelled'&&e.cancelReason&&<div className="alert err mt12"><Ban/><span>{e.cancelReason}</span></div>}
    {open&&e.requiresApplication&&(e.pendingApplications??0)>0&&<div className="alert warn mt12"><FileText/><span><b>{t('fe.host.ev.next')}</b>{t('fe.host.ev.nextText').replace('{n}',String(e.pendingApplications))}
     <button type="button" className="btn text auto" style={{display:'flex',marginTop:6}} onClick={()=>navigate(`/n/events/${id}/applications`)}>{t('fe.host.ev.openApps')} <ChevronRight/></button></span></div>}
    {e.state!=='cancelled'&&<div className={'stat3'+(e.requiresApplication?'':' two')}>{tiles.map(([n,l,go])=><button key={go} type="button" onClick={()=>navigate(go)}><b>{n}</b><small>{l}</small></button>)}</div>}
    <Failure text={failure}/><Done text={done}/>
    <div className="card list">
     {e.requiresApplication&&e.state!=='cancelled'&&<LinkRow icon={FileText} tone="v" title={t('fe.host.ev.apps')} badge={e.pendingApplications||undefined} onClick={()=>navigate(`/n/events/${id}/applications`)}/>}
     <LinkRow icon={Users} title={t('fe.host.ev.attendees')} onClick={()=>navigate(`/n/events/${id}/attendees?k=going`)}/>
     {!e.past&&['pending_partner','in_review','rejected','published'].includes(e.state)&&<LinkRow icon={Pencil} title={t('fe.ece.edit')} sub={e.state==='published'?t('fe.ece.e.editSub'):undefined} onClick={()=>navigate(`/n/events/${id}/edit`)}/>}
     {open&&<LinkRow icon={Bell} tone="l" title={t('fe.host.ev.announce')} sub={t('fe.host.ev.announceSub')} noChev onClick={()=>{setMode(mode==='announce'?'':'announce');setDone('');}}/>}
     {open&&<LinkRow icon={Ban} danger title={t('fe.host.ev.cancel')} noChev onClick={()=>{setMode(mode==='cancel'?'':'cancel');setDone('');}}/>}
    </div>
    {mode==='announce'&&<section className="grp"><div className="grp-t"><span>{t('fe.host.ev.announceTitle')}</span></div>
     <p className="lead">{t('fe.host.ev.announceLead')}</p>
     <div className="card form-card"><Field name="announce" label={t('fe.host.ev.announceLabel')} value={body} onChange={v=>{setBody(v);setErr('');}} err={err||undefined} textarea rows={4} max={500} ph={t('fe.host.ev.announcePh')}/></div>
     <div className="btns mt12"><Btn icon={Send} onClick={announce} disabled={busy}>{t('fe.host.ev.send')}</Btn><Btn kind="text" onClick={()=>setMode('')} disabled={busy}>{t('fe.cancel')}</Btn></div>
    </section>}
    {mode==='cancel'&&<Confirm title={t('fe.host.ev.cancelQ')} text={t('fe.host.ev.cancelText')} okLabel={t('fe.host.ev.cancel')} onOk={cancel} onCancel={()=>setMode('')} busy={busy}>
     <label className="field mt12" style={{display:'block'}}><span>{t('fe.host.ev.reason')}<i>{t('fe.host.optional')}</i></span>
      <textarea className="inp" rows={3} maxLength={300} value={reason} onChange={x=>setReason(x.target.value)}/></label>
     <span style={{display:'block',marginTop:8}}>{t('fe.host.ev.refunds')}</span>
    </Confirm>}
    {!!e.announcements?.length&&<><div className="sec">{t('fe.host.ev.sent')}</div>{e.announcements.map(a=><div key={a.id} className="upd"><span className="ico l"><Bell/></span><span className="tx">
     <p style={{color:'var(--ink)',margin:0}}>{a.body}</p><small>{a.automatic?t('fe.host.ev.auto'):''}{new Date(a.created_at).toLocaleString()}</small></span></div>)}</>}
   </>}
  </View>
 </>;
}

/** E16 — applications: pending / approved / declined; approve, decline, revoke (with a confirmation), approve after all. */
export function EventApplicationsScreen(){
 const {id=''}=useParams();const [sp,setSp]=useSearchParams();const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const k=(['pending','approved','declined'] as const).find(x=>x===sp.get('k'))??'pending';
 const fetch=useCallback(()=>call('event.applications',{eventId:id,state:k},appList).then(r=>r.items),[call,id,k]);
 const {data:items,error,load}=useLoad(fetch);
 const [busy,setBusy]=useState('');const [confirm,setConfirm]=useState('');const [failure,setFailure]=useState('');const [done,setDone]=useState('');
 const decide=async(a:z.infer<typeof appItem>,approve:boolean)=>{
  setBusy(a.id);setFailure('');setDone('');
  try{await call('event.applicationDecide',{opId:newOpId(),applicationId:a.id,rev:a.rev,approve},ok);setConfirm('');
   setDone(approve?t('fe.host.apps.approved').replace('{name}',pname(a.profile)):a.state==='approved'?t('fe.host.apps.revoked').replace('{name}',pname(a.profile)):t('fe.host.apps.declined'));load();}
  catch(x){setFailure(feErrorMessage(x,t));load();}finally{setBusy('');}
 };
 return <>
  <Bar title={t('fe.host.ev.apps')} back={`/n/events/${id}/manage`}/>
  <View className="nodock">
   <Seg value={k} onChange={v=>{setSp({k:v},{replace:true});setDone('');setFailure('');}} label={t('fe.host.ev.apps')}
    options={[{id:'pending',label:t('fe.host.apps.tab.pending')},{id:'approved',label:t('fe.host.apps.tab.approved')},{id:'declined',label:t('fe.host.apps.tab.declined')}]}/>
   <Failure text={failure}/><Done text={done}/>
   {!items?<Loading error={error} retry={load}/>
    :!items.length?<Empty icon={FileText} title={t('fe.host.apps.empty')} {...(k==='pending'?{text:t('fe.host.apps.emptyText')}:{})}/>
    :items.map(a=><div key={a.id} className="card application-card mt12">
     <div className="row"><button type="button" className="plink row g12 grow" style={{textAlign:'left'}} onClick={()=>navigate('/n/people/'+a.profile.id)}><Av name={pname(a.profile)} seed={a.profile.id}/>
      <span className="grow"><b style={{display:'block'}}>{pname(a.profile)}</b><small className="note" style={{display:'block'}}>{a.people.map(p=>[p.handle?'@'+p.handle:'',p.age?String(p.age):''].filter(Boolean).join(', ')).join(' · ')}{a.people.length?' · ':''}{rel(a.created_at,locale)}</small></span></button></div>
     {a.answers.map((x,i)=><div key={i} className="application-answer"><div style={{marginTop:4}}>{x}</div></div>)}
     {a.note&&<div className="application-answer"><div className="note">{t('fe.host.app.note')}</div><div style={{marginTop:4}}>{a.note}</div></div>}
     {k==='pending'?<div className="row g8 mt12"><Btn size="md" onClick={()=>decide(a,true)} disabled={busy===a.id}>{t('fe.host.approve')}</Btn><Btn kind="soft" size="md" onClick={()=>decide(a,false)} disabled={busy===a.id}>{t('fe.host.decline')}</Btn></div>
      :k==='approved'?(confirm===a.id?<Confirm title={t('fe.host.apps.revokeQ').replace('{name}',pname(a.profile))} text={t('fe.host.apps.revokeText')} okLabel={t('fe.host.apps.revokeOk')} onOk={()=>decide(a,false)} onCancel={()=>setConfirm('')} busy={busy===a.id}/>
        :<div className="row g8 mt12"><Btn kind="soft" size="md" onClick={()=>setConfirm(a.id)} disabled={busy===a.id}>{t('fe.host.apps.revoke')}</Btn></div>)
      :<div className="row g8 mt12"><Btn kind="soft" size="md" onClick={()=>decide(a,true)} disabled={busy===a.id}>{t('fe.host.apps.approveAfter')}</Btn></div>}
    </div>)}
  </View>
 </>;
}

/** E17 / E18 — who is going or interested (the organiser sees everyone). */
export function EventAttendeesScreen(){
 const {id=''}=useParams();const [sp,setSp]=useSearchParams();const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();
 const k=sp.get('k')==='interested'?'interested':'going';
 const fetch=useCallback(()=>call('event.attendees',{eventId:id,kind:k},attList),[call,id,k]);
 const {data,error,load}=useLoad(fetch);
 return <>
  <Bar title={t('fe.host.ev.attendees')} back={true}/>
  <View>
   <Seg value={k} onChange={v=>setSp({k:v},{replace:true})} label={t('fe.host.ev.attendees')} options={[{id:'going',label:t('fe.host.att.going')},{id:'interested',label:t('fe.host.att.interested')}]}/>
   {!data?<Loading error={error} retry={load}/>
    :!data.items.length?<Empty icon={Eye} title={t('fe.host.att.empty')} text={k==='interested'?t('fe.host.att.emptyInterested'):t('fe.host.att.emptyGoing')}/>
    :<>
     <p className="note mt12">{t('fe.host.att.count').replace('{n}',String(data.count))}{data.hidden?' · '+t('fe.host.att.hidden').replace('{n}',String(data.hidden)):''}</p>
     <div className="card list">{data.items.map(p=><button key={p.id} type="button" className="li" onClick={()=>navigate('/n/people/'+p.id)}><Av name={pname(p)} seed={p.id}/>
      <span className="tx"><b>{pname(p)}</b>{p.kind==='couple'&&<small>{t('fe.host.att.couple')}</small>}</span><ChevronRight/></button>)}</div>
    </>}
  </View>
 </>;
}

export {isHost as isCommunityHost};
export type {Comm};
