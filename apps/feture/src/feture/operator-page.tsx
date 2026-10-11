import {useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router';
import {SignInForm,useOptionalAuth} from '@appbase/ui-react/auth.js';
import type {AuthSession} from '@appbase/core/auth.js';
import {authClient} from '../auth';
import {apiUrl} from '../api-url';
import {createOperatorClient,operatorStatus,operatorLabels} from './operator-api';
import {OperatorsAdmin} from './operators-admin';
import {PostReviewAdmin} from './post-review-admin';
import {QaAdultAdmin} from './qa-adult-admin';

function Workspace({session}:{session:AuthSession}){
 const [data,setData]=useState<ReturnType<typeof operatorStatus.parse>|null>(null);
 const [error,setError]=useState(''),[attempt,setAttempt]=useState(0),[tab,setTab]=useState<'qa'|'operators'|'posts'>('qa');
 const epoch=useRef(0);
 const client=useMemo(()=>createOperatorClient(apiUrl('/api/admin'),session,()=>authClient.getSession(),(input,init)=>globalThis.fetch(input,init),()=>{epoch.current++;setData(null);setError('Сессия или права изменились. Проверь вход и обнови доступ.');}),[session]);
 useEffect(()=>{
  let live=true;
  const load=()=>{const ticket=++epoch.current;setData(null);setError('');void client.action('','feture.operators.status').then(x=>{if(live&&ticket===epoch.current)setData(operatorStatus.parse(x));}).catch(()=>{if(live&&ticket===epoch.current){setData(null);setError('Не удалось проверить права. Проверь соединение и вход, затем повтори.');}});};
  load();
  // Recheck server rights on return to this tab; never restore an old permission snapshot.
  const visible=()=>{if(document.visibilityState==='visible')load();};
  window.addEventListener('focus',load);document.addEventListener('visibilitychange',visible);
  return()=>{live=false;epoch.current++;window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',visible);};
 },[client,attempt]);
 return <>
  <p>Рабочий аккаунт: {session.email}</p>
  {error?<><p role="alert">{error}</p><button onClick={()=>setAttempt(n=>n+1)}>Проверить доступ снова</button></>:!data?<p role="status">Проверяю права…</p>:!data.role?<><p role="status">Для этого аккаунта не назначена рабочая роль. Попроси управляющего назначить её по email.</p>{!data.initialized&&<p>Первого управляющего владелец назначает в общей админке, войдя также в свой личный аккаунт.</p>}<button onClick={()=>setAttempt(n=>n+1)}>Обновить доступ</button></>:<>
   <p>Твоя роль: {operatorLabels[data.role]}.</p>
   <nav className="ft-form-actions" aria-label="Разделы рабочего экрана"><button aria-pressed={tab==='qa'} onClick={()=>setTab('qa')}>Допуски и журнал QA</button>{data.role!=='qa_operator'&&<button aria-pressed={tab==='operators'} onClick={()=>setTab('operators')}>{data.role==='manager'?'Операторы и права':'Журнал назначений'}</button>}{data.role!=='qa_operator'&&<button aria-pressed={tab==='posts'} onClick={()=>setTab('posts')}>Публикации</button>}</nav>
   {tab==='posts'&&data.role!=='qa_operator'?<PostReviewAdmin client={client} readOnly={data.role==='auditor'}/>:tab==='operators'&&data.role!=='qa_operator'?<OperatorsAdmin client={client} adminKey="" locale="ru"/>:<QaAdultAdmin client={client} adminKey="" locale="ru" readOnly={data.role==='auditor'}/>}
  </>}
 </>;
}

export function OperatorPage(){
 const auth=useOptionalAuth();
 return <section className="card ft-access ft-operator-page" aria-labelledby="operator-title">
  <h2 id="operator-title">Рабочий экран FetUre</h2>
  <p>Публикации, временные допуски 18+ и журнал решений. Вход через личный аккаунт; общий админ-ключ не требуется.</p>
  {auth.loading?<p role="status">Проверяю вход…</p>:auth.session?<Workspace key={JSON.stringify([auth.session.email,auth.session.deviceId,auth.session.syncToken])} session={auth.session}/>:<><p>Войди в аккаунт, которому управляющий назначил рабочую роль.</p><SignInForm locale="ru" productName="FetUre" askHandle variant="inline"/></>}
  <p><Link to="/account">Аккаунт и выход</Link> · <Link to="/">Вернуться в FetUre</Link></p>
 </section>;
}
