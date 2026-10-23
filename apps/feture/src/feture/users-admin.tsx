import {useEffect,useMemo,useState} from 'react';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';
type Person={id:string;name:string;email:string|null;createdAt:string;updatedAt:string;hasLogin:boolean;lastSeen:string|null};
type Result={ok:true;users:Person[];more:boolean};
function isResult(value:unknown):value is Result{
 if(!value||typeof value!=='object')return false;
 const v=value as Partial<Result>;
 return v.ok===true&&typeof v.more==='boolean'&&Array.isArray(v.users)&&v.users.every(p=>
  p&&typeof p.id==='string'&&/^[a-f0-9]{32}$/.test(p.id)&&typeof p.name==='string'&&
  (p.email===null||typeof p.email==='string')&&typeof p.hasLogin==='boolean'&&
  typeof p.createdAt==='string'&&typeof p.updatedAt==='string');
}
export function FetureUsersAdmin({client,adminKey,locale}:AdminSectionContext){
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[refresh,setRefresh]=useState(0),[search,setSearch]=useState('');
 const en=locale==='en';
 useEffect(()=>{
  let active=true;setBusy(true);setError('');
  void client.action(adminKey,'feture.users.list').then(value=>{
   if(!isResult(value))throw Error('bad_users_response');
   if(active)setResult(value);
  }).catch(()=>{if(active){setResult(null);setError(en?'Could not load FetUre participants. Check database and admin access.':'Не удалось загрузить участников FetUre. Проверь базу и доступ администратора.');}})
    .finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[client,adminKey,refresh,en]);
 const shown=useMemo(()=>result?.users.filter(p=>(p.name+' '+(p.email||'')+' '+p.id).toLocaleLowerCase().includes(search.toLocaleLowerCase()))||[],[result,search]);
 const date=(v:string|null)=>v?new Date(v).toLocaleDateString(en?'en-US':'ru-RU'):'—';
 return <section className="ab-admin-panel" aria-label={en?'FetUre participants':'Участники FetUre'}>
  <h2>{en?'FetUre participants':'Пользователи FetUre'}</h2>
  <p>{en?'Product profiles in FetUre. Core sign-in is shared with other apps and is shown separately from profile creation.':'Профили FetUre из базы приложения. Вход AppBase общий для нескольких продуктов и учитывается отдельно от создания профиля.'}</p>
  <div className="ab-admin-row"><label><span>{en?'Find by name or email':'Поиск по имени или email'}</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><button type="button" onClick={()=>setRefresh(v=>v+1)} disabled={busy}>{en?'Refresh':'Обновить'}</button></div>
  {busy&&<p role="status">{en?'Loading…':'Загрузка…'}</p>}
  {error&&<p role="alert">{error}</p>}
  {result&&<><p>{en?'Profiles':'Профилей'}: <strong>{result.users.length}{result.more?'+':''}</strong> · {en?'With Core sign-in':'С входом Core'}: <strong>{result.users.filter(p=>p.hasLogin).length}</strong></p>
   {result.more&&<p role="status">{en?'Showing first 200 profiles.':'Показаны первые 200 профилей.'}</p>}
   {shown.length?<div className="ab-admin-table-wrap"><table className="ab-admin-card-table"><thead><tr><th>{en?'Name':'Имя'}</th><th>Email</th><th>{en?'Core sign-in':'Вход Core'}</th><th>{en?'Created':'Создан'}</th><th>{en?'Updated':'Обновлён'}</th></tr></thead><tbody>{shown.map(p=><tr key={p.id}><td>{p.name||'—'}<small style={{display:'block',opacity:.6}}>{p.id.slice(0,12)}</small></td><td>{p.email||'—'}</td><td>{p.hasLogin?(en?'Linked':'Есть'):(en?'Not linked':'Нет')}</td><td>{date(p.createdAt)}</td><td>{date(p.updatedAt)}</td></tr>)}</tbody></table></div>:<p>{en?'No matching profiles.':'Совпадений нет.'}</p>}
   <p>{en?'Account subscription and access changes affect the shared AppBase identity. They are intentionally unavailable on this FetUre-only list.':'Изменение подписки и доступа затрагивает общую учётную запись AppBase. В этом списке FetUre такие действия намеренно недоступны.'}</p></>}
 </section>;
}
