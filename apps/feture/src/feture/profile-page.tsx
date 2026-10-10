import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {z} from 'zod';
import {useOptionalAuth} from '@appbase/ui-react/auth.js';
import type {AuthSession} from '@appbase/core/auth.js';
import {authClient} from '../auth';
import {domainRequest,domainErrorMessage} from './domain-api';
import {sameSession} from './interest-api';
const dataSchema=z.object({nickname:z.string().max(80),about:z.string().max(2000),pronouns:z.string().max(160),identity:z.string().max(160),orientation:z.string().max(160),relationships:z.string().max(160),city:z.string().max(120)}).strict();
const profileSchema=z.object({id:z.uuid(),data:dataSchema,revision:z.number().int().positive(),updatedAt:z.iso.datetime({offset:true})}).strict();
const readSchema=z.object({ok:z.literal(true),profile:profileSchema.nullable(),requestId:z.uuid()}).strict();
const saveSchema=z.object({ok:z.literal(true),profile:profileSchema,replayed:z.boolean(),requestId:z.uuid()}).strict();
type Data=z.infer<typeof dataSchema>;
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
export function ProfilePage(){const auth=useOptionalAuth();if(auth.loading)return <p role="status">Загружаем аккаунт…</p>;if(!auth.session)return <section className="card"><h2>Личный профиль</h2><p>Начни с карты интересов; длинная анкета не нужна. Сохрани профиль в своём аккаунте, когда будет удобно.</p><Link to="/explore">Открыть карту</Link><p><Link to="/account">Войти</Link></p></section>;return <ProfileEditor key={auth.session.email+':'+auth.session.deviceId+':'+auth.session.syncToken} session={auth.session}/>;}
function ProfileEditor({session}:{session:AuthSession}){
 const [data,setData]=useState<Data>(empty),[revision,setRevision]=useState(0),[step,setStep]=useState(0),[loaded,setLoaded]=useState(false),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 // Retain the exact operation after a lost response. Editing creates a new operation.
 const [operation,setOperation]=useState<string|null>(null);
 useEffect(()=>{const controller=new AbortController();setLoaded(false);setError('');setBusy(true);
  domainRequest(session,{action:'profile.read'},readSchema,controller.signal).then(result=>{if(!controller.signal.aborted){setData(result.profile?.data||empty);setRevision(result.profile?.revision||0);setDirty(false);setOperation(null);setLoaded(true);}}).catch(e=>{if(!controller.signal.aborted)setError(domainErrorMessage(e));}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return ()=>controller.abort();
 },[session,refresh]);
 const save=async()=>{if(!loaded||busy||!dirty)return;setBusy(true);setError('');setNotice('');const id=operation||crypto.randomUUID();setOperation(id);
  try{const result=await domainRequest(session,{action:'profile.save',operationId:id,expectedRevision:revision,data},saveSchema);if(!sameSession(await authClient.getSession(),session))return;setData(result.profile.data);setRevision(result.profile.revision);setDirty(false);setOperation(null);setNotice('Профиль сохранён в аккаунте.');}
  catch(e){if(sameSession(await authClient.getSession(),session))setError(domainErrorMessage(e));}finally{if(sameSession(await authClient.getSession(),session))setBusy(false);}
 };
 const field=fields[step]!;
 const change=(value:string)=>{setData(current=>({...current,[field.key]:value}));setDirty(true);setOperation(null);setNotice('');};
 return <section className="card ft-profile"><p><Link to="/account">← Аккаунт</Link></p><h2>Твой профиль</h2><p>Все поля можно пропустить. Сначала разберись в себе; знакомства включаются отдельно. Эти сведения сейчас видны только тебе.</p><p><Link to="/explore">Перейти к карте интересов</Link></p>
  {loaded&&<><nav className="ft-form-actions" aria-label="Поля профиля">{fields.map((f,i)=><button type="button" key={f.key} disabled={busy} aria-current={i===step?'step':undefined} onClick={()=>setStep(i)}>{i+1}. {f.label}</button>)}</nav>
   <p className="muted">Шаг {step+1} из {fields.length}</p><label>{field.label}{field.key==='about'?<textarea value={data[field.key]} rows={6} maxLength={field.max} disabled={busy} onChange={e=>change(e.target.value)}/>:<input value={data[field.key]} maxLength={field.max} disabled={busy} onChange={e=>change(e.target.value)}/>}</label><p className="muted">{field.hint}</p>
   <div className="ft-form-actions"><button type="button" disabled={busy||step===0} onClick={()=>setStep(s=>s-1)}>Назад</button>{step<fields.length-1&&<button type="button" disabled={busy} onClick={()=>setStep(s=>s+1)}>{data[field.key]?'Дальше':'Пропустить'}</button>}<button type="button" disabled={!dirty||busy} onClick={()=>void save()}>{busy?'Сохраняем…':'Сохранить профиль'}</button></div>
  </>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {(!loaded||error)&&<div className="ft-form-actions"><button type="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Загрузить профиль из аккаунта? Изменения в форме будут потеряны.'))setRefresh(n=>n+1);}}>Обновить профиль</button><Link to="/verification">Подтвердить совершеннолетие</Link><Link to="/documents">Правила и согласия</Link></div>}
 </section>;
}
