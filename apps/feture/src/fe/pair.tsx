import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {AtSign,Check,Heart,ShieldCheck,TriangleAlert,X} from 'lucide-react';
import {FeError,feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,View,Skel} from './ui';
import {useFe} from './session';
import {when} from './feed';

/** Slice E (V21 Q01, Q06): a couple starts by an invitation to an exact nickname; one pending invitation at a time;
 * both partners must be free. In a couple each partner sets whether the other's widening changes need approval;
 * either partner can stop the couple at once (restoring needs both within 30 days — server). */
const who=z.object({id:z.uuid(),handle:z.string().nullable(),name:z.string().nullable()}).nullable();
const invitesRes=z.object({ok:z.literal(true),outgoing:z.array(z.object({id:z.uuid(),state:z.string(),created_at:z.string(),profile:who})),incoming:z.array(z.object({id:z.uuid(),created_at:z.string(),profile:who}))});
const coupleRes=z.object({ok:z.literal(true),couple:z.object({id:z.uuid(),name:z.string().nullable(),state:z.string(),since:z.string(),restoreUntil:z.string().nullable(),
 members:z.array(z.object({me:z.boolean(),profileId:z.uuid(),handle:z.string().nullable(),name:z.string().nullable(),approvesPartner:z.boolean(),restoreAgreed:z.boolean()}))})});
const ok=z.object({ok:z.literal(true)}).passthrough();
const nameOf=(p:{name?:string|null,handle?:string|null}|null|undefined)=>p?(p.name||(p.handle?'@'+p.handle:'?')):'?';
const found=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),kind:z.string(),handle:z.string().nullable(),name:z.string().nullable(),avatar:z.object({pending:z.boolean().optional(),src:z.record(z.string(),z.string()).nullable().optional()}).passthrough().nullable().optional()}).passthrough())});
// people.search sends the avatar as a media object; the small variant is enough here.
const thumb=(f:{avatar?:{pending?:boolean|undefined,src?:Record<string,string>|null|undefined}|null|undefined})=>f.avatar&&!f.avatar.pending?f.avatar.src?.thumb??f.avatar.src?.card??null:null;
type Found=z.infer<typeof found>['items'][number];
const NICK=/^[a-z0-9_.]{3,20}$/i;

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

export function PairScreen(){
 const {state,call,reload,setActing}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const couple=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='couple'):undefined;
 const person=state.status==='ready'?state.boot.profiles.find(p=>p.kind==='person'):undefined;
 const [inv,setInv]=useState<z.infer<typeof invitesRes>|null>(null);const [c,setC]=useState<z.infer<typeof coupleRes>['couple']|null>(null);
 const [nick,setNick]=useState('');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [confirmStop,setConfirmStop]=useState(()=>new URLSearchParams(location.hash.split('?')[1]??'').get('stop')==='1');
 const op=useRef(newOpId());
 const lookup=usePartnerLookup(nick,person?.id,person?.handle);
 const load=useCallback(()=>{
  setFailure('');
  if(couple)call('couple.get',{},coupleRes,{profileId:couple.id}).then(r=>setC(r.couple)).catch(e=>setFailure(feErrorMessage(e,t)));
  else call('couple.invites',{},invitesRes,{asAccount:true}).then(setInv).catch(e=>setFailure(feErrorMessage(e,t)));
 },[call,couple,t]);
 useEffect(()=>{load();},[load]);
 const act=async(fn:()=>Promise<unknown>,after?:()=>void)=>{setBusy(true);setFailure('');try{await fn();after?.();load();}catch(e){setFailure(e instanceof FeError&&e.rule?t('fe.pair.rule.'+e.rule):feErrorMessage(e,t));}finally{setBusy(false);}};
 const meName=nameOf(person);
 if(state.status!=='ready')return null;
 if(couple&&c){
  const [me,other]=[c.members.find(m=>m.me),c.members.find(m=>!m.me)];
  return <>
   <Bar title={t('fe.pair.settings')} back="/n/me"/>
   <View><div className="pair-wrap">
    <div className="pair-scene on"><span className="ps-av me"><Av name={nameOf(me)} seed={me?.profileId}/></span><span className="ps-link"><i/><i/><i/><b><Heart/></b></span><span className="ps-av ot"><Av name={nameOf(other)} seed={other?.profileId}/></span></div>
    <h2 className="t center">{c.name||`${nameOf(me)} ${t('fe.pair.and')} ${nameOf(other)}`}</h2>
    <p className="note center">{t('fe.pair.since').replace('{date}',new Date(c.since).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'long',year:'numeric'}))}</p>
    {c.state==='paused'?<div className="alert warn mt12"><TriangleAlert/><span>{t('fe.pair.paused').replace('{date}',c.restoreUntil?new Date(c.restoreUntil).toLocaleDateString(locale==='en'?'en':'ru'):'')}</span></div>:null}
    <div className="pair-sets">
     <section className="grp"><div className="grp-t"><span>{t('fe.pair.approval')}</span></div><div className="card list">
      <button type="button" className="li" role="switch" aria-checked={!!me?.approvesPartner} disabled={busy} onClick={()=>act(()=>call('couple.setApproval',{opId:newOpId(),approvesPartner:!me?.approvesPartner},ok,{profileId:couple.id}))}>
       <span className="ico"><ShieldCheck/></span><span className="tx"><b>{t('fe.pair.approvalTitle')}</b><small>{me?.approvesPartner?t('fe.pair.approvalOn'):t('fe.pair.approvalOff')}</small></span><span className={'sw'+(me?.approvesPartner?' on':'')} aria-hidden="true"/>
      </button></div></section>
     <section className="grp"><div className="grp-t"><span>{t('fe.pair.act')}</span></div>
      <Btn kind="soft" onClick={()=>{setActing(couple.id);navigate('/n/me');}}>{t('fe.pair.actAsUs')}</Btn></section>
     {c.state==='active'&&<section className="grp"><div className="grp-t"><span>{t('fe.pair.careful')}</span></div>
      {!confirmStop?<div className="card list"><button type="button" className="li danger" onClick={()=>setConfirmStop(true)}><span className="ico"><X/></span><span className="tx"><b>{t('fe.pair.stop')}</b></span></button></div>
       :<div className="card"><p>{t('fe.pair.stopText')}</p><div className="btns mt12">
        <Btn kind="danger" disabled={busy} onClick={()=>act(()=>call('couple.stop',{opId:newOpId(),confirm:true},ok,{profileId:couple.id}),()=>{setConfirmStop(false);reload();})}>{t('fe.pair.stop')}</Btn>
        <Btn kind="text" onClick={()=>setConfirmStop(false)}>{t('fe.cancel')}</Btn></div></div>}
     </section>}
    </div>
    {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
   </div></View>
  </>;
 }
 const out=inv?.outgoing.find(o=>o.state==='pending');
 return <>
  <Bar title={t('fe.pair.title')} back="/n/me"/>
  <View><div className="pair-wrap">
   <div className={'pair-scene'+(out?' on':lookup.hit?' ready':'')}><span className="ps-av me"><Av name={meName} seed={person?.id} src={person?.avatar}/></span><span className="ps-link"><i/><i/><i/><b><Heart/></b></span>
    <span className="ps-av ot">{out?.profile?<Av name={nameOf(out.profile)} seed={out.profile.id}/>:lookup.hit?<Av name={nameOf(lookup.hit)} seed={lookup.hit.id} src={thumb(lookup.hit)}/>:<span className="av ini"><b style={{position:'relative'}}>?</b></span>}</span></div>
   <h2 className="t center">{out?t('fe.pair.waiting').replace('{name}',nameOf(out.profile)):t('fe.pair.inviteTitle')}</h2>
   <p className="note center">{t('fe.pair.inviteText')}</p>
   {inv===null?<Skel kind="list"/>:<>
    {inv.incoming.map(i=><div key={i.id} className="card rqcard mt12"><div className="row"><span className="rq-av"><Av name={nameOf(i.profile)} seed={i.profile?.id??i.id}/></span>
     <div className="grow"><b style={{fontSize:16}}>{nameOf(i.profile)}</b><div className="note">{t('fe.inbox.kind.pinv')} · {when(i.created_at,locale)}</div></div></div>
     <div className="row g8 mt12"><Btn size="md" disabled={busy} onClick={()=>act(()=>call('couple.inviteAnswer',{opId:newOpId(),inviteId:i.id,accept:true},ok,{asAccount:true}),reload)}>{t('fe.inbox.accept')}</Btn>
      <Btn size="md" kind="soft" disabled={busy} onClick={()=>act(()=>call('couple.inviteAnswer',{opId:newOpId(),inviteId:i.id,accept:false},ok,{asAccount:true}))}>{t('fe.priv.decline')}</Btn></div></div>)}
    {out?<div className="btns mt16"><Btn kind="soft" disabled={busy} onClick={()=>act(()=>call('couple.inviteWithdraw',{opId:newOpId(),inviteId:out.id},ok,{asAccount:true}))}>{t('fe.pair.withdraw')}</Btn></div>
     :<div className="card form-card mt16">
      <label className="field"><span>{t('fe.pair.partnerNick')}</span><div className="inwrap"><AtSign/><input className="inp" value={nick} onChange={e=>setNick(e.target.value.replace(/^@/,''))} placeholder="nickname" autoCapitalize="off" spellCheck={false} maxLength={20}/></div><div className="fhint">{t('fe.pair.nickHint')}</div></label>
      {lookup.hit?<div className="li static"><Av name={nameOf(lookup.hit)} seed={lookup.hit.id} src={thumb(lookup.hit)} size="sm"/><span className="tx"><b>{nameOf(lookup.hit)}</b><small>@{lookup.hit.handle}</small></span><span className="pill ok"><Check/>{t('fe.pq.found')}</span></div>
       :lookup.issue?<p className="note">{t('fe.pq.issue.'+lookup.issue)}</p>:null}
      <Btn disabled={busy||!lookup.hit} onClick={()=>act(async()=>{await call('couple.invite',{opId:op.current,handle:nick.trim()},ok,{asAccount:true});op.current=newOpId();setNick('');})}>{t('fe.pair.invite')}</Btn>
     </div>}
   </>}
   {failure&&<div className="alert err mt12" role="alert"><span>{failure}</span></div>}
  </div></View>
 </>;
}
export function PairEntry(){
 const {state}=useFe();const {t}=useI18n();const navigate=useNavigate();
 if(state.status!=='ready')return null;
 const couple=state.boot.profiles.find(p=>p.kind==='couple');
 return <section className="grp"><div className="grp-t"><span>{t('fe.pair.section')}</span></div><div className="card list">
  <button type="button" className="li" onClick={()=>navigate('/n/me/pair')}><span className="ico v"><Heart/></span><span className="tx"><b>{couple?(couple.name||t('fe.pair.ourProfile')):t('fe.pair.entry')}</b><small>{couple?t('fe.pair.entryOn'):t('fe.pair.entryOff')}</small></span></button>
 </div></section>;
}
