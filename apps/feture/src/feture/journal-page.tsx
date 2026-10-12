import {useEffect,useRef,useState} from 'react';
import {Link,useBlocker} from 'react-router';
import {z} from 'zod';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import type {AuthSession} from '@appbase/core/auth.js';
import {domainRequest,domainErrorMessage,DomainClientError} from './domain-api';
import {authClient} from '../auth';
import {sameSession} from './interest-api';
import {interestStateSchema,interestSummary,type InterestRecord} from './model';
import catalog from '../../data/concept-catalog.json';
import {AppDialog} from './components/primitives';
import './journal.css';
import {testsResponse} from './questionnaire-model';
const cursorSchema=z.object({at:z.iso.datetime({offset:true}),id:z.uuid()}).strict();
const entrySchema=z.object({id:z.uuid(),title:z.string().max(160),text:z.string().max(3000),topicId:z.string().nullable(),deleted:z.boolean(),revision:z.number().int().positive(),createdAt:z.iso.datetime({offset:true}),updatedAt:z.iso.datetime({offset:true})}).strict();
const interestSchema=interestStateSchema.safeExtend({interestId:z.string(),revision:z.number().int().positive(),updatedAt:z.iso.datetime({offset:true}),source:z.enum(['manual','test']),testVersion:z.uuid().nullable(),deleted:z.boolean()});
const historySchema=z.object({id:z.uuid(),interestId:z.string(),revision:z.number().int().positive(),createdAt:z.iso.datetime({offset:true}),entry:interestSchema}).strict();
const listSchema=z.object({ok:z.literal(true),items:z.array(entrySchema).max(30),nextCursor:cursorSchema.nullable(),requestId:z.uuid()}).strict();
const historyListSchema=z.object({ok:z.literal(true),items:z.array(historySchema).max(30),nextCursor:cursorSchema.nullable(),requestId:z.uuid()}).strict();
const savedSchema=z.object({ok:z.literal(true),entry:entrySchema,replayed:z.boolean(),requestId:z.uuid()}).strict();
const readSchema=z.object({ok:z.literal(true),entry:entrySchema,requestId:z.uuid()}).strict();
const clearedSchema=z.object({ok:z.literal(true),cleared:z.number().int().nonnegative(),replayed:z.boolean(),requestId:z.uuid()}).strict();
type Entry=z.infer<typeof entrySchema>;type History=z.infer<typeof historySchema>;type Cursor=z.infer<typeof cursorSchema>;
type Mutation=
 | {action:'journal.save';id:string;operationId:string;expectedRevision:number;title:string;text:string;topicId:string|null}
 | {action:'journal.delete';id:string;operationId:string;expectedRevision:number}
 | {action:'history.clear';operationId:string};
const rejectedCodes=new Set(['verification_required','consent_required','forbidden','resource_not_found','revision_conflict','operation_conflict','invalid_request','rate_limited','journal_limit']);
// These SQL outcomes occur after operation-ledger lookup, including on retry.
const terminalRetryCodes=new Set(['revision_conflict','resource_not_found','journal_limit']);
type Draft={id:string;title:string;text:string;topicId:string|null;revision:number};
const topics=catalog.categories.flatMap(c=>c.interests);
const date=(s:string)=>new Date(s).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'});
const empty=():Draft=>({id:crypto.randomUUID(),title:'',text:'',topicId:null,revision:0});
export function JournalPage(){const auth=useOptionalAuth();if(auth.loading)return <p role="status">Загружаем аккаунт…</p>;if(!auth.session)return <section className="card"><h2>Личный дневник</h2><p>Место для мыслей, изменений и вопросов к себе. Без лайков и просмотров.</p><Link to="/account">Войти в свой аккаунт</Link><p><Link to="/">Мой мир</Link></p></section>;return <JournalEditor key={auth.session.email+':'+auth.session.deviceId+':'+auth.session.syncToken} session={auth.session}/>;}
function JournalEditor({session}:{session:AuthSession}){
 const [tab,setTab]=useState<'journal'|'history'|'results'>('journal'),[draft,setDraft]=useState<Draft>(empty),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [results,setResults]=useState<z.infer<typeof testsResponse>['attempts']>([]);
 const [entries,setEntries]=useState<Entry[]>([]),[history,setHistory]=useState<History[]>([]),[cursor,setCursor]=useState<Cursor|null>(null),[refresh,setRefresh]=useState(0);
 const [pending,setPending]=useState<Mutation|null>(null);
 const locked=busy||pending!==null;
 const active=useRef(true);
 const current=async()=>active.current&&sameSession(await authClient.getSession(),session);
 const blocker=useBlocker(({currentLocation,nextLocation})=>(dirty||pending!==null)&&currentLocation.pathname!==nextLocation.pathname);
 useEffect(()=>{active.current=true;return ()=>{active.current=false;};},[]);
 useEffect(()=>{if(!dirty&&!pending)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);},[dirty,pending]);
 useEffect(()=>{const controller=new AbortController();setBusy(true);setLoaded(false);setError('');setCursor(null);setEntries([]);setHistory([]);setResults([]);
  const load=async()=>{try{if(tab==='journal'){const r=await domainRequest(session,{action:'journal.list',cursor:null},listSchema,controller.signal);if(!controller.signal.aborted){setEntries(r.items);setCursor(r.nextCursor);}}else if(tab==='results'){const r=await domainRequest(session,{action:'tests.list'},testsResponse,controller.signal);if(!controller.signal.aborted)setResults(r.attempts.filter(a=>a.status==='completed'));}else{const r=await domainRequest(session,{action:'history.list',cursor:null},historyListSchema,controller.signal);if(!controller.signal.aborted){setHistory(r.items);setCursor(r.nextCursor);}}if(!controller.signal.aborted)setLoaded(true);}catch(e){if(!controller.signal.aborted)setError(domainErrorMessage(e));}finally{if(!controller.signal.aborted)setBusy(false);}};
  void load();return ()=>controller.abort();
 },[session,tab,refresh]);
 const selectTab=(next:'journal'|'history'|'results')=>{
  if(tab===next||locked)return;
  if(tab==='journal'&&dirty&&!window.confirm('Есть несохранённая запись. Перейти в другой раздел? Текст останется в форме, пока ты не закроешь дневник.'))return;
  setTab(next);
 };
 const change=(value:Partial<Draft>)=>{if(locked)return;setDraft(d=>({...d,...value}));setDirty(true);setNotice('');};
 const reset=()=>{if(locked)return;if(!dirty||window.confirm('Закрыть запись без сохранения? Текст в форме будет потерян.')){setDraft(empty());setDirty(false);setNotice('');setError('');}};
 const mutate=async(command:Mutation)=>{
  if(busy)return;
  const retry=pending!==null;setPending(command);setBusy(true);setError('');setNotice('');
  try{
   if(command.action==='history.clear'){
    await domainRequest(session,command,clearedSchema);
    if(!await current())return;
    setNotice('Очистка истории подтверждена. Изменения после этого действия остаются.');
   }else{
    const r=await domainRequest(session,command,savedSchema);
    if(!await current())return;
    if(command.action==='journal.save'){
     if(r.entry.deleted){setDraft(empty());setDirty(false);setNotice('Эта запись уже удалена.');}
     else{setDraft({...r.entry});setDirty(false);setNotice('Запись сохранена. Её видишь только ты.');}
    }else{
     if(draft.id===command.id){setDraft(empty());setDirty(false);}
     setNotice('Запись удалена.');
    }
   }
   setPending(null);setRefresh(n=>n+1);
  }catch(e){if(await current()){
   setError(domainErrorMessage(e));
   if(e instanceof DomainClientError&&(terminalRetryCodes.has(e.code)||(!retry&&rejectedCodes.has(e.code))))setPending(null);
  }}finally{if(await current())setBusy(false);}
 };
 const save=()=>{if(locked||!dirty||!draft.text.trim())return;void mutate({action:'journal.save',id:draft.id,operationId:crypto.randomUUID(),expectedRevision:draft.revision,title:draft.title,text:draft.text,topicId:draft.topicId});};
 const edit=async(entry:Pick<Entry,'id'>)=>{if(locked||dirty&&!window.confirm('Открыть другую запись? Не сохранённый текст будет потерян.'))return;setBusy(true);setError('');
  try{const r=await domainRequest(session,{action:'journal.read',id:entry.id},readSchema);if(await current()){setDraft({...r.entry});setDirty(false);setNotice('');}}catch(e){if(await current())setError(domainErrorMessage(e));}finally{if(await current())setBusy(false);}
 };
 const remove=(entry:Entry)=>{if(locked||!window.confirm('Удалить запись из дневника? Её текст будет удалён.'))return;void mutate({action:'journal.delete',id:entry.id,operationId:crypto.randomUUID(),expectedRevision:entry.revision});};
 const more=async()=>{if(locked||!cursor)return;setBusy(true);setError('');try{if(tab==='journal'){const r=await domainRequest(session,{action:'journal.list',cursor},listSchema);if(await current()){setEntries(rows=>[...rows,...r.items.filter(e=>!rows.some(v=>v.id===e.id))]);setCursor(r.nextCursor);}}else{const r=await domainRequest(session,{action:'history.list',cursor},historyListSchema);if(await current()){setHistory(rows=>[...rows,...r.items.filter(e=>!rows.some(v=>v.id===e.id))]);setCursor(r.nextCursor);}}}catch(e){if(await current())setError(domainErrorMessage(e));}finally{if(await current())setBusy(false);}};
 const clear=()=>{if(locked||!window.confirm('Удалить историю изменений карты? Текущие отметки в карте останутся.'))return;void mutate({action:'history.clear',operationId:crypto.randomUUID()});};
 return <section className="card ft-journal"><p><Link to="/">← Мой мир</Link></p><h1>Личный дневник</h1><p>Без лайков и просмотров. Записи и история доступны только тебе; партнёр и участники сообщества их не видят.</p>
  <nav className="ft-form-actions" aria-label="Личные записи"><button type="button" disabled={locked} aria-pressed={tab==='journal'} onClick={()=>selectTab('journal')}>Дневник</button><button type="button" disabled={locked} aria-pressed={tab==='history'} onClick={()=>selectTab('history')}>История карты</button><button type="button" disabled={locked} aria-pressed={tab==='results'} onClick={()=>selectTab('results')}>Результаты опросников</button></nav>
  {error&&<p role="alert">{error}</p>}{pending&&!busy&&<div className="ft-journal-draft-reminder" role="status"><strong>Результат действия пока неизвестен</strong><p>Запрос мог выполниться. Повтор отправит то же действие; до подтверждения нельзя изменить запись или покинуть дневник.</p><button type="button" onClick={()=>void mutate(pending)}>Повторить то же действие</button><p><Link to="/documents" target="_blank" rel="noopener noreferrer">Правила и согласия (в новом окне)</Link> · <Link to="/verification" target="_blank" rel="noopener noreferrer">Статус совершеннолетия (в новом окне)</Link></p></div>}{notice&&<p role="status">{notice}</p>}
  {dirty&&tab!=='journal'&&<div className="ft-journal-draft-reminder" role="status"><strong>Осталась несохранённая запись</strong><p>Текст не исчез: он сохранился в открытой форме дневника, но ещё не отправлен в аккаунт.</p><button type="button" disabled={locked} onClick={()=>selectTab('journal')}>Вернуться к черновику</button></div>}
  {busy&&!loaded&&<p role="status">Загружаем записи…</p>}
  {loaded&&tab==='journal'&&<><div className="ft-journal-editor"><h2>{draft.revision?'Изменить запись':'Новая запись'}</h2><label>Заголовок · необязательно<input value={draft.title} maxLength={160} disabled={locked} onChange={e=>change({title:e.target.value})}/></label><label>Твои мысли<textarea rows={8} maxLength={3000} value={draft.text} disabled={locked} onChange={e=>change({text:e.target.value})} placeholder="Что хочется запомнить или обдумать?"/></label><span className="muted">{draft.text.length} / 3000</span><label>Тема · необязательно<select value={draft.topicId||''} disabled={locked} onChange={e=>change({topicId:e.target.value||null})}><option value="">Без привязки к теме</option>{topics.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label><div className="ft-form-actions"><button type="button" disabled={locked||!dirty||!draft.text.trim()} onClick={()=>void save()}>Сохранить запись</button><button type="button" disabled={locked} onClick={reset}>{draft.revision?'Новая запись':'Очистить форму'}</button>{draft.revision>0&&<button type="button" disabled={locked} onClick={()=>void edit({id:draft.id})}>Загрузить сохранённую запись</button>}</div></div>
   <h2>Твои записи</h2>{entries.length===0&&<p className="muted">Здесь появятся сохранённые мысли. Начни с любой удобной темы.</p>}<div className="ft-journal-list">{entries.map(entry=><article key={entry.id}><p className="muted">{date(entry.createdAt)}{entry.updatedAt!==entry.createdAt?' · изменено '+date(entry.updatedAt):''}</p><h3>{entry.title||'Личная запись'}</h3><p className="ft-journal-text">{entry.text}</p>{entry.topicId&&<Link to={`/explore?interest=${encodeURIComponent(entry.topicId)}`}>{topics.find(t=>t.id===entry.topicId)?.title||'Связанная тема'}</Link>}<div className="ft-form-actions"><button type="button" disabled={locked} onClick={()=>void edit(entry)}>Изменить</button><button type="button" disabled={locked} onClick={()=>void remove(entry)}>Удалить</button></div></article>)}</div></>}
  {loaded&&tab==='history'&&<><h2>Как менялась твоя карта</h2><p>История сохраняет каждое успешное изменение. Из неё ничего не публикуется автоматически.</p>{history.length===0?<p className="muted">Пока изменений нет. Новые отметки появятся здесь после сохранения карты.</p>:<><div className="ft-journal-list">{history.map(item=><article key={item.id}><p className="muted">{date(item.createdAt)}</p><h3>{topics.find(t=>t.id===item.interestId)?.title||'Тема'}</h3><p>{item.entry.deleted?'Отметка удалена':interestSummary({...item.entry,at:item.entry.updatedAt} as InterestRecord)}</p>{!item.entry.deleted&&<><p className="muted">{item.entry.intensity?'Сила интереса: '+item.entry.intensity+' из 5 · ':''}{item.entry.visibility==='private'?'Только тебе':item.entry.visibility==='granted'?'По разрешению':'Открыто'}{item.entry.source==='test'?' · из результата теста':' · твой выбор'}</p>{item.entry.boundaryNote&&<p className="ft-journal-text">Условия: {item.entry.boundaryNote}</p>}</>}<Link to={`/explore?interest=${encodeURIComponent(item.interestId)}`}>Открыть тему</Link></article>)}</div><button type="button" disabled={locked} onClick={()=>void clear()}>Удалить историю карты</button></>}</>}
  {loaded&&tab==='results'&&<><h2>Сохранённые результаты</h2><p>Каждое прохождение остаётся отдельным. Можно открыть результат, вернуться к его объяснениям или удалить его на странице опросника.</p>{results.length===0&&<p>Завершённых опросников пока нет.</p>}<div className="ft-journal-list">{results.map(r=><article key={r.id}><h3><Link to={'/tests/'+r.id}>{r.title}</Link></h3><p className="muted">{date(r.updatedAt)}</p></article>)}</div><Link to="/tests">Вопросы к себе</Link></>}
  {loaded&&cursor&&<button type="button" disabled={locked} onClick={()=>void more()}>Показать ещё</button>}
  <div className="ft-form-actions"><button type="button" disabled={locked} onClick={()=>setRefresh(n=>n+1)}>Обновить список</button>{!loaded&&<><Link to="/verification">Подтвердить совершеннолетие</Link><Link to="/documents">Правила и согласия</Link></>}</div>
  {blocker.state==='blocked'&&<AppDialog onClose={()=>blocker.reset?.()} title={pending?"Результат действия ещё не подтверждён":"Запись ещё не сохранена"}><p>{pending?"Вернись к записи и повтори то же действие, чтобы проверить результат.":"Можно остаться и сохранить текст или выйти без сохранения."}</p><div className="ft-form-actions"><button type="button" onClick={()=>blocker.reset?.()}>Остаться</button>{!pending&&<button type="button" onClick={()=>blocker.proceed?.()}>Выйти без сохранения</button>}</div></AppDialog>}
 </section>;
}
