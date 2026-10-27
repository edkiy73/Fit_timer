import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {ChevronRight,Lock,LockOpen,Plus,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Alert,Av,Btn,Card,Chip,ChoiceChips,Empty,Group,Note,Pill,Row,SectionLabel,SelectRow,Sheet,Skel,Stack,ToggleRow} from './kit';
import {AgeCheckLink} from './age-check';
import {useFe} from './session';
import {when} from './feed';
import {useToast} from './toast';
import {Ask,AudTag} from './me';
import {faceFields,NameBadges,withAge} from './faces';

/** Slice C (V21 X01 «Приватное», P07, P08). Before access the server sends nothing real — only whether a private
 * part exists and what can be asked for; access is per profile, per scope and for a term. */
const who=z.object({id:z.uuid(),kind:z.enum(['person','couple']),handle:z.string().nullable(),name:z.string().nullable(),...faceFields}).nullable();
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
 if(!on)return <Group title={t('fe.priv.title')} action={<span className="aud">{t('fe.mx.pr.offTag')}</span>}>
  <div className="vault off"><div className="vault-b"><p className="vault-lead">{cp?t('fe.mx.pr.leadUs'):t('fe.mx.pr.lead')}</p>
   <Btn icon={LockOpen} disabled={busy} busy={busy} onClick={enable}>{t('fe.mx.pr.enable')}</Btn></div></div></Group>;
 const media=Array.isArray(mine.media)?mine.media.length:0;const txt=mine.text??'';
 const bits=[txt?t('fe.mx.pr.bit.text'):'',media?t('fe.mx.pr.bit.media',{n:media}):'',jarsG?t('fe.mx.pr.bit.jars',{n:jarsG}):''].filter(Boolean);
 const shown=allGiven?given:given.slice(0,3);
 return <>
  {reqs.length>0&&<Group title={<>{t('fe.priv.requests')} · {reqs.length}</>}><Stack gap={2}>
   {reqs.map(r=><Card key={r.id} className="rqcard">
    <div className="row">
     <button type="button" className="rq-av" aria-label={nameOf(r.profile)} onClick={()=>r.profile&&navigate('/n/people/'+r.profile.id)}><Av name={nameOf(r.profile)} seed={r.profile?.id??r.id} src={r.profile?.avatar}/></button>
     <button type="button" className="grow" style={{textAlign:'left'}} onClick={()=>r.profile&&navigate('/n/people/'+r.profile.id)}>
      <b style={{fontSize:16}}>{withAge(nameOf(r.profile),r.profile)}<NameBadges p={r.profile}/></b><div className="note">{cp?t('fe.mx.pr.asksUs'):t('fe.priv.asks')} · {when(r.created_at,locale)}</div>
     </button>
    </div>
    <div className="chips mt12">{r.scopes.map(s=><Pill key={s}>{scopeLabel(s)}</Pill>)}</div>
    <div className="row g8 mt12">
     <Btn size="md" onClick={()=>setGrantFor(r)} disabled={busy}>{t('fe.priv.grant')}</Btn>
     <Btn size="md" kind="soft" onClick={()=>void act(()=>call('access.decline',{opId:newOpId(),requestId:r.id},ok),t('fe.mx.pr.declined'))} disabled={busy}>{t('fe.priv.decline')}</Btn>
    </div>
   </Card>)}
  </Stack></Group>}
  <Group title={t('fe.mx.pr.opens')} action={<AudTag k="granted"/>}>
   {bits.length?<button type="button" className="card blk-btn vault" style={{display:'block'}} onClick={editor}>
     <span className="vault-h" style={{padding:'0 0 8px'}}><span className="vi"><Lock/></span><b>{bits.join(' · ')}</b></span>
     {txt&&<span className="blk-bio">{txt.slice(0,160)}</span>}<span className="chv"><ChevronRight/></span></button>
    :<Card><button type="button" className="ph-empty" onClick={editor}><span className="pe-ic"><Lock/></span>
     <span className="tx"><b>{t('fe.mx.pr.add')}</b><small>{cp?t('fe.mx.pr.addSubUs'):t('fe.mx.pr.addSub')}</small></span><Plus/></button></Card>}
  </Group>
  <Group title={<>{t('fe.mx.pr.who')}{given.length?' · '+given.length:''}</>}
   action={given.length>3?<button type="button" onClick={()=>setAllGiven(v=>!v)}>{allGiven?t('fe.mx.pr.less'):t('fe.mx.pr.all',{n:given.length})}</button>
    :given.length?<button type="button" className="danger" onClick={()=>setAsking('revokeAll')}>{t('fe.mx.pr.revokeAll')}</button>:null}>
   {given.length===0?<Note>{t('fe.mx.pr.none')}</Note>:<Card list>{shown.map((g,i)=><Row key={i} noChev onClick={()=>g.profile&&navigate('/n/people/'+g.profile.id)}
    av={<Av name={nameOf(g.profile)} seed={g.profile?.id??String(i)} size="sm" src={g.profile?.avatar}/>}
    title={<>{nameOf(g.profile)}<NameBadges p={g.profile}/></>} sub={<>{g.scopes.map(scopeLabel).join(', ')} · {until(g.until)}</>}
    end={g.profile&&<Btn size="sm" kind="text" auto className="danger" onClick={()=>void act(()=>call('access.revoke',{opId:newOpId(),profileId:g.profile!.id},ok),t('fe.mx.pr.revoked'))} disabled={busy}>{t('fe.mx.pr.revoke')}</Btn>}/>)}</Card>}
  </Group>
  <Group title={t('fe.mx.pr.settings')}><Card list>
   <ToggleRow title={t('fe.priv.on')} sub={t('fe.mx.pr.onSub')} on={on} disabled={busy} onClick={()=>setAsking('off')}/>
   <div className="li"><SelectRow label={t('fe.mx.pr.reqFrom')} value={requestsFrom} options={(['all','matches','none'] as const).map(v=>[v,t('fe.mx.pr.from.'+v)] as const)}
    onChange={v=>void act(()=>call('profile.setVisibility',{opId:newOpId(),setting:'requestsFrom',value:v},ok),t('fe.mx.saved'))}/></div>
  </Card></Group>
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
  <Note>{t('fe.mx.pr.asksFor')} {r.scopes.map(s=>t('fe.priv.scope.'+s).toLowerCase()).join(', ')}</Note>
  <div className="chips mt12" role="group" aria-label={t('fe.mx.pr.what')}>{(['info','photos','video'] as const).filter(s=>r.scopes.includes(s)).map(s=><Chip key={s} on={sel.includes(s)}
   onClick={()=>setSel(v=>v.includes(s)?v.filter(x=>x!==s):[...v,s])}>{t('fe.priv.scope.'+s)}</Chip>)}</div>
  <SectionLabel>{t('fe.priv.term')}</SectionLabel>
  <ChoiceChips label={t('fe.priv.term')} value={term} onChange={setTerm} options={(['1d','7d','none'] as const).map(v=>[v,t('fe.mx.pr.term.'+v)] as const)}/>
  {failure&&<Alert kind="err" noIcon className="mt12">{failure}</Alert>}
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
 return <Group title={t('fe.priv.title')} action={open&&p.until&&<span className="aud">{t('fe.priv.until').replace('{date}',new Date(p.until).toLocaleDateString(locale==='en'?'en':'ru',{day:'numeric',month:'short'}))}</span>}>
  {open?<Card>{p.text?<div className="md bio"><p>{p.text}</p></div>:<Note>{t('fe.priv.emptyText')}</Note>}</Card>
   :<Card><div className="fact"><i className="v"><Lock/></i><span>{t('fe.priv.closed').replace('{scopes}',(p.available??[]).map(s=>t('fe.priv.scope.'+s)).join(', '))}</span></div>
    {p.canRequest?<Btn kind="soft" size="md" icon={LockOpen} onClick={request} disabled={busy} className="mt12">{t('fe.priv.ask')}</Btn>:p.reason&&<Note className="mt8">{t('fe.priv.reason.'+p.reason)}</Note>}
   </Card>}
  {note&&<Alert kind="ok" noIcon className="mt8">{note}{note===t('fe.rule.age_check_required')&&<><br/><AgeCheckLink/></>}</Alert>}
 </Group>;
}
