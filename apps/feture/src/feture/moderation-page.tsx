import {useEffect,useState} from 'react';
import {Link,useBlocker,useParams} from 'react-router';
import {z} from 'zod';
import type {AuthSession} from '@appbase/core/auth.js';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import {authClient} from '../auth';
import {domainRequest,domainErrorMessage,DomainClientError} from './domain-api';
import {AppDialog} from './components/primitives';
import {sameSession} from './interest-api';
export const REPORT_REASONS={harassment:'Преследование или угрозы',privacy:'Нарушение приватности',nonconsent:'Отсутствие согласия',minor:'Несовершеннолетний участник или материал',illegal:'Незаконные материалы',spam:'Спам или мошенничество',other:'Другая причина'};
export const PROFILE_FIELDS={nickname:'Имя',about:'О себе',pronouns:'Местоимения',identity:'Самоопределение',orientation:'Ориентация',relationships:'Отношения',city:'Город'};
const rowSchema=z.object({id:z.uuid(),caseId:z.uuid(),state:z.enum(['open','reviewing','resolved']),createdAt:z.iso.datetime({offset:true})}).strict();
const ownSchema=z.object({ok:z.literal(true),items:z.array(rowSchema).max(30),nextCursor:z.uuid().nullable(),restriction:z.object({caseId:z.uuid(),state:z.enum(['hidden','suspended']),reason:z.enum(['policy','abuse','age','illegal']),expiresAt:z.iso.datetime({offset:true}),active:z.boolean()}).strict().nullable(),requestId:z.uuid()}).strict();
const reportSchema=z.object({ok:z.literal(true),reportId:z.uuid(),requestId:z.uuid()}).strict();
const appealSchema=z.object({ok:z.literal(true),appealId:z.uuid(),requestId:z.uuid()}).strict();
const stateLabels={open:'Получено',reviewing:'На рассмотрении',resolved:'Рассмотрено'};
type PendingReport={action:'moderation.report';operationId:string;targetId:string;reason:keyof typeof REPORT_REASONS;note:string;field:string|null};
type PendingAppeal={action:'moderation.appeal';operationId:string;caseId:string;text:string};
export function ModerationPage(){const auth=useOptionalAuth();const {targetId}=useParams();if(auth.loading)return <p role="status">Загружаем аккаунт…</p>;if(!auth.session)return <section className="card"><h2>Безопасность и обращения</h2><p>Войди, чтобы отправить обращение или посмотреть его статус.</p><Link to="/account">Войти</Link></section>;return <ModerationManager key={auth.session.email+':'+auth.session.deviceId+':'+auth.session.syncToken+':'+targetId} session={auth.session} targetId={targetId}/>;}
function ModerationManager({session,targetId}:{session:AuthSession;targetId:string|undefined}){
 const [kind,setKind]=useState<'reports'|'appeals'>('reports'),[cursor,setCursor]=useState<string|null>(null),[own,setOwn]=useState<z.infer<typeof ownSchema>|null>(null),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [reason,setReason]=useState<keyof typeof REPORT_REASONS>('other'),[note,setNote]=useState(''),[field,setField]=useState(''),[pendingReport,setPendingReport]=useState<PendingReport|null>(null),[appealText,setAppealText]=useState(''),[pendingAppeal,setPendingAppeal]=useState<PendingAppeal|null>(null),[appealCase,setAppealCase]=useState<string|null>(null);
 const blocker=useBlocker(({currentLocation,nextLocation})=>(pendingReport!==null||pendingAppeal!==null)&&currentLocation.pathname!==nextLocation.pathname);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{if(pendingReport||pendingAppeal){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[pendingReport,pendingAppeal]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setOwn(null);setError('');domainRequest(session,{action:'moderation.status',kind,cursor},ownSchema,controller.signal).then(r=>{if(!controller.signal.aborted)setOwn(r);}).catch(e=>{if(!controller.signal.aborted)setError(domainErrorMessage(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return ()=>controller.abort();},[session,kind,cursor,refresh]);
 const report=async()=>{
  if(busy||pendingAppeal||(!pendingReport&&(!targetId||!z.uuid().safeParse(targetId).success)))return;
  const wasRetry=pendingReport!==null;
  const command=pendingReport??{action:'moderation.report',operationId:crypto.randomUUID(),targetId:targetId!,reason,note,field:field||null} satisfies PendingReport;
  setPendingReport(command);setBusy(true);setError('');setNotice('');
  try{
   await domainRequest(session,command,reportSchema);
   if(sameSession(await authClient.getSession(),session)){
    setNotice('Обращение получено. Модератор рассмотрит его отдельно.');setNote('');setPendingReport(null);setRefresh(n=>n+1);
   }
  }catch(e){
   if(sameSession(await authClient.getSession(),session)){
    setError(domainErrorMessage(e));
    if(e instanceof DomainClientError&&(['invalid_request','operation_conflict'].includes(e.code)||!wasRetry&&e.code==='rate_limited'))setPendingReport(null);
   }
  }finally{if(sameSession(await authClient.getSession(),session))setBusy(false);}
 };
 const changedCase=!!appealCase&&!!own?.restriction&&appealCase!==own.restriction.caseId;
 const appeal=async()=>{
  if(busy||pendingReport||(!pendingAppeal&&(changedCase||!own?.restriction||!appealText.trim())))return;
  // The server checks the restriction before consulting the immutable receipt.
  // A lost reply followed by a revoked/changed restriction is still ambiguous.
  const wasRetry=pendingAppeal!==null;
  const command=pendingAppeal??{action:'moderation.appeal',operationId:crypto.randomUUID(),caseId:appealCase||own!.restriction!.caseId,text:appealText} satisfies PendingAppeal;
  setPendingAppeal(command);setBusy(true);setError('');setNotice('');
  try{
   await domainRequest(session,command,appealSchema);
   if(sameSession(await authClient.getSession(),session)){
    setNotice('Апелляция получена. Ограничение действует до решения или указанного срока.');
    setAppealText('');setPendingAppeal(null);setAppealCase(null);setKind('appeals');setCursor(null);setRefresh(n=>n+1);
   }
  }catch(e){
   if(sameSession(await authClient.getSession(),session)){
    setError(domainErrorMessage(e));
    if(e instanceof DomainClientError&&(
     ['invalid_request','operation_conflict'].includes(e.code)||
     (!wasRetry&&['resource_not_found','appeal_pending','rate_limited','verification_required','consent_required'].includes(e.code))
    ))setPendingAppeal(null);
   }
  }finally{if(sameSession(await authClient.getSession(),session))setBusy(false);}
 };
 return <section className="card ft-access"><p><Link to="/account">← Аккаунт</Link></p><h2>Безопасность и обращения</h2><p>Блокировка сразу прекращает новые обращения к профилю. Жалоба передаётся на рассмотрение и сама по себе не налагает санкцию.</p><p><Link to="/access">Мои блокировки и разрешения</Link></p>
  {targetId&&z.uuid().safeParse(targetId).success&&<><h3>Обращение о профиле</h3><p>Описание и выбранное доступное тебе поле увидит модератор. Не добавляй документы, точный адрес и лишние сведения о других людях.</p><label>Причина<select value={reason} disabled={busy||!!pendingReport} onChange={e=>setReason(e.target.value as keyof typeof REPORT_REASONS)}>{Object.entries(REPORT_REASONS).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><label>Что произошло<textarea value={note} rows={5} maxLength={1000} disabled={busy||!!pendingReport} onChange={e=>setNote(e.target.value)}/></label><label>Поле профиля для рассмотрения<select value={field} disabled={busy||!!pendingReport} onChange={e=>setField(e.target.value)}><option value="">Не прикладывать поле</option>{Object.entries(PROFILE_FIELDS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><p>Закрытые или недоступные тебе сведения не прикладываются.</p><button type="button" disabled={busy||!!pendingAppeal} onClick={()=>void report()}>{pendingReport?'Повторить прежнюю жалобу':'Отправить обращение'}</button></>}
  {pendingReport&&<p role="status">Исход жалобы пока неизвестен. Сервер мог её принять. Повтор использует те же сведения и номер операции.</p>}
  {own?.restriction&&<article className="ft-permission"><h3>{own.restriction.active?'Публичное участие ограничено':'Ограничение не действует'}</h3><p>До {new Date(own.restriction.expiresAt).toLocaleDateString('ru')} · {({policy:'Правила сервиса',abuse:'Нарушение правил общения',age:'Проверка совершеннолетия',illegal:'Недопустимый материал'})[own.restriction.reason]}</p><label>Апелляция<textarea rows={5} maxLength={1000} disabled={busy||!!pendingAppeal||!!pendingReport} value={appealText} onChange={e=>{setAppealText(e.target.value);if(!appealCase)setAppealCase(own.restriction!.caseId);}}/></label>{changedCase&&!pendingAppeal&&<p role="alert">Случай ограничения изменился. Текст сохранён для прежнего случая. <button type="button" disabled={busy} onClick={()=>{setAppealCase(own.restriction!.caseId);}}>Использовать текст для текущего случая</button></p>}{!pendingAppeal&&<button type="button" disabled={busy||!!pendingReport||changedCase||!appealText.trim()} onClick={()=>void appeal()}>Запросить пересмотр</button>}</article>}
  {pendingAppeal&&<div className="ft-moderation-recovery" role="status"><p>Исход апелляции пока неизвестен. Сервер мог её принять. Даже если ограничение изменилось, повтор сохраняет прежний текст и номер операции.</p><button type="button" disabled={busy||!!pendingReport} onClick={()=>void appeal()}>Повторить прежнюю апелляцию</button></div>}
  <h3>Мои обращения</h3><div className="ft-form-actions"><button type="button" disabled={busy||loading} aria-current={kind==='reports'?'page':undefined} onClick={()=>{setKind('reports');setCursor(null);}}>Жалобы</button><button type="button" disabled={busy||loading} aria-current={kind==='appeals'?'page':undefined} onClick={()=>{setKind('appeals');setCursor(null);}}>Апелляции</button></div>
  {loading&&<p role="status">Загружаем обращения…</p>}{own?.items.length===0&&<p>Обращений пока нет.</p>}{own?.items.map(r=><article className="ft-permission" key={r.id}><p>{stateLabels[r.state]} · {new Date(r.createdAt).toLocaleDateString('ru')}</p><small>Номер обращения: {r.caseId}</small></article>)}
  <div className="ft-form-actions"><button type="button" disabled={busy||loading} onClick={()=>{setRefresh(n=>n+1);setCursor(null);}}>Обновить</button>{own?.nextCursor&&<button type="button" disabled={busy||loading} onClick={()=>setCursor(own.nextCursor)}>Следующие</button>}{cursor&&<button type="button" disabled={busy||loading} onClick={()=>setCursor(null)}>В начало</button>}</div>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {blocker.state==='blocked'&&<AppDialog title={pendingAppeal?'Апелляция ещё не подтверждена':'Жалоба ещё не подтверждена'} onClose={()=>blocker.reset()}>
   <p>Ответ сервера мог потеряться. Повтори прежнее обращение с тем же номером операции.</p>
   <div className="ft-form-actions"><button type="button" disabled={busy} onClick={()=>{blocker.reset();if(pendingAppeal)void appeal();else void report();}}>{pendingAppeal?'Повторить прежнюю апелляцию':'Повторить прежнюю жалобу'}</button><button type="button" onClick={()=>blocker.reset()}>Остаться</button></div>
  </AppDialog>}
 </section>;
}
