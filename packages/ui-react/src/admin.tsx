import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AdminClient, AdminHealth } from '@appbase/core/admin.js';
import './admin.css';
import { AdminAiSettings } from './admin-ai';
import { AdminBillingKeys } from './admin-billing-keys';

export interface AdminSectionContext {
  client: AdminClient;
  adminKey: string;
  locale: 'ru' | 'en';
}

export interface AdminSection {
  id: string;
  label: string;
  /** Sidebar group. Product modules can share one group or create their own. */
  group?: string;
  render(context: AdminSectionContext): ReactNode;
}

export interface AdminPanelProps {
  client: AdminClient;
  productName: string;
  locale?: 'ru' | 'en';
  extraSections?: readonly AdminSection[];
}

const COPY = {
  ru: {
    title:'Админка', key:'Ключ администратора', connect:'Войти', disconnect:'Выйти',
    refresh:'Обновить', health:'Состояние', overview:'Обзор', users:'Пользователи',
    errors:'Ошибки', storage:'Хранилище', noKey:'Введи ключ администратора.',
    badKey:'Ключ не подошёл. Проверь его и попробуй ещё раз.', requestFailed:'Не удалось получить данные.',
    status:'Статус', deployment:'Сборка', warnings:'Что стоит сделать', services:'Сервисы',
    statusOk:'Всё работает', statusWarning:'Работает, но не всё настроено', statusError:'Есть сбой — ученики могут не сохранить прогресс', statusLoading:'Проверяю…',
    serviceStorage:'Хранилище данных', serviceMail:'Вход по коду из письма', serviceAi:'ИИ (разбор ошибок, разговор)', servicePush:'Уведомления на телефон', serviceBilling:'Оплата',
    serviceOn:'работает', serviceOff:'не настроено', serviceMemory:'только временная память — данные пропадут', serviceBroken:'сбой',
    buildLine:'Сейчас на сайте версия из изменения', details:'Подробности для разработчика',
    analytics:'Аналитика', accounts:'Аккаунты', totalErrors:'Ошибок клиента',
    noErrors:'Ошибок клиента нет.', noUsers:'Аккаунтов пока нет.', email:'Email',
    premium:'Подписка', seen:'Последняя активность', count:'Количество',
    clear:'Очистить', migration:'Миграция хранилища',
    owned:'Куплено', access:'Выдать доступ', sku:'Курс или покупка', grant:'Выдать', revoke:'Забрать',
    premiumDays:'Подписка, дней', grantPremium:'Выдать подписку', revokePremium:'Забрать подписку',
    search:'Найти по почте', pick:'Нажми на человека — его карточка откроется выше.', nobody:'Никого не нашлось.',
    card:'Сейчас у человека', cardCourses:'Курсы', cardNone:'нет', cardPremium:'Подписка', cardUntil:'до', cardSeen:'Заходил', cardSince:'Аккаунт с', cardNew:'Такого аккаунта ещё нет — он создастся при выдаче доступа.', never:'—',
    accessDone:'Готово.', accessHint:'Для семьи, промо или возврата. Курс открывается навсегда, подписка — на выбранное число дней. Если человек ещё не заходил, аккаунт создастся сам.',
    loginCode:'Код для входа', loginCodeDone:'Одноразовый код для', loginCodeHint:'действует 15 минут. На экране входа: email → «У меня есть код».',
    payments:'Платежи', noPayments:'Платежей пока нет.', when:'Когда', provider:'Провайдер', event:'Событие', account:'Аккаунт',
    mainGroup:'Главное', accountsGroup:'Аккаунты', systemGroup:'Система', productGroup:'Продукт', menu:'Меню',
    settingsGroup:'Настройки', ai:'ИИ', billingKeys:'Оплата: ключи'
  },
  en: {
    title:'Admin', key:'ADMIN_KEY', connect:'Connect', disconnect:'Sign out',
    refresh:'Refresh', health:'Status', overview:'Overview', users:'Users',
    errors:'Errors', storage:'Storage', noKey:'Enter ADMIN_KEY for protected data.',
    badKey:'Wrong ADMIN_KEY or access denied.', requestFailed:'Could not load data.',
    status:'Status', deployment:'Build', warnings:'To do', services:'Services',
    statusOk:'Everything works', statusWarning:'Works, but not everything is set up', statusError:'Something is broken — learners may lose progress', statusLoading:'Checking…',
    serviceStorage:'Data storage', serviceMail:'Sign-in by email code', serviceAi:'AI (mistake explanations, talk)', servicePush:'Phone notifications', serviceBilling:'Payments',
    serviceOn:'works', serviceOff:'not set up', serviceMemory:'temporary memory only — data will be lost', serviceBroken:'broken',
    buildLine:'The site runs the version from change', details:'Details for developers',
    analytics:'Analytics', accounts:'Accounts', totalErrors:'Client errors',
    noErrors:'No client errors.', noUsers:'No accounts yet.', email:'Email',
    premium:'Premium', seen:'Last active', count:'Count',
    clear:'Clear', migration:'Storage migration',
    owned:'Purchases', access:'Give access', sku:'Course or purchase', grant:'Grant', revoke:'Revoke',
    search:'Find by email', pick:'Tap a person to open their card above.', nobody:'Nobody found.',
    card:'This person has', cardCourses:'Courses', cardNone:'none', cardPremium:'Premium', cardUntil:'until', cardSeen:'Last active', cardSince:'Account since', cardNew:'No such account yet — it is created when you give access.', never:'—',
    premiumDays:'Premium, days', grantPremium:'Grant Premium', revokePremium:'Revoke Premium',
    accessDone:'Done.', accessHint:'Manual access: family, promo, refund. Purchases are permanent, Premium lasts for a period. The account is created if it does not exist yet.',
    loginCode:'Sign-in code', loginCodeDone:'One-time code for', loginCodeHint:'valid for 15 minutes. On the sign-in screen: email → “I have a code”.',
    payments:'Payments', noPayments:'No payments yet.', when:'When', provider:'Provider', event:'Event', account:'Account',
    mainGroup:'Main', accountsGroup:'Accounts', systemGroup:'System', productGroup:'Product', menu:'Menu',
    settingsGroup:'Settings', ai:'AI', billingKeys:'Payments: keys'
  }
} as const;

type CoreTab = 'health' | 'overview' | 'users' | 'payments' | 'errors' | 'storage' | 'ai' | 'billing-keys';
type Tab = CoreTab | string;

type Copy = (typeof COPY)[keyof typeof COPY];

/* Manual access for one account: a purchase for good (SKU from the product catalog)
   or Premium for a number of days. */
type Product = {sku: string; title: string};
type Row = 'course' | 'premium' | 'code';

export function formatAdminDate(value: unknown, locale: 'ru' | 'en', withTime = true){
  const date = new Date(String(value || ''));
  if(!value || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US', withTime
    ? {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}
    : {day:'numeric', month:'short', year:'numeric'});
}

function productTitle(products: Product[], sku: unknown){
  return products.find(p => p.sku === sku)?.title || String(sku);
}

function AccessForm({client, adminKey, copy, locale, onChanged, email, setEmail, products, user}: {
  client: AdminClient; adminKey: string; copy: Copy; locale: 'ru' | 'en'; onChanged(): void;
  email: string; setEmail(value: string): void; products: Product[]; user: Record<string, unknown> | null;
}){
  const [sku, setSku] = useState('');
  const [days, setDays] = useState('30');
  const [message, setMessage] = useState('');
  const [messageAt, setMessageAt] = useState<Row>('course');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if(products[0]) setSku(current => current || products[0]!.sku); }, [products]);
  useEffect(() => { setMessage(''); }, [email]);
  const owned = user && Array.isArray(user.owned) ? user.owned as string[] : [];
  const sub = user?.sub as {until?: string} | null | undefined;

  async function run(action: string, body: Record<string, unknown>, row: Row){
    setBusy(true);
    setMessageAt(row);
    setMessage('');
    try{
      // Family members may not have signed in yet (or mail may be down): granting
      // access creates the account first, so the grant never fails on a new email.
      if(!body.revoke) await client.action(adminKey, 'user_create', {email});
      await client.action(adminKey, action, {email, ...body});
      setMessage(copy.accessDone + ' ' + email);
      onChanged();
    }catch(e){
      setMessage(String((e as {code?: string})?.code || copy.requestFailed));
    }finally{
      setBusy(false);
    }
  }

  async function loginCode(){
    setBusy(true);
    setMessageAt('code');
    setMessage('');
    try{
      const result = await client.action(adminKey, 'user_test_code', {email});
      setMessage(copy.loginCodeDone + ' ' + String(result.email || email) + ': ' + String(result.code || '') + ' — ' + copy.loginCodeHint);
    }catch(e){
      setMessage(String((e as {code?: string})?.code || copy.requestFailed));
    }finally{
      setBusy(false);
    }
  }

  const note = (row: Row) => message && messageAt === row ? <p className="ab-admin-feedback" role="status">{message}</p> : null;
  return (
    <article className="ab-admin-panel ab-admin-access">
      <h2>{copy.access}</h2>
      <p className="ab-admin-empty">{copy.accessHint}</p>
      <label><span>{copy.email}</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      {email.includes('@') && (user ? (
        <dl className="ab-admin-person" aria-label={copy.card}>
          <div><dt>{copy.cardCourses}</dt><dd>{owned.length ? owned.map(item => (
            <span className="ab-admin-chip" key={item}>{productTitle(products, item)}
              <button type="button" className="ab-admin-link" aria-label={copy.revoke + ': ' + productTitle(products, item)} disabled={busy} onClick={() => void run('user_owned', {sku:item, revoke:true}, 'course')}>{copy.revoke}</button>
            </span>
          )) : copy.cardNone}</dd></div>
          <div><dt>{copy.cardPremium}</dt><dd>{user.premium ? copy.cardUntil + ' ' + formatAdminDate(sub?.until, locale, false) : copy.cardNone}</dd></div>
          <div><dt>{copy.cardSeen}</dt><dd>{formatAdminDate(user.seen, locale) || copy.never}</dd></div>
          <div><dt>{copy.cardSince}</dt><dd>{formatAdminDate(user.since, locale) || copy.never}</dd></div>
        </dl>
      ) : <p className="ab-admin-empty">{copy.cardNew}</p>)}
      <div className="ab-admin-row">
        <label><span>{copy.sku}</span>
          {products.length
            ? <select value={sku} onChange={e => setSku(e.target.value)}>{products.map(p => <option key={p.sku} value={p.sku}>{p.title}</option>)}</select>
            : <input value={sku} onChange={e => setSku(e.target.value)} />}
        </label>
        <button type="button" disabled={busy || !email || !sku} onClick={() => void run('user_owned', {sku}, 'course')}>{copy.grant}</button>
        <button type="button" className="ab-admin-secondary" disabled={busy || !email || !sku} onClick={() => void run('user_owned', {sku, revoke:true}, 'course')}>{copy.revoke}</button>
      </div>
      {note('course')}
      <div className="ab-admin-row">
        <label><span>{copy.premiumDays}</span><input type="number" min={1} max={3650} value={days} onChange={e => setDays(e.target.value)} /></label>
        <button type="button" disabled={busy || !email} onClick={() => void run('user_premium', {days:Number(days) || 30}, 'premium')}>{copy.grantPremium}</button>
        <button type="button" className="ab-admin-secondary" disabled={busy || !email} onClick={() => void run('user_premium', {revoke:true}, 'premium')}>{copy.revokePremium}</button>
      </div>
      {note('premium')}
      <div className="ab-admin-row">
        <button type="button" className="ab-admin-secondary" disabled={busy || !email} onClick={() => void loginCode()}>{copy.loginCode}</button>
      </div>
      {note('code')}
    </article>
  );
}

function JsonCard({value}: {value: unknown}){
  return <pre className="ab-admin-json">{JSON.stringify(value, null, 2)}</pre>;
}

type Service = {configured?: boolean};

/* «Состояние»: one plain sentence, what works and what does not; raw data stays folded. */
function HealthView({health, copy}: {health: AdminHealth | null; copy: Copy}){
  const services = (health?.services || {}) as Record<string, Service>;
  const storage = (health?.storage || {}) as {status?: string; mode?: string};
  const build = (health?.deployment || {}) as unknown as {commit?: string | null; env?: string | null};
  const title = !health ? copy.statusLoading
    : health.status === 'ok' ? copy.statusOk
    : health.status === 'warning' ? copy.statusWarning
    : copy.statusError;
  const storageState = storage.mode === 'memory' ? copy.serviceMemory
    : storage.status === 'ok' ? copy.serviceOn : copy.serviceBroken;
  const rows: Array<[string, boolean, string]> = [
    [copy.serviceStorage, storage.status === 'ok' && storage.mode !== 'memory', storageState],
    [copy.serviceMail, !!services.mail?.configured, services.mail?.configured ? copy.serviceOn : copy.serviceOff],
    [copy.serviceAi, !!services.ai?.configured, services.ai?.configured ? copy.serviceOn : copy.serviceOff],
    [copy.servicePush, !!services.push?.configured, services.push?.configured ? copy.serviceOn : copy.serviceOff],
    [copy.serviceBilling, !!services.billing?.configured, services.billing?.configured ? copy.serviceOn : copy.serviceOff]
  ];
  return (
    <section className="ab-admin-stack">
      <article className="ab-admin-panel ab-admin-status" data-status={health?.status || 'loading'}>
        <h2>{title}</h2>
        {build && typeof build === 'object' && build.commit && (
          <p className="ab-admin-empty">{copy.buildLine} {build.commit}{build.env ? ' ('+build.env+')' : ''}.</p>
        )}
        <ul className="ab-admin-services">
          {rows.map(([name, ok, state]) => (
            <li key={name} data-ok={ok || undefined}><span>{name}</span><b>{state}</b></li>
          ))}
        </ul>
      </article>
      {!!health?.warnings?.length && (
        <article className="ab-admin-panel"><h2>{copy.warnings}</h2><ul>{health.warnings.map(x => <li key={x}>{x}</li>)}</ul></article>
      )}
      <details className="ab-admin-panel ab-admin-details">
        <summary>{copy.details}</summary>
        <JsonCard value={{deployment:health?.deployment, services:health?.services, probes:health?.probes}} />
      </details>
    </section>
  );
}

// One shared empty list: a fresh [] default on every render would re-create the loaders
// and refetch protected data in a loop (hundreds of requests, then the admin rate limit).
const NO_SECTIONS: readonly AdminSection[] = [];

export function AdminPanel({client, productName, locale='ru', extraSections=NO_SECTIONS}: AdminPanelProps){
  const copy = COPY[locale];
  const [key, setKey] = useState(() => {
    try { return sessionStorage.getItem('appbase.admin.key') || ''; } catch (_) { return ''; }
  });
  const [draftKey, setDraftKey] = useState(key);
  const [tab, setTab] = useState<Tab>('health');
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [accessEmail, setAccessEmail] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);

  const tabs = useMemo(() => [
    ['health', copy.health], ['overview', copy.overview], ['users', copy.users], ['payments', copy.payments],
    ['errors', copy.errors], ['storage', copy.storage], ['ai', copy.ai], ['billing-keys', copy.billingKeys],
    ...extraSections.map(section => [section.id, section.label] as const)
  ] as ReadonlyArray<readonly [string,string]>, [copy, extraSections]);

  const navGroups = useMemo(() => {
    const core = [
      {label:copy.mainGroup, ids:['health','overview']},
      {label:copy.accountsGroup, ids:['users','payments','errors']},
      {label:copy.settingsGroup, ids:['ai','billing-keys']},
      {label:copy.systemGroup, ids:['storage']}
    ];
    const extras = new Map<string,string[]>();
    for(const section of extraSections){
      const group = section.group || copy.productGroup;
      const list = extras.get(group) || [];
      list.push(section.id);
      extras.set(group,list);
    }
    return [
      ...core,
      ...Array.from(extras, ([label,ids]) => ({label,ids}))
    ];
  }, [copy, extraSections]);

  const currentLabel = tabs.find(([id]) => id === tab)?.[1] || copy.title;

  const loadHealth = useCallback(async () => {
    try{
      setHealth(await client.health());
    }catch(_){
      setHealth({ok:false,status:'error',warnings:[copy.requestFailed]});
    }
  }, [client, copy.requestFailed]);

  const loadProtected = useCallback(async (target: Tab, adminKey = key) => {
    // These tabs load their own data.
    if(target === 'health' || target === 'ai' || target === 'billing-keys' || extraSections.some(section => section.id === target)) return;
    if(!adminKey){ setData(null); return; }
    setBusy(true);
    setError('');
    try{
      if(target === 'overview'){
        const [analytics, errors, users] = await Promise.all([
          client.action(adminKey, 'analytics_stats', {days:30}),
          client.action(adminKey, 'client_errors'),
          client.action(adminKey, 'users_list')
        ]);
        const errorStats = (errors.stats || {}) as Record<string, unknown>;
        const userList = Array.isArray(users.users) ? users.users : [];
        setData({
          analytics:analytics.stats || {},
          accounts:userList.length,
          clientErrors:errorStats.total || 0
        });
      }else if(target === 'users'){
        setData(await client.action(adminKey, 'users_list'));
      }else if(target === 'payments'){
        setData(await client.action(adminKey, 'billing_log'));
      }else if(target === 'errors'){
        setData(await client.action(adminKey, 'client_errors'));
      }else{
        setData(await client.action(adminKey, 'storage_status'));
      }
    }catch(e){
      const status = Number((e as {status?: number})?.status || 0);
      setError(status === 401 || status === 403 ? copy.badKey : copy.requestFailed);
      setData(null);
    }finally{
      setBusy(false);
    }
  }, [client, copy.badKey, copy.requestFailed, extraSections, key]);

  useEffect(() => { void loadHealth(); }, [loadHealth]);
  useEffect(() => { void loadProtected(tab); }, [tab, key, loadProtected]);
  // Course titles for the people list and the learner card (instead of raw SKUs).
  useEffect(() => {
    if(tab !== 'users' || !key || products.length) return;
    let live = true;
    client.action(key, 'products_list').then(result => {
      if(live && Array.isArray(result.products)) setProducts(result.products as Product[]);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [tab, key, client, products.length]);

  function connect(){
    const next = draftKey.trim();
    setKey(next);
    try{
      if(next) sessionStorage.setItem('appbase.admin.key', next);
      else sessionStorage.removeItem('appbase.admin.key');
    }catch(_){}
  }

  function disconnect(){
    setKey('');
    setDraftKey('');
    setData(null);
    setNavOpen(false);
    try{ sessionStorage.removeItem('appbase.admin.key'); }catch(_){}
  }

  function selectTab(next: Tab){
    setTab(next);
    setNavOpen(false);
    window.scrollTo({top:0,left:0,behavior:'auto'});
  }

  async function clearError(sig: string){
    if(!key) return;
    setBusy(true);
    try{
      await client.action(key, 'client_error_clear', {sig});
      await loadProtected('errors', key);
    }catch(_){
      setError(copy.requestFailed);
    }finally{ setBusy(false); }
  }

  const users = tab === 'users' && data && Array.isArray(data.users) ? data.users as Array<Record<string, unknown>> : [];
  const needle = userQuery.trim().toLowerCase();
  const shownUsers = needle ? users.filter(user => String(user.email || '').toLowerCase().includes(needle)) : users;
  const pickedEmail = accessEmail.trim().toLowerCase();
  const pickedUser = pickedEmail ? users.find(user => String(user.email || '').toLowerCase() === pickedEmail) || null : null;
  const payments = tab === 'payments' && data && Array.isArray(data.events) ? data.events as Array<Record<string, unknown>> : [];
  const errorStats = tab === 'errors' && data && data.stats && typeof data.stats === 'object'
    ? data.stats as Record<string, unknown> : null;
  const errors = errorStats && Array.isArray(errorStats.items) ? errorStats.items as Array<Record<string, unknown>> : [];

  if(!key){
    return (
      <main className="ab-admin-gate">
        <section className="ab-admin-gate-card">
          <div className="ab-admin-kicker">{productName}</div>
          <h1>{copy.title}</h1>
          <p>{copy.noKey}</p>
          <div className="ab-admin-auth">
            <input
              aria-label={copy.key}
              type="password"
              value={draftKey}
              onChange={e => setDraftKey(e.target.value)}
              onKeyDown={e => { if(e.key === 'Enter') connect(); }}
              placeholder={copy.key}
              autoComplete="off"
            />
            <button type="button" onClick={connect}>{copy.connect}</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="ab-admin-shell" data-nav-open={navOpen || undefined}>
      <aside className="ab-admin-side" aria-label={copy.title}>
        <div className="ab-admin-brand">
          <div>
            <strong>{productName}</strong>
            <small>{copy.title}</small>
          </div>
          <button type="button" className="ab-admin-signout" onClick={disconnect}>{copy.disconnect}</button>
        </div>
        <nav className="ab-admin-nav">
          {navGroups.map(group => (
            <div className="ab-admin-nav-group" key={group.label}>
              <div className="ab-admin-nav-label">{group.label}</div>
              {group.ids.map(id => {
                const item = tabs.find(([tabId]) => tabId === id);
                if(!item) return null;
                return (
                  <button key={id} type="button" data-active={tab === id || undefined} onClick={() => selectTab(id)}>
                    <span>{item[1]}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <button className="ab-admin-shade" aria-label={copy.menu} type="button" onClick={() => setNavOpen(false)} />

      <div className="ab-admin-main">
        <header className="ab-admin-topbar">
          <div className="ab-admin-topbar-inner">
            <button className="ab-admin-menu" aria-label={copy.menu} type="button" onClick={() => setNavOpen(true)}>☰</button>
            <div>
              <h1>{currentLabel}</h1>
              <small>{productName} · {copy.title}</small>
            </div>
          </div>
        </header>
        <main className="ab-admin">

      {tab === 'health' && <HealthView health={health} copy={copy} />}

      {error && <p className="ab-admin-error" role="alert">{error}</p>}
      {busy && <p className="ab-admin-empty">…</p>}

      {tab === 'overview' && key && data && (
        <section className="ab-admin-stack">
          <div className="ab-admin-grid">
            <article className="ab-admin-card"><span>{copy.accounts}</span><strong>{String(data.accounts ?? 0)}</strong></article>
            <article className="ab-admin-card"><span>{copy.totalErrors}</span><strong>{String(data.clientErrors ?? 0)}</strong></article>
          </div>
          <article className="ab-admin-panel"><h2>{copy.analytics}</h2><JsonCard value={data.analytics || {}} /></article>
        </section>
      )}

      {tab === 'users' && key && (
        <section className="ab-admin-stack">
          <AccessForm client={client} adminKey={key} copy={copy} locale={locale} email={accessEmail} setEmail={setAccessEmail} products={products} user={pickedUser} onChanged={() => void loadProtected('users', key)} />
          {data && <article className="ab-admin-panel">
            <label className="ab-admin-search"><span>{copy.search}</span>
              <input type="search" value={userQuery} onChange={e => setUserQuery(e.target.value)} />
            </label>
            <p className="ab-admin-empty">{copy.pick}</p>
            {users.length && !shownUsers.length ? <p className="ab-admin-empty">{copy.nobody}</p> : null}
            {shownUsers.length ? (
              <div className="ab-admin-table-wrap"><table><thead><tr><th>{copy.email}</th><th>{copy.premium}</th><th>{copy.owned}</th><th>{copy.seen}</th></tr></thead>
              <tbody>{shownUsers.map(user => <tr key={String(user.id || user.email)}>
                <td><button type="button" className="ab-admin-link" onClick={() => { setAccessEmail(String(user.email || '')); window.scrollTo({top:0, behavior:'smooth'}); }}>{String(user.email || '—')}</button></td>
                <td data-label={copy.premium}>{user.premium ? copy.cardUntil + ' ' + formatAdminDate((user.sub as {until?: string} | null)?.until, locale, false) : '—'}</td>
                <td data-label={copy.owned}>{Array.isArray(user.owned) && user.owned.length ? user.owned.map(item => productTitle(products, item)).join(', ') : '—'}</td>
                <td data-label={copy.seen}>{formatAdminDate(user.seen || user.since, locale) || '—'}</td>
              </tr>)}</tbody></table></div>
            ) : users.length ? null : <p className="ab-admin-empty">{copy.noUsers}</p>}
          </article>}
        </section>
      )}

      {tab === 'payments' && key && data && (
        <section className="ab-admin-panel">
          {payments.length ? (
            <div className="ab-admin-table-wrap"><table><thead><tr><th>{copy.when}</th><th>{copy.provider}</th><th>{copy.event}</th><th>SKU</th><th>{copy.account}</th></tr></thead>
            <tbody>{payments.map((row, i) => <tr key={i}>
              <td>{String(row.at || '').replace('T', ' ').slice(0, 19)}</td>
              <td>{String(row.provider || '')}</td>
              <td>{String(row.status || '')}</td>
              <td>{String(row.sku || '')}</td>
              <td>{String(row.account || '')}</td>
            </tr>)}</tbody></table></div>
          ) : <p className="ab-admin-empty">{copy.noPayments}</p>}
        </section>
      )}

      {tab === 'errors' && key && data && (
        <section className="ab-admin-stack">
          {!errors.length && <p className="ab-admin-empty">{copy.noErrors}</p>}
          {errors.map(item => <article className="ab-admin-panel" key={String(item.sig)}>
            <div className="ab-admin-row"><div><strong>{String(item.name || 'Error')}</strong><div>{String(item.message || '')}</div></div><span>{copy.count}: {String(item.count || 0)}</span></div>
            <pre className="ab-admin-json">{String(item.stack || '')}</pre>
            <button type="button" className="ab-admin-secondary" onClick={() => void clearError(String(item.sig || ''))}>{copy.clear}</button>
          </article>)}
        </section>
      )}

      {tab === 'storage' && key && data && (
        <section className="ab-admin-panel"><h2>{copy.migration}</h2><JsonCard value={data.status || data} /></section>
      )}

      {tab === 'ai' && key && <section className="ab-admin-stack"><AdminAiSettings client={client} adminKey={key} locale={locale} /></section>}
      {tab === 'billing-keys' && key && <section className="ab-admin-stack"><AdminBillingKeys client={client} adminKey={key} locale={locale} /></section>}

      {extraSections.map(section => tab === section.id && key ? (
        <section key={section.id} className="ab-admin-stack">
          {section.render({client, adminKey:key, locale})}
        </section>
      ) : null)}
        </main>
      </div>
    </div>
  );
}
