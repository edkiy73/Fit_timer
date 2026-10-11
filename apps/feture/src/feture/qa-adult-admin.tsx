import {useEffect,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
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
   setRefresh(n=>n+1);
  }catch{setError('Операция не подтверждена. Обнови список перед новым решением. В production доступ закрыт.');}
  finally{setBusy(false);}
 };
 return <section className="ft-access">
  <h2>QA-доступ 18+ · только prelaunch</h2>
  <p>Временный доступ только для взрослых тестировщиков, которых администратор проверил лично. Это <strong>не подтверждение личности или возраста через провайдера</strong>. Никаких паспортов или селфи сюда загружать нельзя.</p>
  <p>Для любого существующего аккаунта без искусственного лимита участников, но каждое разрешение индивидуальное и действует не дольше 3 дней. В production все разрешения отключаются на сервере автоматически. Согласие с правилами отдельно обязательно.</p>
  {!readOnly&&<>
  <label>Email существующего аккаунта<input type="email" value={email} autoComplete="off" disabled={busy} onChange={e=>{setEmail(e.target.value);setReviewed(false);setLookupResult(undefined);}} placeholder="tester@example.com"/></label>
  <label>Срок <select value={days} disabled={busy} onChange={e=>{setDays(Number(e.target.value) as 1|2|3);setReviewed(false);}}><option value={1}>24 часа</option><option value={2}>48 часов</option><option value={3}>72 часа</option></select></label>
  <label className="ft-consent-choice"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/>Я лично проверил, что этот тестировщик совершеннолетний, и беру ответственность за тестовый допуск.</label>
  <div className="ft-form-actions"><button type="button" disabled={busy||!email.trim()} onClick={()=>{const normalized=email.trim().toLowerCase();setBusy(true);setError('');setLookupResult(undefined);void client.action(adminKey,'feture.qa.lookup',{email:normalized}).then(x=>setLookupResult(lookup.parse(x).entry)).catch(()=>setError('Не удалось проверить этот аккаунт.')).finally(()=>setBusy(false));}}>Проверить email</button></div>
  {lookupResult!==undefined&&<p role="status">{lookupResult===null?'Для этого email ранее не выдавался QA-доступ.':lookupResult.revoked?'QA-доступ отозван.':Date.parse(lookupResult.expiresAt)>Date.now()?'QA-доступ активен до '+new Date(lookupResult.expiresAt).toLocaleString('ru')+'.':'QA-доступ истёк '+new Date(lookupResult.expiresAt).toLocaleString('ru')+'.'}</p>}
  <div className="ft-form-actions"><button type="button" disabled={busy||!reviewed} onClick={()=>void mutate('grant')}>Выдать QA-доступ</button><button type="button" disabled={busy} onClick={()=>void mutate('revoke')}>Отозвать по email</button><button type="button" disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Обновить</button></div>
  </>}
  {readOnly&&<p>Доступ только для чтения: выдавать и отзывать разрешения нельзя.</p>}
  <h3>Выданные разрешения · активных {activeCount}</h3><p>Показаны 25 последних записей: конкретного пользователя можно проверить по email выше. Список содержит только отпечатки аккаунтов, без адресов и личных данных. Выдача и отзыв записываются с отпечатком аккаунта действующего оператора.</p>
  <ul>{items.map(x=><li key={x.accountHash}>{x.accountHash.slice(0,6)}…{x.accountHash.slice(-6)} — {x.revoked?'отозвано':Date.parse(x.expiresAt)>Date.now()?'действует':'истекло'} до {new Date(x.expiresAt).toLocaleString('ru')}</li>)}</ul>
  <h3>История решений администратора</h3>
  <p>Последние 25 выдач и отзывов без email или личных данных. Новые решения связаны с аккаунтом оператора. У старых записей без персональной привязки остаётся core-admin.</p>
  {events.length===0?<p>Пока нет записанных решений.</p>:<ul>{events.map((v,i)=><li key={v.accountHash+':'+v.at+':'+i}>
   {new Date(v.at).toLocaleString('ru')} · {v.action==='grant'?'Выдан':'Отозван'} · {v.accountHash.slice(0,6)}…{v.accountHash.slice(-6)} · {v.actor}
  </li>)}</ul>}
  {readOnly&&<button disabled={busy} onClick={()=>setRefresh(n=>n+1)}>Обновить журнал</button>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>;
}
