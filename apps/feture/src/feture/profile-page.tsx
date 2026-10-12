import {useEffect,useState} from 'react';
import {Link,useBlocker} from 'react-router';
import {z} from 'zod';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import type {AuthSession} from '@appbase/core/auth.js';
import {authClient} from '../auth';
import {domainRequest,domainErrorMessage,DomainClientError} from './domain-api';
import {sameSession} from './interest-api';
import {Icon} from './components/Icon';
import {mergeProfileDraft,profileDraftChanged} from './profile-draft';

const dataSchema=z.object({nickname:z.string().max(80),about:z.string().max(2000),pronouns:z.string().max(160),identity:z.string().max(160),orientation:z.string().max(160),relationships:z.string().max(160),city:z.string().max(120)}).strict();
const profileSchema=z.object({id:z.uuid(),data:dataSchema,revision:z.number().int().positive(),updatedAt:z.iso.datetime({offset:true})}).strict();
const readSchema=z.object({ok:z.literal(true),profile:profileSchema.nullable(),requestId:z.uuid()}).strict();
const saveSchema=z.object({ok:z.literal(true),profile:profileSchema,replayed:z.boolean(),requestId:z.uuid()}).strict();
type Data=z.infer<typeof dataSchema>;
type SaveCommand={action:'profile.save';operationId:string;expectedRevision:number;data:Data};
// Only explicit server rejections prove that this attempt did not commit.
const rejectedSaveCodes=new Set(['verification_required','consent_required','forbidden','resource_not_found','revision_conflict','document_changed','operation_conflict','invalid_request','rate_limited']);
const empty:Data={nickname:'',about:'',pronouns:'',identity:'',orientation:'',relationships:'',city:''};
const fields:readonly {key:keyof Data;label:string;hint:string;max:number}[]=[
 {key:'nickname',label:'Как тебя называть',hint:'Любое удобное имя. Оно не обязано совпадать с именем в документах.',max:80},
 {key:'about',label:'О себе',hint:'Что тебе важно и что хочется исследовать.',max:2000},
 {key:'pronouns',label:'Местоимения',hint:'Как к тебе обращаться. Можно оставить пустым.',max:160},
 {key:'identity',label:'Самоопределение',hint:'Опиши своими словами, если хочется.',max:160},
 {key:'orientation',label:'Ориентация',hint:'Необязательное личное поле. Оно не включает знакомства.',max:160},
 {key:'relationships',label:'Отношения',hint:'Какой формат тебе сейчас комфортен.',max:160},
 {key:'city',label:'Город или район',hint:'Без адреса и точной геопозиции.',max:120}
];

export function ProfilePage(){
 const auth=useOptionalAuth();
 if(auth.loading)return <section className="ft-profile-loading" role="status">Загружаем аккаунт…</section>;
 if(!auth.session)return <div className="ft-account-page ft-profile-page"><Link className="ft-profile-back" to="/account"><Icon name="back" size={18}/> Аккаунт</Link><section className="ft-account-panel ft-profile-guest"><span className="ft-account-eyebrow">Личное пространство</span><h1>Расскажи о себе, когда захочешь</h1><p>Длинная анкета не нужна. Начни с карты интересов, а профиль заполни после входа.</p><div className="ft-profile-actions"><Link className="ft-account-primary" to="/account">Войти или зарегистрироваться <Icon name="arrow" size={18}/></Link><Link className="ft-profile-secondary" to="/explore">Исследовать темы</Link></div></section></div>;
 return <ProfileEditor key={auth.session.email+':'+auth.session.deviceId+':'+auth.session.syncToken} session={auth.session}/>;
}

function ProfileEditor({session}:{session:AuthSession}){
 const [data,setData]=useState<Data>(empty),[serverData,setServerData]=useState<Data>(empty),[revision,setRevision]=useState(0),[step,setStep]=useState(0);
 const [mode,setMode]=useState<'view'|'edit'>('view'),[loaded,setLoaded]=useState(false),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[conflict,setConflict]=useState(false),[refresh,setRefresh]=useState(0);
 // Retry a save after a lost response with the exact same operation/revision/payload.
 const [operation,setOperation]=useState<SaveCommand|null>(null);
 const locked=busy||operation!==null;

 const blocker=useBlocker(({currentLocation,nextLocation})=>(dirty||locked)&&currentLocation.pathname!==nextLocation.pathname);
 useEffect(()=>{
  if(blocker.state!=='blocked')return;
  if(locked){window.alert('Результат сохранения ещё не подтверждён. Повтори сохранение, прежде чем покинуть профиль.');blocker.reset();return;}
  if(window.confirm('Есть несохранённые изменения. Покинуть профиль и потерять их?'))blocker.proceed();
  else blocker.reset();
 },[blocker.state,locked]);
 useEffect(()=>{
  if(!dirty&&!locked)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return ()=>window.removeEventListener('beforeunload',warn);
 },[dirty,locked]);

 useEffect(()=>{
  const controller=new AbortController();setLoaded(false);setError('');setNotice('');setConflict(false);setBusy(true);
  domainRequest(session,{action:'profile.read'},readSchema,controller.signal).then(result=>{
   if(controller.signal.aborted)return;
   const next=result.profile?.data||empty;
   setData(next);setServerData(next);setRevision(result.profile?.revision||0);setDirty(false);setOperation(null);setMode('view');setLoaded(true);
  }).catch(e=>{if(!controller.signal.aborted)setError(domainErrorMessage(e));})
    .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
  return ()=>controller.abort();
 },[session,refresh]);

 const save=async()=>{
  if(!loaded||busy||!dirty)return;
  setBusy(true);setError('');setNotice('');setConflict(false);
  const command=operation||{action:'profile.save' as const,operationId:crypto.randomUUID(),expectedRevision:revision,data:{...data}};setOperation(command);
  try{
   const result=await domainRequest(session,command,saveSchema);
   if(!sameSession(await authClient.getSession(),session))return;
   setData(result.profile.data);setServerData(result.profile.data);setRevision(result.profile.revision);setDirty(false);setOperation(null);setMode('view');
   setNotice('Профиль сохранён в аккаунте.');
  }catch(e){
   if(sameSession(await authClient.getSession(),session)){
    setError(domainErrorMessage(e));
    // A preflight denial on retry cannot establish the earlier attempt's outcome.
    // SQL checks the operation ledger before revision_conflict, so that result is definite.
    if(e instanceof DomainClientError&&(e.code==='revision_conflict'||(!operation&&rejectedSaveCodes.has(e.code))))setOperation(null);
    setConflict(e instanceof DomainClientError && (e.code==='revision_conflict'||e.code==='document_changed'));
   }
  }finally{if(sameSession(await authClient.getSession(),session))setBusy(false);}
 };

 const reconcile=async()=>{
  if(!loaded||locked)return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await domainRequest(session,{action:'profile.read'},readSchema);
   if(!sameSession(await authClient.getSession(),session))return;
   const latest=result.profile?.data||empty;
   // Retain edited fields while accepting untouched remote updates.
   const merged=mergeProfileDraft(serverData,data,latest,fields.map(field=>field.key));
   setData(merged);setServerData(latest);setRevision(result.profile?.revision||0);
   setDirty(profileDraftChanged(latest,merged,fields.map(field=>field.key)));setOperation(null);setConflict(false);
   setNotice('Версия аккаунта обновлена. Твои правки остались в форме — проверь их перед сохранением.');
  }catch(e){if(sameSession(await authClient.getSession(),session))setError(domainErrorMessage(e));}
  finally{if(sameSession(await authClient.getSession(),session))setBusy(false);}
 };

 const change=(value:string)=>{
  if(locked)return;
  const key=fields[step]!.key;
  const next={...data,[key]:value};
  setData(next);setDirty(profileDraftChanged(serverData,next,fields.map(field=>field.key)));
  setOperation(null);setConflict(false);setError('');setNotice('');
 };
 const cancel=()=>{
  if(locked)return;
  if((dirty||operation)&&!window.confirm('Отменить изменения профиля? Введённый текст не сохранится.'))return;
  setData(serverData);setDirty(false);setOperation(null);setConflict(false);setError('');setMode('view');
 };
 const reload=()=>{
  if(locked)return;
  if((dirty||operation)&&!window.confirm('Загрузить профиль из аккаунта? Несохранённые изменения будут потеряны.'))return;
  setRefresh(n=>n+1);
 };
 const field=fields[step]!;
 const filled=fields.filter(f=>Boolean(data[f.key].trim())).length;

 return <div className="ft-account-page ft-profile-page">
  <div className="ft-profile-header"><Link className="ft-profile-back" to="/account"><Icon name="back" size={18}/> Аккаунт</Link><span className="ft-account-eyebrow">Только для тебя</span></div>
  <div className="ft-profile-intro"><div><h1>Твой профиль</h1><p>Рассказывай о себе столько, сколько комфортно. Каждое поле можно пропустить; знакомства включаются отдельно.</p></div><Link className="ft-profile-explore" to="/explore"><Icon name="compass" size={18}/> Карта интересов</Link></div>
  {!loaded ? <section className="ft-account-panel ft-profile-loading" role="status">{busy?'Открываем личный профиль…':'Не удалось загрузить профиль.'}</section> :
   mode==='view' ? <div className="ft-profile-overview">
    <section className="ft-profile-summary"><span className="ft-profile-summary-icon"><Icon name="lock" size={24}/></span><h2>Твоё пространство</h2><p>Эти сведения сейчас видны только тебе. Можно начать с одного поля.</p><span className="ft-profile-filled">{filled===0?'Пока ничего не заполнено':'Заполнено полей: '+filled+' из '+fields.length}</span><button className="ft-account-primary" type="button" onClick={()=>{setStep(0);setMode('edit');}}>{filled?'Редактировать профиль':'Начать с любого поля'} <Icon name="arrow" size={18}/></button></section>
    <section className="ft-account-panel ft-profile-list" aria-label="Сведения профиля">{fields.map((f,i)=><button key={f.key} type="button" className="ft-profile-overview-field" onClick={()=>{setStep(i);setMode('edit');}}><span><strong>{f.label}</strong><small>{data[f.key]||'Можно заполнить позже'}</small></span><Icon name="arrow" size={17}/></button>)}</section>
   </div> : <div className="ft-profile-editor">
    <nav className="ft-profile-step-nav" aria-label="Поля профиля">{fields.map((f,i)=><button key={f.key} type="button" aria-current={step===i?'step':undefined} className={step===i?'active':''} disabled={locked} onClick={()=>setStep(i)}><span>{i+1}</span>{f.label}</button>)}</nav>
    <section className="ft-account-panel ft-profile-edit-card" aria-labelledby="ft-profile-edit-title">
     <div className="ft-profile-progress"><span>Поле {step+1} из {fields.length}</span>{dirty&&<span>Есть несохранённые изменения</span>}</div>
     <label className="ft-profile-mobile-select">Выбери поле<select value={step} disabled={locked} onChange={event=>setStep(Number(event.target.value))}>{fields.map((f,i)=><option key={f.key} value={i}>{f.label}</option>)}</select></label>
     <h2 id="ft-profile-edit-title">{field.label}</h2><p className="ft-profile-hint">{field.hint}</p>
     <label className="ft-profile-field">{field.label}
      {field.key==='about'?<textarea value={data[field.key]} rows={5} maxLength={field.max} disabled={locked} onChange={event=>change(event.target.value)}/>:<input value={data[field.key]} maxLength={field.max} disabled={locked} onChange={event=>change(event.target.value)}/>}
     </label>
     <div className="ft-profile-progress"><span>Можно оставить пустым</span><span>{data[field.key].length} / {field.max}</span></div>
     <div className="ft-profile-actions ft-profile-steps"><button type="button" className="ft-profile-secondary" disabled={locked||step===0} onClick={()=>setStep(n=>n-1)}>Назад</button>{step<fields.length-1&&<button type="button" className="ft-profile-secondary" disabled={locked} onClick={()=>setStep(n=>n+1)}>{data[field.key].trim()?'Дальше':'Пропустить'} <Icon name="arrow" size={17}/></button>}</div>
     <div className="ft-profile-actions ft-profile-savebar"><button className="ft-profile-secondary" type="button" disabled={locked} onClick={cancel}>Отмена</button><button className="ft-account-primary" type="button" disabled={!dirty||busy} onClick={()=>void save()}>{busy?'Сохраняем…':operation&&error?'Повторить сохранение':'Сохранить профиль'} <Icon name="check" size={17}/></button></div>
    </section>
   </div>}
  {error&&<div className="ft-profile-feedback" role="alert"><strong>{operation?'Результат сохранения пока неизвестен':'Не получилось'}</strong><p>{error}</p>{operation&&<p>Повтори сохранение: отправятся те же правки. До подтверждения результата они остаются в форме.</p>}{conflict&&<button type="button" disabled={locked} onClick={()=>void reconcile()}>Обновить версию, сохранив мои правки</button>}</div>}
  {notice&&<p className="ft-profile-feedback success" role="status">{notice}</p>}
  <div className="ft-profile-utility"><button type="button" disabled={locked} onClick={reload}>Загрузить данные из аккаунта</button><Link to="/verification" target={operation?'_blank':undefined} rel={operation?'noopener noreferrer':undefined}>Статус совершеннолетия{operation?' (в новом окне)':''}</Link><Link to="/documents" target={operation?'_blank':undefined} rel={operation?'noopener noreferrer':undefined}>Правила и согласия{operation?' (в новом окне)':''}</Link></div>
 </div>;
}
