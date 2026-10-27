import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Check,Copy,EyeOff,Heart,Link as LinkIcon,Lock,ShieldCheck,Users,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Av,Bar,Btn,Card,Field,Group,H,Input,Note,PersonLine,Pill,RadioList,RequestCard,Row,SelectRow,Sheet,Skel,View} from './kit';
import {useFe} from './session';
import {Ask} from './me';
import {useToast} from './toast';
import {when} from './feed';
import {CoupleWork} from './couple';

/** Slice E (V21 Q01, Q06, Q07, Q09): a couple starts by an invitation to an exact nickname, or by a single-use link for
 * a partner without an account (the link survives the sign-up in this tab); both partners must be free. Right after
 * the couple forms each partner chooses their own approval mode and who may ask for access (Q09). On Q01: what waits
 * for approval, the couple in Discover, «Моё подтверждение», the quick safety actions and stopping the couple. */
const who=z.object({id:z.uuid(),handle:z.string().nullable(),name:z.string().nullable()}).nullable();
const invitesRes=z.object({ok:z.literal(true),outgoing:z.array(z.object({id:z.uuid(),state:z.string(),created_at:z.string(),profile:who})),incoming:z.array(z.object({id:z.uuid(),created_at:z.string(),profile:who})),
 link:z.object({id:z.uuid(),createdAt:z.string(),expiresAt:z.string()}).nullable().optional()});
const coupleRes=z.object({ok:z.literal(true),couple:z.object({id:z.uuid(),name:z.string().nullable(),state:z.string(),since:z.string(),restoreUntil:z.string().nullable(),
 members:z.array(z.object({me:z.boolean(),profileId:z.uuid(),handle:z.string().nullable(),name:z.string().nullable(),approvesPartner:z.boolean(),restoreAgreed:z.boolean()}))})});
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

/* ---- the partner link: kept for this tab while the partner signs up (temporary request memory, not domain data) ---- */
const LINK_KEY='feture.fe.pairLink';
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
/** A link opened signed out lands on the welcome screen: remember its token before anything else reads the address. */
function captureLink(){
 try{const v=new URLSearchParams(location.hash.split('?')[1]??'').get('link');if(v&&TOKEN.test(v))sessionStorage.setItem(LINK_KEY,v);}catch{/* no storage: the link still works while signed in */}
}
captureLink();
/** A partner link waiting in this tab (the sign-up sends the person to the pair screen instead of the feed). */
export function pendingPairLink():string|null{try{const v=sessionStorage.getItem(LINK_KEY);return v&&TOKEN.test(v)?v:null;}catch{return null;}}
const dropLink=()=>{try{sessionStorage.removeItem(LINK_KEY);}catch{/* nothing kept */}};
const linkUrl=(token:string)=>`${location.origin}${location.pathname}#/n/me/pair?link=${token}`;

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

export function PairScreen(){
 const {state,acting,call,reload,setActing}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const toast=useToast();const {search}=useLocation();
 const q=new URLSearchParams(search);
 const couple=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='couple'&&p.state!=='deleted'):undefined;
 const person=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='person'):undefined;
 const [inv,setInv]=useState<z.infer<typeof invitesRes>|null>(null);const [c,setC]=useState<Couple|null>(null);
 const [nick,setNick]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [confirmStop,setConfirmStop]=useState(()=>q.get('stop')==='1');
 const [fresh,setFresh]=useState(false);const [askNew,setAskNew]=useState(false);
 const [link,setLink]=useState<{url:string,expiresAt:string}|null>(null);
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
 // Already in a couple: a partner link cannot be used — say so once and forget it.
 const inCouple=couple?.state==='active';
 useEffect(()=>{if(token&&inCouple){dropLink();setToken(null);toast(t('fe.pair.rule.already_in_couple'),{type:'warn'});}},[token,inCouple,toast,t]);
 const act=async(fn:()=>Promise<unknown>,after?:()=>void)=>{setBusy(true);setFailure('');try{await fn();after?.();load();}catch(e){setFailure(e instanceof FeError&&e.rule?t('fe.pair.rule.'+e.rule):feErrorMessage(e,t));}finally{setBusy(false);}};
 const toSetup=()=>{reload();navigate('/n/me/pair?setup=1',{replace:true});};
 const meName=nameOf(person);
 if(state.status!=='ready')return null;
 // A partner link: who invites, then accept (the couple forms at once) → Q09.
 if(token&&!inCouple)return <LinkLanding token={token} me={{name:meName,id:person?.id,src:person?.avatar}}
  onClose={()=>{dropLink();setToken(null);navigate('/n/me/pair',{replace:true});}} onAccepted={()=>{dropLink();setToken(null);toSetup();}}/>;
 if(q.get('setup')==='1'){
  if(!couple||couple.state!=='active'||!c)return <><Bar title={t('fe.c6.q9.title')} back="/n/me"/><View><Skel kind="list"/></View></>;
  return <SetupView c={c} coupleId={couple.id} onDone={()=>navigate('/n/me/pair',{replace:true})}/>;
 }
 if(couple&&!fresh&&!c&&!failure)return <><Bar title={t('fe.pair.title')} back="/n/me"/><View><Skel kind="list"/></View></>;
 // V21 Q07: a stopped couple — agree to restore (both within 30 days), or start a new couple, which ends the old one.
 if(couple&&c&&c.state==='paused'&&!fresh){
  const [me,other]=[c.members.find(m=>m.me),c.members.find(m=>!m.me)];const agreed=c.members.filter(m=>m.restoreAgreed).length;
  const until=c.restoreUntil?new Date(c.restoreUntil).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long'}):'';
  return <>
   <Bar title={t('fe.pq.stopped')} back="/n/me"/>
   <View className="nodock"><div className="pair-wrap">
    <Scene me={{name:nameOf(me),id:me?.profileId}} other={{name:nameOf(other),id:other?.profileId}}/>
    <H level={2} className="t center">{t('fe.pq.stoppedTitle')}</H>
    <p className="lead center">{t('fe.pq.stoppedLead')}</p>
    <Note className="center">{t('fe.pq.agreed',{n:agreed,date:until})}</Note>
    <div className="btns mt16">
     {me?.restoreAgreed?<Btn icon={Check} disabled>{t('fe.pq.waitPartner',{name:nameOf(other)})}</Btn>
      :<Btn disabled={busy} busy={busy} onClick={()=>act(async()=>{const r=await call('couple.restore',{opId:newOpId()},z.object({ok:z.literal(true),state:z.string().optional()}).passthrough(),{profileId:couple.id});
        toast(r.state==='active'?t('fe.pq.restored'):t('fe.pq.waitPartner',{name:nameOf(other)}),{type:'ok'});if(r.state==='active')reload();})}>{t('fe.pq.restore')}</Btn>}
     <Btn kind="soft" disabled={busy} onClick={()=>setAskNew(true)}>{t('fe.pq.new')}</Btn>
     <Note className="center">{t('fe.pq.newNote')}</Note>
     {acting?.kind==='couple'&&person&&<Btn kind="text" onClick={()=>{setActing(person.id);navigate('/n/me');}}>{t('fe.pq.toPersonal')}</Btn>}
    </div>
    {failure&&<Alert kind="err" noIcon className="mt12">{failure}</Alert>}
   </div></View>
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
     <CoupleWork coupleId={couple.id} openId={q.get('approval')}/>
     <CoupleSettings c={c} coupleId={couple.id} other={nameOf(other)} trustOpen={q.get('trust')==='1'} onChanged={load}/>
     <Group title={t('fe.pair.act')}>
      <Btn kind="soft" onClick={()=>{setActing(couple.id);navigate('/n/me');}}>{t('fe.pair.actAsUs')}</Btn></Group>
     {c.state==='active'&&<Group title={t('fe.pair.careful')}>
      {!confirmStop?<Card list><Row icon={X} danger title={t('fe.pair.stop')} onClick={()=>setConfirmStop(true)}/></Card>
       :<Card><p>{t('fe.pair.stopText')}</p><div className="btns mt12">
        <Btn kind="danger" disabled={busy} onClick={()=>act(()=>call('couple.stop',{opId:newOpId(),confirm:true},ok,{profileId:couple.id}),()=>{setConfirmStop(false);reload();})}>{t('fe.pair.stop')}</Btn>
        <Btn kind="text" onClick={()=>setConfirmStop(false)}>{t('fe.cancel')}</Btn></div></Card>}
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
  try{await navigator.clipboard.writeText(url);toast(t('fe.c6.link.copied'),{type:'ok'});}catch{/* the sheet shows it to copy by hand */}
 });
 return <>
  <Bar title={t('fe.pair.title')} back="/n/me"/>
  <View><div className="pair-wrap">
   <Scene state={out?'on':lookup.hit?'ready':''} me={{name:meName,id:person?.id,src:person?.avatar}}
    other={out?.profile?{name:nameOf(out.profile),id:out.profile.id}:lookup.hit?{name:nameOf(lookup.hit),id:lookup.hit.id,src:thumb(lookup.hit)}:null}/>
   <H level={2} className="t center">{out?t('fe.pair.waiting').replace('{name}',nameOf(out.profile)):t('fe.pair.inviteTitle')}</H>
   <Note className="center">{t('fe.pair.inviteText')}</Note>
   {inv===null?<Skel kind="list"/>:<>
    {inv.incoming.map(i=><RequestCard key={i.id} className="mt12" person={<PersonLine av={<Av name={nameOf(i.profile)} seed={i.profile?.id??i.id}/>} name={nameOf(i.profile)} sub={<>{t('fe.inbox.kind.pinv')} · {when(i.created_at,locale)}</>}/>}
     actions={<><Btn size="md" disabled={busy} onClick={()=>act(()=>call('couple.inviteAnswer',{opId:newOpId(),inviteId:i.id,accept:true},ok,{asAccount:true}),toSetup)}>{t('fe.inbox.accept')}</Btn>
      <Btn size="md" kind="soft" disabled={busy} onClick={()=>act(()=>call('couple.inviteAnswer',{opId:newOpId(),inviteId:i.id,accept:false},ok,{asAccount:true}))}>{t('fe.priv.decline')}</Btn></>}/>)}
    {out?<div className="btns mt16"><Btn kind="soft" disabled={busy} onClick={()=>act(()=>call('couple.inviteWithdraw',{opId:newOpId(),inviteId:out.id},ok,{asAccount:true}))}>{t('fe.pair.withdraw')}</Btn></div>
     :<Card form className="mt16">
      <label className="field"><span>{t('fe.pair.partnerNick')}</span><div className="inwrap"><AtSign/><Input value={nick} onChange={e=>setNick(e.target.value.replace(/^@/,''))} placeholder="nickname" autoCapitalize="off" spellCheck={false} maxLength={20}/></div><div className="fhint">{t('fe.pair.nickHint')}</div></label>
      {lookup.hit?<Row av={<Av name={nameOf(lookup.hit)} seed={lookup.hit.id} src={thumb(lookup.hit)} size="sm"/>} title={nameOf(lookup.hit)} sub={'@'+lookup.hit.handle} end={<Pill tone="ok" icon={Check}>{t('fe.pq.found')}</Pill>}/>
       :lookup.issue?<Note>{t('fe.pq.issue.'+lookup.issue)}</Note>:null}
      <Btn disabled={busy||!lookup.hit} onClick={()=>act(async()=>{await call('couple.invite',{opId:op.current,handle:nick.trim(),...(couple&&fresh?{replacePaused:true}:{})},ok,{asAccount:true});op.current=newOpId();setNick('');if(couple&&fresh)reload();})}>{t('fe.pair.invite')}</Btn>
     </Card>}
    {!out&&!(couple&&fresh)&&<Group title={t('fe.c6.link.group')} foot={t('fe.c6.link.foot')}>
     {inv.link&&<Card list><Row icon={LinkIcon} title={t('fe.c6.link.live')} sub={t('fe.c6.link.until',{date:new Date(inv.link.expiresAt).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long'})})}
      end={<Btn kind="text" size="sm" auto disabled={busy} onClick={()=>{const id=inv.link!.id;void act(()=>call('couple.linkRevoke',{opId:newOpId(),linkId:id},ok,{asAccount:true}),()=>{setLink(null);toast(t('fe.c6.link.revoked'),{type:'ok'});});}}>{t('fe.c6.link.revoke')}</Btn>}/></Card>}
     <Btn kind="soft" icon={LinkIcon} className={inv.link?'mt12':undefined} disabled={busy} onClick={()=>void makeLink()}>{inv.link?t('fe.c6.link.new'):t('fe.c6.link.copy')}</Btn>
    </Group>}
   </>}
   {failure&&<Alert kind="err" noIcon className="mt12">{failure}</Alert>}
  </div></View>
  {link&&<Sheet title={t('fe.c6.link.sheet')} onClose={()=>setLink(null)} foot={<Btn icon={Copy} onClick={()=>{navigator.clipboard?.writeText(link.url).then(()=>toast(t('fe.c6.link.copied'),{type:'ok'}),()=>toast(t('fe.c6.link.copyHand'),{type:'info'}));}}>{t('fe.c6.link.copyBtn')}</Btn>}>
   <p className="lead">{t('fe.c6.link.lead')}</p>
   <Field id="fe-pair-link" label={t('fe.c6.link.label')}><Input id="fe-pair-link" name="pairLink" readOnly value={link.url} onFocus={e=>e.currentTarget.select()}/></Field>
   <Note>{t('fe.c6.link.until',{date:new Date(link.expiresAt).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long'})})} · {t('fe.c6.link.once')}</Note>
  </Sheet>}
 </>;
}

/** The landing of a partner link (signed in, after the sign-up if needed): who invites, the couple's defaults, accept. */
function LinkLanding({token,me,onClose,onAccepted}:{token:string,me:{name:string,id?:string|undefined,src?:string|null|undefined},onClose:()=>void,onAccepted:()=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [from,setFrom]=useState<z.infer<typeof peekRes>['from']|null>(null);const [dead,setDead]=useState('');
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const op=useRef(newOpId());
 useEffect(()=>{call('couple.linkPeek',{token},peekRes,{asAccount:true}).then(r=>setFrom(r.from))
  .catch(e=>setDead(e instanceof FeError&&e.status===404?t('fe.c6.land.dead'):feErrorMessage(e,t)));},[call,token,t]);
 const accept=async()=>{setBusy(true);setFailure('');
  try{await call('couple.linkAccept',{opId:op.current,token},acceptRes,{asAccount:true});onAccepted();}
  catch(e){setFailure(e instanceof FeError&&e.rule?t('fe.pair.rule.'+e.rule):e instanceof FeError&&e.status===404?t('fe.c6.land.dead'):feErrorMessage(e,t));op.current=newOpId();}
  finally{setBusy(false);}};
 return <>
  <Bar title={t('fe.pair.title')} onBack={onClose}/>
  <View className="nodock"><div className="pair-wrap">
   <Scene me={me} other={from?{name:nameOf(from),id:from.id}:null} state={from?'ready':''}/>
   {dead?<><H level={2} className="t center">{t('fe.c6.land.deadTitle')}</H><Alert kind="warn" className="mt12">{dead}</Alert>
     <div className="btns mt16"><Btn kind="soft" onClick={onClose}>{t('fe.c6.land.toPair')}</Btn></div></>
    :!from?<Skel kind="list"/>
    :<>
     <H level={2} className="t center">{t('fe.c6.land.title',{name:nameOf(from)})}</H>
     <p className="lead center">{t('fe.c6.land.lead')}</p>
     <Card list className="mt12">
      <Row icon={Heart} title={t('fe.c6.land.d1')} sub={t('fe.c6.land.d1s')}/>
      <Row icon={Users} title={t('fe.c6.land.d2')} sub={t('fe.c6.land.d2s')}/>
      <Row icon={ShieldCheck} title={t('fe.c6.land.d3')} sub={t('fe.c6.land.d3s')}/>
     </Card>
     <div className="btns mt16"><Btn disabled={busy} busy={busy} onClick={()=>void accept()}>{t('fe.c6.land.accept')}</Btn>
      <Btn kind="soft" disabled={busy} onClick={onClose}>{t('fe.c6.land.decline')}</Btn></div>
    </>}
   {failure&&<Alert kind="err" noIcon className="mt12">{failure}</Alert>}
  </div></View>
 </>;
}

/** V21 Q09 right after the couple forms: my approval mode and who may ask for access, saved in one call → Q01. */
function SetupView({c,coupleId,onDone}:{c:Couple,coupleId:string,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const me=c.members.find(m=>m.me);const other=c.members.find(m=>!m.me);
 const [mode,setMode]=useState<'trust'|'approve'>(me?.approvesPartner?'approve':'trust');
 const [req,setReq]=useState<'all'|'matches'|'none'>('all');
 const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const op=useRef(newOpId());
 useEffect(()=>{call('profile.settings',{},settingsRes,{profileId:coupleId}).then(r=>setReq(r.settings.requestsFrom??'all')).catch(()=>{});},[call,coupleId]);
 const done=async()=>{setBusy(true);setFailure('');
  try{const r=await call('couple.setup',{opId:op.current,mode,requestsFrom:req},ok,{profileId:coupleId});
   toast(r.pending?t('fe.c6.q9.pending'):t('fe.c6.q9.saved'),{type:'ok'});onDone();}
  catch(e){setFailure(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}};
 return <>
  <Bar title={t('fe.c6.q9.title')} back="/n/me/pair"/>
  <View className="nodock">
   <Scene me={{name:nameOf(me),id:me?.profileId}} other={{name:nameOf(other),id:other?.profileId}} state="on"/>
   <H level={2} className="t center">{t('fe.c6.q9.head')}</H>
   <p className="lead center">{t('fe.c6.q9.lead')}</p>
   <Group title={t('fe.c6.q9.rules')} foot={t('fe.c6.q9.foot')}><Card list>
    <SelectRow icon={Check} label={t('fe.c6.trust.title')} sub={mode==='approve'?t('fe.c6.q9.modeOn'):t('fe.c6.q9.modeOff')} value={mode} onChange={setMode}
     options={[['approve',t('fe.c6.q9.need')],['trust',t('fe.c6.q9.noNeed')]] as const}/>
    <SelectRow icon={Lock} label={t('fe.c6.q9.req')} sub={t('fe.c6.q9.req.'+req)} value={req} onChange={setReq}
     options={(['all','matches','none'] as const).map(v=>[v,t('fe.c6.q9.reqv.'+v)] as const)}/>
   </Card></Group>
   {failure&&<Alert kind="err" noIcon className="mt12">{failure}</Alert>}
  </View>
  <div className="ctabar"><div className="wrap"><Btn disabled={busy} busy={busy} onClick={()=>void done()}>{t('fe.c6.q9.done')}</Btn></div></div>
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
   {off?<Row icon={EyeOff} title={t('fe.c6.safe.hiddenTitle')} sub={t('fe.c6.safe.hiddenSub')} val={<Check/>}/>
    :<Row icon={EyeOff} noChev title={t('fe.c6.safe.hide')} sub={t('fe.c6.safe.hideSub')} disabled={!s||!!busy} onClick={hide}/>}
   {closed?<Row icon={Lock} title={t('fe.c6.safe.closedTitle')} sub={t('fe.c6.safe.closedSub')} val={<Check/>}/>
    :<Row icon={Lock} noChev title={t('fe.c6.safe.close')} sub={t('fe.c6.safe.closeSub')} disabled={!s||!!busy} onClick={()=>setAskClose(true)}/>}
  </Card></Group>
  {trust&&me&&<TrustSheet coupleId={coupleId} on={me.approvesPartner} other={other} otherOn={!!partner?.approvesPartner} onClose={()=>setTrust(false)} onDone={()=>{setTrust(false);onChanged();}}/>}
  {askClose&&<Ask icon={Lock} danger title={t('fe.c6.safe.askTitle')} text={t('fe.c6.safe.askText',{n:s?.grants??0})} ok={t('fe.c6.safe.askOk')} onCancel={()=>setAskClose(false)} onOk={close}/>}
 </>;
}

/** V21 pairTrustOpen: «Моё подтверждение» — the choice as two options with what each means, and what stays shared. */
function TrustSheet({coupleId,on,other,otherOn,onClose,onDone}:{coupleId:string,on:boolean,other:string,otherOn:boolean,onClose:()=>void,onDone:()=>void}){
 const {call}=useFe();const {t}=useI18n();const toast=useToast();
 const [v,setV]=useState<'on'|'off'>(on?'on':'off');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const save=async()=>{if(v===(on?'on':'off')){onClose();return;}setBusy(true);setFailure('');
  try{await call('couple.setApproval',{opId:newOpId(),approvesPartner:v==='on'},ok,{profileId:coupleId});toast(t('fe.c6.trust.saved'),{type:'ok'});onDone();}
  catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 return <Sheet title={t('fe.c6.trust.title')} onClose={onClose} foot={<Btn disabled={busy} busy={busy} onClick={()=>void save()}>{t('fe.c6.trust.save')}</Btn>}>
  <p className="lead">{t('fe.c6.trust.lead',{name:other})}</p>
  <RadioList bare label={t('fe.c6.trust.title')} value={v} onChange={setV} options={[['off',t('fe.c6.trust.offT'),t('fe.c6.trust.offS')],['on',t('fe.c6.trust.onT'),t('fe.c6.trust.onS')]] as const}/>
  <Note className="mt12">{t('fe.c6.trust.note')} {otherOn?t('fe.c6.trust.otherOn',{name:other}):t('fe.c6.trust.otherOff',{name:other})}</Note>
  {failure&&<Alert kind="err" noIcon className="mt12">{failure}</Alert>}
 </Sheet>;
}

export function PairEntry(){
 const {state}=useFe();const {t}=useI18n();const navigate=useNavigate();
 if(state.status!=='ready')return null;
 const couple=state.boot.profiles.find(p=>p.kind==='couple');
 return <Group title={t('fe.pair.section')}><Card list>
  <Row icon={Heart} tone="v" noChev title={couple?(couple.name||t('fe.pair.ourProfile')):t('fe.pair.entry')} sub={couple?t('fe.pair.entryOn'):t('fe.pair.entryOff')} onClick={()=>navigate('/n/me/pair')}/>
 </Card></Group>;
}
