import { useEffect, useState } from 'react';
import type { AdminClient } from '@appbase/core/admin.js';
import { SecretField, useSecrets } from './admin-secrets';

/* Admin → «Способы оплаты». The instant-grant switch (settings.payment.instant: the pay button grants
   the purchase at once while no payment provider is connected) and the keys for each provider.
   A provider starts taking payments once its key is here and its checkout is connected. */

const PROVIDERS = [
  {
    id:'yookassa',
    title:{ru:'ЮKassa — российские карты', en:'YooKassa — Russian cards'},
    hint:{ru:'Личный кабинет ЮKassa → Интеграция → Ключи API.', en:'YooKassa dashboard → Integration → API keys.'},
    keys:[
      {name:'YOOKASSA_SHOP_ID', label:{ru:'shopId (номер магазина)', en:'shopId'}},
      {name:'YOOKASSA_SECRET_KEY', label:{ru:'Секретный ключ', en:'Secret key'}}
    ]
  },
  {
    id:'stripe',
    title:{ru:'Stripe — иностранные карты', en:'Stripe — international cards'},
    hint:{ru:'Stripe → Developers → API keys (Secret key) и Webhooks (Signing secret).', en:'Stripe → Developers → API keys (Secret key) and Webhooks (Signing secret).'},
    keys:[
      {name:'STRIPE_SECRET_KEY', label:{ru:'Secret key', en:'Secret key'}},
      {name:'STRIPE_WEBHOOK_SECRET', label:{ru:'Webhook signing secret', en:'Webhook signing secret'}}
    ]
  },
  {
    id:'google_play',
    title:{ru:'Google Play', en:'Google Play'},
    hint:{ru:'Google Cloud → сервисный аккаунт с доступом к Play Console → ключ JSON целиком.', en:'Google Cloud → service account with Play Console access → the whole JSON key.'},
    keys:[
      {name:'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', label:{ru:'Ключ сервисного аккаунта (JSON)', en:'Service account key (JSON)'}, multiline:true}
    ]
  },
  {
    id:'apple',
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
type ProviderReadiness = {
  id: string;
  state: 'disabled' | 'not_configured' | 'mapping_missing' | 'ready' | string;
  configured: boolean;
  mappedProducts: number;
  platforms: string[];
  distributions: string[];
  countries: string[];
};
type ProductMapping = {
  sku: string;
  title: string;
  kind: string;
  mappings: Record<string, Record<string, unknown>>;
};
type BillingReadiness = {
  enabled: boolean;
  providers: ProviderReadiness[];
  products: ProductMapping[];
};

function readinessLabel(state: string, ru: boolean){
  if(state === 'ready') return ru ? 'готов' : 'ready';
  if(state === 'mapping_missing') return ru ? 'ключи есть, товары не привязаны' : 'credentials set, products not mapped';
  if(state === 'not_configured') return ru ? 'не настроен' : 'not configured';
  if(state === 'disabled') return ru ? 'не используется' : 'disabled';
  return state || (ru ? 'неизвестно' : 'unknown');
}

function mappingText(provider: string, mapping: Record<string, unknown>){
  if(provider === 'stripe') return String(mapping.priceId || '');
  if(provider === 'yookassa'){
    const amount = Number(mapping.amount) || 0;
    const currency = String(mapping.currency || '');
    return amount > 0 && currency ? amount + ' ' + currency : '';
  }
  const productId = String(mapping.productId || '');
  const scope = provider === 'google_play' ? String(mapping.packageName || '') : String(mapping.bundleId || '');
  if(!productId) return '';
  return scope ? productId + ' · ' + scope : productId;
}

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
  const [readiness, setReadiness] = useState<BillingReadiness | null>(null);
  const ru = locale === 'ru';

  useEffect(() => {
    client.action(adminKey, 'billing_status')
      .then(result => setReadiness(result as unknown as BillingReadiness))
      .catch(() => setReadiness(null));
  }, [client, adminKey, keys.secrets]);

  return (
    <>
      <InstantSwitch client={client} adminKey={adminKey} locale={locale} />
      <p className="ab-admin-empty">
        {ru
          ? 'Ключи хранятся на сервере и сюда не возвращаются — видно только, задан ли ключ. «Готов» означает, что обязательные ключи заданы и хотя бы один товар привязан к этому способу оплаты.'
          : 'Keys are stored on the server and never shown again. “Ready” means the required credentials are set and at least one product is mapped to this payment method.'}
      </p>
      {PROVIDERS.map(provider => {
        const state = readiness?.providers?.find(item => item.id === provider.id);
        const mappings = (readiness?.products || []).flatMap(product => {
          const value = product.mappings?.[provider.id] || {};
          const text = mappingText(provider.id, value);
          return text ? [{...product, text}] : [];
        });
        return (
          <article className="ab-admin-panel" key={provider.id}>
            <h2>{provider.title[locale]}</h2>
            {state && (
              <div className="ab-admin-status-line">
                <span><b>{readinessLabel(state.state, ru)}</b></span>
                <span>{ru ? 'товаров' : 'products'}: <b>{state.mappedProducts}</b></span>
                <span>{[...(state.platforms || []), ...(state.distributions || []), ...(state.countries || [])].join(' · ')}</span>
              </div>
            )}
            <p className="ab-admin-empty">{provider.hint[locale]}</p>
            {provider.keys.map(key => (
              <SecretField key={key.name} name={key.name} label={key.label[locale]} state={keys.secrets?.[key.name]}
                onSave={keys.save} locale={locale} multiline={'multiline' in key && key.multiline} />
            ))}
            {mappings.length ? (
              <ul className="ab-admin-services">
                {mappings.map(product => (
                  <li key={product.sku}>
                    <span>{product.title || product.sku}</span>
                    <b>{product.text}</b>
                  </li>
                ))}
              </ul>
            ) : state?.configured ? (
              <p className="ab-admin-empty">
                {ru ? 'Ключи заданы, но ни один товар ещё не привязан к этому провайдеру.' : 'Credentials are set, but no product is mapped to this provider yet.'}
              </p>
            ) : null}
          </article>
        );
      })}
    </>
  );
}
