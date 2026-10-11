import {useEffect,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
import {AdminWorkspace} from '@appbase/ui-react/admin-workspace.js';
const row=z.object({accountHash:z.string().regex(/^[a-f0-9]{32}$/),expiresAt:z.iso.datetime({offset:true}),revoked:z.boolean()}).strict();
const list=z.object({ok:z.literal(true),items:z.array(row).max(25),activeCount:z.number().int().min(0)}).strict();
const lookup=z.object({ok:z.literal(true),entry:z.object({expiresAt:z.iso.datetime({offset:true}),revoked:z.boolean()}).strict().nullable()}).strict();
const audit=z.object({ok:z.literal(true),items:z.array(z.object({
 accountHash:z.string().regex(/^[a-f0-9]{32}$/),action:z.enum(['grant','revoke']),
 at:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}).nullable(),actor:z.union([z.literal('core-admin'),z.string().regex(/^[a-f0-9]{32}$/)])
}).strict()).max(25)}).strict();
const granted=z.object({ok:z.literal(true),expiresAt:z.iso.datetime({offset:true})}).strict();
const revoked=z.object({ok:z.literal(true),revoked:z.literal(true)}).strict();
export function QaAdultAdmin({client,adminKey,readOnly=false}:AdminSectionContext&{readOnly?:boolean}){
 const [email,setEmail]=useState(''),[days,setDays]=useState<1|2|3>(1),[reviewed,setReviewed]=useState(false);
 const [workspace,setWorkspace]=useState(false),[listView,setListView]=useState<'grants'|'audit'>('grants'),[shown,setShown]=useState(10),[filter,setFilter]=useState('');
 const [events,setEvents]=useState<z.infer<typeof audit>['items']>([]),[items,setItems]=useState<z.infer<typeof row>[]>([]),[activeCount,setActiveCount]=useState(0),[lookupResult,setLookupResult]=useState<z.infer<typeof lookup>['entry']|undefined>(undefined),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let live=true;setBusy(true);setError('');
  void Promise.all([client.action(adminKey,'feture.qa.list',{}),client.action(adminKey,'feture.qa.audit',{})]).then(([x,y])=>{if(live){const result=list.parse(x);setItems(result.items);setActiveCount(result.activeCount);setEvents(audit.parse(y).items);}})
   .catch(()=>{if(live){setItems([]);setEvents([]);setActiveCount(0);setLookupResult(undefined);setNotice('');setError('Доступ к QA-настройкам отсутствует. Войди в свой аккаунт: нужна назначенная роль оператора или аудитора.');}})
   .finally(()=>{if(live)setBusy(false);});
  return()=>{live=false;};
 },[adminKey,client,refresh]);
 const mutate=async(kind:'grant'|'revoke')=>{
  if(busy||readOnly)return;
  const normalized=email.trim().toLowerCase();
  if(!normalized||!normalized.includes('@')){setError('Укажи email существующего тестового аккаунта.');return;}
  if(kind==='grant'&&!reviewed){setError('Сначала подтверди, что проверил совершеннолетие тестировщика.');return;}
  if(!window.confirm(kind==='grant'?('Открыть этому аккаунту QA-доступ на '+days+' дн.? Это не настоящая верификация и работает только на prelaunch.'):'Отозвать QA-доступ у указанного аккаунта?'))return;
  setBusy(true);setError('');setNotice('');setLookupResult(undefined);
  try{
   if(kind==='grant'){const result=granted.parse(await client.action(adminKey,'feture.qa.grant',{email:normalized,days,reviewed:true}));
    setNotice('Временный QA-доступ установлен до '+new Date(result.expiresAt).toLocaleString('ru')+'.');setReviewed(false);
   }else{revoked.parse(await client.action(adminKey,'feture.qa.revoke',{email:normalized}));setNotice('QA-доступ отозван.');}
   setWorkspace(false);setRefresh(n=>n+1);
  }catch{setError('Операция не подтверждена. Обнови список перед новым решением. В production доступ закрыт.');}
  finally{setBusy(false);}
 };
 const needle=filter.trim().toLowerCase();
 const displayedGrants=items.filter(x=>!needle||x.accountHash.includes(needle));
 const displayedAudit=events.filter(x=>!needle||x.accountHash.includes(needle)||x.actor.includes(needle));
 return <section className="ft-access">
  <div className="ab-admin-section-head"><div><h2>QA-доступ 18+</h2><p className="muted">Только prelaunch. Это не проверка возраста через провайдера. Все разрешения действуют не более 72 часов и автоматически отключаются в live.</p></div></div>
  <div className="ft-form-actions">
   {!readOnly&&<button type="button" disabled={busy} onClick={()=>{setError('');setNotice('');setWorkspace(true);}}>Проверить / выдать / отозвать по email</button>}
   <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Обновить данные</button>
  </div>
  <p role="status">Активных QA-допусков: <strong>{activeCount}</strong>.</p>
  {readOnly&&<p className="muted">Режим аудитора: только чтение. Выдача и отзыв не доступны.</p>}
  <div className="ab-admin-workspace-tabs" role="group" aria-label="Раздел QA">
   <button type="button" aria-pressed={listView==='grants'} onClick={()=>{setListView('grants');setShown(10);setFilter('');}}>Разрешения ({items.length})</button>
   <button type="button" aria-pressed={listView==='audit'} onClick={()=>{setListView('audit');setShown(10);setFilter('');}}>История решений ({events.length})</button>
  </div>
  <p className="muted">Показаны последние записи только с сокращёнными отпечатками аккаунтов, без email, паспортов и личных данных. Полный список не предоставляется этим API.</p>
  <label>Найти по отпечатку<input type="search" value={filter} onChange={e=>{setFilter(e.target.value.toLowerCase());setShown(10);}} placeholder="Часть номера аккаунта"/></label>
  {listView==='grants'?<div className="ab-admin-item-list">
    {displayedGrants.slice(0,shown).map(x=><div className="ab-admin-list-row" key={x.accountHash}>
      <strong>{x.accountHash.slice(0,6)}…{x.accountHash.slice(-6)}</strong>
      <span>{x.revoked?'Отозвано':Date.parse(x.expiresAt)>Date.now()?'Действует':'Истекло'} · до {new Date(x.expiresAt).toLocaleString('ru')}</span>
    </div>)}
    {!displayedGrants.length&&!busy&&<p className="muted">Разрешения не найдены.</p>}
   </div>:<div className="ab-admin-item-list">
    {displayedAudit.slice(0,shown).map((v,i)=><div className="ab-admin-list-row" key={v.accountHash+':'+v.at+':'+i}>
      <strong>{v.action==='grant'?'Выдача':'Отзыв'} · {new Date(v.at).toLocaleString('ru')}</strong>
      <span>Аккаунт {v.accountHash.slice(0,6)}…{v.accountHash.slice(-6)} · оператор {v.actor==='core-admin'?'core-admin':v.actor.slice(0,6)+'…'+v.actor.slice(-6)}</span>
    </div>)}
    {!displayedAudit.length&&!busy&&<p className="muted">Решений не найдено.</p>}
   </div>}
  {((listView==='grants'?displayedGrants.length:displayedAudit.length)>shown)&&<button type="button" className="ab-admin-secondary" onClick={()=>setShown(n=>n+10)}>Показать ещё</button>}
  {!workspace&&error&&<p role="alert">{error}</p>}{!workspace&&notice&&<p role="status">{notice}</p>}
  {workspace&&!readOnly&&<AdminWorkspace title="QA-допуск 18+" subtitle="Личный тестовый допуск, 24–72 часа · только prelaunch" onClose={()=>{if(!busy)setWorkspace(false);}}
   footer={<button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>setWorkspace(false)}>Закрыть</button>}>
   <p className="muted">Разрешение можно выдать любому существующему аккаунту, но только после личной проверки совершеннолетия. Оно не заменяет реальную верификацию. Не загружай сюда документы или селфи.</p>
   <label>Email существующего аккаунта<input type="email" value={email} autoComplete="off" disabled={busy} onChange={e=>{setEmail(e.target.value);setReviewed(false);setLookupResult(undefined);}} placeholder="tester@example.com"/></label>
   <label>Срок<select value={days} disabled={busy} onChange={e=>{setDays(Number(e.target.value) as 1|2|3);setReviewed(false);}}><option value={1}>24 часа</option><option value={2}>48 часов</option><option value={3}>72 часа</option></select></label>
   <div className="ft-form-actions"><button type="button" className="ab-admin-secondary" disabled={busy||!email.trim()} onClick={()=>{
    const normalized=email.trim().toLowerCase();setBusy(true);setError('');setLookupResult(undefined);
    void client.action(adminKey,'feture.qa.lookup',{email:normalized}).then(x=>setLookupResult(lookup.parse(x).entry)).catch(()=>setError('Не удалось проверить этот аккаунт.')).finally(()=>setBusy(false));
   }}>Проверить email</button></div>
   {lookupResult!==undefined&&<p role="status">{lookupResult===null?'Для этого email ранее не выдавался QA-доступ.':lookupResult.revoked?'QA-доступ отозван.':Date.parse(lookupResult.expiresAt)>Date.now()?'QA-доступ активен до '+new Date(lookupResult.expiresAt).toLocaleString('ru')+'.':'QA-доступ истёк '+new Date(lookupResult.expiresAt).toLocaleString('ru')+'.'}</p>}
   <label className="ft-consent-choice"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/>Я лично проверил, что тестировщик совершеннолетний, и беру ответственность за тестовый допуск.</label>
   <div className="ft-form-actions">
    <button type="button" disabled={busy||!reviewed||!email.trim()} onClick={()=>void mutate('grant')}>Выдать QA-доступ</button>
    <button type="button" className="ab-admin-secondary" disabled={busy||!email.trim()} onClick={()=>void mutate('revoke')}>Отозвать по email</button>
   </div>
   {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </AdminWorkspace>}
 </section>;
}
