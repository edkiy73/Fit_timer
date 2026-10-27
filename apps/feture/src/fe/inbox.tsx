import {Fragment,useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Bell,Calendar,Check,CircleCheck,Clock,EyeOff,FileText,Filter,Heart,LockOpen,MessageCircle,Pencil,Shield,ShieldCheck,Trash2,Users,X,type LucideIcon} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Card,Chip,Chips,Empty,IconBtn,Note,Row,SectionLabel,Seg,Skel,Text,View,plate} from './kit';
import {useFe,useRealtime} from './session';
import {useToast} from './toast';
import {when} from './feed';
import {faceFields,NameBadges,withAge} from './faces';
import {useDecline} from './private';

/** Slice G2 (V21 N01) with the prototype's markup: «Нужно решить» (decision cards, grouped «Тебе» / «Паре» with an active
 * couple) and «Все уведомления» (rows `.nt`, «Новые» / «Ранее», filter chips, «Прочитать все»). One bell count
 * everywhere: unread notifications + things to decide. */
const actor=z.object({id:z.uuid(),kind:z.enum(['person','couple']).optional(),handle:z.string().nullable().optional(),name:z.string().nullable().optional(),...faceFields}).passthrough().nullable();
const decision=z.object({kind:z.string(),id:z.uuid(),objectId:z.uuid().nullable(),actor,at:z.string(),label:z.string(),addressee:z.uuid().nullable().optional()});
type Decision=z.infer<typeof decision>;
const decideRes=z.object({ok:z.literal(true),items:z.array(decision)});
const note=z.object({id:z.uuid(),type:z.string(),actor,data:z.record(z.string(),z.unknown()),label:z.string(),addressee:z.uuid().nullable().optional(),object:z.object({type:z.string(),id:z.uuid().nullable()}).nullable(),at:z.string(),read:z.boolean()});
type Note=z.infer<typeof note>;
const notesRes=z.object({ok:z.literal(true),items:z.array(note),next:z.string().nullable()});
export const countsRes=z.object({ok:z.literal(true),decide:z.number(),notifications:z.number(),bell:z.number(),chats:z.number(),newMatches:z.number(),likes:z.number()});
const ok=z.object({ok:z.literal(true)}).passthrough();
const revList=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),rev:z.number()}).passthrough())});
const nameOf=(a:z.infer<typeof actor>)=>a?(a.name||(a.handle?'@'+a.handle:'?')):'FetUre';

/** The one tab control under its older name here. */
export const SegN=Seg;

/** Bell with the shared count, for screen headers. */
export function BellButton(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const [n,setN]=useState(0);
 const live=useRef(true);
 const pull=useCallback(()=>{call('inbox.counts',{},countsRes,{asAccount:true}).then(r=>{if(live.current)setN(r.bell);}).catch(()=>{});},[call]);
 // Realtime signals refresh the count at once; the 30 s poll stays as the fallback.
 useEffect(()=>{live.current=true;pull();const id=setInterval(pull,30000);return ()=>{live.current=false;clearInterval(id);};},[pull]);
 useRealtime(['notify','decide','chat'],pull);
 return <IconBtn icon={Bell} label={n?t('fe.inbox.bellN').replace('{n}',String(n)):t('fe.inbox.title')} badge={n>0?n:undefined} onClick={()=>navigate('/n/inbox')}/>;
}

/* ---- kinds (filters) and icons, as the prototype's inboxKind / NICO ---- */
type Kind='access'|'likes'|'matches'|'replies'|'events'|'groups'|'pair'|'follows'|'links'|'posts'|'other';
const FILTERS:('all'|Kind)[]=['all','access','likes','matches','replies','events','groups','pair','follows','links','posts','other'];
const NOTE_KIND:Record<string,Kind>={grant:'access',like:'likes',match:'matches',reply:'replies',mention:'replies',follow:'follows',
 postLike:'posts',notePublished:'posts',tagAnswered:'posts',postDisputed:'posts',postRestored:'posts',disputeResolved:'posts',revisionApproved:'posts',revisionRejected:'posts',contentRemoved:'posts',reportResolved:'posts',
 communityApproved:'groups',communityDeclined:'groups',communityMember:'groups',communityPublished:'groups',communityRejected:'groups',communityClosed:'groups',discussionRemoved:'groups',
 eventPublished:'events',eventRejected:'events',eventHidden:'events',eventApplicationApproved:'events',eventApplicationDeclined:'events',
 linkAccepted:'links',linkDeclined:'links',linkChanged:'links',linkRemoved:'links'};
const noteKind=(n:Note):Kind=>n.type.startsWith('pair.')?'pair':NOTE_KIND[n.type]??'other';
const DECIDE_KIND:Record<string,Kind>={pinv:'pair',req:'access',capp:'groups',eapp:'events',link:'links',linkChange:'links',tag:'posts',joint:'pair',jointReturned:'pair'};
const decideKind=(d:Decision):Kind=>DECIDE_KIND[d.kind]??'other';
const NICO:Record<string,[LucideIcon,string]>={like:[Heart,'l'],match:[Heart,'l'],postLike:[Heart,'l'],follow:[Users,'v'],reply:[MessageCircle,'g'],mention:[AtSign,'v'],notePublished:[FileText,'v'],
 grant:[LockOpen,'g'],postDisputed:[EyeOff,'l'],postRestored:[Check,'g'],disputeResolved:[Check,'g'],revisionApproved:[Check,'g'],revisionRejected:[Shield,'l'],contentRemoved:[Shield,'l'],reportResolved:[Shield,'g'],
 communityApproved:[Users,'g'],communityDeclined:[Users,''],communityMember:[Users,'v'],communityPublished:[Check,'g'],communityRejected:[Shield,'l'],communityClosed:[Users,''],discussionRemoved:[Trash2,'l'],
 eventPublished:[Check,'g'],eventRejected:[Shield,'l'],eventHidden:[EyeOff,'l'],eventApplicationApproved:[Check,'g'],eventApplicationDeclined:[Calendar,''],
 linkAccepted:[Users,'g'],linkDeclined:[Users,''],linkChanged:[Users,'v'],linkRemoved:[Users,''],ageCheck:[ShieldCheck,'g'],photoCheck:[ShieldCheck,'g'],
 profileSuspended:[Shield,'l'],profileRestricted:[Shield,'l'],profileRestored:[Check,'g'],profileUnrestricted:[Check,'g'],appealDecided:[Shield,'']};
const noteIcon=(n:Note):[LucideIcon,string]=>n.type==='tagAnswered'?(n.data.answer==='ok'?[Check,'g']:[EyeOff,'l'])
 :(n.type==='ageCheck'||n.type==='photoCheck')&&n.data.state!=='approved'?[Shield,'l']:n.type.startsWith('pair.')?[Users,'v']:NICO[n.type]??[Bell,''];

/** «{name} …» with the name in bold, as the prototype's NTXT. */
function rich(text:string,name:string):ReactNode{
 const parts=text.split('{name}');
 return parts.map((p,i)=><Fragment key={i}>{p}{i<parts.length-1&&<b>{name}</b>}</Fragment>);
}

export function InboxScreen(){
 const {call,state,acting,setActing,reload}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [tab,setTab]=useState<'todo'|'all'|null>(null);const [filter,setFilter]=useState<'all'|Kind>('all');
 const [decide,setDecide]=useState<Decision[]|null>(null);const [notes,setNotes]=useState<Note[]|null>(null);
 const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState('');const [readAllBusy,setReadAllBusy]=useState(false);
 const load=useCallback(()=>{setError(null);Promise.all([call('decide.list',{},decideRes,{asAccount:true}),call('notifications.list',{},notesRes,{asAccount:true})])
  .then(([a,b])=>{setDecide(a.items);setNotes(b.items);}).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 useRealtime(['notify','decide'],load);

 const profiles=state.status==='ready'?state.boot.profiles.filter(p=>p.state!=='deleted'):[];
 const couple=profiles.find(p=>p.kind==='couple'&&p.state==='active')??null;
 const person=profiles.find(p=>p.kind==='person')??null;
 // V21 `inboxTab`: opens on «Нужно решить» when something waits, else on all notifications.
 const k=tab??(decide&&decide.length===0?'all':'todo');
 const unread=(notes??[]).filter(n=>!n.read).length;
 const pickTab=(v:'todo'|'all')=>{setTab(v);setFilter('all');};

 /** One decision at a time: the card's buttons show the spinner, the list reloads after. */
 const act=async(key:string,fn:()=>Promise<unknown>,done?:string)=>{
  if(busy)return;setBusy(key);
  // A failure reloads too: the item may have been answered elsewhere (another device, the partner).
  try{await fn();if(done)toast(done,{type:'ok'});load();}catch(e){toast(feErrorMessage(e,t),{type:'err'});load();}finally{setBusy('');}
 };
 const asProfile=(d:Decision)=>d.addressee?{profileId:d.addressee}:{};
 const declineAccess=useDecline();
 const decideApp=(d:Decision,approve:boolean)=>act(d.id+(approve?'y':'n'),async()=>{
  if(!d.objectId)throw new FeError('not_found',404);
  // The decision needs the request's revision, which the inbox row does not carry.
  if(d.kind==='capp'){const r=await call('community.requests',{communityId:d.objectId},revList,asProfile(d));const x=r.items.find(i=>i.id===d.id);if(!x)throw new FeError('not_found',404);
   await call('community.requestDecide',{opId:newOpId(),requestId:d.id,rev:x.rev,approve},ok,asProfile(d));}
  else{const r=await call('event.applications',{eventId:d.objectId},revList,asProfile(d));const x=r.items.find(i=>i.id===d.id);if(!x)throw new FeError('not_found',404);
   await call('event.applicationDecide',{opId:newOpId(),applicationId:d.id,rev:x.rev,approve},ok,asProfile(d));}
 },approve?t('fe.ibx.approved'):t('fe.ibx.declined'));
 /** Links and couple approvals are per profile: answer as the profile the item is addressed to (person or couple). */
 const asAddressee=(addressee?:string|null)=>{if(addressee&&addressee!==acting?.id&&profiles.some(p=>p.id===addressee))setActing(addressee);};

 const open=(n:Note)=>{
  if(!n.read){setNotes(list=>list?.map(x=>x.id===n.id?{...x,read:true}:x)??list);call('notifications.read',{id:n.id},ok,{asAccount:true}).catch(()=>{});}
  if(n.type.startsWith('link')){asAddressee(n.addressee);navigate('/n/me/links');return;}
  if(n.type==='ageCheck'){navigate('/n/settings/age');return;}
  if(n.type==='photoCheck'){navigate('/n/settings/photo-check');return;}
  if(n.type.startsWith('pair.')){if(couple)setActing(couple.id);navigate('/n/me');return;}
  const o=n.object;if(!o?.id){if(n.actor)navigate('/n/people/'+n.actor.id);return;}
  navigate(o.type==='post'||o.type==='reply'?'/n/feed/post/'+(n.data.postId as string|undefined??o.id):o.type==='community'?'/n/communities/'+o.id:o.type==='event'?'/n/events/'+o.id:o.type==='conversation'?'/n/chats/'+o.id:o.type==='profile'?'/n/people/'+o.id:'/n/me');
 };
 const readAll=async()=>{
  if(readAllBusy)return;setReadAllBusy(true);
  try{await call('notifications.readAll',{},ok,{asAccount:true});setNotes(list=>list?.map(x=>({...x,read:true}))??list);toast(t('fe.ibx.allRead'),{type:'ok'});}
  catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setReadAllBusy(false);}
 };

 const noteText=(n:Note):ReactNode=>{
  const who=nameOf(n.actor);
  if(n.type==='tagAnswered')return t('fe.ibx.t.tagAnswered.'+(['ok','no','remove'].includes(String(n.data.answer))?String(n.data.answer):'ok'));
  if(n.type==='ageCheck'||n.type==='photoCheck')return t(`fe.ibx.t.${n.type}.${n.data.state==='approved'?'approved':'other'}`);
  if(n.type.startsWith('pair.'))return <><b>{couple?.name||t('fe.inbox.whom.couple')}</b> · {t('fe.inbox.type.'+n.type)!=='fe.inbox.type.'+n.type?t('fe.inbox.type.'+n.type):t('fe.inbox.type.other')}</>;
  const key='fe.ibx.t.'+n.type;const s=t(key);
  if(s!==key)return rich(s,who);
  const label=t('fe.inbox.type.'+n.type)!=='fe.inbox.type.'+n.type?t('fe.inbox.type.'+n.type):t('fe.inbox.type.other');
  return n.actor?<><b>{who}</b> · {label}</>:label;
 };
 const whomTag=(label:string)=>couple?<span className={'whom'+(label==='couple'?' us':'')}>{label==='couple'?t('fe.ibx.tagCouple'):t('fe.ibx.tagMe')}</span>:null;
 const row=(n:Note)=>{const [Icon,tone]=noteIcon(n);
  return <button key={n.id} type="button" className={'nt'+(n.read?'':' unread')} onClick={()=>open(n)}>
   <span className="ntw">{n.actor?<Av name={nameOf(n.actor)} seed={n.actor.id} src={n.actor.avatar}/>:<span className="av k-anchor"><div className="plate" style={plate(n.object?.id??n.type)}/></span>}<span className={'ico'+(tone?' '+tone:'')}><Icon/></span></span>
   <span className="tx">{noteText(n)}<time>{whomTag(n.label)}{whomTag(n.label)?' ':''}{when(n.at,locale)}</time></span>
   {!n.read&&<span className="dotu" aria-label={t('fe.inbox.new')}/>}
  </button>;};

 /* ---- decisions (todoGroupHTML) ---- */
 const card=(d:Decision,text:string,buttons:ReactNode,thumb?:ReactNode)=><Card key={d.kind+d.id} className="rqcard">
  <div className="row">
   <button type="button" className="rq-av" aria-label={nameOf(d.actor)} onClick={()=>d.actor&&navigate('/n/people/'+d.actor.id)}><Av name={nameOf(d.actor)} seed={d.actor?.id??d.id} src={d.actor?.avatar}/></button>
   <button type="button" className="grow" onClick={()=>d.actor&&navigate('/n/people/'+d.actor.id)}><Text as="b" size="strong">{d.kind==='tag'?nameOf(d.actor):withAge(nameOf(d.actor),d.actor)}<NameBadges p={d.actor}/></Text><Note>{text} · {when(d.at,locale)}</Note></button>
   {thumb}
  </div>
  <div className="row g8 mt12">{buttons}</div>
 </Card>;
 const two=(d:Decision,yes:{label:string,fn:()=>void},no?:{label:string,fn:()=>void})=><>
  <Btn size="md" busy={busy===d.id+'y'} disabled={!!busy} onClick={yes.fn}>{yes.label}</Btn>
  {no&&<Btn size="md" kind="soft" busy={busy===d.id+'n'} disabled={!!busy} onClick={no.fn}>{no.label}</Btn>}
 </>;
 const decisionCard=(d:Decision)=>{
  switch(d.kind){
   case 'pinv':return card(d,t('fe.ibx.k.pinv'),two(d,
    {label:t('fe.ibx.accept'),fn:()=>void act(d.id+'y',async()=>{await call('couple.inviteAnswer',{opId:newOpId(),inviteId:d.id,accept:true},ok,{asAccount:true});reload();},t('fe.ibx.done'))},
    {label:t('fe.ibx.decline'),fn:()=>void act(d.id+'n',()=>call('couple.inviteAnswer',{opId:newOpId(),inviteId:d.id,accept:false},ok,{asAccount:true}),t('fe.ibx.declined'))}));
   case 'req':return card(d,d.label==='couple'?t('fe.ibx.k.reqCouple'):t('fe.ibx.k.req'),two(d,
    {label:t('fe.ibx.review'),fn:()=>{asAddressee(d.addressee);navigate('/n/me?layer=priv');}},
    // Declining says what the person will see and offers «Отменить» while the server still allows it.
    {label:t('fe.ibx.decline'),fn:()=>{if(busy)return;setBusy(d.id+'n');void declineAccess(d.id,nameOf(d.actor),load,asProfile(d)).finally(()=>setBusy(''));}}));
   case 'capp':case 'eapp':return card(d,d.kind==='capp'?t('fe.ibx.k.capp'):t('fe.ibx.k.eapp'),<>
    {two(d,{label:t('fe.ibx.approve'),fn:()=>void decideApp(d,true)},{label:t('fe.ibx.decline'),fn:()=>void decideApp(d,false)})}
   </>);
   case 'link':case 'linkChange':{const cmd=d.kind==='link'?'link.answer':'link.answerChange';const extra=d.kind==='link'?{vis:'all'}:{};
    return card(d,t('fe.ibx.k.'+d.kind),two(d,
     {label:t('fe.ibx.confirm'),fn:()=>void act(d.id+'y',()=>call(cmd,{opId:newOpId(),linkId:d.id,accept:true,...extra},ok,asProfile(d)),t('fe.ibx.done'))},
     {label:t('fe.ibx.decline'),fn:()=>void act(d.id+'n',()=>call(cmd,{opId:newOpId(),linkId:d.id,accept:false,...extra},ok,asProfile(d)),t('fe.ibx.declined'))}));}
   case 'tag':return card(d,t('fe.ibx.k.tag'),two(d,
    {label:t('fe.ibx.review'),fn:()=>navigate('/n/feed/post/'+(d.objectId??d.id))},
    {label:t('fe.ibx.against'),fn:()=>void act(d.id+'n',()=>call('tag.answer',{opId:newOpId(),postId:d.objectId??d.id,answer:'no'},ok,asProfile(d)),t('fe.ibx.declined'))}));
   default:return null;
  }
 };
 const jointRow=(d:Decision)=><Row key={d.kind+d.id} icon={d.kind==='jointReturned'?Pencil:Clock} noChev title={t('fe.ibx.k.'+d.kind)} sub={<>{t('fe.ibx.k.jointSub')} · {when(d.at,locale)}</>}
  onClick={()=>{asAddressee(d.addressee);navigate('/n/me');}}/>;
 const group=(items:Decision[])=>{
  const rest=items.filter(d=>d.kind==='joint'||d.kind==='jointReturned');
  const order=['pinv','link','linkChange','tag'];
  const first=items.filter(d=>order.includes(d.kind)).sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));
  const last=items.filter(d=>!order.includes(d.kind)&&!rest.includes(d));
  return <>{first.map(decisionCard)}{rest.length>0&&<Card list>{rest.map(jointRow)}</Card>}{last.map(decisionCard)}</>;
 };
 const whomHead=(w:'me'|'couple',n:number)=><div className={'sec whom-sec'+(w==='couple'?' us':'')}>
  {w==='couple'?<Av name={couple?.name??'?'} seed={couple?.id} size="xs" src={couple?.avatar}/>:<Av name={person?.name??'?'} seed={person?.id} size="xs" src={person?.avatar}/>}
  <span>{w==='couple'?t('fe.ibx.whomCouple').replace('{name}',couple?.name??''):t('fe.ibx.whomMe')}</span><b>{n}</b>
 </div>;
 const filteredEmpty=<Empty icon={Filter} title={t('fe.ibx.filteredEmpty')}><Btn kind="text" auto onClick={()=>setFilter('all')}>{t('fe.ibx.resetFilter')}</Btn></Empty>;
 const todo=()=>{
  const all=decide??[];const items=all.filter(d=>filter==='all'||decideKind(d)===filter);
  if(!items.length)return all.length?filteredEmpty:<Empty icon={CircleCheck} title={t('fe.ibx.allDone')} text={t('fe.ibx.allDoneText')}/>;
  if(!couple)return group(items);
  const mine=items.filter(d=>d.label!=='couple'),ours=items.filter(d=>d.label==='couple');
  const me=mine.length?<>{whomHead('me',mine.length)}{group(mine)}</>:null,us=ours.length?<>{whomHead('couple',ours.length)}{group(ours)}</>:null;
  return acting?.kind==='couple'?<>{us}{me}</>:<>{me}{us}</>;
 };
 const everything=()=>{
  const all=notes??[];const list=all.filter(n=>filter==='all'||noteKind(n)===filter);
  if(!list.length)return all.length?filteredEmpty:<Empty icon={Bell} title={t('fe.ibx.none')} text={t('fe.ibx.noneText')}/>;
  const neu=list.filter(n=>!n.read),old=list.filter(n=>n.read);
  // «Новые» opens its own block, so its label takes the kit's first-label spacing (`.sec:first-child`).
  return <>{neu.length>0&&<div><SectionLabel>{t('fe.ibx.new')}</SectionLabel>{neu.map(row)}</div>}{old.length>0&&<><SectionLabel>{t('fe.ibx.earlier')}</SectionLabel>{old.map(row)}</>}</>;
 };
 const kinds=new Set<Kind>(k==='todo'?(decide??[]).map(decideKind):(notes??[]).map(noteKind));
 const loading=decide===null||notes===null;
 return <>
  <Bar title={t('fe.inbox.title')} back/>
  <View className="nodock">
   <SegN small value={k} onChange={pickTab} options={[{id:'todo',label:t('fe.inbox.todo'),n:decide?.length??0},{id:'all',label:t('fe.inbox.all'),n:unread}]}/>
   {k==='all'&&unread>0&&<button type="button" className="inbox-read-all" disabled={readAllBusy} onClick={()=>void readAll()}><Check/>{t('fe.ibx.readAll')}</button>}
   {!loading&&!error&&<Chips scroll className="inbox-filters">{FILTERS.filter(v=>v==='all'||v===filter||kinds.has(v)).map(v=>
    <Chip key={v} on={filter===v} onClick={()=>setFilter(v)}>{t('fe.ibx.f.'+v)}</Chip>)}</Chips>}
   {error&&loading?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :loading?<Skel kind="list" rows={5}/>
    :k==='todo'?todo():everything()}
  </View>
 </>;
}
