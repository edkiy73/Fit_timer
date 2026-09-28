import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AdminClient, AdminHealth } from '@appbase/core/admin.js';
import './admin.css';

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
    title:'Админка', key:'ADMIN_KEY', connect:'Подключиться', disconnect:'Выйти',
    refresh:'Обновить', health:'Health', overview:'Обзор', users:'Пользователи',
    errors:'Ошибки', storage:'Хранилище', noKey:'Введи ADMIN_KEY для защищённых данных.',
    badKey:'Неверный ADMIN_KEY или доступ запрещён.', requestFailed:'Не удалось получить данные.',
    status:'Статус', deployment:'Сборка', warnings:'Предупреждения', services:'Сервисы',
    analytics:'Аналитика', accounts:'Аккаунты', totalErrors:'Ошибок клиента',
    noErrors:'Ошибок клиента нет.', noUsers:'Аккаунтов пока нет.', email:'Email',
    premium:'Premium', seen:'Последняя активность', count:'Количество',
    clear:'Очистить', migration:'Миграция хранилища',
    owned:'Покупки', access:'Доступ', sku:'Покупка (SKU)', grant:'Выдать', revoke:'Забрать',
    premiumDays:'Premium, дней', grantPremium:'Выдать Premium', revokePremium:'Забрать Premium',
    accessDone:'Готово.', accessHint:'Ручная выдача: семья, промо, возврат. Покупки остаются навсегда, Premium — на срок.',
    payments:'Платежи', noPayments:'Платежей пока нет.', when:'Когда', provider:'Провайдер', event:'Событие', account:'Аккаунт',
    mainGroup:'Главное', accountsGroup:'Аккаунты', systemGroup:'Система', productGroup:'Продукт', menu:'Меню'
  },
  en: {
    title:'Admin', key:'ADMIN_KEY', connect:'Connect', disconnect:'Sign out',
    refresh:'Refresh', health:'Health', overview:'Overview', users:'Users',
    errors:'Errors', storage:'Storage', noKey:'Enter ADMIN_KEY for protected data.',
    badKey:'Wrong ADMIN_KEY or access denied.', requestFailed:'Could not load data.',
    status:'Status', deployment:'Build', warnings:'Warnings', services:'Services',
    analytics:'Analytics', accounts:'Accounts', totalErrors:'Client errors',
    noErrors:'No client errors.', noUsers:'No accounts yet.', email:'Email',
    premium:'Premium', seen:'Last active', count:'Count',
    clear:'Clear', migration:'Storage migration',
    owned:'Purchases', access:'Access', sku:'Purchase (SKU)', grant:'Grant', revoke:'Revoke',
    premiumDays:'Premium, days', grantPremium:'Grant Premium', revokePremium:'Revoke Premium',
    accessDone:'Done.', accessHint:'Manual access: family, promo, refund. Purchases are permanent, Premium lasts for a period.',
    payments:'Payments', noPayments:'No payments yet.', when:'When', provider:'Provider', event:'Event', account:'Account',
    mainGroup:'Main', accountsGroup:'Accounts', systemGroup:'System', productGroup:'Product', menu:'Menu'
  }
} as const;

type CoreTab = 'health' | 'overview' | 'users' | 'payments' | 'errors' | 'storage';
type Tab = CoreTab | string;

type Copy = (typeof COPY)[keyof typeof COPY];

/* Manual access for one account: a purchase for good (SKU from the product catalog)
   or Premium for a number of days. */
function AccessForm({client, adminKey, copy, onChanged}: {client: AdminClient; adminKey: string; copy: Copy; onChanged(): void}){
  const [email, setEmail] = useState('');
  const [sku, setSku] = useState('');
  const [days, setDays] = useState('30');
  const [products, setProducts] = useState<Array<{sku: string; title: string}>>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    client.action(adminKey, 'products_list').then(result => {
      const list = Array.isArray(result.products) ? result.products as Array<{sku: string; title: string}> : [];
      if(!live) return;
      setProducts(list);
      if(list[0]) setSku(current => current || list[0]!.sku);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [client, adminKey]);

  async function run(action: string, body: Record<string, unknown>){
    setBusy(true);
    setMessage('');
    try{
      await client.action(adminKey, action, {email, ...body});
      setMessage(copy.accessDone);
      onChanged();
    }catch(e){
      setMessage(String((e as {code?: string})?.code || copy.requestFailed));
    }finally{
      setBusy(false);
    }
  }

  return (
    <article className="ab-admin-panel ab-admin-access">
      <h2>{copy.access}</h2>
      <p className="ab-admin-empty">{copy.accessHint}</p>
      <label><span>{copy.email}</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <div className="ab-admin-row">
        <label><span>{copy.sku}</span>
          {products.length
            ? <select value={sku} onChange={e => setSku(e.target.value)}>{products.map(p => <option key={p.sku} value={p.sku}>{p.title} ({p.sku})</option>)}</select>
            : <input value={sku} onChange={e => setSku(e.target.value)} />}
        </label>
        <button type="button" disabled={busy || !email || !sku} onClick={() => void run('user_owned', {sku})}>{copy.grant}</button>
        <button type="button" className="ab-admin-secondary" disabled={busy || !email || !sku} onClick={() => void run('user_owned', {sku, revoke:true})}>{copy.revoke}</button>
      </div>
      <div className="ab-admin-row">
        <label><span>{copy.premiumDays}</span><input type="number" min={1} max={3650} value={days} onChange={e => setDays(e.target.value)} /></label>
        <button type="button" disabled={busy || !email} onClick={() => void run('user_premium', {days:Number(days) || 30})}>{copy.grantPremium}</button>
        <button type="button" className="ab-admin-secondary" disabled={busy || !email} onClick={() => void run('user_premium', {revoke:true})}>{copy.revokePremium}</button>
      </div>
      {message && <p className="ab-admin-empty" role="status">{message}</p>}
    </article>
  );
}

function JsonCard({value}: {value: unknown}){
  return <pre className="ab-admin-json">{JSON.stringify(value, null, 2)}</pre>;
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

  const tabs = useMemo(() => [
    ['health', copy.health], ['overview', copy.overview], ['users', copy.users], ['payments', copy.payments],
    ['errors', copy.errors], ['storage', copy.storage],
    ...extraSections.map(section => [section.id, section.label] as const)
  ] as ReadonlyArray<readonly [string,string]>, [copy, extraSections]);

  const navGroups = useMemo(() => {
    const core = [
      {label:copy.mainGroup, ids:['health','overview']},
      {label:copy.accountsGroup, ids:['users','payments','errors']},
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
    if(target === 'health' || extraSections.some(section => section.id === target)) return;
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

      {tab === 'health' && (
        <section className="ab-admin-stack">
          <div className="ab-admin-grid">
            <article className="ab-admin-card"><span>{copy.status}</span><strong>{health?.status || '…'}</strong></article>
            <article className="ab-admin-card"><span>{copy.deployment}</span><strong>{String(health?.deployment || '—')}</strong></article>
          </div>
          {!!health?.warnings?.length && <article className="ab-admin-panel"><h2>{copy.warnings}</h2><ul>{health.warnings.map(x => <li key={x}>{x}</li>)}</ul></article>}
          <article className="ab-admin-panel"><h2>{copy.services}</h2><JsonCard value={health?.services || {}} /></article>
          <article className="ab-admin-panel"><h2>{copy.health}</h2><JsonCard value={health?.probes || []} /></article>
        </section>
      )}

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
          <AccessForm client={client} adminKey={key} copy={copy} onChanged={() => void loadProtected('users', key)} />
          {data && <article className="ab-admin-panel">
            {users.length ? (
              <div className="ab-admin-table-wrap"><table><thead><tr><th>{copy.email}</th><th>{copy.premium}</th><th>{copy.owned}</th><th>{copy.seen}</th></tr></thead>
              <tbody>{users.map(user => <tr key={String(user.id || user.email)}>
                <td>{String(user.email || '—')}</td>
                <td>{user.premium ? String((user.sub as {until?: string} | null)?.until || '✓') : '—'}</td>
                <td>{Array.isArray(user.owned) && user.owned.length ? user.owned.join(', ') : '—'}</td>
                <td>{String(user.seen || user.since || '—')}</td>
              </tr>)}</tbody></table></div>
            ) : <p className="ab-admin-empty">{copy.noUsers}</p>}
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
