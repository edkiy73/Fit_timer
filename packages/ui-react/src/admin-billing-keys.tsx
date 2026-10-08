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
type ProviderHealth = {
  status: 'unknown' | 'healthy' | 'unhealthy' | string;
  lastOperation?: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastError?: string;
};
type ProviderReadiness = {
  id: string;
  state: 'disabled' | 'not_configured' | 'mapping_missing' | 'ready' | 'healthy' | 'unhealthy' | string;
  enabled: boolean;
  configured: boolean;
  mappedProducts: number;
  health?: ProviderHealth;
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
  if(state === 'healthy') return ru ? 'работает' : 'healthy';
  if(state === 'unhealthy') return ru ? 'есть ошибка' : 'unhealthy';
  if(state === 'ready') return ru ? 'готов, ждём первую проверку' : 'ready, no checks yet';
  if(state === 'mapping_missing') return ru ? 'ключи есть, товары не привязаны' : 'credentials set, products not mapped';
  if(state === 'not_configured') return ru ? 'не настроен' : 'not configured';
  if(state === 'disabled') return ru ? 'не используется' : 'disabled';
  return state || (ru ? 'неизвестно' : 'unknown');
}

function operationLabel(value: string, ru: boolean){
  const labels: Record<string, [string, string]> = {
    checkout:['оплата','checkout'],
    webhook:['уведомление','webhook'],
    verify:['проверка покупки','purchase verification'],
    restore:['восстановление','restore'],
    renewal:['автопродление','renewal']
  };
  const pair = labels[value];
  return pair ? pair[ru ? 0 : 1] : value;
}

function timeLabel(value: string | undefined, locale: 'ru' | 'en'){
  if(!value) return '';
  const time = Date.parse(value);
  if(!Number.isFinite(time)) return value;
  try{ return new Date(time).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US'); }
  catch(_){ return value; }
}

function healthText(health: ProviderHealth | undefined, locale: 'ru' | 'en'){
  const ru = locale === 'ru';
  if(!health || health.status === 'unknown'){
    return ru ? 'Реальных проверок этого провайдера ещё не было.' : 'No real provider checks yet.';
  }
  const operation = operationLabel(String(health.lastOperation || ''), ru);
  if(health.status === 'unhealthy'){
    const when = timeLabel(health.lastErrorAt, locale);
    const error = String(health.lastError || 'provider_error');
    return ru
      ? `Последняя ошибка: ${operation || 'операция'} · ${error}${when ? ' · ' + when : ''}`
      : `Last error: ${operation || 'operation'} · ${error}${when ? ' · ' + when : ''}`;
  }
  const when = timeLabel(health.lastSuccessAt, locale);
  return ru
    ? `Последняя успешная операция: ${operation || 'проверка'}${when ? ' · ' + when : ''}`
    : `Last successful operation: ${operation || 'check'}${when ? ' · ' + when : ''}`;
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

function mappingDraft(provider: string, mapping: Record<string, unknown>){
  if(provider === 'stripe') return {priceId:String(mapping.priceId || '')};
  if(provider === 'yookassa') return {
    amount:String(mapping.amount || ''),
    currency:String(mapping.currency || '')
  };
  if(provider === 'google_play') return {
    productId:String(mapping.productId || ''),
    packageName:String(mapping.packageName || '')
  };
  return {
    productId:String(mapping.productId || ''),
    bundleId:String(mapping.bundleId || '')
  };
}

function MappingEditor({client, adminKey, locale, provider, product, onSaved}: {
  client: AdminClient;
  adminKey: string;
  locale: 'ru' | 'en';
  provider: string;
  product: ProductMapping;
  onSaved(next: BillingReadiness): void;
}){
  const ru = locale === 'ru';
  const [draft, setDraft] = useState<Record<string, string>>(() => mappingDraft(provider, product.mappings?.[provider] || {}));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    setDraft(mappingDraft(provider, product.mappings?.[provider] || {}));
  }, [provider, product]);

  const field = (name: string, label: string, type: 'text' | 'number' = 'text') => (
    <label>
      <span>{label}</span>
      <input type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined}
        value={draft[name] || ''} onChange={e => setDraft(current => ({...current, [name]:e.target.value}))} />
    </label>
  );

  async function save(){
    setBusy(true);
    setNote('');
    try{
      const mapping: Record<string, unknown> = {...draft};
      if(provider === 'yookassa') mapping.amount = Number(draft.amount) || 0;
      const result = await client.action(adminKey, 'billing_mapping_set', {
        sku:product.sku,
        provider,
        mapping
      });
      onSaved(result as unknown as BillingReadiness);
      setNote(ru ? 'Сохранено.' : 'Saved.');
    }catch(error){
      setNote((ru ? 'Не сохранилось: ' : 'Not saved: ')
        + String((error as {code?: string})?.code || 'error'));
    }finally{
      setBusy(false);
    }
  }

  return (
    <div className="ab-admin-fieldset">
      <div className="ab-admin-row">
        <div>
          <strong>{product.title || product.sku}</strong>
          <div className="ab-admin-empty">{product.sku}</div>
        </div>
        {provider === 'stripe' && field('priceId', 'priceId')}
        {provider === 'yookassa' && field('amount', ru ? 'Сумма' : 'Amount', 'number')}
        {provider === 'yookassa' && field('currency', ru ? 'Валюта' : 'Currency')}
        {provider === 'google_play' && field('productId', 'productId')}
        {provider === 'google_play' && field('packageName', 'packageName')}
        {provider === 'apple' && field('productId', 'productId')}
        {provider === 'apple' && field('bundleId', 'bundleId')}
        <button type="button" className="ab-admin-secondary" disabled={busy} onClick={() => void save()}>
          {busy ? (ru ? 'Сохраняю…' : 'Saving…') : (ru ? 'Сохранить' : 'Save')}
        </button>
      </div>
      {note && <p className="ab-admin-empty" role="status">{note}</p>}
    </div>
  );
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
  const [busyProvider, setBusyProvider] = useState('');
  const [providerNote, setProviderNote] = useState('');
  const ru = locale === 'ru';

  useEffect(() => {
    client.action(adminKey, 'billing_status')
      .then(result => setReadiness(result as unknown as BillingReadiness))
      .catch(() => setReadiness(null));
  }, [client, adminKey, keys.secrets]);

  async function toggleProvider(provider: string, enabled: boolean){
    setBusyProvider(provider);
    setProviderNote('');
    try{
      const result = await client.action(adminKey, 'billing_provider_set', {provider, enabled});
      setReadiness(result as unknown as BillingReadiness);
      setProviderNote(enabled
        ? (ru ? 'Новые покупки этим способом включены.' : 'New purchases with this provider are enabled.')
        : (ru ? 'Новые покупки отключены. Возвраты, продления и восстановление продолжают обрабатываться.' : 'New purchases are disabled. Refunds, renewals and restore still reconcile.'));
    }catch(error){
      setProviderNote((ru ? 'Не сохранилось: ' : 'Not saved: ') + String((error as {code?: string})?.code || 'error'));
    }finally{
      setBusyProvider('');
    }
  }

  return (
    <>
      <InstantSwitch client={client} adminKey={adminKey} locale={locale} />
      <p className="ab-admin-empty">
        {ru
          ? 'Ключи хранятся на сервере и сюда не возвращаются — видно только, задан ли ключ. «Готов» означает, что обязательные ключи заданы и хотя бы один товар привязан к этому способу оплаты.'
          : 'Keys are stored on the server and never shown again. “Ready” means the required credentials are set and at least one product is mapped to this payment method.'}
      </p>
      {providerNote && <p className="ab-admin-empty" role="status">{providerNote}</p>}
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
              <>
                <div className="ab-admin-status-line">
                  <span><b>{readinessLabel(state.state, ru)}</b></span>
                  <span>{ru ? 'товаров' : 'products'}: <b>{state.mappedProducts}</b></span>
                  <span>{[...(state.platforms || []), ...(state.distributions || []), ...(state.countries || [])].join(' · ')}</span>
                </div>
                <p className="ab-admin-empty">{healthText(state.health, locale)}</p>
                <label className="ab-admin-check">
                  <input type="checkbox" checked={state.enabled !== false} disabled={busyProvider === provider.id}
                    onChange={e => void toggleProvider(provider.id, e.target.checked)} />
                  <span>{ru ? 'Разрешать новые покупки этим способом' : 'Allow new purchases with this provider'}</span>
                </label>
              </>
            )}
            <p className="ab-admin-empty">{provider.hint[locale]}</p>
            {provider.keys.map(key => (
              <SecretField key={key.name} name={key.name} label={key.label[locale]} state={keys.secrets?.[key.name]}
                onSave={keys.save} locale={locale} multiline={'multiline' in key && key.multiline} />
            ))}
            <div className="ab-admin-stack">
              {(readiness?.products || []).map(product => (
                <MappingEditor key={product.sku} client={client} adminKey={adminKey} locale={locale}
                  provider={provider.id} product={product} onSaved={setReadiness} />
              ))}
            </div>
            {!mappings.length && state?.configured ? (
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
