import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
import {AdminWorkspace} from '@appbase/ui-react/admin-workspace.js';
import {operatorRole as role,operatorStatus as schema,operatorLabels} from './operator-api';
type Status=z.infer<typeof schema>;
type Entry=Status['items'][number];
const labels={manager:'Управление операторами',qa_operator:'Выдача и отзыв QA-доступа',auditor:'Чтение журнала QA'};
const denied=(error:unknown)=>!!error&&typeof error==='object'&&('status' in error&&(error.status===401||error.status===403)||'code' in error&&['forbidden','auth_required','session_changed'].includes(String(error.code)));
export function OperatorsAdmin({client,adminKey}:AdminSectionContext){
 const [data,setData]=useState<Status|null>(null),[email,setEmail]=useState(''),[entry,setEntry]=useState<Entry|null>(null),[nextRole,setNextRole]=useState<z.infer<typeof role>>('qa_operator');
 const [workspace,setWorkspace]=useState(false),[tab,setTab]=useState<'roles'|'audit'>('roles'),[filter,setFilter]=useState(''),[shown,setShown]=useState(10),[reviewed,setReviewed]=useState(false);
 const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const epoch=useRef(0),inFlight=useRef(false);
 useEffect(()=>{
  const current=++epoch.current;inFlight.current=false;setBusy(true);setData(null);setWorkspace(false);setEntry(null);setEmail('');setReviewed(false);setError('');
  void client.action(adminKey,'feture.operators.status').then(x=>{if(epoch.current===current)setData(schema.parse(x));})
   .catch(()=>{if(epoch.current===current){setData(null);setError('Войди в свой обычный аккаунт на вкладке «Аккаунт», затем открой этот раздел заново.');}})
   .finally(()=>{if(epoch.current===current)setBusy(false);});
  return()=>{epoch.current++;};
 },[client,adminKey,refresh]);
 const run=async(action:string,body:Record<string,unknown>)=>{
  if(inFlight.current)return;inFlight.current=true;const current=epoch.current;setBusy(true);setError('');setNotice('');
  try{const result=schema.parse(await client.action(adminKey,action,body));if(epoch.current!==current)return;
   setData(result);setEmail('');setEntry(null);setWorkspace(false);setReviewed(false);setNotice('Права подтверждены.');
  }catch(e){if(epoch.current!==current)return;
   if(denied(e)){setData(null);setWorkspace(false);setEmail('');setEntry(null);setReviewed(false);}
   setError('Изменение не подтверждено. Обнови список: могли измениться права или версия записи. Последнего управляющего отключить нельзя.');
  }finally{if(epoch.current===current){inFlight.current=false;setBusy(false);}}
 };
 const open=(selected:Entry|null)=>{setEntry(selected);setNextRole(selected?.role??'qa_operator');setEmail('');setReviewed(false);setError('');setNotice('');setWorkspace(true);};
 const dirty=!!email||nextRole!==(entry?.role??'qa_operator');
 const close=()=>{if(busy)return;if(dirty&&!window.confirm('Закрыть окно? Несохранённое назначение будет потеряно.'))return;setWorkspace(false);setEmail('');setEntry(null);setReviewed(false);};
 const needle=filter.trim().toLowerCase();
 const items=(data?.items??[]).filter(x=>!needle||[x.accountHash,x.role?operatorLabels[x.role]:'отозвана'].join(' ').toLowerCase().includes(needle));
 const events=(data?.events??[]).filter(x=>!needle||[x.actor,x.accountHash,x.role?operatorLabels[x.role]:'отозвана'].join(' ').toLowerCase().includes(needle));
 return <section className="ft-access">
  <div className="ab-admin-section-head"><div><h2>Операторы QA</h2><p className="muted">Назначения привязаны к личным аккаунтам. Они не открывают личные карты, ответы и дневники.</p></div></div>
  {data&&<p>Твоя роль: {data.role?operatorLabels[data.role]:'не назначена'}.</p>}
  {data&&!data.initialized&&!!adminKey&&<><p>Владелец с админ-ключом один раз назначает свой текущий аккаунт управляющим. Затем назначения требуют личной роли.</p><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Назначить текущий личный аккаунт первым управляющим операторами?'))void run('feture.operators.bootstrap',{});}}>Назначить мой аккаунт управляющим</button></>}
  <div className="ft-form-actions">
   {data?.role==='manager'&&<button type="button" disabled={busy} onClick={()=>open(null)}>Назначить оператора</button>}
   <button type="button" className="ab-admin-secondary" disabled={busy} onClick={()=>{setShown(10);setRefresh(n=>n+1);}}>Обновить</button>
  </div>
  {data&&(data.role==='manager'||data.role==='auditor')&&<>
   <div className="ab-admin-workspace-tabs" role="group" aria-label="Операторы и история">
    {data.role==='manager'&&<button type="button" aria-pressed={tab==='roles'} onClick={()=>{setTab('roles');setShown(10);}}>Операторы</button>}
    <button type="button" aria-pressed={tab==='audit'||data.role==='auditor'} onClick={()=>{setTab('audit');setShown(10);}}>История назначения прав</button>
   </div>
   <label>Поиск в загруженных записях<input type="search" value={filter} onChange={e=>{setFilter(e.target.value);setShown(10);}} placeholder="Отпечаток аккаунта или роль"/></label>
   {tab==='roles'&&data.role==='manager'?<>
    <p className="muted">До 100 записей. Для изменения открой запись и укажи email соответствующего аккаунта.</p>
    <div className="ab-admin-item-list">{items.slice(0,shown).map(x=><button type="button" disabled={busy} key={x.accountHash} onClick={()=>open(x)}><span><strong>{x.role?operatorLabels[x.role]:'Права отозваны'}</strong><small>{x.accountHash.slice(0,6)}…{x.accountHash.slice(-6)} · редакция {x.revision}</small></span><span aria-hidden="true">→</span></button>)}</div>
    {!items.length&&<p>Записей не найдено.</p>}{items.length>shown&&<button type="button" onClick={()=>setShown(n=>n+10)}>Показать ещё операторов</button>}
   </>:<>
    <p className="muted">Последние 25 решений, без email и личных текстов.</p>
    <div className="ab-admin-item-list">{events.slice(0,shown).map((x,i)=><div className="ab-admin-list-row" key={x.at+':'+i}><strong>{x.role?operatorLabels[x.role]:'Права отозваны'} · {new Date(x.at).toLocaleString('ru')}</strong><span>{x.actor.slice(0,6)}…{x.actor.slice(-6)} → {x.accountHash.slice(0,6)}…{x.accountHash.slice(-6)} · редакция {x.revision}</span></div>)}</div>
    {!events.length&&<p>Решений не найдено.</p>}{events.length>shown&&<button type="button" onClick={()=>setShown(n=>n+10)}>Показать ещё решений</button>}
   </>}
  </>}
  {workspace&&data?.role==='manager'&&<AdminWorkspace title={entry?'Изменение роли оператора':'Новый оператор'} {...(entry?{subtitle:'Аккаунт '+entry.accountHash+' · редакция '+entry.revision}:{})} onClose={close}
   footer={<><button type="button" className="ab-admin-secondary" disabled={busy} onClick={close}>Закрыть</button><button type="button" disabled={busy||!email.trim()||!reviewed||!entry&&nextRole===null} onClick={()=>{if(window.confirm('Изменить права указанного аккаунта?'))void run('feture.operators.set',{email:email.trim().toLowerCase(),role:nextRole,expectedRevision:entry?.revision||0,...(entry?{expectedAccountHash:entry.accountHash}:{})});}}>Сохранить права</button></>}>
   <label>Email существующего аккаунта<input disabled={busy} type="email" autoComplete="off" value={email} onChange={e=>{setEmail(e.target.value);setReviewed(false);}}/></label>
   <p>{entry?'Email должен принадлежать выбранному аккаунту. Сервер проверит совпадение и редакцию записи.':'Укажи email уже зарегистрированного аккаунта.'}</p>
   <label>Права<select disabled={busy} value={nextRole||'revoked'} onChange={e=>{setNextRole(e.target.value==='revoked'?null:e.target.value as Exclude<z.infer<typeof role>,null>);setReviewed(false);}}><option value="qa_operator">{labels.qa_operator}</option><option value="auditor">{labels.auditor}</option><option value="manager">Управление операторами и QA-доступом</option>{entry&&<option value="revoked">Отозвать права</option>}</select></label>
   <label className="ft-consent-choice"><input type="checkbox" disabled={busy} checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>Аккаунт и выбранные права проверены. Последнего управляющего отключить нельзя.</label>
   {error&&<p role="alert">{error}</p>}
  </AdminWorkspace>}
  {busy&&<p role="status">Загружаем…</p>}{!workspace&&error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>;
}
