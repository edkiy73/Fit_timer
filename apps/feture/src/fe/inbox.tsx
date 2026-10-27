import {useCallback,useEffect,useState} from 'react';
import {useNavigate} from 'react-router';
import {z} from 'zod';
import {useI18n} from '@appbase/ui-react/i18n.js';
import {Bell,Inbox,X} from 'lucide-react';
import {feErrorMessage,newOpId} from '../feture/fe-api';
import {Av,Bar,Btn,Empty,Seg,View} from './ui';
import {useFe} from './session';
import {when} from './feed';

/** Slice G2 (V21 N01): «Нужно решить» computed by the server from its source rows, and notifications addressed
 * «Тебе» or «Паре». One bell count everywhere: unread notifications + things to decide. */
const actor=z.object({id:z.uuid(),kind:z.enum(['person','couple']).optional(),handle:z.string().nullable().optional(),name:z.string().nullable().optional()}).passthrough().nullable();
const decision=z.object({kind:z.string(),id:z.uuid(),objectId:z.uuid().nullable(),actor,at:z.string(),label:z.string(),addressee:z.uuid().nullable().optional()});
const decideRes=z.object({ok:z.literal(true),items:z.array(decision)});
const note=z.object({id:z.uuid(),type:z.string(),actor,data:z.record(z.string(),z.unknown()),label:z.string(),object:z.object({type:z.string(),id:z.uuid().nullable()}).nullable(),at:z.string(),read:z.boolean()});
const notesRes=z.object({ok:z.literal(true),items:z.array(note),next:z.string().nullable()});
export const countsRes=z.object({ok:z.literal(true),decide:z.number(),notifications:z.number(),bell:z.number(),chats:z.number(),newMatches:z.number(),likes:z.number()});
const ok=z.object({ok:z.literal(true)}).passthrough();
const nameOf=(a:z.infer<typeof actor>)=>a?(a.name||(a.handle?'@'+a.handle:'?')):'FetUre';

/** Bell with the shared count, for screen headers. */
export function BellButton(){
 const {call}=useFe();const {t}=useI18n();const navigate=useNavigate();const [n,setN]=useState(0);
 useEffect(()=>{let live=true;const pull=()=>call('inbox.counts',{},countsRes,{asAccount:true}).then(r=>{if(live)setN(r.bell);}).catch(()=>{});
  pull();const id=setInterval(pull,30000);return ()=>{live=false;clearInterval(id);};},[call]);
 return <button type="button" className="ibtn" aria-label={n?t('fe.inbox.bellN').replace('{n}',String(n)):t('fe.inbox.title')} onClick={()=>navigate('/n/inbox')}><Bell/>{n>0&&<sup>{n>99?'99+':n}</sup>}</button>;
}

export function InboxScreen(){
 const {call,state,acting,setActing}=useFe();const {t,locale}=useI18n();const navigate=useNavigate();
 const [tab,setTab]=useState<'todo'|'all'>('todo');const [decide,setDecide]=useState<z.infer<typeof decision>[]|null>(null);const [notes,setNotes]=useState<z.infer<typeof note>[]|null>(null);
 const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);const [failure,setFailure]=useState('');
 const load=useCallback(()=>{setError(null);Promise.all([call('decide.list',{},decideRes,{asAccount:true}),call('notifications.list',{},notesRes,{asAccount:true})])
  .then(([a,b])=>{setDecide(a.items);setNotes(b.items);}).catch(setError);},[call]);
 useEffect(()=>{load();},[load]);
 const act=async(fn:()=>Promise<unknown>)=>{setBusy(true);setFailure('');try{await fn();load();}catch(e){setFailure(feErrorMessage(e,t));}finally{setBusy(false);}};
 const open=(n:z.infer<typeof note>)=>{
  if(!n.read)call('notifications.read',{id:n.id},ok,{asAccount:true}).catch(()=>{});
  if(n.type.startsWith('link')){navigate('/n/me/links');return;}
  const o=n.object;if(!o?.id){if(n.actor)navigate('/n/people/'+n.actor.id);return;}
  navigate(o.type==='post'||o.type==='reply'?'/n/feed/post/'+(n.data.postId as string|undefined??o.id):o.type==='community'?'/n/communities/'+o.id:o.type==='event'?'/n/events/'+o.id:o.type==='conversation'?'/n/chats/'+o.id:o.type==='profile'?'/n/people/'+o.id:'/n/me');
 };
 /** Links are per profile: answer as the profile the proposal is addressed to (person or couple). */
 const toLinks=(addressee?:string|null)=>{if(addressee&&addressee!==acting?.id&&state.status==='ready'&&state.boot.profiles.some(p=>p.id===addressee&&p.state!=='deleted'))setActing(addressee);navigate('/n/me/links');};
 const kindLabel=(k:string)=>k==='link'||k==='linkChange'?t('fe.ln.inbox.'+k):t('fe.inbox.kind.'+k);
 const unread=(notes??[]).filter(n=>!n.read).length;
 const groups=(['me','couple'] as const).map(l=>[l,(decide??[]).filter(d=>d.label===l)] as const).filter(([,list])=>list.length>0);
 return <>
  <Bar title={t('fe.inbox.title')} back/>
  <View>
   <Seg value={tab} onChange={setTab} options={[{id:'todo',label:t('fe.inbox.todo')+(decide?.length?' · '+decide.length:'')},{id:'all',label:t('fe.inbox.all')+(unread?' · '+unread:'')}]}/>
   {error?<Empty icon={X} role="alert" title={t('fe.error.title')} text={feErrorMessage(error,t)}><Btn kind="soft" onClick={load}>{t('fe.retry')}</Btn></Empty>
    :decide===null||notes===null?<p className="note" role="status">{t('fe.loading')}</p>
    :tab==='todo'?(decide.length===0?<Empty icon={Inbox} title={t('fe.inbox.noTodo')} text={t('fe.inbox.noTodoText')}/>
     :groups.map(([label,list])=><div key={label}>
      <div className="sec whom-sec"><span>{t('fe.inbox.whom.'+label)}</span><b>{list.length}</b></div>
      {list.map(d=><div key={d.kind+d.id} className="card rqcard" style={{marginBottom:10}}>
       <div className="row">
        <button type="button" className="rq-av" onClick={()=>d.actor&&navigate('/n/people/'+d.actor.id)} aria-label={nameOf(d.actor)}><Av name={nameOf(d.actor)} seed={d.actor?.id??d.id}/></button>
        <div className="grow" style={{textAlign:'left'}}><b style={{fontSize:16}}>{nameOf(d.actor)}</b><div className="note">{kindLabel(d.kind)} · {when(d.at,locale)}</div></div>
       </div>
       <div className="row g8 mt12">
        {d.kind==='pinv'?<><Btn size="md" disabled={busy} onClick={()=>act(()=>call('couple.inviteAnswer',{opId:newOpId(),inviteId:d.id,accept:true},ok,{asAccount:true}))}>{t('fe.inbox.accept')}</Btn>
          <Btn size="md" kind="soft" disabled={busy} onClick={()=>act(()=>call('couple.inviteAnswer',{opId:newOpId(),inviteId:d.id,accept:false},ok,{asAccount:true}))}>{t('fe.priv.decline')}</Btn></>
         :d.kind==='req'?<Btn size="md" onClick={()=>navigate('/n/me?layer=priv')}>{t('fe.inbox.review')}</Btn>
         :d.kind==='capp'&&d.objectId?<Btn size="md" onClick={()=>navigate('/n/communities/'+d.objectId)}>{t('fe.inbox.review')}</Btn>
         :d.kind==='eapp'&&d.objectId?<Btn size="md" onClick={()=>navigate('/n/events/'+d.objectId)}>{t('fe.inbox.review')}</Btn>
         :d.kind==='link'||d.kind==='linkChange'?<Btn size="md" onClick={()=>toLinks(d.addressee)}>{t('fe.inbox.review')}</Btn>
         :d.kind==='tag'&&d.objectId?<Btn size="md" onClick={()=>navigate('/n/feed/post/'+d.objectId)}>{t('fe.inbox.review')}</Btn>:null}
       </div>
      </div>)}
     </div>))
    :(notes.length===0?<Empty icon={Bell} title={t('fe.inbox.none')} text={t('fe.inbox.noneText')}/>:<>
     {unread>0&&<div className="row" style={{justifyContent:'flex-end'}}><Btn kind="text" size="sm" auto disabled={busy} onClick={()=>act(()=>call('notifications.readAll',{},ok,{asAccount:true}))}>{t('fe.inbox.readAll')}</Btn></div>}
     <div className="card list">{notes.map(n=><button key={n.id} type="button" className={'li'+(n.read?'':' unread')} onClick={()=>open(n)}>
      <Av name={nameOf(n.actor)} seed={n.actor?.id??n.id} size="sm"/>
      <span className="tx"><b>{nameOf(n.actor)}</b><small>{t('fe.inbox.type.'+n.type)!=='fe.inbox.type.'+n.type?t('fe.inbox.type.'+n.type):t('fe.inbox.type.other')} · {when(n.at,locale)}{n.label==='couple'?' · '+t('fe.inbox.whom.couple'):''}</small></span>
      {!n.read&&<span className="dot" aria-label={t('fe.inbox.new')}/>}
     </button>)}</div>
    </>)}
   {failure&&<div className="alert err" role="alert"><span>{failure}</span></div>}
  </View>
 </>;
}
