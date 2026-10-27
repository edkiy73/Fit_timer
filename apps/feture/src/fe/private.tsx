import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Lock,LockOpen,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Btn,Empty} from './ui';
import {AgeCheckLink} from './age-check';
import {useFe} from './session';
import {when} from './feed';

/** Slice C (V21 X01 «Приватное», P07, P08). Before access the server sends nothing real — only whether a private
 * part exists and what can be asked for; access is per profile, per scope and for a term. */
const who=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable()}).nullable();
const incoming=z.object({ok:z.literal(true),items:z.array(z.object({id:z.uuid(),scopes:z.array(z.string()),created_at:z.string(),profile:who}))});
const grants=z.object({ok:z.literal(true),items:z.array(z.object({scopes:z.array(z.string()),until:z.string().nullable(),granted_at:z.string(),profile:who}))});
const priv=z.object({ok:z.literal(true),exists:z.boolean(),own:z.boolean().optional(),on:z.boolean().optional(),scopes:z.array(z.string()).optional(),until:z.string().nullable().optional(),
 text:z.string().nullable().optional(),available:z.array(z.string()).optional(),canRequest:z.boolean().optional(),reason:z.string().nullable().optional()}).passthrough();
const ok=z.object({ok:z.literal(true)}).passthrough();
const nameOf=(p:z.infer<typeof who>)=>p?(p.name||(p.handle?'@'+p.handle:'?')):'—';

export function PrivateLayer({profileId}:{profileId:string}){
 const {call}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [mine,setMine]=useState<z.infer<typeof priv>|null>(null);const [reqs,setReqs]=useState<z.infer<typeof incoming>['items']>([]);const [given,setGiven]=useState<z.infer<typeof grants>['items']>([]);
 const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');const [text,setText]=useState('');const [term,setTerm]=useState<'1d'|'7d'|'30d'|'none'>('7d');
 const op=useRef(newOpId());
 const load=useCallback(()=>{setError(null);Promise.all([call('private.get',{profileId},priv),call('access.lists',{tab:'incoming'},incoming),call('access.lists',{tab:'byme'},grants)])
  .then(([a,b,c])=>{setMine(a);setText(a.text??'');setReqs(b.items);setGiven(c.items);}).catch(setError);},[call,profileId]);
 useEffect(()=>{load();},[load]);
 const act=async(fn:()=>Promise<unknown>)=>{setBusy(true);setFailure('');try{await fn();load();}catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 const scopeLabel=(s:string)=>t('fe.priv.scope.'+s);
 if(error)return <Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>;
 if(!mine)return <p className="note" role="status">{t('fe.loading')}</p>;
 return <>
  {reqs.length>0&&<section className="grp"><div className="grp-t"><span>{t('fe.priv.requests')} · {reqs.length}</span></div>
   <div className="chips mb12" role="radiogroup" aria-label={t('fe.priv.term')}>{(['1d','7d','30d','none'] as const).map(v=><button key={v} type="button" role="radio" aria-checked={term===v} className={'chip'+(term===v?' on':'')} onClick={()=>setTerm(v)}>{t('fe.priv.term.'+v)}</button>)}</div>
   {reqs.map(r=><div key={r.id} className="card rqcard" style={{marginBottom:10}}>
    <div className="row">
     <button type="button" className="rq-av" aria-label={nameOf(r.profile)} onClick={()=>r.profile&&navigate('/n/people/'+r.profile.id)}><Av name={nameOf(r.profile)} seed={r.profile?.id??r.id}/></button>
     <button type="button" className="grow" style={{textAlign:'left'}} onClick={()=>r.profile&&navigate('/n/people/'+r.profile.id)}>
      <b style={{fontSize:16}}>{nameOf(r.profile)}</b><div className="note">{t('fe.priv.asks')} · {when(r.created_at,locale)}</div>
     </button>
    </div>
    <div className="chips mt12">{r.scopes.map(s=><span key={s} className="pill">{scopeLabel(s)}</span>)}</div>
    <div className="row g8 mt12">
     <Btn size="md" onClick={()=>act(()=>call('access.grant',{opId:newOpId(),requestId:r.id,scopes:r.scopes,term},ok))} disabled={busy}>{t('fe.priv.grant')}</Btn>
     <Btn size="md" kind="soft" onClick={()=>act(()=>call('access.decline',{opId:newOpId(),requestId:r.id},ok))} disabled={busy}>{t('fe.priv.decline')}</Btn>
    </div>
   </div>)}
  </section>}
  <section className="grp"><div className="grp-t"><span>{t('fe.priv.mine')}</span></div>
   <div className="card list">
    <button type="button" className="li" role="switch" aria-checked={!!mine.on} disabled={busy} onClick={()=>act(()=>call('private.setOn',{opId:newOpId(),on:!mine.on,confirm:true},ok))}>
     <span className="tx"><b>{t('fe.priv.on')}</b><small>{mine.on?t('fe.priv.onNote'):t('fe.priv.offNote')}</small></span><span className={'sw'+(mine.on?' on':'')} aria-hidden="true"/>
    </button>
   </div>
   {mine.on&&<div className="card form-card mt12">
    <label className="field"><span>{t('fe.priv.text')}</span><textarea className="inp" rows={5} maxLength={1000} value={text} onChange={e=>setText(e.target.value)} placeholder={t('fe.priv.textPh')}/><div className="counter">{text.length} / 1000</div></label>
    <Btn size="md" onClick={()=>act(async()=>{await call('private.setText',{opId:op.current,text:text.trim()},ok);op.current=newOpId();})} disabled={busy||text===(mine.text??'')}>{t('fe.me.save')}</Btn>
   </div>}
  </section>
  <section className="grp"><div className="grp-t"><span>{t('fe.priv.given')}{given.length?' · '+given.length:''}</span></div>
   {given.length===0?<p className="note">{t('fe.priv.noneGiven')}</p>:<div className="card list">{given.map((g,i)=><div key={i} className="li">
    <Av name={nameOf(g.profile)} seed={g.profile?.id??String(i)} size="sm"/>
    <span className="tx"><b>{nameOf(g.profile)}</b><small>{g.scopes.map(scopeLabel).join(', ')} · {g.until?t('fe.priv.until').replace('{date}',new Date(g.until).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'})):t('fe.priv.noTerm')}</small></span>
    {g.profile&&<Btn size="sm" kind="soft" auto onClick={()=>act(()=>call('access.revoke',{opId:newOpId(),profileId:g.profile!.id},ok))} disabled={busy}>{t('fe.priv.revoke')}</Btn>}
   </div>)}</div>}
  </section>
  {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
 </>;
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
