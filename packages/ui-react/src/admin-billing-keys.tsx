import { useEffect, useState } from 'react';
import type { AdminClient } from '@appbase/core/admin.js';
import { SecretField, useSecrets } from './admin-secrets';

/* Admin → «Способы оплаты». The instant-grant switch (settings.payment.instant: the pay button grants
   the purchase at once while no payment provider is connected) and the keys for each provider.
   A provider starts taking payments once its key is here and its checkout is connected. */

const PROVIDERS = [
  {
    title:{ru:'ЮKassa — российские карты', en:'YooKassa — Russian cards'},
    hint:{ru:'Личный кабинет ЮKassa → Интеграция → Ключи API.', en:'YooKassa dashboard → Integration → API keys.'},
    keys:[
      {name:'YOOKASSA_SHOP_ID', label:{ru:'shopId (номер магазина)', en:'shopId'}},
      {name:'YOOKASSA_SECRET_KEY', label:{ru:'Секретный ключ', en:'Secret key'}}
    ]
  },
  {
    title:{ru:'Stripe — иностранные карты', en:'Stripe — international cards'},
    hint:{ru:'Stripe → Developers → API keys (Secret key) и Webhooks (Signing secret).', en:'Stripe → Developers → API keys (Secret key) and Webhooks (Signing secret).'},
    keys:[
      {name:'STRIPE_SECRET_KEY', label:{ru:'Secret key', en:'Secret key'}},
      {name:'STRIPE_WEBHOOK_SECRET', label:{ru:'Webhook signing secret', en:'Webhook signing secret'}}
    ]
  },
  {
    title:{ru:'Google Play', en:'Google Play'},
    hint:{ru:'Google Cloud → сервисный аккаунт с доступом к Play Console → ключ JSON целиком.', en:'Google Cloud → service account with Play Console access → the whole JSON key.'},
    keys:[
      {name:'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', label:{ru:'Ключ сервисного аккаунта (JSON)', en:'Service account key (JSON)'}, multiline:true}
    ]
  },
  {
    title:{ru:'App Store', en:'App Store'},
    hint:{ru:'App Store Connect → Users and Access → Integrations → In-App Purchase: Issuer ID, Key ID и файл .p8.', en:'App Store Connect → Users and Access → Integrations → In-App Purchase: Issuer ID, Key ID and the .p8 file.'},
    keys:[
      {name:'APPSTORE_ISSUER_ID', label:{ru:'Issuer ID', en:'Issuer ID'}},
      {name:'APPSTORE_KEY_ID', label:{ru:'Key ID', en:'Key ID'}},
      {name:'APPSTORE_PRIVATE_KEY', label:{ru:'Содержимое файла .p8', en:'Contents of the .p8 file'}, multiline:true}
    ]
  }
] as const;

type Settings = {payment?: {instant?: boolean}} & Record<string, unknown>;

function InstantSwitch({client, adminKey, locale}: {client: AdminClient; adminKey: string; locale: 'ru' | 'en'}){
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const ru = locale === 'ru';

  useEffect(() => {
    client.action(adminKey, 'settings_get')
      .then(result => setSettings(result.settings as Settings))
      .catch(() => setNote(ru ? 'Не удалось загрузить настройки.' : 'Could not load settings.'));
  }, [client, adminKey, ru]);

  async function toggle(instant: boolean){
    if(!settings) return;
    setBusy(true);
    setNote('');
    try{
      const result = await client.action(adminKey, 'save_settings', {settings:{...settings, payment:{...settings.payment, instant}}});
      setSettings(result.settings as Settings);
      setNote(instant
        ? (ru ? 'Включено: кнопка «Оплатить» сразу открывает покупку.' : 'On: the pay button grants the purchase at once.')
        : (ru ? 'Выключено: покупки идут только через подключённую оплату.' : 'Off: purchases go only through a connected payment provider.'));
    }catch(error){
      setNote((ru ? 'Не сохранилось: ' : 'Not saved: ') + String((error as {code?: string})?.code || (ru ? 'ошибка' : 'error')));
    }finally{
      setBusy(false);
    }
  }

  return (
    <article className="ab-admin-panel">
      <h2>{ru ? 'Покупки без оплаты' : 'Purchases without payment'}</h2>
      <p className="ab-admin-empty">{ru
        ? 'Пока оплата не подключена, кнопка «Оплатить» сразу открывает выбранный курс или Plus. Выключи, когда подключишь ЮKassa или магазин приложений.'
        : 'Until payments are connected, the pay button unlocks the chosen course or Plus at once. Turn it off once YooKassa or an app store is connected.'}</p>
      {settings && (
        <label className="ab-admin-check">
          <input type="checkbox" checked={settings.payment?.instant !== false} disabled={busy}
            onChange={e => void toggle(e.target.checked)} />
          <span>{ru ? 'Выдавать покупку сразу' : 'Grant purchases at once'}</span>
        </label>
      )}
      {note && <p className="ab-admin-empty" role="status">{note}</p>}
    </article>
  );
}

export function AdminBillingKeys({client, adminKey, locale = 'ru'}: {client: AdminClient; adminKey: string; locale?: 'ru' | 'en'}){
  const keys = useSecrets(client, adminKey);
  return (
    <>
      <InstantSwitch client={client} adminKey={adminKey} locale={locale} />
      <p className="ab-admin-empty">
        {locale === 'ru'
          ? 'Ключи хранятся на сервере и сюда не возвращаются — видно только, задан ли ключ. Оплата каждым способом заработает, когда его подключение будет готово.'
          : 'Keys are stored on the server and never shown again — only whether a key is set. Each provider starts taking payments once its checkout is connected.'}
      </p>
      {PROVIDERS.map(provider => (
        <article className="ab-admin-panel" key={provider.title.en}>
          <h2>{provider.title[locale]}</h2>
          <p className="ab-admin-empty">{provider.hint[locale]}</p>
          {provider.keys.map(key => (
            <SecretField key={key.name} name={key.name} label={key.label[locale]} state={keys.secrets?.[key.name]}
              onSave={keys.save} locale={locale} multiline={'multiline' in key && key.multiline} />
          ))}
        </article>
      ))}
    </>
  );
}
