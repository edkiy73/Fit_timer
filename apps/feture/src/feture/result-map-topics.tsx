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
    <Link to={`/explore/${encodeURIComponent(item.category)}?interest=${encodeURIComponent(item.id)}`}>Открыть тему и выбрать вручную</Link>
   </div>)}</div>
  <p className="muted">Твои жёсткие границы, приватность и выбор для знакомств не меняются от прохождения теста. Отметки сохраняются только после твоего отдельного подтверждения в редакторе.</p>
 </section>;
}
