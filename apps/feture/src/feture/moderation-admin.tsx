import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
import {AdminWorkspace} from '@appbase/ui-react/admin-workspace.js';
import {REPORT_REASONS,PROFILE_FIELDS} from './moderation-page';
const rowSchema=z.object({id:z.uuid(),caseId:z.uuid(),targetId:z.uuid(),reason:z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS,...(keyof typeof REPORT_REASONS)[]]),note:z.string().max(1000),state:z.enum(['open','reviewing','resolved']),revision:z.number().int().positive(),snapshot:z.union([z.object({}).strict(),z.object({field:z.enum(Object.keys(PROFILE_FIELDS) as [keyof typeof PROFILE_FIELDS,...(keyof typeof PROFILE_FIELDS)[]]),text:z.string().max(2000)}).strict()]),priority:z.number().int().min(1).max(3),createdAt:z.iso.datetime({offset:true}),appealText:z.string().max(1000).nullable()}).strict();
const queueSchema=z.object({ok:z.literal(true),items:z.array(rowSchema).max(30),nextCursor:z.uuid().nullable()}).strict();
type Row=z.infer<typeof rowSchema>;
type Decision={operationId:string;caseId:string;expectedRevision:number;decision:string;reason:string;days:number};
export function ModerationAdmin({client,adminKey}:AdminSectionContext){
 const [kind,setKind]=useState<'cases'|'appeals'>('cases'),[cursor,setCursor]=useState<string|null>(null),[rows,setRows]=useState<Row[]>([]),[next,setNext]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const [selected,setSelected]=useState<Row|null>(null),[decisionPending,setDecisionPending]=useState(false),[visibleCount,setVisibleCount]=useState(10),[search,setSearch]=useState('');
 const [previousCursors,setPreviousCursors]=useState<Array<string|null>>([]);
 useEffect(()=>{let live=true;setBusy(true);setRows([]);setNext(null);setError('');client.action(adminKey,'feture.moderation.queue',{kind,cursor}).then(raw=>{const r=queueSchema.parse(raw);if(live){setRows(r.items);setNext(r.nextCursor);}}).catch(()=>{if(live)setError('Очередь недоступна. Проверь хранилище и обнови страницу.');}).finally(()=>{if(live)setBusy(false);});return ()=>{live=false;};},[client,adminKey,kind,cursor,refresh]);
 const decide=async(body:Decision)=>{if(busy)return false;setBusy(true);setError('');setNotice('');try{
  const result=await client.action(adminKey,'feture.moderation.decide',body);
  z.object({ok:z.literal(true)}).strict().parse(result);
  setNotice('Решение подтверждено сервером. Повтор с тем же номером не продлит санкцию.');
  setRefresh(n=>n+1);return true;
 }catch{
  setError('Исход запроса неизвестен. Не меняй решение и не создавай новое: повтори ТО ЖЕ действие или проверь его номер на сервере.');
  return false;
 }finally{setBusy(false);}};
 const check=async(body:Decision)=>{if(busy)return false;setBusy(true);setError('');setNotice('');try{
  const result=z.object({ok:z.literal(true),state:z.enum(['applied','unknown'])}).strict().parse(
   await client.action(adminKey,'feture.moderation.decisionStatus',{operationId:body.operationId,caseId:body.caseId}));
  if(result.state==='applied'){
   setNotice('Сервер подтвердил: это решение уже записано. Повторно применять его не нужно.');
   setRefresh(n=>n+1);return true;
  }
  setNotice('Подтверждённой записи пока нет. Предыдущий запрос ещё мог выполняться — используй только повтор с тем же номером.');
  return false;
 }catch{setError('Не удалось проверить запись. Сохрани тот же номер операции и повтори проверку или запрос.');return false;}
 finally{setBusy(false);}};
 const closeDetail=()=>{
  if(busy||decisionPending){
   setError('Решение ещё выполняется или его результат неизвестен. Не закрывай карточку, пока не проверишь запись или не повторишь ту же операцию.');
   return;
  }
  setSelected(null);
  setError('');
 };
 const changeKind=(nextKind:'cases'|'appeals')=>{
  if(busy)return;
  setKind(nextKind);
  setCursor(null);setPreviousCursors([]);setVisibleCount(10);setSearch('');setNotice('');
 };
 const query=search.trim().toLocaleLowerCase();
 const filtered=rows.filter(row=>!query
  ||REPORT_REASONS[row.reason].toLocaleLowerCase().includes(query)
  ||row.caseId.toLowerCase().includes(query)
  ||row.id.toLowerCase().includes(query));
 const shown=filtered.slice(0,visibleCount);
 return <section className="ft-access">
  <h2>Очередь модерации</h2>
  <p className="muted">Жалобы и апелляции рассматриваются отдельно. В очереди — только краткая информация; текст обращения и решение открываются в карточке случая. Решения фиксируются сервером.</p>
  <div className="ft-form-actions" role="group" aria-label="Тип обращений">
   <button type="button" aria-pressed={kind==='cases'} disabled={busy} onClick={()=>changeKind('cases')}>Жалобы</button>
   <button type="button" aria-pressed={kind==='appeals'} disabled={busy} onClick={()=>changeKind('appeals')}>Апелляции</button>
   <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>{setRefresh(n=>n+1);}}>Обновить</button>
  </div>
  <label>Поиск на текущей странице<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setVisibleCount(10);}} placeholder="Причина или номер случая"/></label>
  {busy&&<p role="status">Обновляю очередь…</p>}
  {!busy&&!rows.length&&!error&&<p className="muted">В этой очереди пока нет обращений.</p>}
  <div className="ab-admin-item-list">
   {shown.map(row=><button type="button" key={row.id+':'+row.revision} onClick={()=>{setError('');setSelected(row);}} disabled={busy}>
    <span>
     <strong>{REPORT_REASONS[row.reason]}{row.appealText?' · апелляция':''}</strong>
     <small>Приоритет {row.priority} · {new Date(row.createdAt).toLocaleString('ru')} · {row.state==='resolved'?'Закрыто':row.state==='reviewing'?'В работе':'Ожидает решения'}</small>
    </span>
    <span aria-hidden="true">→</span>
   </button>)}
  </div>
  {!busy&&rows.length>0&&filtered.length===0&&<p className="muted">На этой странице совпадений нет.</p>}
  <div className="ft-form-actions">
   {filtered.length>visibleCount&&<button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>setVisibleCount(n=>n+10)}>Показать ещё ({filtered.length-visibleCount})</button>}
   {previousCursors.length>0&&<button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>{const previous=previousCursors[previousCursors.length-1]??null;setPreviousCursors(list=>list.slice(0,-1));setCursor(previous);setVisibleCount(10);setSearch('');}}>Назад</button>}
   {next&&<button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>{setPreviousCursors(list=>[...list,cursor]);setCursor(next);setVisibleCount(10);setSearch('');}}>Следующая страница</button>}
  </div>
  {!selected&&error&&<p role="alert">{error}</p>}{!selected&&notice&&<p role="status">{notice}</p>}
  {selected&&<AdminWorkspace title={REPORT_REASONS[selected.reason]} subtitle={'Приоритет '+selected.priority+' · '+new Date(selected.createdAt).toLocaleString('ru')} onClose={closeDetail}
   footer={<button type="button" className="ab-admin-secondary" disabled={busy||decisionPending} onClick={closeDetail}>Вернуться к очереди</button>}>
    <CaseCard key={selected.caseId+':'+selected.revision} row={selected} busy={busy} decide={decide} check={check} onPendingChange={setDecisionPending}/>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <p className="muted">Внутренние действия пока защищены общим ключом администратора. Личные роли модератора потребуют отдельного серверного разграничения доступа.</p>
   </AdminWorkspace>}
 </section>;
}
function CaseCard({row,busy,decide,check,onPendingChange}:{row:Row;busy:boolean;decide:(body:Decision)=>Promise<boolean>;check:(body:Decision)=>Promise<boolean>;onPendingChange:(pending:boolean)=>void}){
 const [action,setAction]=useState('dismiss'),[reason,setReason]=useState('insufficient'),[days,setDays]=useState(7),[reviewed,setReviewed]=useState(false),[pending,setPending]=useState<Decision|null>(null);
 const inFlight=useRef(false);
 useEffect(()=>{onPendingChange(!!pending);return()=>onPendingChange(false);},[pending,onPendingChange]);
 const reset=()=>{if(!pending)setReviewed(false);};
 const run=async()=>{if(busy||inFlight.current||(!pending&&!reviewed))return;
  const command=pending??{operationId:crypto.randomUUID(),caseId:row.caseId,expectedRevision:row.revision,decision:action,reason,days};
  setPending(command);inFlight.current=true;
  try{if(await decide(command))setPending(null);}finally{inFlight.current=false;}
 };
 const inspect=async()=>{if(busy||inFlight.current||!pending)return;
  inFlight.current=true;try{if(await check(pending))setPending(null);}finally{inFlight.current=false;}
 };
 return <article className="ft-permission"><h3>{REPORT_REASONS[row.reason]}</h3><p>Приоритет {row.priority} · {new Date(row.createdAt).toLocaleString('ru')} · редакция {row.revision}</p><p style={{whiteSpace:'pre-wrap'}}>{row.note||'Описание не добавлено.'}</p>{'field' in row.snapshot&&<blockquote><strong>{PROFILE_FIELDS[row.snapshot.field]}</strong><p style={{whiteSpace:'pre-wrap'}}>{row.snapshot.text}</p></blockquote>}{row.appealText&&<div><strong>Апелляция</strong><p style={{whiteSpace:'pre-wrap'}}>{row.appealText}</p></div>}<p className="muted">Другие закрытые поля, карта и дневник здесь недоступны.</p>
  <label>Решение<select value={action} disabled={busy||!!pending} onChange={e=>{setAction(e.target.value);setReason(e.target.value==='restore'?'appeal':e.target.value==='dismiss'?'insufficient':'policy');reset();}}><option value="dismiss">Закрыть без новой санкции</option><option value="hide">Скрыть публичное участие</option><option value="suspend">Приостановить публичное участие</option>{row.appealText&&<option value="restore">Снять ограничение этого случая</option>}</select></label>
  <label>Основание<select value={reason} disabled={busy||!!pending} onChange={e=>{setReason(e.target.value);reset();}}>{['policy','abuse','age','illegal',...(action==='dismiss'?['insufficient']:[]),...(action==='restore'?['appeal']:[])].map(r=><option value={r} key={r}>{({policy:'Правила',abuse:'Злоупотребление',age:'Возраст',illegal:'Незаконный материал',insufficient:'Недостаточно оснований',appeal:'Апелляция'} as Record<string,string>)[r]}</option>)}</select></label>
  {(action==='hide'||action==='suspend')&&<label>Срок, дней<input type="number" value={days} min={1} max={365} disabled={busy||!!pending} onChange={e=>{setDays(Number(e.target.value));reset();}}/></label>}
  <label className="ft-consent-choice"><input type="checkbox" checked={reviewed} disabled={busy||!!pending} onChange={e=>setReviewed(e.target.checked)}/>Контекст и выбранное действие проверены. Ограничение отзовёт текущие разрешения; снятие не восстановит их.</label><button type="button" disabled={busy||(!pending&&!reviewed)||!Number.isInteger(days)||days<1||days>365} onClick={()=>void run()}>{pending?'Повторить то же решение':'Записать решение'}</button>
  {pending&&<div className="ft-moderation-recovery" role="status"><p>Запрос мог быть выполнен, но подтверждение потеряно. Параметры заморожены, повтор использует тот же номер операции: <code>{pending.operationId}</code>.</p>
   <button type="button" disabled={busy} onClick={()=>void inspect()}>Проверить запись на сервере</button>
  </div>}
 </article>;
}
