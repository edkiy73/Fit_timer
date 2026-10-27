import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronRight,Lock,LockOpen,Plus,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Btn,Empty,Skel} from './ui';
import {AgeCheckLink} from './age-check';
import {useFe} from './session';
import {when} from './feed';
import {SelectRow} from './create-community';
import {Sheet} from './profile-extras';
import {useToast} from './toast';
import {Ask,AudTag} from './me';

/** Slice C (V21 X01 «Приватное», P07, P08). Before access the server sends nothing real — only whether a private
 * part exists and what can be asked for; access is per profile, per scope and for a term. */
const who=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable()}).nullable();
const incoming=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),scopes:z.array(z.string()),created_at:z.string(),profile:who}))});
const grants=z.object({ok:z.literal(true),items:z.array(z.object({scopes:z.array(z.string()),until:z.string().nullable(),granted_at:z.string(),profile:who}))});
const priv=z.object({ok:z.literal(true),exists:z.boolean(),own:z.boolean().optional(),on:z.boolean().optional(),scopes:z.array(z.string()).optional(),until:z.string().nullable().optional(),
 text:z.string().nullable().optional(),media:z.array(z.unknown()).optional(),available:z.array(z.string()).optional(),canRequest:z.boolean().optional(),reason:z.string().nullable().optional()}).passthrough();
const ok=z.object({ok:z.literal(true)}).passthrough();
const interestsRes=z.object({ok:z.literal(true),items:z.array(z.object({vis:z.string().nullable().optional()}).passthrough())});
const nameOf=(p:z.infer<typeof who>)=>p?(p.name||(p.handle?'@'+p.handle:'?')):'—';

/** `mePrivLayer()` — access requests, what access opens (the vault summary → P04), who has access (three, «Все · N» /
 * «Отозвать все»), and the settings: the private part switch and who may ask. */
export function PrivateLayer({profileId,on,requestsFrom,onChanged}:{profileId:string,on:boolean,requestsFrom:'all'|'matches'|'none',onChanged:()=>void}){
 const {call,acting}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();const toast=useToast();
 const [mine,setMine]=useState<z.infer<typeof priv>|null>(null);const [reqs,setReqs]=useState<z.infer<typeof incoming>['items']>([]);const [given,setGiven]=useState<z.infer<typeof grants>['items']>([]);
 const [jarsG,setJarsG]=useState(0);const [allGiven,setAllGiven]=useState(false);
 const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);
 const [grantFor,setGrantFor]=useState<z.infer<typeof incoming>['items'][number]|null>(null);const [asking,setAsking]=useState<'off'|'revokeAll'|null>(null);
 const cp=acting?.kind==='couple';
 const load=useCallback(()=>{setError(null);Promise.all([call('private.get',{profileId},priv),call('access.lists',{tab:'incoming'},incoming),call('access.lists',{tab:'byme'},grants),
  call('interests.list',{profileId},interestsRes).then(r=>r.items.filter(j=>j.vis==='granted').length).catch(()=>0)])
  .then(([a,b,c,d])=>{setMine(a);setReqs(b.items);setGiven(c.items);setJarsG(d);}).catch(setError);},[call,profileId]);
 useEffect(()=>{load();},[load]);
 const act=async(fn:()=>Promise<unknown>,msg:string)=>{setBusy(true);try{await fn();toast(msg,{type:'ok'});load();onChanged();return true;}catch(e){toast(feErrorMessage(e,t),{type:'err'});return false;}finally{setBusy(false);}};
 const scopeLabel=(s:string)=>t('fe.priv.scope.'+s);
 const until=(u:string|null)=>u?t('fe.priv.until').replace('{date}',new Date(u).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'})):t('fe.priv.noTerm');
 if(error)return <Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>;
 if(!mine)return <Skel kind="card" rows={2}/>;
 const editor=()=>navigate('/n/me/edit?only=priv');
 const enable=()=>void act(()=>call('private.setOn',{opId:newOpId(),on:true},ok),t('fe.mx.pr.onDone'));
 const offAsk=asking==='off'&&<Ask icon={Lock} danger title={t('fe.mx.pr.offTitle')} busy={busy}
  text={[given.length||reqs.length?t('fe.mx.pr.offWhat',{g:given.length,q:reqs.length}):t('fe.mx.pr.offAll'),t('fe.mx.pr.offRest')].join(' ')} ok={t('fe.mx.pr.offOk')}
  onCancel={()=>setAsking(null)} onOk={async()=>{if(await act(()=>call('private.setOn',{opId:newOpId(),on:false,confirm:true},ok),t('fe.mx.pr.offDone')))setAsking(null);}}/>;
 if(!on)return <section className="grp"><div className="grp-t"><span>{t('fe.priv.title')}</span><span className="aud">{t('fe.mx.pr.offTag')}</span></div>
  <div className="vault off"><div className="vault-b"><p className="vault-lead">{cp?t('fe.mx.pr.leadUs'):t('fe.mx.pr.lead')}</p>
   <Btn icon={LockOpen} disabled={busy} busy={busy} onClick={enable}>{t('fe.mx.pr.enable')}</Btn></div></div></section>;
 const media=Array.isArray(mine.media)?mine.media.length:0;const txt=mine.text??'';
 const bits=[txt?t('fe.mx.pr.bit.text'):'',media?t('fe.mx.pr.bit.media',{n:media}):'',jarsG?t('fe.mx.pr.bit.jars',{n:jarsG}):''].filter(Boolean);
 const shown=allGiven?given:given.slice(0,3);
 return <>
  {reqs.length>0&&<section className="grp"><div className="grp-t"><span>{t('fe.priv.requests')} · {reqs.length}</span></div>
   {reqs.map(r=><div key={r.id} className="card rqcard" style={{marginBottom:10}}>
    <div className="row">
     <button type="button" className="rq-av" aria-label={nameOf(r.profile)} onClick={()=>r.profile&&navigate('/n/people/'+r.profile.id)}><Av name={nameOf(r.profile)} seed={r.profile?.id??r.id}/></button>
     <button type="button" className="grow" style={{textAlign:'left'}} onClick={()=>r.profile&&navigate('/n/people/'+r.profile.id)}>
      <b style={{fontSize:16}}>{nameOf(r.profile)}</b><div className="note">{cp?t('fe.mx.pr.asksUs'):t('fe.priv.asks')} · {when(r.created_at,locale)}</div>
     </button>
    </div>
    <div className="chips mt12">{r.scopes.map(s=><span key={s} className="pill">{scopeLabel(s)}</span>)}</div>
    <div className="row g8 mt12">
     <Btn size="md" onClick={()=>setGrantFor(r)} disabled={busy}>{t('fe.priv.grant')}</Btn>
     <Btn size="md" kind="soft" onClick={()=>void act(()=>call('access.decline',{opId:newOpId(),requestId:r.id},ok),t('fe.mx.pr.declined'))} disabled={busy}>{t('fe.priv.decline')}</Btn>
    </div>
   </div>)}
  </section>}
  <section className="grp"><div className="grp-t"><span>{t('fe.mx.pr.opens')}</span><AudTag k="granted"/></div>
   {bits.length?<button type="button" className="card blk-btn vault" style={{display:'block'}} onClick={editor}>
     <span className="vault-h" style={{padding:'0 0 8px'}}><span className="vi"><Lock/></span><b>{bits.join(' · ')}</b></span>
     {txt&&<span className="blk-bio">{txt.slice(0,160)}</span>}<span className="chv"><ChevronRight/></span></button>
    :<div className="card"><button type="button" className="ph-empty" onClick={editor}><span className="pe-ic"><Lock/></span>
     <span className="tx"><b>{t('fe.mx.pr.add')}</b><small>{cp?t('fe.mx.pr.addSubUs'):t('fe.mx.pr.addSub')}</small></span><Plus/></button></div>}
  </section>
  <section className="grp"><div className="grp-t"><span>{t('fe.mx.pr.who')}{given.length?' · '+given.length:''}</span>
   {given.length>3?<button type="button" onClick={()=>setAllGiven(v=>!v)}>{allGiven?t('fe.mx.pr.less'):t('fe.mx.pr.all',{n:given.length})}</button>
    :given.length?<button type="button" className="danger" onClick={()=>setAsking('revokeAll')}>{t('fe.mx.pr.revokeAll')}</button>:null}</div>
   {given.length===0?<p className="note">{t('fe.mx.pr.none')}</p>:<div className="card list">{shown.map((g,i)=><div key={i} className="li">
    <Av name={nameOf(g.profile)} seed={g.profile?.id??String(i)} size="sm"/>
    <button type="button" className="tx" style={{textAlign:'left'}} onClick={()=>g.profile&&navigate('/n/people/'+g.profile.id)}><b>{nameOf(g.profile)}</b><small>{g.scopes.map(scopeLabel).join(', ')} · {until(g.until)}</small></button>
    {g.profile&&<Btn size="sm" kind="text" auto className="danger" onClick={()=>void act(()=>call('access.revoke',{opId:newOpId(),profileId:g.profile!.id},ok),t('fe.mx.pr.revoked'))} disabled={busy}>{t('fe.mx.pr.revoke')}</Btn>}
   </div>)}</div>}
  </section>
  <section className="grp"><div className="grp-t"><span>{t('fe.mx.pr.settings')}</span></div><div className="card list">
   <button type="button" className="li" role="switch" aria-checked={on} disabled={busy} onClick={()=>setAsking('off')}>
    <span className="tx"><b>{t('fe.priv.on')}</b><small>{t('fe.mx.pr.onSub')}</small></span><span className="sw on" aria-hidden="true"/></button>
   <div className="li"><SelectRow label={t('fe.mx.pr.reqFrom')} value={requestsFrom} items={(['all','matches','none'] as const).map(v=>[v,t('fe.mx.pr.from.'+v)] as ['all'|'matches'|'none',string])}
    onChange={v=>void act(()=>call('profile.setVisibility',{opId:newOpId(),setting:'requestsFrom',value:v},ok),t('fe.mx.saved'))}/></div>
  </div></section>
  {offAsk}
  {asking==='revokeAll'&&<Ask icon={Lock} danger title={t('fe.mx.pr.revokeAllTitle')} text={t('fe.mx.pr.revokeAllText',{n:given.length})} ok={t('fe.mx.pr.revokeAll')} busy={busy}
   onCancel={()=>setAsking(null)} onOk={async()=>{if(await act(()=>call('access.revokeAll',{opId:newOpId(),confirm:true},ok),t('fe.mx.pr.revokedAll')))setAsking(null);}}/>}
  {grantFor&&<GrantSheet r={grantFor} onClose={()=>setGrantFor(null)} onDone={msg=>{setGrantFor(null);toast(msg,{type:'ok'});load();onChanged();}}/>}
 </>;
}

/** `grantSheet()` — what to share (the asked scopes, preselected) and for how long; «Отказать» from the same sheet. */
function GrantSheet({r,onClose,onDone}:{r:z.infer<typeof incoming>['items'][number],onClose:()=>void,onDone:(msg:string)=>void}){
 const {call}=useFe();const {t}=useI18n();
 const [sel,setSel]=useState<string[]>(r.scopes);const [term,setTerm]=useState<'1d'|'7d'|'none'>('7d');const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const op=useRef(newOpId());
 const run=async(grant:boolean)=>{setBusy(true);setFailure('');
  try{if(grant)await call('access.grant',{opId:op.current,requestId:r.id,scopes:sel,term},ok);else await call('access.decline',{opId:newOpId(),requestId:r.id},ok);
   onDone(grant?t('fe.mx.pr.granted'):t('fe.mx.pr.declined'));}catch(e){setFailure(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}};
 return <Sheet title={t('fe.mx.pr.grantTitle',{name:nameOf(r.profile)})} onClose={onClose} foot={<>
  <Btn icon={LockOpen} disabled={!sel.length||busy} busy={busy} onClick={()=>run(true)}>{t('fe.mx.pr.grantOk.'+term)}</Btn>
  <Btn kind="soft" disabled={busy} onClick={()=>run(false)}>{t('fe.priv.decline')}</Btn></>}>
  <p className="note">{t('fe.mx.pr.asksFor')} {r.scopes.map(s=>t('fe.priv.scope.'+s).toLowerCase()).join(', ')}</p>
  <div className="chips mt12" role="group" aria-label={t('fe.mx.pr.what')}>{(['info','photos','video'] as const).filter(s=>r.scopes.includes(s)).map(s=><button key={s} type="button" className={'chip'+(sel.includes(s)?' on':'')} aria-pressed={sel.includes(s)}
   onClick={()=>setSel(v=>v.includes(s)?v.filter(x=>x!==s):[...v,s])}>{t('fe.priv.scope.'+s)}</button>)}</div>
  <div className="sec">{t('fe.priv.term')}</div>
  <div className="chips" role="radiogroup" aria-label={t('fe.priv.term')}>{(['1d','7d','none'] as const).map(v=><button key={v} type="button" role="radio" aria-checked={term===v} className={'chip'+(term===v?' on':'')} onClick={()=>setTerm(v)}>{t('fe.mx.pr.term.'+v)}</button>)}</div>
  {failure&&<div className="alert err mt12" role="alert"><span>{failure}</span></div>}
 </Sheet>;
}

/** Another person's private part on their profile: nothing until access; then what was granted. */
export function PrivateOf({profileId}:{profileId:string}){
 const {call}=useFe();const {t,locale}=useI18n();
 const [p,setP]=useState<z.infer<typeof priv>|null>(null);const [busy,setBusy]=useState(false);const [note,setNote]=useState('');const op=useRef(newOpId());
 const load=useCallback(()=>{call('private.get',{profileId},priv).then(setP).catch(()=>setP(null));},[call,profileId]);
 useEffect(()=>{load();},[load]);
 if(!p||!p.exists)return null;
 const request=async()=>{setBusy(true);setNote('');try{await call('access.request',{opId:op.current,profileId,scopes:p.available??['info']},ok);setNote(t('fe.priv.requested'));load();}catch(e){setNote(feErrorMessage(e,t));op.current=newOpId();}finally{setBusy(false);}};
 const open=(p.scopes??[]).length>0;
 return <section className="grp"><div className="grp-t"><span>{t('fe.priv.title')}</span>{open&&p.until&&<span className="aud">{t('fe.priv.until').replace('{date}',new Date(p.until).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'}))}</span>}</div>
  {open?<div className="card">{p.text?<div className="md bio"><p>{p.text}</p></div>:<p className="note">{t('fe.priv.emptyText')}</p>}</div>
   :<div className="card"><div className="fact"><i className="v"><Lock/></i><span>{t('fe.priv.closed').replace('{scopes}',(p.available??[]).map(s=>t('fe.priv.scope.'+s)).join(', '))}</span></div>
    {p.canRequest?<Btn kind="soft" size="md" icon={LockOpen} onClick={request} disabled={busy} className="mt12">{t('fe.priv.ask')}</Btn>:p.reason&&<p className="note mt8">{t('fe.priv.reason.'+p.reason)}</p>}
   </div>}
  {note&&<div className="alert ok mt8" role="status"><span>{note}{note===t('fe.rule.age_check_required')&&<><br/><AgeCheckLink/></>}</span></div>}
 </section>;
}
