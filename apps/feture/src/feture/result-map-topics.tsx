import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {domainRequest,domainErrorMessage} from './domain-api';
import {Link} from 'react-router';
import type {AuthSession} from '@appbase/core/auth.js';
import fallbackCatalog from '../../data/concept-catalog.json';
import {interestSummary} from './model';
import {useInterestMap} from './use-interest-map';
import type {TestAttempt} from './questionnaire-model';

// Editorially related topics, not score-to-desire or consent inferences.
// Keep these suggestions independent of test scores and private answers.
const TOPICS:Readonly<Record<string,readonly string[]>>={
 dynamics:['interest-1-4','interest-1-11','interest-1-12'],
 closeness:['interest-4-12','interest-2-7','interest-12-3'],
 sensations:['interest-3-8','interest-3-7','interest-5-10'],
 boundaries:['interest-10-3','interest-10-5','interest-10-11'],
 relationships:['interest-8-8','interest-8-12','interest-10-8'],
 pace:['interest-12-6','interest-2-6','interest-10-9']
};
const categoryByInterest=new Map(fallbackCatalog.categories.flatMap(category=>
 category.interests.map(topic=>[topic.id,{category:category.id,title:topic.title}] as const)));

export function ResultMapTopics({attempt,session}:{attempt:TestAttempt;session:AuthSession}){
 const {map,scope,phase,server,pending,conflicts,retry}=useInterestMap();
 const [selected,setSelected]=useState<string[]>([]),[review,setReview]=useState(false),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const command=useRef<{action:'tests.map.apply';attemptId:string;operationId:string;interestIds:string[]}|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const [expectedScope,setExpectedScope]=useState<string|null>(null);
 useEffect(()=>{
  let live=true;setExpectedScope(null);
  const identity=JSON.stringify([session.email,session.deviceId,session.syncToken]);
  void crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity)).then(bytes=>{
   if(live)setExpectedScope(Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''));
  }).catch(()=>{if(live)setExpectedScope(null);});
  return ()=>{live=false;};
 },[session.email,session.deviceId,session.syncToken]);
 if(attempt.status!=='completed'||!attempt.result)return null;
 const ids=TOPICS[attempt.version.testId]??[];
 const items=ids.flatMap(id=>{const topic=categoryByInterest.get(id);return topic?[{id,...topic}]:[];});
 if(!items.length)return null;
 const canRead=expectedScope!==null&&scope===expectedScope&&phase!=='auth_required'&&phase!=='loading';
 const ready=canRead&&phase==='synced'&&pending===0&&conflicts.length===0;
 const available=items.filter(x=>!Object.hasOwn(map,x.id)&&!Object.hasOwn(server,x.id));
 const eligible=new Set(available.map(x=>x.id));
 const canReview=ready&&selected.length>0&&selected.every(id=>eligible.has(id));
 const apply=async()=>{
  if(!review||!ack||busy||!canRead||(!ready&&!command.current)||(!command.current&&!canReview))return;
  const operation=command.current??{action:'tests.map.apply' as const,attemptId:attempt.id,operationId:crypto.randomUUID(),interestIds:[...selected].sort()};
  command.current=operation;setBusy(true);setError('');
  try{
   const response=await domainRequest(session,operation,z.object({ok:z.literal(true),replayed:z.boolean(),interestIds:z.array(z.string()).min(1).max(3),requestId:z.uuid()}).strict());
   if(!alive.current)return;
   if(JSON.stringify(response.interestIds)!==JSON.stringify(operation.interestIds))throw Error('invalid_response');
   command.current=null;setReview(false);setAck(false);setSelected([]);setNotice('Выбранные темы добавлены приватно. Обновляем карту.');void retry();
  }catch(e){if(alive.current)setError(domainErrorMessage(e));}finally{if(alive.current)setBusy(false);}
 };
 return <section className="card ft-result-map-topics" aria-labelledby="ft-result-map-title">
  <h3 id="ft-result-map-title">Темы для твоей карты</h3>
  <p>Это темы по направлению опросника, а не вывод о твоих желаниях, опыте или согласии. Ни один ответ и результат не переносится автоматически.</p>
  <div className="ft-questionnaire-grid">{items.map(item=><div className="card" key={item.id}>
    <strong>{item.title}</strong>
    <p className="muted">{canRead?(map[item.id]?interestSummary(map[item.id]):'Пока не исследовано'):'Текущее значение увидишь в редакторе карты'}</p>
    {ready&&!review&&eligible.has(item.id)&&<label className="ft-consent-choice"><input type="checkbox" checked={selected.includes(item.id)} disabled={busy||!!command.current} onChange={()=>{setSelected(ids=>ids.includes(item.id)?ids.filter(id=>id!==item.id):[...ids,item.id]);setAck(false);}}/> Добавить как «Интересно»</label>}
    {canRead&&!eligible.has(item.id)&&<p className="muted">Существующие или удалённые отметки не перезаписываются.</p>}
    <Link to={`/explore/${encodeURIComponent(item.category)}?interest=${encodeURIComponent(item.id)}`}>Открыть тему и выбрать вручную</Link>
   </div>)}</div>
  {canRead&&!ready&&!command.current&&<p className="muted">Добавить темы можно после синхронизации карты и разрешения её конфликтов.</p>}
  {ready&&!review&&selected.length>0&&<button type="button" disabled={!canReview||busy} onClick={()=>{setReview(true);setAck(false);}}>Просмотреть изменения ({selected.length})</button>}
  {review&&<div className="card"><h4>Проверь, что изменится</h4><p>Только новые темы, выбранные тобой. Ответы и баллы не копируются.</p>
   <ul>{items.filter(x=>selected.includes(x.id)).map(x=><li key={x.id}>{x.title}: не исследовано → «Интересно»; опыт не указан; границы не отмечены; видимость «Только мне»; поиск знакомств выключен.</li>)}</ul>
   <label className="ft-consent-choice"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/> Подтверждаю именно эти темы. Это не согласие на действия и не публикация.</label>
   <div className="ft-form-actions"><button type="button" disabled={busy||!!command.current} onClick={()=>{setReview(false);setAck(false);setSelected([]);}}>Отменить</button><button type="button" disabled={!ack||busy||(!ready&&!command.current)} onClick={()=>void apply()}>Подтвердить и добавить</button></div>
  </div>}
  {error&&<p role="alert">{error}</p>}
  {error&&command.current&&<div className="ft-form-actions"><button type="button" disabled={busy} onClick={()=>void apply()}>Повторить то же действие</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Предыдущее действие могло сохраниться. Проверить карту, не повторяя запрос?')){command.current=null;setReview(false);setAck(false);setSelected([]);setError('');void retry();}}}>Проверить карту</button></div>}
  {notice&&<p role="status">{notice}</p>}
  <p className="muted">Тест не меняет существующие границы или видимость. При сохранении новых тем источник будет отмечен как опросник.</p>
 </section>;
}
