import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AdminClient, AdminHealth } from '@appbase/core/admin.js';
import './admin.css';
import './admin.css';

export interface AdminSectionContext {
  client: AdminClient;
  adminKey: string;
  locale: 'ru' | 'en';
}

export interface AdminSection {
  id: string;
  label: string;
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
    clear:'Очистить', migration:'Миграция хранилища'
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
    clear:'Clear', migration:'Storage migration'
  }
} as const;

type CoreTab = 'health' | 'overview' | 'users' | 'errors' | 'storage';
type Tab = CoreTab | string;

function JsonCard({value}: {value: unknown}){
  return <pre className="ab-admin-json">{JSON.stringify(value, null, 2)}</pre>;
}

export function AdminPanel({client, productName, locale='ru', extraSections=[]}: AdminPanelProps){
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

  const tabs = useMemo(() => [
    ['health', copy.health], ['overview', copy.overview], ['users', copy.users],
    ['errors', copy.errors], ['storage', copy.storage],
    ...extraSections.map(section => [section.id, section.label] as const)
  ] as ReadonlyArray<readonly [string,string]>, [copy, extraSections]);

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
    try{ sessionStorage.removeItem('appbase.admin.key'); }catch(_){}
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
  const errorStats = tab === 'errors' && data && data.stats && typeof data.stats === 'object'
    ? data.stats as Record<string, unknown> : null;
  const errors = errorStats && Array.isArray(errorStats.items) ? errorStats.items as Array<Record<string, unknown>> : [];

  return (
    <main className="ab-admin">
      <header className="ab-admin-header">
        <div>
          <div className="ab-admin-kicker">{productName}</div>
          <h1>{copy.title}</h1>
        </div>
        <div className="ab-admin-auth">
          {!key ? (
            <>
              <input
                aria-label={copy.key}
                type="password"
                value={draftKey}
                onChange={e => setDraftKey(e.target.value)}
                onKeyDown={e => { if(e.key === 'Enter') connect(); }}
                placeholder={copy.key}
              />
              <button type="button" onClick={connect}>{copy.connect}</button>
            </>
          ) : (
            <button type="button" onClick={disconnect}>{copy.disconnect}</button>
          )}
        </div>
      </header>

      <nav className="ab-admin-tabs" aria-label={copy.title}>
        {tabs.map(([id,label]) => (
          <button key={id} type="button" data-active={tab === id || undefined} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

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

      {tab !== 'health' && !key && <p className="ab-admin-empty">{copy.noKey}</p>}
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

      {tab === 'users' && key && data && (
        <section className="ab-admin-panel">
          {users.length ? (
            <div className="ab-admin-table-wrap"><table><thead><tr><th>{copy.email}</th><th>{copy.premium}</th><th>{copy.seen}</th></tr></thead>
            <tbody>{users.map(user => <tr key={String(user.id || user.email)}><td>{String(user.email || '—')}</td><td>{user.premium ? '✓' : '—'}</td><td>{String(user.seen || user.since || '—')}</td></tr>)}</tbody></table></div>
          ) : <p className="ab-admin-empty">{copy.noUsers}</p>}
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
  );
}
