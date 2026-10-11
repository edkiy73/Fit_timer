import {useEffect,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
const events=['test_started','test_completed','map_updated','share_created','share_opened','discussion_submitted'] as const;
const cohortNames={qa:'Временный QA-доступ',other_verified:'Другие серверные подтверждения'} as const;
const schema=z.object({
 ok:z.literal(true),days:z.union([z.literal(7),z.literal(30)]),
 events:z.array(z.enum(events)).length(events.length),
 cohorts:z.array(z.enum(['qa','other_verified'])).length(2),
 counts:z.record(z.string(),z.record(z.string(),z.number().int().nonnegative().nullable()))
}).strict();
const names:Record<typeof events[number],string>={
 test_started:'Начаты опросники',test_completed:'Завершены опросники',
 map_updated:'Изменения карты',share_created:'Созданы ссылки',
 share_opened:'Открытия ссылок',discussion_submitted:'Публикации отправлены на проверку'
};
export function MetricsAdmin({client,adminKey}:AdminSectionContext){
 const [days,setDays]=useState<7|30>(7),[result,setResult]=useState<z.infer<typeof schema>|null>(null);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setResult(null);setError('');setLoading(true);
  void client.action(adminKey,'feture.metrics.summary',{days}).then(raw=>{
   if(!controller.signal.aborted)setResult(schema.parse(raw));
  }).catch(()=>{
   if(!controller.signal.aborted)setError('Не удалось получить агрегированные данные.');
  }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[adminKey,client,days,refresh]);
 return <section className="ft-access" aria-labelledby="ft-metrics-title">
  <h2 id="ft-metrics-title">Активность FetUre</h2>
  <p>Только агрегированные сервером действия, без аккаунтов, текстов, ответов, интересов, приватных кодов и ссылок. Числа от 1 до 4 скрываются, чтобы не раскрывать активность отдельных людей.</p>
  <div className="ft-form-actions"><label>Период <select value={days} onChange={e=>setDays(Number(e.target.value) as 7|30)}><option value={7}>7 дней</option><option value={30}>30 дней</option></select></label><button type="button" disabled={loading} onClick={()=>setRefresh(n=>n+1)}>Обновить</button></div>
  {loading&&<p role="status">Загружаем…</p>}{error&&<p role="alert">{error}</p>}
  {result&&<table><thead><tr><th scope="col">Действие</th>{result.cohorts.map(c=><th key={c} scope="col">{cohortNames[c]}</th>)}</tr></thead>
    <tbody>{events.map(event=><tr key={event}><th scope="row">{names[event]}</th>
      {result.cohorts.map(c=><td key={c}>{result.counts[c]?.[event]===null?'Меньше 5':result.counts[c]?.[event]??'—'}</td>)}
    </tr>)}</tbody></table>}
  <p>Это количество успешных действий, а не уникальных людей, конверсия или D1/D7. Временная QA-когорта выделена отдельно. Системные логи и другие продукты AppBase не смешиваются с этими числами. Метрики без доказанной базы не считаются KPI.</p>
 </section>;
}
