import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate,useParams,useSearchParams} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Ban,Bell,ChevronRight,CircleCheck,Clock,Copy,Ellipsis,FileText,Flag,Info,Link as LinkIcon,Lock,Pencil,Pin,PinOff,Send,Settings,ShieldAlert,Trash2,TrendingDown,TrendingUp,User,UserMinus,UserPlus,Users,X,type LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Announcement,Answer,Ask,Av,Bar,Btn,Card,IconBtn,Check,Empty,Group,Note,PersonLine,Pill,RequestCard,Row,SectionLabel,Seg,Sheet,Skel,Stack,StatusCard,SubBar} from './kit';
import {useFe,usePartnerApproves} from './session';
import {useToast} from './toast';
import {when} from './feed';
import {FErr,Field,SelectRow,shakeFirstErr} from './create-community';
import {FIELD,serverFields,textError,textErrorMessage,type FieldName} from './kit/validate';
import {appUrl,copyLink,fill,okRes,pl,plWord} from './comm-kit';
import {EventCard} from './communities';
import {faceFields,NameBadges,withAge} from './faces';

/** Tools for community hosts and event organisers (V21 C04/C05 join, C03 «Участники» / C09, C10 manage, C11 requests;
 * E03 «Участие», E06 apply, E15 organiser panel, E16 applications, E17/E18 attendees). The server decides who may do
 * what; the screens only offer what the role allows. Results are told in toasts, confirmations are ask() dialogs. */

const prof=z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),...faceFields}).passthrough();
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
type Mem=z.infer<typeof memItem>;
const memList=z.object({ok:z.literal(true),count:z.number(),items:z.array(memItem).nullable(),next:z.string().nullable().optional()});
const discRes=z.object({ok:z.literal(true),locked:z.boolean(),items:z.array(z.object({id:z.uuid()}).passthrough())});
const inviteRes=z.object({ok:z.literal(true),token:z.string().optional(),expiresAt:z.string().optional(),revoked:z.boolean().optional()});
const joinRes=z.object({ok:z.literal(true),state:z.string().optional(),pending:z.unknown().optional()}).passthrough();

const announcement=z.object({id:z.uuid(),body:z.string(),automatic:z.boolean(),created_at:z.string()}).passthrough();
const application=z.object({id:z.uuid(),state:z.string(),rev:z.number()});
const evSchema=z.object({ok:z.literal(true),event:z.object({id:z.uuid(),title:z.string(),kind:z.string(),format:z.enum(['online','offline']),area:z.string().nullable(),tz:z.string(),
 startsAt:z.string(),endsAt:z.string(),price:z.object({kind:z.string()}).passthrough(),plate:z.string().nullable().optional(),state:z.string(),past:z.boolean(),requiresApplication:z.boolean(),
 questions:z.array(z.string()).nullable().optional(),requirements:z.string().nullable(),going:z.number(),interested:z.number(),cancelReason:z.string().nullable().optional(),
 organizer:z.object({id:z.uuid()}).passthrough().nullable().optional(),announcements:z.array(announcement).optional(),pendingApplications:z.number().optional(),
 me:z.object({application:application.nullable().optional(),waiting:z.unknown().optional()}).passthrough()}).passthrough()});
type Ev=z.infer<typeof evSchema>['event'];
const appItem=z.object({id:z.uuid(),state:z.string(),answers:z.array(z.string()),note:z.string().nullable(),rev:z.number(),created_at:z.string(),profile:prof,
 people:z.array(z.object({handle:z.string().nullable(),age:z.number().nullable()}))});
const appList=z.object({ok:z.literal(true),items:z.array(appItem)});
const attList=z.object({ok:z.literal(true),count:z.number(),hidden:z.number(),items:z.array(prof)});

/** Loads a screen's data with the usual loading / error / retry states. */
function useLoad<T>(fn:()=>Promise<T>){
 const [data,setData]=useState<T|null>(null);const [error,setError]=useState<unknown>(null);
 const load=useCallback(()=>{setError(null);fn().then(setData).catch(setError);},[fn]);
 useEffect(()=>{load();},[load]);
 return {data,error,load};
}
function Loading({error,retry,kind='list'}:{error:unknown,retry:()=>void,kind?:'list'|'card'}){
 const {t}=useI18n();
 return error?<Empty icon={Lock} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={retry}>{t('fe.retry')}</Btn></Empty>
  :<Skel kind={kind}/>;
}
/** «Отменить» for a decision the server cannot take back (a join request, an application — the person is told at
 * once): the call waits while the toast with «Отменить» is up and goes out after it; leaving the screen sends what
 * is waiting right away. */
const UNDO_MS=5000;
function useLater(){
 const jobs=useRef(new Map<string,{timer:number,run:()=>Promise<void>}>());
 useEffect(()=>{const all=jobs.current;return ()=>{for(const j of all.values()){clearTimeout(j.timer);void j.run();}all.clear();};},[]);
 const later=useCallback((key:string,run:()=>Promise<void>)=>{
  const timer=window.setTimeout(()=>{jobs.current.delete(key);void run();},UNDO_MS+400);jobs.current.set(key,{timer,run});},[]);
 const cancel=useCallback((key:string)=>{const j=jobs.current.get(key);if(!j)return false;clearTimeout(j.timer);jobs.current.delete(key);return true;},[]);
 return {later,cancel};
}

/** `personRow()` — avatar, name, a line under it and the chevron (opens the profile). */
function PersonRow({p,sub,end,onClick}:{p:Prof,sub?:string|undefined,end?:ReactNode,onClick?:()=>void}){
 const navigate=useNavigate();const {acting}=useFe();
 return <Row av={<Av name={pname(p)} seed={p.id} src={p.avatar}/>} title={<>{withAge(pname(p),p)}<NameBadges p={p}/></>} sub={sub||(p.handle&&p.name?'@'+p.handle:undefined)}
  end={end} onClick={onClick??(()=>navigate(p.id===acting?.id?'/n/me':'/n/people/'+p.id))}/>;
}

/* ---------------- Communities ---------------- */

/** On the community page for owners and hosts: «Управление» and the waiting requests (V21 COMM-012). */
export function CommunityHostEntry({c}:{c:{id:string,me?:{role:string,state:string}|null,pendingRequests?:unknown}}){
 const {t,locale}=useI18n();const navigate=useNavigate();
 if(!isHost(c))return null;
 const n=typeof c.pendingRequests==='number'?c.pendingRequests:0;
 return <>
  <Btn kind="soft" size="md" className="manage-entry" icon={Settings} onClick={()=>navigate(`/n/communities/${c.id}/manage`)}>{t('fe.host.manage')}</Btn>
  {n>0&&<Btn kind="text" auto className="k-push k-nowrap" onClick={()=>navigate(`/n/communities/${c.id}/requests`)}>{pl(n,t('fe.cm.newRequests'),locale)} <ChevronRight/></Btn>}
 </>;
}

/** C04/C05 — the join sheet: the rules, the join question for a closed community, «Принимаю правила». */
export function JoinSheet({c,invite,onClose,onDone}:{c:{id:string,name:string,privacy:string,rules:string[],joinQuestion?:string|null},invite?:string|undefined,onClose:()=>void,onDone:(msg:string)=>void}){
 const {call,acting}=useFe();const {t}=useI18n();
 const [answer,setAnswer]=useState('');const [accepted,setAccepted]=useState(false);
 const [err,setErr]=useState<{answer?:string|undefined,ok?:string|undefined}>({});const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const couple=acting?.kind==='couple';const closed=c.privacy!=='open';const q=closed?c.joinQuestion??null:null;const toPartner=usePartnerApproves();
 const send=async()=>{
  const e:{answer?:string|undefined,ok?:string|undefined}={};
  const ea=q?textError(t,'joinAnswer',answer):undefined;
  if(ea)e.answer=ea;else if(q&&answer.trim().length<10)e.answer=t('fe.host.join.answerShort');
  if(!accepted)e.ok=t('fe.host.join.acceptNeeded');
  setErr(e);if(Object.keys(e).length){shakeFirstErr();return;}
  setBusy(true);setFailure('');
  try{
   const r=await call('community.join',{opId:newOpId(),communityId:c.id,rulesAccepted:true,answer:closed?answer.trim():'',...(invite?{invite}:{})},joinRes);
   onDone(r.pending?t('fe.host.join.waitingPartner'):r.state==='member'?fill(t(couple?'fe.cm.joinedCouple':'fe.cm.joined'),{name:c.name}):t('fe.cm.requestSent'));
  }catch(x){const f=serverFields(x).find(f=>f.path==='answer');if(f){setErr({answer:textErrorMessage(t,f.code,FIELD.joinAnswer)});shakeFirstErr();}else setFailure(feErrorMessage(x,t));}finally{setBusy(false);}
 };
 return <Sheet title={closed?t('fe.host.join.requestTitle'):t('fe.host.join.rulesTitle')} onClose={onClose}
  foot={<Btn onClick={send} busy={busy} disabled={busy}>{toPartner?t('fe.ca.toPartner'):closed?t(couple?'fe.host.join.sendCouple':'fe.host.join.send'):t(couple?'fe.host.join.joinCouple':'fe.host.join.join')}</Btn>}>
  <Card className="flat"><ol className="rules">{c.rules.map((r,i)=><li key={i}>{r}</li>)}</ol></Card>
  {q&&<div className="mt16"><Field name="answer" label={q} value={answer} onChange={v=>{setAnswer(v);if(err.answer)setErr({...err,answer:undefined});}} err={err.answer} textarea rows={3} check="joinAnswer"
   ph={t('fe.host.join.answerPh')} hint={t('fe.host.join.answerHint')}/></div>}
  <div className={'field mt16'+(err.ok?' err':'')}>
   <Check on={accepted} error={!!err.ok} onChange={v=>{setAccepted(v);setErr({...err,ok:undefined});}}>{t('fe.host.join.accept')}{err.ok&&<FErr>{err.ok}</FErr>}</Check>
  </div>
  {failure&&<Alert kind="err" icon={Info} className="mt12">{failure}</Alert>}
 </Sheet>;
}

/** «⋯» of one discussion (V21 discMenu): the link for everyone; for hosts pin / unpin, keep out of «Популярное» or let
 * it back (discPop; the discussion stays in the list), and remove (with an ask() confirmation); others can report it. */
export function DiscussionHostSheet({d,host=true,onClose,onDone,onReport}:{d:{id:string,title:string|null,pinned?:boolean|undefined,popularExcluded?:boolean|undefined},host?:boolean,
 onClose:()=>void,onDone:(msg:string)=>void,onReport?:(()=>void)|undefined}){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();const [busy,setBusy]=useState(false);const [confirm,setConfirm]=useState(false);
 const act=async(change:'pin'|'unpin'|'remove'|'excludePopular'|'includePopular')=>{
  setBusy(true);
  try{await call('discussion.host',{opId:newOpId(),postId:d.id,change},okRes);onDone(change==='excludePopular'||change==='includePopular'?t('fe.w7.disc.'+change):t('fe.cm.disc.'+change));}
  catch(x){toast(feErrorMessage(x,t),{type:'err'});}finally{setBusy(false);}
 };
 const copy=async()=>{const okc=await copyLink(appUrl('/n/feed/post/'+d.id));onClose();toast(t(okc?'fe.w7.disc.copied':'fe.cm.copyFailed'),{type:okc?'ok':'warn'});};
 if(confirm)return <Ask icon={Trash2} danger title={t('fe.host.disc.removeQ')} text={t('fe.host.disc.removeText')} ok={t('fe.host.disc.remove')} busy={busy} onOk={()=>void act('remove')} onCancel={()=>setConfirm(false)}/>;
 return <Sheet title={t('fe.cm.discussion')} sub={d.title||undefined} onClose={onClose}><Card list>
  {host&&<Row icon={d.pinned?PinOff:Pin} tone="v" title={d.pinned?t('fe.host.disc.unpin'):t('fe.host.disc.pin')} noChev disabled={busy} onClick={()=>void act(d.pinned?'unpin':'pin')}/>}
  {host&&<Row icon={d.popularExcluded?TrendingUp:TrendingDown} title={d.popularExcluded?t('fe.w7.disc.includePopularRow'):t('fe.w7.disc.excludePopularRow')}
   sub={d.popularExcluded?undefined:t('fe.w7.disc.excludeSub')} noChev disabled={busy} onClick={()=>void act(d.popularExcluded?'includePopular':'excludePopular')}/>}
  <Row icon={LinkIcon} title={t('fe.cm.copyLink')} noChev onClick={()=>void copy()}/>
  {host&&<Row icon={Trash2} danger title={t('fe.host.disc.remove')} noChev disabled={busy} onClick={()=>setConfirm(true)}/>}
  {!host&&onReport&&<Row icon={Flag} danger title={t('fe.cm.report')} noChev onClick={onReport}/>}
 </Card></Sheet>;
}

/** C03 «Участники» (and C09): hosts, then members; a host taps a person to make them a host, stop them posting or remove them. */
export function MembersList({c,data,onChange}:{c:{id:string,me?:{role:string,state:string}|null,members:number},data:z.infer<typeof memList>|null,onChange:()=>void}){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [open,setOpen]=useState<Mem|null>(null);const [confirm,setConfirm]=useState(false);const [busy,setBusy]=useState(false);
 const host=isHost(c);const owner=host&&c.me?.role==='owner';
 const change=async(m:Mem,ch:'host'|'unhost'|'readOnly'|'canWrite'|'remove')=>{
  setBusy(true);
  try{await call('community.member',{opId:newOpId(),communityId:c.id,profileId:m.id,change:ch},okRes);toast(t('fe.host.mem.done.'+ch).replace('{name}',pname(m)),{type:'ok'});setOpen(null);setConfirm(false);onChange();}
  catch(x){toast(feErrorMessage(x,t),{type:'err'});}finally{setBusy(false);}
 };
 // «Показать ещё» (V21 cMoreMembers): the server gives 20 a page; further pages are added under the first one.
 const [more,setMore]=useState<{items:Mem[],next:string|null}|null>(null);const [loadingMore,setLoadingMore]=useState(false);
 useEffect(()=>{setMore(null);},[data]);
 const next=more?more.next:data?.next??null;
 const showMore=async()=>{if(!next||loadingMore)return;setLoadingMore(true);
  try{const r=await call('community.members',{communityId:c.id,cursor:next},memList);setMore(m=>({items:[...(m?.items??[]),...(r.items??[])],next:r.next??null}));}
  catch(x){toast(feErrorMessage(x,t),{type:'err'});}finally{setLoadingMore(false);}};
 if(!data)return <Skel kind="list"/>;
 const items=data.items===null?null:[...data.items,...(more?.items??[]).filter(m=>!data.items!.some(x=>x.id===m.id))];
 const sub=(m:Mem)=>m.id===acting?.id?(m.role==='owner'?t('fe.cm.youOwner'):t('fe.host.mem.you')):m.role==='owner'?t('fe.cm.owner'):m.role==='host'?t('fe.cm.hostSub'):m.read_only?t('fe.cm.cantPost'):undefined;
 const canManage=(m:Mem)=>host&&m.id!==acting?.id&&m.role!=='owner'&&(m.role!=='host'||owner);
 const row=(m:Mem)=><PersonRow key={m.id} p={m} sub={sub(m)??(m.handle&&m.name?'@'+m.handle:t('fe.cm.memberSub'))} {...(canManage(m)?{onClick:()=>setOpen(m),end:<IconBtn icon={Ellipsis} kind="ghost" size="sm" label={t('fe.cm.more')} onClick={()=>setOpen(m)}/>}:{})}/>;
 const hosts=items?.filter(m=>m.role!=='member')??[];const members=items?.filter(m=>m.role==='member')??[];
 return <>
  {host&&<Note className="k-mem-hint">{t('fe.host.mem.hint')}</Note>}
  {items===null?<><SectionLabel>{pl(data.count,t('fe.cm.members'),locale)}</SectionLabel><Note>{t('fe.host.mem.afterJoin')}</Note></>:<>
   <SectionLabel className="k-sec-first">{t('fe.host.mem.hosts')}</SectionLabel>
   <Card list>{hosts.map(row)}</Card>
   <SectionLabel>{pl(data.count,t('fe.cm.members'),locale)}</SectionLabel>
   {members.length?<Card list>{members.map(row)}</Card>:<Note>{t('fe.cm.noOtherMembers')}</Note>}
   {next&&<Btn kind="soft" className="mt12" busy={loadingMore} disabled={loadingMore} onClick={()=>void showMore()}>{t('fe.w7.mem.more')}</Btn>}
  </>}
  {open&&!confirm&&<Sheet title={pname(open)} onClose={()=>setOpen(null)}><Card list>
   <Row icon={User} title={t('fe.host.mem.profile')} onClick={()=>navigate('/n/people/'+open.id)}/>
   {owner&&<Row icon={open.role==='host'?UserMinus:UserPlus} tone="v" noChev disabled={busy} title={open.role==='host'?t('fe.host.mem.unhost'):t('fe.host.mem.makeHost')}
    sub={open.role==='host'?t('fe.host.mem.unhostSub'):t('fe.host.mem.makeHostSub')} onClick={()=>void change(open,open.role==='host'?'unhost':'host')}/>}
   {open.role==='member'&&<Row icon={Lock} noChev disabled={busy} title={open.read_only?t('fe.host.mem.canWrite'):t('fe.host.mem.makeReadOnly')} sub={open.read_only?undefined:t('fe.host.mem.readOnlySub')}
    onClick={()=>void change(open,open.read_only?'canWrite':'readOnly')}/>}
   {open.role==='member'&&<Row icon={X} danger noChev disabled={busy} title={t('fe.host.mem.remove')} onClick={()=>setConfirm(true)}/>}
  </Card></Sheet>}
  {open&&confirm&&<Ask icon={X} danger title={t('fe.host.mem.removeQ').replace('{name}',pname(open))} text={t('fe.host.mem.removeText')} ok={t('fe.host.mem.removeOk')} busy={busy}
   onOk={()=>void change(open,'remove')} onCancel={()=>setConfirm(false)}/>}
 </>;
}

/** C10 — community manage: counts, requests, members, description and rules, access and the invite link. */
export function CommunityManageScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const location=useLocation();const toast=useToast();
 const fetch=useCallback(()=>Promise.all([call('community.get',{communityId:id},commSchema),call('community.discussions',{communityId:id},discRes).catch(()=>null)]).then(([a,b])=>({c:a.community,discs:b?.items.length??0})),[call,id]);
 const {data,error,load}=useLoad(fetch);const c=data?.c;
 // The edit screen comes back with what happened to the edit (saved, or waiting for staff).
 const notice=useRef((location.state as {notice?:unknown}|null)?.notice);
 useEffect(()=>{if(typeof notice.current==='string'){toast(notice.current,{type:'ok'});notice.current=undefined;}},[toast]);
 const [busy,setBusy]=useState(false);const [reports,setReports]=useState(false);
 const owner=!!c&&c.me?.role==='owner'&&c.me.state==='active'&&typeof c.rev==='number';
 const pendingPrivacy=(()=>{const p=c?.pendingChange;return p&&typeof p==='object'&&'privacy' in p&&typeof (p as {privacy?:unknown}).privacy==='string'?(p as {privacy:string}).privacy:'';})();
 const setPrivacy=async(privacy:'open'|'closed'|'hidden')=>{
  if(!c||busy||privacy===c.privacy||typeof c.rev!=='number')return;
  setBusy(true);
  try{const r=await call('community.update',{opId:newOpId(),communityId:id,rev:c.rev,privacy},updateRes);toast(r.review.includes('privacy')?t('fe.ece.priv.review'):t('fe.ece.priv.now.'+privacy),{type:'ok'});load();}
  catch(x){toast(feErrorMessage(x,t),{type:'err'});if(x instanceof FeError&&x.code==='conflict')load();}finally{setBusy(false);}
 };
 const n=c?.pendingRequests??0;
 return <>
  <SubBar title={t('fe.host.manage')} sub={c?.name} back={`/n/communities/${id}`}/>
  <div className="view nodock"><div className="wrap">
   {!c?<Loading error={error} retry={load}/>:!isHost(c)?<Empty icon={Lock} title={t('fe.host.onlyHosts')} text={t('fe.host.onlyHostsText')}/>:<>
    <div className="stat3">
     <button type="button" onClick={()=>navigate(`/n/communities/${id}?t=members`)}><b>{c.members}</b><small>{plWord(c.members,t('fe.cm.members'),locale)}</small></button>
     <button type="button" onClick={()=>navigate(`/n/communities/${id}`)}><b>{data.discs}</b><small>{plWord(data.discs,t('fe.cm.discussions'),locale)}</small></button>
     <button type="button" onClick={()=>navigate(`/n/communities/${id}/requests`)}><b>{n}</b><small>{t('fe.host.requestsWaiting')}</small></button>
    </div>
    <Card list>
     <Row icon={FileText} tone="v" title={t('fe.host.requests')} badge={n||undefined} onClick={()=>navigate(`/n/communities/${id}/requests`)}/>
     <Row icon={Users} title={t('fe.host.membersTitle')} sub={t('fe.host.membersSub')} onClick={()=>navigate(`/n/communities/${id}?t=members`)}/>
     <Row icon={ShieldAlert} title={t('fe.w7.c10.reports')} sub={t('fe.w7.c10.reportsSub')} onClick={()=>setReports(true)}/>
     {owner&&<Row icon={Pencil} title={t('fe.cm.descRules')} onClick={()=>navigate(`/n/communities/${id}/edit`)}/>}
    </Card>
    {reports&&<Sheet title={t('fe.w7.c10.reports')} sub={c.name} onClose={()=>setReports(false)}>
     <Empty icon={ShieldAlert} title={t('fe.w7.c10.none')} text={t('fe.w7.c10.noneText')}/>
    </Sheet>}
    <SectionLabel>{t('fe.host.access')}</SectionLabel>
    <Card list>
     {owner?<SelectRow icon={Lock} label={t('fe.cc.privacy')} value={c.privacy as 'open'|'closed'|'hidden'} onChange={v=>{void setPrivacy(v);}}
       sub={pendingPrivacy?t('fe.ece.priv.pending').replace('{p}',t('fe.cc.privacy.'+pendingPrivacy)):t('fe.ece.priv.sub.'+c.privacy)}
       items={(['open','closed','hidden'] as const).map(k=>[k,t('fe.cc.privacy.'+k)])}/>
      :<Row icon={Lock} title={t('fe.cc.privacy')} sub={t('fe.ece.priv.sub.'+c.privacy)} val={t('fe.cc.privacy.'+c.privacy)}/>}
     {c.privacy==='hidden'&&<InviteRows communityId={id}/>}
    </Card>
   </>}
  </div></div>
 </>;
}

/** `commInvite` — a new invitation link, copied to the clipboard; all links can be revoked. */
function InviteRows({communityId}:{communityId:string}){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const [link,setLink]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [confirm,setConfirm]=useState(false);
 const copy=async(url:string)=>{const okc=await copyLink(url);toast(okc?t('fe.host.invite.copied'):t('fe.host.invite.copyManually'),{type:okc?'ok':'warn'});};
 const create=async()=>{
  setBusy(true);
  try{const r=await call('community.invite',{opId:newOpId(),communityId},inviteRes);if(!r.token)throw new FeError('unavailable');
   const url=appUrl(`/n/communities/${communityId}?invite=${encodeURIComponent(r.token)}`);setLink(url);await copy(url);}
  catch(x){toast(feErrorMessage(x,t),{type:'err'});}finally{setBusy(false);}
 };
 const revoke=async()=>{
  setBusy(true);
  try{await call('community.invite',{opId:newOpId(),communityId,revokeAll:true},inviteRes);setLink(null);setConfirm(false);toast(t('fe.host.invite.revoked'),{type:'ok'});}
  catch(x){toast(feErrorMessage(x,t),{type:'err'});}finally{setBusy(false);}
 };
 return <>
  <Row icon={LinkIcon} title={t('fe.host.invite.title')} sub={t('fe.cm.inviteSub')} noChev onClick={()=>void create()} disabled={busy}/>
  {link&&<Row icon={Copy} noChev wrap title={link} onClick={()=>void copy(link)}/>}
  <Row icon={Ban} danger title={t('fe.host.invite.revokeAll')} noChev onClick={()=>setConfirm(true)} disabled={busy}/>
  {confirm&&<Ask icon={Ban} danger title={t('fe.host.invite.revokeQ')} text={t('fe.host.invite.revokeText')} ok={t('fe.host.invite.revoke')} busy={busy} onOk={()=>void revoke()} onCancel={()=>setConfirm(false)}/>}
 </>;
}

/** C11 — join requests: new ones with approve / decline, and the decisions. */
export function CommunityRequestsScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t,locale}=useI18n();const toast=useToast();
 const [sp,setSp]=useSearchParams();const tab=sp.get('t')==='history'?'history':'pending';
 const [c,setC]=useState<Comm|null>(null);
 const loadC=useCallback(()=>{call('community.get',{communityId:id},commSchema).then(r=>setC(r.community)).catch(()=>{});},[call,id]);
 useEffect(()=>{loadC();},[loadC]);
 const fetch=useCallback(()=>call('community.requests',{communityId:id,tab},reqList).then(r=>r.items),[call,id,tab]);
 const {data:items,error,load}=useLoad(fetch);
 const [busy,setBusy]=useState('');
 // Decided cards leave the list at once; the decision is sent once «Отменить» is gone (V21 cRequestDecision).
 const [held,setHeld]=useState<Set<string>>(new Set());const {later,cancel}=useLater();
 const unhold=(id:string)=>setHeld(s=>{const n=new Set(s);n.delete(id);return n;});
 const decide=(r:z.infer<typeof reqItem>,approve:boolean)=>{
  setHeld(s=>new Set(s).add(r.id));
  later('req'+r.id,async()=>{setBusy(r.id);
   try{await call('community.requestDecide',{opId:newOpId(),requestId:r.id,rev:r.rev,approve},okRes);}
   catch(x){toast(feErrorMessage(x,t),{type:'err'});}finally{setBusy('');unhold(r.id);load();loadC();}});
  toast(approve?t('fe.cm.req.approved'):t('fe.host.req.declined'),{type:'ok',ms:UNDO_MS,action:{label:t('fe.mx.undo'),fn:()=>{if(cancel('req'+r.id))unhold(r.id);else toast(t('fe.w7.undo.late'),{type:'warn'});}}});
 };
 return <>
  <SubBar title={t('fe.cm.reqTitle')} sub={c?.name} back={`/n/communities/${id}`}/>
  <div className="view nodock"><div className="wrap">
   <Seg value={tab} onChange={v=>setSp(v==='history'?{t:'history'}:{},{replace:true})} label={t('fe.cm.reqTitle')}
    options={[{id:'pending',label:t('fe.host.req.tabNew'),n:c?.pendingRequests},{id:'history',label:t('fe.host.req.tabHistory')}]}/>
   {!items?<Loading error={error} retry={load} kind="card"/>
    :!items.filter(r=>!held.has(r.id)).length?<Empty icon={FileText} title={tab==='history'?t('fe.host.req.noHistory'):t('fe.host.req.none')} text={t('fe.host.req.privacy')}/>
    :items.filter(r=>!held.has(r.id)).map(r=><Card key={r.id} className="application-card mt12">
     <PersonRow p={r.profile}/>
     <Note>{when(r.decided_at??r.created_at,locale)}{r.state!=='pending'?' · '+t('fe.host.req.state.'+r.state):''}</Note>
     {r.answer&&<p className="application-answer">{r.answer}</p>}
     {r.state==='pending'&&<div className="row g8"><Btn onClick={()=>void decide(r,true)} disabled={!!busy} busy={busy===r.id}>{t('fe.host.approve')}</Btn><Btn kind="soft" onClick={()=>void decide(r,false)} disabled={!!busy}>{t('fe.host.decline')}</Btn></div>}
    </Card>)}
  </div></div>
 </>;
}

/** C09 — hosts and members as a screen of its own (the same list as the community page tab). */
export function CommunityMembersScreen(){
 const {id=''}=useParams();const {call}=useFe();const {t}=useI18n();
 const fetch=useCallback(()=>Promise.all([call('community.get',{communityId:id},commSchema),call('community.members',{communityId:id},memList)]).then(([a,b])=>({c:a.community,m:b})),[call,id]);
 const {data,error,load}=useLoad(fetch);
 return <>
  <SubBar title={t('fe.host.membersTitle')} sub={data?.c.name} back={`/n/communities/${id}`}/>
  <div className="view nodock"><div className="wrap">
   {!data?<Loading error={error} retry={load}/>:<MembersList c={data.c} data={data.m} onChange={load}/>}
  </div></div>
 </>;
}

/* ---------------- Events ---------------- */

/** E03 «Участие» for events by application: my application as one StatusCard (the same card as a community join
 * request): the state, what happens next, and «Отозвать» on the right while it waits (for the organizer, or for the
 * partner of a couple). */
export function EventApplicationLines({e,busy,onWithdraw,onCancelWait}:{e:{requiresApplication:boolean,me:Record<string,unknown>},busy?:boolean,
 /** Withdraw a pending application (asks first). */ onWithdraw?:()=>void,/** Take back a couple's application the partner has not approved yet. */ onCancelWait?:()=>void}){
 const {t}=useI18n();
 if(!e.requiresApplication)return null;
 const parsed=application.nullable().optional().safeParse(e.me.application);const app=parsed.success?parsed.data??null:null;
 // Only a waiting application counts here: a couple's «идём» waiting for the partner is the RSVP's business.
 const wait=e.me.waiting as {kind?:string}|null|undefined;
 const st=wait?.kind==='event.apply'?'waiting':app&&['pending','approved','declined'].includes(app.state)?app.state:'none';
 const Icon=({none:FileText,pending:Clock,approved:CircleCheck,declined:X,waiting:Users} as Record<string,LucideIcon>)[st]!;
 const tone=({pending:'wait',waiting:'wait',approved:'ok',declined:'bad'} as Record<string,'wait'|'ok'|'bad'>)[st];
 const act=st==='pending'?onWithdraw:st==='waiting'?onCancelWait:undefined;
 return <><SectionLabel>{t('fe.host.ev.attendance')}</SectionLabel>
  <StatusCard tone={tone} icon={Icon} title={t('fe.host.app.st.'+st)} sub={t('fe.host.app.stText.'+st)}
   action={act&&<Btn kind="soft" size="sm" auto fit disabled={busy} onClick={act}>{t('fe.host.join.withdraw')}</Btn>}/></>;
}

/** E06 — the application: answers to the organiser's questions, a note and the requirements. */
export function EventApplyScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const fetch=useCallback(()=>call('event.get',{eventId:id},evSchema).then(r=>r.event),[call,id]);
 const {data:e,error,load}=useLoad(fetch);
 const [answers,setAnswers]=useState<string[]>([]);const [note,setNote]=useState('');const [accepted,setAccepted]=useState(false);
 const [err,setErr]=useState<Record<string,string>>({});const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const couple=acting?.kind==='couple';const qs=e?.questions?.length?e.questions:[];const toPartner=usePartnerApproves();
 const open=!!e&&e.requiresApplication&&e.state==='published'&&!e.past;
 const send=async()=>{
  if(!e)return;const x:Record<string,string>={};
  qs.forEach((_,i)=>{const a=answers[i]??'';const m=a.trim().length<3?t('fe.host.app.answerShort'):textError(t,'eventAnswer',a);if(m)x['q'+i]=m;});
  const en=textError(t,'applyNote',note);if(en)x.note=en;
  if(!accepted)x.ok=t('fe.host.app.acceptNeeded');
  setErr(x);if(Object.keys(x).length){shakeFirstErr();return;}
  setBusy(true);setFailure('');
  try{
   const r=await call('event.apply',{opId:newOpId(),eventId:id,answers:qs.map((_,i)=>(answers[i]??'').trim()),note:note.trim(),requirementsAccepted:true},joinRes);
   toast(r.pending?t('fe.host.app.sentPartner'):t('fe.cm.appSent'),{type:'ok'});navigate(`/n/events/${id}`,{replace:true});
  }catch(y){
   // answers.N → the N-th answer, note → the note (contracts/events.mjs event.apply).
   const x:Record<string,string>={};for(const {path,code} of serverFields(y)){const [h,n]=path.split('.');const k=h==='answers'?'q'+(n??0):h==='note'?'note':'';
    const r:FieldName|undefined=h==='answers'?'eventAnswer':h==='note'?'applyNote':undefined;if(k&&r&&!x[k])x[k]=textErrorMessage(t,code,FIELD[r]);}
   if(Object.keys(x).length){setErr(x);shakeFirstErr();}else setFailure(feErrorMessage(y,t));
  }finally{setBusy(false);}
 };
 return <>
  <SubBar title={t('fe.cm.applyTitle')} sub={e?.title} back={`/n/events/${id}`}/>
  <div className={'view nodock'+(open?' cta1':'')}><div className="wrap">
   {!e?<Loading error={error} retry={load} kind="card"/>
    :!open?<Empty icon={Lock} title={t('fe.host.app.closed')}/>
    :<>
     <Alert kind="info">{couple?t('fe.host.app.infoCouple'):t('fe.host.app.info')}</Alert>
     <Group title={t('fe.host.app.answers')}><Card form>
      {qs.map((q,i)=><Field key={i} name={'q'+i} label={q} value={answers[i]??''} textarea rows={3} check="eventAnswer" err={err['q'+i]}
       onChange={v=>{const a=[...answers];a[i]=v;setAnswers(a);if(err['q'+i]){const n={...err};delete n['q'+i];setErr(n);}}}/>)}
      <Field name="note" label={t('fe.host.app.note')} value={note} onChange={v=>{setNote(v);if(err.note){const n={...err};delete n.note;setErr(n);}}} err={err.note} opt ph={t('fe.host.app.notePh')} textarea rows={2} check="applyNote"/>
     </Card></Group>
     <div className={'field'+(err.ok?' err':'')}>
      <Check on={accepted} error={!!err.ok} onChange={v=>{setAccepted(v);const n={...err};delete n.ok;setErr(n);}}>{t('fe.host.app.accept')}{err.ok&&<FErr>{err.ok}</FErr>}</Check>
     </div>
     {failure&&<Alert kind="err" icon={X} className="mt12">{failure}</Alert>}
    </>}
  </div></div>
  {open&&<div className="ctabar"><div className="wrap"><Btn onClick={()=>void send()} busy={busy} disabled={busy}>{toPartner?t('fe.ca.toPartner'):couple?t('fe.host.app.sendCouple'):t('fe.host.app.send')}</Btn></div></div>}
 </>;
}

/** The event as the list card wants it (E15 shows the row card on top). */
const asCard=(e:Ev)=>({id:e.id,title:e.title,kind:e.kind,format:e.format,area:e.area,tz:e.tz,starts_at:e.startsAt,ends_at:e.endsAt,price:e.price,requires_application:e.requiresApplication,state:e.state,plate:e.plate??null});

/** E15 — the organiser panel: counts, applications, an announcement, edit, cancel. */
export function EventManageScreen(){
 const {id=''}=useParams();const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const location=useLocation();const toast=useToast();
 const fetch=useCallback(()=>call('event.get',{eventId:id},evSchema).then(r=>r.event),[call,id]);
 const {data:e,error,load}=useLoad(fetch);
 const [mode,setMode]=useState<''|'announce'|'cancel'>('');const [body,setBody]=useState('');const [reason,setReason]=useState('');
 const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
 const notice=useRef((location.state as {notice?:unknown}|null)?.notice);
 useEffect(()=>{if(typeof notice.current==='string'){toast(notice.current,{type:'ok'});notice.current=undefined;}},[toast]);
 const announce=async()=>{
  const b=body.trim();const m=b.length<5?t('fe.host.ev.announceShort'):textError(t,'announcement',b);if(m){setErr(m);shakeFirstErr();return;}
  setBusy(true);
  try{await call('event.announce',{opId:newOpId(),eventId:id,body:b},okRes);setBody('');setMode('');toast(t('fe.host.ev.announceSent'),{type:'ok'});load();}
  catch(x){const f=serverFields(x).find(f=>f.path==='body');if(f){setErr(textErrorMessage(t,f.code,FIELD.announcement));shakeFirstErr();}else toast(feErrorMessage(x,t),{type:'err'});}finally{setBusy(false);}
 };
 const [reasonErr,setReasonErr]=useState('');
 const cancel=async()=>{
  const m=textError(t,'reason',reason);if(m){setReasonErr(m);shakeFirstErr();return;}
  setBusy(true);
  try{await call('event.cancel',{opId:newOpId(),eventId:id,reason:reason.trim()},okRes);setMode('');toast(t('fe.host.ev.cancelled'),{type:'ok'});load();}catch(x){toast(feErrorMessage(x,t),{type:'err'});}finally{setBusy(false);}
 };
 const mine=!!e&&e.organizer?.id===acting?.id;
 const cancelled=e?.state==='cancelled';const open=!!e&&e.state==='published'&&!e.past;
 const pend=e?.pendingApplications??0;
 const st=(ev:Ev)=>ev.state==='cancelled'?<Pill tone="bad">{t('fe.host.ev.st.cancelled')}</Pill>:ev.state==='pending_partner'?<Pill tone="wait" icon={Clock}>{t('fe.cm.waitsPartnerT')}</Pill>
  :ev.state==='published'?<Pill tone="ok">{ev.past?t('fe.host.ev.st.past'):t('fe.host.ev.st.published')}</Pill>:ev.state==='rejected'?<Pill tone="bad">{t('fe.cm.rejected')}</Pill>
  :<Pill tone="wait">{t('fe.host.ev.st.review')}</Pill>;
 const tiles:[number,string,string][]=!e?[]:e.requiresApplication
  ?[[pend,t('fe.host.ev.tile.pending'),`/n/events/${id}/applications`],[e.going,t('fe.host.ev.tile.approved'),`/n/events/${id}/applications?k=approved`],[e.interested,t('fe.host.ev.tile.interested'),`/n/events/${id}/attendees?k=interested`]]
  :[[e.going,t('fe.host.ev.tile.going'),`/n/events/${id}/attendees?k=going`],[e.interested,t('fe.host.ev.tile.interested'),`/n/events/${id}/attendees?k=interested`]];
 return <>
  <Bar title={t('fe.host.ev.title')} back={`/n/events/${id}`}/>
  <div className="view nodock"><div className="wrap">
   {!e?<Loading error={error} retry={load} kind="card"/>:!mine?<Empty icon={Lock} title={t('fe.host.ev.onlyOrganizer')}/>:<>
    <EventCard e={asCard(e)} row org={e.organizer?pname(e.organizer as {name?:string|null,handle?:string|null}):undefined}/>
    <Stack row gap={3} justify="between" className="mt12">{st(e)}<Btn kind="text" auto onClick={()=>navigate(`/n/events/${id}`)}>{t('fe.host.ev.viewPage')} <ChevronRight/></Btn></Stack>
    {cancelled&&e.cancelReason&&<Alert kind="err" icon={Ban} className="mt12">{e.cancelReason}</Alert>}
    {e.state==='pending_partner'&&<Alert kind="warn" icon={Clock} className="mt12"><b>{t('fe.cm.waitsPartnerT')}</b>{t('fe.cm.waitsPartnerText')}</Alert>}
    {!cancelled&&pend>0&&<Alert kind="warn" icon={FileText} className="mt12" action={<Btn kind="text" auto onClick={()=>navigate(`/n/events/${id}/applications`)}>{t('fe.host.ev.openApps')} <ChevronRight/></Btn>}>
     <b>{t('fe.host.ev.next')}</b>{fill(t('fe.cm.reviewN'),{n:pl(pend,t('fe.cm.applicationsAcc'),locale)})}</Alert>}
    {!cancelled&&<div className={'stat3'+(e.requiresApplication?'':' two')}>{tiles.map(([n,l,go])=><button key={go} type="button" onClick={()=>navigate(go)}><b>{n}</b><small>{l}</small></button>)}</div>}
    <Card list>
     {e.requiresApplication&&!cancelled&&<Row icon={FileText} tone="v" title={t('fe.cm.appsAndAdmission')} badge={pend||undefined} onClick={()=>navigate(`/n/events/${id}/applications`)}/>}
     {open&&<Row icon={Bell} tone="l" title={t('fe.host.ev.announce')} sub={t('fe.host.ev.announceSub')} onClick={()=>{setErr('');setMode('announce');}}/>}
     {!cancelled&&!e.past&&['pending_partner','in_review','rejected','published'].includes(e.state)&&<Row icon={Pencil} title={t('fe.ece.edit')} sub={t('fe.ece.e.editSub')} onClick={()=>navigate(`/n/events/${id}/edit`)}/>}
     {open&&<Row icon={Ban} danger title={t('fe.host.ev.cancel')} noChev onClick={()=>setMode('cancel')}/>}
    </Card>
    {!!e.announcements?.length&&<><SectionLabel>{t('fe.host.ev.sent')}</SectionLabel>{e.announcements.map(a=><Announcement key={a.id} icon={Bell} body={a.body} meta={<>{a.automatic?t('fe.cm.auto'):''}{when(a.created_at,locale)}</>}/>)}</>}
   </>}
  </div></div>
  {e&&mode==='announce'&&<Sheet title={t('fe.host.ev.announceTitle')} onClose={()=>setMode('')} foot={<Btn icon={Send} onClick={()=>void announce()} busy={busy} disabled={busy}>{t('fe.host.ev.send')}</Btn>}>
   <p className="lead">{t('fe.host.ev.announceLead')}</p>
   <Field name="announce" label={t('fe.host.ev.announceLabel')} value={body} onChange={v=>{setBody(v);setErr('');}} err={err||undefined} textarea rows={4} check="announcement" ph={t('fe.host.ev.announcePh')}/>
  </Sheet>}
  {e&&mode==='cancel'&&<Ask icon={Ban} danger title={t('fe.host.ev.cancelQ')} text={t('fe.host.ev.cancelText')} ok={t('fe.host.ev.cancel')} busy={busy} onOk={()=>void cancel()} onCancel={()=>setMode('')}>
   <Field name="reason" className="k-left" label={t('fe.host.ev.reason')} opt textarea rows={3} check="reason" value={reason} err={reasonErr||undefined} onChange={v=>{setReason(v);setReasonErr('');}}/>
   <p className="mt8">{t('fe.host.ev.refunds')}</p>
  </Ask>}
 </>;
}

/** E16 — applications: pending / approved / declined; approve, decline, revoke (with a confirmation), approve after all. */
export function EventApplicationsScreen(){
 const {id=''}=useParams();const [sp,setSp]=useSearchParams();const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 const k=(['pending','approved','declined'] as const).find(x=>x===sp.get('k'))??'pending';
 const fetch=useCallback(()=>Promise.all([call('event.get',{eventId:id},evSchema).then(r=>r.event),
  ...(['pending','approved','declined'] as const).map(s=>call('event.applications',{eventId:id,state:s},appList).then(r=>r.items))])
  .then(([e,p,a,d])=>({e:e as Ev,lists:{pending:p as z.infer<typeof appItem>[],approved:a as z.infer<typeof appItem>[],declined:d as z.infer<typeof appItem>[]}})),[call,id]);
 const {data,error,load}=useLoad(fetch);
 const [busy,setBusy]=useState('');const [confirm,setConfirm]=useState<z.infer<typeof appItem>|null>(null);
 // The card leaves its tab at once and its buttons stay locked; the decision goes out once «Отменить» is gone (V21 appDecide).
 const [held,setHeld]=useState<Set<string>>(new Set());const {later,cancel}=useLater();
 const unhold=(id:string)=>setHeld(s=>{const n=new Set(s);n.delete(id);return n;});
 const decide=(a:z.infer<typeof appItem>,approve:boolean)=>{
  setConfirm(null);setHeld(s=>new Set(s).add(a.id));
  later('app'+a.id,async()=>{setBusy(a.id);
   try{await call('event.applicationDecide',{opId:newOpId(),applicationId:a.id,rev:a.rev,approve},okRes);}
   catch(x){toast(feErrorMessage(x,t),{type:'err'});}finally{setBusy('');unhold(a.id);load();}});
  toast(approve?t('fe.host.apps.approved').replace('{name}',pname(a.profile)):a.state==='approved'?t('fe.host.apps.revoked').replace('{name}',pname(a.profile)):t('fe.host.apps.declined'),
   {type:'ok',ms:UNDO_MS,action:{label:t('fe.mx.undo'),fn:()=>{if(cancel('app'+a.id))unhold(a.id);else toast(t('fe.w7.undo.late'),{type:'warn'});}}});
 };
 const items=data?.lists[k].filter(a=>!held.has(a.id));const qs=data?.e.questions??[];const cancelled=data?.e.state==='cancelled';
 return <>
  <SubBar title={t('fe.cm.appsTitle')} sub={data?.e.title} back={`/n/events/${id}/manage`}/>
  <div className="view nodock"><div className="wrap">
   <Seg value={k} onChange={v=>setSp({k:v},{replace:true})} label={t('fe.cm.appsTitle')}
    options={(['pending','approved','declined'] as const).map(s=>({id:s,label:t('fe.host.apps.tab.'+s),n:data?.lists[s].length}))}/>
   {!items?<Loading error={error} retry={load} kind="card"/>
    :!items.length?<Empty icon={FileText} title={t('fe.host.apps.empty')} {...(k==='pending'?{text:t('fe.host.apps.emptyText')}:{})}/>
    :items.map(a=><RequestCard key={a.id} className="application-card mt12"
     person={<PersonLine av={<Av name={pname(a.profile)} seed={a.profile.id} src={a.profile.avatar}/>} label={pname(a.profile)} onOpen={()=>navigate('/n/people/'+a.profile.id)}
      name={<>{pname(a.profile)}{a.people.length===1&&a.people[0]!.age?`, ${a.people[0]!.age}`:''}<NameBadges p={a.profile}/></>}
      sub={<>{a.people.length>1?a.people.map(p=>[p.handle?'@'+p.handle:'',p.age?String(p.age):''].filter(Boolean).join(', ')).join(' · ')+' · ':''}{when(a.created_at,locale)}</>}/>}
     actions={k==='pending'?<><Btn size="md" onClick={()=>void decide(a,true)} disabled={!!busy} busy={busy===a.id}>{t('fe.host.approve')}</Btn><Btn kind="soft" size="md" onClick={()=>void decide(a,false)} disabled={!!busy}>{t('fe.host.decline')}</Btn></>
      :cancelled?null:k==='approved'?<Btn kind="soft" size="md" onClick={()=>setConfirm(a)} disabled={!!busy}>{t('fe.host.apps.revoke')}</Btn>
      :<Btn kind="soft" size="md" onClick={()=>void decide(a,true)} disabled={!!busy} busy={busy===a.id}>{t('fe.host.apps.approveAfter')}</Btn>}>
     {a.answers.map((x,i)=><Answer key={i} q={qs[i]}>{x}</Answer>)}
     {a.note&&<Answer q={t('fe.host.app.note')}>{a.note}</Answer>}
    </RequestCard>)}
  </div></div>
  {confirm&&<Ask icon={X} danger title={t('fe.host.apps.revokeQ').replace('{name}',pname(confirm.profile))} text={t('fe.host.apps.revokeText')} ok={t('fe.host.apps.revokeOk')} busy={busy===confirm.id}
   onOk={()=>void decide(confirm,false)} onCancel={()=>setConfirm(null)}/>}
 </>;
}

/** E17 / E18 — who is going or interested (the organiser sees everyone; guests see who shows it). */
export function EventAttendeesScreen(){
 const {id=''}=useParams();const [sp,setSp]=useSearchParams();const {call,acting}=useFe();const {t}=useI18n();
 const k=sp.get('k')==='interested'?'interested':'going';
 const fetch=useCallback(()=>Promise.all([call('event.get',{eventId:id},evSchema).then(r=>r.event),call('event.attendees',{eventId:id,kind:k},attList)]).then(([e,l])=>({e,l})),[call,id,k]);
 const {data,error,load}=useLoad(fetch);
 const org=data?.e.organizer?.id===acting?.id;
 return <>
  <SubBar title={t('fe.cm.crowdTitle')} sub={data?.e.title}/>
  <div className="view nodock"><div className="wrap">
   <Seg small value={k} onChange={v=>setSp({k:v},{replace:true})} label={t('fe.cm.crowdTitle')} options={[{id:'going',label:data?.e.past?t('fe.cm.attended'):t('fe.host.att.going')},{id:'interested',label:t('fe.host.att.interested')}]}/>
   {!data?<Loading error={error} retry={load}/>:<>
    {data.l.items.length?<Card list>{data.l.items.map(p=><PersonRow key={p.id} p={p} sub={p.id===acting?.id?t(p.kind==='couple'?'fe.cm.thatsYouTwo':'fe.cm.thatsYou'):p.kind==='couple'?t('fe.host.att.couple'):undefined}/>)}</Card>
     :<Note>{t('fe.cm.nobody')}</Note>}
    {k==='going'&&data.l.items.some(p=>p.kind==='couple')&&<Note className="mt12">{t('fe.cm.coupleTwo')}</Note>}
    {k==='going'&&!org&&data.l.hidden>0&&<Note className="mt12">{fill(t('fe.cm.hiddenN'),{n:data.l.hidden})}</Note>}
   </>}
  </div></div>
 </>;
}

export {isHost as isCommunityHost};
export type {Comm};
