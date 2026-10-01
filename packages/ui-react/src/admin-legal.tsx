import { useCallback, useEffect, useState } from 'react';
import type { AdminClient } from '@appbase/core/admin.js';
import type { LegalDetails } from '@appbase/core/legal.js';

/* Admin → «Владелец и контакты». Who runs the app and how to reach them: the privacy policy and
   the account-deletion page show these (website and inside the app), so each new app only needs
   them typed in here. Stored in the Core settings as `legal`; /api/config makes them public. */

const COPY = {
  ru: {
    title:'Владелец и контакты',
    hint:'Эти данные видны всем на страницах «Политика конфиденциальности» и «Удаление аккаунта» — на сайте и в приложении. Пустое поле — страница оставит свой текст.',
    owner:'Владелец приложения', ownerHint:'Например: ИП Иванов Иван Иванович или Иван Иванов',
    country:'Страна', email:'Почта для обращений', emailHint:'Сюда пишут о данных и просят удалить аккаунт',
    ageFrom:'Возраст, с которого можно пользоваться', save:'Сохранить', saving:'Сохраняю…', saved:'Сохранено. Страницы покажут новые данные сразу.',
    saveError:'Не сохранилось: ', badEmail:'Проверь адрес почты.', loading:'Загружаю…', loadError:'Не удалось загрузить настройки.',
    preview:'Как будет на странице', previewEmpty:'(текст страницы)'
  },
  en: {
    title:'Owner and contacts',
    hint:'Shown to everyone on the privacy policy and account deletion pages, on the website and in the app. An empty field keeps the page text.',
    owner:'App owner', ownerHint:'For example: John Smith or Smith Apps Ltd',
    country:'Country', email:'Contact email', emailHint:'People write here about their data and account deletion',
    ageFrom:'Minimum age', save:'Save', saving:'Saving…', saved:'Saved. The pages show the new details right away.',
    saveError:'Not saved: ', badEmail:'Check the email address.', loading:'Loading…', loadError:'Could not load settings.',
    preview:'On the page', previewEmpty:'(page text)'
  }
} as const;

type Settings = {legal?: LegalDetails} & Record<string, unknown>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AdminLegal({client, adminKey, locale = 'ru'}: {client: AdminClient; adminKey: string; locale?: 'ru' | 'en'}){
  const copy = COPY[locale];
  const [settings, setSettings] = useState<Settings | null>(null);
  const [legal, setLegal] = useState<Required<LegalDetails>>({owner:'', country:'', email:'', ageFrom:14});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await client.action(adminKey, 'settings_get');
    const next = result.settings as Settings;
    setSettings(next);
    setLegal({owner:'', country:'', email:'', ageFrom:14, ...next.legal} as Required<LegalDetails>);
  }, [client, adminKey]);

  useEffect(() => { void load().catch(() => setNote(copy.loadError)); }, [load, copy.loadError]);

  if(!settings) return <article className="ab-admin-panel"><p className="ab-admin-empty">{note || copy.loading}</p></article>;

  async function save(){
    if(!settings) return;
    const email = legal.email.trim();
    if(email && !EMAIL.test(email)){ setNote(copy.badEmail); return; }
    setBusy(true);
    setNote(copy.saving);
    try{
      const result = await client.action(adminKey, 'save_settings', {settings:{...settings, legal:{...legal, email}}});
      const next = result.settings as Settings;
      setSettings(next);
      setLegal({owner:'', country:'', email:'', ageFrom:14, ...next.legal} as Required<LegalDetails>);
      setNote(copy.saved);
    }catch(error){
      setNote(copy.saveError + String((error as {code?: string})?.code || ''));
    }finally{ setBusy(false); }
  }

  const operator = legal.owner.trim() ? legal.owner.trim() + (legal.country.trim() ? ', ' + legal.country.trim() : '') : copy.previewEmpty;
  return (
    <>
      <article className="ab-admin-panel">
        <h2>{copy.title}</h2>
        <p className="ab-admin-empty">{copy.hint}</p>
        <label><span>{copy.owner}</span>
          <input value={legal.owner} maxLength={160} placeholder={copy.ownerHint} onChange={e => setLegal({...legal, owner:e.target.value})} />
        </label>
        <label><span>{copy.country}</span>
          <input value={legal.country} maxLength={80} onChange={e => setLegal({...legal, country:e.target.value})} />
        </label>
        <label><span>{copy.email}</span>
          <input type="email" value={legal.email} maxLength={120} placeholder={copy.emailHint} onChange={e => setLegal({...legal, email:e.target.value})} />
        </label>
        <label><span>{copy.ageFrom}</span>
          <input type="number" min={0} max={21} value={legal.ageFrom} onChange={e => setLegal({...legal, ageFrom:Math.max(0, Math.min(21, Number(e.target.value) || 0))})} />
        </label>
        <p className="ab-admin-empty">{copy.preview}: {operator}</p>
      </article>
      <div className="ab-admin-savebar">
        <button type="button" disabled={busy} onClick={() => void save()}>{copy.save}</button>
        {note && <span role="status">{note}</span>}
      </div>
    </>
  );
}
