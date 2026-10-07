import { useCallback, useEffect, useState } from 'react';
import type { AdminSection, AdminSectionContext } from '@appbase/ui-react/admin.js';

/* Admin → «Приглашения» (launch plan, decision 17): how many days of Plus both friends get and how
   many people came by invitation. The rules live in lib/unmute-referral.js. */

interface ReferralAdminState {
  settings:{bonusDays:number};
  totals:{invited:number; rewarded:number};
  daysNeeded:number;
}

function ReferralAdmin({client,adminKey}:AdminSectionContext){
  const [state,setState]=useState<ReferralAdminState|null>(null);
  const [days,setDays]=useState('7');
  const [busy,setBusy]=useState(false);
  const [note,setNote]=useState('');

  const apply=(result:Record<string,unknown>)=>{
    const next=result as unknown as ReferralAdminState;
    setState(next);
    setDays(String(next.settings.bonusDays));
  };
  const load=useCallback(async()=>{ apply(await client.action(adminKey,'referral_settings')); },[client,adminKey]);
  useEffect(()=>{ void load().catch(()=>setNote('Не удалось загрузить настройки.')); },[load]);

  async function save(){
    setBusy(true);
    setNote('Сохраняю…');
    try{
      apply(await client.action(adminKey,'referral_settings_save',{bonusDays:Number(days)}));
      setNote('Сохранено.');
    }catch(error){
      setNote('Не сохранилось: '+String((error as {code?:string})?.code||'ошибка'));
    }finally{
      setBusy(false);
    }
  }

  if(!state) return <article className="ab-admin-panel"><p className="ab-admin-empty">{note||'Загружаю…'}</p></article>;
  return (
    <article className="ab-admin-panel">
      <h2>Пригласи друга</h2>
      <p className="ab-admin-empty">Ученик делится ссылкой из Профиля. Когда приглашённый войдёт в новый аккаунт и пройдёт {state.daysNeeded} дня курса, оба получат UnMute Plus на выбранное число дней. Если Plus уже есть, дни добавляются к нему.</p>
      <p>Пришли по приглашению: <b>{state.totals.invited}</b> · получили бонус: <b>{state.totals.rewarded}</b></p>
      <label><span>Plus за приглашение, дней (1–90)</span>
        <input type="number" min={1} max={90} value={days} onChange={event=>setDays(event.target.value)} />
      </label>
      <button type="button" disabled={busy} onClick={()=>void save()}>Сохранить</button>
      {note&&<p className="ab-admin-empty" role="status">{note}</p>}
    </article>
  );
}

export const referralAdminSection:AdminSection={
  id:'referral',
  label:'Приглашения',
  group:'Продукт',
  render(context){ return <ReferralAdmin {...context} />; }
};
