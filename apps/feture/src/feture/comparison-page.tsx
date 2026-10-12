import {useEffect,useRef,useState} from 'react';
import {Link,useBlocker,useLocation,useNavigate,useParams} from 'react-router';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import type {AuthSession} from '@appbase/core/auth.js';
import {comparisonCreated,comparisonList,comparisonRead,uuidV4} from './comparison-model';
import {domainRequest,domainErrorMessage} from './domain-api';
import {revokedSchema,STANCE_LABELS} from './share-link-model';
import {useInterestMap} from './use-interest-map';
import {useCatalog} from './use-catalog';
import {AppDialog} from './components/primitives';

export function ComparisonPage(){
 const auth=useOptionalAuth(),{linkId,comparisonId}=useParams(),location=useLocation();
 useEffect(()=>{const meta=document.createElement('meta');meta.name='robots';meta.content='noindex,nofollow,noarchive';document.head.appendChild(meta);return()=>meta.remove();},[]);
 if(linkId&&!uuidV4(linkId)||comparisonId&&!uuidV4(comparisonId))return <section className="card"><p>Сравнение недоступно.</p></section>;
 if(auth.loading)return <section className="card" role="status">Проверяем аккаунт…</section>;
 if(!auth.session)return <section className="card"><h2>Сравнение по согласию</h2><p>После входа вернём тебя к приглашению. Выбранные темы загрузятся только после проверки совершеннолетия и согласий.</p><Link to="/account" state={{returnTo:location.pathname}}>Войти и вернуться к приглашению</Link></section>;
 const key=JSON.stringify([auth.session.email,auth.session.deviceId,auth.session.syncToken,linkId,comparisonId]);
 return <section className="card ft-access ft-comparisons"><p><Link to="/share-links">← Мои ссылки</Link></p><h2>Сравнение по согласию</h2>
  <p>Каждый отдельно разрешает использовать выбранные темы. Это повод для разговора, а не оценка человека или согласие на действия. Личные ответы, опыт, границы и дневники не раскрываются.</p>
  {linkId?<CreateComparison key={key} session={auth.session} linkId={linkId}/>:comparisonId?<ReadComparison key={key} session={auth.session} comparisonId={comparisonId}/>:<ComparisonHistory key={key} session={auth.session}/>}
 </section>;
}

function ComparisonHistory({session}:{session:AuthSession}){
 const [data,setData]=useState<ReturnType<typeof comparisonList.parse>|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();setData(null);setError('');void domainRequest(session,{action:'share.compare.list'},comparisonList,controller.signal).then(x=>{if(!controller.signal.aborted)setData(x);}).catch(e=>{if(!controller.signal.aborted)setError(domainErrorMessage(e));});return()=>controller.abort();},[session,attempt]);
 const labels={pending:'Ожидает согласия владельца ссылки',active:'Оба согласия получены',revoked:'Отозвано',unavailable:'Ссылка недоступна'};
 return <><button onClick={()=>setAttempt(n=>n+1)}>Обновить</button>{error?<p role="alert">{error}</p>:!data?<p role="status">Загружаем приглашения…</p>:data.items.length===0?<p>Пока нет приглашений. Открой полученную карточку тем, чтобы предложить сравнение.</p>:<ul className="ft-share-history">{data.items.map(x=><li key={x.id}><strong>{x.role==='owner'?'Входящее приглашение':'Твоё приглашение'} · {x.id.slice(0,8)}</strong><p>{labels[x.state]} · до {new Date(x.expiresAt).toLocaleString('ru')}</p><Link to={'/compare/'+x.id}>Открыть и управлять</Link></li>)}</ul>}</>;
}

function CreateComparison({session,linkId}:{session:AuthSession;linkId:string}){
 const queue=useInterestMap(),{data:catalog}=useCatalog(),navigate=useNavigate();
 const [scope,setScope]=useState(''),[selected,setSelected]=useState<string[]>([]),[approval,setApproval]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef<{action:'share.compare.create';comparisonId:string;linkId:string;reviewed:true;selected:{interestId:string;expectedRevision:number}[]}|null>(null);
 const alive=useRef(true),allowExit=useRef(false);
 const blocker=useBlocker(({currentLocation,nextLocation})=>pending.current!==null&&!allowExit.current&&currentLocation.pathname!==nextLocation.pathname);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(pending.current){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[]);
 useEffect(()=>{let live=true;void crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([session.email,session.deviceId,session.syncToken]))).then(value=>{if(live)setScope(Array.from(new Uint8Array(value),b=>b.toString(16).padStart(2,'0')).join(''));});return()=>{live=false;};},[session]);
 const ready=!!scope&&scope===queue.scope&&queue.phase==='synced'&&queue.pending===0&&queue.conflicts.length===0;
 const choices=ready?catalog.categories.flatMap(c=>c.interests).filter(x=>{const row=queue.server[x.id];return row&&!row.deleted&&row.boundary==='none'&&row.stance!=='unknown';}):[];
 const rows=selected.map(id=>({interestId:id,expectedRevision:queue.server[id]?.revision||0}));
 const valid=ready&&selected.length>=1&&selected.length<=6&&selected.every(id=>choices.some(x=>x.id===id));
 const fingerprint=JSON.stringify(rows),approved=approval===fingerprint;
 const create=async()=>{
  if(busy||!pending.current&&(!valid||!approved))return;
  const command=pending.current??{action:'share.compare.create',comparisonId:crypto.randomUUID(),linkId,selected:rows,reviewed:true};
  pending.current=command;setBusy(true);setError('');
  try{const result=await domainRequest(session,command,comparisonCreated);if(alive.current){pending.current=null;allowExit.current=true;navigate('/compare/'+result.comparison.id);}}
  catch(e){if(alive.current)setError(domainErrorMessage(e));}finally{if(alive.current)setBusy(false);}
 };
 return <><h3>Выбери свои темы</h3><p>От 1 до 6 сохранённых отметок. Владелец ссылки должен отдельно разрешить сравнение своих тем. До этого результат недоступен.</p>
  <p><Link to="/tests">Пройти опросник</Link> · <Link to="/">Открыть свою карту</Link> · <Link to={'/share/'+linkId}>Посмотреть полученную карточку</Link></p>
  {!ready?<p>Для выбора тем нужна сохранённая карта без ожидающих изменений или конфликтов. Проверь совершеннолетие и согласия, затем обнови карту.</p>:choices.length===0?<p>Сначала добавь отметки в свою карту.</p>:<div role="group" aria-label="Свои темы для сравнения">{choices.map(x=><label className="ft-consent-choice" key={x.id}><input type="checkbox" checked={selected.includes(x.id)} disabled={busy||!!pending.current||!selected.includes(x.id)&&selected.length>=6} onChange={e=>{setSelected(v=>e.target.checked?[...v,x.id]:v.filter(id=>id!==x.id));setApproval(null);}}/>{x.title} · {STANCE_LABELS[queue.server[x.id]!.stance]}</label>)}</div>}
  {valid&&<div className="ft-share-preview" aria-label="Выбранные мной сведения">{selected.map(id=><div key={id}><strong>{choices.find(x=>x.id===id)?.title}</strong><span>{STANCE_LABELS[queue.server[id]!.stance]}</span></div>)}</div>}
  <label className="ft-consent-choice"><input type="checkbox" checked={approved} disabled={!valid||busy||!!pending.current} onChange={e=>setApproval(e.target.checked?fingerprint:null)}/>Я проверил выбранные отметки и разрешаю сравнить их с темами владельца этой ссылки после его отдельного согласия. Разрешение можно отозвать.</label>
  <button disabled={busy||!pending.current&&(!valid||!approved)} onClick={()=>void create()}>{busy?'Отправляем…':pending.current?'Повторить тот же запрос':'Предложить сравнение'}</button>
  {pending.current&&<p role="status">Исход прошлого запроса неизвестен. Повтор использует тот же выбор и номер приглашения.</p>}{error&&<p role="alert">{error}</p>}
  {blocker.state==='blocked'&&<AppDialog title="Результат приглашения ещё не подтверждён" onClose={()=>blocker.reset()}>
   <p>Приглашение могло быть создано. Вернись и повтори то же действие с прежним идентификатором, чтобы не создавать второй запрос.</p>
   <div className="ft-form-actions"><button type="button" disabled={busy} onClick={()=>{blocker.reset();void create();}}>Повторить то же действие</button><button type="button" onClick={()=>blocker.reset()}>Остаться</button></div>
  </AppDialog>}
 </>;
}

function ReadComparison({session,comparisonId}:{session:AuthSession;comparisonId:string}){
 const navigate=useNavigate();
 const [data,setData]=useState<ReturnType<typeof comparisonRead.parse>|null>(null),[attempt,setAttempt]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[approval,setApproval]=useState<string|null>(null);
 // SQL supports a replay with the original expectedRevision after an approved
 // reply was lost. Never invent another approval command while that result is unknown.
 const pendingApproval=useRef<{action:'share.compare.approve';comparisonId:string;expectedRevision:number;reviewed:true}|null>(null);
 const blocker=useBlocker(({currentLocation,nextLocation})=>pendingApproval.current!==null&&currentLocation.pathname!==nextLocation.pathname);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(pendingApproval.current){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[]);
 // Pause focus/visibility reads during a mutation; reread after it settles so
 // a delayed pre-approval snapshot cannot replace the new consent state.
 useEffect(()=>{if(busy||pendingApproval.current)return;const controller=new AbortController();setData(null);setError('');setApproval(null);void domainRequest(session,{action:'share.compare.read',comparisonId},comparisonRead,controller.signal).then(x=>{if(!controller.signal.aborted)setData(x);}).catch(e=>{if(!controller.signal.aborted)setError(domainErrorMessage(e));});return()=>controller.abort();},[session,comparisonId,attempt,busy]);
 useEffect(()=>{const visible=()=>{if(document.visibilityState==='visible')setAttempt(n=>n+1);};window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};},[]);
 const fingerprint=data?JSON.stringify([data.comparison.id,data.comparison.revision,data.myItems]):'';
 const approve=async()=>{
  if(busy||(!pendingApproval.current&&(!data||approval!==fingerprint||data.comparison.role!=='owner'||data.comparison.state!=='pending')))return;
  const command=pendingApproval.current??{action:'share.compare.approve' as const,comparisonId,expectedRevision:data!.comparison.revision,reviewed:true as const};
  pendingApproval.current=command;setBusy(true);setError('');
  try{
   const result=await domainRequest(session,command,comparisonRead);
   if(alive.current){pendingApproval.current=null;setData(result);setApproval(null);}
  }catch(e){if(alive.current)setError(domainErrorMessage(e));}
  finally{if(alive.current)setBusy(false);}
 };
 const revoke=async()=>{if(busy||!window.confirm('Отозвать своё согласие на сравнение? Новые просмотры закроются для обеих сторон. Ранее сохранённые снимки экрана отозвать нельзя.'))return;setBusy(true);setError('');try{await domainRequest(session,{action:'share.compare.revoke',comparisonId},revokedSchema);if(alive.current){pendingApproval.current=null;navigate('/comparisons');}}catch(e){if(alive.current){setData(null);setError(domainErrorMessage(e));}}finally{if(alive.current)setBusy(false);}};
 return <><p>Приглашение {comparisonId.slice(0,8)}</p><div className="ft-form-actions"><button disabled={busy||!!pendingApproval.current} onClick={()=>setAttempt(n=>n+1)}>Обновить</button><button disabled={busy} onClick={()=>void revoke()}>Отозвать моё согласие</button><Link to="/comparisons">Все приглашения</Link></div>
  {pendingApproval.current&&<div role="status"><p>Исход согласия неизвестен. Повторим ровно тот же запрос и ревизию; новые подтверждения пока недоступны.</p><button type="button" disabled={busy} onClick={()=>void approve()}>Повторить то же согласие</button></div>}
  {error&&<p role="alert">{error}</p>}
  {!data?<p role="status">Проверяем согласия и доступ…</p>:<>
   <p>Доступ до {new Date(data.comparison.expiresAt).toLocaleString('ru')}. Изменение выбранных отметок или отзыв исходной ссылки закрывает сравнение.</p>
   {data.comparison.state==='pending'?<><p role="status">Результат закрыт до согласия владельца ссылки.</p><h3>Твои выбранные отметки</h3><div className="ft-share-preview">{data.myItems.map((x,i)=><div key={i}><strong>{x.title}</strong><span>{STANCE_LABELS[x.stance]}</span></div>)}</div>
    {data.comparison.role==='owner'?<><label className="ft-consent-choice"><input type="checkbox" disabled={busy||!!pendingApproval.current} checked={approval===fingerprint} onChange={e=>setApproval(e.target.checked?fingerprint:null)}/>Я отдельно разрешаю сравнить показанные выше мои отметки с выбранными отметками отправителя этого приглашения. Разрешение можно отозвать.</label><button disabled={busy||!!pendingApproval.current||approval!==fingerprint} onClick={()=>void approve()}>Разрешить сравнение</button></>:<p>Своё согласие ты уже дал. Попроси владельца ссылки открыть приглашение в разделе «Сравнения».</p>}
   </>:<><h3>Общие выбранные темы</h3>{data.items?.length?<div className="ft-comparison-results">{data.items.map((x,i)=><div className="ft-map-proposal" key={i}><strong>{x.title}</strong><div className="ft-comparison-pair"><p>Моя отметка<br/><b>{STANCE_LABELS[x.mine]}</b></p><p>Отметка другого человека<br/><b>{STANCE_LABELS[x.theirs]}</b></p></div></div>)}</div>:<p>В выбранных вами наборах нет общих тем. Это ничего не говорит о совместимости или ценности человека.</p>}<p>Никакого общего балла: одинаковые или разные отметки не означают согласия на действия.</p></>}
  </>}
  {blocker.state==='blocked'&&<AppDialog title="Результат согласия ещё не подтверждён" onClose={()=>blocker.reset()}>
   <p>Согласие могло быть сохранено. Вернись к этому приглашению и повтори прежний запрос с той же ревизией либо отзови согласие.</p>
   <div className="ft-form-actions"><button type="button" disabled={busy} onClick={()=>{blocker.reset();void approve();}}>Повторить то же согласие</button><button type="button" onClick={()=>blocker.reset()}>Остаться</button></div>
  </AppDialog>}
 </>;
}
