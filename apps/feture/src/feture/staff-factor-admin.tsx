import {useCallback,useEffect,useState} from 'react';
import {z} from 'zod';
import type {AdminSectionContext} from '@appbase/ui-react/admin.js';

/* Admin → «2FA для сотрудников»: the test-only switch for the staff second factor (lib/feture/staff-factor-admin.js,
   server/staff-factor-switch.mjs). OFF only waives the requirement for staff; nothing is deleted, regular users'
   optional factor is untouched. Must be ON at launch (docs/infra/security.md). */

const state=z.object({ok:z.literal(true),required:z.boolean(),changedBy:z.string().nullable(),changedAt:z.string().nullable()});
type State=z.infer<typeof state>;

function when(value:string|null):string{
 const date=value?new Date(value):null;
 return date&&!Number.isNaN(date.getTime())?date.toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}):'';
}

export function StaffFactorAdmin({client,adminKey}:AdminSectionContext){
 const [current,setCurrent]=useState<State|null>(null);
 const [busy,setBusy]=useState(false);
 const [note,setNote]=useState('');

 const load=useCallback(async()=>{setCurrent(state.parse(await client.action(adminKey,'feture.platform.staffFactor')));},[client,adminKey]);
 useEffect(()=>{void load().catch(()=>setNote('Не удалось прочитать настройку.'));},[load]);

 async function change(required:boolean){
  if(busy)return;
  if(!required&&!window.confirm('Выключить 2FA для сотрудников? Только для тестов: пока выключено, сотрудники входят без кода из приложения.'))return;
  setBusy(true);setNote('Сохраняю…');
  try{
   setCurrent(state.parse(await client.action(adminKey,'feture.platform.staffFactor',{required})));
   setNote(required?'Готово: код из приложения снова обязателен.':'Готово: сотрудники входят без кода. Не забудь включить обратно.');
  }catch{setNote('Не сохранилось. Попробуй ещё раз.');}
  finally{setBusy(false);}
 }

 if(!current)return <article className="ab-admin-panel"><p className="ab-admin-empty" role="status">{note||'Загружаю…'}</p></article>;
 const on=current.required;
 return <article className="ab-admin-panel">
  <h2>2FA для сотрудников</h2>
  <p role="status">Сейчас: <b>{on?'включена (код из приложения обязателен)':'ВЫКЛЮЧЕНА (сотрудники входят без кода)'}</b>.</p>
  {current.changedAt&&<p className="ab-admin-empty">Менялось: {when(current.changedAt)}, {current.changedBy||'админка'}.</p>}
  <p className="ab-admin-empty" role={on?undefined:'alert'}>Только для тестов. Пока выключено, сотрудники входят без кода из приложения. Подключённые приложения и коды не удаляются, у обычных людей их проверка остаётся. Перед запуском приложения переключатель должен быть включён.</p>
  <button type="button" disabled={busy} onClick={()=>void change(!on)}>{on?'Выключить для тестов':'Включить обратно'}</button>
  {note&&<p className="ab-admin-empty" role="status">{note}</p>}
 </article>;
}
