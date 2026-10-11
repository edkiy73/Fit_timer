import {useEffect,useRef,useState} from 'react';
import {Link,useBlocker,useNavigate,useParams} from 'react-router';
import {z} from 'zod';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import type {AuthSession} from '@appbase/core/auth.js';
import {domainRequest,domainErrorMessage} from './domain-api';
import {attemptResponse,testsResponse,type Answers,type TestAttempt,type TestQuestion} from './questionnaire-model';
import type {TestsCommand} from '../../lib/feture/questionnaires';
import {AppDialog} from './components/primitives';
export function QuestionChoice({question,value,onChange,disabled=false}:{question:TestQuestion;value:string[]|null|undefined;onChange:(next:string[]|null)=>void;disabled?:boolean}){
 return <fieldset className="ft-question-choice" disabled={disabled}><legend>{question.prompt}</legend><p className="muted">{question.kind==='multi'?'Можно выбрать несколько вариантов.':'Выбери один вариант.'} Любой вопрос можно пропустить.</p>
  {question.options.map(o=><label className="ft-consent-choice" key={o.id}><input type={question.kind==='multi'?'checkbox':'radio'} name={question.id} value={o.id} checked={value?.includes(o.id)??false} onChange={()=>{if(question.kind==='multi'){const next=value?.includes(o.id)?value.filter(id=>id!==o.id):[...(value||[]),o.id];onChange(next.length?next:null);}else onChange([o.id]);}}/>{o.label}</label>)}
  <button type="button" onClick={()=>onChange(null)} aria-pressed={value===null}>Пропустить вопрос</button>
 </fieldset>;
}
export function QuestionnairesPage(){const auth=useOptionalAuth(),{attemptId}=useParams();
 if(auth.loading)return <p role="status">Загружаем аккаунт…</p>;
 if(!auth.session)return <section className="card"><p><Link to="/explore">← Исследовать</Link></p><h2>Вопросы к себе</h2><p>Короткие опросники помогают заметить, что тебе подходит сейчас. Здесь нет правильных ответов: можно пропускать вопросы, сохранять прохождение и возвращаться позже.</p><p>Ответы и результаты остаются только у тебя. Они не означают согласия на какие-либо действия.</p><Link to="/account">Войти и сохранить ответы</Link></section>;
 return <TestsAccount key={auth.session.email+auth.session.deviceId+auth.session.syncToken+(attemptId||'')} session={auth.session} attemptId={attemptId}/>;
}
function TestsAccount({session,attemptId}:{session:AuthSession;attemptId:string|undefined}){
 const navigate=useNavigate();const [list,setList]=useState<z.infer<typeof testsResponse>|null>(null),[attempt,setAttempt]=useState<TestAttempt|null>(null),[answers,setAnswers]=useState<Answers>({}),[position,setPosition]=useState(0),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const operation=useRef<TestsCommand|null>(null),live=useRef(true),navigationPermit=useRef(false);const blocker=useBlocker(()=>dirty&&!navigationPermit.current);
 useEffect(()=>{live.current=true;return ()=>{live.current=false;};},[]);
 useEffect(()=>{const abort=new AbortController();setBusy(true);setError('');const load=async()=>{if(attemptId){const data=await domainRequest(session,{action:'tests.read',attemptId},attemptResponse,abort.signal);if(!abort.signal.aborted){setAttempt(data.attempt);setAnswers(data.attempt.answers);setPosition(data.attempt.position);setDirty(false);operation.current=null;}}else{const data=await domainRequest(session,{action:'tests.list'},testsResponse,abort.signal);if(!abort.signal.aborted)setList(data);}};
  void load().catch(e=>{if(!abort.signal.aborted)setError(domainErrorMessage(e));}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});return ()=>abort.abort();
 },[session,attemptId,refresh]);
 useEffect(()=>{const warning=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warning);return ()=>window.removeEventListener('beforeunload',warning);},[dirty]);
 const save=async(complete=false)=>{if(!attempt||busy)return false;setBusy(true);setError('');setNotice('');
  const command=operation.current||{action:complete?'tests.complete':'tests.save',attemptId:attempt.id,operationId:crypto.randomUUID(),expectedRevision:attempt.revision,answers,position} satisfies TestsCommand;operation.current=command;
  try{const data=await domainRequest(session,command,attemptResponse);if(!live.current)return false;setAttempt(data.attempt);setAnswers(data.attempt.answers);setPosition(data.attempt.position);setDirty(false);operation.current=null;setNotice(data.attempt.status==='completed'?'Результат сохранён.':'Ответы сохранены. Можно продолжить позже.');return true;}catch(e){if(live.current)setError(domainErrorMessage(e));return false;}finally{if(live.current)setBusy(false);}
 };
 const start=async(testId:string)=>{if(busy)return;setBusy(true);setError('');const command=operation.current||{action:'tests.start',testId,operationId:crypto.randomUUID()} satisfies TestsCommand;operation.current=command;
  try{const data=await domainRequest(session,command,attemptResponse);if(live.current){operation.current=null;navigate('/tests/'+data.attempt.id);}}catch(e){if(live.current)setError(domainErrorMessage(e));}finally{if(live.current)setBusy(false);}
 };
 const remove=async()=>{if(!attempt||busy||!window.confirm('Удалить это прохождение и результат? Ответы восстановить нельзя.'))return;setBusy(true);setError('');const command=operation.current||{action:'tests.delete',attemptId:attempt.id,operationId:crypto.randomUUID(),expectedRevision:attempt.revision} satisfies TestsCommand;operation.current=command;
  try{await domainRequest(session,command,z.object({ok:z.literal(true),deleted:z.literal(true),requestId:z.uuid()}).strict());if(live.current){operation.current=null;navigationPermit.current=true;setDirty(false);setAttempt(null);navigate('/tests');}}catch(e){if(live.current)setError(domainErrorMessage(e));}finally{if(live.current)setBusy(false);}
 };
 const update=(value:string[]|null)=>{if(!attempt)return;const q=attempt.version.definition.questions[position]!;setAnswers(a=>({...a,[q.id]:value}));setDirty(true);operation.current=null;setNotice('');};
 const move=(step:number)=>{setPosition(step);setDirty(true);setNotice('');};
 const def=attempt?.version.definition,q=def?.questions[position];
 return <section className="card ft-questionnaires"><p><Link to="/explore">← Исследовать</Link>{attemptId&&<> · <Link to="/tests">Все опросники</Link></>}</p><h2>{def?.title||'Вопросы к себе'}</h2><p>{def?.description||'Исследуй желания, условия комфорта и темп. Ответы приватны; результат не меняет карту и не заменяет разговор о согласии.'}</p>
  {list&&!attemptId&&<><div className="ft-questionnaire-grid">{list.versions.map(v=><article className="card" key={v.id}><h3>{v.definition.title}</h3><p>{v.definition.description}</p><p className="muted">{v.definition.questions.length} вопросов · Можно пропускать</p><button type="button" disabled={busy||!!operation.current} onClick={()=>void start(v.testId)}>{list.attempts.some(a=>a.testId===v.testId&&a.status==='draft')?'Продолжить':'Начать'}</button></article>)}</div>{list.versions.length===0&&<p>Пока нет опубликованных опросников.</p>}
   {list.attempts.length>0&&<><h3>Мои прохождения</h3><ul>{list.attempts.map(a=><li key={a.id}><Link to={'/tests/'+a.id}>{a.title}</Link> · {a.status==='draft'?'Можно продолжить':'Результат'} · {new Date(a.updatedAt).toLocaleDateString('ru')}</li>)}</ul></>}
  </>}
  {attempt?.status==='draft'&&q&&<><p className="muted">Вопрос {position+1} из {def!.questions.length} · Рассмотрено {Object.keys(answers).length}</p><progress value={Object.keys(answers).length} max={def!.questions.length} aria-label="Рассмотренные вопросы"/>
   <QuestionChoice key={q.id} question={q} value={answers[q.id]} disabled={busy||!!operation.current} onChange={update}/>
   <div className="ft-form-actions"><button type="button" disabled={busy||!!operation.current||position===0} onClick={()=>move(position-1)}>Назад</button>{position<def!.questions.length-1&&<button type="button" disabled={busy||!!operation.current} onClick={()=>move(position+1)}>Дальше</button>}<button type="button" disabled={busy||!dirty} onClick={()=>void save()}>Сохранить и продолжить позже</button><button type="button" disabled={busy||!!operation.current||def!.questions.some(q=>!Object.hasOwn(answers,q.id))} onClick={()=>void save(true)}>Завершить</button></div>
   <p className="muted">Перед завершением ответь или выбери «Пропустить» у каждого вопроса.</p>
  </>}
  {attempt?.status==='completed'&&attempt.result&&<><p>Результат описывает твои ответы сейчас. Это не диагноз, обещание поведения или согласие на конкретный опыт.</p>{attempt.result.dimensions.map(dim=>{const label=def!.dimensions.find(d=>d.id===dim.id)?.title;return <article className="card" key={dim.id}><h3>{label}</h3><p>{dim.interpretation}</p><p className="muted">Учтено {dim.answered} из {dim.total} ответов. Пропуски не считаются отказом.</p><details><summary>Почему такой вывод</summary>{dim.questionIds.map(id=>{const question=def!.questions.find(q=>q.id===id)!;return <p key={id}><strong>{question.prompt}</strong><br/>{question.options.filter(o=>attempt.answers[id]?.includes(o.id)).map(o=>o.label).join(', ')}</p>;})}{dim.questionIds.length===0&&<p>В этом направлении все вопросы пропущены.</p>}</details></article>;})}<button type="button" disabled={busy||!!operation.current} onClick={()=>void start(attempt.version.testId)}>Пройти заново</button><p className="muted">Новое прохождение сохранится отдельно. Старый результат останется прежним.</p></>}
  {attempt&&<p><button type="button" disabled={busy||!!operation.current} onClick={()=>void remove()}>Удалить прохождение</button></p>}
  {busy&&<p role="status">Сохраняем или загружаем…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {error&&<div className="ft-form-actions">{operation.current&&<button type="button" disabled={busy} onClick={()=>{const c=operation.current;if(c?.action==='tests.start')void start(c.testId);else if(c?.action==='tests.delete')void remove();else void save(c?.action==='tests.complete');}}>Повторить то же действие</button>}<button type="button" disabled={busy} onClick={()=>{if(!dirty&&!operation.current||window.confirm('Загрузить сохранённые ответы? Несохранённые изменения в форме будут потеряны.')){operation.current=null;setRefresh(n=>n+1);}}}>Загрузить сохранённое</button><Link to="/verification">Подтвердить совершеннолетие</Link><Link to="/documents">Правила и согласия</Link></div>}
  {blocker.state==='blocked'&&<AppDialog title="Сохранить ответы перед выходом?" onClose={()=>blocker.reset()}><p>Изменения ещё не подтверждены. Можно сохранить прохождение и вернуться позже.</p><div className="ft-form-actions"><button type="button" disabled={busy} onClick={()=>void save().then(ok=>{if(ok)blocker.proceed();})}>Сохранить и уйти</button><button type="button" disabled={busy} onClick={()=>blocker.reset()}>Остаться</button><button type="button" disabled={busy} onClick={()=>blocker.proceed()}>Уйти без сохранения</button></div></AppDialog>}
 </section>;
}
