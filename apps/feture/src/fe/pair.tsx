import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Check,Copy,EyeOff,Heart,Link as LinkIcon,Lock,ShieldCheck,Users,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {publicBase} from '../api-url';
import {copyLink} from './share';
import {canGoBack,useBack,ToggleRow,Actions,Alert,Av,Bar,Btn,Card,Empty,Field,Group,H,Input,Note,PersonLine,Pill,RadioList,RequestCard,Row,Sheet,Skel,Stack,View,Who,useLeaveGuard} from './kit';
import {useFe,useLive} from './session';
import {Ask} from './me';
import {useToast} from './toast';
import {when} from './feed';
import {ApprovalView,CoupleWork} from './couple';
import {OLD_MODE,SWITCHABLE} from '../../contracts/_approve.mjs';
import {PAIR_TOKEN as TOKEN,dropPairLink as dropLink,pendingPairLink} from './pair-link';

/** Slice E (V21 Q01, Q06, Q07): a couple starts by an invitation to an exact nickname, or by a single-use link for
 * a partner without an account (the link survives the sign-up in this tab); both partners must be free. Accepting forms
 * the couple with defaults and shows «Пара создана» (owner 04.11.2026: no set-up step). On Q01: what waits
 * for approval, the couple in Discover, «Моё подтверждение», the quick safety actions and stopping the couple. */
const who=z.object({id:z.uuid(),handle:z.string().nullable(),name:z.string().nullable()}).nullable();
const invitesRes=z.object({ok:z.literal(true),outgoing:z.array(z.object({id:z.uuid(),state:z.string(),created_at:z.string(),profile:who})),incoming:z.array(z.object({id:z.uuid(),created_at:z.string(),profile:who})),
 link:z.object({id:z.uuid(),createdAt:z.string(),expiresAt:z.string()}).nullable().optional()});
const coupleRes=z.object({ok:z.literal(true),couple:z.object({id:z.uuid(),handle:z.string().nullable().optional(),name:z.string().nullable(),chosenName:z.string().optional(),state:z.string(),since:z.string(),restoreUntil:z.string().nullable(),endedAt:z.string().nullable().optional(),
 members:z.array(z.object({me:z.boolean(),profileId:z.uuid(),handle:z.string().nullable(),name:z.string().nullable(),approvesPartner:z.boolean(),approvesScope:z.array(z.string()).optional(),restoreAgreed:z.boolean(),purgeAgreed:z.boolean().optional()}))})});
const ok=z.object({ok:z.literal(true)}).passthrough();
const settingsRes=z.object({ok:z.literal(true),settings:z.object({discoverMode:z.string(),requestsFrom:z.enum(['all','matches','none']).optional()}).passthrough()});
const listRes=z.object({ok:z.literal(true),items:z.array(z.unknown())}).passthrough();
const pendingRes=z.object({ok:z.literal(true),items:z.array(z.object({kind:z.string(),state:z.string().optional(),change:z.record(z.string(),z.unknown()).nullable()}).passthrough())});
const linkRes=z.object({ok:z.literal(true),id:z.uuid(),token:z.string(),expiresAt:z.string()});
const peekRes=z.object({ok:z.literal(true),from:z.object({id:z.uuid(),handle:z.string().nullable(),name:z.string().nullable()}),expiresAt:z.string()});
const acceptRes=z.object({ok:z.literal(true),state:z.string(),profileId:z.uuid().optional()}).passthrough();
const nameOf=(p:{name?:string|null,handle?:string|null}|null|undefined)=>p?(p.name||(p.handle?'@'+p.handle:'?')):'?';
const found=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),avatar:z.object({pending:z.boolean().optional(),src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional()}).passthrough())});
// people.search sends the avatar as a media object; the small variant is enough here.
const thumb=(f:{avatar?:{pending?:boolean|undefined,src?:Record<string,string>|null|undefined}|null|undefined})=>f.avatar&&!f.avatar.pending?f.avatar.src?.thumb??f.avatar.src?.card??null:null;
type Found=z.infer<typeof found>['items'][number];
type Couple=z.infer<typeof coupleRes>['couple'];
const NICK=/^[a-z0-9_.]{3,20}$/i;

const linkUrl=(token:string)=>`${publicBase()}#/n/me/pair?link=${token}`;

/** V21 Q01 live preview under the nickname field: «найден» with the photo, or the one reason it can't be invited. */
function usePartnerLookup(nick:string,personId:string|undefined,ownHandle:string|null|undefined){
 const {call}=useFe();const [hit,setHit]=useState<Found|null|'none'>(null);
 const n=nick.trim().replace(/^@/,'').toLowerCase();
 useEffect(()=>{setHit(null);if(!personId||!NICK.test(n)||n===ownHandle?.toLowerCase())return;
  const ctl=new AbortController();
  const timer=setTimeout(()=>{call('people.search',{q:n},found,{profileId:personId,signal:ctl.signal})
   .then(r=>setHit(r.items.find(x=>x.kind==='person'&&x.handle?.toLowerCase()===n)??'none')).catch(()=>{});},350);
  return ()=>{clearTimeout(timer);ctl.abort();};},[n,personId,ownHandle,call]);
 const issue=!n?'':n===ownHandle?.toLowerCase()?'own':!NICK.test(n)?(n.length>=3?'format':''):hit==='none'?'none':'';
 return {hit:hit&&hit!=='none'?hit:null,issue};
}

function Scene({me,other,state}:{me:{name:string,id?:string|undefined,src?:string|null|undefined},other?:{name:string,id?:string|undefined,src?:string|null|undefined}|null,state?:string}){
 return <div className={'pair-scene'+(state?' '+state:'')}><span className="ps-av me"><Av name={me.name} seed={me.id} src={me.src}/></span><span className="ps-link"><i/><i/><i/><b><Heart/></b></span>
  <span className="ps-av ot">{other?<Av name={other.name} seed={other.id} src={other.src}/>:<span className="av ini"><b>?</b></span>}</span></div>;
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `/n/me/pair`: `?approval=<id>` opens that approval in any state over whatever the pair screen shows (a cold start,
 * a push, the inbox row, another id while one is open); `?restore=<coupleId>` is the restore screen of that couple. */
export function PairScreen(){
 const {search}=useLocation();const navigate=useNavigate();
 const q=new URLSearchParams(search);const approval=q.get('approval');const restore=q.get('restore');
 // Closing the approval or the restore screen goes back where it was opened from (the inbox, a push, the pair screen).
 const drop=(k:string)=>{if(canGoBack()){navigate(-1);return;}const n=new URLSearchParams(search);n.delete(k);const rest=n.toString();navigate('/n/me/pair'+(rest?'?'+rest:''),{replace:true});};
 return <>
  {restore&&UUID.test(restore)?<RestoreView coupleId={restore} onLeave={()=>drop('restore')}/>:<PairMain onOpen={id=>navigate('/n/me/pair?approval='+id)}/>}
  {approval&&UUID.test(approval)&&<ApprovalView key={approval} id={approval} onClose={()=>drop('approval')}/>}
 </>;
}

function PairMain({onOpen}:{onOpen:(id:string)=>void}){
 const {state,acting,call,reload,setActing}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const toast=useToast();const {search}=useLocation();
 const q=new URLSearchParams(search);
 // The couple, or else its archive (after «Не восстанавливать»): the same screen says which.
 const couples=state.status==='ready'?state.boot.profiles.filter(p=>p.kind==='couple'&&p.state!=='deleted'):[];
 const couple=couples.find(p=>!p.ended)??couples[0];
 const person=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='person'):undefined;
 const [inv,setInv]=useState<z.infer<typeof invitesRes>|null>(null);const [c,setC]=useState<Couple|null>(null);
 const [nick,setNick]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [confirmStop,setConfirmStop]=useState(()=>q.get('stop')==='1');
 const [fresh,setFresh]=useState(false);const [askNew,setAskNew]=useState(false);
 const [link,setLink]=useState<{url:string,expiresAt:string}|null>(null);
 // The token is shown once (only its hash is kept): a live link is not copied again, «Новая ссылка» replaces it after asking.
 const [askLink,setAskLink]=useState(false);
 const [token,setToken]=useState<string|null>(()=>{const v=q.get('link');return v&&TOKEN.test(v)?v:pendingPairLink();});
 const op=useRef(newOpId());
 const lookup=usePartnerLookup(nick,person?.id,person?.handle);
 const load=useCallback(()=>{
  setFailure('');
  // While a stopped couple is being replaced (fresh) its profile is gone after the invitation: don't read it.
  if(couple&&!fresh)call('couple.get',{},coupleRes,{profileId:couple.id,fresh:true}).then(r=>setC(r.couple)).catch(e=>setFailure(feErrorMessage(e,t)));
  else setC(null);
  if(!couple||fresh)call('couple.invites',{},invitesRes,{asAccount:true,fresh:true}).then(setInv).catch(e=>setFailure(feErrorMessage(e,t)));
 },[call,couple,fresh,t]);
 useEffect(()=>{load();},[load]);
 // The partner accepted, declined, stopped or restored (`changed:couple`, and `boot` brings the couple itself).
 useLive(['couple','decide'],load);
 // Already in a couple: a partner link cannot be used — say so once and forget it.
 const inCouple=couple?.state==='active';
 useEffect(()=>{if(token&&inCouple){dropLink();setToken(null);toast(t('fe.pair.rule.already_in_couple'),{type:'warn'});}},[token,inCouple,toast,t]);
 const pairError=(e:unknown)=>pairErrorText(e,t);
 const act=async(fn:()=>Promise<unknown>,after?:()=>void)=>{setBusy(true);setFailure('');try{await fn();after?.();load();}catch(e){setFailure(pairError(e));}finally{setBusy(false);}};
 const toCreated=()=>{reload();navigate('/n/me/pair?created=1',{replace:true});};
 // The inviter waiting on this screen sees the same «Пара создана» when the partner accepts.
 const waiting=useRef(false);
 useEffect(()=>{if(!couple)waiting.current=!!inv?.outgoing.some(o=>o.state==='pending');
  else if(waiting.current&&couple.state==='active'){waiting.current=false;navigate('/n/me/pair?created=1',{replace:true});}},[couple,inv,navigate]);
 const meName=nameOf(person);
 const guard=useLeaveGuard(!busy&&!!nick.trim());const toMe=useBack('/n/me');
 if(state.status!=='ready')return null;
 // A partner link: who invites, then accept (the couple forms at once) → Q09.
 if(token&&!inCouple)return <LinkLanding token={token} me={{name:meName,id:person?.id,src:person?.avatar}}
  auto={q.get('auto')==='1'} onClose={()=>{dropLink();setToken(null);navigate('/n/me/pair',{replace:true});}} onAccepted={()=>{dropLink();setToken(null);toCreated();}}/>;
 if(q.get('created')==='1'){
  if(!couple||couple.state!=='active'||!c)return <><Bar title={t('fe.c6.made.title')} back="/n/me"/><View><Skel kind="list"/></View></>;
  return <CreatedView c={c} onSettings={()=>navigate('/n/me/pair',{replace:true})} onDone={toMe}/>;
 }
 if(couple&&!fresh&&!c&&!failure)return <><Bar title={t('fe.pair.title')} back="/n/me"/><View><Skel kind="list"/></View></>;
 // V21 Q07: a stopped couple — the restore screen (both within 30 days), or start a new couple, which ends the old one.
 if(couple&&c&&c.state==='paused'&&!fresh){
  const [me,other]=[c.members.find(m=>m.me),c.members.find(m=>!m.me)];
  return <>
   <RestoreView coupleId={couple.id} onLeave={toMe} extra={<>
    {c.endedAt?<Btn kind="text" onClick={()=>{if(acting?.kind==='couple'&&person)setActing(person.id);setFresh(true);}}>{t('fe.pq.new')}</Btn>
     :<><Btn kind="soft" onClick={()=>setAskNew(true)}>{t('fe.pq.new')}</Btn><Note className="center">{t('fe.pq.newNote')}</Note></>}
    {acting?.kind==='couple'&&person&&<Btn kind="text" onClick={()=>{setActing(person.id);navigate('/n/me');}}>{t('fe.pq.toPersonal')}</Btn>}
   </>}/>
   {askNew&&<Ask icon={Users} danger title={t('fe.pq.newTitle')} text={t('fe.pq.newText',{name:c.name||`${nameOf(me)} ${t('fe.pair.and')} ${nameOf(other)}`})} ok={t('fe.pq.newOk')}
    onCancel={()=>setAskNew(false)} onOk={()=>{setAskNew(false);if(acting?.kind==='couple'&&person)setActing(person.id);setFresh(true);}}/>}
  </>;
 }
 if(couple&&c&&!fresh){
  const [me,other]=[c.members.find(m=>m.me),c.members.find(m=>!m.me)];
  return <>
   <Bar title={t('fe.pair.settings')} back="/n/me"/>
   <View><div className="pair-wrap">
    <Scene me={{name:nameOf(me),id:me?.profileId}} other={{name:nameOf(other),id:other?.profileId}} state="on"/>
    <H level={2} className="t center">{c.name||`${nameOf(me)} ${t('fe.pair.and')} ${nameOf(other)}`}</H>
    <Note className="center">{t('fe.pair.since').replace('{date}',new Date(c.since).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long',year:'numeric'}))}</Note>
    <div className="pair-sets">
     <CoupleWork coupleId={couple.id} onOpen={onOpen}/>
     <CoupleSettings c={c} coupleId={couple.id} other={nameOf(other)} trustOpen={q.get('trust')==='1'} onChanged={load}/>
     <Group title={t('fe.pair.act')}>
      <Btn kind="soft" onClick={()=>{setActing(couple.id);navigate('/n/me');}}>{t('fe.pair.actAsUs')}</Btn></Group>
     {c.state==='active'&&<Group title={t('fe.pair.careful')}>
      {!confirmStop?<Card list><Row icon={X} danger title={t('fe.pair.stop')} onClick={()=>setConfirmStop(true)}/></Card>
       :<Card><Stack gap={3}><p>{t('fe.pair.stopText')}</p><Actions stack>
        <Btn kind="danger" disabled={busy} onClick={()=>act(()=>call('couple.stop',{opId:newOpId(),confirm:true},ok,{profileId:couple.id}),()=>{setConfirmStop(false);reload();})}>{t('fe.pair.stop')}</Btn>
        <Btn kind="text" onClick={()=>setConfirmStop(false)}>{t('fe.cancel')}</Btn></Actions></Stack></Card>}
     </Group>}
    </div>
    {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
   </div></View>
  </>;
 }
 const out=inv?.outgoing.find(o=>o.state==='pending');
 const makeLink=()=>act(async()=>{
  const r=await call('couple.linkCreate',{opId:newOpId()},linkRes,{asAccount:true});const url=linkUrl(r.token);
  setLink({url,expiresAt:r.expiresAt});
  if(await copyLink(url))toast(t('fe.c6.link.copied'),{type:'ok'}); // else the sheet shows it to copy by hand
 });
 return <>
  <Bar title={t('fe.pair.title')} back="/n/me"/>
  <View><div className="pair-wrap">
   <Scene state={out?'on':lookup.hit?'ready':''} me={{name:meName,id:person?.id,src:person?.avatar}}
    other={out?.profile?{name:nameOf(out.profile),id:out.profile.id}:lookup.hit?{name:nameOf(lookup.hit),id:lookup.hit.id,src:thumb(lookup.hit)}:null}/>
   <H level={2} className="t center">{out?t('fe.pair.waiting').replace('{name}',nameOf(out.profile)):t('fe.pair.inviteTitle')}</H>
   <Note className="center">{t('fe.pair.inviteText')}</Note>
   {inv===null?<Skel kind="list"/>:<>
    {inv.incoming.map(i=><RequestCard key={i.id} person={<PersonLine av={<Av name={nameOf(i.profile)} seed={i.profile?.id??i.id}/>} name={nameOf(i.profile)} sub={<>{t('fe.inbox.kind.pinv')} · {when(i.created_at,locale)}</>}/>}
     actions={<><Btn size="md" disabled={busy} onClick={()=>act(()=>call('couple.inviteAnswer',{opId:newOpId(),inviteId:i.id,accept:true},ok,{asAccount:true}),toCreated)}>{t('fe.inbox.accept')}</Btn>
      <Btn size="md" kind="soft" disabled={busy} onClick={()=>act(()=>call('couple.inviteAnswer',{opId:newOpId(),inviteId:i.id,accept:false},ok,{asAccount:true}))}>{t('fe.priv.decline')}</Btn></>}/>)}
    {out?<Btn kind="soft" disabled={busy} onClick={()=>act(()=>call('couple.inviteWithdraw',{opId:newOpId(),inviteId:out.id},ok,{asAccount:true}))}>{t('fe.pair.withdraw')}</Btn>
     :<Card form>
      <Field id="fe-pair-nick" label={t('fe.pair.partnerNick')} hint={t('fe.pair.nickHint')}><div className="inwrap"><AtSign/><Input id="fe-pair-nick" value={nick} onChange={e=>setNick(e.target.value.replace(/^@/,''))} placeholder="nickname" autoCapitalize="off" spellCheck={false} maxLength={20}/></div></Field>
      {lookup.hit?<Row av={<Av name={nameOf(lookup.hit)} seed={lookup.hit.id} src={thumb(lookup.hit)} size="sm"/>} title={<Who name={nameOf(lookup.hit)} nick={lookup.hit.handle}/>} end={<Pill tone="ok" icon={Check}>{t('fe.pq.found')}</Pill>}/>
       :lookup.issue?<Note>{t('fe.pq.issue.'+lookup.issue)}</Note>:null}
      <Btn disabled={busy||!lookup.hit} onClick={()=>act(async()=>{
       // Not found, blocked or already in a couple read the same (the server answers alike).
       try{await call('couple.invite',{opId:op.current,handle:nick.trim(),...(couple&&fresh?{replacePaused:true}:{})},ok,{asAccount:true});}
       catch(e){if(e instanceof FeError&&e.code==='not_found')throw new FeError('not_found',404,'invite_unavailable');throw e;}
       op.current=newOpId();setNick('');if(couple&&fresh)reload();})}>{t('fe.pair.invite')}</Btn>
     </Card>}
    {!out&&!(couple&&fresh)&&<Group title={t('fe.c6.link.group')} foot={t('fe.c6.link.foot')}>
     <Stack gap={3}>{inv.link&&<Card list><Row icon={LinkIcon} title={t('fe.c6.link.live')}
      sub={t('fe.c6.link.until',{date:new Date(inv.link.expiresAt).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long'})})+' · '+t('fe.c6.link.shownOnce')}
      end={<Btn kind="text" size="sm" auto disabled={busy} onClick={()=>{const id=inv.link!.id;void act(()=>call('couple.linkRevoke',{opId:newOpId(),linkId:id},ok,{asAccount:true}),()=>{setLink(null);toast(t('fe.c6.link.revoked'),{type:'ok'});});}}>{t('fe.c6.link.revoke')}</Btn>}/></Card>}
     <Btn kind="soft" icon={LinkIcon} disabled={busy} onClick={()=>{if(inv.link)setAskLink(true);else void makeLink();}}>{inv.link?t('fe.c6.link.new'):t('fe.c6.link.copy')}</Btn></Stack>
    </Group>}
   </>}
   {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
  </div></View>
  {guard.node}
  {askLink&&<Ask icon={LinkIcon} title={t('fe.c6.link.newQ')} text={t('fe.c6.link.newText')} ok={t('fe.c6.link.newOk')} busy={busy}
   onOk={()=>{setAskLink(false);void makeLink();}} onCancel={()=>setAskLink(false)}/>}
  {link&&<Sheet title={t('fe.c6.link.sheet')} onClose={()=>setLink(null)} foot={<Btn icon={Copy} onClick={()=>{void copyLink(link.url).then(ok=>toast(t(ok?'fe.c6.link.copied':'fe.c6.link.copyHand'),{type:ok?'ok':'info'}));}}>{t('fe.c6.link.copyBtn')}</Btn>}>
   <p className="lead">{t('fe.c6.link.lead')}</p>
   <Field id="fe-pair-link" label={t('fe.c6.link.label')}><Input id="fe-pair-link" name="pairLink" readOnly value={link.url} onFocus={e=>e.currentTarget.select()}/></Field>
   <Alert kind="info">{t('fe.c6.link.atOnce')}</Alert>
   <Note>{t('fe.c6.link.until',{date:new Date(link.expiresAt).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long'})})} · {t('fe.c6.link.once')}</Note>
  </Sheet>}
 </>;
}

/** Restore of a paused couple, by its id (a «Пара на паузе» or «Партнёр хочет восстановить пару» row opens it): who
 * already agreed, until when, and — plainly — the approval mode that comes back (owner decision 2); visibility,
 * Discover and access do not. `extra`: what else the screen offers (start a new couple). */
function RestoreView({coupleId,extra,onLeave}:{coupleId:string,extra?:ReactNode,onLeave:()=>void}){
 const {call,reload,state,setActing}=useFe();const {t,locale}=useI18n();const toast=useToast();const navigate=useNavigate();
 const [c,setC]=useState<Couple|null>(null);const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const [askDecline,setAskDecline]=useState(false);
 const load=useCallback(()=>{call('couple.get',{},coupleRes,{profileId:coupleId,fresh:true}).then(r=>{setC(r.couple);setError(null);}).catch(setError);},[call,coupleId]);
 useEffect(()=>{load();},[load]);
 useLive(['couple','decide'],load);
 const bar=<Bar title={c?.endedAt?t('fe.ap.archive.title'):t('fe.ap.restore.title')} onBack={onLeave}/>;
 if(error&&!c)return <>{bar}<View className="nodock"><Empty icon={Users} title={error instanceof FeError&&(error.status===404||error.status===403)?t('fe.ap.restore.gone'):feErrorMessage(error,t)}>
  {!(error instanceof FeError&&(error.status===404||error.status===403))&&<Btn kind="soft" onClick={load}>{t('fe.ap.retry')}</Btn>}</Empty></View></>;
 if(!c)return <>{bar}<View className="nodock"><Skel kind="list"/></View></>;
 const [me,other]=[c.members.find(m=>m.me),c.members.find(m=>!m.me)];
 const until=c.restoreUntil?new Date(c.restoreUntil).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long'}):'';
 const agreed=c.members.filter(m=>m.restoreAgreed).map(m=>m.me?t('fe.ap.restore.you'):nameOf(m));
 const otherName=nameOf(other);
 // The modes that come back: mine (do I approve the partner's actions) and theirs.
 const modes=[me?.approvesPartner?t('fe.ap.restore.modeMine',{name:otherName}):t('fe.ap.restore.modeMineOff',{name:otherName}),
  other?.approvesPartner?t('fe.ap.restore.modeTheirs',{name:otherName}):t('fe.ap.restore.modeTheirsOff')];
 const agree=async()=>{setBusy(true);setFailure('');
  try{const r=await call('couple.restore',{opId:newOpId()},z.object({ok:z.literal(true),state:z.string().optional()}).passthrough(),{profileId:coupleId});
   toast(r.state==='active'?t('fe.pq.restored')+'. '+modes[0]:t('fe.pq.waitPartner',{name:otherName}),{type:'ok'});
   if(r.state==='active'){reload();onLeave();}else load();}
  catch(e){setFailure(pairErrorText(e,t));}finally{setBusy(false);}};
 // «Не восстанавливать»: the couple ends for both; the app goes on as the personal profile.
 const decline=async()=>{setBusy(true);setFailure('');
  try{await call('couple.decline',{opId:newOpId()},z.object({ok:z.literal(true)}).passthrough(),{profileId:coupleId});
   const person=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='person'):undefined;
   if(person)setActing(person.id);reload();toast(t('fe.ap.restore.declined'),{type:'ok'});navigate('/n/me',{replace:true});}
  catch(e){setFailure(pairErrorText(e,t));setAskDecline(false);}finally{setBusy(false);}};
 // An archive (owner 04.11.2026): read-only for both until it is deleted; «Удалить сейчас» takes both.
 const [askPurge,setAskPurge]=useState(false);
 const purge=async()=>{setBusy(true);setFailure('');
  try{const r=await call('couple.purge',{opId:newOpId()},z.object({ok:z.literal(true),state:z.string()}).passthrough(),{profileId:coupleId});setAskPurge(false);
   if(r.state==='deleted'){const person=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='person'):undefined;
    if(person)setActing(person.id);reload();toast(t('fe.ap.archive.deleted'),{type:'ok'});navigate('/n/me',{replace:true});}
   else{toast(t('fe.ap.archive.asked',{name:otherName}),{type:'ok'});load();}}
  catch(e){setFailure(pairErrorText(e,t));setAskPurge(false);}finally{setBusy(false);}};
 const openArchive=()=>{setActing(coupleId);navigate('/n/me');};
 return <>
  {bar}
  {askPurge&&<Ask icon={Users} danger title={t('fe.ap.archive.purgeTitle')} text={t('fe.ap.archive.purgeText',{name:otherName})} ok={t('fe.ap.archive.purgeOk')}
   busy={busy} onOk={()=>void purge()} onCancel={()=>setAskPurge(false)}/>}
  {askDecline&&<Ask icon={Users} danger title={t('fe.ap.restore.declineTitle')} text={t('fe.ap.restore.declineText',{name:otherName})} ok={t('fe.ap.restore.declineOk')}
   busy={busy} onOk={()=>void decline()} onCancel={()=>setAskDecline(false)}/>}
  <View className="nodock"><div className="pair-wrap">
   <Scene me={{name:nameOf(me),id:me?.profileId}} other={{name:otherName,id:other?.profileId}}/>
   <H level={2} className="t center">{c.name||`${nameOf(me)} ${t('fe.pair.and')} ${otherName}`}</H>
   {c.state==='paused'&&c.endedAt?<>
    <p className="lead center">{t('fe.ap.archive.lead',{date:until})}</p>
    {other?.purgeAgreed&&<Alert kind="info" role="status">{t('fe.ap.archive.theyAsked',{name:otherName})}</Alert>}
    <Actions stack>
     <Btn onClick={openArchive}>{t('fe.ap.archive.open')}</Btn>
     {me?.purgeAgreed?<Btn kind="soft" icon={Check} disabled>{t('fe.ap.restore.waiting',{name:otherName})}</Btn>
      :<Btn kind="soft" disabled={busy} onClick={()=>setAskPurge(true)}>{t('fe.ap.archive.purge')}</Btn>}
     {extra}
    </Actions>
   </>:c.state==='paused'?<>
    <p className="lead center">{t('fe.ap.restore.lead',{date:until})}</p>
    <Note className="center">{t('fe.ap.restore.agreed',{who:agreed.length?agreed.join(', '):t('fe.ap.restore.nobody')})}</Note>
    <Alert kind="info" role="status">{modes[0]} {modes[1]}</Alert>
    <Note>{t('fe.ap.restore.notBack')}</Note>
    <Actions stack>
     {me?.restoreAgreed?<Btn icon={Check} disabled>{t('fe.ap.restore.waiting',{name:otherName})}</Btn>
      :<Btn disabled={busy} busy={busy} onClick={()=>void agree()}>{t('fe.ap.restore.agree')}</Btn>}
     {!me?.restoreAgreed&&<Btn kind="soft" disabled={busy} onClick={()=>setAskDecline(true)}>{t('fe.ap.restore.decline')}</Btn>}
     {extra}
    </Actions>
   </>:<Note className="center">{t('fe.pq.restored')}</Note>}
   {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
  </div></View>
 </>;
}

/** The landing of a partner link (signed in, after the sign-up if needed): who invites, the couple's defaults, accept. */
/** A pair-specific text when there is one; otherwise the common message (a 429 is «слишком много действий», not «нет связи»). */
function pairErrorText(e:unknown,t:(k:string)=>string){if(e instanceof FeError&&e.rule&&e.code!=='rate_limited'){const k='fe.pair.rule.'+e.rule;const m=t(k);if(m!==k)return m;}return feErrorMessage(e,t);}

function LinkLanding({token,me,auto,onClose,onAccepted}:{token:string,auto:boolean,me:{name:string,id?:string|undefined,src?:string|null|undefined},onClose:()=>void,onAccepted:()=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [from,setFrom]=useState<z.infer<typeof peekRes>['from']|null>(null);const [dead,setDead]=useState('');
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const op=useRef(newOpId());
 useEffect(()=>{call('couple.linkPeek',{token},peekRes,{asAccount:true}).then(r=>setFrom(r.from))
  .catch(e=>setDead(e instanceof FeError&&e.status===404?t('fe.c6.land.dead'):feErrorMessage(e,t)));},[call,token,t]);
 // Owner, 28.10.2026: signing up through the link is the consent — the couple forms right away, no second tap.
 const started=useRef(false);
 const accept=async()=>{setBusy(true);setFailure('');
  try{await call('couple.linkAccept',{opId:op.current,token},acceptRes,{asAccount:true});onAccepted();}
  catch(e){setFailure(e instanceof FeError&&e.status===404?t('fe.c6.land.dead'):pairErrorText(e,t));op.current=newOpId();}
  finally{setBusy(false);}};
 useEffect(()=>{if(auto&&from&&!started.current){started.current=true;void accept();}});
 return <>
  <Bar title={t('fe.pair.title')} onBack={onClose}/>
  <View className="nodock"><div className="pair-wrap">
   <Scene me={me} other={from?{name:nameOf(from),id:from.id}:null} state={from?'ready':''}/>
   {dead?<><H level={2} className="t center">{t('fe.c6.land.deadTitle')}</H><Alert kind="warn">{dead}</Alert>
     <Btn kind="soft" onClick={onClose}>{t('fe.c6.land.toPair')}</Btn></>
    :!from?<Skel kind="list"/>
    :<>
     <H level={2} className="t center">{t('fe.c6.land.title',{name:nameOf(from)})}</H>
     <p className="lead center">{t('fe.c6.land.lead')}</p>
     <Alert kind="info">{auto?t('fe.c6.land.forming'):t('fe.c6.land.atOnce')}</Alert>
     <Card list>
      <Row icon={Heart} title={t('fe.c6.land.d1')} sub={t('fe.c6.land.d1s')}/>
      <Row icon={Users} title={t('fe.c6.land.d2')} sub={t('fe.c6.land.d2s')}/>
      <Row icon={ShieldCheck} title={t('fe.c6.land.d3')} sub={t('fe.c6.land.d3s')}/>
     </Card>
     {!auto||failure?<Actions stack><Btn disabled={busy} busy={busy} onClick={()=>void accept()}>{t('fe.c6.land.accept')}</Btn>
      <Btn kind="soft" disabled={busy} onClick={onClose}>{t('fe.c6.land.decline')}</Btn></Actions>:null}
    </>}
   {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
  </div></View>
 </>;
}

/** Right after the couple forms, for both partners (owner 04.11.2026): it already works with the defaults — nobody
 * approves the other, anyone may ask for access, hidden from Discover; all of it changes in the pair settings. */
function CreatedView({c,onSettings,onDone}:{c:Couple,onSettings:()=>void,onDone:()=>void}){
 const {t}=useI18n();
 const me=c.members.find(m=>m.me);const other=c.members.find(m=>!m.me);
 const name=c.name||`${nameOf(me)} ${t('fe.pair.and')} ${nameOf(other)}`;
 return <>
  <Bar title={t('fe.c6.made.title')} onBack={onDone}/>
  <View className="nodock"><Stack gap={3}>
   <Card list><Row av={<Av name={name} seed={c.id} couple={[nameOf(me),nameOf(other)]}/>} title={name} sub={c.handle?'@'+c.handle:undefined}/></Card>
   <Card list>
    <Row icon={Check} title={t('fe.c6.made.approval')} sub={t('fe.c6.made.approvalSub')}/>
    <Row icon={Lock} title={t('fe.c6.made.access')} sub={t('fe.c6.made.accessSub')}/>
    <Row icon={EyeOff} title={t('fe.c6.made.discover')} sub={t('fe.c6.made.discoverSub')}/>
   </Card>
   <Actions stack>
    <Btn onClick={onDone}>{t('fe.c6.made.done')}</Btn>
    <Btn kind="soft" onClick={onSettings}>{t('fe.c6.made.settings')}</Btn>
   </Actions>
  </Stack></View>
 </>;
}

/** Q01 settings of an active couple: the couple in Discover (with its status), «Моё подтверждение» (a sheet with the
 * choice and why), and the two immediate safety actions — hide from Discover, close the private part (revoke all
 * access and stop requests). A done safety action reads as a status line, not a dead button. */
function CoupleSettings({c,coupleId,other,trustOpen,onChanged}:{c:Couple,coupleId:string,other:string,trustOpen:boolean,onChanged:()=>void}){
 const {call,setActing}=useFe();const {t}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [s,setS]=useState<{mode:string,req:string,grants:number,pendingDiscover:boolean}|null>(null);
 const [trust,setTrust]=useState(trustOpen);const [askClose,setAskClose]=useState(false);const [busy,setBusy]=useState('');
 const me=c.members.find(m=>m.me);const partner=c.members.find(m=>!m.me);
 const load=useCallback(()=>{
  Promise.all([call('profile.settings',{},settingsRes,{profileId:coupleId,fresh:true}),
   call('access.lists',{tab:'byme'},listRes,{profileId:coupleId,fresh:true}).then(r=>r.items.length).catch(()=>0),
   call('decide.approvals',{},pendingRes,{profileId:coupleId,fresh:true}).then(r=>r.items.some(a=>a.kind==='profile.setVisibility'&&a.state!=='returned'&&a.change?.setting==='discoverMode')).catch(()=>false)])
   .then(([st,grants,pendingDiscover])=>setS({mode:st.settings.discoverMode,req:st.settings.requestsFrom??'all',grants,pendingDiscover})).catch(()=>{});
 },[call,coupleId]);
 useEffect(()=>{load();},[load]);
 useLive(['couple','profile','decide'],load);
 if(c.state!=='active')return null;
 const safe=async(key:string,fn:()=>Promise<unknown>,msg:string)=>{setBusy(key);try{await fn();toast(msg,{type:'ok'});load();onChanged();}catch(e){toast(feErrorMessage(e,t),{type:'err'});}finally{setBusy('');}};
 const hide=()=>void safe('hide',()=>call('profile.setVisibility',{opId:newOpId(),setting:'discoverMode',value:'off'},ok,{profileId:coupleId}),t('fe.c6.safe.hidden'));
 const close=()=>{setAskClose(false);void safe('close',()=>call('access.revokeAll',{opId:newOpId(),confirm:true},ok,{profileId:coupleId}),t('fe.c6.safe.closed'));};
 const off=s?.mode==='off';const closed=s?.req==='none'&&s.grants===0;
 const dating=!s?'':s.pendingDiscover?t('fe.cw.waitPartner'):t('fe.c6.vis.'+(['visible','hidden','off'].includes(s.mode)?s.mode:'off'));
 return <>
  <Group title={t('fe.c6.dating')}><Card list>
   <Row icon={Heart} tone="l" title={t('fe.c6.vis.title')} sub={dating||'…'} onClick={()=>{setActing(coupleId);navigate('/n/me?layer=vis');}}/>
  </Card></Group>
  <Group title={t('fe.pair.approval')}><Card list>
   <Row icon={Check} title={t('fe.c6.trust.title')} sub={me?.approvesPartner?t('fe.c6.trust.on'):t('fe.c6.trust.off')} onClick={()=>setTrust(true)}/>
  </Card></Group>
  <Group title={t('fe.c6.safe.group')}><Card list>
   {/* Hidden already: «Знакомства» above says so — no second status line for the same thing. */}
   {!off&&<Row icon={EyeOff} noChev title={t('fe.c6.safe.hide')} sub={t('fe.c6.safe.hideSub')} disabled={!s||!!busy} onClick={hide}/>}
   {closed?<Row icon={Lock} title={t('fe.c6.safe.closedTitle')} sub={t('fe.c6.safe.closedSub')} val={<Check/>}/>
    :<Row icon={Lock} noChev title={t('fe.c6.safe.close')} sub={t('fe.c6.safe.closeSub')} disabled={!s||!!busy} onClick={()=>setAskClose(true)}/>}
  </Card></Group>
  {trust&&me&&<TrustSheet coupleId={coupleId} scope={me.approvesScope??(me.approvesPartner?[...OLD_MODE]:[])} other={other} otherOn={!!partner?.approvesPartner} onClose={()=>setTrust(false)} onDone={()=>{setTrust(false);onChanged();}}/>}
  {askClose&&<Ask icon={Lock} danger title={t('fe.c6.safe.askTitle')} text={t('fe.c6.safe.askText',{n:s?.grants??0})} ok={t('fe.c6.safe.askOk')} onCancel={()=>setAskClose(false)} onOk={close}/>}
 </>;
}

/** «Что подтверждает партнёр» (audit item 20): what I approve before my partner's action as the couple applies — a
 * switch per point with a short line under it; the private part and visibility always wait (shown on, not switchable). */
function TrustSheet({coupleId,scope,other,otherOn,onClose,onDone}:{coupleId:string,scope:string[],other:string,otherOn:boolean,onClose:()=>void,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const [v,setV]=useState<string[]>(scope.filter(x=>(SWITCHABLE as readonly string[]).includes(x)));const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const same=v.length===scope.length&&v.every(x=>scope.includes(x));
 const save=async()=>{if(same){onClose();return;}setBusy(true);setFailure('');
  try{await call('couple.setApproval',{opId:newOpId(),scope:v},ok,{profileId:coupleId});toast(t('fe.c6.trust.saved'),{type:'ok'});onDone();}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 const flip=(k:string)=>setV(x=>x.includes(k)?x.filter(y=>y!==k):[...x,k]);
 return <Sheet title={t('fe.c6.trust.title2')} onClose={onClose} foot={<Btn disabled={busy} busy={busy} onClick={()=>void save()}>{t('fe.c6.trust.save')}</Btn>}>
  <Stack gap={3}>
   <p className="lead">{t('fe.c6.trust.lead2',{name:other})}</p>
   <Card list>
    {SWITCHABLE.map(k=><ToggleRow key={k} title={t('fe.c6.pt.'+k)} sub={t('fe.c6.pt.'+k+'.sub')} on={v.includes(k)} onClick={()=>flip(k)} disabled={busy}/>)}
    <ToggleRow title={t('fe.c6.pt.private')} sub={t('fe.c6.pt.private.sub')} on disabled onClick={()=>{}}/>
   </Card>
   <Note>{otherOn?t('fe.c6.trust.otherOn',{name:other}):t('fe.c6.trust.otherOff',{name:other})}</Note>
   {failure&&<Alert kind="err" noIcon>{failure}</Alert>}
  </Stack>
 </Sheet>;
}

export function PairEntry(){
 const {state}=useFe();const {t}=useI18n();const navigate=useNavigate();
 if(state.status!=='ready')return null;
 const couple=state.boot.profiles.find(p=>p.kind==='couple'&&!p.ended);const archive=!couple&&state.boot.profiles.find(p=>p.kind==='couple'&&p.ended);
 return <Group title={t('fe.pair.section')}><Card list>
  <Row icon={Heart} tone="v" noChev title={couple?(couple.name||t('fe.pair.ourProfile')):t('fe.pair.entry')} sub={couple?t('fe.pair.entryOn'):archive?t('fe.pair.entryArchive'):t('fe.pair.entryOff')} onClick={()=>navigate('/n/me/pair')}/>
 </Card></Group>;
}
