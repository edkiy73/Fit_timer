import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useOutletContext, type RouteObject } from 'react-router';
import { AuthProvider, SignInForm, useOptionalAuth } from '@appbase/ui-react/auth.js';
import { AdminPanel } from '@appbase/ui-react/admin.js';
import { I18nProvider, LanguagePicker, sharedUiLocale, useI18n } from '@appbase/ui-react/i18n.js';
import { hasEntitlement } from '@appbase/core/auth.js';
import { filterTasks, type TaskFilter } from './domain';
import { AddTaskForm } from './components/AddTaskForm';
import { FilterNav } from './components/FilterNav';
import { TaskItem } from './components/TaskItem';
import { useTaskActions, useTasks, type TaskActions } from './tasks/queries';
import { syncTasksNow } from './tasks/sync';
import { taskDocs } from './tasks/repository';
import { taskAuth } from './auth';
import { taskAdmin } from './admin';
import { taskAdminSection } from './admin-task';
import { taskBilling } from './billing';
import { dictionaries, i18nConfig, LOCALE_KEY } from './i18n';
import { NotFoundScreen, RouteErrorScreen } from './route-fallback';

const EMPTY: Record<TaskFilter, string> = {
  all: 'tasks.emptyAll',
  active: 'tasks.emptyActive',
  done: 'tasks.emptyDone'
};

// Tasks work without an account (local-first); the account only adds sync between devices.
function AccountChip(){
  const auth = useOptionalAuth();
  const {t} = useI18n();
  const email = auth.session?.email;
  // Sign-in on this device (or restored session): merge local tasks with the account now.
  useEffect(() => { if(email) syncTasksNow(); }, [email]);
  if(auth.loading) return null;
  return (
    <div className="account-chip">
      {auth.session
        ? <><span>{auth.session.email}</span><Link to="/account">{t('nav.account')}</Link></>
        : <Link to="/account">{t('nav.signIn')}</Link>}
    </div>
  );
}

function Header(){
  const {t} = useI18n();
  return (
    <header>
      <div className="account-row">
        <div>
          <div className="eyebrow">{t('app.eyebrow')}</div>
          <h1>Task Mini</h1>
          <p>{t('app.lead')}</p>
        </div>
        <AccountChip />
      </div>
    </header>
  );
}

function TaskLayout(){
  const {data: tasks = []} = useTasks();
  const actions = useTaskActions();
  const {t} = useI18n();
  return (
    <main className="app">
      <Header />
      <AddTaskForm onAdd={actions.add} />
      {actions.saveFailed && <p className="error" role="alert">{t('tasks.saveFailed')}</p>}
      <FilterNav tasks={tasks} />
      <Outlet context={actions} />
    </main>
  );
}

// Two harmless reference products from config/product.json: one owned feature and one subscription.
export const EXPORT_SKU = 'export';
export const PREMIUM_SKU = 'plus.month';

function PurchaseMethods({sku,lockedText,noMethodsText,buyLabel,failedText}: {
  sku:string;
  lockedText:string;
  noMethodsText:string;
  buyLabel:string;
  failedText:string;
}){
  const auth = useOptionalAuth();
  const {data: methods = []} = useQuery({
    queryKey:['billing-methods'],
    queryFn:() => taskBilling.methods(),
    retry:false
  });
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');

  const buy = async (methodId:string) => {
    setBusy(methodId);
    setError('');
    try{
      const result = await taskBilling.checkout(methodId, sku);
      if(result.url){ window.location.assign(result.url); return; }
      await auth.refresh();
    }catch{
      setError(failedText);
    }finally{
      setBusy('');
    }
  };

  return (
    <div className="buy">
      <p className="muted">{methods.length ? lockedText : noMethodsText}</p>
      {methods.map(method => (
        <button key={method.id} type="button" className="text-button"
          disabled={!!busy} onClick={() => void buy(method.id)}>
          {buyLabel} · {method.id}
        </button>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function ExportTasks(){
  const auth = useOptionalAuth();
  const {t} = useI18n();
  const {data: tasks = []} = useTasks();
  if(!hasEntitlement(auth.session, EXPORT_SKU)){
    return <PurchaseMethods sku={EXPORT_SKU} lockedText={t('export.locked')}
      noMethodsText={t('export.lockedAdmin')} buyLabel={t('export.buy')} failedText={t('export.buyFailed')} />;
  }
  const download = () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tasks.json';
    link.click();
    URL.revokeObjectURL(url);
  };
  return <button type="button" className="text-button" onClick={download}>{t('export.download',{count:tasks.length})}</button>;
}

function ReferencePremium(){
  const auth = useOptionalAuth();
  const {t} = useI18n();
  if(auth.session?.premium){
    const until = String((auth.session.sub as {until?:unknown} | null)?.until || '—');
    return (
      <div className="buy">
        <strong>{t('premium.title')}</strong>
        <p className="muted">{t('premium.active',{until})}</p>
      </div>
    );
  }
  return (
    <div className="buy">
      <strong>{t('premium.title')}</strong>
      <PurchaseMethods sku={PREMIUM_SKU} lockedText={t('premium.locked')}
        noMethodsText={t('premium.lockedAdmin')} buyLabel={t('premium.buy')} failedText={t('premium.buyFailed')} />
    </div>
  );
}

function AccountPage(){
  const auth = useOptionalAuth();
  const {t, locale} = useI18n();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  // Tasks stay on the device; the next sign-in merges them into that account.
  const signOut = async () => {
    if(signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      await auth.logout();
      await taskDocs().detach();
      navigate('/');
    } catch {
      setSignOutError(locale === 'en' ? 'Could not sign out. Check your connection and try again.' : 'Не удалось выйти. Проверь соединение и попробуй ещё раз.');
    } finally {setSigningOut(false);}
  };
  if(auth.loading) return null;
  return (
    <main className="app">
      <p className="back"><Link to="/">{t('nav.back')}</Link></p>
      {auth.session ? (
        <section className="account">
          <h1>{t('account.title')}</h1>
          <p>{auth.session.email}{auth.session.handle ? ' · ' + auth.session.handle : ''}</p>
          <p className="muted">{t('account.synced')}</p>
          <ReferencePremium />
          <ExportTasks />
          <button type="button" className="text-button" disabled={signingOut} onClick={() => void signOut()}>{t('account.signOut')}</button>
          {signOutError && <p role="alert">{signOutError}</p>}
        </section>
      ) : (
        <>
          <p className="muted">{t('account.localHint')}</p>
          <SignInForm locale={sharedUiLocale(locale)} productName="Task Mini" variant="inline" onSignedIn={() => navigate('/')} />
        </>
      )}
      <div className="language"><LanguagePicker label={t('account.language')} systemLabel={t('account.languageSystem')} /></div>
    </main>
  );
}

function Root(){
  return <AuthProvider client={taskAuth}><Outlet /></AuthProvider>;
}

function Localized({children}: {children: ReactNode}){
  return <I18nProvider dictionaries={dictionaries} config={i18nConfig} storageKey={LOCALE_KEY}>{children}</I18nProvider>;
}

/* Readable names of the analytics events (lib/app-analytics.js) for Admin «Обзор». */
const EVENT_LABELS = {
  ru:{task_created:'Создали задачу', task_completed:'Выполнили задачу'},
  en:{task_created:'Created a task', task_completed:'Completed a task'}
} as const;

function Admin(){
  const {locale} = useI18n();
  const adminLocale = sharedUiLocale(locale);
  return <AdminPanel client={taskAdmin} locale={adminLocale} productName="Task Mini" eventLabels={EVENT_LABELS[adminLocale]} extraSections={[taskAdminSection]} />;
}

function TaskList({filter}: {filter: TaskFilter}){
  const {data, isPending, isError} = useTasks();
  const actions = useOutletContext<TaskActions>();
  const {t} = useI18n();
  if(isPending) return <p className="empty">{t('tasks.loading')}</p>;
  if(isError) return <p className="error" role="alert">{t('tasks.readFailed')}</p>;
  const visible = filterTasks(data, filter);
  if(!visible.length) return <p className="empty">{t(EMPTY[filter])}</p>;
  return (
    <ul className="tasks" aria-live="polite">
      {visible.map(task => <TaskItem key={task.id} task={task} onToggle={actions.toggle} onRemove={actions.remove} />)}
    </ul>
  );
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Localized><Root /></Localized>,
    errorElement: <Localized><RouteErrorScreen /></Localized>,
    children: [
      {
        element: <TaskLayout />,
        children: [
          {index: true, element: <TaskList filter="all" />},
          {path: 'active', element: <TaskList filter="active" />},
          {path: 'done', element: <TaskList filter="done" />}
        ]
      },
      {path: 'account', element: <AccountPage />},
      {path: '*', element: <NotFoundScreen />}
    ]
  },
  {
    path:'/admin',
    element:<Localized><Admin /></Localized>
  }
];
