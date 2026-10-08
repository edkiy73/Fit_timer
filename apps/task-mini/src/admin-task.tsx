import { useCallback, useEffect, useState } from 'react';
import type { AdminSection, AdminSectionContext } from '@appbase/ui-react/admin.js';

interface TaskStats {
  accounts:number;
  total:number;
  active:number;
  done:number;
  tombstones:number;
}

function TaskAdmin({client,adminKey,locale}:AdminSectionContext){
  const ru=locale==='ru';
  const [stats,setStats]=useState<TaskStats|null>(null);
  const [note,setNote]=useState('');

  const load=useCallback(async()=>{
    setNote('');
    try{
      const result=await client.action(adminKey,'task_stats') as unknown as {stats:TaskStats};
      setStats(result.stats);
    }catch(error){
      setNote((ru?'Не удалось загрузить статистику: ':'Could not load task stats: ')
        + String((error as {code?:string})?.code||'error'));
    }
  },[client,adminKey,ru]);

  useEffect(()=>{ void load(); },[load]);

  return (
    <article className="ab-admin-panel">
      <div className="ab-admin-row">
        <div>
          <h2>{ru?'Статистика задач':'Task statistics'}</h2>
          <p className="ab-admin-empty">
            {ru
              ? 'Минимальный пример product-specific раздела: данные приходят через общий Core Admin handler.'
              : 'Minimal product-specific Admin extension: data comes through the shared Core Admin handler.'}
          </p>
        </div>
        <button type="button" className="ab-admin-secondary" onClick={()=>void load()}>
          {ru?'Обновить':'Refresh'}
        </button>
      </div>
      {stats ? (
        <div className="ab-admin-status-line">
          <span>{ru?'Аккаунтов с задачами':'Accounts with tasks'}: <b>{stats.accounts}</b></span>
          <span>{ru?'Всего':'Total'}: <b>{stats.total}</b></span>
          <span>{ru?'Активных':'Active'}: <b>{stats.active}</b></span>
          <span>{ru?'Готовых':'Done'}: <b>{stats.done}</b></span>
        </div>
      ) : <p className="ab-admin-empty">{note||(ru?'Загружаю…':'Loading…')}</p>}
      {stats && <p className="ab-admin-empty">{ru?'Удалённых записей в merge-журнале':'Deleted records kept for merge'}: {stats.tombstones}</p>}
      {note&&<p className="ab-admin-empty" role="status">{note}</p>}
    </article>
  );
}

export const taskAdminSection:AdminSection={
  id:'task-mini',
  label:'Task Mini',
  group:'Task Mini',
  render(context){ return <TaskAdmin {...context} />; }
};
